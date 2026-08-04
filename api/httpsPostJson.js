/**
 * POST JSON over HTTPS using Node's own https module rather than fetch().
 * Node 18's bundled undici throws RequestContentLengthMismatchError on some
 * HTTPS POSTs through Vercel's edge (reproduced consistently against the
 * live cert broker; GETs and plain-HTTP POSTs are unaffected) -- https.request
 * sidesteps it entirely. Follows redirects, since https.request doesn't
 * follow them on its own (e.g. the citinet.cloud -> www.citinet.cloud 307).
 * Shared by certAgent.js and registryHeartbeat.js -- both POST to Vercel-hosted
 * endpoints and would otherwise hit the same bug independently.
 */

const https = require('https');

function postJson(urlStr, payload, redirectsLeft = 3) {
  return new Promise((resolve, reject) => {
    const body = Buffer.from(JSON.stringify(payload));
    const u = new URL(urlStr);
    const req = https.request({
      hostname: u.hostname,
      port: u.port || 443,
      path: u.pathname + u.search,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': body.length },
    }, res => {
      if ([301, 302, 307, 308].includes(res.statusCode) && res.headers.location && redirectsLeft > 0) {
        res.resume();
        resolve(postJson(new URL(res.headers.location, urlStr).toString(), payload, redirectsLeft - 1));
        return;
      }
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        let parsed = {};
        try { parsed = JSON.parse(data); } catch { /* non-JSON error body */ }
        resolve({ status: res.statusCode, ok: res.statusCode >= 200 && res.statusCode < 300, body: parsed });
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

module.exports = { postJson };
