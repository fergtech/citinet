import { useState } from 'react';
import { Wifi, Copy, Download, Eye, EyeOff, Laptop, Cpu, Check } from 'lucide-react';
import { generateSlug, detectOS, hubHttpsHostname } from '../utils/scriptGenerator';
import { downloadApSetupScript } from '../utils/apScriptGenerator';
import { downloadWindowsApSetupScript } from '../utils/windowsApScriptGenerator';

/** Small copy-to-clipboard button with transient "copied" feedback, matching NodeCreationWizard's CopyButton. */
function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button
      onClick={copy}
      className="shrink-0 p-2 rounded-lg bg-white dark:bg-zinc-700 hover:bg-slate-100 dark:hover:bg-zinc-600 transition-colors border border-slate-200 dark:border-zinc-600"
      title="Copy to clipboard"
    >
      {copied
        ? <Check className="w-4 h-4 text-green-600 dark:text-green-400" />
        : <Copy className="w-4 h-4 text-slate-500 dark:text-slate-400" />}
    </button>
  );
}

interface NetworkReachTabProps {
  hubSlug: string;
  hubName: string;
}

type ApPlatform = 'windows' | 'pi';

/**
 * Admin-only companion to "Local Network Only" hubs — lets guests with zero
 * internet of their own join a dedicated Wi-Fi access point and reach the hub
 * over real, browser-trusted HTTPS (no cert warnings, Web Crypto works).
 * See docs/hub-wireless-reach-standard.md and docs/hub-https-bridge.md.
 *
 * Two implementations, guessed-with-override the same way software download
 * pages guess your OS: "Windows (this machine)" needs no second device
 * (verified 2026-07-31 — Mobile Hotspot + a small DNS override); "Raspberry
 * Pi / Linux" is a separate dedicated device for anyone who'd rather use one,
 * or whose hub doesn't run on Windows.
 */
