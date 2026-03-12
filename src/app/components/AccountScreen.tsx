import React, { useState, useRef, useCallback, useEffect } from 'react';

/** Compress an image file to JPEG using canvas — scales down if > maxDim, targets quality 0.82. */
function compressImage(file: File, maxDim = 1920, quality = 0.82): Promise<File> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      let { width, height } = img;
      if (width > maxDim || height > maxDim) {
        const ratio = Math.min(maxDim / width, maxDim / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      canvas.getContext('2d')!.drawImage(img, 0, 0, width, height);
      canvas.toBlob(
        blob => {
          if (!blob) { reject(new Error('Compression failed')); return; }
          resolve(new File([blob], file.name.replace(/\.[^.]+$/, '.jpg'), { type: 'image/jpeg' }));
        },
        'image/jpeg',
        quality,
      );
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not load image')); };
    img.src = url;
  });
}
import { Save, Check, MapPin, Users, Lock, Trash2, Camera, Loader2, ExternalLink, X as XIcon, Palette, ImagePlus, RotateCcw, X } from 'lucide-react';
import { useHub } from '../context/HubContext';
import { hubService } from '../services/hubService';
import { preferencesService } from '../services/preferencesService';
import { clearSubdomainCache } from '../utils/subdomain';
import { LocationPicker, type LocationResult } from './LocationPicker';

interface AccountScreenProps {
  onBack: () => void;
  onNavigate?: (screen: string) => void;
}

