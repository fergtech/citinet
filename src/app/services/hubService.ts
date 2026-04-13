/**
 * Hub Service for Citinet
 * 
 * Manages hub connections, persistence, and API communication.
 * Currently uses localStorage + direct fetch to hub tunnel URLs.
 *
 * Future: Will integrate with centralized hub registry
 */

import type { Hub, HubConnection, HubConnectionStatus, HubInfoResponse, HubStatusResponse, HubUser, HubMeta, HubAuthCredentials, HubFile, HubMember, HubConversation, HubMessage, HubMessageAttachment, HubPost, HubPostReply, HubNote } from '../types/hub';
import { generateUserKeys, hasKeys, clearKeys, getStoredPublicKeyJwk, encryptNoteBody, decryptNoteBody, isNoteEncrypted, createKeyBackup, restoreKeyBackup, encryptMessage, decryptMessage, isMessageEncrypted, encryptFileBuffer, decryptFileBuffer, isFileEncrypted } from '../utils/crypto';
import type { KeyBackupPayload } from '../utils/crypto';

const STORAGE_KEYS = {
  HUBS: 'citinet-hubs',              // All known hub connections
  ACTIVE_HUB: 'citinet-active-hub',  // Currently active hub slug
  USER_DATA: 'citinet-user-data',    // Legacy key (kept for migration)
  SELECTED_NODE: 'citinet-selected-node', // Legacy key
};

class HubService {
  // ──────────────────────────────────────────────
  // Hub Discovery & Connection
  // ──────────────────────────────────────────────

  /**
   * Attempt to connect to a hub via its cloudflared tunnel URL.
   * Calls GET /api/info for node identity, then GET /api/status for live stats.
   */
  async probeHub(tunnelUrl: string): Promise<{ success: boolean; info?: HubInfoResponse; status?: HubStatusResponse; error?: string }> {
    const cleanUrl = this.normalizeTunnelUrl(tunnelUrl);
    
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);
      
      // 1. Fetch /api/info — node identity (name, node_id, node_type, storage_quota)
      const infoRes = await fetch(`${cleanUrl}/api/info`, {
        signal: controller.signal,
        headers: { 'Accept': 'application/json' },
      });
      clearTimeout(timeout);
      
      if (!infoRes.ok) {
        return { success: false, error: `Hub responded with status ${infoRes.status}` };
      }

      const raw = await infoRes.json();
      // Normalize: hub API may return node_name, name, or hub_name
      const info: HubInfoResponse = {
        ...raw,
        name: raw.node_name || raw.name || raw.hub_name || '',
        location: raw.location || raw.hub_location || '',
        description: raw.description || raw.hub_description || '',
      };

      // 2. Fetch /api/status — live stats (uptime, storage_used, online, user_count)
      let status: HubStatusResponse | undefined;
      try {
        const statusController = new AbortController();
        const statusTimeout = setTimeout(() => statusController.abort(), 5000);
        const statusRes = await fetch(`${cleanUrl}/api/status`, {
          signal: statusController.signal,
          headers: { 'Accept': 'application/json' },
        });
        clearTimeout(statusTimeout);
        if (statusRes.ok) {
          status = await statusRes.json();
        }
      } catch {
        // /api/status is non-critical — continue without it
      }

      // If /api/info didn't have the name, try from /api/status
      if (!info.name && status?.node_name) {
        info.name = status.node_name;
      }

