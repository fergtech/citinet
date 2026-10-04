/**
 * Account data export — server half.
 *
 * GET /api/me/export/:part  (authenticated, always scoped to the caller)
 *
 * Returns the caller's own data for one "part" as plain JSON. Parts that are
 * end-to-end encrypted (notes, DMs, private file bytes) are NOT assembled here
 * — the server only holds ciphertext for them, so the client fetches those via
 * the normal endpoints and decrypts locally (see src/app/utils/accountExport.ts).
 *
 * Everything below is strictly "things this account authored or owns, plus
 * things it saved". Other members' private content is never returned: saved
 * items authored by someone else are resolved only when they are visible to
 * every hub member anyway.
 */

const PARTS = ['profile', 'posts', 'atlas', 'marketplace', 'preferences'];

// Columns that must never leave the server, even to the account's own owner.
const PROFILE_DENYLIST = new Set(['password_hash']);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Parse a JSON-stringified id array preference, keeping only well-formed UUIDs. */
function savedIds(prefs, key) {
  try {
    const parsed = JSON.parse(prefs[key] || '[]');
    return Array.isArray(parsed)
      ? parsed.filter((id) => typeof id === 'string' && UUID_RE.test(id))
      : [];
  } catch {
    return [];
  }
}

async function loadPrefs(pool, userId) {
  const { rows } = await pool.query(
    `SELECT key, value FROM hub_user_preferences WHERE user_id = $1`,
    [userId],
  );
  const prefs = {};
  for (const row of rows) prefs[row.key] = row.value;
  return prefs;
}

const builders = {
  async profile(pool, user) {
    const { rows } = await pool.query(`SELECT * FROM hub_users WHERE id = $1`, [user.id]);
    const profile = {};
    for (const [k, v] of Object.entries(rows[0] || {})) {
      if (!PROFILE_DENYLIST.has(k)) profile[k] = v;
    }
    const keys = await pool.query(
      `SELECT public_key FROM hub_user_keys WHERE user_id = $1`,
      [user.id],
    );
    return { profile, publicKeyJwk: keys.rows[0]?.public_key ?? null };
  },

  async posts(pool, user) {
    const [posts, replies, likes, rsvps, prefs] = await Promise.all([
      pool.query(`SELECT * FROM hub_posts WHERE author_id = $1 ORDER BY created_at`, [user.id]),
      pool.query(
        `SELECT r.*, p.title AS post_title
         FROM hub_post_replies r
         LEFT JOIN hub_posts p ON p.id = r.post_id
         WHERE r.author_id = $1 ORDER BY r.created_at`,
        [user.id],
      ),
      pool.query(`SELECT post_id, created_at FROM hub_post_likes WHERE user_id = $1`, [user.id]),
      pool.query(`SELECT post_id, created_at FROM hub_event_rsvps WHERE user_id = $1`, [user.id]),
      loadPrefs(pool, user.id),
    ]);

    const savedPostIds = savedIds(prefs, 'saved_posts');
    const savedPosts = savedPostIds.length
      ? (
          await pool.query(
            `SELECT p.id, p.title, p.body, p.category, p.created_at, u.username AS author_username
             FROM hub_posts p LEFT JOIN hub_users u ON u.id = p.author_id
             WHERE p.id = ANY($1::uuid[])
               AND (p.author_id = $2 OR COALESCE(p.visibility, 'inherit') <> 'private')`,
            [savedPostIds, user.id],
          )
        ).rows
      : [];

    return {
      posts: posts.rows,
      replies: replies.rows,
      likedPostIds: likes.rows.map((r) => r.post_id),
      rsvpPostIds: rsvps.rows.map((r) => r.post_id),
      savedPosts,
    };
  },

  async atlas(pool, user) {
    const prefs = await loadPrefs(pool, user.id);
    const pinsSql = (where) =>
      `SELECT p.*,
              COALESCE((
                SELECT json_agg(json_build_object(
                  'file_id', f.id, 'file_name', f.file_name,
                  'mime_type', f.mime_type, 'size', f.size_bytes))
                FROM hub_atlas_pin_attachments a JOIN hub_files f ON f.id = a.file_id
                WHERE a.pin_id = p.id
              ), '[]') AS attachments
       FROM hub_atlas_pins p WHERE ${where} ORDER BY p.created_at`;

    const savedPinIds = savedIds(prefs, 'saved_atlas_pins');
    const [pins, replies, savedPins] = await Promise.all([
      pool.query(pinsSql('p.author_id = $1'), [user.id]),
      pool.query(
        `SELECT r.*, p.title AS pin_title
         FROM hub_atlas_pin_replies r
         LEFT JOIN hub_atlas_pins p ON p.id = r.pin_id
         WHERE r.author_id = $1 ORDER BY r.created_at`,
        [user.id],
      ),
      savedPinIds.length
        ? pool.query(pinsSql('p.id = ANY($1::uuid[])'), [savedPinIds])
        : Promise.resolve({ rows: [] }),
    ]);

    return { pins: pins.rows, replies: replies.rows, savedPins: savedPins.rows };
  },

  async marketplace(pool, user) {
    const prefs = await loadPrefs(pool, user.id);
    const vendor = await pool.query(`SELECT * FROM hub_vendors WHERE owner_user_id = $1`, [user.id]);
    const listings = vendor.rows[0]
      ? await pool.query(`SELECT * FROM hub_listings WHERE vendor_id = $1 ORDER BY created_at`, [
          vendor.rows[0].id,
        ])
      : { rows: [] };

    const savedListingIds = savedIds(prefs, 'saved_listings');
    const savedVendorIds = savedIds(prefs, 'saved_vendors');
    const [savedListings, savedVendors] = await Promise.all([
      savedListingIds.length
        ? pool.query(`SELECT * FROM hub_listings WHERE id = ANY($1::uuid[])`, [savedListingIds])
        : { rows: [] },
      savedVendorIds.length
        ? pool.query(`SELECT * FROM hub_vendors WHERE id = ANY($1::uuid[])`, [savedVendorIds])
        : { rows: [] },
    ]);

    return {
      vendor: vendor.rows[0] ?? null,
      listings: listings.rows,
      savedListings: savedListings.rows,
      savedVendors: savedVendors.rows,
    };
  },

  async preferences(pool, user) {
    return { preferences: await loadPrefs(pool, user.id) };
  },
};

function createAccountExportRouter({ pool, authenticate, express }) {
  const router = express.Router();

  router.get('/:part', authenticate, async (req, res) => {
    const { part } = req.params;
    if (!PARTS.includes(part)) {
      return res.status(404).json({ error: `Unknown export part. Valid parts: ${PARTS.join(', ')}` });
    }
    try {
      res.json({ part, exportedAt: new Date().toISOString(), data: await builders[part](pool, req.user) });
    } catch (err) {
      console.error(`Account export (${part}) error:`, err);
      res.status(500).json({ error: 'Failed to export this part of your account' });
    }
  });

  return router;
}

module.exports = { createAccountExportRouter, PARTS };
