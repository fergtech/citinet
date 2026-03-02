/**
 * NodeCreationWizard — seamless hub creation flow
 *
 * Steps:
 *  1. Hub identity    — name, location, zip, description
 *  2. Access mode     — local LAN or Tailscale (worldwide); Tailscale asks for auth key
 *  3. Admin account   — username + password, set here in the UI (baked into config)
 *  4. Download script — OS-detected, one download, one command to copy
 *  5. Waiting         — polls localhost:9090/health automatically
 *  6. Live!           — hub is up; shows local + public URLs; enter hub button
 *
 * No file editing. No manual password generation. No terminal skills needed
 * beyond pasting one command.
 */

import { useState, useEffect, useRef } from 'react';
import {
  ArrowLeft, ArrowRight, MapPin, Eye, User, Lock,
  Download, Terminal, CheckCircle, ExternalLink,
  Loader2, Wifi, Copy, Check, EyeOff, Globe, Server, HardDrive, ChevronDown,
} from 'lucide-react';
import { LocationPicker, type LocationResult } from './LocationPicker';
import { motion, AnimatePresence } from 'motion/react';
import {
  type HubScriptConfig,
  type HubSecrets,
  generateSecrets,
  generateSlug,
  detectOS,
  downloadSetupScript,
  getRunCommand,
} from '../utils/scriptGenerator';

// ─────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────

type WizardStep = 'identity' | 'access' | 'admin' | 'download' | 'waiting' | 'live';

interface WizardData {
  // Step 1
  hubName: string;
  hubLocation: string;
  hubLat?: number;
  hubLng?: number;
  hubZip: string;
  hubDescription: string;
  dataDir: string;
  // Step 2
  visibility: 'local' | 'tailscale';
  tailscaleAuthKey: string;
  // Step 3
  adminUsername: string;
  adminPassword: string;
  adminPasswordConfirm: string;
}

interface HubLiveInfo {
  localUrl: string;
  tunnelUrl?: string;
  lanIp?: string;
}

interface NodeCreationWizardProps {
  onComplete: (nodeId: string, nodeName: string) => void;
  onBack: () => void;
}

// ─────────────────────────────────────────────────────────
// Small reusable components
// ─────────────────────────────────────────────────────────

function FieldLabel({ label, hint }: { label: string; hint?: string }) {
  return (
    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
      {label}
      {hint && <span className="text-slate-400 dark:text-slate-500 font-normal ml-1">({hint})</span>}
    </label>
  );
}

function TextInput({
  value, onChange, placeholder, type = 'text', autoFocus = false, maxLength,
}: {
  value: string; onChange: (v: string) => void; placeholder?: string;
  type?: string; autoFocus?: boolean; maxLength?: number;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      autoFocus={autoFocus}
      maxLength={maxLength}
      className="w-full p-3.5 border-2 border-slate-200 dark:border-zinc-700 rounded-xl
        text-slate-900 dark:text-white bg-white dark:bg-zinc-800
        focus:border-purple-500 focus:outline-none transition-colors"
    />
  );
}

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
      className="flex-shrink-0 p-2 rounded-lg bg-white dark:bg-zinc-700 hover:bg-slate-100
        dark:hover:bg-zinc-600 transition-colors border border-slate-200 dark:border-zinc-600"
      title="Copy to clipboard"
    >
      {copied
        ? <Check className="w-4 h-4 text-green-600 dark:text-green-400" />
        : <Copy className="w-4 h-4 text-slate-500 dark:text-slate-400" />}
    </button>
  );
}

// ─────────────────────────────────────────────────────────
// Progress bar (steps 1–4 only; waiting + live are post-wizard)
// ─────────────────────────────────────────────────────────

const PROGRESS_STEPS: WizardStep[] = ['identity', 'access', 'admin', 'download'];

function ProgressBar({ currentStep }: { currentStep: WizardStep }) {
  const idx = PROGRESS_STEPS.indexOf(currentStep);
  if (idx === -1) return null;
  const pct = ((idx + 1) / PROGRESS_STEPS.length) * 100;
  const labels = ['Hub Details', 'Access', 'Admin Account', 'Launch'];

  return (
    <div className="mb-8">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-slate-500 dark:text-slate-400">
          Step {idx + 1} of {PROGRESS_STEPS.length} — {labels[idx]}
        </span>
        <span className="text-sm font-semibold text-purple-600 dark:text-purple-400">
          {Math.round(pct)}%
        </span>
      </div>
      <div className="w-full bg-slate-200 dark:bg-zinc-700 rounded-full h-1.5">
        <motion.div
          className="bg-gradient-to-r from-blue-600 to-purple-600 h-1.5 rounded-full"
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.35 }}
        />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// Wizard
