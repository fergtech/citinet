import { useEffect, useState } from 'react';
import { MapContainer, TileLayer, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { motion, AnimatePresence } from 'motion/react';
import { ArrowRight, Shield, Users, FileText, Check, User, Tag, LogIn, Eye, EyeOff, Download, Share, X } from 'lucide-react';
import { hubService } from '../services/hubService';
import { useHub } from '../context/HubContext';
import { useInstallPrompt } from '../hooks/useInstallPrompt';
import type { HubUser } from '../types/hub';

export type UserNodeData = HubUser;

interface NodeEntryFlowProps {
  onComplete: (userData: HubUser) => void;
  locationName: string;
  hubSlug: string;
}

const availableTags = [
  'Urban Planning', 'Education', 'Healthcare', 'Arts & Culture',
  'Technology', 'Environment', 'Small Business', 'Community Safety',
  'Housing', 'Transportation', 'Youth Programs', 'Senior Services'
];

const manifestoPrinciples = [
  {
    title: 'Local Ownership',
    description: 'This network is owned and governed by the community, not by corporations or external interests.'
  },
  {
    title: 'Chronological Feeds',
    description: 'Information appears in the order it was shared — not ranked by engagement algorithms.'
  },
  {
    title: 'Collective Moderation',
    description: 'Community standards are set and enforced by local members through transparent processes.'
  },
  {
    title: 'Privacy by Default',
    description: 'Your data stays local. No tracking, no profiling, no selling of personal information.'
  },
  {
    title: 'Participation Over Consumption',
    description: 'This is a civic space for community building, not a platform for passive content consumption.'
  }
];

// ── Background map ─────────────────────────────────────────────────────────

function MapCenterUpdater({ center }: { center: [number, number] }) {
  const map = useMap();
  useEffect(() => {
    map.setView(center, 14, { animate: true });
  }, [center[0], center[1]]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

function BackgroundMap({ center }: { center: [number, number] }) {
  return (
    <MapContainer
      center={center}
      zoom={14}
      zoomControl={false}
      dragging={false}
      scrollWheelZoom={false}
      doubleClickZoom={false}
      touchZoom={false}
      keyboard={false}
      attributionControl={false}
      style={{ width: '100%', height: '100%' }}
    >
      <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" />
      <MapCenterUpdater center={center} />
    </MapContainer>
  );
}

async function geocodeLocation(location: string): Promise<[number, number] | null> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(location)}&limit=1`
    );
    const data = await res.json();
    if (data.length > 0) return [parseFloat(data[0].lat), parseFloat(data[0].lon)];
    return null;
  } catch {
    return null;
  }
}

// ── Component ──────────────────────────────────────────────────────────────

export function NodeEntryFlow({ onComplete, locationName, hubSlug }: NodeEntryFlowProps) {
  const { currentHub } = useHub();
  const { showBanner, isIOS, isAndroidInstallable, install, dismiss } = useInstallPrompt();

  const [mode, setMode] = useState<'signup' | 'login'>('signup');

  // Map center — starts on hub lat/lng, falls back to geocoding, then US default
  const DEFAULT_CENTER: [number, number] = [39.8283, -98.5795];
  const [mapCenter, setMapCenter] = useState<[number, number]>(DEFAULT_CENTER);

  useEffect(() => {
    if (currentHub?.lat && currentHub?.lng) {
      setMapCenter([currentHub.lat, currentHub.lng]);
      return;
    }
    const loc = currentHub?.location || locationName;
    if (loc) {
      geocodeLocation(loc).then(coords => { if (coords) setMapCenter(coords); });
    }
  }, [currentHub?.lat, currentHub?.lng, currentHub?.location, locationName]);

  // Signup state
  const [step, setStep] = useState(1);
  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [agreedToManifesto, setAgreedToManifesto] = useState(false);

  // Login state
  const [loginUsername, setLoginUsername] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [showLoginPassword, setShowLoginPassword] = useState(false);

  // Shared
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleTagToggle = (tag: string) => {
    setSelectedTags(prev =>
      prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
    );
  };

  const switchMode = (m: 'signup' | 'login') => {
    setMode(m);
    setError(null);
    setStep(1);
  };

  const handleLogin = async () => {
    if (!loginUsername.trim() || !loginPassword) return;
    setLoading(true);
    setError(null);
    try {
      const userData = await hubService.loginUser(hubSlug, {
        username: loginUsername.trim().toLowerCase(),
        password: loginPassword,
      });
      onComplete(userData);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  const handleSignup = async () => {
    if (!agreedToManifesto) return;
    setLoading(true);
    setError(null);
    try {
      const userData = await hubService.registerUser(hubSlug, {
        username: username.trim().toLowerCase(),
        password,
      });
      const merged: HubUser = {
        ...userData,
        displayName: displayName.trim() || userData.displayName,
        tags: selectedTags,
        agreedToManifesto: true,
      };
      onComplete(merged);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  const canProceedStep1 =
    displayName.trim().length >= 2 &&
    username.trim().length >= 2 &&
    password.length >= 6;

  // Shared card class (glass morphism on map background)
  const cardClass = 'bg-zinc-900/80 backdrop-blur-md rounded-2xl p-6 shadow-lg border border-white/10';
  const inputClass = 'w-full px-4 py-3 rounded-xl border-2 border-white/10 bg-zinc-950/60 text-white font-medium placeholder-zinc-500 focus:border-purple-500 focus:outline-none transition-colors';
  const labelClass = 'block text-sm font-semibold text-slate-200 mb-2';

  return (
    // Force dark mode so all dark: classes apply regardless of system preference,
    // since the map background is always dark.
    <div className="dark min-h-screen relative overflow-hidden">

      {/* ── Fixed map background ── */}
      <div className="fixed inset-0 z-0" style={{ pointerEvents: 'none' }}>
        <BackgroundMap center={mapCenter} />
        {/* Overlay — darkens map so form text is readable */}
        <div className="absolute inset-0 bg-zinc-950/60" />
      </div>

      {/* ── Content ── */}

      {/* LOGIN MODE */}
      {mode === 'login' && (
        <div className="relative z-10 flex items-center justify-center min-h-screen px-6">
          <div className="w-full max-w-md space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="text-center space-y-2">
              <div className="w-16 h-16 bg-gradient-to-br from-blue-600 to-purple-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <LogIn className="w-8 h-8 text-white" />
              </div>
              <h1 className="text-3xl font-semibold text-white">Welcome back</h1>
              <p className="text-slate-400 text-sm">{locationName}</p>
            </div>

            <div className={cardClass + ' space-y-4'}>
              <div>
                <label className={labelClass}>Username</label>
                <input
                  type="text"
                  value={loginUsername}
                  onChange={e => setLoginUsername(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleLogin()}
                  placeholder="your username"
                  autoFocus
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Password</label>
                <div className="relative">
                  <input
                    type={showLoginPassword ? 'text' : 'password'}
                    value={loginPassword}
                    onChange={e => setLoginPassword(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleLogin()}
                    placeholder="••••••••"
                    className={inputClass + ' pr-12'}
                  />
                  <button
                    type="button"
                    onClick={() => setShowLoginPassword(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-300"
                  >
                    {showLoginPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {error && (
                <p className="text-sm text-red-400 bg-red-900/30 rounded-xl px-4 py-3">{error}</p>
              )}

              <button
                onClick={handleLogin}
                disabled={loading || !loginUsername.trim() || !loginPassword}
                className="w-full py-3 rounded-xl font-bold text-white bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg flex items-center justify-center gap-2"
              >
                {loading
                  ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  : <><LogIn className="w-4 h-4" /> Sign In</>
                }
              </button>
            </div>

            <p className="text-center text-sm text-slate-400">
              New to {locationName}?{' '}
              <button onClick={() => switchMode('signup')} className="text-purple-400 font-semibold hover:underline">
                Create account
              </button>
            </p>
          </div>
        </div>
      )}

      {/* SIGNUP MODE */}
      {mode === 'signup' && (
        <div className="relative z-10">
          {/* Progress bar */}
          <div className="sticky top-0 z-20 bg-zinc-950/75 backdrop-blur-lg border-b border-white/10">
            <div className="max-w-2xl mx-auto px-6 py-4">
              <div className="flex items-center gap-2 mb-2">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${step >= 1 ? 'bg-purple-600 text-white' : 'bg-white/10 text-slate-400'}`}>
                  {step > 1 ? <Check className="w-4 h-4" /> : '1'}
                </div>
                <div className={`flex-1 h-1 rounded-full ${step >= 2 ? 'bg-purple-600' : 'bg-white/10'}`} />
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${step >= 2 ? 'bg-purple-600 text-white' : 'bg-white/10 text-slate-400'}`}>
                  2
                </div>
              </div>
              <p className="text-xs text-slate-400 font-medium">
                {step === 1 ? 'Your Profile' : 'Community Agreement'}
              </p>
            </div>
          </div>

          <div className="max-w-2xl mx-auto px-6 py-12">

            {/* ── Step 1: Identity ── */}
            {step === 1 && (
              <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="text-center space-y-3">
                  <div className="w-16 h-16 bg-gradient-to-br from-blue-600 to-purple-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
                    <User className="w-8 h-8 text-white" />
                  </div>
                  <h1 className="text-3xl md:text-4xl font-semibold text-white tracking-tight">
                    Welcome to {locationName}
                  </h1>
                  <p className="text-base text-slate-300 font-light max-w-xl mx-auto">
                    Set up how you appear to your neighbors.
                  </p>
                </div>

                {/* Credentials */}
                <div className={cardClass + ' space-y-4'}>
                  <div>
                    <label className={labelClass}>
                      Display Name <span className="text-slate-500 font-normal text-xs">Required — how neighbors see you</span>
                    </label>
                    <input
                      type="text"
                      value={displayName}
                      onChange={e => setDisplayName(e.target.value)}
                      placeholder="How you'll appear to neighbors"
                      maxLength={50}
                      autoFocus
                      className={inputClass}
                    />
                    <p className="text-xs text-slate-500 mt-1">{displayName.length}/50 — No real name required, pseudonyms welcome.</p>
                  </div>
                  <div>
                    <label className={labelClass}>
                      Username <span className="text-slate-500 font-normal text-xs">Required — used to log in</span>
                    </label>
                    <input
                      type="text"
                      value={username}
                      onChange={e => setUsername(e.target.value.toLowerCase().replace(/\s+/g, ''))}
                      placeholder="e.g. janesmith"
                      maxLength={30}
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>
                      Password <span className="text-slate-500 font-normal text-xs">Min 6 characters</span>
                    </label>
                    <div className="relative">
                      <input
                        type={showPassword ? 'text' : 'password'}
                        value={password}
                        onChange={e => setPassword(e.target.value)}
                        placeholder="••••••••"
                        className={inputClass + ' pr-12'}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(v => !v)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-300"
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Interests */}
                <div className={cardClass}>
                  <div className="flex items-center gap-2 mb-1">
                    <Tag className="w-4 h-4 text-purple-400" />
                    <span className="text-sm font-semibold text-slate-200">Community Interests</span>
                    <span className="text-xs text-slate-500">Optional</span>
                  </div>
                  <p className="text-xs text-slate-400 mb-4">
                    Select areas you care about — these show on your profile and help neighbors find common ground.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {availableTags.map(tag => (
                      <button
                        key={tag}
                        onClick={() => handleTagToggle(tag)}
                        className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                          selectedTags.includes(tag)
                            ? 'bg-purple-600 text-white shadow-sm'
                            : 'bg-white/8 text-slate-300 hover:bg-white/15 border border-white/10'
                        }`}
                      >
                        {tag}
                      </button>
                    ))}
                  </div>
                </div>

                <button
                  onClick={() => setStep(2)}
                  disabled={!canProceedStep1}
                  className={`w-full py-4 rounded-xl font-bold text-white flex items-center justify-center gap-2 transition-all ${
                    canProceedStep1
                      ? 'bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 shadow-lg hover:scale-[1.02] active:scale-95'
                      : 'bg-white/10 cursor-not-allowed opacity-50'
                  }`}
                >
                  Continue <ArrowRight className="w-5 h-5" />
                </button>

                <p className="text-center text-sm text-slate-400">
                  Already have an account?{' '}
                  <button onClick={() => switchMode('login')} className="text-purple-400 font-semibold hover:underline">
                    Sign in
                  </button>
                </p>
              </div>
            )}

            {/* ── Step 2: Community Agreement ── */}
            {step === 2 && (
              <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="text-center space-y-3">
                  <div className="w-16 h-16 bg-gradient-to-br from-blue-600 to-purple-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
                    <FileText className="w-8 h-8 text-white" />
                  </div>
                  <h1 className="text-3xl md:text-4xl font-semibold text-white tracking-tight">
                    How This Network Operates
                  </h1>
                  <p className="text-base text-slate-300 font-light max-w-xl mx-auto">
                    Not terms of service — shared principles.<br />
                    <span className="text-sm text-slate-500">Understanding these is how trust is built.</span>
                  </p>
                </div>

                <div className="space-y-3">
                  {manifestoPrinciples.map((principle, i) => (
                    <div key={i} className="bg-zinc-900/70 backdrop-blur-md rounded-2xl p-5 border border-white/8">
                      <div className="flex items-start gap-3">
                        <Shield className="w-4 h-4 text-purple-400 mt-0.5 shrink-0" />
                        <div>
                          <h3 className="text-sm font-semibold text-white mb-1">{principle.title}</h3>
                          <p className="text-xs text-slate-400 font-light leading-relaxed">{principle.description}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="bg-purple-500/15 backdrop-blur-md rounded-2xl p-6 border-2 border-purple-500/35">
                  <label className="flex items-start gap-4 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={agreedToManifesto}
                      onChange={e => setAgreedToManifesto(e.target.checked)}
                      className="w-5 h-5 mt-0.5 rounded border-2 border-purple-600 text-purple-600 focus:ring-2 focus:ring-purple-500 cursor-pointer"
                    />
                    <div>
                      <p className="text-sm font-semibold text-white">
                        I understand and agree to these community principles
                      </p>
                      <p className="text-xs text-slate-400 mt-1 font-light">
                        By joining, you commit to participating in good faith and respecting community standards.
                      </p>
                    </div>
                  </label>
                </div>

                {error && (
                  <p className="text-sm text-red-400 bg-red-900/30 rounded-xl px-4 py-3">{error}</p>
                )}

                <div className="flex gap-3">
                  <button
                    onClick={() => setStep(1)}
                    disabled={loading}
                    className="flex-1 py-4 rounded-xl font-bold text-slate-300 bg-white/8 hover:bg-white/15 border border-white/10 transition-all"
                  >
                    Back
                  </button>
                  <button
                    onClick={handleSignup}
                    disabled={!agreedToManifesto || loading}
                    className={`flex-1 py-4 rounded-xl font-bold text-white flex items-center justify-center gap-2 transition-all ${
                      agreedToManifesto && !loading
                        ? 'bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 shadow-lg hover:scale-[1.02] active:scale-95'
                        : 'bg-white/10 cursor-not-allowed opacity-50'
                    }`}
                  >
                    {loading
                      ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      : <><Users className="w-5 h-5" /> Enter {locationName}</>
                    }
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── PWA Install Banner ── */}
      <AnimatePresence>
        {showBanner && (
          <motion.div
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 100, opacity: 0 }}
            transition={{ type: 'spring', damping: 24, stiffness: 260 }}
            className="fixed bottom-0 left-0 right-0 z-50 p-4 pb-safe"
          >
            <div className="max-w-md mx-auto bg-zinc-900/95 backdrop-blur-xl border border-white/10 rounded-2xl p-4 shadow-2xl flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-600 to-blue-600 flex items-center justify-center shrink-0 mt-0.5">
                {isIOS ? <Share className="w-5 h-5 text-white" /> : <Download className="w-5 h-5 text-white" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-white font-semibold text-sm">Add CitiNet to your home screen</p>
                {isIOS ? (
                  <p className="text-white/60 text-xs mt-0.5 leading-relaxed">
                    Tap <strong className="text-white/80">Share</strong> in your browser, then{' '}
                    <strong className="text-white/80">Add to Home Screen</strong>.
                  </p>
                ) : (
                  <p className="text-white/60 text-xs mt-0.5">Install for faster access — no App Store needed.</p>
                )}
                {isAndroidInstallable && (
                  <button
                    onClick={install}
                    className="mt-2 px-4 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold transition-colors"
                  >
                    Install
                  </button>
                )}
              </div>
              <button
                onClick={dismiss}
                className="text-white/40 hover:text-white/70 transition-colors shrink-0 mt-0.5"
                aria-label="Dismiss"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
