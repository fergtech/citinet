/**
 * Citinet Blog Sync — Vercel Serverless Function
 *
 * POST /api/blog-sync → a hub pushes its blog-published notes here; written
 * to blog-posts.json in the citinet-registry GitHub repo, keyed by hub slug.
 *
 * Exists because Vercel's serverless network can't reliably reach
 * residential/tailnet-hosted hubs inbound (see the reboot-incident-2026-08-10
 * memory — confirmed UND_ERR_CONNECT_TIMEOUT connecting to hub1 regardless of
 * which of its public URLs was used). info.citinet.cloud/blog previously
 * fetched a hub's notes live on every page view; this flips it to the same
 * push model api/registry.js already uses for hub status, so nothing here
 * depends on Vercel being able to reach into a hub's network at all.
 */

const REGISTRY_OWNER = 'fergtech';
const REGISTRY_REPO  = 'citinet-registry';
const BLOG_FILE      = 'blog-posts.json';

function githubHeaders() {
  return {
    Authorization: `Bearer ${process.env.REGISTRY_GITHUB_TOKEN}`,
    Accept: 'application/vnd.github.v3+json',
    'User-Agent': 'citinet-blog-sync',
  };
}

async function getBlogFile() {
  const res = await fetch(
    `https://api.github.com/repos/${REGISTRY_OWNER}/${REGISTRY_REPO}/contents/${BLOG_FILE}`,
    { headers: githubHeaders() },
  );
  if (res.status === 404) return { content: {}, sha: null };
  if (!res.ok) throw new Error(`GitHub API error: ${res.status}`);
  const data = await res.json();
  const content = JSON.parse(Buffer.from(data.content, 'base64').toString('utf-8'));
  return { content, sha: data.sha };
}

async function writeBlogFile(content, sha) {
  const encoded = Buffer.from(JSON.stringify(content, null, 2)).toString('base64');
  const body = { message: 'chore: sync blog posts', content: encoded };
  if (sha) body.sha = sha;
  const res = await fetch(
    `https://api.github.com/repos/${REGISTRY_OWNER}/${REGISTRY_REPO}/contents/${BLOG_FILE}`,
    { method: 'PUT', headers: { ...githubHeaders(), 'Content-Type': 'application/json' }, body: JSON.stringify(body) },
  );
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`GitHub write error: ${res.status} — ${err}`);
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  if (!process.env.REGISTRY_GITHUB_TOKEN) {
    return res.status(500).json({ error: 'Blog sync not configured (missing token)' });
  }

  const { slug, notes } = req.body || {};
  if (!slug || !Array.isArray(notes)) {
    return res.status(400).json({ error: 'slug and notes[] are required' });
  }

  try {
    const { content, sha } = await getBlogFile();
    content[slug] = { notes, updated_at: new Date().toISOString() };
    await writeBlogFile(content, sha);
    return res.status(200).json({ ok: true, count: notes.length });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