export function NetworkReachTab({ hubSlug, hubName }: NetworkReachTabProps) {
  const lanIpKey = `citinet-lan-ip-${hubSlug}`;
  const ssidKey = `citinet-ap-ssid-${hubSlug}`;
  const passwordKey = `citinet-ap-password-${hubSlug}`;
  const platformKey = `citinet-ap-platform-${hubSlug}`;

  const guessedPlatform: ApPlatform = detectOS() === 'windows' ? 'windows' : 'pi';
  const hubHostname = hubHttpsHostname(hubSlug);

  const [platform, setPlatform] = useState<ApPlatform>(
    () => (localStorage.getItem(platformKey) as ApPlatform | null) ?? guessedPlatform,
  );
  const [lanIp, setLanIp] = useState(() => localStorage.getItem(lanIpKey) ?? '');
  const [apSsid, setApSsid] = useState(() => localStorage.getItem(ssidKey) ?? `${generateSlug(hubName)}-guest`);
  const [apPassword, setApPassword] = useState(() => localStorage.getItem(passwordKey) ?? '');
  const [showPassword, setShowPassword] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [apSubnet, setApSubnet] = useState('10.55.55.0/24');
  const [wifiInterface, setWifiInterface] = useState('wlan0');
  const [guestHttpsPort, setGuestHttpsPort] = useState('443');
  const [downloadError, setDownloadError] = useState('');
  const [downloaded, setDownloaded] = useState(false);

  const handlePlatformChange = (val: ApPlatform) => {
    setPlatform(val);
    localStorage.setItem(platformKey, val);
    setDownloaded(false);
  };
  const handleLanIpChange = (val: string) => {
    setLanIp(val);
    if (val.trim()) localStorage.setItem(lanIpKey, val.trim());
    else localStorage.removeItem(lanIpKey);
  };
  const handleSsidChange = (val: string) => {
    setApSsid(val);
    if (val.trim()) localStorage.setItem(ssidKey, val.trim());
    else localStorage.removeItem(ssidKey);
  };
  const handlePasswordChange = (val: string) => {
    setApPassword(val);
    if (val) localStorage.setItem(passwordKey, val);
    else localStorage.removeItem(passwordKey);
  };

  const canDownload = platform === 'windows'
    ? apSsid.trim().length > 0 && apPassword.length >= 8
    : lanIp.trim().length > 0 && apSsid.trim().length > 0 && apPassword.length >= 8;

  const handleDownload = () => {
    setDownloadError('');
    try {
      if (platform === 'windows') {
        downloadWindowsApSetupScript({
          apSsid: apSsid.trim(),
          apPassword,
          hubHostname,
          guestHttpsPort: guestHttpsPort.trim() ? Number(guestHttpsPort) : undefined,
        });
      } else {
        downloadApSetupScript({
          apSsid: apSsid.trim(),
          apPassword,
          hubLanIp: lanIp.trim(),
          hubHostname,
          apSubnet: apSubnet.trim() || undefined,
          wifiInterface: wifiInterface.trim() || undefined,
        });
      }
      setDownloaded(true);
    } catch (err) {
      setDownloadError(err instanceof Error ? err.message : 'Failed to generate script');
    }
  };

  const runCommand = platform === 'windows'
    ? 'powershell -ExecutionPolicy Bypass -File citinet-ap-setup.ps1'
    : 'sudo bash citinet-ap-setup.sh';

  const inputClass = 'w-full px-3 py-2 rounded-lg border cn-border cn-surface-2 text-sm cn-text-1 font-mono focus:border-purple-500 focus:outline-none transition-colors';
  const cardBaseClass = 'flex-1 flex items-center gap-3 p-3 rounded-xl border text-left transition-colors';
  const cardActiveClass = 'border-purple-500 bg-purple-50 dark:bg-purple-500/10';
  const cardInactiveClass = 'cn-border cn-surface-2 hover:bg-black/5 dark:hover:bg-white/5';

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Wifi className="w-4 h-4 text-purple-500 dark:text-purple-400" />
        <h3 className="text-sm font-semibold cn-text-1">Network Reach</h3>
      </div>
      <p className="text-xs cn-text-3">
        Let neighbors with no internet of their own — no cellular, no ISP — join a
        dedicated guest Wi-Fi network and reach this hub over real, trusted HTTPS.
        No cert warnings, encryption works normally. This hub's certificate for{' '}
        <code className="cn-surface-3 px-1 rounded">{hubHostname}</code> is issued and renewed
        automatically — nothing to set up. See{' '}
        <code className="cn-surface-3 px-1 rounded">docs/hub-wireless-reach-standard.md</code> for
        the full physical-layer standard this automates.
      </p>

      <div className="cn-glass rounded-2xl p-4 space-y-4">
        <div>
          <label className="block text-xs font-medium cn-text-3 mb-2">
            Detected: {guessedPlatform === 'windows' ? 'Windows' : 'not Windows'} — is that what your <strong>hub machine</strong> runs?
            (it may differ from whatever you're browsing on right now)
          </label>
          <div className="flex flex-col sm:flex-row gap-2">
            <button
              type="button"
              onClick={() => handlePlatformChange('windows')}
              className={`${cardBaseClass} ${platform === 'windows' ? cardActiveClass : cardInactiveClass}`}
            >
              <Laptop className="w-5 h-5 text-purple-500 dark:text-purple-400 shrink-0" />
              <div>
                <p className="text-sm font-medium cn-text-1">This machine (Windows)</p>
                <p className="text-xs cn-text-3">No second device — uses Mobile Hotspot</p>
              </div>
            </button>
            <button
              type="button"
              onClick={() => handlePlatformChange('pi')}
              className={`${cardBaseClass} ${platform === 'pi' ? cardActiveClass : cardInactiveClass}`}
            >
              <Cpu className="w-5 h-5 text-purple-500 dark:text-purple-400 shrink-0" />
              <div>
                <p className="text-sm font-medium cn-text-1">Separate Raspberry Pi / Linux</p>
                <p className="text-xs cn-text-3">Dedicated device just for networking</p>
              </div>
            </button>
          </div>
        </div>

        {platform === 'pi' && (
          <div>
            <label className="block text-xs font-medium cn-text-3 mb-1">Hub machine's LAN IP</label>
            <input
              type="text"
              value={lanIp}
              onChange={e => handleLanIpChange(e.target.value)}
              placeholder="e.g. 192.168.1.170"
              className={inputClass}
            />
            <p className="text-xs cn-text-4 mt-1">
              Where Caddy will terminate HTTPS on the hub machine (see <code className="cn-surface-3 px-1 rounded">docs/hub-https-bridge.md</code>).
              Run <code className="cn-surface-3 px-1 rounded">ipconfig</code> / <code className="cn-surface-3 px-1 rounded">ifconfig</code> on the hub to find it.
            </p>
          </div>
        )}

        <div>
          <label className="block text-xs font-medium cn-text-3 mb-1">HTTPS hostname</label>
          <div className="flex items-center gap-2 cn-surface-2 rounded-lg px-3 py-2">
            <code className="text-xs cn-text-2 flex-1 truncate">https://{hubHostname}</code>
            <button
              onClick={() => navigator.clipboard.writeText(`https://${hubHostname}`)}
              className="shrink-0 p-1 rounded hover:bg-black/10 dark:hover:bg-white/10 transition-colors"
              title="Copy link"
            >
              <Copy className="w-3.5 h-3.5 cn-text-3" />
            </button>
          </div>
          <p className="text-xs cn-text-4 mt-1">
            Assigned automatically from this hub's name — this is what guests will type.
            Certificate issuance and renewal are automatic, nothing to configure.
          </p>
        </div>

        <div>
          <label className="block text-xs font-medium cn-text-3 mb-1">Guest Wi-Fi network name (SSID)</label>
          <input
            type="text"
            value={apSsid}
            onChange={e => handleSsidChange(e.target.value)}
            placeholder="e.g. my-hub-guest"
            className={inputClass}
          />
        </div>

        <div>
          <label className="block text-xs font-medium cn-text-3 mb-1">Guest Wi-Fi password</label>
          <div className="relative">
            <input
              type={showPassword ? 'text' : 'password'}
              value={apPassword}
              onChange={e => handlePasswordChange(e.target.value)}
              placeholder="At least 8 characters"
              className={`${inputClass} pr-10`}
            />
            <button
              type="button"
              onClick={() => setShowPassword(v => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 cn-text-4 hover:cn-text-2"
            >
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>

        <details className="group">
          <summary
            className="text-xs font-medium cn-text-3 cursor-pointer select-none"
            onClick={e => { e.preventDefault(); setShowAdvanced(v => !v); }}
          >
            Advanced {showAdvanced ? '▲' : '▼'}
          </summary>
          {showAdvanced && (
            <div className="mt-3 space-y-3">
              {platform === 'windows' ? (
                <div>
                  <label className="block text-xs font-medium cn-text-3 mb-1">Guest HTTPS port</label>
                  <input
                    type="text"
                    value={guestHttpsPort}
                    onChange={e => setGuestHttpsPort(e.target.value)}
                    className={inputClass}
                  />
                </div>
              ) : (
                <>
                  <div>
                    <label className="block text-xs font-medium cn-text-3 mb-1">Guest subnet</label>
                    <input
                      type="text"
                      value={apSubnet}
                      onChange={e => setApSubnet(e.target.value)}
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium cn-text-3 mb-1">Wi-Fi interface (on the Pi)</label>
                    <input
                      type="text"
                      value={wifiInterface}
                      onChange={e => setWifiInterface(e.target.value)}
                      className={inputClass}
                    />
                  </div>
                </>
              )}
            </div>
          )}
        </details>

        {downloadError && (
          <p className="text-xs text-rose-600 dark:text-rose-400">{downloadError}</p>
        )}

        <button
          onClick={handleDownload}
          disabled={!canDownload}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors"
        >
          <Download className="w-4 h-4" />
          {platform === 'windows' ? 'Download Windows Setup Script' : 'Download Pi Setup Script'}
        </button>
        {!canDownload && (
          <p className="text-xs cn-text-4 text-center">
            {platform === 'windows'
              ? 'Fill in the SSID and an 8+ character password to enable the download.'
              : 'Fill in the LAN IP, SSID, and an 8+ character password to enable the download.'}
          </p>
        )}

        {downloaded && (
          <div className="space-y-3">
            <div className="p-4 rounded-xl bg-slate-900 dark:bg-black">
              <p className="text-xs text-slate-400 mb-2 font-mono">
                {platform === 'windows'
                  ? '# Open PowerShell as Administrator, then run:'
                  : '# On the Pi, open a terminal in the same folder, then run:'}
              </p>
              <div className="flex items-center gap-2">
                <code className="flex-1 text-sm text-green-400 font-mono break-all">{runCommand}</code>
                <CopyButton text={runCommand} />
              </div>
            </div>
            {platform === 'windows' && (
              <div className="p-3 rounded-xl bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 text-xs text-yellow-800 dark:text-yellow-200">
                <strong>Windows tip:</strong> Right-click PowerShell in the Start menu and choose{' '}
                <em>Run as Administrator</em> before pasting the command — the hotspot and DNS
                changes this script makes both require admin rights.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
