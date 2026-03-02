/**
 * Hub Types for Citinet
 * 
 * A "hub" is a citinet community node — a locally-operated micro data center
 * exposed to the internet via a tunnel (Tailscale, Cloudflare, etc.).
 * The web app connects to hubs through their tunnel URLs.
 * 
 * Mission 1: Users join by entering the hub's tunnel URL, web app runs on localhost:3000
 * Mission 2: Deploy web app to custom domain with hub discovery registry
 *
 * Routing:
 *   Current: localhost:3000 (Mission 1 - local development only)
 *   Future:  Custom domain with subdomain or query-param routing
 */

export interface Hub {
  /** Unique ID for this hub (generated client-side or from hub API) */
  id: string;
  /** URL-friendly identifier, used in routing (e.g., "highland-park") */
  slug: string;
  /** Display name (e.g., "Highland Park Local Commons") */
  name: string;
  /** The cloudflared tunnel URL (e.g., "https://abc123.trycloudflare.com") */
  tunnelUrl: string;
  /** Location description (e.g., "Highland Park, CA") */
  location: string;
  /** Short description of the community */
  description?: string;
  /** Number of members (from hub API or cached) */
  memberCount?: number;
  /** Whether we have an active connection to the hub */
  connectionStatus: HubConnectionStatus;
  /** When the user first connected to this hub */
  joinedAt: string;
  /** Last time we successfully connected to the hub */
  lastConnectedAt?: string;
  /** Hub metadata from the hub's API, if available */
  meta?: HubMeta;
  /** Geocoded latitude (stored when admin sets location via LocationPicker) */
  lat?: number;
  /** Geocoded longitude (stored when admin sets location via LocationPicker) */
  lng?: number;
}

export type HubConnectionStatus = 'connected' | 'connecting' | 'disconnected' | 'unreachable';

export interface HubMeta {
  /** Hub software version */
  version?: string;
  /** Services available on this hub */
  services?: string[];
  /** Active member count from hub */
  activeMembers?: number;
  /** Online member count from hub */
  onlineNow?: number;
  /** Hub uptime (from /api/status) */
  uptime?: string;
  /** Node type (from /api/info) */
  nodeType?: string;
  /** Total storage quota in bytes */
  storageQuota?: number;
  /** Used storage in bytes */
  storageUsed?: number;
  /** Whether the hub requires auth */
  requiresAuth?: boolean;
  /** Hub creation date */
  createdAt?: string;
}

export interface HubUser {
  /** Username chosen during signup */
  username: string;
  /** Display name (defaults to username) */
  displayName: string;
  /** Selected interest tags */
  tags: string[];
  /** Civic role */
  role: string;
  /** Whether user agreed to community principles */
  agreedToManifesto: boolean;
  /** Hub-specific user ID (from hub API if available) */
  hubUserId?: string;
  /** Authentication token for this hub */
  authToken?: string;
  /** Whether this user is a hub admin */
  isAdmin?: boolean;
  /** User's email address */
  email?: string;
  /** User's location/neighborhood */
  location?: string;
}

/** What we store per hub in localStorage */
export interface HubConnection {
  hub: Hub;
  user: HubUser;
}

/**
 * Response from GET /api/info
 * The hub API returns: node_id, node_name, node_type, storage_quota
 */
export interface HubInfoResponse {
  node_id: string;
  /** Hub name — normalized from the API's node_name field */
  name: string;
  /** Raw field returned by the API */
  node_name?: string;
  node_type?: string;
  storage_quota?: number;
  // Optional fields the hub may add later
  location?: string;
  description?: string;
  /** Public tunnel URL reported by the hub (e.g. Tailscale funnel URL) */
  tunnel_url?: string;
  /** LAN IP reported by the hub */
  lan_ip?: string;
}

/**
 * Response from GET /api/status
 * Returns: uptime, storage_used, online, node_name, etc.
 */
export interface HubStatusResponse {
  node_name?: string;
  uptime?: string;
  storage_used?: number;
  online?: boolean;
  user_count?: number;
}

/** Response expected from a hub's auth/register endpoint */
export interface HubJoinResponse {
  success: boolean;
  userId?: string;
  token?: string;
  message?: string;
}

/** Credentials used during signup (password never stored) */
export interface HubAuthCredentials {
  username: string;
  password: string;
  email?: string;
}

/** A member of the hub */
export interface HubMember {
  user_id: string;
  username: string;
  is_admin: boolean;
  created_at: string;
}

/** A conversation participant */
export interface HubParticipant {
  user_id: string;
  username: string;
}

/** A conversation (DM or group) */
export interface HubConversation {
  id: string;                       // conversation_id from API
  kind: 'dm' | 'group';
  name?: string;
  members: HubParticipant[];
  lastMessage?: HubMessage;
  created_by?: string;
  created_at: string;
  updated_at?: string;
}

/** An attachment on a message (image, video, or other file) */
export interface HubMessageAttachment {
  id: string;
  file_name: string;
  mime_type: string;
  size: number;
  url?: string;         // resolved blob URL (client-side only)
}

/** A message within a conversation */
export interface HubMessage {
  id: string;                       // message_id from API
  conversation_id: string;
  sender_id: string;
  sender_username?: string;
  body: string;
  attachments?: HubMessageAttachment[];
  created_at: string;
}

/** A discussion post on the hub */
export interface HubPost {
  id: string;
  category: string;           // 'DISCUSSION' | 'ANNOUNCEMENT' | 'PROJECT' | 'REQUEST'
  title: string;
  body: string;
  author_id: string;
  author_username: string;
  media_file_name?: string;   // filename in MinIO, served via /api/public/files/:name
  reply_count: number;
  created_at: string;
  updated_at: string;
}

/** A reply to a hub post */
export interface HubPostReply {
  id: string;
  post_id: string;
  body: string;
  author_id: string;
  author_username: string;
  created_at: string;
}

/** A file on the hub (personal or shared) */
export interface HubFile {
  id: string;
  name: string;
  size: number;
  mime_type?: string;
  owner_id?: string;
  uploaded_by?: string;
  uploaded_at?: string;
  description?: string;
  category?: string;
  is_public: boolean;
}
