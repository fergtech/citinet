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
  ArrowLeft, Loader2, CheckCircle, AlertCircle,
  Globe, User, Lock, Eye, EyeOff, LogIn, Mail,
  RefreshCw, Wifi, WifiOff, Users, MapPin, ChevronDown,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useSearchParams } from 'react-router-dom';
import { hubService } from '../services/hubService';
import { registryService, type RegistryHub } from '../services/registryService';
import type { Hub, HubInfoResponse, HubStatusResponse } from '../types/hub';

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
  const [authMode, setAuthMode] = useState<AuthMode>('signup');

  // ── Directory state ──
  const [registryHubs, setRegistryHubs] = useState<RegistryHub[]>([]);
  const [registryLoading, setRegistryLoading] = useState(true);
  const [registryRefreshKey, setRegistryRefreshKey] = useState(0);

  // ── URL input state ──
  const [urlOpen, setUrlOpen] = useState(false);
  const [tunnelUrl, setTunnelUrl] = useState(() => searchParams.get('url') ?? '');
  const [urlHistory, setUrlHistory] = useState<string[]>([]);

  // ── Probe state ──
  const [probingHubName, setProbingHubName] = useState('');
  const [probeInfo, setProbeInfo] = useState<HubInfoResponse | null>(null);
  const [probeStatus, setProbeStatus] = useState<HubStatusResponse | null>(null);
  const [probeError, setProbeError] = useState('');

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
      new URL(trimmed.startsWith('http') ? trimmed : `https://${trimmed}`);
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

    try {
      const hub = await hubService.joinHub(tunnelUrl, probeInfo, probeStatus || undefined);

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

      onNodeFound(hub.slug, hub.name, hub);
    } catch (err) {
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
    setUsername('');
    setPassword('');
    setEmail('');
    setConfirmPassword('');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-600 via-purple-600 to-pink-600 relative overflow-hidden flex flex-col">
      {/* Background Pattern */}
      <svg className="absolute inset-0 w-full h-full opacity-20" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <pattern id="discovery-pattern" x="0" y="0" width="200" height="200" patternUnits="userSpaceOnUse">
            <path d="M 0 100 Q 50 50 100 100 T 200 100" stroke="white" strokeWidth="1.5" fill="none" />
            <path d="M 0 150 Q 50 100 100 150 T 200 150" stroke="white" strokeWidth="1.5" fill="none" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#discovery-pattern)" />
      </svg>

      {/* Header */}
      <div className="relative z-10 p-6 flex items-center justify-between">
        <button
          onClick={step === 'auth' || step === 'error' ? resetToBrowse : onBack}
          className="flex items-center gap-2 text-white hover:text-white/80 transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
          <span className="font-medium">{step === 'auth' || step === 'error' ? 'Back' : 'Home'}</span>
        </button>

        {step === 'browse' && (
          <button
            onClick={() => setRegistryRefreshKey(k => k + 1)}
            disabled={registryLoading}
            className="flex items-center gap-1.5 text-white/70 hover:text-white transition-colors text-sm disabled:opacity-40"
          >
            <RefreshCw className={`w-4 h-4 ${registryLoading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        )}
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col p-4 pb-8 relative z-10">
        <div className="w-full max-w-lg mx-auto flex flex-col gap-4">

          {/* ───── Step: Browse / Input ───── */}
          {step === 'browse' && (
            <>
              <div className="text-center mb-2">
                <h2 className="text-2xl font-bold text-white">Join a Hub</h2>
                <p className="text-white/75 text-sm mt-1">Browse available hubs or enter a URL directly</p>
              </div>

              {/* ── Hub Directory ── */}
              <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-xl overflow-hidden">
                <div className="px-5 pt-5 pb-3 border-b border-slate-100 dark:border-zinc-800">
                  <h3 className="font-semibold text-slate-900 dark:text-white text-sm">
                    Available Hubs
                    <span className="ml-2 text-xs font-normal text-slate-400 dark:text-zinc-500">
                      from registry
                    </span>
                  </h3>
                </div>

                <div className="divide-y divide-slate-100 dark:divide-zinc-800">
                  {registryLoading && (
                    <div className="flex items-center justify-center gap-3 py-8 text-slate-400 dark:text-zinc-500">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span className="text-sm">Fetching hubs…</span>
                    </div>
                  )}

                  {!registryLoading && registryHubs.length === 0 && (
                    <div className="px-5 py-6 text-center">
                      <p className="text-sm text-slate-500 dark:text-slate-400">
                        No hubs registered yet.
                      </p>
                      <p className="text-xs text-slate-400 dark:text-zinc-500 mt-1">
                        Enter a URL below to connect directly.
                      </p>
                    </div>
                  )}

                  {!registryLoading && registryHubs.map((hub) => (
                    <DirectoryHubRow
                      key={hub.id}
                      hub={hub}
                      onJoin={() => handleProbeDirectoryHub(hub)}
                    />
                  ))}
                </div>
              </div>

              {/* ── URL Input (collapsible) ── */}
              <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-xl overflow-hidden">
                <button
                  onClick={() => {
                    setUrlOpen(o => !o);
                    if (!urlOpen) setTimeout(() => urlInputRef.current?.focus(), 150);
                  }}
                  className="w-full flex items-center justify-between px-5 py-4 text-left"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-zinc-800 flex items-center justify-center flex-shrink-0">
                      <Globe className="w-4 h-4 text-slate-500 dark:text-slate-400" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-slate-900 dark:text-white">Have a hub URL?</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">Enter it directly to connect</p>
                    </div>
                  </div>
                  <ChevronDown
                    className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${urlOpen ? 'rotate-180' : ''}`}
                  />
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
                      <div className="px-5 pb-5 pt-1 space-y-3 border-t border-slate-100 dark:border-zinc-800">
                        <div className="relative">
                          <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                          <input
                            ref={urlInputRef}
                            type="url"
                            value={tunnelUrl}
                            onChange={(e) => setTunnelUrl(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && isValidUrl(tunnelUrl) && handleProbeUrl(tunnelUrl)}
                            placeholder="e.g., https://myhub.tailXXX.ts.net or https://abc123.trycloudflare.com"
                            className="w-full pl-10 pr-3 py-3 border-2 border-slate-200 dark:border-zinc-700 rounded-xl text-slate-900 dark:text-white bg-white dark:bg-zinc-800 focus:border-purple-500 focus:outline-none transition-colors font-mono text-xs"
                            list="hub-url-history"
                          />
                          <datalist id="hub-url-history">
                            {urlHistory.map((url, i) => <option value={url} key={i} />)}
                          </datalist>
                        </div>
                        <button
                          onClick={() => handleProbeUrl(tunnelUrl)}
                          disabled={!isValidUrl(tunnelUrl)}
                          className={`w-full py-3 rounded-xl font-semibold text-sm text-white flex items-center justify-center gap-2 transition-all ${
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
              </div>
            </>
          )}

          {/* ───── Step: Probing ───── */}
          {step === 'probing' && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-white dark:bg-zinc-900 rounded-3xl shadow-2xl p-8 text-center"
            >
              <Loader2 className="w-12 h-12 animate-spin text-purple-600 mx-auto mb-4" />
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
          {step === 'auth' && probeInfo && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-white dark:bg-zinc-900 rounded-3xl shadow-2xl p-6 relative z-10"
            >
              {/* Hub confirmed banner */}
              <div className="text-center mb-6">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center mx-auto mb-3">
                  <CheckCircle className="w-7 h-7 text-white" />
                </div>
                <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-1">
                  {authMode === 'login' ? `Log into ${probeInfo.name || 'Hub'}` : `Join ${probeInfo.name || 'Hub'}`}
                </h2>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  {authMode === 'login' ? 'Sign in with your existing account' : 'Create a new account to join'}
                </p>
              </div>

              {/* Hub info card */}
              <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl p-4 mb-5">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-9 h-9 rounded-lg bg-green-600 flex items-center justify-center flex-shrink-0">
                    <CheckCircle className="w-4 h-4 text-white" />
                  </div>
                  <div>
                    <h4 className="text-sm font-semibold text-green-900 dark:text-green-300">{probeInfo.name}</h4>
                    {probeInfo.location && (
                      <p className="text-xs text-green-700 dark:text-green-400">{probeInfo.location}</p>
                    )}
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2 text-xs mt-3">
                  {probeInfo.node_type && (
                    <div className="text-center bg-green-100 dark:bg-green-900/30 rounded-lg py-2">
                      <div className="font-bold text-green-900 dark:text-green-200 capitalize">{probeInfo.node_type}</div>
                      <div className="text-green-700 dark:text-green-400">Type</div>
                    </div>
                  )}
                  {probeStatus?.user_count !== undefined && (
                    <div className="text-center bg-green-100 dark:bg-green-900/30 rounded-lg py-2">
                      <div className="font-bold text-green-900 dark:text-green-200">{probeStatus.user_count}</div>
                      <div className="text-green-700 dark:text-green-400">Members</div>
                    </div>
                  )}
                  {probeStatus?.online !== undefined && (
                    <div className="text-center bg-green-100 dark:bg-green-900/30 rounded-lg py-2">
                      <div className="font-bold text-green-900 dark:text-green-200">{probeStatus.online ? 'Yes' : 'No'}</div>
                      <div className="text-green-700 dark:text-green-400">Online</div>
                    </div>
                  )}
                </div>
              </div>

              {/* Auth mode toggle */}
              <div className="flex rounded-xl bg-slate-100 dark:bg-zinc-800 p-1 mb-5">
                {(['signup', 'login'] as AuthMode[]).map((mode) => (
                  <button
                    key={mode}
                    onClick={() => switchAuthMode(mode)}
                    className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all flex items-center justify-center gap-1.5 ${
                      authMode === mode
                        ? 'bg-white dark:bg-zinc-700 text-slate-900 dark:text-white shadow-sm'
                        : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
                    }`}
                  >
                    {mode === 'signup' ? <><User className="w-3.5 h-3.5" /> New Account</> : <><LogIn className="w-3.5 h-3.5" /> Log In</>}
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
                        placeholder="your@email.com"
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

              {/* Hub URL display */}
              <div className="bg-slate-50 dark:bg-zinc-800 rounded-xl p-3 border border-slate-200 dark:border-zinc-700 mt-4">
                <div className="text-xs text-slate-500 dark:text-slate-400 mb-0.5">Connecting to</div>
                <div className="font-mono text-xs text-slate-900 dark:text-white break-all">
                  {hubService.normalizeTunnelUrl(tunnelUrl)}
                </div>
              </div>

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
                  authMode === 'login' ? 'Log In & Join' : 'Create Account & Join'
                )}
              </button>

              <p className="text-center text-xs text-slate-500 dark:text-slate-400 mt-3">
                {authMode === 'signup'
                  ? <>Already have an account? <button onClick={() => switchAuthMode('login')} className="text-purple-600 dark:text-purple-400 font-semibold hover:underline">Log in</button></>
                  : <>New here? <button onClick={() => switchAuthMode('signup')} className="text-purple-600 dark:text-purple-400 font-semibold hover:underline">Create an account</button></>
                }
              </p>
            </motion.div>
          )}

          {/* ───── Step: Error ───── */}
          {step === 'error' && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-white dark:bg-zinc-900 rounded-3xl shadow-2xl p-8 text-center"
            >
              <div className="w-14 h-14 rounded-2xl bg-red-100 dark:bg-red-900/30 flex items-center justify-center mx-auto mb-4">
                <AlertCircle className="w-7 h-7 text-red-600 dark:text-red-400" />
              </div>
              <h3 className="text-xl font-semibold text-slate-900 dark:text-white mb-2">
                Couldn't reach hub
              </h3>
              <p className="text-slate-500 dark:text-slate-400 text-sm mb-6 max-w-xs mx-auto">
                {probeError || 'An unexpected error occurred. Please try again.'}
              </p>
              <button
                onClick={resetToBrowse}
                className="px-6 py-3 bg-purple-600 text-white rounded-xl font-semibold hover:bg-purple-700 transition-colors"
              >
                Try Another Hub
              </button>
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

function DirectoryHubRow({ hub, onJoin }: { hub: RegistryHub; onJoin: () => void }) {
  const isOnline = hub.online !== false;
  return (
    <div className="flex items-center gap-3 px-5 py-4">
      {/* Status dot */}
      <span className={`w-2 h-2 rounded-full flex-shrink-0 mt-0.5 ${isOnline ? 'bg-green-500' : 'bg-slate-300 dark:bg-zinc-600'}`} />

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-sm text-slate-900 dark:text-white truncate">{hub.name}</span>
          {isOnline
            ? <Wifi className="w-3 h-3 text-green-500 flex-shrink-0" />
            : <WifiOff className="w-3 h-3 text-slate-400 flex-shrink-0" />
          }
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
        </div>
        {hub.description && (
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 line-clamp-1">{hub.description}</p>
        )}
      </div>

      {/* Join button */}
      <button
        onClick={onJoin}
        className="flex-shrink-0 px-3.5 py-1.5 bg-gradient-to-r from-blue-600 to-purple-600 text-white text-xs font-semibold rounded-lg hover:from-blue-700 hover:to-purple-700 transition-all active:scale-95"
      >
        Join
      </button>
    </div>
  );
}
