const express = require('express');
const os = require('os');

const app = express();
const PORT = parseInt(process.env.PORT || '9090', 10);

// CORS — hub is polled from the setup wizard browser context
const corsOrigin = process.env.CORS_ORIGIN || '*';
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', corsOrigin);
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// Returns the machine's primary non-loopback IPv4 address
function getLanIp() {
  const ifaces = os.networkInterfaces();
  for (const name of Object.keys(ifaces)) {
    for (const iface of ifaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return null;
}

// GET /health — polled by the setup wizard to detect when the hub is live
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', version: '0.1.0' });
});

// GET /api/info — returns hub identity + network info for the wizard live screen
app.get('/api/info', (_req, res) => {
  res.json({
    hub_name:        process.env.HUB_NAME        || '',
    hub_slug:        process.env.HUB_SLUG        || '',
    hub_location:    process.env.HUB_LOCATION    || '',
    hub_description: process.env.HUB_DESCRIPTION || '',
    hub_visibility:  process.env.HUB_VISIBILITY  || 'local',
    tunnel_url:      process.env.TUNNEL_URL       || '',
    lan_ip:          getLanIp(),
    api_port:        PORT,
  });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Citinet API listening on port ${PORT}`);
  console.log(`  Hub:        ${process.env.HUB_NAME || '(unnamed)'}`);
  console.log(`  Visibility: ${process.env.HUB_VISIBILITY || 'local'}`);
  if (process.env.TUNNEL_URL) {
    console.log(`  Tunnel:     ${process.env.TUNNEL_URL}`);
  }
});
