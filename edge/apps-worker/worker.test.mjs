import test from 'node:test';
import assert from 'node:assert/strict';
import worker, { appFromHost } from './worker.js';

// Minimal stand-ins for the Workers runtime: KV, the Cache API, and fetch to the hub.
function setup({ records = {}, origin }) {
  const store = new Map();
  globalThis.caches = {
    default: {
      match: async (req) => store.get(req.url)?.clone(),
      put: async (req, resp) => { store.set(req.url, resp); },
    },
  };
  const calls = [];
  globalThis.fetch = async (target, init) => {
    const targetUrl = target instanceof Request ? target.url : String(target);
    calls.push({ url: targetUrl, init });
    return origin(targetUrl, init);
  };
  const env = {
    APPS_DOMAIN: 'citinet.io',
    APPS: { get: async (k) => records[k] ?? null },
  };
  const waits = [];
  const ctx = { waitUntil: (p) => waits.push(p) };
  const run = async (url, init) => {
    const res = await worker.fetch(new Request(url, init), env, ctx);
    await Promise.all(waits.splice(0));
    return res;
  };
  return { run, calls, store };
}

const rec = { 'app:jobs': { hub: 'hub1', origin: 'https://hub1.example.ts.net' } };
const ok = (body, headers = {}) => new Response(body, { status: 200, headers });

test('appFromHost only accepts <name>.<zone>', () => {
  assert.equal(appFromHost('jobs.citinet.io', 'citinet.io'), 'jobs');
  assert.equal(appFromHost('JOBS.citinet.io:443', 'citinet.io'), 'jobs');
  assert.equal(appFromHost('citinet.io', 'citinet.io'), null);
  assert.equal(appFromHost('a.b.citinet.io', 'citinet.io'), null);
  assert.equal(appFromHost('jobs.citinet.io.evil.com', 'citinet.io'), null);
  assert.equal(appFromHost('-x.citinet.io', 'citinet.io'), null);
});

test('proxies to /apps/<app>/<path> on the hub and strips cookies/CORS', async () => {
  const { run, calls } = setup({
    records: rec,
    origin: () => ok('hi', { 'Set-Cookie': 'a=1', 'Access-Control-Allow-Origin': '*', 'Content-Type': 'text/html' }),
  });
  const res = await run('https://jobs.citinet.io/search?q=x');
  assert.equal(res.status, 200);
  assert.equal(await res.text(), 'hi');
  assert.equal(calls[0].url, 'https://hub1.example.ts.net/apps/jobs/search?q=x');
  assert.equal(res.headers.get('set-cookie'), null);
  assert.equal(res.headers.get('access-control-allow-origin'), null);
  assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
});

test('does not forward cookies or auth to the hub', async () => {
  const { run, calls } = setup({ records: rec, origin: () => ok('x') });
  await run('https://jobs.citinet.io/', { headers: { Cookie: 's=1', Authorization: 'Bearer t', 'If-None-Match': '"e"' } });
  const sent = calls[0].init.headers;
  assert.equal(sent.get('cookie'), null);
  assert.equal(sent.get('authorization'), null);
  assert.equal(sent.get('if-none-match'), '"e"');
});

test('unclaimed name → 404 page, non-GET → 405, reserved/foreign hosts pass through', async () => {
  const { run, calls } = setup({ records: rec, origin: () => ok('origin-passthrough') });
  assert.equal((await run('https://nope.citinet.io/')).status, 404);
  assert.equal((await run('https://jobs.citinet.io/', { method: 'POST', body: 'x' })).status, 405);
  const pass = await run('https://www.citinet.io/');
  assert.equal(await pass.text(), 'origin-passthrough');
  assert.equal(calls.at(-1).url, 'https://www.citinet.io/');
});

test('hub offline → serves last good copy, else a friendly 503', async () => {
  let up = true;
  const { run } = setup({
    records: rec,
    origin: () => { if (!up) throw new Error('tunnel down'); return ok('v1 page'); },
  });
  assert.equal(await (await run('https://jobs.citinet.io/')).text(), 'v1 page');
  up = false;
  assert.equal(await (await run('https://jobs.citinet.io/')).text(), 'v1 page'); // stale fallback
  const cold = await run('https://jobs.citinet.io/never-seen');
  assert.equal(cold.status, 503);
});

test('origin 530 (tunnel error) also falls back; 404 from hub is passed through', async () => {
  let status = 200;
  const { run } = setup({ records: rec, origin: () => new Response(status === 200 ? 'good' : 'bad', { status }) });
  await run('https://jobs.citinet.io/');
  status = 530;
  assert.equal(await (await run('https://jobs.citinet.io/')).text(), 'good');
  status = 404;
  assert.equal((await run('https://jobs.citinet.io/other')).status, 404);
});

test('hashed assets are served from edge cache without calling the hub', async () => {
  const { run, calls } = setup({ records: rec, origin: () => ok('js', { 'Cache-Control': 'public, max-age=31536000, immutable' }) });
  await run('https://jobs.citinet.io/assets/app-abc.js');
  await run('https://jobs.citinet.io/assets/app-abc.js');
  assert.equal(calls.length, 1);
});

test('hub redirects are not followed or exposed', async () => {
  const { run } = setup({ records: rec, origin: () => new Response(null, { status: 301, headers: { Location: 'https://evil.example/' } }) });
  const res = await run('https://jobs.citinet.io/');
  assert.equal(res.status, 404);
  assert.equal(res.headers.get('location'), null);
});
