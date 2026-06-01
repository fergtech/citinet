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

    // Always capture the API-reported public tunnel URL separately, even when
    // connecting locally. This ensures share links always embed the internet-
    // facing HTTPS URL rather than the localhost/LAN address used for API calls.
    const reportedTunnelUrl = probeInfo?.tunnel_url
      ? this.normalizeTunnelUrl(probeInfo.tunnel_url)
      : undefined;
    const publicTunnelUrl = reportedTunnelUrl && !this.isShellUrl(reportedTunnelUrl) && !this.isPrivateUrl(reportedTunnelUrl)
      ? reportedTunnelUrl
      : undefined;

    const hub: Hub = {
      id: probeInfo?.node_id || `local-${slug}-${Date.now()}`,
      slug,
      name: hubName,
      tunnelUrl: storedUrl,
      publicTunnelUrl,
      location: probeInfo?.location || '',
      description: probeInfo?.description,
      memberCount: probeStatus?.user_count,
      connectionStatus: probeInfo ? 'connected' : 'disconnected',
      joinedAt: new Date().toISOString(),
      lastConnectedAt: probeInfo ? new Date().toISOString() : undefined,
      lanIp: probeInfo?.lan_ip || undefined,
      enabledApps: probeInfo?.enabled_apps ?? null,
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
      profileVisibility?: 'public' | 'hub' | 'private';
    }
  ): Promise<HubUser> {
    const { headers, tunnelUrl } = this.getAuthHeaders(hubSlug);
    const body: Record<string, unknown> = {};
    if (updates.displayName        !== undefined) body.display_name        = updates.displayName;
    if (updates.location           !== undefined) body.location             = updates.location;
    if (updates.bio                !== undefined) body.bio                  = updates.bio;
    if (updates.tags               !== undefined) body.tags                 = updates.tags;
    if (updates.profileHeadline    !== undefined) body.profile_headline     = updates.profileHeadline;
    if (updates.website            !== undefined) body.website              = updates.website;
    if (updates.bannerMode         !== undefined) body.banner_mode          = updates.bannerMode;
    if (updates.bannerColor        !== undefined) body.banner_color         = updates.bannerColor;
    if (updates.bannerGradientFrom !== undefined) body.banner_gradient_from = updates.bannerGradientFrom;
    if (updates.bannerGradientTo   !== undefined) body.banner_gradient_to   = updates.bannerGradientTo;
    if (updates.profileVisibility  !== undefined) body.profile_visibility   = updates.profileVisibility;

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
      displayName:        updates.displayName,
      location:           updates.location,
      bio:                updates.bio,
      tags:               updates.tags,
      profileHeadline:    updates.profileHeadline,
      website:            updates.website,
      bannerMode:         updates.bannerMode,
      bannerColor:        updates.bannerColor,
      bannerGradientFrom: updates.bannerGradientFrom,
      bannerGradientTo:   updates.bannerGradientTo,
      profileVisibility:  updates.profileVisibility,
    });
  }

  /** Update visibility on a single post. */
  async updatePostVisibility(hubSlug: string, postId: string, visibility: 'inherit' | 'hub' | 'private'): Promise<void> {
    const { headers, tunnelUrl } = this.getAuthHeaders(hubSlug);
    const res = await fetch(`${tunnelUrl}/api/posts/${postId}`, {
      method: 'PATCH',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: '_keep_', visibility }), // title required by PATCH schema
    });
    if (!res.ok) throw new Error('Failed to update post visibility');
  }

  /** Fetch a publicly accessible profile (no auth required). */
  async getPublicProfile(username: string, tunnelUrl: string): Promise<Record<string, unknown>> {
    const res = await fetch(`${tunnelUrl}/api/public/profile/${encodeURIComponent(username)}`);
    if (!res.ok) throw new Error('Profile not found or not public');
    return res.json();
  }

  /** Fetch public posts for a publicly accessible profile (no auth required). */
  async getPublicProfilePosts(username: string, tunnelUrl: string): Promise<{ posts: unknown[] }> {
    const res = await fetch(`${tunnelUrl}/api/public/profile/${encodeURIComponent(username)}/posts`);
    if (!res.ok) throw new Error('Failed to load public posts');
    return res.json();
  }

  /** Shareable public URL for a profile. Only meaningful when profile_visibility = 'public'. */
  getPublicProfileUrl(hubSlug: string, username: string): string {
    const conn = this.getHubConnection(hubSlug);
    const publicUrl = conn?.hub?.publicTunnelUrl;
    const base = import.meta.env.VITE_APP_URL ?? 'https://citinet.cloud';
    const src = publicUrl ? `?src=${encodeURIComponent(publicUrl)}` : '';
    return `${base}/u/${hubSlug}/${encodeURIComponent(username)}${src}`;
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
    if (hubs[slug]) return hubs[slug];

    // Self-healing: if there's no direct key match but exactly one hub exists,
    // the connection was likely re-keyed under the wrong slug by an older bug.
    // Re-key it to the requested slug so routing works again.
    const keys = Object.keys(hubs);
    if (keys.length === 1) {
      const only = hubs[keys[0]];
      const healed: typeof only = { ...only, hub: { ...only.hub, slug } };
      hubs[slug] = healed;
      delete hubs[keys[0]];
      localStorage.setItem(STORAGE_KEYS.HUBS, JSON.stringify(hubs));
      if (this.getActiveHubSlug() !== slug) this.setActiveHub(slug);
      return healed;
    }

    return null;
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
    updates: Partial<Pick<HubUser, 'displayName' | 'email' | 'location' | 'bio' | 'tags' | 'avatarUrl' | 'profileHeadline' | 'website' | 'bannerMode' | 'bannerColor' | 'bannerGradientFrom' | 'bannerGradientTo' | 'bannerImageFileName' | 'profileVisibility'>>
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

    // Sync hub name and enabledApps from the API.
    // NOTE: We intentionally do NOT re-key the connection by hub name. The routing
    // slug (set at join/setup time) is stable — the display name is a separate
    // concern. Re-keying would orphan the connection whenever an admin renames
    // the hub, because the URL (?hub=<slug>) still references the original slug.
    const connections = this.getAllHubConnections();
    if (connections[slug]) {
      let dirty = false;
      if (result.info?.name && result.info.name !== connection.hub.name) {
        connections[slug].hub.name = result.info.name;
        dirty = true;
      }
      if (result.info?.enabled_apps !== undefined) {
        connections[slug].hub.enabledApps = result.info.enabled_apps ?? null;
        dirty = true;
      }
      // Backfill publicTunnelUrl from the API's tunnel_url — handles existing
      // localStorage entries that predate this field, and keeps it current.
      if (result.info?.tunnel_url) {
        const pub = this.normalizeTunnelUrl(result.info.tunnel_url);
        if (!this.isShellUrl(pub) && !this.isPrivateUrl(pub) && pub !== connections[slug].hub.publicTunnelUrl) {
          connections[slug].hub.publicTunnelUrl = pub;
          dirty = true;
        }
      }
      if (dirty) localStorage.setItem(STORAGE_KEYS.HUBS, JSON.stringify(connections));
    }

    this.updateHubStatus(slug, status, result.status ? {
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

  private isShellUrl(url: string): boolean {
    return !url || url === 'http://' || url === 'https://' || url.trim() === '';
  }

  /** Returns true if the URL points to a private/local address that is not internet-accessible. */
  private isPrivateUrl(url: string): boolean {
    if (!url) return true;
    return /localhost|127\.0\.0\.1|192\.168\.|^https?:\/\/10\.|172\.(1[6-9]|2\d|3[01])\.|100\.\d+\.\d+\.\d+/.test(url);
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
      web_public: f.web_public ?? false,
    }));
  }

  /**
   * Upload a file to the hub.
   * POST /api/files?is_public=<bool> with multipart/form-data.
   * Private files ≤ 100 MB are transparently client-side encrypted before upload.
   * Large files stream directly — no in-browser buffering.
   * onProgress receives 0–100 percent as the upload proceeds.
   */
  async uploadFile(
    hubSlug: string,
    file: File,
    isPublic: boolean,
    onProgress?: (percent: number) => void,
  ): Promise<HubFile> {
    const connection = this.getHubConnection(hubSlug);
    if (!connection) throw new Error(`No hub found with slug: ${hubSlug}`);
    if (!connection.hub.tunnelUrl) throw new Error('Hub has no tunnel URL');

    let uploadFile = file;

    // Encrypt private files client-side — skip for large files to avoid
    // loading gigabytes into the JS heap. Streaming encryption is a future task.
    const ENCRYPTION_SIZE_LIMIT = 100 * 1024 * 1024; // 100 MB
    if (!isPublic && file.size <= ENCRYPTION_SIZE_LIMIT) {
      try {
        const buf = await file.arrayBuffer();
        const encBuf = await encryptFileBuffer(hubSlug, buf);
        if (encBuf) {
          uploadFile = new File([encBuf], file.name, { type: file.type });
        }
      } catch { /* fall back to unencrypted upload */ }
    }

    const formData = new FormData();
    formData.append('file', uploadFile);

    // Use XHR instead of fetch so we get upload progress events.
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      const url = `${connection.hub.tunnelUrl}/api/files?is_public=${isPublic}`;
      xhr.open('POST', url);
      if (connection.user?.authToken) {
        xhr.setRequestHeader('Authorization', `Bearer ${connection.user.authToken}`);
      }

      if (onProgress) {
        xhr.upload.addEventListener('progress', (e) => {
          if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
        });
      }

      xhr.addEventListener('load', () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const data = JSON.parse(xhr.responseText);
            resolve({
              id: String(data.file_id || data.id || ''),
              name: data.file_name || file.name,
              size: Number(data.size_bytes || file.size || 0),
              mime_type: file.type || undefined,
              is_public: isPublic,
              web_public: false,
              owner_id: connection.user?.hubUserId || undefined,
              uploaded_at: new Date().toISOString(),
            });
          } catch {
            reject(new Error('Invalid response from server'));
          }
        } else {
          let msg = `Upload failed (${xhr.status})`;
          try { msg = JSON.parse(xhr.responseText)?.error || msg; } catch { /* ignore */ }
          reject(new Error(msg));
        }
      });

      xhr.addEventListener('error', () => reject(new Error('Upload failed')));
      xhr.addEventListener('abort', () => reject(new Error('Upload cancelled')));

      xhr.send(formData);
    });
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
   * Set a file's visibility tier.
   * 'private' — owner only (requires auth)
   * 'hub'     — all hub members can see it in the Shared tab (requires auth)
   * 'web'     — anyone with the link, no account needed
   */
  async setFileVisibility(
    hubSlug: string,
    fileName: string,
    visibility: 'private' | 'hub' | 'web',
  ): Promise<void> {
    const connection = this.getHubConnection(hubSlug);
    if (!connection) throw new Error(`No hub found with slug: ${hubSlug}`);
    if (!connection.hub.tunnelUrl) throw new Error('Hub has no tunnel URL');

    const { headers } = this.getAuthHeaders(hubSlug);

    const response = await fetch(
      `${connection.hub.tunnelUrl}/api/files/${encodeURIComponent(fileName)}`,
      {
        method: 'PATCH',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ visibility }),
      },
    );

    if (!response.ok) {
      const body = await response.text();
      throw new Error(body || `Set visibility failed (${response.status})`);
    }
  }

  /**
   * Returns a shareable link for a web_public file.
   * Always a root-domain citinet.cloud URL (no hub subdomain) so it opens the
   * ShareFilePage without requiring any hub account. The page then resolves the
   * hub's tunnel URL and offers a direct download.
   *
   * Example: https://citinet.cloud/share/myhub/video.mp4
   *          http://localhost:3001/share/myhub/video.mp4  (local dev)
   */
  getPublicShareLink(hubSlug: string, fileName: string): string {
    const conn = this.getHubConnection(hubSlug);
    const publicUrl = conn?.hub?.publicTunnelUrl;

    if (publicUrl) {
      // Tailscale HTTPS tunnel → works for anyone on the internet
      const base = import.meta.env.VITE_APP_URL ?? 'https://citinet.cloud';
      return `${base}/share/${hubSlug}/${encodeURIComponent(fileName)}?src=${encodeURIComponent(publicUrl)}`;
    }

    // No Tailscale — build a LAN-accessible link by replacing localhost/127.0.0.1
    // with the hub's actual LAN IP so other devices on the same network can reach it.
    const lanIp = conn?.hub?.lanIp;
    const swapLocal = (url: string) =>
      lanIp ? url.replace(/localhost|127\.0\.0\.1/, lanIp) : url;

    const srcUrl = swapLocal(conn?.hub?.tunnelUrl ?? '');
    const base = swapLocal(window.location.origin);
    const src = srcUrl && !this.isShellUrl(srcUrl) ? `?src=${encodeURIComponent(srcUrl)}` : '';
    return `${base}/share/${hubSlug}/${encodeURIComponent(fileName)}${src}`;
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
   * Download a file from the hub.
   * Gets a short-lived one-time token from the server, then opens
   *   GET /api/files/:name/download?token=xxx
   * directly in the browser so native HTTP streaming handles the transfer —
   * no JS memory buffering, works for files of any size.
   * Falls back to blob download only for encrypted small files (≤ 100 MB)
   * where client-side decryption is needed.
   */
  downloadFile(hubSlug: string, fileName: string): void {
    const connection = this.getHubConnection(hubSlug);
    const authToken = connection?.user?.authToken;
    const baseUrl = connection?.hub.tunnelUrl;
    if (!baseUrl) return;

    if (!authToken) {
      // Unauthenticated — only public files are accessible
      window.open(`${baseUrl}/api/public/files/${encodeURIComponent(fileName)}`, '_blank');
      return;
    }

    // Request a short-lived download token, then let the browser stream natively.
    fetch(`${baseUrl}/api/files/${encodeURIComponent(fileName)}/token`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${authToken}` },
    })
      .then(res => {
        if (!res.ok) throw new Error(`Token request failed (${res.status})`);
        return res.json();
      })
      .then(({ token: dlToken }) => {
        const dlUrl = `${baseUrl}/api/files/${encodeURIComponent(fileName)}/download?token=${dlToken}`;
        const a = document.createElement('a');
        a.href = dlUrl;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      })
      .catch(err => console.error('Download error:', err));
  }

  /**
   * Returns a streaming URL for a private file using a short-lived token.
   * The URL is valid for 1 hour and supports Range requests (video seeking, resumable downloads).
   * Use this for large files to avoid loading them into browser memory.
   */
  async getFileStreamUrl(hubSlug: string, fileName: string): Promise<string> {
    const connection = this.getHubConnection(hubSlug);
    const authToken = connection?.user?.authToken;
    const baseUrl = connection?.hub.tunnelUrl;
    if (!baseUrl) throw new Error('Hub not connected');

    const res = await fetch(`${baseUrl}/api/files/${encodeURIComponent(fileName)}/token`, {
      method: 'POST',
      headers: authToken ? { 'Authorization': `Bearer ${authToken}` } : {},
    });
    if (!res.ok) throw new Error(`Failed to get stream URL (${res.status})`);
    const { token } = await res.json();
    return `${baseUrl}/api/files/${encodeURIComponent(fileName)}/download?token=${token}`;
  }

  /**
   * Fetch a file from the hub as a blob URL (for lightbox preview).
   * Transparently decrypts client-side encrypted files.
   * For files > 100 MB use getFileStreamUrl() instead — this method buffers the
   * entire file into browser memory and will crash for large files.
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
    post: { category: string; title: string; body: string; mediaFile?: File; eventDate?: string; eventLocation?: string }
  ): Promise<HubPost> {
    const connection = this.getHubConnection(hubSlug);
    if (!connection?.hub.tunnelUrl) throw new Error('Hub has no tunnel URL');

    const formData = new FormData();
    formData.append('category', post.category);
    formData.append('title', post.title);
    formData.append('body', post.body);
    if (post.mediaFile) formData.append('media', post.mediaFile);
    if (post.eventDate) formData.append('event_date', post.eventDate);
    if (post.eventLocation) formData.append('event_location', post.eventLocation);

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

  /** Fetch upcoming EVENT posts sorted by event_date ascending. */
  async getUpcomingEvents(hubSlug: string, limit = 3): Promise<HubPost[]> {
    try {
      const { headers, tunnelUrl } = this.getAuthHeaders(hubSlug);
      // Try the dedicated endpoint first; fall back to the posts endpoint with client-side filtering
      const dedicated = await fetch(`${tunnelUrl}/api/events/upcoming?limit=${limit}`, { headers });
      if (dedicated.ok) {
        const data = await dedicated.json();
        const events: HubPost[] = data.events ?? [];
        if (events.length > 0) return events;
      }
      // Fallback: fetch all recent posts filtered to EVENT category, then filter + sort client-side
      const fallback = await fetch(`${tunnelUrl}/api/posts?category=EVENT&limit=50`, { headers });
      if (!fallback.ok) return [];
      const data = await fallback.json();
      const posts: HubPost[] = data.posts ?? [];
      const cutoff = Date.now() - 2 * 3600 * 1000; // 2-hour grace window
      return posts
        .filter(p => p.event_date && new Date(p.event_date).getTime() >= cutoff)
        .sort((a, b) => new Date(a.event_date!).getTime() - new Date(b.event_date!).getTime())
        .slice(0, limit);
    } catch {
      return [];
    }
  }

  /** Delete a post (author or admin only). */
  async deletePost(hubSlug: string, postId: string): Promise<void> {
    const { headers, tunnelUrl } = this.getAuthHeaders(hubSlug);
    const response = await fetch(`${tunnelUrl}/api/posts/${postId}`, { method: 'DELETE', headers });
    if (!response.ok && response.status !== 204) await this.parseErrorResponse(response, hubSlug);
  }

  /** Update a post — text, media (add/replace/remove), and event fields. */
  async updatePost(
    hubSlug: string,
    postId: string,
    updates: { title?: string; body?: string; mediaFile?: File; removeMedia?: boolean; eventDate?: string; eventLocation?: string }
  ): Promise<HubPost> {
    const { headers, tunnelUrl } = this.getAuthHeaders(hubSlug);
    const formData = new FormData();
    if (updates.title !== undefined) formData.append('title', updates.title);
    if (updates.body !== undefined) formData.append('body', updates.body);
    if (updates.mediaFile) formData.append('media', updates.mediaFile);
    if (updates.removeMedia) formData.append('remove_media', 'true');
    if (updates.eventDate) formData.append('event_date', updates.eventDate);
    if (updates.eventLocation !== undefined) formData.append('event_location', updates.eventLocation);
    // No Content-Type header — browser sets multipart boundary automatically
    const response = await fetch(`${tunnelUrl}/api/posts/${postId}`, {
      method: 'PATCH',
      headers,
      body: formData,
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
      // Notify the app so HubContext can clear currentUser and redirect to login.
      window.dispatchEvent(new CustomEvent('citinet:session-expired', { detail: { hubSlug } }));
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
    fields: { name?: string; location?: string; lat?: number; lng?: number; description?: string; enabledApps?: string[] | null },
  ): Promise<Hub> {
    const { headers, tunnelUrl } = this.getAuthHeaders(slug);
    const connections = this.getAllHubConnections();
    const connection = connections[slug];
    if (!connection) throw new Error(`No hub found with slug: ${slug}`);

    // Persist to server (best-effort — don't block on failure)
    if (tunnelUrl) {
      const body: Record<string, unknown> = {};
      if (fields.name         !== undefined) body.name         = fields.name;
      if (fields.location     !== undefined) body.location     = fields.location;
      if (fields.description  !== undefined) body.description  = fields.description;
      if (fields.enabledApps  !== undefined) body.enabled_apps = fields.enabledApps;
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
    if (fields.enabledApps !== undefined) connection.hub.enabledApps = fields.enabledApps;
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

  async updateNote(hubSlug: string, noteId: string, patch: Partial<Pick<HubNote, 'title' | 'body_plain' | 'body_rich' | 'web_body_plain' | 'web_body_rich' | 'is_pinned' | 'is_archived' | 'is_public' | 'is_blog_published' | 'color'>>): Promise<HubNote> {
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

  /**
   * Set or revoke web-public access for a note.
   * When enabling, pass the *decrypted* note content so the server can store
   * a cleartext copy for the public endpoint (encrypted notes are never exposed
   * in cipher form — the server only gets plaintext for the web-public snapshot).
   */
  async setNoteWebPublic(
    hubSlug: string,
    noteId: string,
    isWebPublic: boolean,
    clearContent?: { body_plain: string; body_rich?: object | null },
  ): Promise<HubNote> {
    const conn = this.getHubConnection(hubSlug);
    if (!conn) throw new Error('Not connected');
    const patch: Record<string, unknown> = { is_web_public: isWebPublic };
    if (isWebPublic && clearContent) {
      patch.web_body_plain = clearContent.body_plain;
      patch.web_body_rich = clearContent.body_rich ?? null;
    } else if (!isWebPublic) {
      patch.web_body_plain = null;
      patch.web_body_rich = null;
    }
    const res = await fetch(`${conn.hub.tunnelUrl}/api/notes/${noteId}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${conn.user.authToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    if (!res.ok) throw new Error('Failed to update note visibility');
    return this.maybeDecryptNote(hubSlug, await res.json() as HubNote);
  }

  /** Returns a share link that embeds the hub's public tunnel URL as ?src=.
   *  Tailscale configured → citinet.cloud HTTPS link, works for anyone on the internet.
   *  No Tailscale → LAN-accessible link using the hub's lanIp instead of localhost,
   *  so other devices on the same network can open it without manual URL editing. */
  getPublicNoteLink(hubSlug: string, noteId: string): string {
    const conn = this.getHubConnection(hubSlug);
    const publicUrl = conn?.hub?.publicTunnelUrl;

    if (publicUrl) {
      const base = import.meta.env.VITE_APP_URL ?? 'https://citinet.cloud';
      return `${base}/share-note/${hubSlug}/${noteId}?src=${encodeURIComponent(publicUrl)}`;
    }

    // No public tunnel URL available — don't embed a private address in the link.
    const base = import.meta.env.VITE_APP_URL ?? 'https://citinet.cloud';
    return `${base}/share-note/${hubSlug}/${noteId}`;
  }

  async getPublicNotes(hubSlug: string, userId: string): Promise<HubNote[]> {
    const conn = this.getHubConnection(hubSlug);
    if (!conn) throw new Error('Not connected');
    const res = await fetch(`${conn.hub.tunnelUrl}/api/members/${userId}/public-notes`, {
      headers: { Authorization: `Bearer ${conn.user.authToken}` },
    });
    if (!res.ok) throw new Error('Failed to fetch public notes');
    const data = await res.json() as { notes: HubNote[] };
    const decryptedNotes = await Promise.all(
      data.notes.map(note => this.maybeDecryptNote(hubSlug, note))
    );
    return decryptedNotes.filter(note => note.id);
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
