/**
 * Hub Service for Citinet
 * 
 * Manages hub connections, persistence, and API communication.
 * Currently uses localStorage + direct fetch to hub tunnel URLs.
 *
 * Future: Will integrate with centralized hub registry
 */

import type { Hub, HubConnection, HubConnectionStatus, HubInfoResponse, HubStatusResponse, HubUser, HubMeta, HubAuthCredentials, HubFile, HubMember, HubConversation, HubParticipant, HubMessage, HubMessageAttachment, HubMessageReaction, HubConversationMediaItem, HubPost, HubPostReply, HubNote, HubEventAttendee, HubIconFields, SearchResults, CallMode, CallTokenResponse, LiveCommsItem, HubCallEvent } from '../types/hub';
import { generateUserKeys, hasKeys, clearKeys, getStoredPublicKeyJwk, generateRecoveryPhrase, encryptNoteBody, decryptNoteBody, isNoteEncrypted, createKeyBackup, restoreKeyBackup, encryptMessage, decryptMessage, isMessageEncrypted, encryptFileBuffer, decryptFileBuffer, isFileEncrypted } from '../utils/crypto';
import type { KeyBackupPayload } from '../utils/crypto';
import { clearIndexForHub } from './messageSearchIndex';

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
    // Prefer the stable hub_slug the server reports over a slugified display name,
    // so renaming the hub (which changes 'name') doesn't orphan the localStorage key.
    const slug = probeInfo?.hub_slug ? this.slugify(probeInfo.hub_slug) : this.slugify(hubName);

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
      lat: probeInfo?.lat,
      lng: probeInfo?.lng,
      hubFocus: probeInfo?.hub_focus,
      joinApprovalMode: probeInfo?.join_approval_mode,
      description: probeInfo?.description,
      memberCount: probeStatus?.user_count,
      connectionStatus: probeInfo ? 'connected' : 'disconnected',
      joinedAt: new Date().toISOString(),
      lastConnectedAt: probeInfo ? new Date().toISOString() : undefined,
      lanIp: probeInfo?.lan_ip || undefined,
      enabledApps: probeInfo?.enabled_apps ?? null,
      hub_icon_mode: probeInfo?.hub_icon_mode,
      hub_icon_symbol: probeInfo?.hub_icon_symbol,
      hub_icon_bg_mode: probeInfo?.hub_icon_bg_mode,
      hub_icon_gradient_from: probeInfo?.hub_icon_gradient_from,
      hub_icon_gradient_to: probeInfo?.hub_icon_gradient_to,
      hub_icon_solid_color: probeInfo?.hub_icon_solid_color,
      hub_icon_image_file_name: probeInfo?.hub_icon_image_file_name,
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
        displayName: credentials.displayName || '',
        tags: credentials.tags || [],
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
      accountStatus: result.status || undefined,
      avatarUrl: result.avatar_url || undefined,
      location: result.location || undefined,
      bio: result.bio || undefined,
      email: result.email || credentials.email || undefined,
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
      accountStatus: result.status || undefined,
      avatarUrl: result.avatar_url || undefined,
      location: result.location || undefined,
      bio: result.bio || undefined,
      email: result.email || undefined,
    };

    await this.completeOnboarding(hubSlug, userData);
    return userData;
  }

  /** Re-checks join-approval status for the current hub without needing to
   * re-enter credentials. Used by the pending-approval screen's "Check again". */
  async checkAccountStatus(hubSlug: string): Promise<'approved' | 'pending' | 'rejected' | null> {
    const connection = this.getHubConnection(hubSlug);
    const token = connection?.user?.authToken;
    if (!connection?.hub.tunnelUrl || !token) return null;
    try {
      const res = await fetch(`${connection.hub.tunnelUrl}/api/auth/session-status`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return null;
      const { status } = await res.json();
      if (connection.user) {
        connection.user.accountStatus = status;
        await this.completeOnboarding(hubSlug, connection.user);
      }
      return status ?? null;
    } catch {
      return null;
    }
  }

  /** List accounts awaiting join approval (admin only). */
  async listPendingUsers(hubSlug: string): Promise<Array<{ user_id: string; username: string; email: string | null; created_at: string }>> {
    const { headers, tunnelUrl } = this.getAuthHeaders(hubSlug);
    const res = await fetch(`${tunnelUrl}/api/admin/pending-users`, { headers });
    if (!res.ok) await this.parseErrorResponse(res, hubSlug);
    const { pending } = await res.json();
    return pending;
  }

  /** Approve a pending account (admin only). */
  async approvePendingUser(hubSlug: string, userId: string): Promise<void> {
    const { headers, tunnelUrl } = this.getAuthHeaders(hubSlug);
    const res = await fetch(`${tunnelUrl}/api/admin/pending-users/${encodeURIComponent(userId)}/approve`, {
      method: 'POST',
      headers,
    });
    if (!res.ok) await this.parseErrorResponse(res, hubSlug);
  }

  /** Reject a pending account (admin only). */
  async rejectPendingUser(hubSlug: string, userId: string): Promise<void> {
    const { headers, tunnelUrl } = this.getAuthHeaders(hubSlug);
    const res = await fetch(`${tunnelUrl}/api/admin/pending-users/${encodeURIComponent(userId)}/reject`, {
      method: 'POST',
      headers,
    });
    if (!res.ok) await this.parseErrorResponse(res, hubSlug);
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
      locationVisible?: boolean;
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
    if (updates.locationVisible    !== undefined) body.location_visible     = updates.locationVisible;

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
      locationVisible:    updates.locationVisible,
    });
  }

  /** Update visibility on a single post without touching any other fields. */
  async updatePostVisibility(hubSlug: string, postId: string, visibility: 'inherit' | 'hub' | 'private'): Promise<void> {
    const { headers, tunnelUrl } = this.getAuthHeaders(hubSlug);
    const formData = new FormData();
    formData.append('visibility', visibility);
    const res = await fetch(`${tunnelUrl}/api/posts/${postId}`, {
      method: 'PATCH',
      headers, // no Content-Type — browser sets multipart boundary
      body: formData,
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

  /** Check if user has completed registration for a hub and has a valid session token. */
  isOnboarded(hubSlug: string): boolean {
    const connection = this.getHubConnection(hubSlug);
    return !!(connection?.user?.username && connection?.user?.authToken);
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
    updates: Partial<Pick<HubUser, 'displayName' | 'email' | 'location' | 'bio' | 'tags' | 'avatarUrl' | 'profileHeadline' | 'website' | 'bannerMode' | 'bannerColor' | 'bannerGradientFrom' | 'bannerGradientTo' | 'bannerImageFileName' | 'profileVisibility' | 'locationVisible'>>
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

  /**
   * Lightweight sign-out: invalidates the server session token and clears the
   * local auth token, but keeps the hub connection and profile (username,
   * tags, bio, etc.) intact so the user can log back in without re-entering
   * the hub URL. Use leaveHub() to fully disconnect from the hub instead.
   */
  signOut(slug: string): void {
    const connections = this.getAllHubConnections();
    const conn = connections[slug];
    if (!conn) return;

    if (conn.hub?.tunnelUrl && conn.user?.authToken) {
      fetch(`${conn.hub.tunnelUrl}/api/auth/logout`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${conn.user.authToken}` },
      }).catch(() => {});
    }

    connections[slug] = { hub: conn.hub, user: { ...conn.user, authToken: undefined } };
    localStorage.setItem(STORAGE_KEYS.HUBS, JSON.stringify(connections));
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
    // Clear encryption keys from IndexedDB on logout. Compute scope from the
    // about-to-be-deleted connection since it won't be resolvable afterward.
    clearKeys(this.keyScope(slug, conn?.user?.hubUserId)).catch(() => {});
    // Same privacy hygiene for the local full-history search index — it's
    // full of decrypted message content, so it leaves with the account.
    clearIndexForHub(slug).catch(() => {});

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
      // Sync hub icon fields the same way — so an admin's icon change reaches
      // other already-joined members on their next periodic refresh, not just
      // the admin's own session (which updates immediately via HubContext).
      if (result.info?.hub_icon_mode !== undefined) { connections[slug].hub.hub_icon_mode = result.info.hub_icon_mode; dirty = true; }
      if (result.info?.hub_icon_symbol !== undefined) { connections[slug].hub.hub_icon_symbol = result.info.hub_icon_symbol; dirty = true; }
      if (result.info?.hub_icon_bg_mode !== undefined) { connections[slug].hub.hub_icon_bg_mode = result.info.hub_icon_bg_mode; dirty = true; }
      if (result.info?.hub_icon_gradient_from !== undefined) { connections[slug].hub.hub_icon_gradient_from = result.info.hub_icon_gradient_from; dirty = true; }
      if (result.info?.hub_icon_gradient_to !== undefined) { connections[slug].hub.hub_icon_gradient_to = result.info.hub_icon_gradient_to; dirty = true; }
      if (result.info?.hub_icon_solid_color !== undefined) { connections[slug].hub.hub_icon_solid_color = result.info.hub_icon_solid_color; dirty = true; }
      if (result.info?.hub_icon_image_file_name !== undefined) { connections[slug].hub.hub_icon_image_file_name = result.info.hub_icon_image_file_name; dirty = true; }
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
      display_name: m.display_name ?? null,
      location: m.location ?? null,
      location_visible: m.location_visible ?? null,
      last_seen_at: m.last_seen_at ?? null,
      bio: m.bio ?? null,
      tags: m.tags ?? null,
      is_admin:  Boolean(m.is_admin || m.isAdmin || false),
      role:      (m.role as 'admin' | 'moderator' | 'member') ?? (m.is_admin ? 'admin' : 'member'),
      created_at: m.created_at || m.createdAt || m.joined_at || '',
      avatar_url: m.avatar_url ?? null,
      profile_headline: m.profile_headline ?? null,
      banner_mode: m.banner_mode ?? null,
      banner_color: m.banner_color ?? null,
      banner_gradient_from: m.banner_gradient_from ?? null,
      banner_gradient_to: m.banner_gradient_to ?? null,
      banner_image_file_name: m.banner_image_file_name ?? null,
      website: m.website ?? null,
      profile_visibility: m.profile_visibility ?? null,
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
      const membersList: HubParticipant[] = (raw.members || conv.members || conv.participants || []).map((p: any) => ({
        user_id: p.user_id || p.id || '',
        username: p.username || p.name || 'Unknown',
        last_read_at: p.last_read_at || null,
      }));
      const lastMsg = raw.last_message || conv.last_message;
      const convoId: string = conv.conversation_id || conv.id || '';
      const kind: 'dm' | 'group' = conv.kind === 'dm' ? 'dm' : 'group';

      let lastMessageBody: string = lastMsg ? (lastMsg.body || lastMsg.content || lastMsg.text || '') : '';
      if (lastMsg && kind === 'dm' && membersList.length === 2 && isMessageEncrypted(lastMessageBody)) {
        try {
          const peerKey = await this.resolveDmPeerKey(hubSlug, membersList);
          lastMessageBody = peerKey
            ? await decryptMessage(this.keyScope(hubSlug), peerKey, convoId, lastMessageBody)
            : '🔒 Encrypted message';
        } catch {
          // Key lookup itself failed (network/tunnel) — next poll retries automatically.
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
    let peerKeyLookupFailed = false;
    if (members && members.length === 2) {
      try {
        peerKey = await this.resolveDmPeerKey(hubSlug, members);
      } catch (err) {
        console.error('[e2e-keys] resolveDmPeerKey failed in getMessages', { conversationId, err });
        peerKeyLookupFailed = true;
      }
    }

    return Promise.all(rawMsgs.map(async (m: any) => {
      const rawBody: string = m.body || m.content || m.text || '';
      let body = rawBody;
      if (isMessageEncrypted(rawBody)) {
        if (peerKey) {
          body = await decryptMessage(this.keyScope(hubSlug), peerKey, conversationId, rawBody);
        } else {
          // Never show raw ciphertext JSON — either the peer genuinely has no key
          // (rare/legacy) or the lookup itself failed transiently and the next
          // 10s poll will retry and self-heal.
          body = peerKeyLookupFailed
            ? '[Message unavailable — retrying…]'
            : '[Encrypted message]';
        }
      }
      return {
        id: m.message_id || m.id || '',
        conversation_id: m.conversation_id || conversationId,
        sender_id: m.sender_id || m.user_id || '',
        sender_username: m.sender_username || m.username || undefined,
        body,
        attachments: this.normalizeAttachments(m.attachments),
        reactions: this.normalizeReactions(m.reactions),
        created_at: m.created_at || '',
      };
    }));
  }

  /** All files ever shared in a conversation — powers the "shared media" gallery. */
  async getConversationMedia(hubSlug: string, conversationId: string): Promise<HubConversationMediaItem[]> {
    const { headers, tunnelUrl } = this.getAuthHeaders(hubSlug);
    const res = await fetch(`${tunnelUrl}/api/conversations/${conversationId}/media`, { headers });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(body || `Failed to load shared media (${res.status})`);
    }
    const data = await res.json();
    const raw: any[] = Array.isArray(data) ? data : (data.media || []);
    return raw.map((m: any) => ({
      file_id: m.file_id,
      file_name: m.file_name,
      mime_type: m.mime_type,
      size: Number(m.size || 0),
      message_id: m.message_id,
      sender_id: m.sender_id,
      sender_username: m.sender_username || undefined,
      created_at: m.created_at,
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
      let peerKey: string | null;
      try {
        peerKey = await this.resolveDmPeerKey(hubSlug, members);
      } catch (err) {
        console.error('[e2e-keys] resolveDmPeerKey failed in sendMessage', { conversationId, err });
        // Don't silently send this DM as plaintext just because a transient key
        // lookup failed — fail the send visibly so the user can retry instead.
        throw new Error("Couldn't verify the recipient's encryption key — check your connection and try again.");
      }
      if (peerKey) {
        encryptedBody = await encryptMessage(this.keyScope(hubSlug), peerKey, conversationId, messageBody);
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
      let peerKey: string | null;
      try {
        peerKey = await this.resolveDmPeerKey(hubSlug, members);
      } catch (err) {
        console.error('[e2e-keys] resolveDmPeerKey failed in sendMessageWithMedia', { conversationId, err });
        throw new Error("Couldn't verify the recipient's encryption key — check your connection and try again.");
      }
      if (peerKey && encryptedBody) {
        encryptedBody = await encryptMessage(this.keyScope(hubSlug), peerKey, conversationId, encryptedBody);
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

  /** Normalize reaction aggregates from the hub API */
  private normalizeReactions(raw: any): HubMessageReaction[] | undefined {
    if (!raw || !Array.isArray(raw) || raw.length === 0) return undefined;
    return raw.map((r: any) => ({
      emoji: r.emoji,
      count: Number(r.count || 0),
      reacted_by_me: !!r.reacted_by_me,
    }));
  }

  /** Toggle a reaction on a message — adds it if the user hasn't reacted with that
   *  emoji yet, removes it if they have. Returns the message's updated reaction list. */
  async toggleReaction(hubSlug: string, messageId: string, emoji: string): Promise<{ reacted: boolean; reactions: HubMessageReaction[] }> {
    const { headers, tunnelUrl } = this.getAuthHeaders(hubSlug);
    const res = await fetch(`${tunnelUrl}/api/messages/${messageId}/reactions`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ emoji }),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(body || `Failed to react (${res.status})`);
    }
    const data = await res.json();
    return { reacted: !!data.reacted, reactions: this.normalizeReactions(data.reactions) || [] };
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

  /** Signal "I am typing" in a conversation. Fire-and-forget — callers should throttle. */
  async sendTypingSignal(hubSlug: string, conversationId: string): Promise<void> {
    const { headers, tunnelUrl } = this.getAuthHeaders(hubSlug);
    await fetch(`${tunnelUrl}/api/conversations/${conversationId}/typing`, {
      method: 'POST',
      headers,
    }).catch(() => {});
  }

  /** User IDs currently typing in a conversation (excluding the caller). */
  async getTypingUsers(hubSlug: string, conversationId: string): Promise<string[]> {
    const { headers, tunnelUrl } = this.getAuthHeaders(hubSlug);
    const res = await fetch(`${tunnelUrl}/api/conversations/${conversationId}/typing`, { headers });
    if (!res.ok) return [];
    const data = await res.json().catch(() => null);
    return Array.isArray(data?.typing_user_ids) ? data.typing_user_ids : [];
  }

  // ──────────────────────────────────────────────
  // Comms — 1:1 calls, broadcasts, rooms (api/comms.js)
  // ──────────────────────────────────────────────

  /** Start (or re-ring) a 1:1 call. Returns the caller's own token immediately. */
  async ringCall(hubSlug: string, conversationId: string, peerId: string, mode: CallMode): Promise<CallTokenResponse & { call_id: string }> {
    const { headers, tunnelUrl } = this.getAuthHeaders(hubSlug);
    const res = await fetch(`${tunnelUrl}/api/comms/call/ring`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ conversation_id: conversationId, peer_id: peerId, mode }),
    });
    if (!res.ok) await this.parseErrorResponse(res, hubSlug);
    return res.json();
  }

  /** Callee accepts an incoming call. */
  async answerCall(hubSlug: string, callId: string): Promise<CallTokenResponse> {
    const { headers, tunnelUrl } = this.getAuthHeaders(hubSlug);
    const res = await fetch(`${tunnelUrl}/api/comms/call/${callId}/answer`, { method: 'POST', headers });
    if (!res.ok) await this.parseErrorResponse(res, hubSlug);
    return res.json();
  }

  /** Callee declines before answering. */
  async declineCall(hubSlug: string, callId: string): Promise<void> {
    const { headers, tunnelUrl } = this.getAuthHeaders(hubSlug);
    await fetch(`${tunnelUrl}/api/comms/call/${callId}/decline`, { method: 'POST', headers }).catch(() => {});
  }

  /** Either side hangs up. */
  async endCall(hubSlug: string, callId: string): Promise<void> {
    const { headers, tunnelUrl } = this.getAuthHeaders(hubSlug);
    await fetch(`${tunnelUrl}/api/comms/call/${callId}/end`, { method: 'POST', headers }).catch(() => {});
  }

  /** Mint a token for a broadcast/room — creates it if room_name is omitted. */
  async getCommsToken(
    hubSlug: string,
    kind: 'broadcast' | 'room',
    roomName?: string,
    title?: string,
    preview?: boolean,
  ): Promise<CallTokenResponse> {
    const { headers, tunnelUrl } = this.getAuthHeaders(hubSlug);
    const res = await fetch(`${tunnelUrl}/api/comms/token`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind, room_name: roomName, title, preview }),
    });
    if (!res.ok) await this.parseErrorResponse(res, hubSlug);
    return res.json();
  }

  /** Host force-closes a broadcast/room. */
  async endRoom(hubSlug: string, roomName: string): Promise<void> {
    const { headers, tunnelUrl } = this.getAuthHeaders(hubSlug);
    await fetch(`${tunnelUrl}/api/comms/${encodeURIComponent(roomName)}/end`, { method: 'POST', headers }).catch(() => {});
  }

  /** Every currently-active broadcast/room on this hub. */
  async listLiveComms(hubSlug: string): Promise<LiveCommsItem[]> {
    const { headers, tunnelUrl } = this.getAuthHeaders(hubSlug);
    const res = await fetch(`${tunnelUrl}/api/comms/live`, { headers });
    if (!res.ok) return [];
    const data = await res.json().catch(() => []);
    return Array.isArray(data) ? data : [];
  }

  /** Call history for a DM thread's transcript chip. */
  async getCallEvents(hubSlug: string, conversationId: string): Promise<HubCallEvent[]> {
    const { headers, tunnelUrl } = this.getAuthHeaders(hubSlug);
    const res = await fetch(`${tunnelUrl}/api/conversations/${conversationId}/call-events`, { headers });
    if (!res.ok) return [];
    const data = await res.json().catch(() => ({ call_events: [] }));
    return data.call_events || [];
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
    if (!connection.user?.authToken) throw new Error('Session expired — please log in again.');

    let uploadFile = file;

    // Encrypt private files client-side — skip for large files to avoid
    // loading gigabytes into the JS heap. Streaming encryption is a future task.
    const ENCRYPTION_SIZE_LIMIT = 100 * 1024 * 1024; // 100 MB
    if (!isPublic && file.size <= ENCRYPTION_SIZE_LIMIT) {
      try {
        const buf = await file.arrayBuffer();
        const encBuf = await encryptFileBuffer(this.keyScope(hubSlug), buf);
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

  /** Raw PATCH of the visibility flag only — does not touch stored bytes. */
  private async patchFileVisibility(
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
   * Set a file's visibility tier.
   * 'private' — owner only (requires auth)
   * 'hub'     — all hub members can see it in the Shared tab (requires auth)
   * 'web'     — anyone with the link, no account needed
   *
   * Promoting a 'private' upload straight to 'hub'/'web' used to just flip
   * the DB flag, but a private upload is client-side encrypted under the
   * owner's personal key — no other hub member's account can ever decrypt
   * that ciphertext, so the file would show up in the list but fail to
   * render for anyone but the owner. Instead of trusting the (possibly
   * stale) is_public flag, this reads the file's actual current bytes and,
   * if they're still ciphertext, decrypts them on this device and replaces
   * the stored copy with plaintext before exposing it more broadly. Throws
   * if this device can't decrypt it (wrong device / lost key) rather than
   * silently sharing unreadable ciphertext.
   */
  async setFileVisibility(
    hubSlug: string,
    file: Pick<HubFile, 'name' | 'mime_type'>,
    visibility: 'private' | 'hub' | 'web',
  ): Promise<{ id: string } | void> {
    if (visibility === 'private') {
      await this.patchFileVisibility(hubSlug, file.name, visibility);
      return;
    }

    const url = this.getFileDownloadUrl(hubSlug, file.name);
    if (!url) throw new Error('Hub not connected');
    const { headers } = this.getAuthHeaders(hubSlug);
    const res = await fetch(url, { headers });
    if (!res.ok) throw new Error(`Failed to read file (${res.status})`);
    const buf = await res.arrayBuffer();

    if (!isFileEncrypted(buf)) {
      await this.patchFileVisibility(hubSlug, file.name, visibility);
      return;
    }

    const plainBuf = await decryptFileBuffer(this.keyScope(hubSlug), buf);
    if (!plainBuf) {
      throw new Error(
        "Can't share this file — this device doesn't have the encryption key it was uploaded with. Try sharing it from the device it was uploaded on."
      );
    }

    // Replace the encrypted copy with a plaintext one before exposing it to
    // anyone else — deleting only after the decrypt above has already
    // succeeded, so a failed decrypt never destroys the only copy.
    await this.deleteFile(hubSlug, file.name);
    const plainFile = new File([plainBuf], file.name, {
      type: file.mime_type || 'application/octet-stream',
    });
    const uploaded = await this.uploadFile(hubSlug, plainFile, true);
    if (visibility === 'web') await this.patchFileVisibility(hubSlug, file.name, 'web');
    return { id: uploaded.id };
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
      const plainBuf = await decryptFileBuffer(this.keyScope(hubSlug), buf);
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

  /** Real relevance-ranked search across posts/members/local spaces (and, for
   * mods, requests) — see GET /api/search. Initiatives/toolkit/other-hubs have
   * no local table to search and aren't part of this; callers keep filtering
   * those client-side. */
  async search(hubSlug: string, query: string, limit = 20): Promise<SearchResults> {
    const { headers, tunnelUrl } = this.getAuthHeaders(hubSlug);
    const params = new URLSearchParams({ q: query, limit: String(limit) });
    const response = await fetch(`${tunnelUrl}/api/search?${params}`, { headers });
    if (!response.ok) await this.parseErrorResponse(response, hubSlug);
    const data = await response.json();
    return {
      query: data.query ?? query,
      posts: data.results?.posts ?? [],
      members: data.results?.members ?? [],
      spaces: data.results?.spaces ?? [],
      requests: data.results?.requests ?? [],
    };
  }

  /** Fetch a single post by ID. */
  async getPost(hubSlug: string, postId: string): Promise<HubPost> {
    const { headers, tunnelUrl } = this.getAuthHeaders(hubSlug);
    const response = await fetch(`${tunnelUrl}/api/posts/${encodeURIComponent(postId)}`, { headers });
    if (!response.ok) await this.parseErrorResponse(response, hubSlug);
    return response.json();
  }

  /** Create a new post. Optionally attach an image file. For category 'POLL',
   * title is the question (required) and the poll-only fields apply. */
  async createPost(
    hubSlug: string,
    post: {
      category: string; title?: string; body: string; mediaFile?: File;
      eventDate?: string; eventLocation?: string; eventLat?: number; eventLng?: number;
      visibility?: 'inherit' | 'hub' | 'private';
      options?: string[]; closesAt?: string; requestId?: string; quorumPct?: number; passPct?: number;
    }
  ): Promise<HubPost> {
    const connection = this.getHubConnection(hubSlug);
    if (!connection?.hub.tunnelUrl) throw new Error('Hub has no tunnel URL');

    const formData = new FormData();
    formData.append('category', post.category);
    if (post.title) formData.append('title', post.title);
    formData.append('body', post.body);
    if (post.mediaFile) formData.append('media', post.mediaFile);
    if (post.eventDate) formData.append('event_date', post.eventDate);
    if (post.eventLocation) formData.append('event_location', post.eventLocation);
    if (post.eventLat !== undefined) formData.append('event_lat', String(post.eventLat));
    if (post.eventLng !== undefined) formData.append('event_lng', String(post.eventLng));
    if (post.visibility && post.visibility !== 'inherit') formData.append('visibility', post.visibility);
    if (post.options) formData.append('options', JSON.stringify(post.options));
    if (post.closesAt) formData.append('closes_at', post.closesAt);
    if (post.requestId) formData.append('request_id', post.requestId);
    if (post.quorumPct !== undefined) formData.append('quorum_pct', String(post.quorumPct));
    if (post.passPct !== undefined) formData.append('pass_pct', String(post.passPct));

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

  /** Cast (or change) a vote on a POLL-category post. */
  async votePoll(hubSlug: string, postId: string, optionIndex: number): Promise<void> {
    const { headers, tunnelUrl } = this.getAuthHeaders(hubSlug);
    const response = await fetch(`${tunnelUrl}/api/posts/${postId}/vote`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ option_index: optionIndex }),
    });
    if (!response.ok) await this.parseErrorResponse(response, hubSlug);
  }

  /** Close a POLL-category post (author or moderator/admin). */
  async closePoll(hubSlug: string, postId: string): Promise<{ passed: boolean | null }> {
    const { headers, tunnelUrl } = this.getAuthHeaders(hubSlug);
    const response = await fetch(`${tunnelUrl}/api/posts/${postId}/close`, { method: 'PATCH', headers });
    if (!response.ok) await this.parseErrorResponse(response, hubSlug);
    return response.json();
  }

  /** Reopen a closed POLL-category post (author or moderator/admin). */
  async reopenPoll(hubSlug: string, postId: string, closesAt?: string): Promise<void> {
    const { headers, tunnelUrl } = this.getAuthHeaders(hubSlug);
    const response = await fetch(`${tunnelUrl}/api/posts/${postId}/reopen`, {
      method: 'PATCH',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ closes_at: closesAt || undefined }),
    });
    if (!response.ok) await this.parseErrorResponse(response, hubSlug);
  }

  /** Edit a POLL-category post's question/options/threshold fields (author or moderator/admin). */
  async updatePoll(
    hubSlug: string,
    postId: string,
    updates: { question?: string; options?: string[]; closesAt?: string; quorumPct?: number; passPct?: number }
  ): Promise<HubPost> {
    const { headers, tunnelUrl } = this.getAuthHeaders(hubSlug);
    const response = await fetch(`${tunnelUrl}/api/posts/${postId}/poll`, {
      method: 'PATCH',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        question: updates.question,
        options: updates.options,
        closes_at: updates.closesAt,
        quorum_pct: updates.quorumPct,
        pass_pct: updates.passPct,
      }),
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
    updates: { title?: string; body?: string; mediaFile?: File; removeMedia?: boolean; eventDate?: string; eventLocation?: string; visibility?: 'inherit' | 'hub' | 'private' }
  ): Promise<HubPost> {
    const { headers, tunnelUrl } = this.getAuthHeaders(hubSlug);
    const formData = new FormData();
    if (updates.title !== undefined) formData.append('title', updates.title);
    if (updates.body !== undefined) formData.append('body', updates.body);
    if (updates.mediaFile) formData.append('media', updates.mediaFile);
    if (updates.removeMedia) formData.append('remove_media', 'true');
    if (updates.eventDate) formData.append('event_date', updates.eventDate);
    if (updates.eventLocation !== undefined) formData.append('event_location', updates.eventLocation);
    if (updates.visibility !== undefined) formData.append('visibility', updates.visibility);
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

  /** Toggle the caller's like on a post. */
  async toggleLike(hubSlug: string, postId: string): Promise<{ liked: boolean; count: number }> {
    const { headers, tunnelUrl } = this.getAuthHeaders(hubSlug);
    const response = await fetch(`${tunnelUrl}/api/posts/${postId}/like`, {
      method: 'POST',
      headers,
    });
    if (!response.ok) await this.parseErrorResponse(response, hubSlug);
    return response.json();
  }

  /** Toggle the caller's RSVP ("going") for an event post. */
  async toggleRsvp(hubSlug: string, postId: string): Promise<{ going: boolean; count: number }> {
    const { headers, tunnelUrl } = this.getAuthHeaders(hubSlug);
    const response = await fetch(`${tunnelUrl}/api/posts/${postId}/rsvp`, {
      method: 'POST',
      headers,
    });
    if (!response.ok) await this.parseErrorResponse(response, hubSlug);
    return response.json();
  }

  /** List everyone who RSVP'd "going" to an event post. */
  async listRsvps(hubSlug: string, postId: string): Promise<{ attendees: HubEventAttendee[]; count: number; going: boolean }> {
    const { headers, tunnelUrl } = this.getAuthHeaders(hubSlug);
    const response = await fetch(`${tunnelUrl}/api/posts/${postId}/rsvp`, { headers });
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
    fields: Partial<HubIconFields> & { name?: string; location?: string; lat?: number; lng?: number; description?: string; enabledApps?: string[] | null; joinApprovalMode?: 'admin' | 'member_vote' },
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
      if (fields.lat          !== undefined) body.lat          = fields.lat;
      if (fields.lng          !== undefined) body.lng          = fields.lng;
      if (fields.description  !== undefined) body.description  = fields.description;
      if (fields.enabledApps  !== undefined) body.enabled_apps = fields.enabledApps;
      if (fields.joinApprovalMode !== undefined) body.join_approval_mode = fields.joinApprovalMode;
      if (fields.hub_icon_mode              !== undefined) body.hub_icon_mode              = fields.hub_icon_mode;
      if (fields.hub_icon_symbol            !== undefined) body.hub_icon_symbol            = fields.hub_icon_symbol;
      if (fields.hub_icon_bg_mode           !== undefined) body.hub_icon_bg_mode           = fields.hub_icon_bg_mode;
      if (fields.hub_icon_gradient_from     !== undefined) body.hub_icon_gradient_from     = fields.hub_icon_gradient_from;
      if (fields.hub_icon_gradient_to       !== undefined) body.hub_icon_gradient_to       = fields.hub_icon_gradient_to;
      if (fields.hub_icon_solid_color       !== undefined) body.hub_icon_solid_color       = fields.hub_icon_solid_color;
      if (fields.hub_icon_image_file_name   !== undefined) body.hub_icon_image_file_name   = fields.hub_icon_image_file_name;
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
    if (fields.joinApprovalMode !== undefined) connection.hub.joinApprovalMode = fields.joinApprovalMode;
    if (fields.lng         !== undefined) connection.hub.lng         = fields.lng;
    if (fields.description !== undefined) connection.hub.description = fields.description;
    if (fields.enabledApps !== undefined) connection.hub.enabledApps = fields.enabledApps;
    if (fields.hub_icon_mode            !== undefined) connection.hub.hub_icon_mode            = fields.hub_icon_mode;
    if (fields.hub_icon_symbol          !== undefined) connection.hub.hub_icon_symbol          = fields.hub_icon_symbol;
    if (fields.hub_icon_bg_mode         !== undefined) connection.hub.hub_icon_bg_mode         = fields.hub_icon_bg_mode;
    if (fields.hub_icon_gradient_from   !== undefined) connection.hub.hub_icon_gradient_from   = fields.hub_icon_gradient_from;
    if (fields.hub_icon_gradient_to     !== undefined) connection.hub.hub_icon_gradient_to     = fields.hub_icon_gradient_to;
    if (fields.hub_icon_solid_color     !== undefined) connection.hub.hub_icon_solid_color     = fields.hub_icon_solid_color;
    if (fields.hub_icon_image_file_name !== undefined) connection.hub.hub_icon_image_file_name = fields.hub_icon_image_file_name;
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
   * Composite IndexedDB namespace for this account's local key material.
   * crypto.ts's internal `slot(x, name)` just does `${x}:${name}` — it never
   * inspects `x` beyond using it as an opaque prefix — so passing a
   * `hubSlug:userId` composite instead of a bare `hubSlug` scopes storage
   * per (hub, account) without any change to crypto.ts.
   *
   * This matters because crypto.ts's key slots used to be keyed by hubSlug
   * alone ("one set per hub, so multi-hub works" — but nothing accounted for
   * multiple *accounts* on the same hub sharing one browser). Two accounts on
   * the same hub, same device, would silently share one IndexedDB slot: log
   * into account B after account A, and `hasKeys()` would report "already
   * set up" using account A's leftover keys, which then get re-registered to
   * the server *as account B's public key* — permanently mixing up whose
   * messages decrypt with what. See [[e2e_encryption]] memory for the full
   * incident writeup.
   *
   * Pass `userId` explicitly when the connection is about to be torn down
   * (e.g. leaveHub, which deletes the stored connection right after clearing
   * keys) so the scope can still be computed correctly.
   */
  private keyScope(hubSlug: string, userId?: string): string {
    const uid = userId ?? this.getHubConnection(hubSlug)?.user?.hubUserId;
    return uid ? `${hubSlug}:${uid}` : hubSlug;
  }

  /**
   * Checks this device's encryption-key state after login. Never blocks auth
   * — callers decide what to do with the result:
   *   'has-keys'           — this device is already set up and a backup exists
   *                          on the server; public key re-synced.
   *   'has-keys-new-backup'— this device has keys but the account had NO
   *                          server-side backup at all -- a critical gap: the
   *                          moment local keys are the only copy anywhere and
   *                          get wiped (e.g. by logout, which always clears
   *                          them), they're gone for good with nothing to
   *                          restore from. So one is created right here, while
   *                          the keys still exist, under a fresh recovery
   *                          phrase the caller must show the user.
   *   'needs-recovery'     — a backup exists on the server but this device has
   *                          no local keys. The caller must get the recovery
   *                          phrase from the user (see restoreFromKeyBackup)
   *                          or offer to start fresh (see generateFreshDeviceKeys).
   *   'no-backup'          — CONFIRMED (server returned 404) no local keys and
   *                          no backup either (brand-new account, or one from
   *                          before E2E existed). Caller should run first-time
   *                          setup (see setupNewAccountKeys).
   *   'check-failed'       — could not determine backup state (network/tunnel
   *                          failure talking to the server, after retries).
   *                          NOT the same as 'no-backup' — callers MUST NOT
   *                          treat this as license to mint fresh keys. Doing
   *                          so overwrites the server's public key + backup
   *                          (both are upserts) and permanently orphans every
   *                          message ever encrypted to the old key, with no
   *                          way back via any recovery phrase. Show a retry
   *                          prompt instead. See [[e2e_encryption]] memory for
   *                          the incident this guards against.
   *
   * Deliberately does NOT accept the login password: the encryption recovery
   * secret is a separate, app-generated recovery phrase, specifically so that
   * guessing (or knowing) someone's login password no longer also unlocks
   * their encrypted content -- see setupNewAccountKeys / regenerateRecoveryPhrase.
   */
  async ensureUserKeys(hubSlug: string): Promise<{
    status: 'has-keys' | 'has-keys-new-backup' | 'needs-recovery' | 'no-backup' | 'check-failed';
    /** Set only for 'has-keys-new-backup' — the phrase the caller must show the user. */
    newPhrase?: string;
  }> {
    try {
      const alreadyHasKeys = await hasKeys(this.keyScope(hubSlug));
      if (alreadyHasKeys) {
        // Keys exist on this device — re-upload the public key so server stays in sync
        // (e.g. server was reset, or first upload failed).
        const storedJwk = await getStoredPublicKeyJwk(this.keyScope(hubSlug));
        if (storedJwk) await this.registerPublicKey(hubSlug, storedJwk);

        // If we can't confirm a backup exists, do nothing destructive — leave
        // this device's already-working local keys alone and let the next
        // check retry, rather than assuming absence and overwriting anything.
        let backupExists: boolean;
        try {
          backupExists = await this.hasKeyBackup(hubSlug);
        } catch (err) {
          console.error('[e2e-keys] hasKeyBackup check failed, leaving local keys untouched', err);
          return { status: 'has-keys' };
        }
        if (!backupExists) {
          const phrase = await this.regenerateRecoveryPhrase(hubSlug);
          return phrase ? { status: 'has-keys-new-backup', newPhrase: phrase } : { status: 'has-keys' };
        }
        return { status: 'has-keys' };
      }
      const backupExists = await this.hasKeyBackup(hubSlug);
      return { status: backupExists ? 'needs-recovery' : 'no-backup' };
    } catch (err) {
      // Covers hasKeyBackup throwing in the no-local-keys branch above, or any
      // other unexpected failure. Must NOT default to 'no-backup' here — this
      // status drives destructive fresh-key generation in callers, and firing
      // it on a merely transient failure is exactly the bug that caused
      // permanent, unrecoverable message loss. See [[e2e_encryption]].
      console.error('[e2e-keys] ensureUserKeys could not determine key state', err);
      return { status: 'check-failed' };
    }
  }

  /**
   * First-ever key setup for an account with no backup at all (brand-new
   * signup, or an old account from before E2E/recovery-phrase existed).
   * Generates a keypair, an app-generated recovery phrase, and backs the
   * keys up under that phrase. Returns the phrase to show the user exactly
   * once — it is never stored anywhere in recoverable form — or null on failure.
   */
  async setupNewAccountKeys(hubSlug: string): Promise<string | null> {
    try {
      const result = await generateUserKeys(this.keyScope(hubSlug));
      await this.registerPublicKey(hubSlug, result.publicKeyJwk);
      return this.regenerateRecoveryPhrase(hubSlug);
    } catch (err) {
      console.error('[e2e-keys] setupNewAccountKeys failed', err);
      return null;
    }
  }

  /**
   * Generates a fresh recovery phrase and re-backs-up this device's current
   * keys under it, invalidating any previous phrase for this account. Used
   * both for first-time setup and for the "Regenerate" action in settings.
   */
  async regenerateRecoveryPhrase(hubSlug: string): Promise<string | null> {
    try {
      const phrase = await generateRecoveryPhrase();
      const ok = await this.storeKeyBackup(hubSlug, phrase);
      return ok ? phrase : null;
    } catch (err) {
      console.error('[e2e-keys] regenerateRecoveryPhrase failed', err);
      return null;
    }
  }

  /**
   * Generates a fresh local keypair for this device only, without touching
   * any existing server-side backup. Used when a user can't provide their
   * recovery phrase on a new device but wants to proceed anyway -- old
   * encrypted content stays unreadable on this device unless they later
   * restore with the phrase (which overwrites these device-local keys).
   */
  async generateFreshDeviceKeys(hubSlug: string): Promise<void> {
    const result = await generateUserKeys(this.keyScope(hubSlug));
    await this.registerPublicKey(hubSlug, result.publicKeyJwk);
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

  /**
   * Get another user's public key from the hub (for encrypting content to them).
   * Returns `null` only when the server confirms (404) the peer has no key registered —
   * a legitimate, permanent state. On network errors or non-404 failures, retries a
   * few times with backoff and then throws, so callers can tell "no key exists" apart
   * from "couldn't check right now" instead of silently treating both as "no key"
   * (which used to cause DMs to flash raw ciphertext or silently send as plaintext
   * during transient tunnel hiccups — see [[e2e_encryption]]).
   */
  async getUserPublicKey(hubSlug: string, userId: string): Promise<string | null> {
    const conn = this.getHubConnection(hubSlug);
    if (!conn?.user?.authToken) return null;
    const url = `${conn.hub.tunnelUrl}/api/keys/${encodeURIComponent(userId)}`;
    const authHeader = { Authorization: `Bearer ${conn.user.authToken}` };

    let lastErr: unknown;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const res = await fetch(url, { headers: authHeader });
        if (res.status === 404) return null; // peer genuinely has no key registered
        if (!res.ok) throw new Error(`key lookup failed (${res.status})`);
        const { publicKeyJwk } = await res.json();
        return publicKeyJwk;
      } catch (err) {
        lastErr = err;
        if (attempt < 2) await new Promise(r => setTimeout(r, 300 * (attempt + 1)));
      }
    }
    console.error('[e2e-keys] getUserPublicKey failed after retries', { hubSlug, userId, err: lastErr });
    throw lastErr;
  }

  /**
   * Resolve the peer's public key JWK for a DM conversation.
   * `members` is the conversation's members array (must include both parties).
   * Returns null for group chats or if the peer genuinely has no registered key.
   * Throws (does not silently return null) if the key lookup itself couldn't be
   * completed — callers must handle this distinctly from "no key".
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
      const backup = await createKeyBackup(this.keyScope(hubSlug), passphrase);
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

  /** Fetch the raw encrypted key backup blob from the server, or null if none exists. */
  private async fetchKeyBackup(hubSlug: string): Promise<KeyBackupPayload | null> {
    try {
      const conn = this.getHubConnection(hubSlug);
      if (!conn?.user?.authToken) return null;
      const res = await fetch(`${conn.hub.tunnelUrl}/api/keys/backup`, {
        headers: { Authorization: `Bearer ${conn.user.authToken}` },
      });
      if (!res.ok) return null;
      return await res.json() as KeyBackupPayload;
    } catch { return null; }
  }

  /**
   * Retrieve encrypted key backup from server and restore using passphrase.
   * On success, also re-registers the public key derived from the restored
   * keypair — self-healing the server's copy in case an earlier bug (see
   * hasKeyBackup) let it drift out of sync with what backups/senders expect.
   */
  async restoreFromKeyBackup(hubSlug: string, passphrase: string): Promise<boolean> {
    const backup = await this.fetchKeyBackup(hubSlug);
    if (!backup) return false;
    const ok = await restoreKeyBackup(this.keyScope(hubSlug), backup, passphrase);
    if (ok) {
      const storedJwk = await getStoredPublicKeyJwk(this.keyScope(hubSlug));
      if (storedJwk) await this.registerPublicKey(hubSlug, storedJwk);
    }
    return ok;
  }

  /**
   * Whether a key backup exists on the server for this user.
   * Returns `false` only when the server confirms (404) no backup exists —
   * a legitimate, meaningful signal. On network errors or non-404 failures,
   * retries a few times with backoff and then throws, so callers can tell
   * "confirmed no backup" apart from "couldn't check right now."
   *
   * This distinction is load-bearing: callers treat a confirmed "no backup"
   * as license to mint a brand-new keypair and overwrite the server's public
   * key + backup (both are upserts — see POST /api/keys and POST
   * /api/keys/backup in server.js). Doing that in response to a merely
   * transient check failure permanently orphans every message ever encrypted
   * to the old key, on every device except whichever one still happens to
   * have the old private key locally — no recovery phrase, old or new, can
   * ever restore it afterward, because the server-side blob it decrypts to
   * has been overwritten. This is the actual mechanism behind "I entered my
   * correct recovery phrase and it still won't decrypt, forever" reports —
   * see [[e2e_encryption]] for the full incident writeup.
   */
  async hasKeyBackup(hubSlug: string): Promise<boolean> {
    const conn = this.getHubConnection(hubSlug);
    if (!conn?.user?.authToken) return false;
    const url = `${conn.hub.tunnelUrl}/api/keys/backup`;
    const authHeader = { Authorization: `Bearer ${conn.user.authToken}` };

    let lastErr: unknown;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const res = await fetch(url, { headers: authHeader });
        if (res.status === 404) return false; // confirmed: no backup exists
        if (!res.ok) throw new Error(`backup check failed (${res.status})`);
        return true;
      } catch (err) {
        lastErr = err;
        if (attempt < 2) await new Promise(r => setTimeout(r, 300 * (attempt + 1)));
      }
    }
    console.error('[e2e-keys] hasKeyBackup failed after retries', { hubSlug, err: lastErr });
    throw lastErr;
  }

  /** Remove keys from this device's IndexedDB (called on logout). */
  async clearLocalKeys(hubSlug: string): Promise<void> {
    await clearKeys(this.keyScope(hubSlug)).catch(() => {});
  }

  // ──────────────────────────────────────────────
  // Notes (private, owner-only)
  // ──────────────────────────────────────────────

  /** Decrypt a note in-place if its body_plain is an encrypted sentinel. */
  private async maybeDecryptNote(hubSlug: string, note: HubNote): Promise<HubNote> {
    if (!isNoteEncrypted(note.body_plain)) return note;
    const decrypted = await decryptNoteBody(this.keyScope(hubSlug), note.body_plain);
    if (!decrypted) {
      // Key unavailable on this device — show placeholder so the note still renders.
      // decryptFailed lets callers (e.g. promoting to hub/web visibility) tell this
      // apart from real content, so the placeholder text itself never gets published.
      return {
        ...note,
        body_rich: null,
        body_plain: '[Encrypted — open on the device where you created this note, or restore your key backup]',
        decryptFailed: true,
      };
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
      const enc = await encryptNoteBody(this.keyScope(hubSlug), data.body_rich ?? null, data.body_plain ?? '');
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
    // Encrypt body content fields if present in patch — but a note that is (or is
    // becoming, via is_public in this same patch) hub/web/blog public must never
    // store ciphertext in body_plain/body_rich: every non-owner reader decrypts
    // with their own personal key, not the owner's, so a public note's main body
    // has to be plaintext the same way web_body_plain/web_body_rich already are.
    let sendPatch = { ...patch };
    if (patch.body_plain !== undefined || patch.body_rich !== undefined) {
      if (!patch.is_public) {
        const enc = await encryptNoteBody(
          this.keyScope(hubSlug),
          patch.body_rich ?? null,
          patch.body_plain ?? '',
        );
        if (enc) {
          sendPatch = { ...sendPatch, body_plain: enc.body_plain, body_rich: enc.body_rich ?? undefined };
        }
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

  async forkNote(hubSlug: string, noteId: string): Promise<HubNote> {
    const conn = this.getHubConnection(hubSlug);
    if (!conn) throw new Error('Not connected');
    const res = await fetch(`${conn.hub.tunnelUrl}/api/notes/${noteId}/fork`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${conn.user.authToken}` },
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({ error: 'Failed to fork note' }));
      throw new Error((data as { error?: string }).error || 'Failed to fork note');
    }
    return res.json() as Promise<HubNote>;
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