// ─────────────────────────────────────────────────────────

export function NodeCreationWizard({ onComplete, onBack }: NodeCreationWizardProps) {
  const [step, setStep] = useState<WizardStep>('identity');
  const [data, setData] = useState<WizardData>({
    hubName: '', hubLocation: '', hubZip: '', hubDescription: '', dataDir: '',
    visibility: 'local', tailscaleAuthKey: '',
    adminUsername: '', adminPassword: '', adminPasswordConfirm: '',
  });

  // Generated once when the user reaches the download step
  const secretsRef = useRef<HubSecrets | null>(null);
  const detectedOS = useRef<'windows' | 'mac' | 'linux'>(detectOS());
  const [scriptDownloaded, setScriptDownloaded] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Waiting step state
  const [pollAttempt, setPollAttempt] = useState(0);
  const [liveInfo, setLiveInfo] = useState<HubLiveInfo | null>(null);

  const set = (patch: Partial<WizardData>) => setData(d => ({ ...d, ...patch }));

  // ── Validation per step ────────────────────────────────
  const canProceed: Record<WizardStep, boolean> = {
    identity:
      data.hubName.trim().length >= 2 &&
      data.hubLat !== undefined,
    access:
      data.visibility === 'local' ||
      (data.visibility === 'tailscale' && data.tailscaleAuthKey.trim().length >= 10),
    admin:
      data.adminUsername.trim().length >= 2 &&
      data.adminPassword.length >= 8 &&
      data.adminPassword === data.adminPasswordConfirm,
    download: scriptDownloaded,
    waiting: false,
    live: true,
  };

  // ── Build config object ────────────────────────────────
  function buildConfig(): HubScriptConfig {
    if (!secretsRef.current) secretsRef.current = generateSecrets();
    return {
      hubName: data.hubName.trim(),
      hubSlug: generateSlug(data.hubName),
      hubLocation: data.hubLocation.trim(),
      hubDescription: data.hubDescription.trim(),
      visibility: data.visibility,
      tailscaleAuthKey: data.tailscaleAuthKey.trim() || undefined,
      adminUsername: data.adminUsername.trim(),
      adminPassword: data.adminPassword,
      secrets: secretsRef.current,
      generatedAt: new Date().toISOString(),
      dataDir: data.dataDir.trim() || undefined,
    };
  }

  // ── Advance step ───────────────────────────────────────
  const next = () => {
    const order: WizardStep[] = ['identity', 'access', 'admin', 'download', 'waiting', 'live'];
    const idx = order.indexOf(step);
    if (idx < order.length - 1) setStep(order[idx + 1]);
  };

  const back = () => {
    if (step === 'identity') { onBack(); return; }
    const order: WizardStep[] = ['identity', 'access', 'admin', 'download', 'waiting', 'live'];
    const idx = order.indexOf(step);
    // Don't go back from waiting/live
    if (step === 'waiting' || step === 'live') return;
    if (idx > 0) setStep(order[idx - 1]);
  };

  // ── Download script ────────────────────────────────────
  const handleDownload = () => {
    const config = buildConfig();
    downloadSetupScript(config, detectedOS.current);
    setScriptDownloaded(true);
  };

  // ── Poll localhost:9090/health when on waiting step ────
  useEffect(() => {
    if (step !== 'waiting') return;

    let cancelled = false;
    let attempt = 0;
    const MAX = 80; // ~4 minutes at 3s intervals

    const poll = async () => {
      while (attempt < MAX && !cancelled) {
        attempt++;
        setPollAttempt(attempt);
        try {
          const res = await fetch('http://localhost:9090/health', {
            signal: AbortSignal.timeout(3000),
          });
          if (res.ok) {
            // Hub is up — try to get extra info
            const info: HubLiveInfo = { localUrl: 'http://localhost:9090' };
            try {
              const infoRes = await fetch('http://localhost:9090/api/info', {
                signal: AbortSignal.timeout(3000),
              });
              if (infoRes.ok) {
                const json = await infoRes.json();
                if (json.tunnel_url) info.tunnelUrl = json.tunnel_url;
                if (json.lan_ip) info.lanIp = json.lan_ip;
              }
            } catch { /* info is optional */ }
            if (!cancelled) {
              setLiveInfo(info);
              setStep('live');
            }
            return;
          }
        } catch { /* not up yet */ }
        await new Promise(r => setTimeout(r, 3000));
      }
      // Timed out — still advance to live with just localhost URL
      if (!cancelled) {
        setLiveInfo({ localUrl: 'http://localhost:9090' });
        setStep('live');
      }
    };

    poll();
    return () => { cancelled = true; };
  }, [step]);

  // ── Complete — connect the creator directly ────────────
  const handleEnterHub = () => {
    const slug = generateSlug(data.hubName);
    onComplete(slug, data.hubName.trim());
  };

  const os = detectedOS.current;
  const osLabel = os === 'windows' ? 'Windows' : os === 'mac' ? 'macOS' : 'Linux';
  const runCommand = getRunCommand(os);

  // ─────────────────────────────────────────────────────
  // Waiting screen (full-screen, no card chrome)
  // ─────────────────────────────────────────────────────
  if (step === 'waiting') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-600 via-purple-600 to-pink-600
        flex flex-col items-center justify-center p-6 text-center">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="max-w-md w-full"
        >
          <div className="w-20 h-20 rounded-3xl bg-white/20 backdrop-blur flex items-center
            justify-center mx-auto mb-6">
            <Loader2 className="w-10 h-10 text-white animate-spin" />
          </div>
          <h2 className="text-3xl font-bold text-white mb-3">Waiting for your hub</h2>
          <p className="text-white/75 mb-2">
            Checking <code className="bg-white/20 px-2 py-0.5 rounded text-sm">localhost:9090</code>
            {' '}every 3 seconds
          </p>
          <p className="text-white/50 text-sm">
            Attempt {pollAttempt} — services typically take 30–60 seconds to start
          </p>
          <div className="mt-8 bg-white/10 backdrop-blur rounded-2xl p-5 text-left text-sm text-white/80">
            <p className="font-semibold text-white mb-2">Still waiting? Check your terminal:</p>
            <div className="flex items-center gap-2 bg-black/30 rounded-lg px-3 py-2 font-mono text-xs">
              <span className="flex-1">cd ~/citinet-hub && docker compose logs -f</span>
              <CopyButton text="cd ~/citinet-hub && docker compose logs -f" />
            </div>
          </div>
        </motion.div>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────
  // Live screen (hub is up)
  // ─────────────────────────────────────────────────────
  if (step === 'live') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-600 via-purple-600 to-pink-600
        flex flex-col items-center justify-center p-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-lg bg-white dark:bg-zinc-900 rounded-3xl shadow-2xl p-8"
        >
          <div className="text-center mb-8">
            <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-green-500 to-emerald-600
              flex items-center justify-center mx-auto mb-4">
              <CheckCircle className="w-10 h-10 text-white" />
            </div>
            <h2 className="text-3xl font-bold text-slate-900 dark:text-white mb-2">
              {data.hubName} is live!
            </h2>
            <p className="text-slate-500 dark:text-slate-400">
              Your hub is running and ready for neighbors to join.
            </p>
          </div>

          {/* URLs */}
          <div className="space-y-3 mb-8">
            <div className="flex items-center gap-3 p-4 rounded-xl bg-slate-50 dark:bg-zinc-800
              border-2 border-slate-200 dark:border-zinc-700">
              <Server className="w-5 h-5 text-slate-500 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs text-slate-500 dark:text-slate-400 mb-0.5">This machine</p>
                <p className="font-mono text-sm text-slate-900 dark:text-white">
                  {liveInfo?.localUrl ?? 'http://localhost:9090'}
                </p>
              </div>
              <CopyButton text={liveInfo?.localUrl ?? 'http://localhost:9090'} />
            </div>

            {liveInfo?.tunnelUrl && (
              <div className="flex items-center gap-3 p-4 rounded-xl bg-green-50 dark:bg-green-900/20
                border-2 border-green-200 dark:border-green-800">
                <Globe className="w-5 h-5 text-green-600 dark:text-green-400 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-green-700 dark:text-green-400 mb-0.5">
                    Public via Tailscale — share this with anyone
                  </p>
                  <p className="font-mono text-sm text-green-900 dark:text-green-200 break-all">
                    {liveInfo.tunnelUrl}
                  </p>
                </div>
                <CopyButton text={liveInfo.tunnelUrl} />
              </div>
            )}

            {data.visibility === 'local' && liveInfo?.lanIp && (
              <div className="flex items-center gap-3 p-4 rounded-xl bg-blue-50 dark:bg-blue-900/20
                border-2 border-blue-200 dark:border-blue-800">
                <Wifi className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-blue-700 dark:text-blue-400 mb-0.5">
                    Local network — share with neighbors on your Wi-Fi
                  </p>
                  <p className="font-mono text-sm text-blue-900 dark:text-blue-200">
                    http://{liveInfo.lanIp}:9090
                  </p>
                </div>
                <CopyButton text={`http://${liveInfo.lanIp}:9090`} />
              </div>
            )}

            {data.visibility === 'local' && !liveInfo?.lanIp && (
              <div className="p-4 rounded-xl bg-blue-50 dark:bg-blue-900/20
                border-2 border-blue-200 dark:border-blue-800 text-sm text-blue-800 dark:text-blue-200">
                <p className="font-semibold mb-1">Sharing with neighbors on your network?</p>
                <p className="text-blue-700 dark:text-blue-300">
                  Find your machine's local IP (run <code className="bg-blue-100 dark:bg-blue-900/40
                  px-1 rounded">ipconfig</code> on Windows or <code className="bg-blue-100
                  dark:bg-blue-900/40 px-1 rounded">ifconfig</code> on Mac/Linux) and share
                  <code className="bg-blue-100 dark:bg-blue-900/40 px-1 rounded ml-1">
                    http://YOUR-IP:9090
                  </code>
                </p>
              </div>
            )}
          </div>

          <button
            onClick={handleEnterHub}
            className="w-full py-4 bg-gradient-to-r from-blue-600 to-purple-600 text-white
              rounded-xl font-bold hover:from-blue-700 hover:to-purple-700 transition-all
              flex items-center justify-center gap-2 shadow-lg hover:shadow-xl hover:scale-[1.02]
              active:scale-95"
          >
            Enter {data.hubName}
            <ArrowRight className="w-5 h-5" />
          </button>
        </motion.div>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────
  // Main wizard card (steps 1–4)
  // ─────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-600 via-purple-600 to-pink-600
      relative overflow-hidden flex flex-col">
      {/* Background pattern */}
      <svg className="absolute inset-0 w-full h-full opacity-20" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <pattern id="wp" x="0" y="0" width="200" height="200" patternUnits="userSpaceOnUse">
            <path d="M 0 100 Q 50 50 100 100 T 200 100" stroke="white" strokeWidth="1.5" fill="none" />
            <path d="M 0 150 Q 50 100 100 150 T 200 150" stroke="white" strokeWidth="1.5" fill="none" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#wp)" />
      </svg>

      {/* Back button */}
      <div className="relative z-10 p-6">
        <button
          onClick={back}
          className="flex items-center gap-2 text-white hover:text-white/80 transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
          <span className="font-medium">{step === 'identity' ? 'Home' : 'Back'}</span>
        </button>
      </div>

      {/* Card */}
      <div className="flex-1 flex items-center justify-center p-6 relative z-10">
        <div className="w-full max-w-2xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white dark:bg-zinc-900 rounded-3xl shadow-2xl p-8"
          >
            <ProgressBar currentStep={step} />

            <AnimatePresence mode="wait">
              <motion.div
                key={step}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.2 }}
              >
                {/* ── Step 1: Identity ──────────────────── */}
                {step === 'identity' && (
                  <div className="space-y-5">
                    <div className="flex items-center gap-4 mb-6">
                      <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-600 to-purple-600
                        flex items-center justify-center flex-shrink-0">
                        <MapPin className="w-6 h-6 text-white" />
                      </div>
                      <div>
                        <h2 className="text-2xl font-bold text-slate-900 dark:text-white">
                          Name Your Community Hub
                        </h2>
                        <p className="text-sm text-slate-500 dark:text-slate-400">
                          This is what neighbors will see when they discover your hub
                        </p>
                      </div>
                    </div>

                    <div>
                      <FieldLabel label="Hub Name" />
                      <TextInput
                        value={data.hubName}
                        onChange={v => set({ hubName: v })}
                        placeholder="e.g., Highland Park, Eagle Rock Commons, Westside Hub…"
                        autoFocus
                        maxLength={60}
                      />
                    </div>
                    <div>
                      <FieldLabel label="Neighborhood / City" />
                      <LocationPicker
                        defaultValue={data.hubLocation}
                        placeholder="e.g., Highland Park, Eagle Rock, Riverdale…"
                        onSelect={(result: LocationResult | null) => {
                          if (result) {
                            set({
                              hubLocation: result.displayName,
                              hubLat: result.lat,
                              hubLng: result.lng,
                              hubZip: result.postcode || data.hubZip,
                            });
                          } else {
                            set({ hubLat: undefined, hubLng: undefined });
                          }
                        }}
                      />
                      {!data.hubLat && (
                        <p className="text-xs text-slate-400 dark:text-slate-500 mt-1.5 ml-1">
                          Type your neighborhood or city and select from the suggestions
                        </p>
                      )}
                      {data.hubLat && (
                        <p className="text-xs text-green-600 dark:text-green-400 mt-1.5 ml-1 flex items-center gap-1">
                          <CheckCircle className="w-3.5 h-3.5" />
                          Location confirmed — your hub will appear on the map
                        </p>
                      )}
                    </div>
                    <div>
                      <FieldLabel label="Description" hint="optional" />
                      <textarea
                        value={data.hubDescription}
                        onChange={e => set({ hubDescription: e.target.value })}
                        placeholder="Tell neighbors what this hub is for…"
                        rows={3}
                        className="w-full p-3.5 border-2 border-slate-200 dark:border-zinc-700 rounded-xl
                          text-slate-900 dark:text-white bg-white dark:bg-zinc-800
                          focus:border-purple-500 focus:outline-none transition-colors resize-none"
                      />
                    </div>

                    {/* Advanced — data directory */}
                    <div className="border border-slate-200 dark:border-zinc-700 rounded-xl overflow-hidden">
                      <button
                        type="button"
                        onClick={() => setShowAdvanced(v => !v)}
                        className="w-full flex items-center justify-between px-4 py-3 text-sm text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-zinc-800 transition-colors"
                      >
                        <span className="flex items-center gap-2">
                          <HardDrive className="w-4 h-4" />
                          Advanced
                        </span>
                        <ChevronDown className={`w-4 h-4 transition-transform ${showAdvanced ? 'rotate-180' : ''}`} />
                      </button>
                      {showAdvanced && (
                        <div className="px-4 pb-4 pt-1 bg-slate-50 dark:bg-zinc-800/50 border-t border-slate-200 dark:border-zinc-700">
                          <FieldLabel label="Data storage location" hint="optional" />
                          <TextInput
                            value={data.dataDir}
                            onChange={v => set({ dataDir: v })}
                            placeholder="e.g. H:\citinet-hub\data  or  /mnt/data/citinet"
                          />
                          <p className="text-xs text-slate-400 dark:text-slate-500 mt-1.5 ml-1">
                            Where Docker stores hub data (Postgres, files, cache). Leave blank to use Docker's default location on your system drive.
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* ── Step 2: Access ────────────────────── */}
                {step === 'access' && (
                  <div className="space-y-5">
                    <div className="flex items-center gap-4 mb-6">
                      <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-600 to-purple-600
                        flex items-center justify-center flex-shrink-0">
                        <Eye className="w-6 h-6 text-white" />
                      </div>
                      <div>
                        <h2 className="text-2xl font-bold text-slate-900 dark:text-white">
                          How will people access your hub?
                        </h2>
                        <p className="text-sm text-slate-500 dark:text-slate-400">
                          You can change this later
                        </p>
                      </div>
                    </div>

                    {/* Local option */}
                    <button
                      onClick={() => set({ visibility: 'local' })}
                      className={`w-full p-5 rounded-2xl border-2 text-left transition-all ${
                        data.visibility === 'local'
                          ? 'border-purple-500 bg-purple-50 dark:bg-purple-900/20'
                          : 'border-slate-200 dark:border-zinc-700 hover:border-slate-300 dark:hover:border-zinc-600'
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <div className={`w-5 h-5 rounded-full border-2 flex-shrink-0 mt-0.5 flex items-center justify-center ${
                          data.visibility === 'local'
                            ? 'border-purple-500 bg-purple-500'
                            : 'border-slate-300 dark:border-zinc-600'
                        }`}>
                          {data.visibility === 'local' && (
                            <div className="w-2 h-2 rounded-full bg-white" />
                          )}
                        </div>
                        <div>
                          <h3 className="font-semibold text-slate-900 dark:text-white mb-1">
                            Local Network Only
                          </h3>
                          <p className="text-sm text-slate-600 dark:text-slate-400">
                            Neighbors connect using your machine's local IP address (e.g.
                            <code className="bg-slate-100 dark:bg-zinc-700 px-1 rounded ml-1 text-xs">
                              192.168.x.x:9090
                            </code>). Great for starting out — no accounts or tunnels needed.
                          </p>
                        </div>
                      </div>
                    </button>

                    {/* Tailscale option */}
                    <button
                      onClick={() => set({ visibility: 'tailscale' })}
                      className={`w-full p-5 rounded-2xl border-2 text-left transition-all ${
                        data.visibility === 'tailscale'
                          ? 'border-purple-500 bg-purple-50 dark:bg-purple-900/20'
                          : 'border-slate-200 dark:border-zinc-700 hover:border-slate-300 dark:hover:border-zinc-600'
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <div className={`w-5 h-5 rounded-full border-2 flex-shrink-0 mt-0.5 flex items-center justify-center ${
                          data.visibility === 'tailscale'
                            ? 'border-purple-500 bg-purple-500'
                            : 'border-slate-300 dark:border-zinc-600'
                        }`}>
                          {data.visibility === 'tailscale' && (
                            <div className="w-2 h-2 rounded-full bg-white" />
                          )}
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <h3 className="font-semibold text-slate-900 dark:text-white">
                              Public via Tailscale
                            </h3>
                            <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 dark:bg-green-900/30
                              text-green-700 dark:text-green-400 font-medium">
                              Worldwide
                            </span>
                          </div>
                          <p className="text-sm text-slate-600 dark:text-slate-400">
                            Your hub gets a permanent HTTPS URL (
                            <code className="bg-slate-100 dark:bg-zinc-700 px-1 rounded text-xs">
                              https://your-hub.ts.net
                            </code>
                            ) reachable from anywhere. The setup script handles Tailscale
                            installation and authentication automatically — you just need a
                            free Tailscale account and an auth key.
                          </p>
                        </div>
                      </div>
                    </button>

                    {/* Tailscale auth key input */}
                    <AnimatePresence>
                      {data.visibility === 'tailscale' && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          exit={{ opacity: 0, height: 0 }}
                          className="overflow-hidden"
                        >
                          <div className="p-5 rounded-2xl bg-slate-50 dark:bg-zinc-800
                            border-2 border-slate-200 dark:border-zinc-700 space-y-3">
                            <div className="flex items-center justify-between">
                              <p className="text-sm font-semibold text-slate-800 dark:text-white">
                                Tailscale Auth Key
                              </p>
                              <a
                                href="https://login.tailscale.com/admin/settings/keys"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-1 text-xs text-purple-600 dark:text-purple-400
                                  hover:underline"
                              >
                                Generate a key
                                <ExternalLink className="w-3 h-3" />
                              </a>
                            </div>
                            <input
                              type="text"
                              value={data.tailscaleAuthKey}
                              onChange={e => set({ tailscaleAuthKey: e.target.value })}
                              placeholder="tskey-auth-…"
                              className="w-full p-3 border-2 border-slate-200 dark:border-zinc-700 rounded-xl
                                text-slate-900 dark:text-white bg-white dark:bg-zinc-900 font-mono text-sm
                                focus:border-purple-500 focus:outline-none transition-colors"
                            />
                            <p className="text-xs text-slate-500 dark:text-slate-400">
                              In Tailscale → Settings → Keys, create a <strong>reusable</strong> auth key.
                              One key can be used for multiple hubs. The key is embedded in your
                              setup script and used to authenticate without a browser login.
                            </p>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                )}

                {/* ── Step 3: Admin account ─────────────── */}
                {step === 'admin' && (
                  <div className="space-y-5">
                    <div className="flex items-center gap-4 mb-6">
                      <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-600 to-purple-600
                        flex items-center justify-center flex-shrink-0">
                        <User className="w-6 h-6 text-white" />
                      </div>
                      <div>
                        <h2 className="text-2xl font-bold text-slate-900 dark:text-white">
                          Create your admin account
                        </h2>
                        <p className="text-sm text-slate-500 dark:text-slate-400">
                          This becomes the hub's admin — baked into the configuration automatically
                        </p>
                      </div>
                    </div>

                    <div>
                      <FieldLabel label="Admin Username" />
                      <TextInput
                        value={data.adminUsername}
                        onChange={v => set({ adminUsername: v.replace(/\s/g, '') })}
                        placeholder="admin"
                        autoFocus
                        maxLength={30}
                      />
                      {data.adminUsername.length > 0 && data.adminUsername.trim().length < 2 && (
                        <p className="text-xs text-red-500 mt-1">At least 2 characters</p>
                      )}
                    </div>

                    <div>
                      <FieldLabel label="Password" />
                      <div className="relative">
                        <input
                          type={showPassword ? 'text' : 'password'}
                          value={data.adminPassword}
                          onChange={e => set({ adminPassword: e.target.value })}
                          placeholder="At least 8 characters"
                          className="w-full p-3.5 pr-12 border-2 border-slate-200 dark:border-zinc-700
                            rounded-xl text-slate-900 dark:text-white bg-white dark:bg-zinc-800
                            focus:border-purple-500 focus:outline-none transition-colors"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(p => !p)}
                          className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400
                            hover:text-slate-600 dark:hover:text-slate-300"
                        >
                          {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                        </button>
                      </div>
                      {data.adminPassword.length > 0 && data.adminPassword.length < 8 && (
                        <p className="text-xs text-red-500 mt-1">At least 8 characters</p>
                      )}
                    </div>

                    <div>
                      <FieldLabel label="Confirm Password" />
                      <div className="relative">
                        <input
                          type={showPassword ? 'text' : 'password'}
                          value={data.adminPasswordConfirm}
                          onChange={e => set({ adminPasswordConfirm: e.target.value })}
                          placeholder="Repeat password"
                          className={`w-full p-3.5 border-2 rounded-xl text-slate-900 dark:text-white
                            bg-white dark:bg-zinc-800 focus:outline-none transition-colors ${
                            data.adminPasswordConfirm && data.adminPasswordConfirm !== data.adminPassword
                              ? 'border-red-400 dark:border-red-600 focus:border-red-400'
                              : 'border-slate-200 dark:border-zinc-700 focus:border-purple-500'
                          }`}
                        />
                      </div>
                      {data.adminPasswordConfirm && data.adminPasswordConfirm !== data.adminPassword && (
                        <p className="text-xs text-red-500 mt-1">Passwords don't match</p>
                      )}
                    </div>

                    <div className="flex items-start gap-3 p-4 rounded-xl bg-blue-50 dark:bg-blue-900/20
                      border border-blue-200 dark:border-blue-800">
                      <Lock className="w-4 h-4 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
                      <p className="text-xs text-blue-800 dark:text-blue-200">
                        All secrets (database password, JWT key, storage keys) are generated
                        automatically using your browser's cryptographic random generator.
                        You never need to touch them.
                      </p>
                    </div>
                  </div>
                )}

                {/* ── Step 4: Download & run ────────────── */}
                {step === 'download' && (
                  <div className="space-y-5">
                    <div className="flex items-center gap-4 mb-6">
                      <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-600 to-purple-600
                        flex items-center justify-center flex-shrink-0">
                        <Terminal className="w-6 h-6 text-white" />
                      </div>
                      <div>
                        <h2 className="text-2xl font-bold text-slate-900 dark:text-white">
                          Download &amp; launch
                        </h2>
                        <p className="text-sm text-slate-500 dark:text-slate-400">
                          One script. One command. Everything is pre-configured.
                        </p>
                      </div>
                    </div>

                    {/* What the script does */}
                    <div className="p-4 rounded-xl bg-slate-50 dark:bg-zinc-800
                      border border-slate-200 dark:border-zinc-700">
                      <p className="text-xs font-semibold text-slate-500 dark:text-slate-400
                        uppercase tracking-wide mb-3">
                        Your {osLabel} setup script will:
                      </p>
                      <ul className="space-y-2 text-sm text-slate-700 dark:text-slate-300">
                        {[
                          'Create a citinet-hub folder in your home directory',
                          'Write your hub configuration (all secrets pre-generated)',
                          'Install Docker if not already installed',
                          data.visibility === 'tailscale'
                            ? 'Install Tailscale, authenticate with your key, enable public Funnel'
                            : 'Configure for local network access',
                          'Start the hub stack with docker compose',
                          'Wait for your hub to come online, then report back here',
                        ].map((item, i) => (
                          <li key={i} className="flex items-start gap-2">
                            <CheckCircle className="w-4 h-4 text-green-600 dark:text-green-400
                              flex-shrink-0 mt-0.5" />
                            {item}
                          </li>
                        ))}
                      </ul>
                    </div>

                    {/* Download button */}
                    <button
                      onClick={handleDownload}
                      className={`w-full py-4 rounded-xl font-bold flex items-center justify-center
                        gap-2 transition-all ${
                        scriptDownloaded
                          ? 'bg-green-600 text-white cursor-default'
                          : 'bg-gradient-to-r from-blue-600 to-purple-600 text-white hover:from-blue-700 hover:to-purple-700 shadow-lg hover:shadow-xl hover:scale-[1.02] active:scale-95'
                      }`}
                    >
                      {scriptDownloaded ? (
                        <>
                          <CheckCircle className="w-5 h-5" />
                          Downloaded — citinet-setup.{os === 'windows' ? 'ps1' : 'sh'}
                        </>
                      ) : (
                        <>
                          <Download className="w-5 h-5" />
                          Download Setup Script for {osLabel}
                        </>
                      )}
                    </button>

                    {/* Run command */}
                    {scriptDownloaded && (
                      <motion.div
                        initial={{ opacity: 0, y: -8 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="space-y-3"
                      >
                        <div className="p-4 rounded-xl bg-slate-900 dark:bg-black">
                          <p className="text-xs text-slate-400 mb-2 font-mono">
                            {os === 'windows'
                              ? '# Open PowerShell as Administrator, then run:'
                              : '# Open Terminal, then run:'}
                          </p>
                          <div className="flex items-center gap-2">
                            <code className="flex-1 text-sm text-green-400 font-mono break-all">
                              {runCommand}
                            </code>
                            <CopyButton text={runCommand} />
                          </div>
                        </div>

                        {os === 'windows' && (
                          <div className="p-3 rounded-xl bg-yellow-50 dark:bg-yellow-900/20
                            border border-yellow-200 dark:border-yellow-800 text-xs
                            text-yellow-800 dark:text-yellow-200">
                            <strong>Windows tip:</strong> Right-click PowerShell in the Start menu
                            and choose <em>Run as Administrator</em> before pasting the command.
                            Docker Desktop installation requires admin rights.
                          </div>
                        )}

                        <p className="text-center text-sm text-slate-500 dark:text-slate-400">
                          Run the command, then click below to watch your hub come online.
                        </p>
                      </motion.div>
                    )}
                  </div>
                )}
              </motion.div>
            </AnimatePresence>

            {/* Navigation buttons */}
            <div className="flex gap-3 mt-8">
                <button
                  onClick={back}
                  className="flex-1 px-6 py-3.5 border-2 border-slate-200 dark:border-zinc-700
                    text-slate-700 dark:text-slate-300 rounded-xl font-semibold
                    hover:bg-slate-50 dark:hover:bg-zinc-800 transition-colors"
                >
                  {step === 'identity' ? 'Cancel' : 'Back'}
                </button>
                <button
                  onClick={step === 'download' ? next : next}
                  disabled={!canProceed[step]}
                  className={`flex-1 px-6 py-3.5 rounded-xl font-bold text-white flex items-center
                    justify-center gap-2 transition-all ${
                    canProceed[step]
                      ? 'bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 shadow-lg hover:shadow-xl hover:scale-[1.02] active:scale-95'
                      : 'bg-slate-200 dark:bg-zinc-700 text-slate-400 dark:text-slate-500 cursor-not-allowed'
                  }`}
                >
                  {step === 'download' ? (
                    <>
                      <Wifi className="w-5 h-5" />
                      I ran it — watch for my hub
                    </>
                  ) : (
                    <>
                      Continue
                      <ArrowRight className="w-5 h-5" />
                    </>
                  )}
                </button>
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
