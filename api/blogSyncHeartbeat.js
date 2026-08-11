/**
 * Periodically pushes this hub's blog-published notes to the public blog
 * sync endpoint (api/blog-sync.js, Vercel-hosted), so info.citinet.cloud/blog
 * can read them without needing to reach into this hub's network directly —
 * Vercel's serverless network can't reliably do that inbound. See
 * registryHeartbeat.js for the same reasoning applied to hub status; this is
 * the same push model applied to blog content.
 *
 * Runs every 5 minutes rather than registryHeartbeat's 6 hours — a blog
 * wants edits (including plain content edits with no publish-flag change) to
 * show up promptly, not once every quarter-day.
 */

const { postJson } = require('./httpsPostJson');

const BLOG_SYNC_INTERVAL_MS = 5 * 60 * 1000;
const STARTUP_DELAY_MS = 10 * 1000;

async function blogSync(pool) {
  const blogSyncUrl = process.env.BLOG_SYNC_URL;
  const slug = process.env.HUB_SLUG;
  if (!blogSyncUrl || !slug) return; // opt-in, same as REGISTRY_URL

  try {
    const { rows } = await pool.query(
      `SELECT n.id, n.title, n.web_body_plain, n.web_body_rich, n.color, n.created_at, n.updated_at,
              u.username AS author
       FROM hub_notes n
       JOIN hub_users u ON n.owner_id = u.id
       WHERE n.is_blog_published = TRUE AND n.is_archived = FALSE
       ORDER BY n.updated_at DESC
       LIMIT 50`,
    );

    const res = await postJson(blogSyncUrl, { slug, notes: rows });
    if (!res.ok) {
      console.error('[blogSync] sync failed:', res.status, res.body?.error || '');
      return;
    }
    console.log('[blogSync] synced', rows.length, 'post(s)');
  } catch (err) {
    console.error('[blogSync] error:', err.message);
  }
}

/** Call once at server startup, passing the pg pool. */
function startBlogSync(pool) {
  setTimeout(() => {
    blogSync(pool).catch(err => console.error('[blogSync] startup call failed:', err.message));
  }, STARTUP_DELAY_MS);
  setInterval(() => {
    blogSync(pool).catch(err => console.error('[blogSync] periodic call failed:', err.message));
  }, BLOG_SYNC_INTERVAL_MS);
}

module.exports = { startBlogSync };
