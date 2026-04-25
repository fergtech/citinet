import { useState, useEffect } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Users, Settings, Crown, RefreshCw, Shield, Pencil, X, Check, Star, Trash2, Plus, Link, LayoutGrid, CheckCircle2, AlertCircle, Loader2, ImagePlus, ChevronUp, ChevronDown, ClipboardList, ChevronRight, QrCode, Copy } from 'lucide-react';
import { useHub } from '../context/HubContext';
import { hubService } from '../services/hubService';
import { featuredService } from '../services/featuredService';
import { requestsService, type HubRequest, type RequestStatus } from '../services/requestsService';
import type { HubMember, HubPost } from '../types/hub';
import type { FeaturedItem } from '../types/featured';
import { LocationPicker, type LocationResult } from './LocationPicker';
import { DEFAULT_ENABLED_APPS } from './Dashboard';
import { registryService } from '../services/registryService';

interface HubManagementScreenProps {
  onBack: () => void;
}

export function HubManagementScreen({ onBack }: HubManagementScreenProps) {
  const { currentHub, currentUser, updateLocation, updateDescription, refreshStatus } = useHub();
  const [activeTab, setActiveTab] = useState<'info' | 'members' | 'featured' | 'apps' | 'requests'>('info');
  const [members, setMembers] = useState<HubMember[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [membersError, setMembersError] = useState('');
  const [memberActionId, setMemberActionId] = useState<string | null>(null);

  // Name editing
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState('');
  const [nameSaving, setNameSaving] = useState(false);
  const [nameError, setNameError] = useState('');

  // Description editing
  const [editingDescription, setEditingDescription] = useState(false);
  const [descriptionValue, setDescriptionValue] = useState('');
  const [descriptionSaving, setDescriptionSaving] = useState(false);
  const [descriptionError, setDescriptionError] = useState('');

  // Location editing
  const [editingLocation, setEditingLocation] = useState(false);
  const [locationResult, setLocationResult] = useState<LocationResult | null>(null);
  const [locationSaving, setLocationSaving] = useState(false);
  const [locationError, setLocationError] = useState('');

  // Featured management
  const [featuredItems, setFeaturedItems] = useState<FeaturedItem[]>([]);
  const [featuredLoading, setFeaturedLoading] = useState(false);
  const [featuredError, setFeaturedError] = useState('');
  // Pin a post
  const [recentPosts, setRecentPosts] = useState<HubPost[]>([]);
  const [postsLoading, setPostsLoading] = useState(false);
  const [pinning, setPinning] = useState<string | null>(null); // postId being pinned
  // Custom card form
  const [showCustomForm, setShowCustomForm] = useState(false);
  const [customTitle, setCustomTitle] = useState('');
  const [customCaption, setCustomCaption] = useState('');
  const [customLabel, setCustomLabel] = useState('');
  const [customImageUrl, setCustomImageUrl] = useState('');
  const [customImageFile, setCustomImageFile] = useState<File | null>(null);
  const [customImagePreview, setCustomImagePreview] = useState('');
  const [customImageMode, setCustomImageMode] = useState<'upload' | 'url'>('upload');
  const [customSaving, setCustomSaving] = useState(false);
  const [customError, setCustomError] = useState('');
  // Edit existing featured item
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState({ title: '', caption: '', categoryLabel: '', imageUrl: '' });
  const [savingEdit, setSavingEdit] = useState(false);

  function handleImageFileSelect(file: File) {
    if (!file.type.startsWith('image/')) return;
    if (customImagePreview) URL.revokeObjectURL(customImagePreview);
    setCustomImageFile(file);
    setCustomImagePreview(URL.createObjectURL(file));
  }

  // isAdmin: explicit flag (new sessions) OR effectively-local hub (Mission 1).
  const tunnelUrl = currentHub?.tunnelUrl ?? '';
  const isLocalHub = tunnelUrl === '' || tunnelUrl === 'https://' || tunnelUrl === 'http://' || tunnelUrl.includes('localhost');
  const isAdmin = currentUser?.isAdmin === true || (!!currentUser?.username && isLocalHub);

  // ── Apps tab state ──────────────────────────────────────
  interface AppStatus { capability: string; appUrl: string | null; appName: string | null; source: string | null }
  const [appsStatus, setAppsStatus] = useState<AppStatus[]>([]);
  const [appsLoading, setAppsLoading] = useState(false);
  const [appUrl, setAppUrl] = useState('');
  const [appKey, setAppKey] = useState('');
  const [appSaving, setAppSaving] = useState(false);
  const [appSaveError, setAppSaveError] = useState('');
  const [appSaveSuccess, setAppSaveSuccess] = useState('');

  // ── Enabled-apps toggle state ────────────────────────────
  const [enabledApps, setEnabledApps] = useState<string[]>(
    currentHub?.enabledApps ?? DEFAULT_ENABLED_APPS
  );
  const [appToggleSaving, setAppToggleSaving] = useState(false);
  const [appToggleSaved, setAppToggleSaved] = useState(false);

  const authHeader = (): Record<string, string> => currentUser?.authToken ? { Authorization: `Bearer ${currentUser.authToken}` } : {};
  const base = currentHub?.tunnelUrl ?? '';

  const loadApps = async () => {
    if (!base) return;
    setAppsLoading(true);
    try {
      const res = await fetch(`${base}/api/admin/apps`, { headers: authHeader() });
      const data = await res.json();
      setAppsStatus(data.apps ?? []);
      const firstConnected = (data.apps ?? []).find((a: AppStatus) => a.appUrl);
      if (firstConnected?.appUrl) setAppUrl(firstConnected.appUrl);
    } catch {}
    setAppsLoading(false);
  };

  const saveAppConfig = async (capability: string) => {
    if (!appUrl.trim() || !appKey.trim() || !base) return;
    setAppSaving(true);
    setAppSaveError('');
    setAppSaveSuccess('');
    try {
      const res = await fetch(`${base}/api/admin/apps/${capability}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...authHeader() },
        body: JSON.stringify({ appUrl: appUrl.trim(), appKey: appKey.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed');
      const caps = Array.isArray(data.capabilities) ? data.capabilities.join(', ') : 'unknown';
      setAppSaveSuccess(`Connected to ${data.appName ?? appUrl.trim()} — capabilities: ${caps}`);
      setAppKey('');
      loadApps();
    } catch (err: unknown) {
      setAppSaveError(err instanceof Error ? err.message : 'Could not connect — check URL and key');
    }
    setAppSaving(false);
  };

  const saveEnabledApps = async () => {
    if (!currentHub?.slug) return;
    setAppToggleSaving(true);
    try {
      await hubService.updateHubInfo(currentHub.slug, { enabledApps });
      // Push updated hub into React context immediately (no wait for health check)
      await refreshStatus();
      setAppToggleSaved(true);
      setTimeout(() => setAppToggleSaved(false), 2500);
    } catch {}
    setAppToggleSaving(false);
  };

  const toggleApp = (screen: string) => {
    setEnabledApps(prev =>
      prev.includes(screen) ? prev.filter(s => s !== screen) : [...prev, screen]
    );
    setAppToggleSaved(false);
  };

  const removeAppConfig = async (capability: string) => {
    if (!base) return;
    try {
      await fetch(`${base}/api/admin/apps/${capability}`, { method: 'DELETE', headers: authHeader() });
      setAppSaveSuccess('');
      setAppUrl('');
      setAppKey('');
      loadApps();
    } catch {}
  };

  useEffect(() => {
    if (activeTab === 'apps') loadApps();
  }, [activeTab]);

  // ── Requests tab state ───────────────────────────────────
  const [hubRequests, setHubRequests] = useState<HubRequest[]>([]);
  const [requestsLoading, setRequestsLoading] = useState(false);
  const [expandedRequest, setExpandedRequest] = useState<string | null>(null);
  const [requestUpdating, setRequestUpdating] = useState<string | null>(null);
  const [requestNote, setRequestNote] = useState<Record<string, string>>({});

  const loadRequests = async () => {
    setRequestsLoading(true);
    try {
      const list = await requestsService.list(hubSlug ?? '');
      setHubRequests(list);
    } catch {}
    setRequestsLoading(false);
  };

  const handleUpdateRequestStatus = async (id: string, status: RequestStatus) => {
    setRequestUpdating(id);
    try {
      await requestsService.updateStatus(hubSlug ?? '', id, status, requestNote[id]?.trim() || undefined);
      setHubRequests(prev => prev.map(r => r.id === id ? { ...r, status, adminNote: requestNote[id]?.trim() || r.adminNote } : r));
      setExpandedRequest(null);
    } catch {}
    setRequestUpdating(null);
  };

  useEffect(() => {
    if (activeTab === 'requests') loadRequests();
  }, [activeTab]);

  const hubSlug = currentHub?.slug ?? '';

  const reRegisterHub = (overrides?: { name?: string; location?: string; description?: string }) => {
    if (!currentHub?.tunnelUrl) return;
    registryService.registerHub({
      id: currentHub.slug,
      name: overrides?.name ?? currentHub.name,
      slug: currentHub.slug,
      location: overrides?.location ?? currentHub.location ?? '',
      description: overrides?.description ?? currentHub.description ?? '',
      tunnel_url: currentHub.tunnelUrl,
      member_count: 0,
      online: true,
    }).catch(() => {});
  };

  const saveName = async () => {
    const trimmed = nameValue.trim();
    if (!trimmed || trimmed === currentHub?.name) { setEditingName(false); return; }
    setNameSaving(true);
    setNameError('');
    try {
      await hubService.updateHubInfo(currentHub!.slug, { name: trimmed });
      setEditingName(false);
      reRegisterHub({ name: trimmed });
    } catch {
      setNameError('Failed to save name.');
    } finally {
      setNameSaving(false);
    }
  };

  const saveDescription = async () => {
    setDescriptionSaving(true);
    setDescriptionError('');
    try {
      await updateDescription(descriptionValue.trim());
      setEditingDescription(false);
      reRegisterHub({ description: descriptionValue.trim() });
    } catch {
      setDescriptionError('Failed to save — changes saved locally only.');
    } finally {
      setDescriptionSaving(false);
    }
  };

  const saveLocation = async () => {
    if (!locationResult) return;
    setLocationSaving(true);
    setLocationError('');
    try {
      await updateLocation(locationResult.displayName, locationResult.lat, locationResult.lng);
      setEditingLocation(false);
      setLocationResult(null);
      reRegisterHub({ location: locationResult.displayName });
    } catch {
      setLocationError('Failed to save — changes saved locally only.');
    } finally {
      setLocationSaving(false);
    }
  };

  const loadMembers = async () => {
    if (!currentHub?.slug) return;
    setMembersLoading(true);
    setMembersError('');
    try {
      const list = await hubService.listMembers(currentHub.slug);
      setMembers(list);
    } catch (err) {
      setMembersError(err instanceof Error ? err.message : 'Could not load members');
    } finally {
      setMembersLoading(false);
    }
  };

  const handleSetRole = async (member: HubMember, role: 'member' | 'moderator' | 'admin') => {
    if (!currentHub?.slug) return;
    setMemberActionId(member.user_id);
    try {
      const { headers, tunnelUrl } = (hubService as any).getAuthHeaders(currentHub.slug);
      const res = await fetch(`${tunnelUrl}/api/members/${member.user_id}/role`, {
        method: 'PATCH',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ role }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Failed' }));
        throw new Error(err.error ?? 'Failed to update role');
      }
      setMembers(prev => prev.map(m =>
        m.user_id === member.user_id ? { ...m, role, is_admin: role === 'admin' } : m
      ));
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to update role');
    } finally {
      setMemberActionId(null);
    }
  };

  const handleRemoveMember = async (member: HubMember) => {
    if (!currentHub?.slug) return;
    if (!confirm(`Remove @${member.username} from this hub?`)) return;
    setMemberActionId(member.user_id);
    try {
      await hubService.removeMember(currentHub.slug, member.user_id);
      setMembers(prev => prev.filter(m => m.user_id !== member.user_id));
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to remove member');
    } finally {
      setMemberActionId(null);
    }
  };

  const loadFeatured = async () => {
    if (!currentHub?.slug) return;
    setFeaturedLoading(true);
    setFeaturedError('');
    try {
      setFeaturedItems(await featuredService.getFeatured(currentHub.slug));
    } catch {
      setFeaturedError('Could not load featured items');
    } finally {
      setFeaturedLoading(false);
    }
  };

  const loadRecentPosts = async () => {
    if (!currentHub?.slug) return;
    setPostsLoading(true);
    try {
      const posts = await hubService.listPosts(currentHub.slug);
      setRecentPosts(posts.slice(0, 20));
    } catch {
      setRecentPosts([]);
    } finally {
      setPostsLoading(false);
    }
  };

  const handlePinPost = async (postId: string) => {
    if (!currentHub?.slug) return;
    setPinning(postId);
    try {
      await featuredService.pinPost(currentHub.slug, postId);
      await loadFeatured();
    } catch (err) {
      setFeaturedError(err instanceof Error ? err.message : 'Failed to pin post');
    } finally {
      setPinning(null);
    }
  };

  const handleRemoveFeatured = async (id: string) => {
    if (!currentHub?.slug) return;
    try {
      await featuredService.remove(currentHub.slug, id);
      setFeaturedItems(prev => prev.filter(f => f.id !== id));
    } catch {
      setFeaturedError('Failed to remove item');
    }
  };

  const handleStartEdit = (item: FeaturedItem) => {
    setEditingId(item.id);
    setEditDraft({
      title: item.title,
      caption: item.caption ?? '',
      categoryLabel: item.categoryLabel ?? '',
      imageUrl: item.imageUrl ?? '',
    });
  };

  const handleSaveEdit = async () => {
    if (!currentHub?.slug || !editingId) return;
    setSavingEdit(true);
    try {
      const updated = await featuredService.update(currentHub.slug, editingId, {
        title: editDraft.title.trim() || undefined,
        caption: editDraft.caption.trim() || undefined,
        categoryLabel: editDraft.categoryLabel.trim() || undefined,
        imageUrl: editDraft.imageUrl.trim() || undefined,
      });
      setFeaturedItems(prev => prev.map(f => f.id === editingId ? { ...f, ...updated } : f));
      setEditingId(null);
    } catch {
      setFeaturedError('Failed to save changes');
    } finally {
      setSavingEdit(false);
    }
  };

  const handleReorder = async (index: number, direction: 'up' | 'down') => {
    const swapIdx = direction === 'up' ? index - 1 : index + 1;
    if (swapIdx < 0 || swapIdx >= featuredItems.length) return;
    const newItems = [...featuredItems];
    [newItems[index], newItems[swapIdx]] = [newItems[swapIdx], newItems[index]];
    setFeaturedItems(newItems);
    try {
      await featuredService.reorderFeatured(currentHub!.slug, newItems.map(i => i.id));
    } catch {
      await loadFeatured(); // roll back on error
    }
  };

  const handleAddCustom = async () => {
    if (!currentHub?.slug || !customTitle.trim()) return;
    setCustomSaving(true);
    setCustomError('');
    try {
      let imageUrl = customImageUrl.trim() || undefined;
      if (customImageMode === 'upload' && customImageFile) {
        const uploaded = await hubService.uploadFile(currentHub.slug, customImageFile, true);
        imageUrl = hubService.getPublicFileUrl(currentHub.slug, uploaded.name) ?? undefined;
      }
      await featuredService.addCustom(currentHub.slug, {
        title:         customTitle.trim(),
        caption:       customCaption.trim() || undefined,
        categoryLabel: customLabel.trim() || undefined,
        imageUrl,
      });
      setCustomTitle(''); setCustomCaption(''); setCustomLabel('');
      setCustomImageUrl(''); setCustomImageFile(null);
      if (customImagePreview) URL.revokeObjectURL(customImagePreview);
      setCustomImagePreview(''); setShowCustomForm(false);
      await loadFeatured();
    } catch (err) {
      setCustomError(err instanceof Error ? err.message : 'Failed to add card');
    } finally {
      setCustomSaving(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'members') loadMembers();
    if (activeTab === 'featured') { loadFeatured(); loadRecentPosts(); }
  }, [activeTab]);

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50/30 dark:from-zinc-950 dark:to-zinc-900 flex items-center justify-center">
        <div className="text-center px-6">
          <Shield className="w-12 h-12 text-slate-300 dark:text-zinc-600 mx-auto mb-3" />
          <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">Admin access required</p>
          <button
            onClick={onBack}
            className="text-sm text-purple-600 dark:text-purple-400 underline"
          >
            Go back
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-purple-50/30 dark:from-zinc-950 dark:via-zinc-900 dark:to-zinc-900">
      {/* Dot grid background */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <svg className="w-full h-full" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <pattern id="hubmgmt-dots" x="0" y="0" width="24" height="24" patternUnits="userSpaceOnUse">
              <circle cx="1" cy="1" r="1" fill="currentColor" className="text-purple-500 dark:text-purple-400"/>
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#hubmgmt-dots)" opacity="0.07"/>
        </svg>
      </div>
      {/* Header */}
      <div className="bg-white/60 dark:bg-zinc-900/60 backdrop-blur-xl border-b border-slate-200/50 dark:border-zinc-800/50 sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 py-4">
          <div className="flex items-center gap-4 mb-4">
            <div className="flex-1">
              <h1 className="text-xl font-semibold text-slate-900 dark:text-white">Hub Management</h1>
              <p className="text-xs text-slate-500 dark:text-slate-400">{currentHub?.name}</p>
            </div>
            <button onClick={onBack} className="w-9 h-9 rounded-lg bg-red-500 hover:bg-red-600 dark:bg-red-600 dark:hover:bg-red-700 flex items-center justify-center transition-colors" aria-label="Close"><X className="w-4 h-4 text-white" /></button>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 bg-slate-100 dark:bg-zinc-800 rounded-xl p-1">
            {([
              { id: 'info',     icon: <Settings className="w-4 h-4" />,      label: 'Hub Info' },
              { id: 'featured', icon: <Star className="w-4 h-4" />,          label: 'Featured' },
              { id: 'members',  icon: <Users className="w-4 h-4" />,         label: 'Members' },
              { id: 'apps',     icon: <LayoutGrid className="w-4 h-4" />,    label: 'Apps' },
              { id: 'requests', icon: <ClipboardList className="w-4 h-4" />, label: 'Requests' },
            ] as const).map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  activeTab === tab.id
                    ? 'bg-white dark:bg-zinc-900 text-slate-900 dark:text-white shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-6">
        {/* ─── Hub Info Tab ─── */}
        {activeTab === 'info' && (
          <div className="space-y-4">
            <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-slate-200 dark:border-zinc-800 p-6 space-y-5">
              {/* Hub Name — editable */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Hub Name</p>
                  {!editingName && (
                    <button
                      onClick={() => { setNameValue(currentHub?.name ?? ''); setEditingName(true); }}
                      className="flex items-center gap-1 text-xs text-purple-600 dark:text-purple-400 hover:underline"
                    >
                      <Pencil className="w-3 h-3" />
                      Rename
                    </button>
                  )}
                </div>
                {!editingName ? (
                  <p className="text-sm text-slate-800 dark:text-slate-200">{currentHub?.name}</p>
                ) : (
                  <div className="space-y-2 mt-1">
                    <input
                      type="text"
                      value={nameValue}
                      onChange={e => setNameValue(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') saveName(); if (e.key === 'Escape') { setEditingName(false); setNameError(''); } }}
                      placeholder="Hub name…"
                      className="w-full p-2.5 border-2 border-slate-200 dark:border-zinc-700 rounded-lg
                        text-slate-900 dark:text-white bg-white dark:bg-zinc-800 text-sm
                        focus:border-purple-500 focus:outline-none transition-colors"
                    />
                    <p className="text-xs text-slate-400 dark:text-slate-500">Slug stays unchanged — only the display name updates.</p>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={saveName}
                        disabled={nameSaving || !nameValue.trim()}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-purple-600 text-white text-xs font-medium
                          hover:bg-purple-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        <Check className="w-3.5 h-3.5" />
                        Save
                      </button>
                      <button
                        onClick={() => { setEditingName(false); setNameError(''); }}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-slate-600 dark:text-slate-400 text-xs
                          hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors"
                      >
                        <X className="w-3.5 h-3.5" />
                        Cancel
                      </button>
                    </div>
                    {nameError && <p className="text-xs text-amber-600 dark:text-amber-400">{nameError}</p>}
                  </div>
                )}
              </div>
              <div className="h-px bg-slate-100 dark:bg-zinc-800" />
              <InfoRow label="Slug" value={currentHub?.slug} mono />
              <div className="h-px bg-slate-100 dark:bg-zinc-800" />
              {/* Description — editable */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Description</p>
                  {!editingDescription && (
                    <button
                      onClick={() => { setDescriptionValue(currentHub?.description ?? ''); setEditingDescription(true); }}
                      className="flex items-center gap-1 text-xs text-purple-600 dark:text-purple-400 hover:underline"
                    >
                      <Pencil className="w-3 h-3" />
                      {currentHub?.description ? 'Edit' : 'Add description'}
                    </button>
                  )}
                </div>
                {!editingDescription ? (
                  currentHub?.description
                    ? <p className="text-sm text-slate-800 dark:text-slate-200">{currentHub.description}</p>
                    : <p className="text-sm italic text-slate-400 dark:text-slate-500">No description set</p>
                ) : (
                  <div className="space-y-2 mt-1">
                    <textarea
                      value={descriptionValue}
                      onChange={e => setDescriptionValue(e.target.value)}
                      rows={3}
                      placeholder="Describe your hub…"
                      className="w-full p-2.5 border-2 border-slate-200 dark:border-zinc-700 rounded-lg
                        text-slate-900 dark:text-white bg-white dark:bg-zinc-800 text-sm
                        focus:border-purple-500 focus:outline-none transition-colors resize-none"
                    />
                    <div className="flex items-center gap-2">
                      <button
                        onClick={saveDescription}
                        disabled={descriptionSaving}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-purple-600 text-white text-xs font-medium
                          hover:bg-purple-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        <Check className="w-3.5 h-3.5" />
                        Save
                      </button>
                      <button
                        onClick={() => { setEditingDescription(false); setDescriptionValue(''); setDescriptionError(''); }}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-slate-600 dark:text-slate-400 text-xs
                          hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors"
                      >
                        <X className="w-3.5 h-3.5" />
                        Cancel
                      </button>
                    </div>
                    {descriptionError && <p className="text-xs text-amber-600 dark:text-amber-400">{descriptionError}</p>}
                  </div>
                )}
              </div>
              <div className="h-px bg-slate-100 dark:bg-zinc-800" />

              {/* Location — editable */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Location</p>
                  {!editingLocation && (
                    <button
                      onClick={() => setEditingLocation(true)}
                      className="flex items-center gap-1 text-xs text-purple-600 dark:text-purple-400 hover:underline"
                    >
                      <Pencil className="w-3 h-3" />
                      {currentHub?.location ? 'Update' : 'Set location'}
                    </button>
                  )}
                </div>

                {!editingLocation ? (
                  currentHub?.location
                    ? <p className="text-sm text-slate-800 dark:text-slate-200">{currentHub.location}</p>
                    : <p className="text-sm italic text-slate-400 dark:text-slate-500">Not set — hub won't appear on the map</p>
                ) : (
                  <div className="space-y-2 mt-1">
                    <LocationPicker
                      defaultValue={currentHub?.location || ''}
                      onSelect={setLocationResult}
                      placeholder="Search for your hub's neighborhood or city…"
                      inputClassName="w-full p-2.5 pr-9 border-2 border-slate-200 dark:border-zinc-700 rounded-lg
                        text-slate-900 dark:text-white bg-white dark:bg-zinc-800 text-sm
                        focus:border-purple-500 focus:outline-none transition-colors"
                    />
                    <div className="flex items-center gap-2">
                      <button
                        onClick={saveLocation}
                        disabled={!locationResult || locationSaving}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-purple-600 text-white text-xs font-medium
                          hover:bg-purple-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        <Check className="w-3.5 h-3.5" />
                        Save
                      </button>
                      <button
                        onClick={() => { setEditingLocation(false); setLocationResult(null); setLocationError(''); }}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-slate-600 dark:text-slate-400 text-xs
                          hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors"
                      >
                        <X className="w-3.5 h-3.5" />
                        Cancel
                      </button>
                    </div>
                    {locationError && <p className="text-xs text-amber-600 dark:text-amber-400">{locationError}</p>}
                  </div>
                )}
              </div>

              <div className="h-px bg-slate-100 dark:bg-zinc-800" />
              <InfoRow label="Hub API" value={currentHub?.tunnelUrl || undefined} placeholder="Not configured" mono small />
            </div>

            <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-slate-200 dark:border-zinc-800 p-6">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-4">Hub Stats</h3>
              <div className="grid grid-cols-2 gap-3">
                <StatCard label="Members" value={currentHub?.meta?.activeMembers ?? '—'} />
                <StatCard label="Uptime" value={currentHub?.meta?.uptime ?? '—'} />
              </div>
            </div>

            {/* ── Join QR Code ── */}
            <JoinQrCard hubSlug={currentHub?.slug ?? ''} tunnelUrl={currentHub?.tunnelUrl ?? ''} />
          </div>
        )}

        {/* ─── Featured Tab ─── */}
        {activeTab === 'featured' && (
          <div className="space-y-4">
            {/* Current featured items */}
            <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-slate-200 dark:border-zinc-800 overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 dark:border-zinc-800">
                <span className="text-sm font-medium text-slate-900 dark:text-white">
                  {featuredLoading ? 'Loading…' : `${featuredItems.length} / 5 featured`}
                </span>
                <button
                  onClick={loadFeatured}
                  disabled={featuredLoading}
                  className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors"
                  aria-label="Refresh"
                >
                  <RefreshCw className={`w-4 h-4 text-slate-500 ${featuredLoading ? 'animate-spin' : ''}`} />
                </button>
              </div>

              {featuredError && (
                <p className="px-4 py-3 text-xs text-red-500 dark:text-red-400">{featuredError}</p>
              )}

              {!featuredLoading && featuredItems.length === 0 && !featuredError && (
                <p className="px-4 py-6 text-center text-sm text-slate-400 dark:text-slate-500">
                  No featured items yet — pin a post or add a custom card below.
                </p>
              )}

              <div className="divide-y divide-slate-100 dark:divide-zinc-800">
                {featuredItems.map((item, index) => (
                  <div key={item.id}>
                    <div className="flex items-center gap-2 px-4 py-3">
                      {/* Thumbnail */}
                      <div className={`w-10 h-10 rounded-lg shrink-0 overflow-hidden flex items-center justify-center ${
                        item.mediaType === 'gradient' ? 'bg-gradient-to-br from-purple-500 to-indigo-500' :
                        item.mediaType === 'video' ? 'bg-zinc-800' : 'bg-slate-100 dark:bg-zinc-800'
                      }`}>
                        {(item.imageUrl || item.mediaFileName) && item.mediaType === 'image' ? (
                          <img
                            src={item.imageUrl ?? hubService.getPublicFileUrl(currentHub?.slug ?? '', item.mediaFileName!) ?? ''}
                            alt=""
                            className="w-full h-full object-cover"
                            onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                          />
                        ) : (
                          <Star className="w-4 h-4 text-white" />
                        )}
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-900 dark:text-white truncate">{item.title}</p>
                        <p className="text-xs text-slate-400 dark:text-slate-500">
                          {item.type === 'post' ? 'pinned post' : 'custom card'}
                          {item.categoryLabel && ` · ${item.categoryLabel}`}
                          {item.mediaType !== 'gradient' && ` · ${item.mediaType}`}
                        </p>
                      </div>

                      {/* Up / Down */}
                      <div className="flex flex-col gap-0.5 shrink-0">
                        <button
                          onClick={() => handleReorder(index, 'up')}
                          disabled={index === 0}
                          className="p-1 rounded hover:bg-slate-100 dark:hover:bg-zinc-800 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
                          aria-label="Move up"
                        >
                          <ChevronUp className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleReorder(index, 'down')}
                          disabled={index === featuredItems.length - 1}
                          className="p-1 rounded hover:bg-slate-100 dark:hover:bg-zinc-800 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
                          aria-label="Move down"
                        >
                          <ChevronDown className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      {/* Edit */}
                      <button
                        onClick={() => editingId === item.id ? setEditingId(null) : handleStartEdit(item)}
                        className={`p-1.5 rounded-lg transition-colors shrink-0 ${editingId === item.id ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400' : 'hover:bg-slate-100 dark:hover:bg-zinc-800 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'}`}
                        aria-label="Edit"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>

                      {/* Remove */}
                      <button
                        onClick={() => handleRemoveFeatured(item.id)}
                        className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-slate-400 hover:text-red-500 transition-colors shrink-0"
                        aria-label="Remove"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>

                    {/* Inline edit form */}
                    {editingId === item.id && (
                      <div className="px-4 pb-4 pt-1 bg-slate-50 dark:bg-zinc-800/50 border-t border-slate-100 dark:border-zinc-800 space-y-2">
                        {item.type === 'custom' && (
                          <input
                            type="text"
                            value={editDraft.title}
                            onChange={e => setEditDraft(d => ({ ...d, title: e.target.value }))}
                            placeholder="Title *"
                            className="w-full p-2 text-sm border border-slate-200 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-900 text-slate-900 dark:text-white focus:border-purple-500 focus:outline-none"
                          />
                        )}
                        <input
                          type="text"
                          value={editDraft.caption}
                          onChange={e => setEditDraft(d => ({ ...d, caption: e.target.value }))}
                          placeholder="Caption"
                          className="w-full p-2 text-sm border border-slate-200 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-900 text-slate-900 dark:text-white focus:border-purple-500 focus:outline-none"
                        />
                        <input
                          type="text"
                          value={editDraft.categoryLabel}
                          onChange={e => setEditDraft(d => ({ ...d, categoryLabel: e.target.value }))}
                          placeholder="Category label (e.g. EVENT)"
                          className="w-full p-2 text-sm border border-slate-200 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-900 text-slate-900 dark:text-white focus:border-purple-500 focus:outline-none"
                        />
                        {item.type === 'custom' && (
                          <input
                            type="text"
                            value={editDraft.imageUrl}
                            onChange={e => setEditDraft(d => ({ ...d, imageUrl: e.target.value }))}
                            placeholder="Image URL (optional)"
                            className="w-full p-2 text-sm border border-slate-200 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-900 text-slate-900 dark:text-white focus:border-purple-500 focus:outline-none"
                          />
                        )}
                        <div className="flex gap-2 pt-1">
                          <button
                            onClick={handleSaveEdit}
                            disabled={savingEdit || (item.type === 'custom' && !editDraft.title.trim())}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white text-xs font-medium transition-colors"
                          >
                            {savingEdit ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                            Save
                          </button>
                          <button
                            onClick={() => setEditingId(null)}
                            className="px-3 py-1.5 rounded-lg text-xs font-medium text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-zinc-700 transition-colors"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Pin a post */}
            {featuredItems.length < 5 && (
              <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-slate-200 dark:border-zinc-800 overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-100 dark:border-zinc-800">
                  <p className="text-sm font-medium text-slate-900 dark:text-white flex items-center gap-2">
                    <Link className="w-4 h-4 text-purple-500" />
                    Pin a post
                  </p>
                  <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
                    Select a recent post to feature on the dashboard
                  </p>
                </div>

                {postsLoading && (
                  <p className="px-4 py-4 text-sm text-center text-slate-400">Loading posts…</p>
                )}

                <div className="divide-y divide-slate-100 dark:divide-zinc-800 max-h-64 overflow-y-auto">
                  {recentPosts
                    .filter(p => !featuredItems.some(f => f.refId === p.id))
                    .map(post => (
                      <div key={post.id} className="flex items-center gap-3 px-4 py-3">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-slate-900 dark:text-white truncate">{post.title}</p>
                          <p className="text-xs text-slate-400 dark:text-slate-500">
                            {post.category} · {post.author_username}
                            {post.media_file_name && ` · 📎 ${post.media_file_name.split('.').pop()?.toUpperCase()}`}
                          </p>
                        </div>
                        <button
                          onClick={() => handlePinPost(post.id)}
                          disabled={pinning === post.id}
                          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-xs font-medium transition-colors disabled:opacity-50 shrink-0"
                        >
                          {pinning === post.id ? (
                            <RefreshCw className="w-3 h-3 animate-spin" />
                          ) : (
                            <Plus className="w-3 h-3" />
                          )}
                          Pin
                        </button>
                      </div>
                    ))}
                  {!postsLoading && recentPosts.filter(p => !featuredItems.some(f => f.refId === p.id)).length === 0 && (
                    <p className="px-4 py-4 text-sm text-center text-slate-400">All recent posts are already featured.</p>
                  )}
                </div>
              </div>
            )}

            {/* Add custom card */}
            {featuredItems.length < 5 && (
              <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-slate-200 dark:border-zinc-800 overflow-hidden">
                <button
                  onClick={() => setShowCustomForm(v => !v)}
                  className="w-full flex items-center gap-2 px-4 py-3 text-sm font-medium text-slate-900 dark:text-white hover:bg-slate-50 dark:hover:bg-zinc-800/50 transition-colors"
                >
                  <Plus className="w-4 h-4 text-purple-500" />
                  Add custom card
                  <span className="ml-auto text-slate-400">{showCustomForm ? '−' : '+'}</span>
                </button>

                {showCustomForm && (
                  <div className="px-4 pb-4 space-y-3 border-t border-slate-100 dark:border-zinc-800 pt-3">
                    <input
                      type="text"
                      value={customTitle}
                      onChange={e => setCustomTitle(e.target.value)}
                      placeholder="Title *"
                      className="w-full p-2.5 border border-slate-200 dark:border-zinc-700 rounded-lg text-sm text-slate-900 dark:text-white bg-white dark:bg-zinc-800 focus:border-purple-500 focus:outline-none"
                    />
                    <input
                      type="text"
                      value={customCaption}
                      onChange={e => setCustomCaption(e.target.value)}
                      placeholder="Caption (optional)"
                      className="w-full p-2.5 border border-slate-200 dark:border-zinc-700 rounded-lg text-sm text-slate-900 dark:text-white bg-white dark:bg-zinc-800 focus:border-purple-500 focus:outline-none"
                    />
                    <input
                      type="text"
                      value={customLabel}
                      onChange={e => setCustomLabel(e.target.value)}
                      placeholder="Category label (e.g. EVENT)"
                      className="w-full p-2.5 border border-slate-200 dark:border-zinc-700 rounded-lg text-sm text-slate-900 dark:text-white bg-white dark:bg-zinc-800 focus:border-purple-500 focus:outline-none"
                    />
                    {/* Image — upload or URL */}
                    <div className="space-y-2">
                      <div className="flex gap-1 p-0.5 bg-slate-100 dark:bg-zinc-800 rounded-lg">
                        <button
                          type="button"
                          onClick={() => setCustomImageMode('upload')}
                          className={`flex-1 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${customImageMode === 'upload' ? 'bg-white dark:bg-zinc-700 text-slate-900 dark:text-white shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'}`}
                        >
                          Upload image
                        </button>
                        <button
                          type="button"
                          onClick={() => setCustomImageMode('url')}
                          className={`flex-1 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${customImageMode === 'url' ? 'bg-white dark:bg-zinc-700 text-slate-900 dark:text-white shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'}`}
                        >
                          Image URL
                        </button>
                      </div>

                      {customImageMode === 'upload' ? (
                        customImagePreview ? (
                          <div className="relative rounded-lg overflow-hidden h-32 bg-slate-100 dark:bg-zinc-800">
                            <img src={customImagePreview} alt="" className="w-full h-full object-cover" />
                            <button
                              type="button"
                              onClick={() => { setCustomImageFile(null); URL.revokeObjectURL(customImagePreview); setCustomImagePreview(''); }}
                              className="absolute top-2 right-2 w-6 h-6 rounded-full bg-black/60 hover:bg-black/80 flex items-center justify-center text-white transition-colors"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        ) : (
                          <label
                            className="flex flex-col items-center justify-center gap-2 h-28 rounded-lg border-2 border-dashed border-slate-300 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-800/50 hover:border-purple-400 hover:bg-purple-50/30 dark:hover:bg-purple-900/10 transition-colors cursor-pointer"
                            onDragOver={e => e.preventDefault()}
                            onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleImageFileSelect(f); }}
                          >
                            <ImagePlus className="w-6 h-6 text-slate-400" />
                            <span className="text-xs text-slate-500 dark:text-slate-400 text-center px-4">Drag an image here, or click to browse<br /><span className="text-slate-400 dark:text-zinc-500">Leave blank for a gradient background</span></span>
                            <input type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleImageFileSelect(f); }} />
                          </label>
                        )
                      ) : (
                        <input
                          type="url"
                          value={customImageUrl}
                          onChange={e => setCustomImageUrl(e.target.value)}
                          placeholder="https://… (optional — leave blank for gradient)"
                          className="w-full p-2.5 border border-slate-200 dark:border-zinc-700 rounded-lg text-sm text-slate-900 dark:text-white bg-white dark:bg-zinc-800 focus:border-purple-500 focus:outline-none"
                        />
                      )}
                    </div>
                    {customError && <p className="text-xs text-red-500 dark:text-red-400">{customError}</p>}
                    <div className="flex gap-2">
                      <button
                        onClick={handleAddCustom}
                        disabled={customSaving || !customTitle.trim()}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-purple-600 text-white text-xs font-medium hover:bg-purple-700 transition-colors disabled:opacity-40"
                      >
                        <Check className="w-3.5 h-3.5" />
                        Add card
                      </button>
                      <button
                        onClick={() => { setShowCustomForm(false); setCustomError(''); setCustomImageFile(null); if (customImagePreview) URL.revokeObjectURL(customImagePreview); setCustomImagePreview(''); }}
                        className="px-3 py-1.5 rounded-lg text-slate-600 dark:text-slate-400 text-xs hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {featuredItems.length >= 5 && (
              <p className="text-xs text-center text-slate-400 dark:text-slate-500">
                Maximum of 5 featured items reached. Remove one to add another.
              </p>
            )}
          </div>
        )}

        {/* ─── Members Tab ─── */}
        {activeTab === 'members' && (
          <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-slate-200 dark:border-zinc-800 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 dark:border-zinc-800">
              <span className="text-sm font-medium text-slate-900 dark:text-white">
                {membersLoading ? 'Loading...' : `${members.length} ${members.length === 1 ? 'member' : 'members'}`}
              </span>
              <button
                onClick={loadMembers}
                disabled={membersLoading}
                className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors"
                aria-label="Refresh members"
              >
                <RefreshCw className={`w-4 h-4 text-slate-500 dark:text-slate-400 ${membersLoading ? 'animate-spin' : ''}`} />
              </button>
            </div>

            {membersError && (
              <div className="px-4 py-6 text-center space-y-1">
                <p className="text-sm text-slate-500 dark:text-slate-400">{membersError}</p>
                <p className="text-xs text-slate-400 dark:text-slate-500">Member list requires hub API access</p>
              </div>
            )}

            {!membersLoading && !membersError && members.length === 0 && (
              <div className="px-4 py-8 text-center text-sm text-slate-400 dark:text-slate-500">
                No members found
              </div>
            )}

            <div className="divide-y divide-slate-100 dark:divide-zinc-800">
              {members.map(member => {
                const isSelf   = member.user_id === currentUser?.hubUserId;
                const busy     = memberActionId === member.user_id;
                const memRole  = member.role ?? (member.is_admin ? 'admin' : 'member');
                return (
                  <div key={member.user_id} className="flex items-center gap-3 px-4 py-3">
                    <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center text-white text-sm font-semibold shrink-0 relative overflow-hidden">
                      {member.username.charAt(0).toUpperCase()}
                      {currentHub?.slug && (
                        <img src={hubService.getAvatarUrl(currentHub.slug, member.user_id) ?? undefined} alt={member.username} className="absolute inset-0 w-full h-full object-cover" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium text-slate-900 dark:text-white truncate">
                          {member.username}
                          {isSelf && <span className="text-slate-400 dark:text-slate-500 font-normal"> (you)</span>}
                        </span>
                        {memRole === 'admin' && (
                          <span className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 shrink-0 font-semibold">
                            <Crown className="w-2.5 h-2.5" /> Admin
                          </span>
                        )}
                        {memRole === 'moderator' && (
                          <span className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 shrink-0 font-semibold">
                            <Shield className="w-2.5 h-2.5" /> Mod
                          </span>
                        )}
                      </div>
                      {member.created_at && (
                        <span className="text-xs text-slate-400 dark:text-slate-500">
                          Joined {new Date(member.created_at).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                    {currentUser?.isAdmin && !isSelf && (
                      <div className="flex items-center gap-1 shrink-0">
                        {busy ? (
                          <Loader2 className="w-4 h-4 animate-spin text-slate-400" />
                        ) : (
                          <>
                            {memRole === 'member' && (
                              <button
                                onClick={() => handleSetRole(member, 'moderator')}
                                title="Promote to moderator"
                                className="px-2 py-1 rounded-lg text-xs font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
                              >
                                + Mod
                              </button>
                            )}
                            {memRole === 'moderator' && (
                              <button
                                onClick={() => handleSetRole(member, 'member')}
                                title="Remove moderator role"
                                className="px-2 py-1 rounded-lg text-xs font-medium text-slate-500 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors"
                              >
                                − Mod
                              </button>
                            )}
                            <button
                              onClick={() => handleRemoveMember(member)}
                              title="Remove member"
                              className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ─── Apps Tab ─── */}
        {activeTab === 'apps' && (
          <div className="space-y-6">

            {/* ── Section 1: Dashboard Features ── */}
            <div>
              <div className="mb-3">
                <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Dashboard Features</h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Choose which built-in features are visible on this hub's dashboard.
                </p>
              </div>
              <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-slate-200 dark:border-zinc-800 p-5 space-y-4">
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {[
                    { screen: 'feed',        label: 'Discussions',  emoji: '💬' },
                    { screen: 'messages',    label: 'Messages',     emoji: '✉️' },
                    { screen: 'atlas',       label: 'Atlas',        emoji: '🗺️' },
                    { screen: 'neighbors',   label: 'Neighbors',    emoji: '👥' },
                    { screen: 'notes',       label: 'Notes',        emoji: '📓' },
                    { screen: 'polls',       label: 'Polls',        emoji: '🗳️' },
                    { screen: 'spaces',      label: 'Spaces',       emoji: '🌐' },
                    { screen: 'marketplace', label: 'Exchange',     emoji: '🏪' },
                    { screen: 'files',       label: 'Files',        emoji: '📁' },
                    { screen: 'discover',    label: 'Discover',     emoji: '🧭' },
                    { screen: 'toolkit',     label: 'Resources',    emoji: '🔧' },
                    { screen: 'initiatives', label: 'Initiatives',  emoji: '🎯' },
                    { screen: 'network',     label: 'Network',      emoji: '📡' },
                    { screen: 'mod-log',     label: 'Mod Log',      emoji: '📜' },
                  ].map(({ screen, label, emoji }) => {
                    const on = enabledApps.includes(screen);
                    return (
                      <button
                        key={screen}
                        type="button"
                        onClick={() => toggleApp(screen)}
                        className={`flex items-center gap-2 px-3 py-2.5 rounded-lg border text-sm font-medium transition-all ${
                          on
                            ? 'border-purple-500 bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-300'
                            : 'border-slate-200 dark:border-zinc-700 text-slate-400 dark:text-zinc-500 opacity-60 hover:opacity-80'
                        }`}
                      >
                        <span>{emoji}</span>
                        <span className="truncate">{label}</span>
                      </button>
                    );
                  })}
                </div>
                <div className="flex items-center justify-between pt-1">
                  <p className="text-xs text-slate-400 dark:text-zinc-500">
                    {enabledApps.length} of 14 features enabled
                  </p>
                  <button
                    onClick={saveEnabledApps}
                    disabled={appToggleSaving}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white text-xs font-semibold transition-colors"
                  >
                    {appToggleSaving ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Check className="w-3.5 h-3.5" />
                    )}
                    {appToggleSaving ? 'Saving…' : appToggleSaved ? 'Saved' : 'Save'}
                  </button>
                </div>
              </div>
            </div>

            {/* ── Section 2: External Integrations ── */}
            <div>
              <div className="mb-3">
                <h2 className="text-sm font-semibold text-slate-900 dark:text-white">External Integrations</h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Connect third-party services to extend your hub with additional capabilities.
                </p>
              </div>

              {/* Hub app connector card */}
              {(() => {
                const connectedApp = appsStatus.find(a => a.appUrl);
                const appDisplayName = connectedApp?.appName ?? 'Hub App';
                return (
              <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-slate-200 dark:border-zinc-800 overflow-hidden">
                {/* Card header */}
                <div className="flex items-start gap-3 px-5 pt-5 pb-4">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-100 to-purple-100 dark:from-violet-900/40 dark:to-purple-900/40 flex items-center justify-center shrink-0">
                    <LayoutGrid className="w-5 h-5 text-violet-600 dark:text-violet-400" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="font-semibold text-slate-900 dark:text-white">
                      {connectedApp ? appDisplayName : 'Hub App Integration'}
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      {connectedApp
                        ? `Connected — powering ${appsStatus.filter(a => a.appUrl === connectedApp.appUrl).length} feature${appsStatus.filter(a => a.appUrl === connectedApp.appUrl).length === 1 ? '' : 's'} on this hub.`
                        : 'Connect any compatible app to extend this hub with Initiatives, Spaces, and more.'}
                    </p>
                  </div>
                </div>

                <div className="px-5 pb-5 space-y-4">
                  {appsLoading ? (
                    <div className="flex items-center gap-2 text-sm text-slate-400">
                      <Loader2 className="w-4 h-4 animate-spin" /> Loading…
                    </div>
                  ) : (() => {
                    const ini = appsStatus.find(a => a.appUrl);
                    if (ini) return (
                      <>
                        {/* Connected status */}
                        <div className="flex items-center justify-between gap-3 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-100 dark:border-emerald-800/40 rounded-xl px-4 py-3">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-300 truncate">
                                {ini.appName ?? ini.appUrl}
                              </p>
                              <p className="text-xs text-emerald-600 dark:text-emerald-500 truncate">{ini.appUrl}</p>
                            </div>
                          </div>
                          <button
                            onClick={() => removeAppConfig('initiatives')}
                            className="shrink-0 text-xs text-red-500 hover:text-red-400 font-medium whitespace-nowrap"
                          >
                            Disconnect
                          </button>
                        </div>

                        {/* Powered capabilities — derived from what the app actually advertises */}
                        {(() => {
                          const CAPABILITY_LABELS: Record<string, string> = {
                            initiatives: 'Initiatives',
                            societies:   'Spaces',
                          };
                          const poweredCaps = appsStatus.filter(a => a.appUrl === ini.appUrl);
                          const knownCaps = new Set(poweredCaps.map(c => c.capability));
                          const missingSpaces = !knownCaps.has('societies');
                          return (
                            <div className="space-y-2">
                              <p className="text-[10px] font-semibold text-slate-400 dark:text-zinc-500 uppercase tracking-wider">Powered by this connection</p>
                              <div className="flex flex-wrap gap-2">
                                {poweredCaps.map(cap => (
                                  <span key={cap.capability} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-violet-50 dark:bg-violet-900/20 border border-violet-100 dark:border-violet-800/40 text-xs font-medium text-violet-700 dark:text-violet-300">
                                    <CheckCircle2 className="w-3.5 h-3.5" />
                                    {CAPABILITY_LABELS[cap.capability] ?? cap.capability}
                                  </span>
                                ))}
                              </div>
                              {missingSpaces && (
                                <p className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
                                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                                  Spaces not detected — expand "Update connection" below, re-enter your key, and click Update & verify to re-scan capabilities.
                                </p>
                              )}
                            </div>
                          );
                        })()}

                        {/* Update connection form (collapsed header) */}
                        <details className="group">
                          <summary className="cursor-pointer text-xs font-medium text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 list-none flex items-center gap-1 select-none">
                            <ChevronRight className="w-3.5 h-3.5 transition-transform group-open:rotate-90" />
                            Update connection
                          </summary>
                          <div className="mt-3 space-y-3 pl-4 border-l-2 border-slate-100 dark:border-zinc-800">
                            <div>
                              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">App URL</label>
                              <input
                                type="url"
                                value={appUrl}
                                onChange={e => setAppUrl(e.target.value)}
                                placeholder="https://your-app.example.com"
                                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500"
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">API Key</label>
                              <input
                                type="password"
                                value={appKey}
                                onChange={e => setAppKey(e.target.value)}
                                placeholder="Shared secret from the app"
                                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500"
                              />
                            </div>
                            {appSaveError && (
                              <p className="text-xs text-red-500 flex items-center gap-1.5">
                                <AlertCircle className="w-3.5 h-3.5 shrink-0" />{appSaveError}
                              </p>
                            )}
                            {appSaveSuccess && (
                              <p className="text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
                                <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />{appSaveSuccess}
                              </p>
                            )}
                            <button
                              onClick={() => saveAppConfig('initiatives')}
                              disabled={appSaving || !appUrl.trim() || !appKey.trim()}
                              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white text-sm font-semibold transition-colors"
                            >
                              {appSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                              {appSaving ? 'Connecting…' : 'Update & verify'}
                            </button>
                          </div>
                        </details>
                      </>
                    );

                    // Not connected
                    return (
                      <>
                        <div className="flex items-center gap-2 text-sm text-slate-400 dark:text-zinc-500 py-1">
                          <AlertCircle className="w-4 h-4 shrink-0" />
                          Not connected — Initiatives and Spaces will use local hub data only.
                        </div>

                        <div className="space-y-3">
                          <div>
                            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">App URL</label>
                            <input
                              type="url"
                              value={appUrl}
                              onChange={e => setAppUrl(e.target.value)}
                              placeholder="https://your-app.example.com"
                              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">API Key</label>
                            <input
                              type="password"
                              value={appKey}
                              onChange={e => setAppKey(e.target.value)}
                              placeholder="Shared secret from the app"
                              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500"
                            />
                          </div>

                          {appSaveError && (
                            <p className="text-xs text-red-500 flex items-center gap-1.5">
                              <AlertCircle className="w-3.5 h-3.5 shrink-0" />{appSaveError}
                            </p>
                          )}
                          {appSaveSuccess && (
                            <p className="text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
                              <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />{appSaveSuccess}
                            </p>
                          )}

                          <button
                            onClick={() => saveAppConfig('initiatives')}
                            disabled={appSaving || !appUrl.trim() || !appKey.trim()}
                            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white text-sm font-semibold transition-colors"
                          >
                            {appSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                            {appSaving ? 'Connecting…' : 'Connect & verify'}
                          </button>
                          <p className="text-xs text-slate-400 dark:text-zinc-500">
                            Citinet will verify the connection before saving. The app must implement the hub-app contract at <code className="bg-slate-100 dark:bg-zinc-800 px-1 rounded">/api/hub-app/info</code>.
                          </p>
                        </div>
                      </>
                    );
                  })()}
                </div>
              </div>
              ); })()}
            </div>

          </div>
        )}

        {/* ─── Requests Tab ─── */}
        {activeTab === 'requests' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Feature Requests</h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Member-submitted suggestions for new functionality</p>
              </div>
              <button
                onClick={loadRequests}
                className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors"
              >
                <RefreshCw className={`w-4 h-4 text-slate-400 ${requestsLoading ? 'animate-spin' : ''}`} />
              </button>
            </div>

            {requestsLoading ? (
              <div className="flex items-center justify-center py-12 text-slate-400 gap-2">
                <Loader2 className="w-5 h-5 animate-spin" />
                <span className="text-sm">Loading requests…</span>
              </div>
            ) : hubRequests.length === 0 ? (
              <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-slate-200 dark:border-zinc-800 p-8 text-center">
                <ClipboardList className="w-8 h-8 text-slate-300 dark:text-zinc-600 mx-auto mb-2" />
                <p className="text-sm text-slate-400 dark:text-zinc-500">No suggestions yet</p>
                <p className="text-xs text-slate-300 dark:text-zinc-600 mt-1">Members can submit feature requests from the dashboard</p>
              </div>
            ) : (
              <div className="space-y-2">
                {hubRequests.map(req => {
                  const isExpanded = expandedRequest === req.id;
                  const STATUS_COLORS: Record<RequestStatus, string> = {
                    submitted:           'bg-slate-100 text-slate-600 dark:bg-zinc-800 dark:text-zinc-300',
                    needs_clarification: 'bg-orange-50 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
                    under_review:        'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
                    approved:            'bg-violet-50 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300',
                    building:            'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
                    shipped:             'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
                    declined:            'bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400',
                  };
                  const PRIORITY_LABEL: Record<string, string> = {
                    nice_to_have: 'Nice to have',
                    important:    'Important',
                    urgent:       'Urgent',
                  };
                  const STATUS_LABEL: Record<RequestStatus, string> = {
                    submitted:           'Submitted',
                    needs_clarification: 'Needs Clarification',
                    under_review:        'Under Review',
                    approved:            'Approved',
                    building:            'Building',
                    shipped:             'Shipped',
                    declined:            'Declined',
                  };
                  return (
                    <div key={req.id} className="bg-white dark:bg-zinc-900 rounded-xl border border-slate-200 dark:border-zinc-800 overflow-hidden">
                      <button
                        onClick={() => setExpandedRequest(isExpanded ? null : req.id)}
                        className="w-full flex items-start gap-3 p-4 text-left hover:bg-slate-50 dark:hover:bg-zinc-800/50 transition-colors"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide ${STATUS_COLORS[req.status]}`}>
                              {STATUS_LABEL[req.status]}
                            </span>
                            <span className="text-[10px] text-slate-400 dark:text-zinc-500 font-medium">
                              {PRIORITY_LABEL[req.priority] ?? req.priority}
                            </span>
                            {req.scope === 'all_hubs' && (
                              <span className="text-[10px] text-indigo-500 font-medium">Network-wide</span>
                            )}
                          </div>
                          <p className="text-sm font-medium text-slate-800 dark:text-slate-200 line-clamp-2">{req.problem}</p>
                          {req.authorUsername && (
                            <p className="text-xs text-slate-400 dark:text-zinc-500 mt-1">by {req.authorUsername}</p>
                          )}
                        </div>
                        <ChevronRight className={`w-4 h-4 text-slate-300 dark:text-zinc-600 shrink-0 mt-0.5 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                      </button>

                      {isExpanded && (
                        <div className="border-t border-slate-100 dark:border-zinc-800 p-4 space-y-4">
                          {req.whoItHelps && (
                            <div>
                              <p className="text-[10px] font-semibold text-slate-400 dark:text-zinc-500 uppercase tracking-wider mb-0.5">Who it helps</p>
                              <p className="text-sm text-slate-700 dark:text-slate-300">{req.whoItHelps}</p>
                            </div>
                          )}
                          {req.expectedOutcome && (
                            <div>
                              <p className="text-[10px] font-semibold text-slate-400 dark:text-zinc-500 uppercase tracking-wider mb-0.5">Expected outcome</p>
                              <p className="text-sm text-slate-700 dark:text-slate-300">{req.expectedOutcome}</p>
                            </div>
                          )}
                          <div className="flex gap-4 flex-wrap text-xs text-slate-400 dark:text-zinc-500">
                            <span>Data: <span className="text-slate-600 dark:text-zinc-300">{req.dataInvolved}</span></span>
                            <span>Scope: <span className="text-slate-600 dark:text-zinc-300">{req.scope === 'hub_only' ? 'This hub' : 'All hubs'}</span></span>
                          </div>

                          {/* Admin note field */}
                          <div>
                            <label className="block text-[10px] font-semibold text-slate-400 dark:text-zinc-500 uppercase tracking-wider mb-1">Admin note (optional)</label>
                            <textarea
                              value={requestNote[req.id] ?? req.adminNote ?? ''}
                              onChange={e => setRequestNote(prev => ({ ...prev, [req.id]: e.target.value }))}
                              rows={2}
                              placeholder="Add a note for the requester…"
                              className="w-full bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-lg px-3 py-2 text-sm text-slate-800 dark:text-slate-200 placeholder-slate-300 dark:placeholder-zinc-600 focus:outline-none focus:border-indigo-400 resize-none"
                            />
                          </div>

                          {/* Linked poll chip */}
                          {req.pollId && (
                            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-100 dark:border-indigo-800/40">
                              <Link className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                              <span className="text-xs text-indigo-700 dark:text-indigo-300 flex-1 min-w-0 truncate">
                                Poll: {req.pollQuestion ?? 'Linked poll'}
                              </span>
                              {req.pollClosed === true && (
                                <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full shrink-0 ${
                                  req.status === 'approved'
                                    ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                                    : 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400'
                                }`}>
                                  {req.status === 'approved' ? 'PASSED' : 'CLOSED'}
                                </span>
                              )}
                              {req.pollClosed === false && (
                                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full shrink-0 bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-300">
                                  OPEN
                                </span>
                              )}
                            </div>
                          )}

                          {/* Status action buttons */}
                          <div className="flex flex-wrap gap-2">
                            {(['needs_clarification', 'under_review', 'approved', 'building', 'shipped', 'declined'] as RequestStatus[])
                              .filter(s => s !== req.status)
                              .map(s => (
                                <button
                                  key={s}
                                  onClick={() => handleUpdateRequestStatus(req.id, s)}
                                  disabled={requestUpdating === req.id}
                                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-50 ${STATUS_COLORS[s]}`}
                                >
                                  {requestUpdating === req.id
                                    ? <Loader2 className="w-3 h-3 animate-spin inline" />
                                    : `Mark ${STATUS_LABEL[s]}`
                                  }
                                </button>
                              ))
                            }
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function JoinQrCard({ hubSlug, tunnelUrl }: { hubSlug: string; tunnelUrl: string }) {
  const frontendPort = window.location.port || '3001';
  const storageKey = `citinet-lan-ip-${hubSlug}`;

  // Priority: 1) saved in localStorage, 2) real IP from tunnelUrl, 3) page host if LAN, 4) blank
  const deriveDefault = () => {
    const saved = localStorage.getItem(storageKey);
    if (saved) return saved;
    try {
      const apiHost = tunnelUrl ? new URL(tunnelUrl).hostname : '';
      const isLocal = !apiHost || apiHost === 'localhost' || apiHost === '127.0.0.1';
      if (!isLocal) return apiHost;
    } catch { /* ignore */ }
    const pageHost = window.location.hostname;
    if (pageHost !== 'localhost' && pageHost !== '127.0.0.1') return pageHost;
    return '';
  };

  const [lanIp, setLanIp] = useState(deriveDefault);

  const handleIpChange = (val: string) => {
    setLanIp(val);
    if (val.trim()) {
      localStorage.setItem(storageKey, val.trim());
    } else {
      localStorage.removeItem(storageKey);
    }
  };
  const joinUrl = lanIp.trim() ? `http://${lanIp.trim()}:${frontendPort}?hub=${hubSlug}` : '';

  return (
    <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-slate-200 dark:border-zinc-800 p-6">
      <div className="flex items-center gap-2 mb-1">
        <QrCode className="w-4 h-4 text-purple-600" />
        <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Member Join QR Code</h3>
      </div>
      <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
        Anyone on the same Wi-Fi can scan this to join the hub instantly.
      </p>

      {/* IP input — always visible so admin can correct it */}
      <div className="mb-4">
        <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
          Hub machine's LAN IP
        </label>
        <input
          type="text"
          value={lanIp}
          onChange={e => handleIpChange(e.target.value)}
          placeholder="e.g. 10.0.0.139"
          className="w-full px-3 py-2 rounded-lg border-2 border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800
            text-sm text-slate-900 dark:text-white font-mono focus:border-purple-500 focus:outline-none transition-colors"
        />
        <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
          Run <code className="bg-slate-100 dark:bg-zinc-800 px-1 rounded">ipconfig</code> and look for your Ethernet/Wi-Fi IPv4 address.
        </p>
      </div>

      {joinUrl ? (
        <div className="flex flex-col items-center gap-4">
          <div className="p-3 bg-white rounded-xl shadow-sm border border-slate-100 dark:border-zinc-700">
            <QRCodeSVG
              value={joinUrl}
              size={180}
              bgColor="#ffffff"
              fgColor="#18181b"
              level="M"
              includeMargin={false}
            />
          </div>
          <div className="w-full">
            <p className="text-xs text-slate-500 dark:text-slate-400 text-center mb-2">Scan with any camera app or browser</p>
            <div className="flex items-center gap-2 bg-slate-50 dark:bg-zinc-800 rounded-lg px-3 py-2">
              <code className="text-xs text-slate-700 dark:text-slate-300 flex-1 truncate">{joinUrl}</code>
              <button
                onClick={() => navigator.clipboard.writeText(joinUrl)}
                className="shrink-0 p-1 rounded hover:bg-slate-200 dark:hover:bg-zinc-700 transition-colors"
                title="Copy link"
              >
                <Copy className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
              </button>
            </div>
          </div>
        </div>
      ) : (
        <p className="text-xs text-slate-400 dark:text-slate-500 text-center py-4">
          Enter the LAN IP above to generate the QR code.
        </p>
      )}
    </div>
  );
}

function InfoRow({
  label,
  value,
  note,
  placeholder,
  mono = false,
  small = false,
}: {
  label: string;
  value?: string;
  note?: string;
  placeholder?: string;
  mono?: boolean;
  small?: boolean;
}) {
  return (
    <div>
      <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">{label}</p>
      {value ? (
        <p className={`${small ? 'text-xs' : 'text-sm'} ${mono ? 'font-mono break-all' : ''} text-slate-800 dark:text-slate-200`}>
          {value}
        </p>
      ) : (
        <p className="text-sm italic text-slate-400 dark:text-slate-500">{placeholder ?? 'Not set'}</p>
      )}
      {note && <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">{note}</p>}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-slate-50 dark:bg-zinc-800 rounded-xl p-4">
      <div className="text-2xl font-bold text-slate-900 dark:text-white">{value}</div>
      <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{label}</div>
    </div>
  );
}
