/**
 * Hub Service for Citinet
 * 
 * Manages hub connections, persistence, and API communication.
 * Currently uses localStorage + direct fetch to hub tunnel URLs.
 *
 * Future: Will integrate with centralized hub registry
 */

import type { Hub, HubConnection, HubConnectionStatus, HubInfoResponse, HubStatusResponse, HubUser, HubMeta, HubAuthCredentials, HubFile, HubMember, HubConversation, HubMessage, HubMessageAttachment, HubPost, HubPostReply } from '../types/hub';

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

    // Prefer the tunnel URL reported by the hub API (e.g. Tailscale funnel URL) over
    // whatever address we used to probe it (which may be localhost during hub creation).
    const storedUrl = probeInfo?.tunnel_url
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
      displayName: credentials.username,
      tags: [],
      role: 'participant',
      agreedToManifesto: true,
      hubUserId: result.userId || result.user_id,
      authToken: result.token,
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
      displayName: credentials.username,
      tags: [],
      role: 'participant',
      agreedToManifesto: true,
      hubUserId: result.userId || result.user_id,
      authToken: result.token,
    };

    await this.completeOnboarding(hubSlug, userData);
    return userData;
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
  updateHubStatus(slug: string, status: HubConnectionStatus, meta?: Partial<HubMeta>): void {
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
    
    localStorage.setItem(STORAGE_KEYS.HUBS, JSON.stringify(connections));
  }

  /** Update profile fields for the current user on a hub (stored locally) */
  updateUserProfile(
    hubSlug: string,
    updates: Partial<Pick<HubUser, 'displayName' | 'email' | 'location' | 'tags'>>
  ): HubUser {
    const connections = this.getAllHubConnections();
    const connection = connections[hubSlug];
    if (!connection) throw new Error(`No hub found with slug: ${hubSlug}`);
    Object.assign(connection.user, updates);
    localStorage.setItem(STORAGE_KEYS.HUBS, JSON.stringify(connections));
    return connection.user;
  }

  /** Remove a hub connection */
  leaveHub(slug: string): void {
    const connections = this.getAllHubConnections();
    delete connections[slug];
    localStorage.setItem(STORAGE_KEYS.HUBS, JSON.stringify(connections));
    
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
      uptime: result.status.uptime,
      storageUsed: result.status.storage_used,
      nodeType: result.info?.node_type,
      storageQuota: result.info?.storage_quota,
    } : undefined);

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

  /** Normalize a tunnel URL (strip trailing slashes, ensure https) */
  normalizeTunnelUrl(url: string): string {
    let clean = url.trim();
    // Add https:// if no protocol specified
    if (!clean.startsWith('http://') && !clean.startsWith('https://')) {
      clean = `https://${clean}`;
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
      user_id: m.user_id || m.id || m.userId || '',
      username: m.username || m.name || m.display_name || 'Unknown',
      is_admin: Boolean(m.is_admin || m.isAdmin || false),
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

    return rawConvos.map((raw: any) => {
      // API wraps as { conversation: {...}, members: [...], last_message: ... }
      const conv = raw.conversation || raw;
      const membersList = raw.members || conv.members || conv.participants || [];
      const lastMsg = raw.last_message || conv.last_message;
      return {
        id: conv.conversation_id || conv.id || '',
        kind: (conv.kind === 'dm' ? 'dm' : 'group') as 'dm' | 'group',
        name: conv.name || undefined,
        members: membersList.map((p: any) => ({
          user_id: p.user_id || p.id || '',
          username: p.username || p.name || 'Unknown',
        })),
        lastMessage: lastMsg ? {
          id: lastMsg.message_id || lastMsg.id || '',
          conversation_id: lastMsg.conversation_id || conv.conversation_id || '',
          sender_id: lastMsg.sender_id || '',
          sender_username: lastMsg.sender_username || undefined,
          body: lastMsg.body || lastMsg.content || lastMsg.text || '',
          attachments: this.normalizeAttachments(lastMsg.attachments),
          created_at: lastMsg.created_at || '',
        } : undefined,
        created_by: conv.created_by || undefined,
        created_at: conv.created_at || '',
        updated_at: conv.updated_at || undefined,
      };
    });
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
   */
  async getMessages(
    hubSlug: string,
    conversationId: string,
    limit = 50,
    before?: string,
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

    return rawMsgs.map((m: any) => ({
      id: m.message_id || m.id || '',
      conversation_id: m.conversation_id || conversationId,
      sender_id: m.sender_id || m.user_id || '',
      sender_username: m.sender_username || m.username || undefined,
      body: m.body || m.content || m.text || '',
      attachments: this.normalizeAttachments(m.attachments),
      created_at: m.created_at || '',
    }));
  }

  /**
   * Send a message in a conversation.
   * POST /api/conversations/:id/messages
   */
  async sendMessage(
    hubSlug: string,
    conversationId: string,
    messageBody: string,
  ): Promise<HubMessage> {
    const { headers, tunnelUrl } = this.getAuthHeaders(hubSlug);

    const response = await fetch(
      `${tunnelUrl}/api/conversations/${conversationId}/messages`,
      {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: messageBody }),
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
      body: m.body || m.content || messageBody,
      attachments: this.normalizeAttachments(m.attachments),
      created_at: m.created_at || new Date().toISOString(),
    };
  }

  /**
   * Send a message with file attachments.
   * POST /api/conversations/:id/messages using multipart/form-data.
   * Falls back to uploading files separately then referencing them.
   */
  async sendMessageWithMedia(
    hubSlug: string,
    conversationId: string,
    messageBody: string,
    files: File[],
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

    // Send the message with attachment IDs
    const payload: any = {
      body: messageBody || '',
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
      body: m.body || m.content || messageBody || '',
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
   */
  async uploadFile(hubSlug: string, file: File, isPublic: boolean): Promise<HubFile> {
    const connection = this.getHubConnection(hubSlug);
    if (!connection) throw new Error(`No hub found with slug: ${hubSlug}`);
    if (!connection.hub.tunnelUrl) throw new Error('Hub has no tunnel URL');

    const formData = new FormData();
    formData.append('file', file);
    formData.append('is_public', String(isPublic));

    const headers: Record<string, string> = {};
    if (connection.user?.authToken) {
      headers['Authorization'] = `Bearer ${connection.user.authToken}`;
    }

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
          return res.blob();
        })
        .then(blob => {
          const blobUrl = URL.createObjectURL(blob);
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
   * Caller is responsible for revoking the URL when done.
   */
  async fetchFileBlob(hubSlug: string, fileName: string): Promise<string> {
    const url = this.getFileDownloadUrl(hubSlug, fileName);
    if (!url) throw new Error('No download URL available');

    const connection = this.getHubConnection(hubSlug);
    const token = connection?.user?.authToken;

    const res = await fetch(url, {
      headers: token ? { 'Authorization': `Bearer ${token}` } : {},
    });
    if (!res.ok) throw new Error(`Failed to load file (${res.status})`);
    const blob = await res.blob();
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
  async createReply(hubSlug: string, postId: string, body: string): Promise<HubPostReply> {
    const { headers, tunnelUrl } = this.getAuthHeaders(hubSlug);
    const response = await fetch(`${tunnelUrl}/api/posts/${postId}/replies`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ body }),
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
