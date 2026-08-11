import { useState, useEffect, useRef } from 'react';
import { Users, Settings, Crown, RefreshCw, Shield, Pencil, X, Check, Star, Trash2, Plus, Link, LayoutGrid, CheckCircle2, AlertCircle, Loader2, ImagePlus, ChevronUp, ChevronDown, ChevronLeft, ClipboardList, ChevronRight, Bot, Wifi, WifiOff, Download, ToggleLeft, ToggleRight, Newspaper, MessageCircle, Map, NotebookPen, Layers, Store, FolderOpen, Compass, Package, Target, Radio, ScrollText } from 'lucide-react';
import { useHub } from '../context/HubContext';
import { hubService } from '../services/hubService';
import { aiService, SUGGESTED_MODELS, type AiStatus, type IndexStatus } from '../services/aiService';
import { featuredService } from '../services/featuredService';
import { requestsService, type HubRequest, type RequestStatus, type RequestType } from '../services/requestsService';
import type { HubMember, HubPost, HubIconFields } from '../types/hub';
import type { FeaturedItem } from '../types/featured';
import { LocationPicker, type LocationResult } from './LocationPicker';
import { DEFAULT_ENABLED_APPS } from '../data/appTiles';
import { registryService } from '../services/registryService';
import { JoinQrCard } from './JoinQrCard';
import { HubIcon, hubIconRegistryFields, HUB_ICON_SYMBOLS, HUB_ICON_SOLID_COLORS, HUB_ICON_GRADIENTS } from './HubIcon';
import { NetworkReachTab } from './NetworkReachTab';

interface HubManagementScreenProps {
  onBack: () => void;
}