      return { success: true, info, status };
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        return { success: false, error: 'Connection timed out — hub may not be running yet.' };
      }
      const msg = err instanceof Error ? err.message : String(err);
      // TypeError: Failed to fetch → typically CORS or network unreachable
      if (msg.includes('Failed to fetch')) {
        return {
          success: false,
          error: 'Could not reach hub — the tunnel may not be active, or CORS is blocking the request. Try opening the URL directly in a new tab to check.',
        };
      }
      return { success: false, error: `Connection failed: ${msg}` };
    }
  }

  /**
   * Join a hub. Creates or updates the local hub connection record.
   * The hub name and identity come from the probe (GET /api/info).
   */
  async joinHub(
    tunnelUrl: string,
    probeInfo?: HubInfoResponse,
    probeStatus?: HubStatusResponse
  ): Promise<Hub> {
    const cleanUrl = this.normalizeTunnelUrl(tunnelUrl);
    const hubName = probeInfo?.name || this.extractNameFromUrl(cleanUrl);
    const slug = this.slugify(hubName);

    // If we probed via localhost/LAN, keep that as the stored URL — the machine can't
    // reach its own Tailscale funnel URL from the inside. Only prefer the API-reported
    // tunnel_url when we probed via a non-local address.
    const isLocalProbe = /localhost|127\.0\.0\.1|192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\./.test(cleanUrl);
    const storedUrl = (!isLocalProbe && probeInfo?.tunnel_url)
      ? this.normalizeTunnelUrl(probeInfo.tunnel_url)
      : cleanUrl;

    const hub: Hub = {
      id: probeInfo?.node_id || `local-${slug}-${Date.now()}`,
      slug,
      name: hubName,
      tunnelUrl: storedUrl,
      location: probeInfo?.location || '',
      description: probeInfo?.description,
      memberCount: probeStatus?.user_count,
      connectionStatus: probeInfo ? 'connected' : 'disconnected',
      joinedAt: new Date().toISOString(),
      lastConnectedAt: probeInfo ? new Date().toISOString() : undefined,
      lanIp: probeInfo?.lan_ip || undefined,
      meta: {
        nodeType: probeInfo?.node_type,
        storageQuota: probeInfo?.storage_quota,
        storageUsed: probeStatus?.storage_used,
        uptime: probeStatus?.uptime,
        activeMembers: probeStatus?.user_count,
      },
    };

    this.saveHub(hub);
    this.setActiveHub(slug);
    return hub;
  }

  /**
   * Complete user onboarding for a hub. Stores user profile.
   * If the hub API is reachable, registers the user.
   */
  async completeOnboarding(hubSlug: string, userData: HubUser): Promise<void> {
    const connection = this.getHubConnection(hubSlug);
    if (!connection) throw new Error(`No hub found with slug: ${hubSlug}`);

    // Save user data for this hub
    const hubs = this.getAllHubConnections();
    hubs[hubSlug] = { hub: connection.hub, user: userData };
    localStorage.setItem(STORAGE_KEYS.HUBS, JSON.stringify(hubs));
  }

  /**
   * Register a user with a hub (username + password).
   * Attempts to call the hub's auth API. If unreachable, stores locally.
   * Password is NOT stored — only sent to the hub for registration.
   */
  async registerUser(
    hubSlug: string,
    credentials: HubAuthCredentials
  ): Promise<HubUser> {
    const connection = this.getHubConnection(hubSlug);
    if (!connection) throw new Error(`No hub found with slug: ${hubSlug}`);
    if (!connection.hub.tunnelUrl) throw new Error('Hub has no tunnel URL');

    // Register with hub API — must succeed
    const response = await fetch(`${connection.hub.tunnelUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: credentials.username,
        password: credentials.password,
        email: credentials.email || '',
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(body || `Registration failed (${response.status})`);
    }

    const result = await response.json();

    const userData: HubUser = {
      username: credentials.username,
      displayName: result.display_name || credentials.username,
      tags: result.tags || [],
      role: 'participant',
      agreedToManifesto: true,
      hubUserId: result.userId || result.user_id,
      authToken: result.token,
      isAdmin: result.isAdmin === true,
      hubRole: result.role ?? (result.isAdmin ? 'admin' : 'member'),
      avatarUrl: result.avatar_url || undefined,
      location: result.location || undefined,
      bio: result.bio || undefined,
    };

    // Save user data for this hub
    await this.completeOnboarding(hubSlug, userData);
    return userData;
  }

  /**
   * Log in an existing user on a hub.
   * Calls POST /api/auth/login and stores the returned token.
   */
  async loginUser(
    hubSlug: string,
    credentials: HubAuthCredentials
  ): Promise<HubUser> {
    const connection = this.getHubConnection(hubSlug);
    if (!connection) throw new Error(`No hub found with slug: ${hubSlug}`);
    if (!connection.hub.tunnelUrl) throw new Error('Hub has no tunnel URL');

    const response = await fetch(`${connection.hub.tunnelUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: credentials.username,
        password: credentials.password,
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(body || `Login failed (${response.status})`);
    }

    const result = await response.json();

    const userData: HubUser = {
      username: credentials.username,
      displayName: result.display_name || credentials.username,
      tags: result.tags || [],
      role: 'participant',
      agreedToManifesto: true,
      hubUserId: result.userId || result.user_id,
      authToken: result.token,
      isAdmin: result.isAdmin === true,
      hubRole: result.role ?? (result.isAdmin ? 'admin' : 'member'),
      avatarUrl: result.avatar_url || undefined,
      location: result.location || undefined,
      bio: result.bio || undefined,
    };

    await this.completeOnboarding(hubSlug, userData);
    return userData;
  }

  /** Toggle admin status for a hub member (admin only). */
  async toggleMemberAdmin(hubSlug: string, memberId: string, isAdmin: boolean): Promise<void> {
    const { headers, tunnelUrl } = this.getAuthHeaders(hubSlug);
    const res = await fetch(`${tunnelUrl}/api/members/${encodeURIComponent(memberId)}/admin`, {
      method: 'PATCH',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_admin: isAdmin }),
    });
    if (!res.ok) await this.parseErrorResponse(res, hubSlug);
  }

  /** Remove a member from the hub (admin only). */
  async removeMember(hubSlug: string, memberId: string): Promise<void> {
    const { headers, tunnelUrl } = this.getAuthHeaders(hubSlug);
    const res = await fetch(`${tunnelUrl}/api/members/${encodeURIComponent(memberId)}`, {
      method: 'DELETE',
      headers,
    });
    if (!res.ok && res.status !== 204) await this.parseErrorResponse(res, hubSlug);
  }

  /** Delete the current user's own account (requires password confirmation). */
  async deleteAccount(hubSlug: string, password: string): Promise<void> {
    const connection = this.getHubConnection(hubSlug);
    if (!connection?.hub.tunnelUrl) throw new Error('Hub not found');
    const token = connection.user?.authToken;
    if (!token) throw new Error('Not authenticated');
    const res = await fetch(`${connection.hub.tunnelUrl}/api/auth/account`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ password }),
    });
    if (!res.ok && res.status !== 204) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `Failed (${res.status})`);
    }
    // Clean up local state
    this.leaveHub(hubSlug);
  }

  /** Change the current user's password. */
  async changePassword(
    hubSlug: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<void> {
    const connection = this.getHubConnection(hubSlug);
    if (!connection?.hub.tunnelUrl) throw new Error('Hub not found');
    const token = connection.user?.authToken;
    if (!token) throw new Error('Not authenticated');

    const res = await fetch(`${connection.hub.tunnelUrl}/api/auth/change-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `Failed (${res.status})`);
    }
  }

  /** Update the current user's profile fields on the server and in localStorage. */
  async updateProfile(
    hubSlug: string,
    updates: {
      displayName?: string; location?: string; bio?: string; tags?: string[];
      profileHeadline?: string; website?: string;
      bannerMode?: 'image' | 'solid' | 'gradient'; bannerColor?: string;
      bannerGradientFrom?: string; bannerGradientTo?: string;
    }
  ): Promise<HubUser> {
    const { headers, tunnelUrl } = this.getAuthHeaders(hubSlug);
    const body: Record<string, unknown> = {};
    if (updates.displayName       !== undefined) body.display_name        = updates.displayName;
    if (updates.location          !== undefined) body.location             = updates.location;
    if (updates.bio               !== undefined) body.bio                  = updates.bio;
    if (updates.tags              !== undefined) body.tags                 = updates.tags;
    if (updates.profileHeadline   !== undefined) body.profile_headline     = updates.profileHeadline;
    if (updates.website           !== undefined) body.website              = updates.website;
    if (updates.bannerMode        !== undefined) body.banner_mode          = updates.bannerMode;
    if (updates.bannerColor       !== undefined) body.banner_color         = updates.bannerColor;
    if (updates.bannerGradientFrom !== undefined) body.banner_gradient_from = updates.bannerGradientFrom;
    if (updates.bannerGradientTo  !== undefined) body.banner_gradient_to   = updates.bannerGradientTo;

    const res = await fetch(`${tunnelUrl}/api/auth/profile`, {
      method: 'PATCH',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `Failed (${res.status})`);
    }

    return this.updateUserProfile(hubSlug, {
      displayName:       updates.displayName,
      location:          updates.location,
      bio:               updates.bio,
      tags:              updates.tags,
      profileHeadline:   updates.profileHeadline,
      website:           updates.website,
      bannerMode:        updates.bannerMode,
      bannerColor:       updates.bannerColor,
      bannerGradientFrom: updates.bannerGradientFrom,
      bannerGradientTo:  updates.bannerGradientTo,
    });
  }

  /** Upload a profile banner image. Saves to MinIO and updates banner_mode to 'image'. */
  async uploadProfileBanner(hubSlug: string, file: File): Promise<string> {
    const { headers, tunnelUrl } = this.getAuthHeaders(hubSlug);
    const form = new FormData();
    form.append('banner', file);
    const res = await fetch(`${tunnelUrl}/api/auth/profile-banner`, {
      method: 'POST',
      headers,
      body: form,
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `Upload failed (${res.status})`);
    }
    const { banner_key } = await res.json();
    return banner_key;
  }

  /** Resolve a profile banner image URL for a given user. Pass bannerKey for cache-busting after re-upload. */
  getProfileBannerUrl(hubSlug: string, userId: string, bannerKey?: string | null): string | null {
    const conn = this.getHubConnection(hubSlug);
    if (!conn?.hub?.tunnelUrl) return null;
    const base = `${conn.hub.tunnelUrl}/api/auth/profile-banner/${encodeURIComponent(userId)}`;
    return bannerKey ? `${base}?v=${encodeURIComponent(bannerKey)}` : base;
  }

  /** Fetch a single member's public profile from the server. */
  async getMember(hubSlug: string, userId: string): Promise<HubMember> {
    const { headers, tunnelUrl } = this.getAuthHeaders(hubSlug);
    const res = await fetch(`${tunnelUrl}/api/members/${encodeURIComponent(userId)}`, { headers });
    if (!res.ok) await this.parseErrorResponse(res, hubSlug);
    return res.json();
  }

  /**
   * Upload a profile picture. Returns the MinIO key of the stored avatar.
   * The caller should resolve the full URL via getAvatarUrl().
   */
  async uploadAvatar(hubSlug: string, file: File): Promise<string> {
    const { headers, tunnelUrl } = this.getAuthHeaders(hubSlug);
    const form = new FormData();
    form.append('avatar', file);
    const res = await fetch(`${tunnelUrl}/api/auth/avatar`, {
      method: 'POST',
      headers, // no Content-Type — browser sets multipart boundary
      body: form,
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `Upload failed (${res.status})`);
    }
    const { avatar_key } = await res.json();
    return avatar_key;
  }

  /** Build a fully-qualified avatar URL for a given userId on this hub. */
  getAvatarUrl(hubSlug: string, userId: string): string | null {
    const connection = this.getHubConnection(hubSlug);
    if (!connection?.hub.tunnelUrl || !userId) return null;
    return `${connection.hub.tunnelUrl}/api/auth/avatar/${encodeURIComponent(userId)}`;
  }

  // ──────────────────────────────────────────────
  // Hub State Management
  // ──────────────────────────────────────────────

  /** Get all saved hub connections */
  getAllHubConnections(): Record<string, HubConnection> {
    const stored = localStorage.getItem(STORAGE_KEYS.HUBS);
    return stored ? JSON.parse(stored) : {};
  }

  /** Get a specific hub connection by slug */
  getHubConnection(slug: string): HubConnection | null {
    const hubs = this.getAllHubConnections();
    return hubs[slug] || null;
  }

  /** Get the currently active hub slug */
  getActiveHubSlug(): string | null {
    return localStorage.getItem(STORAGE_KEYS.ACTIVE_HUB);
  }

  /** Set the active hub */
  setActiveHub(slug: string): void {
    localStorage.setItem(STORAGE_KEYS.ACTIVE_HUB, slug);
  }

  /** Get the active hub connection */
  getActiveHubConnection(): HubConnection | null {
    const slug = this.getActiveHubSlug();
    if (!slug) return null;
    return this.getHubConnection(slug);
  }

  /** Check if user has completed registration for a hub */
  isOnboarded(hubSlug: string): boolean {
    const connection = this.getHubConnection(hubSlug);
    return !!(connection?.user?.username);
  }

  /** Get list of all hubs the user has joined */
  getJoinedHubs(): Hub[] {
    const connections = this.getAllHubConnections();
    return Object.values(connections).map(c => c.hub);
  }

  /** Update hub connection status */
  updateHubStatus(slug: string, status: HubConnectionStatus, meta?: Partial<HubMeta>, lanIp?: string): void {
    const connections = this.getAllHubConnections();
    const connection = connections[slug];
    if (!connection) return;

    connection.hub.connectionStatus = status;
    if (status === 'connected') {
      connection.hub.lastConnectedAt = new Date().toISOString();
    }
    if (meta && connection.hub.meta) {
      Object.assign(connection.hub.meta, meta);
    } else if (meta) {
      connection.hub.meta = meta as HubMeta;
    }
    if (lanIp) {
      connection.hub.lanIp = lanIp;
    }

    localStorage.setItem(STORAGE_KEYS.HUBS, JSON.stringify(connections));
  }

  /** Update profile fields for the current user on a hub (stored locally) */
  updateUserProfile(
    hubSlug: string,
    updates: Partial<Pick<HubUser, 'displayName' | 'email' | 'location' | 'bio' | 'tags' | 'avatarUrl' | 'profileHeadline' | 'website' | 'bannerMode' | 'bannerColor' | 'bannerGradientFrom' | 'bannerGradientTo' | 'bannerImageFileName'>>
  ): HubUser {
    const connections = this.getAllHubConnections();
    const connection = connections[hubSlug];
    if (!connection) throw new Error(`No hub found with slug: ${hubSlug}`);
    // Filter out undefined so partial updates don't overwrite existing fields
    const filtered = Object.fromEntries(Object.entries(updates).filter(([, v]) => v !== undefined));
    Object.assign(connection.user, filtered);
    localStorage.setItem(STORAGE_KEYS.HUBS, JSON.stringify(connections));
    return connection.user;
  }

  /** Remove a hub connection — also invalidates the server-side session */
  leaveHub(slug: string): void {
    const connections = this.getAllHubConnections();
    const conn = connections[slug];

    // Fire-and-forget server logout to invalidate the session token
    if (conn?.hub?.tunnelUrl && conn?.user?.authToken) {
      fetch(`${conn.hub.tunnelUrl}/api/auth/logout`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${conn.user.authToken}` },
      }).catch(() => {});
    }

    delete connections[slug];
    localStorage.setItem(STORAGE_KEYS.HUBS, JSON.stringify(connections));
    // Clear encryption keys from IndexedDB on logout
    clearKeys(slug).catch(() => {});

    if (this.getActiveHubSlug() === slug) {
      const remaining = Object.keys(connections);
      if (remaining.length > 0) {
        this.setActiveHub(remaining[0]);
      } else {
        localStorage.removeItem(STORAGE_KEYS.ACTIVE_HUB);
      }
    }
  }

  // ──────────────────────────────────────────────
  // Hub Health Check (periodic)
  // ──────────────────────────────────────────────

  /** Refresh connection status for a hub — also syncs the hub name and slug from the API */
  async refreshHubStatus(slug: string): Promise<HubConnectionStatus> {
    const connection = this.getHubConnection(slug);
    if (!connection) return 'disconnected';

    const result = await this.probeHub(connection.hub.tunnelUrl);
    const status: HubConnectionStatus = result.success ? 'connected' : 'unreachable';

    // Sync hub name and slug from the API so it always matches what the admin set
    if (result.info?.name && result.info.name !== connection.hub.name) {
      const newSlug = this.slugify(result.info.name);
      const connections = this.getAllHubConnections();

      if (connections[slug]) {
        connections[slug].hub.name = result.info.name;

        // Re-key if the slug changed
        if (newSlug !== slug && !connections[newSlug]) {
          connections[slug].hub.slug = newSlug;
          connections[newSlug] = connections[slug];
          delete connections[slug];

          // Update active hub pointer
          if (this.getActiveHubSlug() === slug) {
            this.setActiveHub(newSlug);
          }
        }

        localStorage.setItem(STORAGE_KEYS.HUBS, JSON.stringify(connections));
      }
    }
    
    // Use the (possibly new) slug for the status update
    const currentSlug = this.slugify(result.info?.name || connection.hub.name);
    this.updateHubStatus(currentSlug, status, result.status ? {
      activeMembers: result.status.user_count,
      onlineNow: result.status.online_now ?? 0,
      uptime: result.status.uptime,
      storageUsed: result.status.storage_used,
      nodeType: result.info?.node_type,
      storageQuota: result.info?.storage_quota,
    } : undefined, result.info?.lan_ip || undefined);

    return status;
  }

  /**
   * Update the tunnel URL for an existing hub and re-probe.
   * Used when a Cloudflare tunnel rotates to a new URL.
   * Preserves all user data, auth tokens, etc. — only the tunnel URL changes.
   * If skipProbe is true, updates the URL without verifying (useful when CORS blocks the probe).
   */
  async updateTunnelUrl(slug: string, newTunnelUrl: string, skipProbe = false): Promise<Hub> {
    const connection = this.getHubConnection(slug);
    if (!connection) throw new Error(`No hub found with slug: ${slug}`);

    const cleanUrl = this.normalizeTunnelUrl(newTunnelUrl);

    // Update the stored tunnel URL first
    const connections = this.getAllHubConnections();
    connections[slug].hub.tunnelUrl = cleanUrl;
    connections[slug].hub.lastConnectedAt = new Date().toISOString();

    if (!skipProbe) {
      // Probe the new URL to verify it's a valid hub
      const probe = await this.probeHub(cleanUrl);
      if (!probe.success) {
        // Still save the URL so the health check can re-try later
        connections[slug].hub.connectionStatus = 'connecting';
        localStorage.setItem(STORAGE_KEYS.HUBS, JSON.stringify(connections));
        throw new Error(probe.error || 'Could not reach hub at that URL');
      }

      connections[slug].hub.connectionStatus = 'connected';

      // Sync name/meta from the fresh probe
      if (probe.info?.name) {
        connections[slug].hub.name = probe.info.name;
      }
      if (probe.status) {
        connections[slug].hub.meta = {
          ...connections[slug].hub.meta,
          activeMembers: probe.status.user_count,
          onlineNow: probe.status.online_now ?? 0,
          uptime: probe.status.uptime,
          storageUsed: probe.status.storage_used,
        };
      }
    } else {
      // Skip probe — set to connecting; the periodic health check will confirm
      connections[slug].hub.connectionStatus = 'connecting';
    }

    localStorage.setItem(STORAGE_KEYS.HUBS, JSON.stringify(connections));
    return connections[slug].hub;
  }

  // ──────────────────────────────────────────────
  // Migration from legacy localStorage keys
  // ──────────────────────────────────────────────

  /** Migrate data from old format to new hub-based format */
  migrateLegacyData(): Hub | null {
    const oldUserData = localStorage.getItem(STORAGE_KEYS.USER_DATA);
    const oldSelectedNode = localStorage.getItem(STORAGE_KEYS.SELECTED_NODE);
    
    if (!oldUserData || !oldSelectedNode) return null;
    
    try {
      const userData = JSON.parse(oldUserData);
      const selectedNode = JSON.parse(oldSelectedNode);
      
      // Check if we already migrated
      const existingConnections = this.getAllHubConnections();
      if (Object.keys(existingConnections).length > 0) return null;
      
      const slug = this.slugify(selectedNode.nodeName || 'local-hub');
      const hub: Hub = {
        id: selectedNode.nodeId || slug,
        slug,
        name: selectedNode.nodeName || 'Local Hub',
        tunnelUrl: '', // No tunnel URL in legacy data
        location: '',
        connectionStatus: 'disconnected',
        joinedAt: new Date().toISOString(),
      };

      const hubUser: HubUser = {
        username: userData.displayName || 'neighbor',
        displayName: userData.displayName || 'Neighbor',
        tags: userData.tags || [],
        role: userData.role || 'participant',
        agreedToManifesto: userData.agreedToManifesto || false,
      };

      const connections: Record<string, HubConnection> = {
        [slug]: { hub, user: hubUser }
      };
      
      localStorage.setItem(STORAGE_KEYS.HUBS, JSON.stringify(connections));
      this.setActiveHub(slug);
      
      // Clean up legacy keys
      localStorage.removeItem(STORAGE_KEYS.USER_DATA);
      localStorage.removeItem(STORAGE_KEYS.SELECTED_NODE);
      
      return hub;
    } catch {
      return null;
    }
  }

  // ──────────────────────────────────────────────
  // URL Helpers
  // ──────────────────────────────────────────────

  /** Get the web app URL for a hub, relative to the current origin. */
  getHubPortalUrl(hubSlug: string): string {
    const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
    return `${origin}?hub=${hubSlug}`;
  }

  /** Get the invite URL for a hub */
  getInviteUrl(hubSlug: string): string {
    return this.getHubPortalUrl(hubSlug);
  }

  /** Normalize a hub URL (strip trailing slashes, infer http for LAN/private hosts) */
  normalizeTunnelUrl(url: string): string {
    let clean = url.trim();
    // Add a protocol if no protocol specified.
    // Use http:// for LAN/private/local hosts so bare inputs like citinet:9090
    // work on the local network, but keep https:// for public tunnel-style hosts.
    if (!clean.startsWith('http://') && !clean.startsWith('https://')) {
      const hostPart = clean.split('/')[0];
      const hostname = hostPart.split(':')[0].toLowerCase();
      const looksLocal =
        hostname === 'localhost' ||
        hostname === 'citinet' ||
        hostname.endsWith('.local') ||
        hostname.endsWith('.lan') ||
        /^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostname) ||
        /^10\./.test(hostname) ||
        /^192\.168\./.test(hostname) ||
        /^172\.(1[6-9]|2\d|3[01])\./.test(hostname);

      clean = `${looksLocal ? 'http' : 'https'}://${clean}`;
    }
    // Remove trailing slashes
    clean = clean.replace(/\/+$/, '');
    return clean;
  }

  /** Extract a fallback name from a URL hostname */
  private extractNameFromUrl(url: string): string {
    try {
      const hostname = new URL(url).hostname;
      // e.g., "abc123.trycloudflare.com" → "abc123"
      return hostname.split('.')[0] || 'hub';
    } catch {
      return 'hub';
    }
  }

  /** Create a URL-friendly slug from text */
  slugify(text: string): string {
    return text
      .toLowerCase()
      .replace(/[^\w\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/--+/g, '-')
      .trim();
  }

  // ──────────────────────────────────────────────
  // Members
  // ──────────────────────────────────────────────

  /**
   * List members of a hub.
   * Calls GET /api/members with auth token.
   */
  async listMembers(hubSlug: string): Promise<HubMember[]> {
    const connection = this.getHubConnection(hubSlug);
    if (!connection) throw new Error(`No hub found with slug: ${hubSlug}`);
    if (!connection.hub.tunnelUrl) throw new Error('Hub has no tunnel URL');

    const headers: Record<string, string> = {};
    if (connection.user?.authToken) {
      headers['Authorization'] = `Bearer ${connection.user.authToken}`;
    }

    const response = await fetch(`${connection.hub.tunnelUrl}/api/members`, { headers });

    if (!response.ok) await this.parseErrorResponse(response, hubSlug);

    const data = await response.json();
    // Accept both { members: [...] } and plain array
    const rawMembers: any[] = Array.isArray(data) ? data : (data.members || []);

    return rawMembers.map((m: any) => ({
      user_id:   m.user_id || m.id || m.userId || '',
      username:  m.username || m.name || m.display_name || 'Unknown',
      is_admin:  Boolean(m.is_admin || m.isAdmin || false),
      role:      (m.role as 'admin' | 'moderator' | 'member') ?? (m.is_admin ? 'admin' : 'member'),
      created_at: m.created_at || m.createdAt || m.joined_at || '',
    }));
  }

  // ──────────────────────────────────────────────
  // Conversations & Messages
  // ──────────────────────────────────────────────

  /** Helper: get auth headers for a hub */
  private getAuthHeaders(hubSlug: string): { headers: Record<string, string>; tunnelUrl: string } {
    const connection = this.getHubConnection(hubSlug);
    if (!connection) throw new Error(`No hub found with slug: ${hubSlug}`);
    if (!connection.hub.tunnelUrl) throw new Error('Hub has no tunnel URL');

    const headers: Record<string, string> = {};
    if (connection.user?.authToken) {
      headers['Authorization'] = `Bearer ${connection.user.authToken}`;
    }
    return { headers, tunnelUrl: connection.hub.tunnelUrl };
  }

  /**
   * List the current user's conversations.
   * GET /api/conversations
   */
  async listConversations(hubSlug: string): Promise<HubConversation[]> {
    const { headers, tunnelUrl } = this.getAuthHeaders(hubSlug);

    const response = await fetch(`${tunnelUrl}/api/conversations`, { headers });
    if (!response.ok) await this.parseErrorResponse(response, hubSlug);

    const data = await response.json();
    const rawConvos: any[] = Array.isArray(data) ? data : (data.conversations || []);

    // Process all conversations, decrypting last message previews for DMs
    return Promise.all(rawConvos.map(async (raw: any) => {
      // API wraps as { conversation: {...}, members: [...], last_message: ... }
      const conv = raw.conversation || raw;
      const membersList: Array<{ user_id: string; username: string }> = (raw.members || conv.members || conv.participants || []).map((p: any) => ({
        user_id: p.user_id || p.id || '',
        username: p.username || p.name || 'Unknown',
      }));
      const lastMsg = raw.last_message || conv.last_message;
      const convoId: string = conv.conversation_id || conv.id || '';
      const kind: 'dm' | 'group' = conv.kind === 'dm' ? 'dm' : 'group';

      let lastMessageBody: string = lastMsg ? (lastMsg.body || lastMsg.content || lastMsg.text || '') : '';
      if (lastMsg && kind === 'dm' && membersList.length === 2 && isMessageEncrypted(lastMessageBody)) {
        const peerKey = await this.resolveDmPeerKey(hubSlug, membersList);
        if (peerKey) {
          lastMessageBody = await decryptMessage(hubSlug, peerKey, convoId, lastMessageBody);
        } else {
          lastMessageBody = '🔒 Encrypted message';
        }
      }

      return {
        id: convoId,
        kind,
        name: conv.name || undefined,
        members: membersList,
        lastMessage: lastMsg ? {
          id: lastMsg.message_id || lastMsg.id || '',
          conversation_id: lastMsg.conversation_id || convoId,
          sender_id: lastMsg.sender_id || '',
          sender_username: lastMsg.sender_username || undefined,
          body: lastMessageBody,
          attachments: this.normalizeAttachments(lastMsg.attachments),
          created_at: lastMsg.created_at || '',
        } : undefined,
        created_by: conv.created_by || undefined,
        created_at: conv.created_at || '',
        updated_at: conv.updated_at || undefined,
      };
    }));
  }

  /**
   * Create a new conversation (DM or group).
   * POST /api/conversations
   */
  async createConversation(
    hubSlug: string,
    kind: 'dm' | 'group',
    participantIds: string[],
    name?: string,
  ): Promise<HubConversation> {
    const { headers, tunnelUrl } = this.getAuthHeaders(hubSlug);

    const payload: any = { kind };
    if (kind === 'dm' && participantIds.length === 1) {
      // DM expects peer_user_id (single UUID)
      payload.peer_user_id = participantIds[0];
    } else {
      // Group expects participant_ids array
      payload.participant_ids = participantIds;
    }
    if (name) payload.name = name;

    const response = await fetch(`${tunnelUrl}/api/conversations`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errBody = await response.text();
      throw new Error(errBody || `Failed to create conversation (${response.status})`);
    }

    const c = await response.json();
    return {
      id: c.conversation_id || c.id || '',
      kind: (c.kind === 'dm' ? 'dm' : 'group') as 'dm' | 'group',
      name: c.name || undefined,
      members: (c.members || c.participants || []).map((p: any) => ({
        user_id: p.user_id || p.id || '',
        username: p.username || p.name || 'Unknown',
      })),
      lastMessage: undefined,
      created_by: c.created_by || undefined,
      created_at: c.created_at || new Date().toISOString(),
      updated_at: c.updated_at || undefined,
    };
  }

  /**
   * Get messages in a conversation (paginated).
   * GET /api/conversations/:id/messages?limit=50&before=cursor
   * Pass `members` for DMs to enable transparent E2E decryption.
   */
  async getMessages(
    hubSlug: string,
    conversationId: string,
    limit = 50,
    before?: string,
    members?: Array<{ user_id: string }>,
  ): Promise<HubMessage[]> {
    const { headers, tunnelUrl } = this.getAuthHeaders(hubSlug);

    const params = new URLSearchParams({ limit: String(limit) });
    if (before) params.set('before', before);

    const response = await fetch(
      `${tunnelUrl}/api/conversations/${conversationId}/messages?${params}`,
      { headers },
    );

    if (!response.ok) {
      const body = await response.text();
      throw new Error(body || `Failed to load messages (${response.status})`);
    }

    const data = await response.json();
    const rawMsgs: any[] = Array.isArray(data) ? data : (data.messages || []);

    // Resolve DM peer key once for the whole batch
    let peerKey: string | null = null;
    if (members && members.length === 2) {
      peerKey = await this.resolveDmPeerKey(hubSlug, members);
    }

    return Promise.all(rawMsgs.map(async (m: any) => {
      const rawBody: string = m.body || m.content || m.text || '';
      let body = rawBody;
      if (peerKey && isMessageEncrypted(rawBody)) {
        body = await decryptMessage(hubSlug, peerKey, conversationId, rawBody);
      }
      return {
        id: m.message_id || m.id || '',
        conversation_id: m.conversation_id || conversationId,
        sender_id: m.sender_id || m.user_id || '',
        sender_username: m.sender_username || m.username || undefined,
        body,
        attachments: this.normalizeAttachments(m.attachments),
        created_at: m.created_at || '',
      };
    }));
  }

  /**
   * Send a message in a conversation.
   * POST /api/conversations/:id/messages
   * Pass `members` for DMs to enable E2E encryption.
   */
  async sendMessage(
    hubSlug: string,
    conversationId: string,
    messageBody: string,
    members?: Array<{ user_id: string }>,
  ): Promise<HubMessage> {
    const { headers, tunnelUrl } = this.getAuthHeaders(hubSlug);

    // Encrypt body for DMs if we can resolve the peer's public key
    let encryptedBody = messageBody;
    if (members && members.length === 2) {
      const peerKey = await this.resolveDmPeerKey(hubSlug, members);
      if (peerKey) {
        encryptedBody = await encryptMessage(hubSlug, peerKey, conversationId, messageBody);
      }
    }

    const response = await fetch(
      `${tunnelUrl}/api/conversations/${conversationId}/messages`,
      {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: encryptedBody }),
      },
    );

    if (!response.ok) {
      const errBody = await response.text();
      throw new Error(errBody || `Failed to send message (${response.status})`);
    }

    const m = await response.json();
    return {
      id: m.message_id || m.id || '',
      conversation_id: m.conversation_id || conversationId,
      sender_id: m.sender_id || m.user_id || '',
      sender_username: m.sender_username || m.username || undefined,
      body: messageBody, // return original plaintext for immediate local display
      attachments: this.normalizeAttachments(m.attachments),
      created_at: m.created_at || new Date().toISOString(),
    };
  }

  /**
   * Send a message with file attachments.
   * POST /api/conversations/:id/messages using multipart/form-data.
   * Falls back to uploading files separately then referencing them.
   * Pass `members` for DMs to enable E2E encryption of the text body.
   */
  async sendMessageWithMedia(
    hubSlug: string,
    conversationId: string,
    messageBody: string,
    files: File[],
    members?: Array<{ user_id: string }>,
  ): Promise<HubMessage> {
    const connection = this.getHubConnection(hubSlug);
    if (!connection) throw new Error(`No hub found with slug: ${hubSlug}`);
    if (!connection.hub.tunnelUrl) throw new Error('Hub has no tunnel URL');

    const tunnelUrl = connection.hub.tunnelUrl;
    const token = connection.user?.authToken;
    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;

    // Strategy: upload each file first via /api/files, then send message with attachment refs
    const attachments: HubMessageAttachment[] = [];
    for (const file of files) {
      const uploaded = await this.uploadFile(hubSlug, file, false);
      attachments.push({
        id: uploaded.id,
        file_name: uploaded.name || file.name,
        mime_type: file.type || uploaded.mime_type || 'application/octet-stream',
        size: file.size,
      });
    }

    // Encrypt text body for DMs if possible
    let encryptedBody = messageBody || '';
    if (members && members.length === 2) {
      const peerKey = await this.resolveDmPeerKey(hubSlug, members);
      if (peerKey && encryptedBody) {
        encryptedBody = await encryptMessage(hubSlug, peerKey, conversationId, encryptedBody);
      }
    }

    // Send the message with attachment IDs
    const payload: any = {
      body: encryptedBody,
      attachment_ids: attachments.map(a => a.id),
    };

    const response = await fetch(
      `${tunnelUrl}/api/conversations/${conversationId}/messages`,
      {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      },
    );

    if (!response.ok) {
      const errBody = await response.text();
      throw new Error(errBody || `Failed to send message (${response.status})`);
    }

    const m = await response.json();
    return {
      id: m.message_id || m.id || '',
      conversation_id: m.conversation_id || conversationId,
      sender_id: m.sender_id || m.user_id || '',
      sender_username: m.sender_username || m.username || undefined,
      body: messageBody || '', // return original plaintext for immediate local display
      attachments: this.normalizeAttachments(m.attachments) || attachments,
      created_at: m.created_at || new Date().toISOString(),
    };
  }

  /** Normalize attachment data from the hub API */
  private normalizeAttachments(raw: any): HubMessageAttachment[] | undefined {
    if (!raw || !Array.isArray(raw) || raw.length === 0) return undefined;
    return raw.map((a: any) => ({
      id: a.file_id || a.id || '',
      file_name: a.file_name || a.name || a.filename || 'file',
      mime_type: a.mime_type || a.mimetype || a.content_type || 'application/octet-stream',
      size: Number(a.size || a.size_bytes || 0),
    }));
  }

  /**
   * Get the WebSocket URL for real-time message delivery.
   * Returns ws(s)://host/ws?token=JWT
   */
  getWebSocketUrl(hubSlug: string): string | null {
    const connection = this.getHubConnection(hubSlug);
    if (!connection?.hub.tunnelUrl || !connection.user?.authToken) return null;

    const wsUrl = connection.hub.tunnelUrl
      .replace('https://', 'wss://')
      .replace('http://', 'ws://');
    return `${wsUrl}/ws?token=${connection.user.authToken}`;
  }

  // ──────────────────────────────────────────────
  // Files
  // ──────────────────────────────────────────────

  /**
   * List files on a hub (both personal and shared).
   * Calls GET /api/files with auth token.
   */
  async listFiles(hubSlug: string): Promise<HubFile[]> {
    const connection = this.getHubConnection(hubSlug);
    if (!connection) throw new Error(`No hub found with slug: ${hubSlug}`);
    if (!connection.hub.tunnelUrl) throw new Error('Hub has no tunnel URL');

    const { headers } = this.getAuthHeaders(hubSlug);

    const response = await fetch(`${connection.hub.tunnelUrl}/api/files`, { headers });

    if (!response.ok) await this.parseErrorResponse(response, hubSlug);

    const data = await response.json();
    // Accept both { files: [...] } and plain array
    const rawFiles: any[] = Array.isArray(data) ? data : (data.files || []);

    // Normalize field names to match HubFile interface
    return rawFiles.map((f: any, index: number) => ({
      id: String(f.file_id ?? f.id ?? f.uuid ?? index),
      name: f.file_name || f.name || f.filename || f.original_name || f.title || 'Unnamed file',
      size: Number(f.size_bytes || f.size || f.file_size || f.content_length || f.bytes || 0),
      mime_type: f.mime_type || f.mimetype || f.content_type || f.type || undefined,
      owner_id: f.owner_id || undefined,
      uploaded_by: f.uploaded_by || f.owner_id || f.uploader || f.user || undefined,
      uploaded_at: f.created_at || f.uploaded_at || f.timestamp || f.date || undefined,
      description: f.description || undefined,
      category: f.category || f.folder || undefined,
      is_public: f.is_public ?? true,
    }));
  }

  /**
   * Upload a file to the hub.
   * POST /api/files with multipart/form-data (file + is_public).
   * Private files are transparently client-side encrypted before upload.
   */
  async uploadFile(hubSlug: string, file: File, isPublic: boolean): Promise<HubFile> {
    const connection = this.getHubConnection(hubSlug);
    if (!connection) throw new Error(`No hub found with slug: ${hubSlug}`);
    if (!connection.hub.tunnelUrl) throw new Error('Hub has no tunnel URL');

    const headers: Record<string, string> = {};
    if (connection.user?.authToken) {
      headers['Authorization'] = `Bearer ${connection.user.authToken}`;
    }

    let uploadFile = file;

    // Encrypt private files client-side before uploading
    if (!isPublic) {
      try {
        const buf = await file.arrayBuffer();
        const encBuf = await encryptFileBuffer(hubSlug, buf);
        if (encBuf) {
          // Keep original filename and mime so server stores metadata correctly.
          // Encrypted bytes are opaque — server just stores them as-is.
          uploadFile = new File([encBuf], file.name, { type: file.type });
        }
      } catch { /* fall back to unencrypted upload */ }
    }

    const formData = new FormData();
    formData.append('file', uploadFile);
    formData.append('is_public', String(isPublic));

    const response = await fetch(`${connection.hub.tunnelUrl}/api/files`, {
      method: 'POST',
      headers,
      body: formData,
    });

    if (!response.ok) await this.parseErrorResponse(response, hubSlug);

    const data = await response.json();
    return {
      id: String(data.file_id || data.id || ''),
      name: data.file_name || file.name,
      size: Number(data.size_bytes || file.size || 0),
      mime_type: file.type || undefined,
      is_public: isPublic,
      owner_id: connection.user?.hubUserId || undefined,
      uploaded_at: new Date().toISOString(),
    };
  }

  /**
   * Delete a file from the hub by filename.
   * DELETE /api/files/{filename} — returns 204.
   */
  async deleteFile(hubSlug: string, fileName: string): Promise<void> {
    const connection = this.getHubConnection(hubSlug);
    if (!connection) throw new Error(`No hub found with slug: ${hubSlug}`);
    if (!connection.hub.tunnelUrl) throw new Error('Hub has no tunnel URL');

    const { headers } = this.getAuthHeaders(hubSlug);

    const response = await fetch(
      `${connection.hub.tunnelUrl}/api/files/${encodeURIComponent(fileName)}`,
      { method: 'DELETE', headers },
    );

    if (!response.ok && response.status !== 204) {
      const body = await response.text();
      throw new Error(body || `Delete failed (${response.status})`);
    }
  }

  /**
   * Toggle a file's visibility (public ↔ private).
   * Hub API: PATCH /api/files/{filename} with { is_public: boolean }
   */
  async toggleFileVisibility(hubSlug: string, fileName: string, isPublic: boolean): Promise<void> {
    const connection = this.getHubConnection(hubSlug);
    if (!connection) throw new Error(`No hub found with slug: ${hubSlug}`);
    if (!connection.hub.tunnelUrl) throw new Error('Hub has no tunnel URL');

    const { headers } = this.getAuthHeaders(hubSlug);

    const response = await fetch(
      `${connection.hub.tunnelUrl}/api/files/${encodeURIComponent(fileName)}`,
      {
        method: 'PATCH',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_public: isPublic }),
      },
    );

    if (!response.ok) {
      const body = await response.text();
      throw new Error(body || `Toggle visibility failed (${response.status})`);
    }
  }

  /**
   * Get the download URL for a file on the hub.
   * Hub API uses file name (not ID) as the download path.
   */
  getFileDownloadUrl(hubSlug: string, fileName: string): string | null {
    const connection = this.getHubConnection(hubSlug);
    if (!connection?.hub.tunnelUrl) return null;
    return `${connection.hub.tunnelUrl}/api/files/${encodeURIComponent(fileName)}`;
  }

  /**
   * Download a file from the hub. Opens in a new tab or triggers a download.
   */
  downloadFile(hubSlug: string, fileName: string): void {
    const url = this.getFileDownloadUrl(hubSlug, fileName);
    if (!url) return;

    const connection = this.getHubConnection(hubSlug);
    const token = connection?.user?.authToken;

    if (token) {
      // Authenticated download — fetch as blob then trigger download
      fetch(url, {
        headers: { 'Authorization': `Bearer ${token}` },
      })
        .then(res => {
          if (!res.ok) throw new Error(`Download failed (${res.status})`);
          return res.arrayBuffer();
        })
        .then(async buf => {
          let finalBuf: ArrayBuffer = buf;
          if (isFileEncrypted(buf)) {
            const plain = await decryptFileBuffer(hubSlug, buf);
            if (plain) finalBuf = plain;
          }
          const blobUrl = URL.createObjectURL(new Blob([finalBuf]));
          const a = document.createElement('a');
          a.href = blobUrl;
          a.download = fileName;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(blobUrl);
        })
        .catch(err => console.error('Download error:', err));
    } else {
      // Unauthenticated — just open the URL
      window.open(url, '_blank');
    }
  }

  /**
   * Fetch a file from the hub as a blob URL (for lightbox preview).
   * Transparently decrypts client-side encrypted files.
   * Caller is responsible for revoking the URL when done.
   */
  async fetchFileBlob(hubSlug: string, fileName: string, mimeType?: string): Promise<string> {
    const url = this.getFileDownloadUrl(hubSlug, fileName);
    if (!url) throw new Error('No download URL available');

    const connection = this.getHubConnection(hubSlug);
    const token = connection?.user?.authToken;

    const res = await fetch(url, {
      headers: token ? { 'Authorization': `Bearer ${token}` } : {},
    });
    if (!res.ok) throw new Error(`Failed to load file (${res.status})`);

    const buf = await res.arrayBuffer();

    // Attempt decryption if the file has the encryption magic header
    if (isFileEncrypted(buf)) {
      const plainBuf = await decryptFileBuffer(hubSlug, buf);
      if (plainBuf) {
        const mime = mimeType || 'application/octet-stream';
        return URL.createObjectURL(new Blob([plainBuf], { type: mime }));
      }
      // Decryption failed (different device / no key) — return as-is, it will look garbled
    }

    const blob = new Blob([buf], { type: mimeType || res.headers.get('Content-Type') || 'application/octet-stream' });
    return URL.createObjectURL(blob);
  }

  // ──────────────────────────────────────────────
  // Posts & Replies
  // ──────────────────────────────────────────────

  /** List posts on the hub, newest first. Optionally filter by category. */
  async listPosts(hubSlug: string, category?: string): Promise<HubPost[]> {
    const { headers, tunnelUrl } = this.getAuthHeaders(hubSlug);
    const params = category ? `?category=${encodeURIComponent(category)}` : '';
    const response = await fetch(`${tunnelUrl}/api/posts${params}`, { headers });
    if (!response.ok) await this.parseErrorResponse(response, hubSlug);
    const data = await response.json();
    return Array.isArray(data) ? data : (data.posts || []);
  }

  /** Fetch a single post by ID. */
  async getPost(hubSlug: string, postId: string): Promise<HubPost> {
    const { headers, tunnelUrl } = this.getAuthHeaders(hubSlug);
    const response = await fetch(`${tunnelUrl}/api/posts/${encodeURIComponent(postId)}`, { headers });
    if (!response.ok) await this.parseErrorResponse(response, hubSlug);
    return response.json();
  }

  /** Create a new post. Optionally attach an image file. */
  async createPost(
    hubSlug: string,
    post: { category: string; title: string; body: string; mediaFile?: File }
  ): Promise<HubPost> {
    const connection = this.getHubConnection(hubSlug);
    if (!connection?.hub.tunnelUrl) throw new Error('Hub has no tunnel URL');

    const formData = new FormData();
    formData.append('category', post.category);
    formData.append('title', post.title);
    formData.append('body', post.body);
    if (post.mediaFile) formData.append('media', post.mediaFile);

    const headers: Record<string, string> = {};
    if (connection.user?.authToken) headers['Authorization'] = `Bearer ${connection.user.authToken}`;

    const response = await fetch(`${connection.hub.tunnelUrl}/api/posts`, {
      method: 'POST',
      headers,
      body: formData,
    });
    if (!response.ok) await this.parseErrorResponse(response, hubSlug);
    return response.json();
  }

  /** Delete a post (author or admin only). */
  async deletePost(hubSlug: string, postId: string): Promise<void> {
    const { headers, tunnelUrl } = this.getAuthHeaders(hubSlug);
    const response = await fetch(`${tunnelUrl}/api/posts/${postId}`, { method: 'DELETE', headers });
    if (!response.ok && response.status !== 204) await this.parseErrorResponse(response, hubSlug);
  }

  /** Update a post's text content (author or admin only). */
  async updatePost(
    hubSlug: string,
    postId: string,
    updates: { title?: string; body?: string }
  ): Promise<HubPost> {
    const { headers, tunnelUrl } = this.getAuthHeaders(hubSlug);
    const response = await fetch(`${tunnelUrl}/api/posts/${postId}`, {
      method: 'PATCH',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
    if (!response.ok) await this.parseErrorResponse(response, hubSlug);
    return response.json();
  }

  /** Get the URL for a public post image (no auth needed). */
  getPublicFileUrl(hubSlug: string, fileName: string): string | null {
    const connection = this.getHubConnection(hubSlug);
    if (!connection?.hub.tunnelUrl) return null;
    return `${connection.hub.tunnelUrl}/api/public/files/${encodeURIComponent(fileName)}`;
  }

  /** List replies for a post, oldest first. */
  async listReplies(hubSlug: string, postId: string): Promise<HubPostReply[]> {
    const { headers, tunnelUrl } = this.getAuthHeaders(hubSlug);
    const response = await fetch(`${tunnelUrl}/api/posts/${postId}/replies`, { headers });
    if (!response.ok) await this.parseErrorResponse(response, hubSlug);
    const data = await response.json();
    return Array.isArray(data) ? data : (data.replies || []);
  }

  /** Post a reply to a discussion. */
  async createReply(
    hubSlug: string,
    postId: string,
    body: string,
    replyToReplyId?: string | null,
    replyToUserId?: string | null,
  ): Promise<HubPostReply> {
    const { headers, tunnelUrl } = this.getAuthHeaders(hubSlug);
    const response = await fetch(`${tunnelUrl}/api/posts/${postId}/replies`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ body, reply_to_reply_id: replyToReplyId ?? null, reply_to_user_id: replyToUserId ?? null }),
    });
    if (!response.ok) await this.parseErrorResponse(response, hubSlug);
    return response.json();
  }

  // ──────────────────────────────────────────────
  // Private: Storage helpers
  // ──────────────────────────────────────────────

  /** Parse an error response into a human-readable message. Never surfaces raw HTML. */
  private async parseErrorResponse(response: Response, hubSlug?: string): Promise<never> {
    if (response.status === 401 && hubSlug) {
      this.clearAuthToken(hubSlug);
      throw new Error('Session expired — please log in again.');
    }
    const ct = response.headers.get('content-type') || '';
    if (ct.includes('application/json')) {
      try {
        const json = await response.json();
        throw new Error(json.error || json.message || `Request failed (${response.status})`);
      } catch (e) {
        if (e instanceof Error && e.message !== '') throw e;
      }
    }
    const text = await response.text();
    if (text.includes('<!DOCTYPE') || text.includes('<html')) {
      throw new Error(`Server error (${response.status})`);
    }
    throw new Error(text || `Request failed (${response.status})`);
  }

  /**
   * Update hub identity fields on the server (PATCH /api/hub-info) and in localStorage.
   * Requires admin token. Any subset of name, location, description may be provided.
   * @returns the updated Hub object (localStorage-updated regardless of API result)
   */
  async updateHubInfo(
    slug: string,
    fields: { name?: string; location?: string; lat?: number; lng?: number; description?: string },
  ): Promise<Hub> {
    const { headers, tunnelUrl } = this.getAuthHeaders(slug);
    const connections = this.getAllHubConnections();
    const connection = connections[slug];
    if (!connection) throw new Error(`No hub found with slug: ${slug}`);

    // Persist to server (best-effort — don't block on failure)
    if (tunnelUrl) {
      const body: Record<string, string> = {};
      if (fields.name        !== undefined) body.name        = fields.name;
      if (fields.location    !== undefined) body.location    = fields.location;
      if (fields.description !== undefined) body.description = fields.description;
      if (Object.keys(body).length > 0) {
        try {
          const res = await fetch(`${tunnelUrl}/api/hub-info`, {
            method: 'PATCH',
            headers: { ...headers, 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          });
          if (!res.ok) {
            const text = await res.text().catch(() => '');
            console.warn('hub-info update failed:', res.status, text);
          }
        } catch (err) {
          console.warn('hub-info update network error:', err);
        }
      }
    }

    // Always update localStorage so the UI reflects the change immediately
    if (fields.name        !== undefined) connection.hub.name        = fields.name;
    if (fields.location    !== undefined) connection.hub.location    = fields.location;
    if (fields.lat         !== undefined) connection.hub.lat         = fields.lat;
    if (fields.lng         !== undefined) connection.hub.lng         = fields.lng;
    if (fields.description !== undefined) connection.hub.description = fields.description;
    localStorage.setItem(STORAGE_KEYS.HUBS, JSON.stringify(connections));
    return connection.hub;
  }

  /** Clear the stored auth token for a hub (called when a 401 is received). */
  clearAuthToken(hubSlug: string): void {
    const connections = this.getAllHubConnections();
    if (connections[hubSlug]?.user) {
      delete connections[hubSlug].user.authToken;
      localStorage.setItem(STORAGE_KEYS.HUBS, JSON.stringify(connections));
    }
  }

  // ──────────────────────────────────────────────
  // E2E Encryption — Key Management
  // ──────────────────────────────────────────────

  /**
   * Ensure this device has encryption keys for the given hub.
   * Called silently after login/register — generates keys if missing,
   * then uploads the public key to the hub server.
   * Fire-and-forget: errors are swallowed so they never block auth.
   */
  async ensureUserKeys(hubSlug: string): Promise<void> {
    try {
      const alreadyHasKeys = await hasKeys(hubSlug);
      let publicKeyJwk: string;

      if (alreadyHasKeys) {
        // Keys exist on this device — re-upload the public key so server stays in sync
        // (e.g. server was reset, or first upload failed).
        const storedJwk = await getStoredPublicKeyJwk(hubSlug);
        if (!storedJwk) return;
        const conn = this.getHubConnection(hubSlug);
        if (!conn?.user?.authToken) return;
        await fetch(`${conn.hub.tunnelUrl}/api/keys`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${conn.user.authToken}` },
          body: JSON.stringify({ publicKeyJwk: storedJwk }),
        });
        return;
      }

      // No keys on this device — generate a fresh set
      const result = await generateUserKeys(hubSlug);
      publicKeyJwk = result.publicKeyJwk;

      const conn = this.getHubConnection(hubSlug);
      if (!conn?.user?.authToken) return;
      await fetch(`${conn.hub.tunnelUrl}/api/keys`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${conn.user.authToken}` },
        body: JSON.stringify({ publicKeyJwk }),
      });
    } catch { /* never block auth */ }
  }

  /** Upload or refresh the user's public key on the hub server. */
  async registerPublicKey(hubSlug: string, publicKeyJwk: string): Promise<void> {
    const conn = this.getHubConnection(hubSlug);
    if (!conn?.user?.authToken) return;
    await fetch(`${conn.hub.tunnelUrl}/api/keys`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${conn.user.authToken}` },
      body: JSON.stringify({ publicKeyJwk }),
    });
  }

  /** Get another user's public key from the hub (for encrypting content to them). */
  async getUserPublicKey(hubSlug: string, userId: string): Promise<string | null> {
    const conn = this.getHubConnection(hubSlug);
    if (!conn?.user?.authToken) return null;
    try {
      const res = await fetch(`${conn.hub.tunnelUrl}/api/keys/${encodeURIComponent(userId)}`, {
        headers: { Authorization: `Bearer ${conn.user.authToken}` },
      });
      if (!res.ok) return null;
      const { publicKeyJwk } = await res.json();
      return publicKeyJwk;
    } catch { return null; }
  }

  /**
   * Resolve the peer's public key JWK for a DM conversation.
   * `members` is the conversation's members array (must include both parties).
   * Returns null for group chats or if the peer has no registered key.
   */
  private async resolveDmPeerKey(
    hubSlug: string,
    members: Array<{ user_id: string }>,
  ): Promise<string | null> {
    const myUserId = this.getHubConnection(hubSlug)?.user?.hubUserId;
    if (!myUserId) return null;
    const peer = members.find(m => m.user_id !== myUserId);
    if (!peer) return null;
    return this.getUserPublicKey(hubSlug, peer.user_id);
  }

  /** Store an encrypted key backup on the server for cross-device recovery. */
  async storeKeyBackup(hubSlug: string, passphrase: string): Promise<boolean> {
    try {
      const backup = await createKeyBackup(hubSlug, passphrase);
      if (!backup) return false;
      const conn = this.getHubConnection(hubSlug);
      if (!conn?.user?.authToken) return false;
      const res = await fetch(`${conn.hub.tunnelUrl}/api/keys/backup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${conn.user.authToken}` },
        body: JSON.stringify(backup),
      });
      return res.ok;
    } catch { return false; }
  }

  /** Retrieve encrypted key backup from server and restore using passphrase. */
  async restoreFromKeyBackup(hubSlug: string, passphrase: string): Promise<boolean> {
    try {
      const conn = this.getHubConnection(hubSlug);
      if (!conn?.user?.authToken) return false;
      const res = await fetch(`${conn.hub.tunnelUrl}/api/keys/backup`, {
        headers: { Authorization: `Bearer ${conn.user.authToken}` },
      });
      if (!res.ok) return false;
      const backup = await res.json() as KeyBackupPayload;
      return restoreKeyBackup(hubSlug, backup, passphrase);
    } catch { return false; }
  }

  /** Whether a key backup exists on the server for this user. */
  async hasKeyBackup(hubSlug: string): Promise<boolean> {
    try {
      const conn = this.getHubConnection(hubSlug);
      if (!conn?.user?.authToken) return false;
      const res = await fetch(`${conn.hub.tunnelUrl}/api/keys/backup`, {
        headers: { Authorization: `Bearer ${conn.user.authToken}` },
      });
      return res.ok;
    } catch { return false; }
  }

  /** Remove keys from this device's IndexedDB (called on logout). */
  async clearLocalKeys(hubSlug: string): Promise<void> {
    await clearKeys(hubSlug).catch(() => {});
  }

  // ──────────────────────────────────────────────
  // Notes (private, owner-only)
  // ──────────────────────────────────────────────

  /** Decrypt a note in-place if its body_plain is an encrypted sentinel. */
  private async maybeDecryptNote(hubSlug: string, note: HubNote): Promise<HubNote> {
    if (!isNoteEncrypted(note.body_plain)) return note;
    const decrypted = await decryptNoteBody(hubSlug, note.body_plain);
    if (!decrypted) {
      // Key unavailable on this device — show placeholder so the note still renders
      return { ...note, body_rich: null, body_plain: '[Encrypted — open on the device where you created this note, or restore your key backup]' };
    }
    return { ...note, body_rich: decrypted.body_rich, body_plain: decrypted.body_plain };
  }

  async listNotes(hubSlug: string, archived = false): Promise<HubNote[]> {
    const conn = this.getHubConnection(hubSlug);
    if (!conn) throw new Error('Not connected');
    const url = `${conn.hub.tunnelUrl}/api/notes${archived ? '?archived=true' : ''}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${conn.user.authToken}` } });
    if (!res.ok) throw new Error('Failed to load notes');
    const data = await res.json();
    const notes = data.notes as HubNote[];
    return Promise.all(notes.map(n => this.maybeDecryptNote(hubSlug, n)));
  }

  async getNote(hubSlug: string, noteId: string): Promise<HubNote> {
    const conn = this.getHubConnection(hubSlug);
    if (!conn) throw new Error('Not connected');
    const res = await fetch(`${conn.hub.tunnelUrl}/api/notes/${noteId}`, {
      headers: { Authorization: `Bearer ${conn.user.authToken}` },
    });
    if (!res.ok) throw new Error('Note not found');
    return this.maybeDecryptNote(hubSlug, await res.json() as HubNote);
  }

  async createNote(hubSlug: string, data: { title?: string; body_plain?: string; body_rich?: object }): Promise<HubNote> {
    const conn = this.getHubConnection(hubSlug);
    if (!conn) throw new Error('Not connected');
    // Encrypt body if content key is available and there is content to encrypt
    let payload = { ...data };
    if ((data.body_plain || data.body_rich) && (data.body_plain || data.body_rich !== undefined)) {
      const enc = await encryptNoteBody(hubSlug, data.body_rich ?? null, data.body_plain ?? '');
      if (enc) payload = { ...payload, body_plain: enc.body_plain, body_rich: enc.body_rich ?? undefined };
    }
    const res = await fetch(`${conn.hub.tunnelUrl}/api/notes`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${conn.user.authToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error('Failed to create note');
    return this.maybeDecryptNote(hubSlug, await res.json() as HubNote);
  }

  async updateNote(hubSlug: string, noteId: string, patch: Partial<Pick<HubNote, 'title' | 'body_plain' | 'body_rich' | 'is_pinned' | 'is_archived' | 'color'>>): Promise<HubNote> {
    const conn = this.getHubConnection(hubSlug);
    if (!conn) throw new Error('Not connected');
    // Encrypt body content fields if present in patch
    let sendPatch = { ...patch };
    if (patch.body_plain !== undefined || patch.body_rich !== undefined) {
      const enc = await encryptNoteBody(
        hubSlug,
        patch.body_rich ?? null,
        patch.body_plain ?? '',
      );
      if (enc) {
        sendPatch = { ...sendPatch, body_plain: enc.body_plain, body_rich: enc.body_rich ?? undefined };
      }
    }
    const res = await fetch(`${conn.hub.tunnelUrl}/api/notes/${noteId}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${conn.user.authToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(sendPatch),
    });
    if (!res.ok) throw new Error('Failed to update note');
    return this.maybeDecryptNote(hubSlug, await res.json() as HubNote);
  }

  async deleteNote(hubSlug: string, noteId: string): Promise<void> {
    const conn = this.getHubConnection(hubSlug);
    if (!conn) throw new Error('Not connected');
    const res = await fetch(`${conn.hub.tunnelUrl}/api/notes/${noteId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${conn.user.authToken}` },
    });
    if (!res.ok) throw new Error('Failed to delete note');
  }

  private saveHub(hub: Hub): void {
    const connections = this.getAllHubConnections();
    const existing = connections[hub.slug];
    connections[hub.slug] = {
      hub,
      user: existing?.user || {} as HubUser,
    };
    localStorage.setItem(STORAGE_KEYS.HUBS, JSON.stringify(connections));
  }
}

export const hubService = new HubService();
