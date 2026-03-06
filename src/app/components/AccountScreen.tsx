import { useState } from 'react';
import { ArrowLeft, Save, Check, MapPin, Users, Lock, Trash2 } from 'lucide-react';
import { useHub } from '../context/HubContext';
import { hubService } from '../services/hubService';
import { clearSubdomainCache } from '../utils/subdomain';
import { LocationPicker, type LocationResult } from './LocationPicker';

interface AccountScreenProps {
  onBack: () => void;
}

export function AccountScreen({ onBack }: AccountScreenProps) {
  const { currentHub, currentUser, updateUserProfile } = useHub();

  const [displayName, setDisplayName] = useState(currentUser?.displayName || '');
  const [email, setEmail] = useState(currentUser?.email || '');
  const [locationResult, setLocationResult] = useState<LocationResult | null>(null);
  const [saved, setSaved] = useState(false);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pwSaving, setPwSaving] = useState(false);
  const [pwSaved, setPwSaved] = useState(false);
  const [pwError, setPwError] = useState('');

  const [deletePassword, setDeletePassword] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  const handleSave = () => {
    // If user picked a new location from the picker, use that; otherwise keep existing
    const location = locationResult?.displayName ?? currentUser?.location ?? '';
    updateUserProfile({
      displayName: displayName.trim() || currentUser?.displayName,
      email: email.trim(),
      location: location.trim(),
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleChangePassword = async () => {
    if (newPassword !== confirmPassword) { setPwError("New passwords don't match"); return; }
    if (newPassword.length < 4) { setPwError('New password must be at least 4 characters'); return; }
    setPwError('');
    setPwSaving(true);
    try {
      await hubService.changePassword(currentHub!.slug, currentPassword, newPassword);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setPwSaved(true);
      setTimeout(() => setPwSaved(false), 2000);
    } catch (err) {
      setPwError(err instanceof Error ? err.message : 'Failed to change password');
    } finally {
      setPwSaving(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (!currentHub?.slug || !deletePassword) return;
    setDeleting(true);
    setDeleteError('');
    try {
      await hubService.deleteAccount(currentHub.slug, deletePassword);
      clearSubdomainCache();
      window.location.href = window.location.origin + '/';
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Failed to delete account');
      setDeleting(false);
    }
  };

  const role = currentUser?.role || 'participant';
  const isAdmin = currentUser?.isAdmin === true;

  const roleBadgeClass = isAdmin
    ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300'
    : 'bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-slate-400';

  const roleLabel = isAdmin ? '★ Hub Admin' : role.charAt(0).toUpperCase() + role.slice(1);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-purple-50/30 dark:from-zinc-950 dark:via-zinc-900 dark:to-zinc-900">
      {/* Header */}
      <div className="bg-white/60 dark:bg-zinc-900/60 backdrop-blur-xl border-b border-slate-200/50 dark:border-zinc-800/50 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center gap-4">
          <button
            onClick={onBack}
            className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors"
            aria-label="Go back"
          >
            <ArrowLeft className="w-5 h-5 text-slate-700 dark:text-slate-300" />
          </button>
          <h1 className="text-xl font-semibold text-slate-900 dark:text-white">My Account</h1>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-8 space-y-5">
        {/* Identity card */}
        <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-slate-200 dark:border-zinc-800 p-6">
          {/* Avatar + username row */}
          <div className="flex items-center gap-4 mb-6">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center text-white font-bold text-2xl shrink-0">
              {(currentUser?.displayName || currentUser?.username || 'N').charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-mono text-slate-500 dark:text-slate-400">
                  @{currentUser?.username || 'neighbor'}
                </span>
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${roleBadgeClass}`}>
                  {roleLabel}
                </span>
              </div>
              <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5 truncate">{currentHub?.name}</p>
            </div>
          </div>

          {/* Editable fields */}
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">
                Display Name
              </label>
              <input
                type="text"
                value={displayName}
                onChange={e => setDisplayName(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-800 text-slate-900 dark:text-white text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent focus:outline-none transition-shadow"
                placeholder="Your display name"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-800 text-slate-900 dark:text-white text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent focus:outline-none transition-shadow"
                placeholder="your@email.com"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">
                Location
              </label>
              <LocationPicker
                defaultValue={currentUser?.location || ''}
                onSelect={setLocationResult}
                placeholder="Your neighborhood or city…"
                inputClassName="w-full px-3.5 py-2.5 pr-10 rounded-xl border border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-800 text-slate-900 dark:text-white text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent focus:outline-none transition-shadow"
              />
            </div>
          </div>

          <button
            onClick={handleSave}
            className="mt-5 w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium transition-colors"
          >
            {saved ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
            {saved ? 'Saved!' : 'Save Changes'}
          </button>
        </div>

        {/* Change Password */}
        <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-slate-200 dark:border-zinc-800 p-6">
          <div className="flex items-center gap-2 mb-5">
            <Lock className="w-4 h-4 text-slate-500 dark:text-slate-400" />
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Change Password</h3>
          </div>
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">Current Password</label>
              <input
                type="password"
                value={currentPassword}
                onChange={e => setCurrentPassword(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-800 text-slate-900 dark:text-white text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent focus:outline-none transition-shadow"
                placeholder="Your current password"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">New Password</label>
              <input
                type="password"
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-800 text-slate-900 dark:text-white text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent focus:outline-none transition-shadow"
                placeholder="At least 4 characters"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">Confirm New Password</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                className={`w-full px-3.5 py-2.5 rounded-xl border bg-slate-50 dark:bg-zinc-800 text-slate-900 dark:text-white text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent focus:outline-none transition-shadow ${
                  confirmPassword && confirmPassword !== newPassword
                    ? 'border-red-400 dark:border-red-600'
                    : 'border-slate-200 dark:border-zinc-700'
                }`}
                placeholder="Repeat new password"
              />
            </div>
          </div>
          {pwError && (
            <p className="text-xs text-red-500 dark:text-red-400 mt-3">{pwError}</p>
          )}
          <button
            onClick={handleChangePassword}
            disabled={pwSaving || !currentPassword || !newPassword || !confirmPassword}
            className="mt-5 w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors"
          >
            {pwSaved ? <Check className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
            {pwSaving ? 'Saving…' : pwSaved ? 'Password updated!' : 'Update Password'}
          </button>
        </div>

        {/* Interests */}
        {(currentUser?.tags?.length ?? 0) > 0 && (
          <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-slate-200 dark:border-zinc-800 p-6">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-3">Interests</h3>
            <div className="flex flex-wrap gap-2">
              {currentUser?.tags?.map(tag => (
                <span
                  key={tag}
                  className="text-xs px-2.5 py-1 rounded-full bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300"
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Hub info */}
        <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-slate-200 dark:border-zinc-800 p-6">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-3">Connected Hub</h3>
          <div className="space-y-2 text-sm">
            <div className="flex items-center gap-2 text-slate-600 dark:text-slate-400">
              <Users className="w-4 h-4 shrink-0" />
              <span>{currentHub?.name}</span>
            </div>
            {currentHub?.location && (
              <div className="flex items-center gap-2 text-slate-600 dark:text-slate-400">
                <MapPin className="w-4 h-4 shrink-0" />
                <span>{currentHub.location}</span>
              </div>
            )}
            {currentHub?.joinedAt && (
              <p className="text-xs text-slate-400 dark:text-slate-500 font-mono">
                Joined {new Date(currentHub.joinedAt).toLocaleDateString()}
              </p>
            )}
          </div>
        </div>
        {/* Delete Account */}
        <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-red-200 dark:border-red-900/40 p-6">
          <button
            onClick={() => { setDeleteConfirm(v => !v); setDeleteError(''); setDeletePassword(''); }}
            className="flex items-center gap-2 text-red-600 dark:text-red-400 text-sm font-semibold w-full text-left"
          >
            <Trash2 className="w-4 h-4" />
            Delete Account
          </button>
          {deleteConfirm && (
            <div className="mt-4 space-y-3">
              <p className="text-xs text-slate-600 dark:text-slate-400">
                This permanently deletes your account and all your data from this hub. This cannot be undone.
              </p>
              <input
                type="password"
                value={deletePassword}
                onChange={e => setDeletePassword(e.target.value)}
                placeholder="Enter your password to confirm"
                className="w-full px-3.5 py-2.5 rounded-xl border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-900/10 text-slate-900 dark:text-white text-sm focus:ring-2 focus:ring-red-500 focus:outline-none"
              />
              {deleteError && <p className="text-xs text-red-500">{deleteError}</p>}
              <button
                onClick={handleDeleteAccount}
                disabled={deleting || !deletePassword}
                className="w-full py-2.5 rounded-xl bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold transition-colors"
              >
                {deleting ? 'Deleting…' : 'Permanently Delete My Account'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
