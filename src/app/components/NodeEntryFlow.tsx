import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ArrowRight, Shield, Users, FileText, User, Tag, LogIn, Eye, EyeOff, Download, Share, X, Lock, KeyRound, Copy, Check as CheckIcon, AlertTriangle } from 'lucide-react';
import { hubService } from '../services/hubService';
import { checkPasswordStrength } from '../utils/passwordStrength';
import { useInstallPrompt } from '../hooks/useInstallPrompt';
import { OnboardingBackground } from './OnboardingBackground';
import { clearSubdomainCache } from '../utils/subdomain';
import { CitinetLogo } from './CitinetLogo';
import { HubIcon } from './HubIcon';
import type { Hub, HubUser } from '../types/hub';

export type UserNodeData = HubUser;

interface NodeEntryFlowProps {
  onComplete: (userData: HubUser) => void;
  locationName: string;
  hubSlug: string;
  /** Post-join hub record, when a connection already exists — used to render the
   * hub's own custom identity icon instead of the generic citinet logo. */
  hub?: Hub;
  /** 'signup' only for the hub creator's first visit fresh from the setup
   * wizard; 'login' for everyone else (returning members and any other
   * guest), with "Create account" one click away. */
  defaultMode?: 'signup' | 'login';
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
    description: 'Information appears in the order it was shared, not ranked by engagement algorithms.'
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

function MiniProgress({ step }: { step: 1 | 2 }) {
  const label = step === 1 ? 'Your Profile' : 'Community Agreement';
  const pct = step === 1 ? 50 : 100;
  return (
    <div className="mb-6">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[11px] font-semibold text-purple-600 dark:text-purple-400 uppercase tracking-wide">
          Step {step} of 2 : {label}
        </span>
        <span className="text-[11px] font-semibold text-slate-400 dark:text-slate-500">{pct}%</span>
      </div>
      <div className="w-full bg-slate-100 dark:bg-zinc-800 rounded-full h-1">
        <motion.div
          className="bg-gradient-to-r from-blue-600 to-purple-600 h-1 rounded-full"
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.35 }}
        />
      </div>
    </div>
  );
}

