/**
 * Serves the hub-owner helper scripts (scripts/hub-tools/citinet.sh|ps1) from the
 * hub's own API, so an EXISTING hub — one created before the helper shipped — can
 * install or refresh it with a single command, without needing the repo:
 *
 *   curl -fsSL http://localhost:9090/api/tools/citinet.sh -o citinet.sh && chmod +x citinet.sh
 *   Invoke-WebRequest http://localhost:9090/api/tools/citinet.ps1 -OutFile citinet.ps1
 *
 * New hubs already get these written by their setup script. The files contain no
 * secrets and no per-hub values (the helper reads its own folder's .env at run
 * time), so this route is public. Strict allowlist — no path is ever built from
 * user input beyond picking one of these two names.
 */

const fs = require('fs');
const path = require('path');

const FILES = {
  'citinet.sh': { type: 'text/x-shellscript; charset=utf-8', eol: '\n' },
  'citinet.ps1': { type: 'text/plain; charset=utf-8', eol: '\r\n' },
};

function createHubToolsRouter({ express }) {
  const router = express.Router();

  router.get('/:file', (req, res) => {
    const spec = Object.prototype.hasOwnProperty.call(FILES, req.params.file) ? FILES[req.params.file] : null;
    if (!spec) return res.status(404).json({ error: 'Unknown tool' });
    let text;
    try {
      text = fs.readFileSync(path.join(__dirname, 'hub-tools', req.params.file), 'utf8');
    } catch {
      return res.status(404).json({ error: 'This hub image does not include the helper scripts — update the hub first.' });
    }
    // Bash must never see CRLF; Windows PowerShell 5.1 is happiest with it.
    const normalized = text.split(/\r?\n/).join(spec.eol);
    res.set('Content-Type', spec.type);
    res.set('Cache-Control', 'no-cache');
    res.send(normalized);
  });

  return router;
}

module.exports = { createHubToolsRouter };
