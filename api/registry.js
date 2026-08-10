/**
 * Citinet Hub Registry — Vercel Serverless Function
 *
 * GET    /api/registry         → list all registered hubs
 * POST   /api/registry         → register or update a hub (verifies reachability first)
 * DELETE /api/registry?id=:id  → deregister a hub by id or slug
 *
 * Reads and writes registry.json in the citinet-registry GitHub repo.
 * Requires REGISTRY_GITHUB_TOKEN env var (PAT with contents:write on that repo).
 */

const REGISTRY_OWNER = 'fergtech';
const REGISTRY_REPO  = 'citinet-registry';
const REGISTRY_FILE  = 'registry.json';

function githubHeaders() {
  return {
    Authorization: `Bearer ${process.env.REGISTRY_GITHUB_TOKEN}`,
    Accept: 'application/vnd.github.v3+json',
    'User-Agent': 'citinet-registry-api',
  };
}

async function getRegistryFile() {
  const res = await fetch(
    `https://api.github.com/repos/${REGISTRY_OWNER}/${REGISTRY_REPO}/contents/${REGISTRY_FILE}`,
    { headers: githubHeaders() },
  );
  if (!res.ok) throw new Error(`GitHub API error: ${res.status}`);
  const data = await res.json();
  const content = JSON.parse(Buffer.from(data.content, 'base64').toString('utf-8'));
  return { content, sha: data.sha };
}

async function writeRegistryFile(content, sha) {
  const encoded = Buffer.from(JSON.stringify(content, null, 2)).toString('base64');
  const res = await fetch(
    `https://api.github.com/repos/${REGISTRY_OWNER}/${REGISTRY_REPO}/contents/${REGISTRY_FILE}`,
    {
      method: 'PUT',
      headers: { ...githubHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: 'chore: update hub registry',
        content: encoded,
        sha,
      }),
    },
  );
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`GitHub write error: ${res.status} — ${err}`);
  }
}

async function verifyHub(tunnelUrl) {
  try {
    const res = await fetch(`${tunnelUrl}/api/info`, {
      signal: AbortSignal.timeout(15000),
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) {
      console.error(`[verifyHub] ${tunnelUrl} responded ${res.status}`);
      return null;
    }
    return await res.json();
  } catch (err) {
    console.error(`[verifyHub] ${tunnelUrl} failed: ${err.name}: ${err.message}`);
    return null;
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  // ── GET — return hub list ─────────────────────────────────
  if (req.method === 'GET') {
    try {
      const { content } = await getRegistryFile();
      return res.status(200).json(content);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  // ── POST — register or update a hub ──────────────────────
  if (req.method === 'POST') {
    if (!process.env.REGISTRY_GITHUB_TOKEN) {
      return res.status(500).json({ error: 'Registry not configured (missing token)' });
    }

    const {
      id, name, slug, location, description, lat, lng, tunnel_url, member_count,
      hub_icon_mode, hub_icon_symbol, hub_icon_bg_mode,
      hub_icon_gradient_from, hub_icon_gradient_to,
      hub_icon_solid_color, hub_icon_image_file_name,
    } = req.body || {};
    if (!tunnel_url || !name || !slug) {
      return res.status(400).json({ error: 'name, slug, and tunnel_url are required' });
    }

    try {
      const { content, sha } = await getRegistryFile();
      const now = new Date().toISOString();
      const existingIndex = content.hubs.findIndex(
        h => h.slug === slug || (id && h.id === id),
      );

      // Attempt to verify the hub is reachable — but treat it as advisory.
      // A hub may be behind Tailscale or temporarily unreachable from Vercel;
      // we still register it and let the online flag reflect actual reachability.
      let info = null;
      try { info = await verifyHub(tunnel_url); } catch { /* soft fail */ }

      // member_count is authoritative from the hub's own live /api/info response
      // (a real-time DB count) whenever it's reachable -- never trust the
      // client-submitted value, which is only as fresh as whenever the caller
      // last happened to fire this request. If unreachable, keep whatever was
      // already on file rather than reverting to a possibly-stale client value.
      const previousCount = existingIndex >= 0 ? content.hubs[existingIndex].member_count : undefined;
      const previousLat = existingIndex >= 0 ? content.hubs[existingIndex].lat : undefined;
      const previousLng = existingIndex >= 0 ? content.hubs[existingIndex].lng : undefined;
      const hubEntry = {
        id:            id || slug,
        name,
        slug,
        location:      location || (info?.location) || (info?.hub_location) || '',
        description:   description || (info?.description) || (info?.hub_description) || '',
        lat:           lat ?? info?.lat ?? previousLat ?? null,
        lng:           lng ?? info?.lng ?? previousLng ?? null,
        tunnel_url,
        member_count:  info?.member_count ?? previousCount ?? member_count ?? 0,
        online:        info !== null,
        registered_at: existingIndex >= 0 ? content.hubs[existingIndex].registered_at : now,
        last_seen:     now,
        hub_icon_mode,
        hub_icon_symbol,
        hub_icon_bg_mode,
        hub_icon_gradient_from,
        hub_icon_gradient_to,
        hub_icon_solid_color,
        hub_icon_image_file_name,
      };

      if (existingIndex >= 0) {
        content.hubs[existingIndex] = hubEntry;
      } else {
        content.hubs.push(hubEntry);
      }

      // Remove stale duplicates — same tunnel_url but different id (e.g. after a hub rename)
      content.hubs = content.hubs.filter(
        h => h.tunnel_url !== tunnel_url || h.id === hubEntry.id
      );
      content.updated_at = now;

      await writeRegistryFile(content, sha);
      return res.status(200).json({ ok: true, hub: hubEntry });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  // ── DELETE — deregister a hub ─────────────────────────────
  if (req.method === 'DELETE') {
    if (!process.env.REGISTRY_GITHUB_TOKEN) {
      return res.status(500).json({ error: 'Registry not configured (missing token)' });
    }

    const hubId = req.query.id;
    if (!hubId) return res.status(400).json({ error: 'id query param is required' });

    try {
      const { content, sha } = await getRegistryFile();
      const before = content.hubs.length;
      content.hubs = content.hubs.filter(h => h.id !== hubId && h.slug !== hubId);
      if (content.hubs.length === before) {
        return res.status(404).json({ error: 'Hub not found' });
      }
      content.updated_at = new Date().toISOString();
      await writeRegistryFile(content, sha);
      return res.status(200).json({ ok: true });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
