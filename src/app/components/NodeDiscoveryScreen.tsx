/**
 * NodeDiscoveryScreen — unified hub join flow
 *
 * Two ways to join, one screen:
 *  1. Browse the hub directory (top section)
 *  2. Enter a hub URL directly (bottom section, always visible)
 *
 * Selecting a hub from the directory OR entering a URL triggers the same
 * probe → auth flow.
 */

import { useState, useEffect, useRef } from 'react';
import {
  Loader2, AlertCircle,
  Globe, User, Lock, Eye, EyeOff, Mail,
  RefreshCw, WifiOff, Users, MapPin, Search, ChevronLeft, Info, X,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useSearchParams } from 'react-router-dom';
import { hubService } from '../services/hubService';
import { clearSubdomainCache } from '../utils/subdomain';
import { registryService, type RegistryHub } from '../services/registryService';
import type { Hub, HubInfoResponse, HubStatusResponse } from '../types/hub';
import { OnboardingBackground } from './OnboardingBackground';
import { HubIcon } from './HubIcon';
import { CitinetLogo } from './CitinetLogo';

interface NodeDiscoveryScreenProps {
  onNodeFound: (hubSlug: string, hubName: string, hub: Hub) => void;
  onBack: () => void;
}

type JoinStep = 'browse' | 'probing' | 'auth' | 'error';
type AuthMode = 'signup' | 'login';

const HUB_URL_HISTORY_KEY = 'hubUrlHistory';

