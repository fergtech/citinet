import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ArrowRight, Shield, Users, FileText, Check, User, Tag, LogIn, Eye, EyeOff, Download, Share, X } from 'lucide-react';
import { hubService } from '../services/hubService';
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

export function NodeEntryFlow({ onComplete, locationName, hubSlug }: NodeEntryFlowProps) {
  const { showBanner, isIOS, isAndroidInstallable, install, dismiss } = useInstallPrompt();

  const [mode, setMode] = useState<'signup' | 'login'>('signup');

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
      // Generate/refresh encryption keys in the background — never blocks login
      hubService.ensureUserKeys(hubSlug).catch(() => {});
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
      // Generate encryption keys in the background — never blocks registration
      hubService.ensureUserKeys(hubSlug).catch(() => {});
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

  const cardClass = 'bg-zinc-800 rounded-2xl p-6 border border-zinc-700';
  const inputClass = 'w-full px-4 py-3 rounded-xl border-2 border-zinc-600 bg-zinc-900 text-white font-medium placeholder-zinc-500 focus:border-purple-500 focus:outline-none transition-colors';
  const labelClass = 'block text-sm font-semibold text-zinc-200 mb-2';

  return (
    <div className="min-h-screen bg-zinc-950 text-white">

      {/* LOGIN MODE */}
      {mode === 'login' && (
        <div className="flex items-center justify-center min-h-screen px-6">
          <div className="w-full max-w-md space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="text-center space-y-2">
              <div className="w-16 h-16 bg-gradient-to-br from-blue-600 to-purple-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <LogIn className="w-8 h-8 text-white" />
              </div>
              <h1 className="text-3xl font-semibold text-white">Welcome back</h1>
              <p className="text-zinc-400 text-sm">{locationName}</p>
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
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-200"
                  >
                    {showLoginPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {error && (
                <p className="text-sm text-red-400 bg-red-950/50 rounded-xl px-4 py-3">{error}</p>
              )}

              <button
                onClick={handleLogin}
                disabled={loading || !loginUsername.trim() || !loginPassword}
                className="w-full py-3 rounded-xl font-bold text-white bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-lg flex items-center justify-center gap-2"
              >
                {loading
                  ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  : <><LogIn className="w-4 h-4" /> Sign In</>
                }
              </button>
            </div>

            <p className="text-center text-sm text-zinc-400">
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
        <>
          {/* Progress */}
          <div className="sticky top-0 bg-zinc-950/90 backdrop-blur-lg border-b border-zinc-800 z-10">
            <div className="max-w-2xl mx-auto px-6 py-4">
              <div className="flex items-center gap-2 mb-2">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${step >= 1 ? 'bg-purple-600 text-white' : 'bg-zinc-700 text-zinc-400'}`}>
                  {step > 1 ? <Check className="w-4 h-4" /> : '1'}
                </div>
                <div className={`flex-1 h-1 rounded-full ${step >= 2 ? 'bg-purple-600' : 'bg-zinc-700'}`} />
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${step >= 2 ? 'bg-purple-600 text-white' : 'bg-zinc-700 text-zinc-400'}`}>
                  2
                </div>
              </div>
              <p className="text-xs text-zinc-400 font-medium">
                {step === 1 ? 'Your Profile' : 'Community Agreement'}
              </p>
            </div>
          </div>

          <div className="max-w-2xl mx-auto px-6 py-12">

            {/* Step 1 */}
            {step === 1 && (
              <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="text-center space-y-3">
                  <div className="w-16 h-16 bg-gradient-to-br from-blue-600 to-purple-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
                    <User className="w-8 h-8 text-white" />
                  </div>
                  <h1 className="text-3xl md:text-4xl font-semibold text-white tracking-tight">
                    Welcome to {locationName}
                  </h1>
                  <p className="text-base text-zinc-400 font-light max-w-xl mx-auto">
                    Set up how you appear to your neighbors.
                  </p>
                </div>

                <div className={cardClass + ' space-y-4'}>
                  <div>
                    <label className={labelClass}>
                      Display Name <span className="text-zinc-500 font-normal text-xs">Required — how neighbors see you</span>
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
                    <p className="text-xs text-zinc-500 mt-1">{displayName.length}/50 — No real name required, pseudonyms welcome.</p>
                  </div>
                  <div>
                    <label className={labelClass}>
                      Username <span className="text-zinc-500 font-normal text-xs">Required — used to log in</span>
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
                      Password <span className="text-zinc-500 font-normal text-xs">Min 6 characters</span>
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
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-200"
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                </div>

                <div className={cardClass}>
                  <div className="flex items-center gap-2 mb-1">
                    <Tag className="w-4 h-4 text-purple-400" />
                    <span className="text-sm font-semibold text-zinc-200">Community Interests</span>
                    <span className="text-xs text-zinc-500">Optional</span>
                  </div>
                  <p className="text-xs text-zinc-400 mb-4">
                    Select areas you care about — these show on your profile and help neighbors find common ground.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {availableTags.map(tag => (
                      <button
                        key={tag}
                        onClick={() => handleTagToggle(tag)}
                        className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                          selectedTags.includes(tag)
                            ? 'bg-purple-600 text-white'
                            : 'bg-zinc-700 text-zinc-300 hover:bg-zinc-600'
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
                      : 'bg-zinc-700 cursor-not-allowed opacity-40'
                  }`}
                >
                  Continue <ArrowRight className="w-5 h-5" />
                </button>

                <p className="text-center text-sm text-zinc-400">
                  Already have an account?{' '}
                  <button onClick={() => switchMode('login')} className="text-purple-400 font-semibold hover:underline">
                    Sign in
                  </button>
                </p>
              </div>
            )}

            {/* Step 2 */}
            {step === 2 && (
              <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="text-center space-y-3">
                  <div className="w-16 h-16 bg-gradient-to-br from-blue-600 to-purple-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
                    <FileText className="w-8 h-8 text-white" />
                  </div>
                  <h1 className="text-3xl md:text-4xl font-semibold text-white tracking-tight">
                    How This Network Operates
                  </h1>
                  <p className="text-base text-zinc-400 font-light max-w-xl mx-auto">
                    Not terms of service — shared principles.<br />
                    <span className="text-sm text-zinc-500">Understanding these is how trust is built.</span>
                  </p>
                </div>

                <div className="space-y-3">
                  {manifestoPrinciples.map((principle, i) => (
                    <div key={i} className={cardClass}>
                      <div className="flex items-start gap-3">
                        <Shield className="w-4 h-4 text-purple-400 mt-0.5 shrink-0" />
                        <div>
                          <h3 className="text-sm font-semibold text-white mb-1">{principle.title}</h3>
                          <p className="text-xs text-zinc-400 font-light leading-relaxed">{principle.description}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="bg-purple-950/50 rounded-2xl p-6 border-2 border-purple-700/50">
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
                      <p className="text-xs text-zinc-400 mt-1 font-light">
                        By joining, you commit to participating in good faith and respecting community standards.
                      </p>
                    </div>
                  </label>
                </div>

                {error && (
                  <p className="text-sm text-red-400 bg-red-950/50 rounded-xl px-4 py-3">{error}</p>
                )}

                <div className="flex gap-3">
                  <button
                    onClick={() => setStep(1)}
                    disabled={loading}
                    className="flex-1 py-4 rounded-xl font-bold text-zinc-300 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 transition-all"
                  >
                    Back
                  </button>
                  <button
                    onClick={handleSignup}
                    disabled={!agreedToManifesto || loading}
                    className={`flex-1 py-4 rounded-xl font-bold text-white flex items-center justify-center gap-2 transition-all ${
                      agreedToManifesto && !loading
                        ? 'bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 shadow-lg hover:scale-[1.02] active:scale-95'
                        : 'bg-zinc-700 cursor-not-allowed opacity-40'
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
        </>
      )}

      {/* PWA Install Banner */}
      <AnimatePresence>
        {showBanner && (
          <motion.div
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 100, opacity: 0 }}
            transition={{ type: 'spring', damping: 24, stiffness: 260 }}
            className="fixed bottom-0 left-0 right-0 z-50 p-4 pb-safe"
          >
            <div className="max-w-md mx-auto bg-zinc-900/95 backdrop-blur-xl border border-zinc-700 rounded-2xl p-4 shadow-2xl flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-600 to-blue-600 flex items-center justify-center shrink-0 mt-0.5">
                {isIOS ? <Share className="w-5 h-5 text-white" /> : <Download className="w-5 h-5 text-white" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-white font-semibold text-sm">
                  {locationName ? `Install ${locationName} as your local portal` : 'Add CitiNet to your home screen'}
                </p>
                {isIOS ? (
                  <p className="text-zinc-400 text-xs mt-0.5 leading-relaxed">
                    Tap <strong className="text-zinc-200">Share</strong> in Safari, then{' '}
                    <strong className="text-zinc-200">Add to Home Screen</strong>.
                  </p>
                ) : (
                  <p className="text-zinc-400 text-xs mt-0.5">
                    {locationName ? 'One-tap access to your local hub — no internet needed.' : 'Install for faster access — no App Store needed.'}
                  </p>
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
                className="text-zinc-500 hover:text-zinc-300 transition-colors shrink-0 mt-0.5"
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
