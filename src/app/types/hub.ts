/**
 * Hub Types for citinet
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
  /** Host machine's LAN IP for direct local network access (no internet required) */
  lanIp?: string;
  /**
   * Which app screens are enabled on this hub.
   * null = all apps enabled (default for existing hubs / no config set).
   * An array restricts the dashboard to only those app IDs.
   */
  enabledApps?: string[] | null;
  /**
   * The hub's publicly reachable HTTPS URL (Tailscale funnel URL from /api/info).
   * This is always the internet-facing URL regardless of how the user connected
   * (even if they joined via localhost). Used exclusively for share links.
   * Undefined if the hub has no public tunnel configured.
   */
  publicTunnelUrl?: string;
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
  /** Platform governance role: 'admin' | 'moderator' | 'member' */
  hubRole?: 'admin' | 'moderator' | 'member';
  /** User's email address */
  email?: string;
  /** User's location/neighborhood */
  location?: string;
  /** Short bio */
  bio?: string;
  /** Avatar image key (MinIO key, resolved via /api/auth/avatar/:userId) */
  avatarUrl?: string;
  /** One-line profile headline */
  profileHeadline?: string;
  /** Personal website URL */
  website?: string;
  /** Profile banner display mode */
  bannerMode?: 'image' | 'solid' | 'gradient';
  /** Solid banner color (hex) */
  bannerColor?: string;
  /** Gradient banner start color (hex) */
  bannerGradientFrom?: string;
  /** Gradient banner end color (hex) */
  bannerGradientTo?: string;
  /** Banner image MinIO key */
  bannerImageFileName?: string;
  /** Who can see this profile: 'public' (www) | 'hub' (members only) | 'private' (self only) */
  profileVisibility?: 'public' | 'hub' | 'private';
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
  /** Which app IDs are enabled on this hub (null = all) */
  enabled_apps?: string[] | null;
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
  online_now?: number;
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
  display_name?: string | null;
  location?: string | null;
  bio?: string | null;
  tags?: string[] | null;
  is_admin: boolean;
  role: 'admin' | 'moderator' | 'member';
  created_at: string;
  avatar_url?: string | null;
  profile_headline?: string | null;
  banner_mode?: 'image' | 'solid' | 'gradient' | null;
  banner_color?: string | null;
  banner_gradient_from?: string | null;
  banner_gradient_to?: string | null;
  banner_image_file_name?: string | null;
  website?: string | null;
  profile_visibility?: 'public' | 'hub' | 'private' | null;
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
  /** Direct external media URL (used for proxy posts from Society Plus) */
  media_url?: string | null;
  /** External source metadata (optional, for proxied app posts) */
  source?: string | null;
  platform?: string | null;
  origin?: string | null;
  source_app?: string | null;
  source_name?: string | null;
  app_name?: string | null;
  platform_name?: string | null;
  source_logo_url?: string | null;
  logo_url?: string | null;
  source_favicon_url?: string | null;
  favicon_url?: string | null;
  reply_count: number;
  created_at: string;
  updated_at: string;
  event_date?: string | null;
  event_location?: string | null;
  /** Who can see this post: 'inherit' (follow profile) | 'hub' (members only) | 'private' (author only) */
  visibility?: 'inherit' | 'hub' | 'private';
}

/** A reply to a hub post */
export interface HubPostReply {
  id: string;
  post_id: string;
  body: string;
  author_id: string;
  author_username: string;
  created_at: string;
  reply_to_reply_id?: string | null;
  reply_to_user_id?: string | null;
  reply_to_username?: string | null;
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
  /** true = visible to hub members in Shared tab */
  is_public: boolean;
  /** true = accessible to anyone with the link, no auth required */
  web_public?: boolean;
}

/** A vendor/organization page on the hub */
export interface HubVendor {
  id: string;
  owner_user_id: string;
  slug?: string;
  name: string;
  description?: string;
  category: string;
  logo_file_name?: string;
  banner_mode?: 'image' | 'solid' | 'gradient';
  banner_image_file_name?: string;
  banner_color?: string;
  banner_gradient_from?: string;
  banner_gradient_to?: string;
  contact_email?: string;
  contact_phone?: string;
  website?: string;
  hours?: string;
  web_public?: boolean;
  created_at: string;
  updated_at?: string;
  listing_count?: number;
}

/** A community space within a hub */
export interface HubSpace {
  id: string;
  slug: string;
  name: string;
  description?: string | null;
  visibility: 'public' | 'private' | 'invite-only';
  banner_mode?: 'image' | 'solid' | 'gradient' | null;
  banner_color?: string | null;
  banner_gradient_from?: string | null;
  banner_gradient_to?: string | null;
  banner_image_file_name?: string | null;
  /** Direct external URL for the banner image (used when proxying from Society Plus) */
  banner_image_url?: string | null;
  created_by?: string | null;
  created_at: string;
  updated_at?: string;
  member_count?: number;
  /** Caller's role in this space (null if not a member) */
  my_role?: 'owner' | 'admin' | 'moderator' | 'member' | null;
  /** Caller's membership status */
  my_status?: 'active' | 'pending' | 'invited' | null;
  /** Whether this space is publicly readable on the open web (no account required) */
  web_public?: boolean;
}

/** A file attached to a space post */
export interface HubSpaceFile {
  id: string;
  file_name: string;
  file_key: string;
  mime_type?: string;
  size_bytes?: number;
  uploaded_at?: string;
  uploaded_by?: string;
  post_id?: string;
  post_title?: string;
}

/** A member of a space */
export interface HubSpaceMember {
  user_id: string;
  username: string;
  display_name?: string | null;
  avatar_url?: string | null;
  profile_headline?: string | null;
  role: 'owner' | 'admin' | 'moderator' | 'member';
  status: 'active' | 'pending' | 'invited';
  joined_at: string;
}

/** A private note owned by the current user */
export interface HubNote {
  id: string;
  owner_id: string;
  title: string;
  body_rich?: object | null;
  body_plain: string;
  /** Published snapshot — copied from body_rich/body_plain when note is made web-public */
  web_body_rich?: object | null;
  web_body_plain?: string | null;
  is_pinned: boolean;
  is_archived: boolean;
  is_public: boolean;
  /** Anyone with the share link can read this note (no account needed) */
  is_web_public?: boolean;
  /** Listed on the public blog feed; implies is_web_public. Admin/mod only. */
  is_blog_published?: boolean;
  color?: string | null;
  created_at: string;
  updated_at: string;
}

/** A product or service listed on the hub marketplace */
export interface HubListing {
  id: string;
  vendor_id: string;
  vendor_name?: string;
  vendor_logo_file_name?: string;
  title: string;
  description?: string;
  price: number | null;
  price_type: 'fixed' | 'negotiable' | 'free' | 'hourly' | 'contact';
  category: string;
  image_file_name?: string;
  condition?: string;
  is_active: boolean;
  created_at: string;
}

