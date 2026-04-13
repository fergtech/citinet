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
import { Save, Check, MapPin, Users, Lock, Trash2, Camera, Loader2, ExternalLink, X as XIcon, Palette, ImagePlus, RotateCcw, X, User, Server } from 'lucide-react';
import { useHub } from '../context/HubContext';
import { hubService } from '../services/hubService';
import { preferencesService } from '../services/preferencesService';
import { clearSubdomainCache } from '../utils/subdomain';
import { LocationPicker, type LocationResult } from './LocationPicker';
import type { HubMember } from '../types/hub';

const BANNER_SOLID_COLORS = ['#0f766e', '#0369a1', '#1d4ed8', '#6d28d9', '#be123c', '#b45309', '#374151'];
const BANNER_GRADIENTS = [
  { from: '#2563eb', to: '#7c3aed' },
  { from: '#0f766e', to: '#2563eb' },
  { from: '#be123c', to: '#7c2d12' },
  { from: '#1d4ed8', to: '#0f766e' },
  { from: '#c2410c', to: '#be123c' },
  { from: '#374151', to: '#111827' },
];

interface AccountScreenProps {
  onBack: () => void;
  onNavigate?: (screen: string) => void;
}

export function AccountScreen({ onBack, onNavigate }: AccountScreenProps) {
  const { currentHub, currentUser, updateUserProfile, userPreferences, updateUserPreferences } = useHub();
  const [memberProfile, setMemberProfile] = useState<HubMember | null>(null);

  const [displayName, setDisplayName] = useState(currentUser?.displayName || '');
  const [email, setEmail] = useState(currentUser?.email || '');
  const [bio, setBio] = useState(currentUser?.bio || '');
  const [profileHeadline, setProfileHeadline] = useState(currentUser?.profileHeadline || '');
  const [website, setWebsite] = useState(currentUser?.website || '');
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
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  const [deletePassword, setDeletePassword] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  // Profile banner
  const [showBannerEditor, setShowBannerEditor] = useState(false);
  const [savingBanner, setSavingBanner] = useState(false);
  const [bannerPreview, setBannerPreview] = useState<string | null>(null);
  const bannerInputRef = useRef<HTMLInputElement>(null);

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

  useEffect(() => {
    if (!currentHub?.slug || !currentUser?.hubUserId) return;
    hubService.getMember(currentHub.slug, currentUser.hubUserId)
      .then(setMemberProfile)
      .catch(() => {});
  }, [currentHub?.slug, currentUser?.hubUserId]);

  const saveBannerFields = async (fields: Parameters<typeof hubService.updateProfile>[1]) => {
    if (!currentHub?.slug) return;
    // Apply immediately to context so the preview reflects the change at once
    setBannerPreview(null);
    updateUserProfile({
      bannerMode: fields.bannerMode,
      bannerColor: fields.bannerColor,
      bannerGradientFrom: fields.bannerGradientFrom,
      bannerGradientTo: fields.bannerGradientTo,
    });
    setSavingBanner(true);
    try {
      await hubService.updateProfile(currentHub.slug, fields);
    } catch { /* silent */ }
    setSavingBanner(false);
  };

  const handleBannerImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !currentHub?.slug) return;
    // Show local preview immediately
    const previewUrl = URL.createObjectURL(file);
    setBannerPreview(previewUrl);
    setSavingBanner(true);
    try {
      const key = await hubService.uploadProfileBanner(currentHub.slug, file);
      updateUserProfile({ bannerMode: 'image', bannerImageFileName: key });
      // Swap blob URL for the real server URL so preview stays stable
      const freshUrl = currentUser?.hubUserId
        ? hubService.getProfileBannerUrl(currentHub.slug, currentUser.hubUserId, key)
        : null;
      URL.revokeObjectURL(previewUrl);
      setBannerPreview(freshUrl);
    } catch {
      URL.revokeObjectURL(previewUrl);
      setBannerPreview(null);
    }
    setSavingBanner(false);
    e.target.value = '';
  };

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !currentHub?.slug) return;
    setAvatarError('');
    // Show local preview immediately
    const previewUrl = URL.createObjectURL(file);
    setAvatarPreview(previewUrl);
    setAvatarUploading(true);
    try {
      await hubService.uploadAvatar(currentHub.slug, file);
      // Swap blob URL for a cache-busted URL using the live tunnelUrl (so it works on any machine)
      const freshUrl = currentUser?.hubUserId
        ? `${hubService.getAvatarUrl(currentHub.slug, currentUser.hubUserId)}?t=${Date.now()}`
        : null;
      URL.revokeObjectURL(previewUrl);
      setAvatarPreview(freshUrl);
    } catch (err) {
      URL.revokeObjectURL(previewUrl);
      setAvatarPreview(null);
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
        profileHeadline: profileHeadline.trim(),
        website: website.trim(),
      });
      if (email.trim()) updateUserProfile({ email: email.trim() });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      updateUserProfile({
        displayName: displayName.trim() || currentUser?.displayName,
        email: email.trim(),
        location: location.trim(),
        bio: bio.trim(),
        tags,
        profileHeadline: profileHeadline.trim(),
        website: website.trim(),
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

  type Section = 'profile' | 'appearance' | 'security' | 'hub' | 'danger';
  const [activeSection, setActiveSection] = useState<Section>('profile');

  const NAV_ITEMS: { id: Section; label: string; icon: React.ElementType; danger?: boolean }[] = [
    { id: 'profile',    label: 'Profile',    icon: User    },
    { id: 'appearance', label: 'Appearance', icon: Palette },
    { id: 'security',   label: 'Security',   icon: Lock    },
    { id: 'hub',        label: 'Connected Hub', icon: Server },
    { id: 'danger',     label: 'Delete Account', icon: Trash2, danger: true },
  ];


  // ── Section content (shared between desktop panel + mobile drill) ──────────

  // Always derive avatar URL from live tunnelUrl so it works on any machine (not just the one that uploaded)
  const resolvedAvatarSrc = avatarPreview
    ?? (currentHub?.slug && currentUser?.hubUserId
        ? hubService.getAvatarUrl(currentHub.slug, currentUser.hubUserId)
        : null);

  const bannerStyle: React.CSSProperties = bannerPreview
    ? { backgroundImage: `url(${bannerPreview})`, backgroundSize: 'cover', backgroundPosition: 'center' }
    : (currentUser?.bannerMode ?? memberProfile?.banner_mode) === 'image' && currentUser?.hubUserId
    ? { backgroundImage: `url(${hubService.getProfileBannerUrl(currentHub?.slug ?? '', currentUser.hubUserId, currentUser.bannerImageFileName ?? memberProfile?.banner_image_file_name)})`, backgroundSize: 'cover', backgroundPosition: 'center' }
    : (currentUser?.bannerMode ?? memberProfile?.banner_mode) === 'solid' && (currentUser?.bannerColor ?? memberProfile?.banner_color)
    ? { backgroundColor: currentUser?.bannerColor ?? memberProfile?.banner_color ?? '' }
    : (currentUser?.bannerMode ?? memberProfile?.banner_mode) === 'gradient' && (currentUser?.bannerGradientFrom ?? memberProfile?.banner_gradient_from) && (currentUser?.bannerGradientTo ?? memberProfile?.banner_gradient_to)
    ? { backgroundImage: `linear-gradient(135deg, ${currentUser?.bannerGradientFrom ?? memberProfile?.banner_gradient_from}, ${currentUser?.bannerGradientTo ?? memberProfile?.banner_gradient_to})` }
    : { backgroundImage: 'linear-gradient(135deg, #2563eb, #7c3aed)' };

  const profileSection = (
    <div className="space-y-5">
      {/* Profile Banner */}
      <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-slate-200 dark:border-zinc-800 overflow-hidden">
        <div className="h-24 relative cursor-pointer" style={bannerStyle} onClick={() => setShowBannerEditor(v => !v)}>
          <div className="absolute inset-0 bg-black/20 opacity-0 hover:opacity-100 transition-opacity flex items-center justify-center">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-black/60 text-white text-xs font-semibold">
              {savingBanner ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ImagePlus className="w-3.5 h-3.5" />}
              Edit Banner
            </div>
          </div>
          <button type="button" onClick={e => { e.stopPropagation(); setShowBannerEditor(v => !v); }}
            className="absolute top-2 right-2 p-1.5 rounded-lg bg-black/50 hover:bg-black/65 text-white transition-colors" aria-label="Customize banner">
            <Palette className="w-4 h-4" />
          </button>
          <input ref={bannerInputRef} type="file" accept="image/*" className="hidden" onChange={handleBannerImageUpload} />
        </div>
        {showBannerEditor && (
          <div className="p-4 space-y-3 border-t border-slate-100 dark:border-zinc-800">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">Banner Style</p>
              <button type="button" onClick={() => bannerInputRef.current?.click()} disabled={savingBanner}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-100 dark:bg-zinc-800 hover:bg-slate-200 dark:hover:bg-zinc-700 text-xs font-semibold text-slate-700 dark:text-slate-200 transition-colors disabled:opacity-60">
                {savingBanner ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ImagePlus className="w-3.5 h-3.5" />} Upload Image
              </button>
            </div>
            <div>
              <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1.5">Solid Colors</p>
              <div className="flex flex-wrap gap-2">
                {BANNER_SOLID_COLORS.map(color => (
                  <button key={color} type="button" onClick={() => saveBannerFields({ bannerMode: 'solid', bannerColor: color })}
                    className="w-7 h-7 rounded-full border-2 border-white dark:border-zinc-700 shadow-sm hover:scale-110 transition-transform"
                    style={{ backgroundColor: color }} aria-label={color} />
                ))}
              </div>
            </div>
            <div>
              <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1.5">Gradients</p>
              <div className="flex flex-wrap gap-2">
                {BANNER_GRADIENTS.map((g, i) => (
                  <button key={i} type="button" onClick={() => saveBannerFields({ bannerMode: 'gradient', bannerGradientFrom: g.from, bannerGradientTo: g.to })}
                    className="w-14 h-7 rounded-full border-2 border-white dark:border-zinc-700 shadow-sm hover:scale-105 transition-transform"
                    style={{ backgroundImage: `linear-gradient(135deg, ${g.from}, ${g.to})` }} aria-label={`Gradient ${i + 1}`} />
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Identity card */}
      <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-slate-200 dark:border-zinc-800 p-6">
        <div className="flex items-center gap-4 mb-6">
          <button onClick={() => avatarInputRef.current?.click()} disabled={avatarUploading}
            className="relative w-16 h-16 rounded-full shrink-0 group focus:outline-none focus:ring-2 focus:ring-purple-500" aria-label="Change profile picture">
            {resolvedAvatarSrc ? (
              <img src={resolvedAvatarSrc} alt="Profile"
                className="w-16 h-16 rounded-full object-cover"
                onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
            ) : (
              <div className="w-16 h-16 rounded-full bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center text-white font-bold text-2xl">
                {(currentUser?.displayName || currentUser?.username || 'N').charAt(0).toUpperCase()}
              </div>
            )}
            <div className="absolute inset-0 rounded-full bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
              {avatarUploading ? <Loader2 className="w-5 h-5 text-white animate-spin" /> : <Camera className="w-5 h-5 text-white" />}
            </div>
          </button>
          <input ref={avatarInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-mono text-slate-500 dark:text-slate-400">@{currentUser?.username || 'neighbor'}</span>
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${roleBadgeClass}`}>{roleLabel}</span>
            </div>
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5 truncate">{currentHub?.name}</p>
            <button onClick={() => avatarInputRef.current?.click()} disabled={avatarUploading}
              className="text-xs text-purple-500 dark:text-purple-400 mt-1 hover:underline disabled:opacity-50">
              {avatarUploading ? 'Uploading…' : 'Change photo'}
            </button>
          </div>
        </div>
        {avatarError && <p className="text-xs text-red-500 dark:text-red-400 mb-3">{avatarError}</p>}
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">Display Name</label>
            <input type="text" value={displayName} onChange={e => setDisplayName(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-800 text-slate-900 dark:text-white text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent focus:outline-none transition-shadow"
              placeholder="Your display name" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">Email</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-800 text-slate-900 dark:text-white text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent focus:outline-none transition-shadow"
              placeholder="your@email.com" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">Headline</label>
            <input type="text" value={profileHeadline} onChange={e => setProfileHeadline(e.target.value)} maxLength={100}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-800 text-slate-900 dark:text-white text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent focus:outline-none transition-shadow"
              placeholder="e.g. Local food advocate & urban gardener" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">Bio</label>
            <textarea value={bio} onChange={e => setBio(e.target.value)} maxLength={160} rows={2}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-800 text-slate-900 dark:text-white text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent focus:outline-none transition-shadow resize-none"
              placeholder="A short intro about you (160 chars)" />
            <p className="text-right text-xs text-slate-400 dark:text-slate-500 mt-0.5">{bio.length}/160</p>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">Website</label>
            <input type="url" value={website} onChange={e => setWebsite(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-800 text-slate-900 dark:text-white text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent focus:outline-none transition-shadow"
              placeholder="https://yoursite.com" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">
              Interests <span className="font-normal text-slate-400 dark:text-slate-500">({tags.length}/10)</span>
            </label>
            <div onClick={() => tagInputRef.current?.focus()}
              className="min-h-[42px] flex flex-wrap gap-1.5 px-3 py-2 rounded-xl border border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-800 cursor-text focus-within:ring-2 focus-within:ring-purple-500 focus-within:border-transparent transition-shadow">
              {tags.map(tag => (
                <span key={tag} className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-full bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300">
                  {tag}
                  <button type="button" onClick={e => { e.stopPropagation(); removeTag(tag); }}
                    className="hover:text-purple-900 dark:hover:text-purple-100 transition-colors" aria-label={`Remove ${tag}`}>
                    <XIcon className="w-3 h-3" />
                  </button>
                </span>
              ))}
              {tags.length < 10 && (
                <input ref={tagInputRef} value={tagInput} onChange={e => setTagInput(e.target.value)}
                  onKeyDown={handleTagKeyDown} onBlur={commitTag}
                  placeholder={tags.length === 0 ? 'gardening, repair, music… (Enter to add)' : ''}
                  className="flex-1 min-w-[120px] bg-transparent text-sm text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 outline-none" />
              )}
            </div>
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">Press Enter or comma to add · tap × to remove</p>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">Location</label>
            <LocationPicker defaultValue={currentUser?.location || ''} onSelect={setLocationResult}
              placeholder="Your neighborhood or city…"
              inputClassName="w-full px-3.5 py-2.5 pr-10 rounded-xl border border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-800 text-slate-900 dark:text-white text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent focus:outline-none transition-shadow" />
          </div>
        </div>
        <button onClick={handleSave} disabled={saving}
          className="mt-5 w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 disabled:opacity-60 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : saved ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
          {saving ? 'Saving…' : saved ? 'Saved!' : 'Save Changes'}
        </button>
      </div>
    </div>
  );

  const appearanceSection = (
    <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-slate-200 dark:border-zinc-800 p-6">
      <div className="flex items-center gap-2 mb-5">
        <Palette className="w-4 h-4 text-slate-500 dark:text-slate-400" />
        <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Appearance</h3>
        {bgSaved && <span className="ml-auto text-xs text-green-500 dark:text-green-400 flex items-center gap-1"><Check className="w-3 h-3" />Saved</span>}
      </div>
      <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">Choose your personal background. Only you see this — it follows you across all hub screens.</p>
      <div className="mb-4">
        <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-2">Solid Color</p>
        <div className="flex flex-wrap gap-2">
          {[
            { color: '#18181b', label: 'Deep Navy' }, { color: '#052e16', label: 'Forest' },
            { color: '#1e1b4b', label: 'Deep Purple' }, { color: '#1c1917', label: 'Charcoal' },
            { color: '#3b0764', label: 'Plum' }, { color: '#042f2e', label: 'Ocean' },
            { color: '#fef9ee', label: 'Warm White' }, { color: '#f0f4ff', label: 'Cool White' },
          ].map(({ color, label }) => (
            <button key={color} onClick={() => handleSetColor(color)} title={label}
              className={`w-8 h-8 rounded-xl border-2 transition-all hover:scale-110 active:scale-95 ${
                userPreferences.background_type === 'color' && userPreferences.background_value === color
                  ? 'border-purple-500 ring-2 ring-purple-300 dark:ring-purple-700' : 'border-slate-200 dark:border-zinc-700'
              }`}
              style={{ backgroundColor: color }} aria-label={label} />
          ))}
        </div>
      </div>
      <div className="flex items-center gap-2 mb-4">
        <div className="w-8 h-8 rounded-xl border border-slate-200 dark:border-zinc-700 shrink-0" style={{ backgroundColor: colorInput || 'transparent' }} />
        <input type="text" value={colorInput} onChange={e => setColorInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && /^#[0-9a-fA-F]{6}$/.test(colorInput)) handleSetColor(colorInput); }}
          placeholder="#1e293b  (press Enter)"
          className="flex-1 px-3 py-2 rounded-xl border border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-800 text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:ring-2 focus:ring-purple-500 focus:border-transparent focus:outline-none font-mono" />
        <button onClick={() => { if (/^#[0-9a-fA-F]{6}$/.test(colorInput)) handleSetColor(colorInput); }}
          disabled={!/^#[0-9a-fA-F]{6}$/.test(colorInput)}
          className="px-3 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 disabled:opacity-40 text-white text-xs font-medium transition-colors shrink-0">Apply</button>
      </div>
      <div className="mb-4">
        <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-2">Default Backgrounds</p>
        <div className="grid grid-cols-3 gap-2">
          {[
            { file: 'placidplace-space-7273891_1920.jpg', label: 'Space' },
            { file: 'placidplace-frequency-wave-7776034_1920.jpg', label: 'Frequency' },
            { file: 'kanenori-sunset-7133867_1920.jpg', label: 'Sunset' },
            { file: 'himmelstraeume-bachalpsee-7572681_1920.jpg', label: 'Alpine Lake' },
            { file: 'kevin-schmid-8iT3QtKpG28-unsplash.jpg', label: 'Mountain' },
            { file: 'tem-rysh-F6-U5fGAOik-unsplash.jpg', label: 'Abstract' },
            { file: 'donterase-interior-820107_1920.jpg', label: 'Architecture' },
          ].map(({ file, label }) => {
            const isActive = userPreferences.background_type === 'preset' && userPreferences.background_value === file;
            return (
              <button key={file} onClick={() => updateUserPreferences({ background_type: 'preset', background_value: file })} title={label}
                className={`relative rounded-xl overflow-hidden aspect-video border-2 transition-all hover:scale-[1.03] active:scale-95 focus:outline-none ${
                  isActive ? 'border-purple-500 ring-2 ring-purple-400/50' : 'border-slate-200 dark:border-zinc-700 hover:border-purple-400 dark:hover:border-purple-600'
                }`}>
                <img src={`/default_backgrounds/${encodeURIComponent(file)}`} alt={label} className="w-full h-full object-cover" draggable={false} />
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent px-1.5 py-1">
                  <span className="text-[10px] font-medium text-white/90">{label}</span>
                </div>
                {isActive && (
                  <div className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full bg-purple-500 flex items-center justify-center">
                    <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>
      <div className="mb-4">
        <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-2">Custom Image</p>
        <input ref={bgFileRef} type="file" accept="image/*" className="hidden" onChange={handleBgImageUpload} />
        <button onClick={() => bgFileRef.current?.click()} disabled={bgUploading}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border-2 border-dashed border-slate-200 dark:border-zinc-700 hover:border-purple-400 dark:hover:border-purple-600 text-slate-500 dark:text-slate-400 hover:text-purple-600 dark:hover:text-purple-400 text-sm transition-colors disabled:opacity-50">
          {bgUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImagePlus className="w-4 h-4" />}
          {bgUploading ? 'Uploading…' : userPreferences.background_type === 'image' ? 'Replace image' : 'Upload image'}
        </button>
        {userPreferences.background_type === 'image' && userPreferences.background_value && (
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-1.5 truncate font-mono">{userPreferences.background_value}</p>
        )}
      </div>
      <div className="mb-4">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Image Brightness</p>
          <span className="text-xs font-mono text-slate-500 dark:text-slate-400">{Math.round(bgBrightness * 100)}%</span>
        </div>
        <input type="range" min="35" max="100" step="1" value={Math.round(bgBrightness * 100)}
          onChange={e => setBgBrightness(Number(e.target.value) / 100)} className="w-full accent-purple-600" />
        <div className="mt-2 flex items-center justify-between gap-2">
          <p className="text-[11px] text-slate-400 dark:text-slate-500">Lower is dimmer and improves readability.</p>
          <button onClick={handleSaveBgBrightness} disabled={bgBrightnessSaving}
            className="px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white text-xs font-medium transition-colors shrink-0">
            {bgBrightnessSaving ? 'Saving…' : 'Save Brightness'}
          </button>
        </div>
      </div>
      {bgError && <p className="text-xs text-red-500 dark:text-red-400 mb-3">{bgError}</p>}
      {userPreferences.background_type && userPreferences.background_type !== 'default' && (
        <button onClick={handleResetBg} className="flex items-center gap-1.5 text-xs text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 transition-colors">
          <RotateCcw className="w-3.5 h-3.5" /> Reset to default (dot grid)
        </button>
      )}
    </div>
  );

  const securitySection = (
    <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-slate-200 dark:border-zinc-800 p-6">
      <div className="flex items-center gap-2 mb-5">
        <Lock className="w-4 h-4 text-slate-500 dark:text-slate-400" />
        <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Change Password</h3>
      </div>
      <div className="space-y-4">
        <div>
          <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">Current Password</label>
          <input type="password" value={currentPassword} onChange={e => setCurrentPassword(e.target.value)}
            className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-800 text-slate-900 dark:text-white text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent focus:outline-none transition-shadow"
            placeholder="Your current password" />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">New Password</label>
          <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)}
            className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-800 text-slate-900 dark:text-white text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent focus:outline-none transition-shadow"
            placeholder="At least 4 characters" />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">Confirm New Password</label>
          <input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)}
            className={`w-full px-3.5 py-2.5 rounded-xl border bg-slate-50 dark:bg-zinc-800 text-slate-900 dark:text-white text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent focus:outline-none transition-shadow ${
              confirmPassword && confirmPassword !== newPassword ? 'border-red-400 dark:border-red-600' : 'border-slate-200 dark:border-zinc-700'
            }`}
            placeholder="Repeat new password" />
        </div>
      </div>
      {pwError && <p className="text-xs text-red-500 dark:text-red-400 mt-3">{pwError}</p>}
      <button onClick={handleChangePassword} disabled={pwSaving || !currentPassword || !newPassword || !confirmPassword}
        className="mt-5 w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors">
        {pwSaved ? <Check className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
        {pwSaving ? 'Saving…' : pwSaved ? 'Password updated!' : 'Update Password'}
      </button>
    </div>
  );

  const hubLanIp = currentHub?.lanIp;
  const currentHostname = window.location.hostname;
  const accessedLocally = currentHostname === 'localhost' || currentHostname === '127.0.0.1' || /^10\.|^172\.(1[6-9]|2\d|3[01])\.|^192\.168\./.test(currentHostname);
  // Show the "Switch to Local" card only when: we have a LAN IP, and we're NOT already on a LAN address
  const showLocalSwitch = !!hubLanIp && !accessedLocally;

  const handleOpenHubPortal = () => {
    if (!hubLanIp || !currentHub?.slug) return;
    const conn = hubService.getHubConnection(currentHub.slug);
    const cc = btoa(encodeURIComponent(JSON.stringify(conn)));
    window.open(`http://${hubLanIp}:9090/?hub=${currentHub.slug}&_cc=${cc}`, '_blank');
  };

  const hubSection = (
    <div className="space-y-4">
      <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-slate-200 dark:border-zinc-800 p-6">
        <div className="flex items-center gap-2 mb-4">
          <Server className="w-4 h-4 text-slate-500 dark:text-slate-400" />
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Connected Hub</h3>
        </div>
        <div className="space-y-2 text-sm">
          <div className="flex items-center gap-2 text-slate-600 dark:text-slate-400">
            <Users className="w-4 h-4 shrink-0" /><span>{currentHub?.name}</span>
          </div>
          {currentHub?.location && (
            <div className="flex items-center gap-2 text-slate-600 dark:text-slate-400">
              <MapPin className="w-4 h-4 shrink-0" /><span>{currentHub.location}</span>
            </div>
          )}
          {currentHub?.joinedAt && (
            <p className="text-xs text-slate-400 dark:text-slate-500 font-mono">Joined {new Date(currentHub.joinedAt).toLocaleDateString()}</p>
          )}
        </div>
      </div>

      {showLocalSwitch && (
        <div className="bg-gradient-to-br from-indigo-50 to-purple-50 dark:from-indigo-950/40 dark:to-purple-950/40 rounded-2xl border border-indigo-200 dark:border-indigo-800/50 p-5">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-indigo-600 flex items-center justify-center shrink-0">
              <ExternalLink className="w-4 h-4 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-semibold text-indigo-900 dark:text-indigo-200 mb-0.5">Switch to Local Connection</h3>
              <p className="text-xs text-indigo-700 dark:text-indigo-400 leading-relaxed mb-3">
                On the same Wi-Fi as your hub? Connect directly — no internet required. Opens in your browser (not this app). Your session transfers automatically — no login needed. Install it from there as a separate local shortcut.
              </p>
              <button
                onClick={handleOpenHubPortal}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium transition-colors"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                Open Local Hub
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  const dangerSection = (
    <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-red-200 dark:border-red-900/40 p-6">
      <button onClick={() => { setDeleteConfirm(v => !v); setDeleteError(''); setDeletePassword(''); }}
        className="flex items-center gap-2 text-red-600 dark:text-red-400 text-sm font-semibold w-full text-left">
        <Trash2 className="w-4 h-4" /> Delete Account
      </button>
      {deleteConfirm && (
        <div className="mt-4 space-y-3">
          <p className="text-xs text-slate-600 dark:text-slate-400">This permanently deletes your account and all your data from this hub. This cannot be undone.</p>
          <input type="password" value={deletePassword} onChange={e => setDeletePassword(e.target.value)}
            placeholder="Enter your password to confirm"
            className="w-full px-3.5 py-2.5 rounded-xl border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-900/10 text-slate-900 dark:text-white text-sm focus:ring-2 focus:ring-red-500 focus:outline-none" />
          {deleteError && <p className="text-xs text-red-500">{deleteError}</p>}
          <button onClick={handleDeleteAccount} disabled={deleting || !deletePassword}
            className="w-full py-2.5 rounded-xl bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold transition-colors">
            {deleting ? 'Deleting…' : 'Permanently Delete My Account'}
          </button>
        </div>
      )}
    </div>
  );

  const SECTION_CONTENT: Record<Section, React.ReactNode> = {
    profile: profileSection,
    appearance: appearanceSection,
    security: securitySection,
    hub: hubSection,
    danger: dangerSection,
  };

  return (
    <div className="min-h-screen">
      {/* Header */}
      <div className="bg-white/60 dark:bg-zinc-900/60 backdrop-blur-xl border-b border-slate-200/50 dark:border-zinc-800/50 sticky top-0 z-10">
        {/* Mobile header */}
        <div className="md:hidden max-w-2xl mx-auto px-4 py-4 flex items-center gap-3">
          <button onClick={onBack} className="w-9 h-9 rounded-lg bg-red-500 hover:bg-red-600 dark:bg-red-600 dark:hover:bg-red-700 flex items-center justify-center transition-colors" aria-label="Close">
            <X className="w-4 h-4 text-white" />
          </button>
          <h1 className="text-xl font-semibold text-slate-900 dark:text-white flex-1">My Account</h1>
          {onNavigate && currentUser?.hubUserId && (
            <button onClick={() => onNavigate(`profile/${currentUser.hubUserId}`)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium text-purple-600 dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-900/20 transition-colors">
              <ExternalLink className="w-3.5 h-3.5" /> View Profile
            </button>
          )}
        </div>
        {/* Desktop header */}
        <div className="hidden md:flex max-w-5xl mx-auto px-6 py-4 items-center gap-4">
          <h1 className="text-xl font-semibold text-slate-900 dark:text-white flex-1">My Account</h1>
          {onNavigate && currentUser?.hubUserId && (
            <button onClick={() => onNavigate(`profile/${currentUser.hubUserId}`)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium text-purple-600 dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-900/20 transition-colors">
              <ExternalLink className="w-3.5 h-3.5" /> View Profile
            </button>
          )}
          <button onClick={onBack} className="w-9 h-9 rounded-lg bg-red-500 hover:bg-red-600 dark:bg-red-600 dark:hover:bg-red-700 flex items-center justify-center transition-colors" aria-label="Close">
            <X className="w-4 h-4 text-white" />
          </button>
        </div>
      </div>

      {/* ── DESKTOP: sidebar + content panel ──────────────── */}
      <div className="hidden md:flex max-w-5xl mx-auto px-6 py-8 gap-6 items-start">
        <nav className="w-52 shrink-0 sticky top-24 bg-white dark:bg-zinc-900 rounded-2xl border border-slate-200 dark:border-zinc-800 overflow-hidden">
          {NAV_ITEMS.map(({ id, label, icon: Icon, danger }) => (
            <button key={id} onClick={() => setActiveSection(id)}
              className={`w-full flex items-center gap-3 px-4 py-3 text-sm font-medium transition-colors text-left border-b border-slate-100 dark:border-zinc-800 last:border-0 ${
                activeSection === id
                  ? danger ? 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400' : 'bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-300'
                  : danger ? 'text-red-500 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/10' : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-zinc-800'
              }`}>
              <Icon className="w-4 h-4 shrink-0" />
              {label}
              {activeSection === id && <div className="ml-auto w-1.5 h-1.5 rounded-full bg-current opacity-60" />}
            </button>
          ))}
        </nav>
        <div className="flex-1 min-w-0">
          {SECTION_CONTENT[activeSection]}
        </div>
      </div>

      {/* ── MOBILE: horizontal tab strip + content ─────────── */}
      <div className="md:hidden">
        <div className="flex overflow-x-auto gap-1 px-4 pt-4 pb-2 no-scrollbar">
          {NAV_ITEMS.map(({ id, label, icon: Icon, danger }) => (
            <button key={id} onClick={() => setActiveSection(id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap shrink-0 transition-colors ${
                activeSection === id
                  ? danger ? 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400' : 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300'
                  : danger ? 'text-red-500 dark:text-red-400' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
              }`}>
              <Icon className="w-3.5 h-3.5 shrink-0" />{label}
            </button>
          ))}
        </div>
        <div className="px-4 py-3">{SECTION_CONTENT[activeSection]}</div>
      </div>
    </div>
  );
}