function getHubUrlHistory(): string[] {
  try {
    const raw = localStorage.getItem(HUB_URL_HISTORY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function addHubUrlToHistory(url: string) {
  const trimmed = url.trim();
  if (!trimmed) return;
  const history = [trimmed, ...getHubUrlHistory().filter(u => u !== trimmed)].slice(0, 10);
  localStorage.setItem(HUB_URL_HISTORY_KEY, JSON.stringify(history));
}

export function NodeDiscoveryScreen({ onNodeFound, onBack }: NodeDiscoveryScreenProps) {
  const [searchParams] = useSearchParams();

  // ── Step state ──
  const [step, setStep] = useState<JoinStep>('browse');
  const [authMode, setAuthMode] = useState<AuthMode>('login');

  // ── Directory state ──
  const [registryHubs, setRegistryHubs] = useState<RegistryHub[]>([]);
  const [registryLoading, setRegistryLoading] = useState(true);
  const [registryRefreshKey, setRegistryRefreshKey] = useState(0);
  // Slug currently running the quick-enter session-verify check (see
  // handleQuickEnter) -- shows a busy state on just that row.
  const [quickEnterSlug, setQuickEnterSlug] = useState<string | null>(null);
  const [hubSearchQuery, setHubSearchQuery] = useState('');
  const filteredRegistryHubs = registryHubs.filter(hub => {
    const q = hubSearchQuery.trim().toLowerCase();
    if (!q) return true;
    return (
      hub.name.toLowerCase().includes(q) ||
      (hub.location ?? '').toLowerCase().includes(q) ||
      (hub.description ?? '').toLowerCase().includes(q)
    );
  });

  // ── URL input state ──
  const [urlOpen, setUrlOpen] = useState(false);
  const [tunnelUrl, setTunnelUrl] = useState(() => searchParams.get('url') ?? '');
  const [urlHistory, setUrlHistory] = useState<string[]>([]);

  // ── Probe state ──
  const [probingHubName, setProbingHubName] = useState('');
  const [probeInfo, setProbeInfo] = useState<HubInfoResponse | null>(null);
  const [probeStatus, setProbeStatus] = useState<HubStatusResponse | null>(null);
  const [probeError, setProbeError] = useState('');
  const [skipProbe, setSkipProbe] = useState(false);

  // ── Auth state ──
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [email, setEmail] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [joining, setJoining] = useState(false);
  const [authError, setAuthError] = useState('');

  const urlInputRef = useRef<HTMLInputElement>(null);

  // Fetch registry on mount / refresh
  useEffect(() => {
    let cancelled = false;
    setRegistryLoading(true);
    registryService.getHubs().then((hubs) => {
      if (cancelled) return;
      setRegistryHubs(hubs);
      setRegistryLoading(false);
    });
    return () => { cancelled = true; };
  }, [registryRefreshKey]);

  // Load URL history + handle ?url= pre-fill from directory
  useEffect(() => {
    setUrlHistory(getHubUrlHistory());
    const prefilledUrl = searchParams.get('url');
    if (prefilledUrl) {
      setTunnelUrl(prefilledUrl);
      setUrlOpen(true);
      // Auto-probe after a brief paint delay
      const t = setTimeout(() => handleProbeUrl(prefilledUrl), 150);
      return () => clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Helpers ──

  const isValidUrl = (url: string): boolean => {
    const trimmed = url.trim();
    if (!trimmed) return false;
    try {
      new URL(hubService.normalizeTunnelUrl(trimmed));
      return true;
    } catch { return false; }
  };

  const handleProbeUrl = async (url: string) => {
    if (!isValidUrl(url)) return;
    addHubUrlToHistory(url);
    setUrlHistory(getHubUrlHistory());
    setProbingHubName('');
    setStep('probing');
    setProbeError('');
    setProbeInfo(null);
    setProbeStatus(null);

    const result = await hubService.probeHub(url);
    if (result.success && result.info) {
      setProbeInfo(result.info);
      setProbeStatus(result.status || null);
      setStep('auth');
    } else {
      setProbeError(result.error || 'Could not reach hub');
      setStep('error');
    }
  };

  const handleProbeDirectoryHub = async (hub: RegistryHub) => {
    setProbingHubName(hub.name);
    setTunnelUrl(hub.tunnel_url);
    await handleProbeUrl(hub.tunnel_url);
  };

  // A hub we already have a valid session for (isOnboarded) shouldn't make
  // someone re-type credentials -- but isOnboarded() only checks that SOME
  // token string is stored, never that the server still accepts it. A stale/
  // expired token would otherwise look like a successful "quick enter" (page
  // shell loads, unauthenticated data like member counts still works) while
  // every authenticated call -- avatars, images, everything -- silently
  // 401s, only surfacing as broken on the next reload. So this actually
  // verifies with the server first (the same lightweight session-status
  // check the pending-approval screen uses) and only then hands back the
  // real stored Hub straight to onNodeFound, same as a fresh login would. A
  // token that no longer works falls back to a real login instead of a
  // silently-broken "logged in" state.
  const handleQuickEnter = async (hub: RegistryHub) => {
    const connection = hubService.getHubConnection(hub.slug);
    if (!connection) return; // shouldn't happen -- caller only offers this when isOnboarded() is true
    setQuickEnterSlug(hub.slug);
    const status = await hubService.checkAccountStatus(hub.slug);
    setQuickEnterSlug(null);
    if (status === null) {
      handleProbeDirectoryHub(hub);
      return;
    }
    onNodeFound(hub.slug, connection.hub.name, connection.hub);
  };

  const isValidEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

  const canSubmit = authMode === 'login'
    ? (probeInfo != null && username.trim().length >= 2 && password.length >= 1)
    : (probeInfo != null && username.trim().length >= 2 && password.length >= 4
        && password === confirmPassword && isValidEmail(email));

  const switchAuthMode = (mode: AuthMode) => {
    setAuthMode(mode);
    setAuthError('');
    setEmail('');
    setConfirmPassword('');
  };

  const handleAuth = async () => {
    if (!canSubmit || !probeInfo) return;
    setJoining(true);
    setAuthError('');

    let hub: Awaited<ReturnType<typeof hubService.joinHub>> | null = null;
    try {
      hub = await hubService.joinHub(tunnelUrl, probeInfo, probeStatus || undefined);

      if (authMode === 'signup') {
        await hubService.registerUser(hub.slug, {
          username: username.trim(),
          password,
          email: email.trim(),
        });
      } else {
        await hubService.loginUser(hub.slug, {
          username: username.trim(),
          password,
        });
      }

      // Recover (or generate) encryption keys in the background — never blocks auth.
      // This entry point doesn't have the full recovery-phrase UI (see
      // NodeEntryFlow for that); a legacy password-wrapped backup still
      // upgrades transparently, but a device that genuinely needs a phrase
      // just starts fresh here rather than prompting — manage/restore keys
      // properly from Account settings after landing in the hub.
      const hubSlugForKeys = hub.slug;
      hubService.ensureUserKeys(hubSlugForKeys).then(async ({ status }) => {
        // 'has-keys-new-backup' already created the backup server-side inside
        // ensureUserKeys -- the phrase just isn't shown here (see NodeEntryFlow
        // for that UI); the user can view/regenerate it from Account settings.
        // 'check-failed' means ensureUserKeys couldn't confirm whether a backup
        // exists (network/tunnel failure, not a real absence) -- do nothing here.
        // 'no-backup' is now only ever returned on a confirmed 404, so it's safe
        // to treat as "genuinely brand new" -- see [[e2e_encryption]] memory for
        // the incident this used to cause when the two were conflated.
        if (status === 'no-backup') {
          await hubService.setupNewAccountKeys(hubSlugForKeys);
        } else if (status === 'needs-recovery') {
          // Deliberately does NOT fall back to generateFreshDeviceKeys on
          // failure here (unlike the old behavior) -- silently minting
          // unrelated keys with no confirmation is what caused a real
          // content-loss incident via this same fallback in NodeEntryFlow.
          // Leaving local keys unset if this fails means notes/DMs stay
          // inaccessible until the user restores properly from Account
          // settings, which is recoverable; silently replacing keys wasn't.
          await hubService.restoreFromKeyBackup(hubSlugForKeys, password).catch(() => false);
        }
      }).catch(() => {});

      onNodeFound(hub.slug, hub.name, hub);
    } catch (err) {
      // If auth failed after joinHub already saved a partial connection,
      // clean it up so the user isn't stuck in an unauthenticated state
      // that would redirect them to onboarding on the next visit.
      if (hub) { hubService.leaveHub(hub.slug); clearSubdomainCache(); }

      const msg = err instanceof Error ? err.message : String(err);
      setAuthError(
        authMode === 'login'
          ? (msg.includes('401') || msg.toLowerCase().includes('invalid'))
            ? 'Invalid username or password.'
            : `Login failed: ${msg}`
          : (msg.includes('409') || msg.toLowerCase().includes('exists'))
            ? 'Username already taken. Try logging in instead.'
            : `Failed to create account: ${msg}`
      );
    } finally {
      setJoining(false);
    }
  };

  const resetToBrowse = () => {
    setStep('browse');
    setProbeInfo(null);
    setProbeStatus(null);
    setProbeError('');
    setAuthError('');
    setSkipProbe(false);
    setUsername('');
    setPassword('');
    setEmail('');
    setConfirmPassword('');
  };

  /** Skip the probe and go straight to auth with a name derived from the URL */
  const handleConnectAnyway = () => {
    const normalized = hubService.normalizeTunnelUrl(tunnelUrl);
    let guessedName = 'Hub';
    try {
      const host = new URL(normalized).hostname;
      guessedName = host.split('.')[0] || 'Hub';
    } catch { /* ignore */ }
    setProbeInfo({ name: guessedName, node_id: '' });
    setProbeStatus(null);
    setSkipProbe(true);
    setStep('auth');
    setAuthMode('login'); // likely re-joining, default to login
  };

  return (
    <div
      className="min-h-[var(--app-height,100dvh)] relative overflow-hidden flex flex-col"
      style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <OnboardingBackground />

      {/* Main Content */}
      <div className="flex-1 flex flex-col p-4 pb-8 items-center justify-center relative z-10">
        <div className="w-full max-w-lg mx-auto flex flex-col gap-4">

          {/* ───── Step: Browse / Input ───── */}
          {/* Follows the Citinet Design System's ConnectScreen (ui_kits/hub/app.jsx) closely:
              single glass card, live name search over the registry, a small hub-identity
              badge per result row, and the manual-URL fallback collapsed inline below the
              list rather than as a separate card. */}
          {step === 'browse' && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="cn-glass rounded-3xl shadow-2xl p-6 relative z-10 max-w-[420px] w-full mx-auto"
            >
              <div className="flex items-center justify-between mb-4">
                <button
                  onClick={onBack}
                  className="inline-flex items-center gap-1 text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 text-xs font-semibold transition-colors"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />Home
                </button>
                <button
                  onClick={() => setRegistryRefreshKey(k => k + 1)}
                  disabled={registryLoading}
                  className="inline-flex items-center gap-1 text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 text-xs font-semibold transition-colors disabled:opacity-40"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${registryLoading ? 'animate-spin' : ''}`} />Refresh
                </button>
              </div>

              <div className="flex flex-col items-center text-center gap-1 mb-5">
                <CitinetLogo size={44} className="mb-2" />
                <h2 className="text-xl font-bold text-slate-900 dark:text-white">Find a Hub</h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">Connect to your community's hub</p>
              </div>

              <div className="relative mb-3">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  value={hubSearchQuery}
                  onChange={(e) => setHubSearchQuery(e.target.value)}
                  placeholder="Search by name, area, or description…"
                  className="w-full pl-10 pr-3 py-2.5 border-2 border-slate-200 dark:border-zinc-700 rounded-xl text-slate-900 dark:text-white bg-white dark:bg-zinc-800 focus:border-purple-500 focus:outline-none transition-colors text-sm"
                />
              </div>

              <div className="flex flex-col gap-1 max-h-64 overflow-y-auto">
                {registryLoading && (
                  <div className="flex items-center justify-center gap-2 py-6 text-slate-400 dark:text-zinc-500">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span className="text-sm">Fetching hubs…</span>
                  </div>
                )}

                {!registryLoading && filteredRegistryHubs.length === 0 && (
                  <p className="text-xs text-slate-500 dark:text-slate-400 px-1 py-2">
                    {registryHubs.length === 0 ? 'No hubs registered yet — enter a URL below.' : 'No hubs found — enter a URL below.'}
                  </p>
                )}

                {!registryLoading && filteredRegistryHubs.map((hub) => (
                  <DirectoryHubRow
                    key={hub.id}
                    hub={hub}
                    alreadyJoined={hubService.isOnboarded(hub.slug)}
                    entering={quickEnterSlug === hub.slug}
                    onJoin={() => handleProbeDirectoryHub(hub)}
                    onQuickEnter={() => handleQuickEnter(hub)}
                  />
                ))}
              </div>

              <button
                onClick={() => {
                  setUrlOpen(o => !o);
                  if (!urlOpen) setTimeout(() => urlInputRef.current?.focus(), 150);
                }}
                className="mt-3 text-xs text-slate-400 dark:text-slate-500 underline hover:no-underline"
              >
                {urlOpen ? 'Hide' : 'Enter tunnel URL manually'}
              </button>

              <AnimatePresence initial={false}>
                {urlOpen && (
                  <motion.div
                    key="url-panel"
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2, ease: 'easeInOut' }}
                    className="overflow-hidden"
                  >
                    <div className="pt-3 space-y-2">
                      <div className="relative">
                        <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <input
                          ref={urlInputRef}
                          type="url"
                          value={tunnelUrl}
                          onChange={(e) => setTunnelUrl(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && isValidUrl(tunnelUrl) && handleProbeUrl(tunnelUrl)}
                          placeholder="e.g., https://myhub.tailXXX.ts.net"
                          className="w-full pl-10 pr-3 py-2.5 border-2 border-slate-200 dark:border-zinc-700 rounded-xl text-slate-900 dark:text-white bg-white dark:bg-zinc-800 focus:border-purple-500 focus:outline-none transition-colors font-mono text-xs"
                          list="hub-url-history"
                        />
                        <datalist id="hub-url-history">
                          {urlHistory.map((url, i) => <option value={url} key={i} />)}
                        </datalist>
                      </div>
                      <button
                        onClick={() => handleProbeUrl(tunnelUrl)}
                        disabled={!isValidUrl(tunnelUrl)}
                        className={`w-full py-2.5 rounded-xl font-semibold text-sm text-white flex items-center justify-center gap-2 transition-all ${
                          isValidUrl(tunnelUrl)
                            ? 'bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 shadow hover:shadow-md active:scale-95'
                            : 'bg-slate-200 dark:bg-zinc-700 cursor-not-allowed opacity-50'
                        }`}
                      >
                        Connect to Hub
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          )}

          {/* ───── Step: Probing ───── */}
          {step === 'probing' && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-white dark:bg-zinc-900 rounded-3xl shadow-2xl p-8 text-center relative"
            >
              <button
                onClick={resetToBrowse}
                className="absolute top-5 left-5 inline-flex items-center gap-1 text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 text-xs font-semibold transition-colors"
              >
                <ChevronLeft className="w-3.5 h-3.5" />Cancel
              </button>
              <Loader2 className="w-12 h-12 animate-spin text-purple-600 mx-auto mb-4 mt-2" />
              <h3 className="text-xl font-semibold text-slate-900 dark:text-white mb-2">
                Connecting to Hub
              </h3>
              <p className="text-slate-600 dark:text-slate-400 text-sm">
                {probingHubName
                  ? <>Reaching <strong>{probingHubName}</strong>…</>
                  : <>Reaching {hubService.normalizeTunnelUrl(tunnelUrl)}…</>
                }
              </p>
            </motion.div>
          )}

          {/* ───── Step: Auth ───── */}
          {/* Layout follows the Citinet Design System's AuthScreen reference (ui_kits/hub/app.jsx)
              closely: glass card, compact hub-identity row, segmented Log in / Sign up tabs
              (login first and default), "Forgot password?" only in login mode, "or" divider,
              switch-mode line at the bottom. One deliberate deviation: the identifier field is
              Username, not Email — this hub's login is username-based and email is optional at
              signup, so an email-only field would lock out existing accounts without one. */}
          {step === 'auth' && probeInfo && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="cn-glass rounded-3xl shadow-2xl p-6 relative z-10 max-w-[420px] w-full mx-auto"
            >
              {/* Back nav + brand mark */}
              <div className="flex items-center justify-between mb-4">
                <button
                  onClick={resetToBrowse}
                  className="inline-flex items-center gap-1 text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 text-xs font-semibold transition-colors"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />All hubs
                </button>
                <CitinetLogo size={20} className="opacity-60" />
              </div>

              {/* Hub identity row */}
              <div className="flex items-center gap-3 mb-5">
                {skipProbe ? (
                  <span className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0 shadow-md bg-amber-100 dark:bg-amber-900/30">
                    <WifiOff className="w-5 h-5 text-amber-600 dark:text-amber-400" />
                  </span>
                ) : (
                  <HubIcon hub={probeInfo} baseUrl={hubService.normalizeTunnelUrl(tunnelUrl)} size={44} variant="badge" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="text-base font-bold text-slate-900 dark:text-white truncate">{probeInfo.name || 'Hub'}</div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
                    {[probeInfo.location, probeStatus?.user_count !== undefined ? `${probeStatus.user_count} members` : null]
                      .filter(Boolean).join(' · ')}
                  </div>
                </div>
              </div>

              {/* Skip-probe warning */}
              {skipProbe && (
                <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-3 mb-4">
                  <p className="text-xs text-amber-700 dark:text-amber-300">
                    Hub wasn't reachable during the check. Your credentials will be sent directly — this will work once the hub is back online.
                  </p>
                </div>
              )}

              {/* Log in / Sign up tabs — login first and default */}
              <div className="flex gap-1 p-1 rounded-xl bg-slate-100 dark:bg-zinc-800 mb-5">
                {(['login', 'signup'] as AuthMode[]).map((mode) => (
                  <button
                    key={mode}
                    onClick={() => switchAuthMode(mode)}
                    className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all ${
                      authMode === mode
                        ? 'bg-white dark:bg-zinc-700 text-slate-900 dark:text-white shadow-sm'
                        : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
                    }`}
                  >
                    {mode === 'login' ? 'Log in' : 'Sign up'}
                  </button>
                ))}
              </div>

              <div className="space-y-3">
                {/* Username */}
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Username</label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      type="text"
                      value={username}
                      onChange={(e) => setUsername(e.target.value.replace(/\s/g, ''))}
                      placeholder={authMode === 'login' ? 'Your username' : 'Choose a username'}
                      className="w-full pl-10 pr-3 py-3 border-2 border-slate-200 dark:border-zinc-700 rounded-xl text-slate-900 dark:text-white bg-white dark:bg-zinc-800 focus:border-purple-500 focus:outline-none transition-colors text-sm"
                      maxLength={30}
                      autoFocus
                    />
                  </div>
                  {username.length > 0 && username.trim().length < 2 && (
                    <p className="text-xs text-red-500 mt-1">At least 2 characters</p>
                  )}
                </div>

                {/* Email (signup only) */}
                {authMode === 'signup' && (
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Email</label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="you@example.com"
                        className="w-full pl-10 pr-3 py-3 border-2 border-slate-200 dark:border-zinc-700 rounded-xl text-slate-900 dark:text-white bg-white dark:bg-zinc-800 focus:border-purple-500 focus:outline-none transition-colors text-sm"
                      />
                    </div>
                    {email.length > 0 && !isValidEmail(email) && (
                      <p className="text-xs text-red-500 mt-1">Enter a valid email</p>
                    )}
                  </div>
                )}

                {/* Password */}
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Password</label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder={authMode === 'login' ? 'Your password' : 'Choose a password'}
                      className="w-full pl-10 pr-10 py-3 border-2 border-slate-200 dark:border-zinc-700 rounded-xl text-slate-900 dark:text-white bg-white dark:bg-zinc-800 focus:border-purple-500 focus:outline-none transition-colors text-sm"
                      onKeyDown={(e) => e.key === 'Enter' && authMode === 'login' && canSubmit && handleAuth()}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(p => !p)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  {authMode === 'signup' && password.length > 0 && password.length < 4 && (
                    <p className="text-xs text-red-500 mt-1">At least 4 characters</p>
                  )}
                  {authMode === 'login' && (
                    <div className="flex justify-end mt-1.5">
                      <button type="button" className="text-xs cn-text-3 hover:cn-text-1 hover:underline">
                        Forgot password?
                      </button>
                    </div>
                  )}
                </div>

                {/* Confirm Password (signup only) */}
                {authMode === 'signup' && (
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Confirm Password</label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <input
                        type={showPassword ? 'text' : 'password'}
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && canSubmit && handleAuth()}
                        placeholder="Confirm your password"
                        className={`w-full pl-10 pr-3 py-3 border-2 rounded-xl text-slate-900 dark:text-white bg-white dark:bg-zinc-800 focus:border-purple-500 focus:outline-none transition-colors text-sm ${
                          confirmPassword && confirmPassword !== password
                            ? 'border-red-300 dark:border-red-700'
                            : 'border-slate-200 dark:border-zinc-700'
                        }`}
                      />
                    </div>
                    {confirmPassword && confirmPassword !== password && (
                      <p className="text-xs text-red-500 mt-1">Passwords don't match</p>
                    )}
                  </div>
                )}
              </div>

              {authError && (
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-3 mt-4">
                  <p className="text-xs text-red-700 dark:text-red-300">{authError}</p>
                </div>
              )}

              {/* Submit */}
              <button
                onClick={handleAuth}
                disabled={!canSubmit || joining}
                className={`w-full py-3.5 rounded-xl font-bold text-white flex items-center justify-center gap-2 transition-all mt-5 ${
                  canSubmit && !joining
                    ? 'bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 shadow-lg hover:shadow-xl hover:scale-[1.02] active:scale-95'
                    : 'bg-slate-300 dark:bg-zinc-700 cursor-not-allowed opacity-50'
                }`}
              >
                {joining ? (
                  <><Loader2 className="w-5 h-5 animate-spin" />{authMode === 'login' ? 'Logging in…' : 'Creating Account…'}</>
                ) : (
                  authMode === 'login' ? 'Log In & Enter' : 'Create Account & Join'
                )}
              </button>

              {/* Divider + switch-mode line */}
              <div className="flex items-center gap-3 my-4">
                <div className="flex-1 h-px bg-slate-200 dark:bg-zinc-800" />
                <span className="text-[11px] text-slate-400 dark:text-zinc-500">or</span>
                <div className="flex-1 h-px bg-slate-200 dark:bg-zinc-800" />
              </div>
              <p className="text-center text-xs text-slate-500 dark:text-slate-400">
                {authMode === 'login' ? 'New to this hub? ' : 'Already a member? '}
                <button
                  onClick={() => switchAuthMode(authMode === 'login' ? 'signup' : 'login')}
                  className="cn-text-2 hover:cn-text-1 font-semibold hover:underline"
                >
                  {authMode === 'login' ? 'Sign up' : 'Log in'}
                </button>
              </p>
            </motion.div>
          )}

          {/* ───── Step: Error ───── */}
          {step === 'error' && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-white dark:bg-zinc-900 rounded-3xl shadow-2xl p-8 text-center relative"
            >
              <button
                onClick={onBack}
                className="absolute top-5 left-5 inline-flex items-center gap-1 text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 text-xs font-semibold transition-colors"
              >
                <ChevronLeft className="w-3.5 h-3.5" />Home
              </button>
              <div className="w-14 h-14 rounded-2xl bg-red-100 dark:bg-red-900/30 flex items-center justify-center mx-auto mb-4 mt-2">
                <AlertCircle className="w-7 h-7 text-red-600 dark:text-red-400" />
              </div>
              <h3 className="text-xl font-semibold text-slate-900 dark:text-white mb-2">
                Couldn't reach hub
              </h3>
              <p className="text-slate-500 dark:text-slate-400 text-sm mb-4 max-w-xs mx-auto">
                {probeError || 'An unexpected error occurred. Please try again.'}
              </p>

              {/* Localhost hint for Tailscale URLs when on the same machine */}
              {tunnelUrl.includes('.ts.net') || tunnelUrl.includes('tailscale') ? (
                <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-3 mb-5 text-left">
                  <p className="text-xs font-medium text-amber-800 dark:text-amber-300 mb-1">Hub owner on this machine?</p>
                  <p className="text-xs text-amber-700 dark:text-amber-400">
                    If you're on the same machine as the hub, use{' '}
                    <button
                      onClick={() => { setTunnelUrl('http://localhost:9090'); setStep('browse'); setUrlOpen(true); }}
                      className="font-mono underline hover:no-underline"
                    >
                      http://localhost:9090
                    </button>
                    {' '}instead. The Tailscale URL is for external access.
                  </p>
                </div>
              ) : null}

              <div className="flex flex-col gap-3">
                <button
                  onClick={handleConnectAnyway}
                  className="w-full px-6 py-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-xl font-semibold hover:from-blue-700 hover:to-purple-700 transition-colors"
                >
                  Connect Anyway
                </button>
                <button
                  onClick={resetToBrowse}
                  className="w-full px-6 py-3 border border-slate-200 dark:border-zinc-700 text-slate-700 dark:text-slate-300 rounded-xl font-medium hover:bg-slate-50 dark:hover:bg-zinc-800 transition-colors text-sm"
                >
                  Try a Different URL
                </button>
              </div>
            </motion.div>
          )}
        </div>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────
// Directory Hub Row
// ──────────────────────────────────────────────

function DirectoryHubRow({ hub, alreadyJoined, entering, onJoin, onQuickEnter }: {
  hub: RegistryHub;
  alreadyJoined: boolean;
  entering: boolean;
  onJoin: () => void;
  onQuickEnter: () => void;
}) {
  const isOnline = hub.online !== false;
  const [showFullDescription, setShowFullDescription] = useState(false);
  return (
    <div className="flex items-center gap-3 px-2 py-2 rounded-xl hover:bg-black/5 dark:hover:bg-white/5 transition-colors">
      <div className="relative flex-shrink-0">
        <HubIcon hub={hub} baseUrl={hub.tunnel_url ?? ''} size={34} variant="badge" />
        <span
          className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-white dark:border-zinc-900 ${isOnline ? 'bg-green-500' : 'bg-slate-300 dark:bg-zinc-600'}`}
        />
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-sm text-slate-900 dark:text-white truncate">{hub.name}</span>
        </div>
        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
          {hub.location && (
            <span className="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
              <MapPin className="w-3 h-3" />{hub.location}
            </span>
          )}
          {hub.member_count !== undefined && (
            <span className="flex items-center gap-1 text-xs text-slate-400 dark:text-zinc-500">
              <Users className="w-3 h-3" />{hub.member_count}
            </span>
          )}
          {alreadyJoined && (
            <span className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">Signed in</span>
          )}
        </div>
        {hub.description && (
          <div className="flex items-start gap-1 mt-1">
            <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-1">{hub.description}</p>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setShowFullDescription(true); }}
              title="Read full description"
              aria-label="Read full description"
              className="shrink-0 text-slate-400 dark:text-slate-500 hover:text-purple-600 dark:hover:text-purple-400 transition-colors mt-0.5"
            >
              <Info className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* Full-description overlay — tap the info icon to read before joining,
          close to return to the normal row without leaving this screen. */}
      <AnimatePresence>
        {showFullDescription && (
          <motion.div
            className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setShowFullDescription(false)}
          >
            <motion.div
              className="w-full max-w-sm bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl p-5"
              initial={{ opacity: 0, scale: 0.95, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 12 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start justify-between gap-3 mb-2">
                <div className="flex items-center gap-2 min-w-0">
                  <HubIcon hub={hub} baseUrl={hub.tunnel_url ?? ''} size={28} variant="badge" />
                  <span className="font-semibold text-sm text-slate-900 dark:text-white truncate">{hub.name}</span>
                </div>
                <button
                  onClick={() => setShowFullDescription(false)}
                  className="shrink-0 w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors"
                  aria-label="Close"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed whitespace-pre-wrap">
                {hub.description}
              </p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Enter button — could be a first join or a returning member, so "Enter"
          reads right either way instead of assuming this is always a new join.
          Already-signed-in hubs skip straight past probe/auth (onQuickEnter);
          everyone else still goes through the normal probe+login flow. */}
      <button
        onClick={alreadyJoined ? onQuickEnter : onJoin}
        disabled={entering}
        className="flex-shrink-0 flex items-center gap-1.5 px-3.5 py-1.5 bg-gradient-to-r from-blue-600 to-purple-600 text-white text-xs font-semibold rounded-lg hover:from-blue-700 hover:to-purple-700 transition-all active:scale-95 disabled:opacity-60"
      >
        {entering && <Loader2 className="w-3 h-3 animate-spin" />}
        Enter
      </button>
    </div>
  );
}
