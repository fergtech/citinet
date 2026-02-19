import { useState, useEffect } from 'react';
import { Link2, ArrowLeft, Loader2, CheckCircle, AlertCircle, Globe, User, Lock, Eye, EyeOff, LogIn, Mail } from 'lucide-react';
import { motion } from 'motion/react';
import { hubService } from '../services/hubService';
import type { Hub, HubInfoResponse, HubStatusResponse } from '../types/hub';

interface NodeDiscoveryScreenProps {
  onNodeFound: (hubSlug: string, hubName: string, hub: Hub) => void;
  onBack: () => void;
}

type JoinStep = 'input' | 'probing' | 'auth' | 'error';
type AuthMode = 'signup' | 'login';

const HUB_URL_HISTORY_KEY = 'hubUrlHistory';

function getHubUrlHistory(): string[] {
  try {
    const raw = localStorage.getItem(HUB_URL_HISTORY_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function addHubUrlToHistory(url: string) {
  const trimmed = url.trim();
  if (!trimmed) return;
  let history = getHubUrlHistory();
  // Remove duplicates, keep most recent first
  history = [trimmed, ...history.filter(u => u !== trimmed)].slice(0, 10);
  localStorage.setItem(HUB_URL_HISTORY_KEY, JSON.stringify(history));
}

export function NodeDiscoveryScreen({ onNodeFound, onBack }: NodeDiscoveryScreenProps) {
  const [step, setStep] = useState<JoinStep>('input');
  const [authMode, setAuthMode] = useState<AuthMode>('signup');
  const [tunnelUrl, setTunnelUrl] = useState('');
  const [urlHistory, setUrlHistory] = useState<string[]>([]);
    // Load URL history on mount
    useEffect(() => {
      setUrlHistory(getHubUrlHistory());
    }, []);

  const [probeInfo, setProbeInfo] = useState<HubInfoResponse | null>(null);
  const [probeStatus, setProbeStatus] = useState<HubStatusResponse | null>(null);
  const [probeError, setProbeError] = useState('');

  // Auth fields
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [email, setEmail] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [joining, setJoining] = useState(false);
  const [authError, setAuthError] = useState('');

  const isValidUrl = (url: string): boolean => {
    const trimmed = url.trim();
    if (!trimmed) return false;
    try {
      const withProtocol = trimmed.startsWith('http') ? trimmed : `https://${trimmed}`;
      new URL(withProtocol);
      return true;
    } catch {
      return false;
    }
  };

  const handleProbe = async () => {
    if (!isValidUrl(tunnelUrl)) return;

    // Save to history
    addHubUrlToHistory(tunnelUrl);
    setUrlHistory(getHubUrlHistory());

    setStep('probing');
    setProbeError('');
    setProbeInfo(null);
    setProbeStatus(null);

    const result = await hubService.probeHub(tunnelUrl);

    if (result.success && result.info) {
      setProbeInfo(result.info);
      setProbeStatus(result.status || null);
      setStep('auth');
    } else {
      setProbeError(result.error || 'Could not reach hub');
      setStep('error');
    }
  };

  const isValidEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
  const canSubmit = authMode === 'login'
    ? (probeInfo != null && username.trim().length >= 2 && password.length >= 1)
    : (probeInfo != null && username.trim().length >= 2 && password.length >= 4 && password === confirmPassword && isValidEmail(email));

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
      // 1. Save the hub connection
      const hub = await hubService.joinHub(
        tunnelUrl,
        probeInfo,
        probeStatus || undefined
      );

      // 2. Register or login
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

      // 3. Navigate to hub portal
      onNodeFound(hub.slug, hub.name, hub);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setAuthError(
        authMode === 'login'
          ? msg.includes('401') || msg.toLowerCase().includes('invalid')
            ? 'Invalid username or password.'
            : `Login failed: ${msg}`
          : msg.includes('409') || msg.toLowerCase().includes('exists')
            ? 'Username already taken. Try logging in instead.'
            : `Failed to create account: ${msg}`
      );
      console.error('Auth error:', err);
    } finally {
      setJoining(false);
    }
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
      <div className="relative z-10 p-6">
        <button
          onClick={step === 'auth' || step === 'error' ? () => { setStep('input'); setAuthError(''); } : onBack}
          className="flex items-center gap-2 text-white hover:text-white/80 transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
          <span className="font-medium">{step === 'auth' || step === 'error' ? 'Back' : 'Home'}</span>
        </button>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-2xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white dark:bg-zinc-900 rounded-3xl shadow-2xl p-8 relative z-10"
          >
            {/* ───── Step 1: URL Input ───── */}
            {step === 'input' && (
              <>
                <div className="text-center mb-8">
                  <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center mx-auto mb-4">
                    <Link2 className="w-8 h-8 text-white" />
                  </div>
                  <h2 className="text-3xl font-bold text-slate-900 dark:text-white mb-2">
                    Join a Hub
                  </h2>
                  <p className="text-slate-600 dark:text-slate-400">
                    Enter the URL shared by your hub host to connect
                  </p>
                </div>

                <div className="space-y-6">
                  {/* URL Input */}
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                      Hub URL
                    </label>
                    <div className="relative">
                      <Globe className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                      <input
                        type="url"
                        value={tunnelUrl}
                        onChange={(e) => setTunnelUrl(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && isValidUrl(tunnelUrl) && handleProbe()}
                        placeholder="e.g., abc123.trycloudflare.com"
                        className="w-full pl-12 pr-4 py-4 border-2 border-slate-200 dark:border-zinc-700 rounded-xl text-slate-900 dark:text-white bg-white dark:bg-zinc-800 focus:border-purple-500 focus:outline-none transition-colors font-mono text-sm"
                        autoFocus
                        list="hub-url-history"
                      />
                      <datalist id="hub-url-history">
                        {urlHistory.map((url, i) => (
                          <option value={url} key={i} />
                        ))}
                      </datalist>
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
                      This is the cloudflared tunnel URL from the hub you want to join. Ask your hub host for this link.
                    </p>
                  </div>

                  {/* How it works */}
                  <div className="bg-gradient-to-br from-blue-50 to-purple-50 dark:from-blue-900/20 dark:to-purple-900/20 rounded-xl p-5 border border-blue-200/50 dark:border-blue-700/50">
                    <h4 className="text-sm font-semibold text-slate-900 dark:text-white mb-3">How hub joining works</h4>
                    <ol className="space-y-2 text-xs text-slate-700 dark:text-slate-300">
                      <li className="flex items-start gap-2">
                        <span className="w-5 h-5 rounded-full bg-purple-600 text-white flex items-center justify-center flex-shrink-0 text-[10px] font-bold mt-0.5">1</span>
                        <span>A hub host shares their tunnel URL with the community</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="w-5 h-5 rounded-full bg-purple-600 text-white flex items-center justify-center flex-shrink-0 text-[10px] font-bold mt-0.5">2</span>
                        <span>Enter the URL and we'll connect to the hub</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="w-5 h-5 rounded-full bg-purple-600 text-white flex items-center justify-center flex-shrink-0 text-[10px] font-bold mt-0.5">3</span>
                        <span>Create your account with a username and password to join</span>
                      </li>
                    </ol>
                  </div>

                  {/* Coming soon: hub directory */}
                  <div className="bg-slate-50 dark:bg-zinc-800 rounded-xl p-4 border border-slate-200 dark:border-zinc-700">
                    <p className="text-xs text-slate-600 dark:text-slate-400">
                      <strong className="font-semibold">Coming soon:</strong> A public hub directory where you can browse and join hubs without needing a URL.
                    </p>
                  </div>

                  {/* Connect Button */}
                  <button
                    onClick={handleProbe}
                    disabled={!isValidUrl(tunnelUrl)}
                    className={`w-full py-4 rounded-xl font-bold text-white flex items-center justify-center gap-2 transition-all duration-300 ${
                      isValidUrl(tunnelUrl)
                        ? 'bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 shadow-lg hover:shadow-xl hover:scale-[1.02] active:scale-95'
                        : 'bg-slate-300 dark:bg-zinc-700 cursor-not-allowed opacity-50'
                    }`}
                  >
                    Connect to Hub
                  </button>
                </div>
              </>
            )}

            {/* ───── Step 2: Probing ───── */}
            {step === 'probing' && (
              <div className="text-center py-12">
                <Loader2 className="w-12 h-12 animate-spin text-purple-600 mx-auto mb-4" />
                <h3 className="text-xl font-semibold text-slate-900 dark:text-white mb-2">
                  Connecting to Hub
                </h3>
                <p className="text-slate-600 dark:text-slate-400">
                  Attempting to reach the hub at {hubService.normalizeTunnelUrl(tunnelUrl)}...
                </p>
              </div>
            )}

            {/* ───── Step 3: Auth (signup or login) ───── */}
            {step === 'auth' && probeInfo && (
              <>
                {/* Hub Status Banner */}
                <div className="text-center mb-6">
                  <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center mx-auto mb-4">
                    <CheckCircle className="w-8 h-8 text-white" />
                  </div>
                  <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">
                    {authMode === 'login' ? `Log into ${probeInfo.name || 'Hub'}` : `Join ${probeInfo.name || 'Hub'}`}
                  </h2>
                  <p className="text-sm text-slate-600 dark:text-slate-400">
                    {authMode === 'login'
                      ? 'Sign in with your existing account'
                      : 'Create a new account to join this community'
                    }
                  </p>
                </div>

                {/* Hub Info Card */}
                <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl p-4 mb-6">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-10 h-10 rounded-lg bg-green-600 flex items-center justify-center flex-shrink-0">
                      <CheckCircle className="w-5 h-5 text-white" />
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

                {/* Auth Mode Toggle */}
                <div className="flex rounded-xl bg-slate-100 dark:bg-zinc-800 p-1 mb-6">
                  <button
                    onClick={() => switchAuthMode('signup')}
                    className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition-all flex items-center justify-center gap-2 ${
                      authMode === 'signup'
                        ? 'bg-white dark:bg-zinc-700 text-slate-900 dark:text-white shadow-sm'
                        : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
                    }`}
                  >
                    <User className="w-4 h-4" />
                    New Account
                  </button>
                  <button
                    onClick={() => switchAuthMode('login')}
                    className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition-all flex items-center justify-center gap-2 ${
                      authMode === 'login'
                        ? 'bg-white dark:bg-zinc-700 text-slate-900 dark:text-white shadow-sm'
                        : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
                    }`}
                  >
                    <LogIn className="w-4 h-4" />
                    Existing Account
                  </button>
                </div>

                <div className="space-y-4">
                  {/* Username */}
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                      Username
                    </label>
                    <div className="relative">
                      <User className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <input
                        type="text"
                        value={username}
                        onChange={(e) => setUsername(e.target.value.replace(/\s/g, ''))}
                        placeholder={authMode === 'login' ? 'Your username' : 'Choose a username'}
                        className="w-full pl-11 pr-4 py-3 border-2 border-slate-200 dark:border-zinc-700 rounded-xl text-slate-900 dark:text-white bg-white dark:bg-zinc-800 focus:border-purple-500 focus:outline-none transition-colors"
                        maxLength={30}
                        autoFocus
                      />
                    </div>
                    {username.length > 0 && username.trim().length < 2 && (
                      <p className="text-xs text-red-500 mt-1">Username must be at least 2 characters</p>
                    )}
                  </div>

                  {/* Email (signup only) */}
                  {authMode === 'signup' && (
                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                        Email
                      </label>
                      <div className="relative">
                        <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <input
                          type="email"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          placeholder="your@email.com"
                          className="w-full pl-11 pr-4 py-3 border-2 border-slate-200 dark:border-zinc-700 rounded-xl text-slate-900 dark:text-white bg-white dark:bg-zinc-800 focus:border-purple-500 focus:outline-none transition-colors"
                        />
                      </div>
                      {email.length > 0 && !isValidEmail(email) && (
                        <p className="text-xs text-red-500 mt-1">Enter a valid email address</p>
                      )}
                    </div>
                  )}

                  {/* Password */}
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                      Password
                    </label>
                    <div className="relative">
                      <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <input
                        type={showPassword ? 'text' : 'password'}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder={authMode === 'login' ? 'Your password' : 'Choose a password'}
                        className="w-full pl-11 pr-12 py-3 border-2 border-slate-200 dark:border-zinc-700 rounded-xl text-slate-900 dark:text-white bg-white dark:bg-zinc-800 focus:border-purple-500 focus:outline-none transition-colors"
                        onKeyDown={(e) => e.key === 'Enter' && authMode === 'login' && canSubmit && handleAuth()}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(prev => !prev)}
                        className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                    {authMode === 'signup' && password.length > 0 && password.length < 4 && (
                      <p className="text-xs text-red-500 mt-1">Password must be at least 4 characters</p>
                    )}
                  </div>

                  {/* Confirm Password (signup only) */}
                  {authMode === 'signup' && (
                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                        Confirm Password
                      </label>
                      <div className="relative">
                        <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <input
                          type={showPassword ? 'text' : 'password'}
                          value={confirmPassword}
                          onChange={(e) => setConfirmPassword(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && canSubmit && handleAuth()}
                          placeholder="Confirm your password"
                          className={`w-full pl-11 pr-4 py-3 border-2 rounded-xl text-slate-900 dark:text-white bg-white dark:bg-zinc-800 focus:border-purple-500 focus:outline-none transition-colors ${
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

                {/* Error Message */}
                {authError && (
                  <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-3 mt-4">
                    <p className="text-xs text-red-700 dark:text-red-300">{authError}</p>
                  </div>
                )}

                {/* Tunnel URL display */}
                <div className="bg-slate-50 dark:bg-zinc-800 rounded-xl p-3 border border-slate-200 dark:border-zinc-700 mt-4">
                  <div className="text-xs text-slate-500 dark:text-slate-400 mb-0.5">Hub URL</div>
                  <div className="font-mono text-xs text-slate-900 dark:text-white break-all">
                    {hubService.normalizeTunnelUrl(tunnelUrl)}
                  </div>
                </div>

                {/* Submit Button */}
                <button
                  onClick={handleAuth}
                  disabled={!canSubmit || joining}
                  className={`w-full py-4 rounded-xl font-bold text-white flex items-center justify-center gap-2 transition-all duration-300 mt-6 ${
                    canSubmit && !joining
                      ? 'bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 shadow-lg hover:shadow-xl hover:scale-[1.02] active:scale-95'
                      : 'bg-slate-300 dark:bg-zinc-700 cursor-not-allowed opacity-50'
                  }`}
                >
                  {joining ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      {authMode === 'login' ? 'Logging in...' : 'Creating Account...'}
                    </>
                  ) : (
                    authMode === 'login' ? 'Log In & Join' : 'Create Account & Join'
                  )}
                </button>

                {/* Switch mode hint */}
                <p className="text-center text-xs text-slate-500 dark:text-slate-400 mt-4">
                  {authMode === 'signup' ? (
                    <>Already have an account? <button onClick={() => switchAuthMode('login')} className="text-purple-600 dark:text-purple-400 font-semibold hover:underline">Log in</button></>
                  ) : (
                    <>New here? <button onClick={() => switchAuthMode('signup')} className="text-purple-600 dark:text-purple-400 font-semibold hover:underline">Create an account</button></>
                  )}
                </p>
              </>
            )}

            {/* ───── Error State ───── */}
            {step === 'error' && (
              <div className="text-center py-8">
                <div className="w-16 h-16 rounded-2xl bg-red-100 dark:bg-red-900/30 flex items-center justify-center mx-auto mb-4">
                  <AlertCircle className="w-8 h-8 text-red-600 dark:text-red-400" />
                </div>
                <h3 className="text-xl font-semibold text-slate-900 dark:text-white mb-2">
                  Something went wrong
                </h3>
                <p className="text-slate-600 dark:text-slate-400 mb-6">
                  {probeError || 'An unexpected error occurred. Please try again.'}
                </p>
                <button
                  onClick={() => setStep('input')}
                  className="px-6 py-3 bg-purple-600 text-white rounded-xl font-semibold hover:bg-purple-700 transition-colors"
                >
                  Try Again
                </button>
              </div>
            )}
          </motion.div>
        </div>
      </div>
    </div>
  );
}