export function NodeEntryFlow({ onComplete, locationName, hubSlug, hub, defaultMode = 'signup' }: NodeEntryFlowProps) {
  const { showBanner, isIOS, isAndroidInstallable, install, dismiss } = useInstallPrompt();

  const [mode, setMode] = useState<'signup' | 'login'>(defaultMode);

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

  // Recovery-phrase flow (encryption key setup/restore) -- gates entry into
  // the hub after a successful login/signup whenever there's something the
  // user needs to see or provide first. 'none' means proceed normally.
  const [recoveryStep, setRecoveryStep] = useState<'none' | 'show-phrase' | 'enter-phrase'>('none');
  const [pendingUserData, setPendingUserData] = useState<HubUser | null>(null);
  const [recoveryPhraseToShow, setRecoveryPhraseToShow] = useState('');
  const [phraseSavedConfirmed, setPhraseSavedConfirmed] = useState(false);
  const [phraseCopied, setPhraseCopied] = useState(false);
  const [enteredPhrase, setEnteredPhrase] = useState('');
  const [recoveryBusy, setRecoveryBusy] = useState(false);
  const [recoveryError, setRecoveryError] = useState('');
  const [confirmingSkip, setConfirmingSkip] = useState(false);

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

  /** Full disconnect from this hub — for someone who landed here (e.g. after
   * sign-out or a session expiry) but actually wants a different hub entirely. */
  const handleSwitchHub = () => {
    hubService.leaveHub(hubSlug);
    clearSubdomainCache();
    window.location.href = window.location.origin + '/join';
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
      const keyResult = await hubService.ensureUserKeys(hubSlug).catch(() => ({ status: 'no-backup' as const }));

      if (keyResult.status === 'no-backup') {
        // Never had encryption set up (brand-new account, or an account from
        // before recovery phrases existed with no backup at all) — set it up
        // now and show the phrase once before entering the hub.
        setPendingUserData(userData);
        const phrase = await hubService.setupNewAccountKeys(hubSlug);
        if (phrase) { setRecoveryPhraseToShow(phrase); setRecoveryStep('show-phrase'); }
        else onComplete(userData);
      } else if (keyResult.status === 'has-keys-new-backup') {
        // This device already had keys, but the account had no server-side
        // backup at all until just now (ensureUserKeys creates one on the spot
        // specifically to prevent this same gap from causing exactly the kind
        // of unrecoverable content loss it's meant to guard against). Show
        // the phrase before continuing, same as first-time setup.
        setPendingUserData(userData);
        if (keyResult.newPhrase) { setRecoveryPhraseToShow(keyResult.newPhrase); setRecoveryStep('show-phrase'); }
        else onComplete(userData);
      } else if (keyResult.status === 'needs-recovery') {
        // A backup exists but this device has no local keys. Try the login
        // password first, silently — pre-recovery-phrase accounts had their
        // backup wrapped under it, so this upgrades them transparently
        // instead of asking for a phrase they were never given.
        const legacyRestored = await hubService.restoreFromKeyBackup(hubSlug, loginPassword).catch(() => false);
        setPendingUserData(userData);
        if (legacyRestored) {
          const phrase = await hubService.regenerateRecoveryPhrase(hubSlug);
          if (phrase) { setRecoveryPhraseToShow(phrase); setRecoveryStep('show-phrase'); }
          else onComplete(userData);
        } else {
          setRecoveryStep('enter-phrase');
        }
      } else {
        onComplete(userData);
      }
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
        displayName: displayName.trim(),
        tags: selectedTags,
      });
      const merged: HubUser = {
        ...userData,
        displayName: displayName.trim() || userData.displayName,
        tags: selectedTags,
        agreedToManifesto: true,
      };
      setPendingUserData(merged);
      const phrase = await hubService.setupNewAccountKeys(hubSlug);
      if (phrase) { setRecoveryPhraseToShow(phrase); setRecoveryStep('show-phrase'); }
      else onComplete(merged);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  const handleContinueAfterPhrase = () => {
    if (pendingUserData) onComplete(pendingUserData);
  };

  const handleCopyPhrase = async () => {
    try {
      await navigator.clipboard.writeText(recoveryPhraseToShow);
      setPhraseCopied(true);
      setTimeout(() => setPhraseCopied(false), 2000);
    } catch { /* clipboard access denied — user can still select/copy manually */ }
  };

  const handleRestoreWithPhrase = async () => {
    if (!pendingUserData) return;
    setRecoveryBusy(true);
    setRecoveryError('');
    try {
      const normalized = enteredPhrase.trim().toLowerCase().replace(/\s+/g, '-');
      const ok = await hubService.restoreFromKeyBackup(hubSlug, normalized);
      if (ok) onComplete(pendingUserData);
      else setRecoveryError("That phrase didn't match. Check the spelling and try again.");
    } finally {
      setRecoveryBusy(false);
    }
  };

  const handleSkipRecovery = async () => {
    if (!pendingUserData) return;
    setRecoveryBusy(true);
    try {
      await hubService.generateFreshDeviceKeys(hubSlug);
    } finally {
      setRecoveryBusy(false);
      onComplete(pendingUserData);
    }
  };

  const passwordStrength = checkPasswordStrength(password);
  const canProceedStep1 =
    displayName.trim().length >= 2 &&
    username.trim().length >= 2 &&
    passwordStrength.acceptable;

  const labelClass = 'block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1';
  const inputClass = 'w-full h-[42px] px-3.5 border border-slate-200 dark:border-white/10 rounded-lg text-slate-900 dark:text-white bg-white dark:bg-zinc-800 text-[13.5px] focus:border-purple-500 focus:outline-none transition-colors';
  const cardClass = 'p-4 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-zinc-800/60';

  // Recovery-phrase interstitials take over the whole screen, gating entry
  // into the hub until the user has either saved their new phrase or
  // provided/skipped an existing one.
  if (recoveryStep === 'show-phrase') {
    return (
      <div
        className="min-h-[100dvh] relative overflow-hidden flex flex-col"
        style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <OnboardingBackground />
        <div className="flex-1 flex items-center justify-center p-6 relative z-10">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="cn-glass rounded-3xl shadow-2xl p-7 relative z-10 max-w-[460px] w-full mx-auto"
          >
            <div className="flex flex-col items-center text-center gap-1 mb-5">
              <div className="w-11 h-11 rounded-full bg-purple-100 dark:bg-purple-900/40 flex items-center justify-center mb-2">
                <KeyRound className="w-5 h-5 text-purple-600 dark:text-purple-400" />
              </div>
              <h2 className="text-xl font-bold text-slate-900 dark:text-white">Save your recovery phrase</h2>
              <p className="text-[13px] text-slate-500 dark:text-slate-400 max-w-sm">
                This unlocks your encrypted notes on a new device. It's shown only once — the hub doesn't store it anywhere it could read it back to you.
              </p>
            </div>

            <div className={`${cardClass} font-mono text-[15px] text-center text-slate-900 dark:text-white tracking-wide select-all`}>
              {recoveryPhraseToShow}
            </div>

            <button
              type="button"
              onClick={handleCopyPhrase}
              className="w-full mt-3 flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors"
            >
              {phraseCopied ? <CheckIcon className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              {phraseCopied ? 'Copied' : 'Copy to clipboard'}
            </button>

            <div className="rounded-xl p-3 mt-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
              <p className="text-xs text-amber-800 dark:text-amber-300 leading-relaxed">
                Anyone with this phrase can read your encrypted notes. If you lose it, encrypted content on a new device can't be recovered — write it down or save it in a password manager.
              </p>
            </div>

            <label className="flex items-center gap-2.5 mt-4 cursor-pointer">
              <input
                type="checkbox"
                checked={phraseSavedConfirmed}
                onChange={e => setPhraseSavedConfirmed(e.target.checked)}
                className="w-4 h-4 rounded border-slate-300 dark:border-purple-600 text-purple-600 focus:ring-2 focus:ring-purple-500 cursor-pointer"
              />
              <span className="text-xs text-slate-600 dark:text-slate-300">I've saved this phrase somewhere safe</span>
            </label>

            <button
              onClick={handleContinueAfterPhrase}
              disabled={!phraseSavedConfirmed}
              className={`w-full mt-5 py-3.5 rounded-xl font-bold text-white flex items-center justify-center gap-2 transition-all ${
                phraseSavedConfirmed
                  ? 'bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 shadow-lg hover:shadow-xl'
                  : 'bg-slate-200 dark:bg-zinc-700 text-slate-400 dark:text-slate-500 cursor-not-allowed'
              }`}
            >
              Continue <ArrowRight className="w-4 h-4" />
            </button>
          </motion.div>
        </div>
      </div>
    );
  }

  if (recoveryStep === 'enter-phrase') {
    return (
      <div
        className="min-h-[100dvh] relative overflow-hidden flex flex-col"
        style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <OnboardingBackground />
        <div className="flex-1 flex items-center justify-center p-6 relative z-10">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="cn-glass rounded-3xl shadow-2xl p-7 relative z-10 max-w-[460px] w-full mx-auto"
          >
            <div className="flex flex-col items-center text-center gap-1 mb-5">
              <div className="w-11 h-11 rounded-full bg-purple-100 dark:bg-purple-900/40 flex items-center justify-center mb-2">
                <KeyRound className="w-5 h-5 text-purple-600 dark:text-purple-400" />
              </div>
              <h2 className="text-xl font-bold text-slate-900 dark:text-white">New device detected</h2>
              <p className="text-[13px] text-slate-500 dark:text-slate-400 max-w-sm">
                Enter your recovery phrase to unlock your encrypted notes here too. If this account is old enough to predate recovery phrases, try the login password that was active back then instead — it may still work.
              </p>
            </div>

            <input
              type="text"
              value={enteredPhrase}
              onChange={e => setEnteredPhrase(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleRestoreWithPhrase()}
              placeholder="word-word-word-word-word-word-word"
              autoFocus
              className={`${inputClass} font-mono text-center`}
            />
            {recoveryError && <p className="text-xs text-red-500 dark:text-red-400 mt-2 text-center">{recoveryError}</p>}

            <button
              onClick={handleRestoreWithPhrase}
              disabled={recoveryBusy || !enteredPhrase.trim()}
              className="w-full mt-4 py-3.5 rounded-xl font-bold text-white bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 disabled:opacity-40 disabled:cursor-not-allowed shadow-lg hover:shadow-xl transition-all flex items-center justify-center gap-2"
            >
              {recoveryBusy ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" /> : 'Unlock'}
            </button>

            {!confirmingSkip ? (
              <button
                onClick={() => setConfirmingSkip(true)}
                disabled={recoveryBusy}
                className="w-full mt-2.5 py-2.5 rounded-xl text-xs font-medium text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
              >
                I don't have it — start fresh on this device
              </button>
            ) : (
              <div className="rounded-xl p-3.5 mt-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
                <div className="flex items-start gap-2.5 mb-3">
                  <AlertTriangle className="w-4 h-4 text-red-600 dark:text-red-400 mt-0.5 shrink-0" />
                  <p className="text-xs text-red-800 dark:text-red-300 leading-relaxed">
                    This permanently gives up on any encrypted notes, messages, or files this account already has — they'll show as encrypted forever after this, on every device, with no way back. Only do this if you're certain you don't have the phrase or the old password anywhere.
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setConfirmingSkip(false)}
                    disabled={recoveryBusy}
                    className="flex-1 py-2 rounded-lg text-xs font-medium border border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-zinc-800 transition-colors"
                  >
                    Go back
                  </button>
                  <button
                    onClick={handleSkipRecovery}
                    disabled={recoveryBusy}
                    className="flex-1 py-2 rounded-lg text-xs font-semibold bg-red-600 hover:bg-red-700 text-white transition-colors disabled:opacity-50"
                  >
                    {recoveryBusy ? 'Starting fresh…' : 'Yes, start fresh'}
                  </button>
                </div>
              </div>
            )}
          </motion.div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="min-h-[100dvh] relative overflow-hidden flex flex-col"
      style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <OnboardingBackground />

      {/* LOGIN MODE */}
      {mode === 'login' && (
        <div className="flex-1 flex items-center justify-center p-6 relative z-10">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="cn-glass rounded-3xl shadow-2xl p-6 relative z-10 max-w-[420px] w-full mx-auto"
          >
            <div className="flex flex-col items-center text-center gap-1 mb-5">
              {hub ? (
                <HubIcon hub={hub} baseUrl={hub.tunnelUrl} size={44} variant="badge" className="mb-2" />
              ) : (
                <CitinetLogo size={44} className="mb-2" />
              )}
              <h2 className="text-xl font-bold text-slate-900 dark:text-white">Welcome back</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">{locationName}</p>
            </div>

            <div className="space-y-3">
              <div>
                <label className={labelClass}>Username</label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    value={loginUsername}
                    onChange={e => setLoginUsername(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleLogin()}
                    placeholder="your username"
                    autoFocus
                    className={`${inputClass} pl-10`}
                  />
                </div>
              </div>
              <div>
                <label className={labelClass}>Password</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type={showLoginPassword ? 'text' : 'password'}
                    value={loginPassword}
                    onChange={e => setLoginPassword(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleLogin()}
                    placeholder="••••••••"
                    className={`${inputClass} pl-10 pr-10`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowLoginPassword(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                  >
                    {showLoginPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {error && (
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-3">
                  <p className="text-xs text-red-700 dark:text-red-300">{error}</p>
                </div>
              )}

              <button
                onClick={handleLogin}
                disabled={loading || !loginUsername.trim() || !loginPassword}
                className="w-full py-3.5 rounded-xl font-bold text-white bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-lg hover:shadow-xl flex items-center justify-center gap-2 mt-1"
              >
                {loading
                  ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  : <><LogIn className="w-4 h-4" /> Sign In</>
                }
              </button>
            </div>

            <div className="flex items-center gap-3 my-4">
              <div className="flex-1 h-px bg-slate-200 dark:bg-zinc-800" />
              <span className="text-[11px] text-slate-400 dark:text-zinc-500">or</span>
              <div className="flex-1 h-px bg-slate-200 dark:bg-zinc-800" />
            </div>

            <p className="text-center text-xs text-slate-500 dark:text-slate-400">
              New to {locationName}?{' '}
              <button onClick={() => switchMode('signup')} className="text-slate-700 dark:text-slate-200 font-semibold hover:underline">
                Create account
              </button>
            </p>
            <p className="text-center text-xs text-slate-400 dark:text-slate-500 mt-2">
              Not your hub?{' '}
              <button onClick={handleSwitchHub} className="hover:underline hover:text-slate-600 dark:hover:text-slate-300">
                Switch hubs
              </button>
            </p>
          </motion.div>
        </div>
      )}

      {/* SIGNUP MODE */}
      {mode === 'signup' && (
        <div className="flex-1 flex items-center justify-center p-6 relative z-10">
          <div className="w-full max-w-xl">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="cn-glass rounded-2xl shadow-2xl p-7"
            >
              <MiniProgress step={step as 1 | 2} />

              <AnimatePresence mode="wait">
                <motion.div
                  key={step}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.2 }}
                >
                  {/* Step 1 */}
                  {step === 1 && (
                    <div className="space-y-4">
                      <div className="flex flex-col items-center text-center gap-1 mb-5">
                        {hub ? (
                          <HubIcon hub={hub} baseUrl={hub.tunnelUrl} size={44} variant="badge" className="mb-2" />
                        ) : (
                          <CitinetLogo size={44} className="mb-2" />
                        )}
                        <h2 className="text-xl font-bold text-slate-900 dark:text-white">
                          Welcome to {locationName}
                        </h2>
                        <p className="text-[13px] text-slate-500 dark:text-slate-400">
                          Set up how you appear to your neighbors.
                        </p>
                      </div>

                      <div>
                        <label className={labelClass}>
                          Display Name <span className="text-slate-400 dark:text-slate-500 font-normal"> how neighbors see you</span>
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
                        <p className="text-xs text-slate-400 dark:text-slate-500 mt-1.5 ml-1">{displayName.length}/50 - No real name required, pseudonyms welcome.</p>
                      </div>
                      <div>
                        <label className={labelClass}>
                          Username <span className="text-slate-400 dark:text-slate-500 font-normal"> used to log in</span>
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
                          Password <span className="text-slate-400 dark:text-slate-500 font-normal"> min 10 characters</span>
                        </label>
                        <div className="relative">
                          <input
                            type={showPassword ? 'text' : 'password'}
                            value={password}
                            onChange={e => setPassword(e.target.value)}
                            placeholder="••••••••"
                            className={`${inputClass} pr-11`}
                          />
                          <button
                            type="button"
                            onClick={() => setShowPassword(v => !v)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                          >
                            {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          </button>
                        </div>
                        {password.length > 0 && !passwordStrength.acceptable && (
                          <p className="text-xs text-amber-600 dark:text-amber-400 mt-1.5 ml-1">{passwordStrength.reason}</p>
                        )}
                      </div>

                      <div className={cardClass}>
                        <div className="flex items-center gap-2 mb-1">
                          <Tag className="w-4 h-4 text-slate-400 dark:text-slate-500" />
                          <span className="text-sm font-semibold text-slate-800 dark:text-white">Community Interests</span>
                          <span className="text-xs text-slate-400 dark:text-slate-500">Optional</span>
                        </div>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
                          Select areas you care about. These show on your profile and help neighbors find common ground.
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {availableTags.map(tag => (
                            <button
                              key={tag}
                              onClick={() => handleTagToggle(tag)}
                              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                                selectedTags.includes(tag)
                                  ? 'bg-purple-600 text-white'
                                  : 'bg-white dark:bg-zinc-700 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-white/10 hover:border-purple-300 dark:hover:border-purple-600'
                              }`}
                            >
                              {tag}
                            </button>
                          ))}
                        </div>
                      </div>

                      <p className="text-center text-xs text-slate-500 dark:text-slate-400 pt-1">
                        Already have an account?{' '}
                        <button onClick={() => switchMode('login')} className="text-slate-700 dark:text-slate-200 font-semibold hover:underline">
                          Sign in
                        </button>
                      </p>
                    </div>
                  )}

                  {/* Step 2 */}
                  {step === 2 && (
                    <div className="space-y-4">
                      <div className="flex flex-col items-center text-center gap-1 mb-5">
                        <FileText className="w-8 h-8 text-slate-400 dark:text-slate-500 mb-1" />
                        <h2 className="text-xl font-bold text-slate-900 dark:text-white">
                          How This Network Operates
                        </h2>
                        <p className="text-[13px] text-slate-500 dark:text-slate-400 max-w-sm">
                          Not terms of service, but shared principles. Understanding these is how trust is built.
                        </p>
                      </div>

                      <div className="space-y-2.5">
                        {manifestoPrinciples.map((principle, i) => (
                          <div key={i} className={cardClass}>
                            <div className="flex items-start gap-3">
                              <Shield className="w-4 h-4 text-slate-400 dark:text-slate-500 mt-0.5 shrink-0" />
                              <div>
                                <h3 className="text-sm font-semibold text-slate-800 dark:text-white mb-0.5">{principle.title}</h3>
                                <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">{principle.description}</p>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>

                      <div className="rounded-xl p-4 bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800">
                        <label className="flex items-start gap-3 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={agreedToManifesto}
                            onChange={e => setAgreedToManifesto(e.target.checked)}
                            className="w-4 h-4 mt-0.5 rounded border-slate-300 dark:border-purple-600 text-purple-600 focus:ring-2 focus:ring-purple-500 cursor-pointer"
                          />
                          <div>
                            <p className="text-sm font-semibold text-slate-800 dark:text-white">
                              I understand and agree to these community principles
                            </p>
                            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                              By joining, you commit to participating in good faith and respecting community standards.
                            </p>
                          </div>
                        </label>
                      </div>

                      {error && (
                        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-3">
                          <p className="text-xs text-red-700 dark:text-red-300">{error}</p>
                        </div>
                      )}
                    </div>
                  )}
                </motion.div>
              </AnimatePresence>

              {/* Navigation buttons */}
              <div className="flex gap-2.5 mt-7">
                {step === 1 ? (
                  <button
                    onClick={() => setStep(2)}
                    disabled={!canProceedStep1}
                    className={`w-full px-5 py-3 rounded-lg font-semibold text-sm text-white flex items-center justify-center gap-2 transition-all ${
                      canProceedStep1
                        ? 'bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 shadow-lg hover:shadow-xl hover:scale-[1.02] active:scale-95'
                        : 'bg-slate-200 dark:bg-zinc-700 text-slate-400 dark:text-slate-500 cursor-not-allowed'
                    }`}
                  >
                    Continue <ArrowRight className="w-4 h-4" />
                  </button>
                ) : (
                  <>
                    <button
                      onClick={() => setStep(1)}
                      disabled={loading}
                      className="flex-1 px-5 py-3 border border-slate-200 dark:border-white/10 text-slate-700 dark:text-slate-300 rounded-lg font-semibold text-sm hover:bg-slate-50 dark:hover:bg-zinc-800 transition-colors"
                    >
                      Back
                    </button>
                    <button
                      onClick={handleSignup}
                      disabled={!agreedToManifesto || loading}
                      className={`flex-1 px-5 py-3 rounded-lg font-semibold text-sm text-white flex items-center justify-center gap-2 transition-all ${
                        agreedToManifesto && !loading
                          ? 'bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 shadow-lg hover:shadow-xl hover:scale-[1.02] active:scale-95'
                          : 'bg-slate-200 dark:bg-zinc-700 text-slate-400 dark:text-slate-500 cursor-not-allowed'
                      }`}
                    >
                      {loading
                        ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        : <><Users className="w-4 h-4" /> Enter {locationName}</>
                      }
                    </button>
                  </>
                )}
              </div>
            </motion.div>
          </div>
        </div>
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
            <div className="max-w-md mx-auto bg-zinc-900/95 backdrop-blur-xl border border-white/10 rounded-2xl p-4 shadow-2xl flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-600 to-pink-600 flex items-center justify-center shrink-0 mt-0.5">
                {isIOS ? <Share className="w-5 h-5 text-white" /> : <Download className="w-5 h-5 text-white" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-white font-semibold text-sm">
                  {locationName ? `Install ${locationName} as your local portal` : 'Add citinet to your home screen'}
                </p>
                {isIOS ? (
                  <p className="text-white/60 text-xs mt-0.5 leading-relaxed">
                    Tap the <strong className="text-white/80">Share</strong> button in your browser, then choose{' '}
                    <strong className="text-white/80">Add to Home Screen</strong>.
                  </p>
                ) : (
                  <p className="text-white/60 text-xs mt-0.5">
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
