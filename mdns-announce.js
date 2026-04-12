/**
 * Announces citinet.local via mDNS on the LAN.
 * Responds to A record queries so any device resolves citinet.local → hub LAN IP.
 * Runs natively on Windows (not in Docker/WSL2) so multicast reaches the real LAN.
 *
 * Usage:  node mdns-announce.js
 */

import mdns from 'multicast-dns';
import os from 'os';

const PORT = parseInt(process.env.HUB_PORT ?? '8080', 10);
const HOSTNAME = 'citinet.local';

// Find LAN IP — skip loopback and Tailscale CGNAT range (100.64.0.0/10)
function getLanIp() {
  const candidates = [];
  for (const iface of Object.values(os.networkInterfaces())) {
    for (const addr of iface ?? []) {
      if (addr.family !== 'IPv4' || addr.internal) continue;
      const [a, b] = addr.address.split('.').map(Number);
      if (a === 100 && b >= 64 && b <= 127) continue; // skip Tailscale
      candidates.push(addr.address);
    }
  }
  return (
    candidates.find(ip => ip.startsWith('192.168.')) ??
    candidates.find(ip => ip.startsWith('10.')) ??
    candidates[0] ??
    '127.0.0.1'
  );
}

const lanIp = getLanIp();
const mdnsInstance = mdns();

// Respond to any device querying citinet.local
mdnsInstance.on('query', (query) => {
  const match = query.questions.some(
    q => q.name === HOSTNAME && (q.type === 'A' || q.type === 'ANY')
  );
  if (!match) return;

  mdnsInstance.respond({
    answers: [
      {
        name: HOSTNAME,
        type: 'A',
        ttl: 300,
        flush: true,
        data: lanIp,
      },
    ],
  });
});

// Also proactively announce on startup so devices don't have to ask first
function announce() {
  mdnsInstance.respond({
    answers: [
      {
        name: HOSTNAME,
        type: 'A',
        ttl: 300,
        flush: true,
        data: lanIp,
      },
    ],
  });
}

// Announce immediately, then every 60s to stay fresh in device caches
announce();
const interval = setInterval(announce, 60_000);

mdnsInstance.on('ready', () => {
  console.log(`mDNS ready — citinet.local → ${lanIp}:${PORT}`);
  console.log('Any device on the LAN can now open http://citinet.local:8080');
});

mdnsInstance.on('error', (err) => {
  console.error('mDNS error:', err.message);
});

process.on('SIGINT', () => {
  console.log('\nStopping...');
  clearInterval(interval);
  mdnsInstance.destroy();
  process.exit(0);
});

console.log(`Starting mDNS on ${lanIp} — announcing ${HOSTNAME}:${PORT}`);