export function HubManagementScreen({ onBack }: HubManagementScreenProps) {
  const { currentHub, currentUser, updateLocation, updateDescription, updateHubIcon, refreshStatus } = useHub();
  const [activeTab, setActiveTab] = useState<'info' | 'members' | 'featured' | 'apps' | 'requests' | 'ai' | 'reach'>('info');
  const [members, setMembers] = useState<HubMember[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [membersError, setMembersError] = useState('');
  const [memberActionId, setMemberActionId] = useState<string | null>(null);

  // Pending join-approval queue (admin only)
  const [pendingUsers, setPendingUsers] = useState<Array<{ user_id: string; username: string; email: string | null; created_at: string }>>([]);
  const [pendingLoading, setPendingLoading] = useState(false);
  const [pendingActionId, setPendingActionId] = useState<string | null>(null);
  const [joinModeSaving, setJoinModeSaving] = useState(false);

  // Name editing
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState('');
  const [nameSaving, setNameSaving] = useState(false);
  const [nameError, setNameError] = useState('');

  // Hub icon editing
  const [showIconEditor, setShowIconEditor] = useState(false);
  const [iconSaving, setIconSaving] = useState(false);
  const [iconError, setIconError] = useState('');
  const iconFileInputRef = useRef<HTMLInputElement>(null);

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
  const [editImageMode, setEditImageMode] = useState<'upload' | 'url'>('upload');
  const [editImageFile, setEditImageFile] = useState<File | null>(null);
  const [editImagePreview, setEditImagePreview] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  function handleEditImageFileSelect(file: File) {
    if (!file.type.startsWith('image/')) return;
    if (editImagePreview) URL.revokeObjectURL(editImagePreview);
    setEditImageFile(file);
    setEditImagePreview(URL.createObjectURL(file));
  }

  function clearEditImage() {
    setEditImageFile(null);
    if (editImagePreview) URL.revokeObjectURL(editImagePreview);
    setEditImagePreview('');
  }

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

  const saveJoinApprovalMode = async (mode: 'admin' | 'member_vote') => {
    if (!currentHub?.slug || joinModeSaving) return;
    setJoinModeSaving(true);
    try {
      await hubService.updateHubInfo(currentHub.slug, { joinApprovalMode: mode });
      await refreshStatus();
    } catch {}
    setJoinModeSaving(false);
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
  const [requestsTypeFilter, setRequestsTypeFilter] = useState<RequestType | 'all'>('all');

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

  // ── AI tab state ─────────────────────────────────────────
  const [aiStatus, setAiStatus] = useState<AiStatus | null>(null);
  const [aiStatusLoading, setAiStatusLoading] = useState(false);
  const [installedModels, setInstalledModels] = useState<string[]>([]);
  const [aiConfigSaving, setAiConfigSaving] = useState(false);
  const [aiConfigError, setAiConfigError] = useState('');
  const [pullModel, setPullModel] = useState('llama3.2:1b');
  const [pullProgress, setPullProgress] = useState('');
  const [pulling, setPulling] = useState(false);
  const [indexStatus, setIndexStatus] = useState<IndexStatus | null>(null);
  const [reindexing, setReindexing] = useState(false);
  const [reindexMsg, setReindexMsg] = useState('');

  const loadAiStatus = async () => {
    if (!hubSlug) return;
    setAiStatusLoading(true);
    try {
      const [status, models, idxStatus] = await Promise.all([
        aiService.getStatus(hubSlug),
        aiService.listModels(hubSlug).catch(() => [] as string[]),
        aiService.getIndexStatus(hubSlug).catch(() => null),
      ]);
      setAiStatus(status);
      setInstalledModels(models.filter(m => !m.includes('embed')));
      setIndexStatus(idxStatus);
    } catch {}
    setAiStatusLoading(false);
  };

  useEffect(() => {
    loadAiStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentHub?.slug]);

  // Hubs aren't provisioned with the Ollama container by default — only show
  // the AI tab once we've confirmed it's actually reachable (or was enabled
  // before), so admins on plain hubs don't see a tab that can never work.
  const aiTabAvailable = aiStatus != null && (aiStatus.ollamaReady || aiStatus.enabled);

  const handleAiToggle = async () => {
    if (!aiStatus) return;
    setAiConfigSaving(true);
    setAiConfigError('');
    try {
      await aiService.updateConfig(hubSlug, { enabled: !aiStatus.enabled });
      setAiStatus(s => s ? { ...s, enabled: !s.enabled } : s);
    } catch (err: unknown) {
      setAiConfigError(err instanceof Error ? err.message : 'Failed to update');
    }
    setAiConfigSaving(false);
  };

  const handleSetModel = async (model: string) => {
    setAiConfigSaving(true);
    setAiConfigError('');
    try {
      await aiService.updateConfig(hubSlug, { model });
      setAiStatus(s => s ? { ...s, model } : s);
    } catch (err: unknown) {
      setAiConfigError(err instanceof Error ? err.message : 'Failed to update');
    }
    setAiConfigSaving(false);
  };

  const handleReindex = async () => {
    setReindexing(true);
    setReindexMsg('');
    try {
      await aiService.triggerReindex(hubSlug);
      setReindexMsg('Indexing started — this runs in the background');
      setTimeout(() => loadAiStatus(), 8000);
    } catch (err: unknown) {
      setReindexMsg(err instanceof Error ? err.message : 'Failed to start indexing');
    }
    setReindexing(false);
  };

  const handlePullModel = () => {
    if (!pullModel.trim() || pulling) return;
    setPulling(true);
    setPullProgress('Starting download…');
    aiService.pullModel(
      hubSlug,
      pullModel.trim(),
      (line) => {
        try {
          const obj = JSON.parse(line);
          const status = obj.status ?? '';
          const pct = obj.completed && obj.total
            ? ` (${Math.round((obj.completed / obj.total) * 100)}%)`
            : '';
          setPullProgress(status + pct);
        } catch { setPullProgress(line.slice(0, 80)); }
      },
      () => {
        setPulling(false);
        setPullProgress('Download complete');
        loadAiStatus();
      },
      (err) => { setPulling(false); setPullProgress(`Error: ${err}`); },
    );
  };

  const hubSlug = currentHub?.slug ?? '';

  const [registrySyncing, setRegistrySyncing] = useState(false);
  const [registryResult, setRegistryResult] = useState<'ok' | 'error' | null>(null);
  const [registryError, setRegistryError] = useState('');
  const [registryListed, setRegistryListed] = useState<boolean | null>(null);
  const [hubNodeId, setHubNodeId] = useState<string | null>(null);

  // Fetch stable node_id from hub and check registry listing status
  useEffect(() => {
    if (activeTab !== 'info' || !currentHub?.tunnelUrl) return;
    const base = currentHub.tunnelUrl;
    const authH: Record<string, string> = currentUser?.authToken ? { Authorization: `Bearer ${currentUser.authToken}` } : {};
    fetch(`${base}/api/info`, { headers: authH })
      .then(r => r.json())
      .then(async (info: any) => {
        const nodeId: string = info.node_id || currentHub.slug;
        setHubNodeId(nodeId);
        const hubs = await registryService.getHubs();
        setRegistryListed(hubs.some(h => h.id === nodeId || h.slug === currentHub.slug));
      })
      .catch(() => setRegistryListed(null));
  }, [activeTab, currentHub?.tunnelUrl]); // eslint-disable-line react-hooks/exhaustive-deps

  const reRegisterHub = (overrides?: Partial<HubIconFields> & { name?: string; location?: string; lat?: number; lng?: number; description?: string }) => {
    if (!currentHub?.tunnelUrl) return;
    const stableId = hubNodeId ?? currentHub.slug;
    const iconBase = hubIconRegistryFields(currentHub);
    registryService.registerHub({
      id: stableId,
      name: overrides?.name ?? currentHub.name,
      slug: currentHub.slug,
      location: overrides?.location ?? currentHub.location ?? '',
      lat: overrides?.lat ?? currentHub.lat,
      lng: overrides?.lng ?? currentHub.lng,
      description: overrides?.description ?? currentHub.description ?? '',
      tunnel_url: currentHub.tunnelUrl,
      member_count: 0,
      online: true,
      hub_icon_mode: overrides?.hub_icon_mode ?? iconBase.hub_icon_mode,
      hub_icon_symbol: overrides?.hub_icon_symbol ?? iconBase.hub_icon_symbol,
      hub_icon_bg_mode: overrides?.hub_icon_bg_mode ?? iconBase.hub_icon_bg_mode,
      hub_icon_gradient_from: overrides?.hub_icon_gradient_from ?? iconBase.hub_icon_gradient_from,
      hub_icon_gradient_to: overrides?.hub_icon_gradient_to ?? iconBase.hub_icon_gradient_to,
      hub_icon_solid_color: overrides?.hub_icon_solid_color ?? iconBase.hub_icon_solid_color,
      hub_icon_image_file_name: overrides?.hub_icon_image_file_name ?? iconBase.hub_icon_image_file_name,
    }).catch(() => {});
  };

  const handleSyncRegistry = async () => {
    if (!currentHub?.tunnelUrl) return;
    setRegistrySyncing(true);
    setRegistryResult(null);
    setRegistryError('');
    const stableId = hubNodeId ?? currentHub.slug;
    // Clean up any old slug-based registry entries that predate stable node IDs
    if (stableId !== currentHub.slug) {
      await registryService.deregisterHub(currentHub.slug).catch(() => {});
    }
    const result = await registryService.registerHub({
      id: stableId,
      name: currentHub.name,
      slug: currentHub.slug,
      location: currentHub.location ?? '',
      lat: currentHub.lat,
      lng: currentHub.lng,
      description: currentHub.description ?? '',
      tunnel_url: currentHub.tunnelUrl,
      ...hubIconRegistryFields(currentHub),
      member_count: 0,
      online: true,
    });
    setRegistryResult(result.ok ? 'ok' : 'error');
    if (!result.ok) setRegistryError(result.error ?? 'Unknown error');
    else setRegistryListed(true);
    setRegistrySyncing(false);
    if (result.ok) setTimeout(() => setRegistryResult(null), 4000);
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

  const saveHubIcon = async (fields: Parameters<typeof updateHubIcon>[0]) => {
    setIconSaving(true);
    setIconError('');
    try {
      const updated = await updateHubIcon(fields);
      if (!updated) setIconError('Failed to save hub icon.');
      else reRegisterHub(fields);
    } catch {
      setIconError('Failed to save hub icon.');
    } finally {
      setIconSaving(false);
    }
  };

  const handleIconFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !currentHub?.slug) return;
    setIconSaving(true);
    setIconError('');
    try {
      const uploaded = await hubService.uploadFile(currentHub.slug, file, true);
      const fields: Parameters<typeof updateHubIcon>[0] = { hub_icon_mode: 'image', hub_icon_image_file_name: uploaded.name };
      const updated = await updateHubIcon(fields);
      if (!updated) setIconError('Failed to save hub icon.');
      else reRegisterHub(fields);
    } catch {
      setIconError('Failed to upload icon image.');
    } finally {
      setIconSaving(false);
      e.target.value = '';
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
      reRegisterHub({ location: locationResult.displayName, lat: locationResult.lat, lng: locationResult.lng });
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

  const loadPendingUsers = async () => {
    if (!currentHub?.slug || !currentUser?.isAdmin) return;
    setPendingLoading(true);
    try {
      const list = await hubService.listPendingUsers(currentHub.slug);
      setPendingUsers(list);
    } catch {
      // Non-fatal — admins without a rebuilt hub API just won't see this section.
    } finally {
      setPendingLoading(false);
    }
  };

  const handleApprovePending = async (userId: string) => {
    if (!currentHub?.slug) return;
    setPendingActionId(userId);
    try {
      await hubService.approvePendingUser(currentHub.slug, userId);
      setPendingUsers(prev => prev.filter(u => u.user_id !== userId));
      loadMembers();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to approve');
    } finally {
      setPendingActionId(null);
    }
  };

  const handleRejectPending = async (userId: string, username: string) => {
    if (!currentHub?.slug) return;
    if (!confirm(`Decline @${username}'s access request?`)) return;
    setPendingActionId(userId);
    try {
      await hubService.rejectPendingUser(currentHub.slug, userId);
      setPendingUsers(prev => prev.filter(u => u.user_id !== userId));
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to decline');
    } finally {
      setPendingActionId(null);
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
    clearEditImage();
    setEditImageMode('upload');
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
      let resolvedImageUrl = editDraft.imageUrl.trim() || undefined;
      if (editImageFile) {
        const uploaded = await hubService.uploadFile(currentHub.slug, editImageFile, true);
        resolvedImageUrl = hubService.getPublicFileUrl(currentHub.slug, uploaded.name) ?? undefined;
      }
      const updated = await featuredService.update(currentHub.slug, editingId, {
        title: editDraft.title.trim() || undefined,
        caption: editDraft.caption.trim() || undefined,
        categoryLabel: editDraft.categoryLabel.trim() || undefined,
        imageUrl: resolvedImageUrl,
      });
      setFeaturedItems(prev => prev.map(f => f.id === editingId ? { ...f, ...updated } : f));
      clearEditImage();
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
    if (activeTab === 'members') {
      loadMembers();
      loadPendingUsers();
    }
    if (activeTab === 'featured') { loadFeatured(); loadRecentPosts(); }
  }, [activeTab]);

  if (!isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="cn-glass rounded-2xl p-8 text-center max-w-xs mx-4">
          <span className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-600 to-indigo-600 flex items-center justify-center mx-auto mb-3">
            <Shield className="w-6 h-6 text-white" />
          </span>
          <p className="text-sm cn-text-2 mb-4">Admin access required</p>
          <button
            onClick={onBack}
            className="text-sm cn-text-3 hover:cn-text-1 underline"
          >
            Go back
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <div className="max-w-6xl mx-auto px-4 md:px-8 py-4 md:py-7 flex flex-col gap-4 md:gap-5">
        {/* Header — scrolls with the page, not pinned */}
        <div>
          <button
            onClick={onBack}
            className="md:hidden inline-flex items-center gap-1 text-xs font-semibold cn-text-3 hover:cn-text-1 mb-2.5 transition-colors"
          >
            <ChevronLeft className="w-3.5 h-3.5" /> Back
          </button>
          <div className="flex items-center gap-3">
            <span className="w-11 h-11 rounded-xl cn-surface-2 border cn-border flex items-center justify-center shrink-0">
              <Shield className="w-[21px] h-[21px] cn-text-2" />
            </span>
            <div className="flex-1 min-w-0">
              <h1 className="text-xl md:text-[26px] font-bold cn-text-1 tracking-tight">Hub management</h1>
              <p className="text-[13px] cn-text-3 mt-0.5">Admin tools for {currentHub?.name}</p>
            </div>
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full cn-surface-3 cn-text-2 text-xs font-semibold shrink-0">
              <Crown className="w-3 h-3 text-purple-500 dark:text-purple-400" /> Admin
            </span>
          </div>
        </div>

        <div className="flex flex-col md:flex-row gap-4 md:gap-6 items-start">
        {/* Tab rail — vertical sidebar on desktop, horizontal pill-scroll on mobile. Only this
            stays put on scroll (via align-items:flex-start on the row it shares with the panel) —
            the header above scrolls away like everything else, same as the design system source. */}
        <nav className="w-full md:w-[210px] shrink-0 md:sticky md:top-4">
          <div className="flex md:flex-col gap-2 md:gap-[3px] overflow-x-auto md:overflow-visible no-scrollbar">
            {([
              { id: 'info' as const,     icon: <Settings className="w-[15px] h-[15px] md:w-4 md:h-4" />,      label: 'Hub Info' },
              { id: 'featured' as const, icon: <Star className="w-[15px] h-[15px] md:w-4 md:h-4" />,          label: 'Featured' },
              { id: 'members' as const,  icon: <Users className="w-[15px] h-[15px] md:w-4 md:h-4" />,         label: 'Members' },
              { id: 'apps' as const,     icon: <LayoutGrid className="w-[15px] h-[15px] md:w-4 md:h-4" />,    label: 'Apps' },
              { id: 'requests' as const, icon: <ClipboardList className="w-[15px] h-[15px] md:w-4 md:h-4" />, label: 'Requests' },
              ...(aiTabAvailable ? [{ id: 'ai' as const, icon: <Bot className="w-[15px] h-[15px] md:w-4 md:h-4" />, label: 'AI' }] : []),
              ...(isLocalHub ? [{ id: 'reach' as const, icon: <Wifi className="w-[15px] h-[15px] md:w-4 md:h-4" />, label: 'Network Reach' }] : []),
            ]).map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`inline-flex items-center gap-1.5 md:gap-2.5 px-3.5 md:px-3 py-1.5 md:py-2.5 rounded-full md:rounded-lg text-xs md:text-[13px] font-semibold whitespace-nowrap shrink-0 md:shrink md:w-full text-left border md:border-0 transition-colors ${
                  activeTab === tab.id
                    ? 'bg-purple-50 dark:bg-purple-500/10 text-purple-600 dark:text-purple-300 border-transparent md:bg-black/[0.04] md:dark:bg-white/[0.06] md:text-slate-900 md:dark:text-white'
                    : 'cn-surface-2 cn-text-2 cn-border md:bg-transparent md:border-0 md:cn-text-3 md:hover:bg-black/5 md:dark:hover:bg-white/5'
                }`}
              >
                <span className={activeTab === tab.id ? 'text-purple-500 dark:text-purple-300 shrink-0' : 'cn-text-4 shrink-0'}>{tab.icon}</span>
                {tab.label}
              </button>
            ))}
          </div>
        </nav>

        {/* Panel */}
        <div className="flex-1 min-w-0 w-full">
        {/* ─── Hub Info Tab ─── */}
        {activeTab === 'info' && (
          <div className="space-y-4">
            <div className="cn-glass rounded-2xl p-6 space-y-5">
              {/* Hub Name — editable */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Hub Name</p>
                  {!editingName && (
                    <button
                      onClick={() => { setNameValue(currentHub?.name ?? ''); setEditingName(true); }}
                      className="flex items-center gap-1 text-xs cn-text-3 hover:cn-text-1 hover:underline"
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
              {/* Hub Icon — editable */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Hub Icon</p>
                  <button
                    onClick={() => setShowIconEditor(true)}
                    className="flex items-center gap-1 text-xs cn-text-3 hover:cn-text-1 hover:underline"
                  >
                    <Pencil className="w-3 h-3" />
                    Change
                  </button>
                </div>
                <div className="flex items-center gap-3">
                  <HubIcon hub={currentHub} baseUrl={currentHub?.tunnelUrl ?? ''} size={44} variant="badge" />
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Shown wherever this hub's identity appears — the top bar, the "About this hub" panel, and the login/signup screen.
                  </p>
                </div>
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
                      className="flex items-center gap-1 text-xs cn-text-3 hover:cn-text-1 hover:underline"
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
                      className="flex items-center gap-1 text-xs cn-text-3 hover:cn-text-1 hover:underline"
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

            <div className="cn-glass rounded-2xl p-6">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-4">Hub Stats</h3>
              <div className="grid grid-cols-2 gap-3">
                <StatCard label="Members" value={currentHub?.meta?.activeMembers ?? '—'} />
                <StatCard label="Uptime" value={currentHub?.meta?.uptime ?? '—'} />
              </div>
            </div>

            {/* ── Registry ── */}
            <div className="cn-glass rounded-2xl p-6">
              <div className="flex items-start justify-between gap-3 mb-3">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Public Registry</h3>
                    {registryListed === true && (
                      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400">
                        Listed
                      </span>
                    )}
                    {registryListed === false && (
                      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-slate-100 dark:bg-zinc-800 text-slate-500 dark:text-slate-400">
                        Not listed
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Keeps your hub discoverable and makes public vendor/space URLs work.
                  </p>
                </div>
                <button
                  onClick={handleSyncRegistry}
                  disabled={registrySyncing || !currentHub?.tunnelUrl}
                  className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-50 ${
                    registryResult === 'ok'
                      ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400'
                      : registryResult === 'error'
                      ? 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400'
                      : 'bg-purple-600 hover:bg-purple-700 text-white'
                  }`}
                >
                  {registrySyncing
                    ? <><RefreshCw className="w-3.5 h-3.5 animate-spin" /> Syncing…</>
                    : registryResult === 'ok'
                    ? <><Check className="w-3.5 h-3.5" /> Synced!</>
                    : registryResult === 'error'
                    ? <><AlertCircle className="w-3.5 h-3.5" /> Failed</>
                    : registryListed
                    ? <><RefreshCw className="w-3.5 h-3.5" /> Update listing</>
                    : <><RefreshCw className="w-3.5 h-3.5" /> List on registry</>
                  }
                </button>
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-400 font-mono bg-slate-50 dark:bg-zinc-800 rounded-lg px-3 py-2">
                citinet.cloud/v/<span className="text-slate-800 dark:text-slate-200">{currentHub?.slug}</span>/…
              </div>
              {!currentHub?.tunnelUrl && (
                <p className="text-xs text-amber-600 dark:text-amber-400 mt-2">
                  A public tunnel URL is required before syncing.
                </p>
              )}
              {registryError && (
                <p className="text-xs text-red-500 dark:text-red-400 mt-2 break-words">{registryError}</p>
              )}
            </div>

            {/* ── Join QR Code ── */}
            <JoinQrCard tunnelUrl={currentHub?.tunnelUrl ?? ''} />
          </div>
        )}

        {/* ─── Featured Tab ─── */}
        {activeTab === 'featured' && (
          <div className="space-y-4">
            {/* Current featured items */}
            <div className="cn-glass rounded-2xl overflow-hidden">
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
                            src={(() => {
                              const slug = currentHub?.slug ?? '';
                              if (item.mediaFileName) return hubService.getPublicFileUrl(slug, item.mediaFileName) ?? '';
                              if (item.imageUrl) {
                                const m = item.imageUrl.match(/\/api\/public\/files\/([^?#]+)/);
                                if (m) return hubService.getPublicFileUrl(slug, decodeURIComponent(m[1])) ?? item.imageUrl;
                                return item.imageUrl;
                              }
                              return '';
                            })()}
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
                          <div className="space-y-2">
                            <div className="flex gap-1 p-0.5 bg-slate-100 dark:bg-zinc-800 rounded-lg">
                              <button type="button" onClick={() => setEditImageMode('upload')}
                                className={`flex-1 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${editImageMode === 'upload' ? 'bg-white dark:bg-zinc-700 text-slate-900 dark:text-white shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'}`}>
                                Upload image
                              </button>
                              <button type="button" onClick={() => setEditImageMode('url')}
                                className={`flex-1 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${editImageMode === 'url' ? 'bg-white dark:bg-zinc-700 text-slate-900 dark:text-white shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'}`}>
                                Image URL
                              </button>
                            </div>
                            {editImageMode === 'upload' ? (
                              editImagePreview ? (
                                <div className="relative rounded-lg overflow-hidden h-28 bg-slate-100 dark:bg-zinc-800">
                                  <img src={editImagePreview} alt="" className="w-full h-full object-cover" />
                                  <button type="button" onClick={clearEditImage}
                                    className="absolute top-2 right-2 w-6 h-6 rounded-full bg-black/60 hover:bg-black/80 flex items-center justify-center text-white transition-colors">
                                    <X className="w-3 h-3" />
                                  </button>
                                </div>
                              ) : (
                                <label
                                  className="flex flex-col items-center justify-center gap-2 h-24 rounded-lg border-2 border-dashed border-slate-300 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-800/50 hover:border-purple-400 hover:bg-purple-50/30 dark:hover:bg-purple-900/10 transition-colors cursor-pointer"
                                  onDragOver={e => e.preventDefault()}
                                  onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleEditImageFileSelect(f); }}
                                >
                                  <ImagePlus className="w-5 h-5 text-slate-400" />
                                  <span className="text-xs text-slate-500 dark:text-slate-400 text-center px-4">
                                    Drag an image here, or click to browse
                                    {item.imageUrl && <><br /><span className="text-slate-400 dark:text-zinc-500">Current image kept if left blank</span></>}
                                  </span>
                                  <input type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleEditImageFileSelect(f); }} />
                                </label>
                              )
                            ) : (
                              <input
                                type="url"
                                value={editDraft.imageUrl}
                                onChange={e => setEditDraft(d => ({ ...d, imageUrl: e.target.value }))}
                                placeholder="https://… (leave blank to keep current)"
                                className="w-full p-2 text-sm border border-slate-200 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-900 text-slate-900 dark:text-white focus:border-purple-500 focus:outline-none"
                              />
                            )}
                          </div>
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
                            onClick={() => { clearEditImage(); setEditingId(null); }}
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
              <div className="cn-glass rounded-2xl overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-100 dark:border-zinc-800">
                  <p className="text-sm font-medium text-slate-900 dark:text-white flex items-center gap-2">
                    <Link className="w-4 h-4 cn-text-3" />
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
              <div className="cn-glass rounded-2xl overflow-hidden">
                <button
                  onClick={() => setShowCustomForm(v => !v)}
                  className="w-full flex items-center gap-2 px-4 py-3 text-sm font-medium text-slate-900 dark:text-white hover:bg-slate-50 dark:hover:bg-zinc-800/50 transition-colors"
                >
                  <Plus className="w-4 h-4 cn-text-3" />
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

        {/* ─── Join Approval Mode (admin only) ─── */}
        {activeTab === 'members' && currentUser?.isAdmin && (
          <div className="cn-glass rounded-2xl p-4 mb-4">
            <p className="text-sm font-medium text-slate-900 dark:text-white mb-1">How new members get approved</p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
              {currentHub?.joinApprovalMode === 'member_vote'
                ? 'New join requests open a vote in Decisions. Members decide, using this hub\'s quorum threshold.'
                : 'You (and other admins) approve or decline each new join request.'}
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => saveJoinApprovalMode('admin')}
                disabled={joinModeSaving}
                className={`flex-1 py-2 px-3 rounded-lg border text-[13px] font-medium transition-all disabled:opacity-50 ${
                  (currentHub?.joinApprovalMode ?? 'admin') === 'admin'
                    ? 'border-purple-500 bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-400'
                    : 'border-slate-200 dark:border-white/10 text-slate-700 dark:text-slate-300 hover:border-purple-400'
                }`}
              >
                Admin approval
              </button>
              <button
                onClick={() => saveJoinApprovalMode('member_vote')}
                disabled={joinModeSaving}
                className={`flex-1 py-2 px-3 rounded-lg border text-[13px] font-medium transition-all disabled:opacity-50 ${
                  currentHub?.joinApprovalMode === 'member_vote'
                    ? 'border-purple-500 bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-400'
                    : 'border-slate-200 dark:border-white/10 text-slate-700 dark:text-slate-300 hover:border-purple-400'
                }`}
              >
                Member vote
              </button>
            </div>
          </div>
        )}

        {/* ─── Pending Approval (admin only) ─── */}
        {activeTab === 'members' && currentUser?.isAdmin && (pendingLoading || pendingUsers.length > 0) && (
          <div className="cn-glass rounded-2xl overflow-hidden mb-4">
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 dark:border-zinc-800">
              <span className="text-sm font-medium text-slate-900 dark:text-white">
                {pendingLoading ? 'Checking for requests...' : `${pendingUsers.length} waiting for approval`}
              </span>
              <button
                onClick={loadPendingUsers}
                disabled={pendingLoading}
                className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors"
                aria-label="Refresh pending requests"
              >
                <RefreshCw className={`w-4 h-4 text-slate-500 dark:text-slate-400 ${pendingLoading ? 'animate-spin' : ''}`} />
              </button>
            </div>
            <div className="divide-y divide-slate-100 dark:divide-zinc-800">
              {pendingUsers.map(u => {
                const busy = pendingActionId === u.user_id;
                return (
                  <div key={u.user_id} className="flex items-center gap-3 px-4 py-3">
                    <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center text-white text-sm font-semibold shrink-0">
                      {u.username.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-medium text-slate-900 dark:text-white truncate block">{u.username}</span>
                      {u.created_at && (
                        <span className="text-xs text-slate-400 dark:text-slate-500">
                          Requested {new Date(u.created_at).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                    {busy ? (
                      <Loader2 className="w-4 h-4 animate-spin text-slate-400 shrink-0" />
                    ) : (
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          onClick={() => handleApprovePending(u.user_id)}
                          title="Approve"
                          className="p-1.5 rounded-lg text-green-600 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/20 transition-colors"
                        >
                          <Check className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleRejectPending(u.user_id, u.username)}
                          title="Decline"
                          className="p-1.5 rounded-lg text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ─── Members Tab ─── */}
        {activeTab === 'members' && (
          <div className="cn-glass rounded-2xl overflow-hidden">
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
                          <span className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full cn-surface-3 cn-text-2 shrink-0 font-semibold">
                            <Crown className="w-2.5 h-2.5 text-purple-500 dark:text-purple-400" /> Admin
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
              <div className="cn-glass rounded-2xl p-5 space-y-4">
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {[
                    { screen: 'feed',        label: 'Feed',         Icon: Newspaper },
                    { screen: 'messages',    label: 'Messages',     Icon: MessageCircle },
                    { screen: 'atlas',       label: 'Atlas',        Icon: Map },
                    { screen: 'notes',       label: 'Notes',        Icon: NotebookPen },
                    { screen: 'spaces',      label: 'Spaces',       Icon: Layers },
                    { screen: 'marketplace', label: 'Exchange',     Icon: Store },
                    { screen: 'files',       label: 'Files',        Icon: FolderOpen },
                    { screen: 'discover',    label: 'Discover',     Icon: Compass },
                    { screen: 'toolkit',     label: 'Resources',    Icon: Package },
                    { screen: 'initiatives', label: 'Initiatives',  Icon: Target },
                    { screen: 'network',     label: 'Network',      Icon: Radio },
                    { screen: 'mod-log',     label: 'Mod Log',      Icon: ScrollText },
                  ].map(({ screen, label, Icon }) => {
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
                        <Icon className="w-4 h-4 shrink-0" />
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
              <div className="cn-glass rounded-2xl overflow-hidden">
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
                            citinet will verify the connection before saving. The app must implement the hub-app contract at <code className="bg-slate-100 dark:bg-zinc-800 px-1 rounded">/api/hub-app/info</code>.
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
                <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Support &amp; Requests</h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Help requests, bug reports, and feature suggestions from members</p>
              </div>
              <button
                onClick={loadRequests}
                className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors"
              >
                <RefreshCw className={`w-4 h-4 text-slate-400 ${requestsLoading ? 'animate-spin' : ''}`} />
              </button>
            </div>

            {/* Type filter chips */}
            <div className="flex gap-1.5 flex-wrap">
              {(['all', 'help', 'bug', 'feature'] as const).map(f => {
                const TYPE_CHIP: Record<string, string> = {
                  all:     requestsTypeFilter === 'all'    ? 'bg-slate-800 text-white dark:bg-white dark:text-zinc-900'     : 'bg-slate-100 text-slate-600 dark:bg-zinc-800 dark:text-zinc-400 hover:bg-slate-200 dark:hover:bg-zinc-700',
                  help:    requestsTypeFilter === 'help'   ? 'bg-blue-600 text-white'    : 'bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/30',
                  bug:     requestsTypeFilter === 'bug'    ? 'bg-rose-600 text-white'    : 'bg-rose-50 text-rose-600 dark:bg-rose-900/20 dark:text-rose-400 hover:bg-rose-100 dark:hover:bg-rose-900/30',
                  feature: requestsTypeFilter === 'feature'? 'bg-amber-500 text-white'   : 'bg-amber-50 text-amber-600 dark:bg-amber-900/20 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-900/30',
                };
                const TYPE_LABEL: Record<string, string> = { all: 'All', help: 'Help', bug: 'Bug', feature: 'Feature' };
                return (
                  <button key={f} onClick={() => setRequestsTypeFilter(f)} className={`px-2.5 py-1 rounded-full text-[11px] font-semibold transition-colors ${TYPE_CHIP[f]}`}>
                    {TYPE_LABEL[f]}
                    {f !== 'all' && hubRequests.filter(r => r.type === f).length > 0 && (
                      <span className="ml-1 opacity-70">{hubRequests.filter(r => r.type === f).length}</span>
                    )}
                    {f === 'all' && hubRequests.length > 0 && (
                      <span className="ml-1 opacity-70">{hubRequests.length}</span>
                    )}
                  </button>
                );
              })}
            </div>

            {requestsLoading ? (
              <div className="flex items-center justify-center py-12 text-slate-400 gap-2">
                <Loader2 className="w-5 h-5 animate-spin" />
                <span className="text-sm">Loading requests…</span>
              </div>
            ) : hubRequests.length === 0 ? (
              <div className="cn-glass rounded-2xl p-8 text-center">
                <ClipboardList className="w-8 h-8 text-slate-300 dark:text-zinc-600 mx-auto mb-2" />
                <p className="text-sm text-slate-400 dark:text-zinc-500">No requests yet</p>
                <p className="text-xs text-slate-300 dark:text-zinc-600 mt-1">Members can submit help requests, bug reports, and feature suggestions via the Support button</p>
              </div>
            ) : (
              <div className="space-y-2">
                {hubRequests.filter(r => requestsTypeFilter === 'all' || r.type === requestsTypeFilter).map(req => {
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
                  const TYPE_BADGE: Record<RequestType, string> = {
                    help:    'bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400',
                    bug:     'bg-rose-50 text-rose-600 dark:bg-rose-900/20 dark:text-rose-400',
                    feature: 'bg-amber-50 text-amber-600 dark:bg-amber-900/20 dark:text-amber-400',
                  };
                  const TYPE_LABEL_MAP: Record<RequestType, string> = { help: 'Help', bug: 'Bug', feature: 'Feature' };
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
                    <div key={req.id} className="cn-glass rounded-xl overflow-hidden">
                      <button
                        onClick={() => setExpandedRequest(isExpanded ? null : req.id)}
                        className="w-full flex items-start gap-3 p-4 text-left hover:bg-slate-50 dark:hover:bg-zinc-800/50 transition-colors"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide ${TYPE_BADGE[req.type ?? 'feature']}`}>
                              {TYPE_LABEL_MAP[req.type ?? 'feature']}
                            </span>
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
                          <div className="flex items-center gap-2 mt-1 flex-wrap">
                            {req.authorUsername && (
                              <p className="text-xs text-slate-400 dark:text-zinc-500">by {req.authorUsername}</p>
                            )}
                            {req.screenContext && (
                              <p className="text-[10px] text-slate-300 dark:text-zinc-600">· {req.screenContext}</p>
                            )}
                          </div>
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
                            {req.screenContext && (
                              <span>Screen: <span className="text-slate-600 dark:text-zinc-300">{req.screenContext}</span></span>
                            )}
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

        {/* ─── AI Tab ─── */}
        {activeTab === 'ai' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Hub Assistant</h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Local AI that knows your community. No cloud. No data leaves the hub.</p>
              </div>
              <button onClick={loadAiStatus} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors">
                <RefreshCw className={`w-4 h-4 text-slate-400 ${aiStatusLoading ? 'animate-spin' : ''}`} />
              </button>
            </div>

            {aiStatusLoading && !aiStatus ? (
              <div className="flex items-center justify-center py-12 text-slate-400 gap-2">
                <Loader2 className="w-5 h-5 animate-spin" />
                <span className="text-sm">Checking AI status…</span>
              </div>
            ) : (
              <div className="space-y-3">
                {/* Ollama status */}
                <div className="cn-glass rounded-2xl p-4 flex items-center gap-3">
                  {aiStatus?.ollamaReady ? (
                    <div className="w-8 h-8 rounded-xl bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center shrink-0">
                      <Wifi className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                    </div>
                  ) : (
                    <div className="w-8 h-8 rounded-xl bg-slate-100 dark:bg-zinc-800 flex items-center justify-center shrink-0">
                      <WifiOff className="w-4 h-4 text-slate-400" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-900 dark:text-white">
                      {aiStatus?.ollamaReady ? 'Ollama is running' : 'Ollama not detected'}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      {aiStatus?.ollamaReady
                        ? `Active model: ${aiStatus.model}`
                        : 'The citinet-ollama container may still be starting up'}
                    </p>
                  </div>
                </div>

                {/* Enable / disable toggle */}
                <div className="cn-glass rounded-2xl p-4 flex items-center gap-3">
                  <div className="w-8 h-8 rounded-xl bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center shrink-0">
                    <Bot className="w-4 h-4 text-violet-600 dark:text-violet-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-900 dark:text-white">Hub Assistant</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      {aiStatus?.enabled ? 'Visible to all hub members' : 'Hidden from members'}
                    </p>
                  </div>
                  <button
                    onClick={handleAiToggle}
                    disabled={aiConfigSaving || !aiStatus}
                    className="shrink-0 disabled:opacity-50"
                    title={aiStatus?.enabled ? 'Disable' : 'Enable'}
                  >
                    {aiStatus?.enabled
                      ? <ToggleRight className="w-8 h-8 text-violet-600 dark:text-violet-400" />
                      : <ToggleLeft className="w-8 h-8 text-slate-400" />
                    }
                  </button>
                </div>

                {/* Chat model picker */}
                <div className="cn-glass rounded-2xl p-4 space-y-3">
                  <div>
                    <p className="text-sm font-medium text-slate-900 dark:text-white">Chat Model</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Powers all AI responses — click a model to make it active</p>
                  </div>
                  <div className="space-y-2">
                    {installedModels.length > 0 ? (
                      installedModels.map(m => {
                        const isActive = aiStatus?.model === m;
                        return (
                          <button
                            key={m}
                            onClick={() => handleSetModel(m)}
                            disabled={aiConfigSaving || isActive}
                            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border text-left transition-all disabled:cursor-default ${
                              isActive
                                ? 'border-violet-400 dark:border-violet-600 bg-violet-50 dark:bg-violet-900/20'
                                : 'border-slate-200 dark:border-zinc-700 hover:border-violet-300 dark:hover:border-violet-700'
                            }`}
                          >
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-slate-900 dark:text-white">{m}</p>
                              <p className="text-xs text-slate-500 dark:text-slate-400">{isActive ? 'Currently active' : 'Installed — click to activate'}</p>
                            </div>
                            {isActive && <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-violet-600 text-white shrink-0">Active</span>}
                          </button>
                        );
                      })
                    ) : (
                      <p className="text-xs text-slate-400 dark:text-slate-500 italic">No chat models downloaded yet — add one below</p>
                    )}
                  </div>
                </div>

                {/* Smart context (RAG) status */}
                <div className="cn-glass rounded-2xl p-4 space-y-3">
                  <div>
                    <p className="text-sm font-medium text-slate-900 dark:text-white">Smart Context (RAG)</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Retrieves posts relevant to each question instead of always injecting the most recent ones</p>
                  </div>

                  {/* Embedding model status */}
                  <div className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border ${
                    indexStatus?.embedReady
                      ? 'border-emerald-200 dark:border-emerald-800/40 bg-emerald-50 dark:bg-emerald-900/10'
                      : 'border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-800'
                  }`}>
                    <div className={`w-2 h-2 rounded-full shrink-0 ${indexStatus?.embedReady ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-zinc-600'}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-slate-900 dark:text-white">{indexStatus?.embedModel ?? 'nomic-embed-text'}</p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">{indexStatus?.embedReady ? 'Installed · Smart context active' : 'Not installed · Using recency fallback'}</p>
                    </div>
                  </div>

                  {/* Index coverage */}
                  {indexStatus && (
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-slate-500 dark:text-slate-400">Posts indexed</span>
                        <span className="font-medium text-slate-900 dark:text-white">{indexStatus.indexed} / {indexStatus.total}</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-slate-100 dark:bg-zinc-800 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-violet-500 transition-all"
                          style={{ width: indexStatus.total > 0 ? `${Math.round((indexStatus.indexed / indexStatus.total) * 100)}%` : '0%' }}
                        />
                      </div>
                    </div>
                  )}

                  <div className="flex flex-wrap items-center gap-2">
                    {!indexStatus?.embedReady ? (
                      <button
                        onClick={() => {
                          setPullModel('nomic-embed-text');
                          handlePullModel();
                        }}
                        disabled={pulling}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white text-xs font-medium transition-colors"
                      >
                        {pulling && pullModel === 'nomic-embed-text'
                          ? <Loader2 className="w-3 h-3 animate-spin" />
                          : <Download className="w-3 h-3" />
                        }
                        Pull nomic-embed-text
                      </button>
                    ) : (
                      <button
                        onClick={handleReindex}
                        disabled={reindexing}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-zinc-700 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-zinc-800 disabled:opacity-50 transition-colors"
                      >
                        {reindexing ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                        Re-index all posts
                      </button>
                    )}
                    {reindexMsg && <p className="text-xs text-slate-500 dark:text-slate-400">{reindexMsg}</p>}
                  </div>
                  {pulling && pullModel === 'nomic-embed-text' && pullProgress && (
                    <div className="text-xs px-3 py-2 rounded-lg bg-slate-50 dark:bg-zinc-800 text-slate-500 dark:text-slate-400">
                      {pullProgress}
                    </div>
                  )}
                </div>

                {/* Download a model */}
                <div className="cn-glass rounded-2xl p-4 space-y-3">
                  <div>
                    <p className="text-sm font-medium text-slate-900 dark:text-white">Add a Chat Model</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Select a model to download, then click Pull. Once downloaded it appears above.</p>
                  </div>
                  <div className="space-y-1.5">
                    {SUGGESTED_MODELS.map(m => (
                      <button
                        key={m.id}
                        onClick={() => setPullModel(m.id)}
                        className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl border text-left transition-all ${
                          pullModel === m.id
                            ? 'border-slate-400 dark:border-zinc-500 bg-slate-100 dark:bg-zinc-800'
                            : 'border-slate-200 dark:border-zinc-700 hover:border-slate-300 dark:hover:border-zinc-600'
                        }`}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-medium text-slate-900 dark:text-white">{m.label}</p>
                            {installedModels.includes(m.id) && <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400">Installed</span>}
                          </div>
                          <p className="text-xs text-slate-500 dark:text-slate-400">{m.note}</p>
                        </div>
                        <div className={`w-4 h-4 rounded-full border-2 shrink-0 flex items-center justify-center ${pullModel === m.id ? 'border-slate-500 dark:border-zinc-400' : 'border-slate-300 dark:border-zinc-600'}`}>
                          {pullModel === m.id && <div className="w-2 h-2 rounded-full bg-slate-500 dark:bg-zinc-400" />}
                        </div>
                      </button>
                    ))}
                  </div>

                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={pullModel}
                      onChange={e => setPullModel(e.target.value)}
                      placeholder="or type a model name…"
                      className="flex-1 px-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-800 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-500/40"
                    />
                    <button
                      onClick={handlePullModel}
                      disabled={!pullModel.trim() || pulling || !aiStatus?.ollamaReady}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-700 disabled:opacity-40 text-white text-sm font-medium transition-colors"
                    >
                      {pulling ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                      {pulling ? 'Pulling…' : 'Pull'}
                    </button>
                  </div>

                  {pullProgress && (
                    <div className={`text-xs px-3 py-2 rounded-lg ${
                      pullProgress.startsWith('Error')
                        ? 'bg-rose-50 dark:bg-rose-900/20 text-rose-600 dark:text-rose-400'
                        : pullProgress === 'Download complete'
                          ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400'
                          : 'bg-slate-50 dark:bg-zinc-800 text-slate-500 dark:text-slate-400'
                    }`}>
                      {pullProgress}
                    </div>
                  )}
                </div>

                {aiConfigError && (
                  <p className="text-xs text-rose-600 dark:text-rose-400">{aiConfigError}</p>
                )}
              </div>
            )}
          </div>
        )}

        {/* ─── Network Reach Tab ─── */}
        {activeTab === 'reach' && (
          <NetworkReachTab hubSlug={hubSlug} hubName={currentHub?.name ?? ''} />
        )}
        </div>
      </div>
      </div>

      {/* Hidden input for hub icon image upload */}
      <input ref={iconFileInputRef} type="file" accept="image/*" className="hidden" onChange={handleIconFileChange} />

      {/* Hub Icon editor */}
      {showIconEditor && (
        <div className="fixed inset-0 z-40 bg-slate-900/40 dark:bg-black/50 flex items-center justify-center p-4" onClick={() => setShowIconEditor(false)}>
          <div onClick={e => e.stopPropagation()} className="cn-surface border cn-border rounded-2xl p-6 max-w-sm w-full space-y-4 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center gap-3">
              <HubIcon hub={currentHub} baseUrl={currentHub?.tunnelUrl ?? ''} size={48} variant="badge" />
              <h3 className="font-bold cn-text-1">Hub Icon</h3>
            </div>

            <button
              type="button"
              onClick={() => iconFileInputRef.current?.click()}
              className="w-full py-2 px-4 rounded-lg cn-surface-2 hover:bg-black/5 dark:hover:bg-white/5 text-sm font-medium cn-text-2 transition-colors"
            >
              {iconSaving ? <Loader2 className="w-4 h-4 animate-spin inline mr-2" /> : <ImagePlus className="w-4 h-4 inline mr-2" />}
              Upload Custom Image
            </button>

            <div>
              <p className="text-xs font-medium cn-text-3 mb-2">Symbol</p>
              <div className="flex flex-wrap gap-2">
                {Object.entries(HUB_ICON_SYMBOLS).map(([id, Icon]) => {
                  const selected = currentHub?.hub_icon_mode !== 'image' && (currentHub?.hub_icon_symbol ?? 'hexagon') === id;
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => saveHubIcon({ hub_icon_mode: 'preset', hub_icon_symbol: id })}
                      title={id}
                      className={`w-9 h-9 rounded-lg border-2 flex items-center justify-center transition-all cn-text-2 ${
                        selected ? 'border-purple-500 ring-2 ring-purple-300 dark:ring-purple-700 bg-purple-50 dark:bg-purple-900/20' : 'cn-border hover:border-purple-300 dark:hover:border-purple-700'
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <p className="text-xs font-medium cn-text-3 mb-2">Solid Colors</p>
              <div className="flex flex-wrap gap-2">
                {HUB_ICON_SOLID_COLORS.map(color => (
                  <button
                    key={color}
                    type="button"
                    onClick={() => saveHubIcon({ hub_icon_mode: 'preset', hub_icon_bg_mode: 'solid', hub_icon_solid_color: color })}
                    className={`w-8 h-8 rounded-full border-2 transition-all ${
                      currentHub?.hub_icon_mode !== 'image' && currentHub?.hub_icon_bg_mode === 'solid' && currentHub?.hub_icon_solid_color === color
                        ? 'border-slate-900 dark:border-white ring-2 ring-slate-300 dark:ring-zinc-600' : 'border-white/70 dark:border-zinc-700'
                    }`}
                    style={{ backgroundColor: color }}
                  />
                ))}
              </div>
            </div>

            <div>
              <p className="text-xs font-medium cn-text-3 mb-2">Gradients</p>
              <div className="flex flex-wrap gap-2">
                {HUB_ICON_GRADIENTS.map(g => {
                  const selected = currentHub?.hub_icon_mode !== 'image'
                    && (currentHub?.hub_icon_bg_mode ?? 'gradient') === 'gradient'
                    && (currentHub?.hub_icon_gradient_from ?? '#2563eb') === g.from
                    && (currentHub?.hub_icon_gradient_to ?? '#9333ea') === g.to;
                  return (
                    <button
                      key={`${g.from}-${g.to}`}
                      type="button"
                      onClick={() => saveHubIcon({ hub_icon_mode: 'preset', hub_icon_bg_mode: 'gradient', hub_icon_gradient_from: g.from, hub_icon_gradient_to: g.to })}
                      className={`w-12 h-8 rounded-lg border-2 transition-all ${selected ? 'border-slate-900 dark:border-white ring-2 ring-slate-300 dark:ring-zinc-600' : 'border-white/70 dark:border-zinc-700'}`}
                      style={{ backgroundImage: `linear-gradient(135deg, ${g.from}, ${g.to})` }}
                    />
                  );
                })}
              </div>
            </div>

            {iconError && <p className="text-xs text-red-500 dark:text-red-400">{iconError}</p>}

            <button
              onClick={() => setShowIconEditor(false)}
              className="w-full py-2 px-4 rounded-lg bg-purple-600 hover:bg-purple-500 text-white font-medium transition-colors"
            >
              Done
            </button>
          </div>
        </div>
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