export function AccountScreen({ onBack, onNavigate }: AccountScreenProps) {
  const { currentHub, currentUser, updateUserProfile, userPreferences, updateUserPreferences } = useHub();

  const [displayName, setDisplayName] = useState(currentUser?.displayName || '');
  const [email, setEmail] = useState(currentUser?.email || '');
  const [bio, setBio] = useState(currentUser?.bio || '');
  const [tags, setTags] = useState<string[]>(currentUser?.tags ?? []);
  const [tagInput, setTagInput] = useState('');
  const tagInputRef = useRef<HTMLInputElement>(null);
  const [locationResult, setLocationResult] = useState<LocationResult | null>(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pwSaving, setPwSaving] = useState(false);
  const [pwSaved, setPwSaved] = useState(false);
  const [pwError, setPwError] = useState('');

  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarError, setAvatarError] = useState('');
  const avatarInputRef = useRef<HTMLInputElement>(null);

  const [deletePassword, setDeletePassword] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  // Appearance
  const [bgUploading, setBgUploading] = useState(false);
  const [bgError, setBgError] = useState('');
  const [bgSaved, setBgSaved] = useState(false);
  const [colorInput, setColorInput] = useState('');
  const [bgBrightness, setBgBrightness] = useState(0.65);
  const [bgBrightnessSaving, setBgBrightnessSaving] = useState(false);
  const bgFileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const parsed = Number(userPreferences.background_brightness);
    if (Number.isFinite(parsed)) {
      setBgBrightness(Math.min(1, Math.max(0.35, parsed)));
    } else {
      setBgBrightness(0.65);
    }
  }, [userPreferences.background_brightness]);

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !currentHub?.slug) return;
    setAvatarError('');
    setAvatarUploading(true);
    try {
      await hubService.uploadAvatar(currentHub.slug, file);
      // Avatar is served via /api/auth/avatar/:userId — build the URL
      const avatarUrl = currentUser?.hubUserId
        ? hubService.getAvatarUrl(currentHub.slug, currentUser.hubUserId) ?? undefined
        : undefined;
      if (avatarUrl) updateUserProfile({ avatarUrl });
    } catch (err) {
      setAvatarError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setAvatarUploading(false);
      e.target.value = '';
    }
  };

  const commitTag = useCallback(() => {
    const val = tagInput.trim().replace(/^#/, '').toLowerCase();
    if (!val || tags.includes(val) || tags.length >= 10) return;
    setTags(prev => [...prev, val]);
    setTagInput('');
  }, [tagInput, tags]);

  const handleTagKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); commitTag(); }
    if (e.key === 'Backspace' && tagInput === '' && tags.length > 0) {
      setTags(prev => prev.slice(0, -1));
    }
  };

  const removeTag = (tag: string) => setTags(prev => prev.filter(t => t !== tag));

  const handleSave = async () => {
    if (!currentHub?.slug) return;
    setSaving(true);
    const location = locationResult?.displayName ?? currentUser?.location ?? '';
    try {
      await hubService.updateProfile(currentHub.slug, {
        displayName: displayName.trim() || currentUser?.displayName,
        location: location.trim(),
        bio: bio.trim(),
        tags,
      });
      // email is local-only for now (no server field yet)
      if (email.trim()) updateUserProfile({ email: email.trim() });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      // fall back to local-only save so the user isn't blocked
      updateUserProfile({
        displayName: displayName.trim() || currentUser?.displayName,
        email: email.trim(),
        location: location.trim(),
        bio: bio.trim(),
        tags,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
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

  const handleSetColor = async (color: string) => {
    setBgError('');
    await updateUserPreferences({ background_type: 'color', background_value: color });
    setBgSaved(true);
    setTimeout(() => setBgSaved(false), 1500);
  };

  const handleBgImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !currentHub?.slug) return;
    setBgError('');
    setBgUploading(true);
    try {
      const compressed = await compressImage(file);
      const name = await preferencesService.uploadBackgroundImage(currentHub.slug, compressed);
      await updateUserPreferences({ background_type: 'image', background_value: name });
      setBgSaved(true);
      setTimeout(() => setBgSaved(false), 1500);
    } catch (err) {
      setBgError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setBgUploading(false);
      e.target.value = '';
    }
  };

  const handleResetBg = async () => {
    await updateUserPreferences({ background_type: 'default', background_value: '' });
    setBgSaved(true);
    setTimeout(() => setBgSaved(false), 1500);
  };

  const handleSaveBgBrightness = async () => {
    setBgError('');
    setBgBrightnessSaving(true);
    try {
      await updateUserPreferences({ background_brightness: bgBrightness.toFixed(2) });
      setBgSaved(true);
      setTimeout(() => setBgSaved(false), 1500);
    } catch (err) {
      setBgError(err instanceof Error ? err.message : 'Failed to save brightness');
    } finally {
      setBgBrightnessSaving(false);
    }
  };

  const role = currentUser?.role || 'participant';
  const isAdmin = currentUser?.isAdmin === true;

  const roleBadgeClass = isAdmin
    ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300'
    : 'bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-slate-400';

  const roleLabel = isAdmin ? '★ Hub Admin' : role.charAt(0).toUpperCase() + role.slice(1);

  return (
    <div className="min-h-screen">
      {/* Header */}
      <div className="bg-white/60 dark:bg-zinc-900/60 backdrop-blur-xl border-b border-slate-200/50 dark:border-zinc-800/50 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center gap-4">
          <h1 className="text-xl font-semibold text-slate-900 dark:text-white flex-1">My Account</h1>
          {onNavigate && currentUser?.hubUserId && (
            <button
              onClick={() => onNavigate(`profile/${currentUser.hubUserId}`)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium text-purple-600 dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-900/20 transition-colors"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              View Profile
            </button>
          )}
          <button onClick={onBack} className="w-9 h-9 rounded-lg bg-red-500 hover:bg-red-600 dark:bg-red-600 dark:hover:bg-red-700 flex items-center justify-center transition-colors" aria-label="Close"><X className="w-4 h-4 text-white" /></button>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-8 space-y-5">
        {/* Identity card */}
        <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-slate-200 dark:border-zinc-800 p-6">
          {/* Avatar + username row */}
          <div className="flex items-center gap-4 mb-6">
            {/* Avatar — clickable to upload */}
            <button
              onClick={() => avatarInputRef.current?.click()}
              disabled={avatarUploading}
              className="relative w-16 h-16 rounded-2xl shrink-0 group focus:outline-none focus:ring-2 focus:ring-purple-500"
              aria-label="Change profile picture"
            >
              {currentUser?.avatarUrl ? (
                <img
                  src={currentUser.avatarUrl}
                  alt="Profile"
                  className="w-16 h-16 rounded-2xl object-cover"
                  onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                />
              ) : (
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center text-white font-bold text-2xl">
                  {(currentUser?.displayName || currentUser?.username || 'N').charAt(0).toUpperCase()}
                </div>
              )}
              {/* Hover / upload overlay */}
              <div className="absolute inset-0 rounded-2xl bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                {avatarUploading
                  ? <Loader2 className="w-5 h-5 text-white animate-spin" />
                  : <Camera className="w-5 h-5 text-white" />}
              </div>
            </button>
            <input
              ref={avatarInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleAvatarChange}
            />
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
              <button
                onClick={() => avatarInputRef.current?.click()}
                disabled={avatarUploading}
                className="text-xs text-purple-500 dark:text-purple-400 mt-1 hover:underline disabled:opacity-50"
              >
                {avatarUploading ? 'Uploading…' : 'Change photo'}
              </button>
            </div>
          </div>

          {avatarError && (
            <p className="text-xs text-red-500 dark:text-red-400 mb-3">{avatarError}</p>
          )}

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
                Bio
              </label>
              <textarea
                value={bio}
                onChange={e => setBio(e.target.value)}
                maxLength={160}
                rows={2}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-800 text-slate-900 dark:text-white text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent focus:outline-none transition-shadow resize-none"
                placeholder="A short intro about you (160 chars)"
              />
              <p className="text-right text-xs text-slate-400 dark:text-slate-500 mt-0.5">{bio.length}/160</p>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">
                Interests
                <span className="ml-1 font-normal text-slate-400 dark:text-slate-500">({tags.length}/10)</span>
              </label>
              {/* Chip container — clicking anywhere focuses the input */}
              <div
                onClick={() => tagInputRef.current?.focus()}
                className="min-h-[42px] flex flex-wrap gap-1.5 px-3 py-2 rounded-xl border border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-800 cursor-text focus-within:ring-2 focus-within:ring-purple-500 focus-within:border-transparent transition-shadow"
              >
                {tags.map(tag => (
                  <span
                    key={tag}
                    className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-full bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300"
                  >
                    {tag}
                    <button
                      type="button"
                      onClick={e => { e.stopPropagation(); removeTag(tag); }}
                      className="hover:text-purple-900 dark:hover:text-purple-100 transition-colors"
                      aria-label={`Remove ${tag}`}
                    >
                      <XIcon className="w-3 h-3" />
                    </button>
                  </span>
                ))}
                {tags.length < 10 && (
                  <input
                    ref={tagInputRef}
                    value={tagInput}
                    onChange={e => setTagInput(e.target.value)}
                    onKeyDown={handleTagKeyDown}
                    onBlur={commitTag}
                    placeholder={tags.length === 0 ? 'gardening, repair, music… (Enter to add)' : ''}
                    className="flex-1 min-w-[120px] bg-transparent text-sm text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 outline-none"
                  />
                )}
              </div>
              <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">Press Enter or comma to add · tap × to remove</p>
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
            disabled={saving}
            className="mt-5 w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 disabled:opacity-60 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : saved ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
            {saving ? 'Saving…' : saved ? 'Saved!' : 'Save Changes'}
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

        {/* Appearance */}
        <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-slate-200 dark:border-zinc-800 p-6">
          <div className="flex items-center gap-2 mb-5">
            <Palette className="w-4 h-4 text-slate-500 dark:text-slate-400" />
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Appearance</h3>
            {bgSaved && <span className="ml-auto text-xs text-green-500 dark:text-green-400 flex items-center gap-1"><Check className="w-3 h-3" />Saved</span>}
          </div>

          <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">Choose your personal background. Only you see this — it follows you across all hub screens.</p>

          {/* Preset swatches */}
          <div className="mb-4">
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-2">Solid Color</p>
            <div className="flex flex-wrap gap-2">
              {[
                { color: '#0f172a', label: 'Deep Navy' },
                { color: '#052e16', label: 'Forest' },
                { color: '#1e1b4b', label: 'Deep Purple' },
                { color: '#1c1917', label: 'Charcoal' },
                { color: '#3b0764', label: 'Plum' },
                { color: '#042f2e', label: 'Ocean' },
                { color: '#fef9ee', label: 'Warm White' },
                { color: '#f0f4ff', label: 'Cool White' },
              ].map(({ color, label }) => (
                <button
                  key={color}
                  onClick={() => handleSetColor(color)}
                  title={label}
                  className={`w-8 h-8 rounded-xl border-2 transition-all hover:scale-110 active:scale-95 ${
                    userPreferences.background_type === 'color' && userPreferences.background_value === color
                      ? 'border-purple-500 ring-2 ring-purple-300 dark:ring-purple-700'
                      : 'border-slate-200 dark:border-zinc-700'
                  }`}
                  style={{ backgroundColor: color }}
                  aria-label={label}
                />
              ))}
            </div>
          </div>

          {/* Custom hex */}
          <div className="flex items-center gap-2 mb-4">
            <div
              className="w-8 h-8 rounded-xl border border-slate-200 dark:border-zinc-700 shrink-0"
              style={{ backgroundColor: colorInput || 'transparent' }}
            />
            <input
              type="text"
              value={colorInput}
              onChange={e => setColorInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && /^#[0-9a-fA-F]{6}$/.test(colorInput)) handleSetColor(colorInput);
              }}
              placeholder="#1e293b  (press Enter)"
              className="flex-1 px-3 py-2 rounded-xl border border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-800 text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:ring-2 focus:ring-purple-500 focus:border-transparent focus:outline-none font-mono"
            />
            <button
              onClick={() => { if (/^#[0-9a-fA-F]{6}$/.test(colorInput)) handleSetColor(colorInput); }}
              disabled={!/^#[0-9a-fA-F]{6}$/.test(colorInput)}
              className="px-3 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 disabled:opacity-40 text-white text-xs font-medium transition-colors shrink-0"
            >
              Apply
            </button>
          </div>

          {/* Image upload */}
          <div className="mb-4">
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-2">Custom Image</p>
            <input ref={bgFileRef} type="file" accept="image/*" className="hidden" onChange={handleBgImageUpload} />
            <button
              onClick={() => bgFileRef.current?.click()}
              disabled={bgUploading}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border-2 border-dashed border-slate-200 dark:border-zinc-700 hover:border-purple-400 dark:hover:border-purple-600 text-slate-500 dark:text-slate-400 hover:text-purple-600 dark:hover:text-purple-400 text-sm transition-colors disabled:opacity-50"
            >
              {bgUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImagePlus className="w-4 h-4" />}
              {bgUploading ? 'Uploading…' : userPreferences.background_type === 'image' ? 'Replace image' : 'Upload image'}
            </button>
            {userPreferences.background_type === 'image' && userPreferences.background_value && (
              <p className="text-xs text-slate-400 dark:text-slate-500 mt-1.5 truncate font-mono">{userPreferences.background_value}</p>
            )}
          </div>

          {/* Brightness control for image backgrounds */}
          <div className="mb-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Image Brightness</p>
              <span className="text-xs font-mono text-slate-500 dark:text-slate-400">{Math.round(bgBrightness * 100)}%</span>
            </div>
            <input
              type="range"
              min="35"
              max="100"
              step="1"
              value={Math.round(bgBrightness * 100)}
              onChange={e => setBgBrightness(Number(e.target.value) / 100)}
              className="w-full accent-purple-600"
            />
            <div className="mt-2 flex items-center justify-between gap-2">
              <p className="text-[11px] text-slate-400 dark:text-slate-500">Lower is dimmer and improves readability.</p>
              <button
                onClick={handleSaveBgBrightness}
                disabled={bgBrightnessSaving}
                className="px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white text-xs font-medium transition-colors shrink-0"
              >
                {bgBrightnessSaving ? 'Saving…' : 'Save Brightness'}
              </button>
            </div>
          </div>

          {bgError && <p className="text-xs text-red-500 dark:text-red-400 mb-3">{bgError}</p>}

          {/* Reset */}
          {userPreferences.background_type && userPreferences.background_type !== 'default' && (
            <button
              onClick={handleResetBg}
              className="flex items-center gap-1.5 text-xs text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Reset to default (dot grid)
            </button>
          )}
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
