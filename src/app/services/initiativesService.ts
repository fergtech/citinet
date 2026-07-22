import { hubService } from './hubService';
import { hubPath } from '../utils/subdomain';

// ── Types ─────────────────────────────────────────────────
// Initiatives are proxied to an external app — most fields below come straight
// from that unverified external payload. Fields under "local extension" are
// always reliable: they're written and read by this hub's own Postgres.

export interface InitiativeTask {
  id: string;
  title: string;
  status: 'todo' | 'in-progress' | 'done';
  /** Only reliable in local-mode (no external "who created this goal" concept). */
  created_by?: string | null;
  /** Local extension (hub_initiative_task_meta) — reliable, unlike anything the
   * external service might echo back for unknown fields. */
  assignee_user_id?: string | null;
  assignee_name?: string | null;
  due_date?: string | null;
}

export interface InitiativeMember {
  id?: string;
  name: string;
  email?: string;
  role?: string;
  contribution?: string;
  joinedAt?: string;
}

export interface InitiativeUpdateComment {
  id: string;
  author_id?: string | null;
  author_name: string;
  content: string;
  created_at: string;
}

export interface InitiativeUpdate {
  id: string;
  author_id?: string | null;
  author_name: string;
  content: string;
  created_at: string;
  comments: InitiativeUpdateComment[];
}

export interface InitiativeResource {
  id: string;
  initiative_id: string;
  item: string;
  qty?: string | null;
  provided: boolean;
  provided_by_user_id?: string | null;
  provided_by_name?: string | null;
  created_by?: string | null;
  created_at: string;
  /** 'material' (default) is the original pledge-then-fulfill item. 'file' and
   * 'link' are simply present the moment they're added — no provide/unprovide. */
  kind: 'material' | 'file' | 'link';
  file_id?: string | null;
  file_display_name?: string | null;
  file_mime_type?: string | null;
  file_size_bytes?: number | null;
  url?: string | null;
}

export interface InitiativeRole {
  id: string;
  initiative_id: string;
  role: string;
  skill?: string | null;
  filled: boolean;
  filled_by_user_id?: string | null;
  filled_by_name?: string | null;
  created_by?: string | null;
  created_at: string;
}

export interface ChecklistItem {
  id: string;
  task_id: string;
  initiative_id: string;
  text: string;
  done: boolean;
  created_by?: string | null;
  created_at: string;
}

export interface TaskNoteReply {
  id: string;
  note_id: string;
  author_id?: string | null;
  author_name: string;
  content: string;
  created_at: string;
}

export interface TaskNote {
  id: string;
  task_id: string;
  initiative_id: string;
  author_id?: string | null;
  author_name: string;
  content: string;
  created_at: string;
  replies: TaskNoteReply[];
}

export interface TaskMeta {
  task_id: string;
  initiative_id: string;
  assignee_user_id: string | null;
  assignee_name: string | null;
  due_date: string | null;
  blocked: boolean;
  checklist_total: number;
  checklist_done: number;
}

export interface InitiativeActivityEntry {
  id: string;
  initiative_id: string;
  kind: 'task' | 'resource' | 'team' | 'update' | 'member';
  text: string;
  actor_id?: string | null;
  actor_name: string;
  created_at: string;
}

export interface Initiative {
  id: string;
  title: string;
  category: string;
  status: 'planning' | 'active' | 'completed';
  goal: string;
  description: string;
  progress: number;
  color: 'purple' | 'emerald' | 'blue' | 'amber';
  imageUrl?: string | null;
  createdBy: string;
  creatorEmail?: string;
  createdAt: string;
  tasks: InitiativeTask[];
  members: InitiativeMember[];
  updates: InitiativeUpdate[];
  // Local extension / merge-layer fields (server-computed, always reliable)
  viewerIsMember?: boolean;
  viewerIsCreator?: boolean;
  space_id?: string | null;
  space_slug?: string | null;
  space_name?: string | null;
  banner_mode?: 'image' | 'gradient' | 'solid' | null;
  banner_color?: string | null;
  banner_gradient_from?: string | null;
  banner_gradient_to?: string | null;
  banner_image_file_name?: string | null;
  open_roles_count?: number;
}

class InitiativesService {
  private getAuth(hubSlug: string): { headers: Record<string, string>; baseUrl: string } {
    const conn = hubService.getHubConnection(hubSlug);
    if (!conn) throw new Error('Hub not found');
    const headers: Record<string, string> = {};
    if (conn.user?.authToken) headers['Authorization'] = `Bearer ${conn.user.authToken}`;
    return { headers, baseUrl: conn.hub.tunnelUrl };
  }

  private async json<T>(res: Response, fallbackMsg: string): Promise<T> {
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `${fallbackMsg} (${res.status})`);
    }
    return res.json();
  }

  async appInfo(hubSlug: string): Promise<{ websiteUrl?: string } | null> {
    const { headers, baseUrl } = this.getAuth(hubSlug);
    const res = await fetch(`${baseUrl}/api/initiatives/app-info`, { headers });
    if (!res.ok) return null;
    return res.json();
  }

  async listAll(hubSlug: string): Promise<Initiative[]> {
    const { headers, baseUrl } = this.getAuth(hubSlug);
    const res = await fetch(`${baseUrl}/api/initiatives`, { headers });
    const data = await this.json<any>(res, 'Failed to load initiatives');
    return Array.isArray(data) ? data : data.initiatives ?? [];
  }

  async get(hubSlug: string, id: string): Promise<Initiative> {
    const { headers, baseUrl } = this.getAuth(hubSlug);
    const res = await fetch(`${baseUrl}/api/initiatives/${encodeURIComponent(id)}`, { headers });
    return this.json(res, 'Initiative not found');
  }

  async create(hubSlug: string, data: { title: string; goal?: string; category?: string; space_id?: string | null }): Promise<Initiative> {
    const { headers, baseUrl } = this.getAuth(hubSlug);
    const res = await fetch(`${baseUrl}/api/initiatives`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return this.json(res, 'Failed to create project');
  }

  async update(hubSlug: string, id: string, data: Record<string, unknown>): Promise<Initiative> {
    const { headers, baseUrl } = this.getAuth(hubSlug);
    const res = await fetch(`${baseUrl}/api/initiatives/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return this.json(res, 'Failed to update project');
  }

  async remove(hubSlug: string, id: string): Promise<void> {
    const { headers, baseUrl } = this.getAuth(hubSlug);
    const res = await fetch(`${baseUrl}/api/initiatives/${encodeURIComponent(id)}`, { method: 'DELETE', headers });
    await this.json(res, 'Failed to delete project');
  }

  async join(hubSlug: string, id: string): Promise<void> {
    const { headers, baseUrl } = this.getAuth(hubSlug);
    const res = await fetch(`${baseUrl}/api/initiatives/${encodeURIComponent(id)}/join`, { method: 'POST', headers });
    await this.json(res, 'Failed to join project');
  }

  async leave(hubSlug: string, id: string): Promise<void> {
    const { headers, baseUrl } = this.getAuth(hubSlug);
    const res = await fetch(`${baseUrl}/api/initiatives/${encodeURIComponent(id)}/leave`, { method: 'POST', headers });
    await this.json(res, 'Failed to leave project');
  }

  async addTask(hubSlug: string, id: string, data: { title: string; assignee_user_id?: string; due_date?: string }): Promise<InitiativeTask> {
    const { headers, baseUrl } = this.getAuth(hubSlug);
    const res = await fetch(`${baseUrl}/api/initiatives/${encodeURIComponent(id)}/goals`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return this.json(res, 'Failed to add task');
  }

  async updateTaskStatus(hubSlug: string, taskId: string, status: InitiativeTask['status'], initiativeId: string, title: string): Promise<void> {
    const { headers, baseUrl } = this.getAuth(hubSlug);
    const res = await fetch(`${baseUrl}/api/initiatives/goals/${encodeURIComponent(taskId)}`, {
      method: 'PATCH',
      headers: { ...headers, 'Content-Type': 'application/json' },
      // _initiativeId/_title are stripped server-side before proxying — they only
      // drive local activity-log entries (the external API has no "get goal" route).
      body: JSON.stringify({ status, _initiativeId: initiativeId, _title: title }),
    });
    await this.json(res, 'Failed to update task');
  }

  async deleteTask(hubSlug: string, taskId: string): Promise<void> {
    const { headers, baseUrl } = this.getAuth(hubSlug);
    const res = await fetch(`${baseUrl}/api/initiatives/goals/${encodeURIComponent(taskId)}`, { method: 'DELETE', headers });
    await this.json(res, 'Failed to remove task');
  }

  async getTaskMeta(hubSlug: string, initiativeId: string): Promise<Record<string, TaskMeta>> {
    const { headers, baseUrl } = this.getAuth(hubSlug);
    const res = await fetch(`${baseUrl}/api/initiatives/${encodeURIComponent(initiativeId)}/task-meta`, { headers });
    const data = await this.json<{ taskMeta: TaskMeta[] }>(res, 'Failed to load task assignments');
    return Object.fromEntries(data.taskMeta.map(m => [m.task_id, m]));
  }

  async assignTask(hubSlug: string, taskId: string, initiativeId: string, assignSelf: boolean): Promise<void> {
    const { headers, baseUrl } = this.getAuth(hubSlug);
    const res = await fetch(`${baseUrl}/api/initiatives/goals/${encodeURIComponent(taskId)}/meta`, {
      method: 'PATCH',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ initiative_id: initiativeId, assign_self: assignSelf }),
    });
    await this.json(res, 'Failed to assign task');
  }

  /** Self-service "oops, not for me" — also usable by the task creator to clear
   * someone else's assignment. */
  async unassignTask(hubSlug: string, taskId: string, initiativeId: string): Promise<void> {
    const { headers, baseUrl } = this.getAuth(hubSlug);
    const res = await fetch(`${baseUrl}/api/initiatives/goals/${encodeURIComponent(taskId)}/meta`, {
      method: 'PATCH',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ initiative_id: initiativeId, assign_self: false }),
    });
    await this.json(res, 'Failed to unassign task');
  }

  async setTaskBlocked(hubSlug: string, taskId: string, initiativeId: string, blocked: boolean): Promise<void> {
    const { headers, baseUrl } = this.getAuth(hubSlug);
    const res = await fetch(`${baseUrl}/api/initiatives/tasks/${encodeURIComponent(taskId)}/blocked`, {
      method: 'PATCH',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ initiative_id: initiativeId, blocked }),
    });
    await this.json(res, 'Failed to update blocked status');
  }

  async getChecklist(hubSlug: string, taskId: string): Promise<ChecklistItem[]> {
    const { headers, baseUrl } = this.getAuth(hubSlug);
    const res = await fetch(`${baseUrl}/api/initiatives/tasks/${encodeURIComponent(taskId)}/checklist`, { headers });
    const data = await this.json<{ checklist: ChecklistItem[] }>(res, 'Failed to load checklist');
    return data.checklist;
  }

  async addChecklistItem(hubSlug: string, taskId: string, initiativeId: string, text: string): Promise<ChecklistItem> {
    const { headers, baseUrl } = this.getAuth(hubSlug);
    const res = await fetch(`${baseUrl}/api/initiatives/tasks/${encodeURIComponent(taskId)}/checklist`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, initiative_id: initiativeId }),
    });
    return this.json(res, 'Failed to add checklist item');
  }

  async updateChecklistItem(hubSlug: string, itemId: string, data: { text?: string; done?: boolean }): Promise<ChecklistItem> {
    const { headers, baseUrl } = this.getAuth(hubSlug);
    const res = await fetch(`${baseUrl}/api/initiatives/checklist/${encodeURIComponent(itemId)}`, {
      method: 'PATCH',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return this.json(res, 'Failed to update checklist item');
  }

  async deleteChecklistItem(hubSlug: string, itemId: string): Promise<void> {
    const { headers, baseUrl } = this.getAuth(hubSlug);
    const res = await fetch(`${baseUrl}/api/initiatives/checklist/${encodeURIComponent(itemId)}`, { method: 'DELETE', headers });
    await this.json(res, 'Failed to remove checklist item');
  }

  async getTaskNotes(hubSlug: string, taskId: string): Promise<TaskNote[]> {
    const { headers, baseUrl } = this.getAuth(hubSlug);
    const res = await fetch(`${baseUrl}/api/initiatives/tasks/${encodeURIComponent(taskId)}/notes`, { headers });
    const data = await this.json<{ notes: TaskNote[] }>(res, 'Failed to load progress notes');
    return data.notes;
  }

  async postTaskNote(hubSlug: string, taskId: string, initiativeId: string, content: string): Promise<TaskNote> {
    const { headers, baseUrl } = this.getAuth(hubSlug);
    const res = await fetch(`${baseUrl}/api/initiatives/tasks/${encodeURIComponent(taskId)}/notes`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ content, initiative_id: initiativeId }),
    });
    return this.json(res, 'Failed to post note');
  }

  async deleteTaskNote(hubSlug: string, noteId: string): Promise<void> {
    const { headers, baseUrl } = this.getAuth(hubSlug);
    const res = await fetch(`${baseUrl}/api/initiatives/notes/${encodeURIComponent(noteId)}`, { method: 'DELETE', headers });
    await this.json(res, 'Failed to remove note');
  }

  async replyToNote(hubSlug: string, noteId: string, content: string): Promise<TaskNoteReply> {
    const { headers, baseUrl } = this.getAuth(hubSlug);
    const res = await fetch(`${baseUrl}/api/initiatives/notes/${encodeURIComponent(noteId)}/replies`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
    });
    return this.json(res, 'Failed to post reply');
  }

  async deleteNoteReply(hubSlug: string, replyId: string): Promise<void> {
    const { headers, baseUrl } = this.getAuth(hubSlug);
    const res = await fetch(`${baseUrl}/api/initiatives/note-replies/${encodeURIComponent(replyId)}`, { method: 'DELETE', headers });
    await this.json(res, 'Failed to remove reply');
  }

  async getResources(hubSlug: string, id: string): Promise<InitiativeResource[]> {
    const { headers, baseUrl } = this.getAuth(hubSlug);
    const res = await fetch(`${baseUrl}/api/initiatives/${encodeURIComponent(id)}/resources`, { headers });
    const data = await this.json<{ resources: InitiativeResource[] }>(res, 'Failed to load resources');
    return data.resources;
  }

  async addResource(hubSlug: string, id: string, data: { item: string; qty?: string }): Promise<InitiativeResource> {
    const { headers, baseUrl } = this.getAuth(hubSlug);
    const res = await fetch(`${baseUrl}/api/initiatives/${encodeURIComponent(id)}/resources`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return this.json(res, 'Failed to add resource');
  }

  async addResourceLink(hubSlug: string, id: string, data: { item?: string; url: string }): Promise<InitiativeResource> {
    const { headers, baseUrl } = this.getAuth(hubSlug);
    const res = await fetch(`${baseUrl}/api/initiatives/${encodeURIComponent(id)}/resources`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...data, kind: 'link' }),
    });
    return this.json(res, 'Failed to add link');
  }

  /** Shared file — lands in hub_files just like anything on the Files screen,
   * always hub-visible (never private), and shows up there automatically. */
  async uploadResourceFile(hubSlug: string, id: string, file: File): Promise<InitiativeResource> {
    const { headers, baseUrl } = this.getAuth(hubSlug);
    const formData = new FormData();
    formData.append('file', file);
    const res = await fetch(`${baseUrl}/api/initiatives/${encodeURIComponent(id)}/resources/file`, {
      method: 'POST',
      headers,
      body: formData,
    });
    return this.json(res, 'Failed to upload file');
  }

  /** Reference a file already on the Files screen instead of re-uploading it. */
  async attachResourceFile(hubSlug: string, id: string, fileId: string): Promise<InitiativeResource> {
    const { headers, baseUrl } = this.getAuth(hubSlug);
    const res = await fetch(`${baseUrl}/api/initiatives/${encodeURIComponent(id)}/resources/attach-file`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ file_id: fileId }),
    });
    return this.json(res, 'Failed to attach file');
  }

  async provideResource(hubSlug: string, resourceId: string): Promise<InitiativeResource> {
    const { headers, baseUrl } = this.getAuth(hubSlug);
    const res = await fetch(`${baseUrl}/api/initiatives/resources/${encodeURIComponent(resourceId)}/provide`, {
      method: 'PATCH',
      headers,
    });
    return this.json(res, 'Failed to update resource');
  }

  async unprovideResource(hubSlug: string, resourceId: string): Promise<InitiativeResource> {
    const { headers, baseUrl } = this.getAuth(hubSlug);
    const res = await fetch(`${baseUrl}/api/initiatives/resources/${encodeURIComponent(resourceId)}/unprovide`, {
      method: 'PATCH',
      headers,
    });
    return this.json(res, 'Failed to retract pledge');
  }

  async deleteResource(hubSlug: string, resourceId: string): Promise<void> {
    const { headers, baseUrl } = this.getAuth(hubSlug);
    const res = await fetch(`${baseUrl}/api/initiatives/resources/${encodeURIComponent(resourceId)}`, { method: 'DELETE', headers });
    await this.json(res, 'Failed to remove resource');
  }

  async getRoles(hubSlug: string, id: string): Promise<InitiativeRole[]> {
    const { headers, baseUrl } = this.getAuth(hubSlug);
    const res = await fetch(`${baseUrl}/api/initiatives/${encodeURIComponent(id)}/roles`, { headers });
    const data = await this.json<{ roles: InitiativeRole[] }>(res, 'Failed to load roles');
    return data.roles;
  }

  async addRole(hubSlug: string, id: string, data: { role: string; skill?: string }): Promise<InitiativeRole> {
    const { headers, baseUrl } = this.getAuth(hubSlug);
    const res = await fetch(`${baseUrl}/api/initiatives/${encodeURIComponent(id)}/roles`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return this.json(res, 'Failed to add role');
  }

  async claimRole(hubSlug: string, roleId: string): Promise<InitiativeRole> {
    const { headers, baseUrl } = this.getAuth(hubSlug);
    const res = await fetch(`${baseUrl}/api/initiatives/roles/${encodeURIComponent(roleId)}/claim`, {
      method: 'POST',
      headers,
    });
    return this.json(res, 'Failed to claim role');
  }

  async unclaimRole(hubSlug: string, roleId: string): Promise<InitiativeRole> {
    const { headers, baseUrl } = this.getAuth(hubSlug);
    const res = await fetch(`${baseUrl}/api/initiatives/roles/${encodeURIComponent(roleId)}/unclaim`, {
      method: 'POST',
      headers,
    });
    return this.json(res, 'Failed to unclaim role');
  }

  async deleteRole(hubSlug: string, roleId: string): Promise<void> {
    const { headers, baseUrl } = this.getAuth(hubSlug);
    const res = await fetch(`${baseUrl}/api/initiatives/roles/${encodeURIComponent(roleId)}`, { method: 'DELETE', headers });
    await this.json(res, 'Failed to remove role');
  }

  async getUpdates(hubSlug: string, id: string): Promise<InitiativeUpdate[]> {
    const { headers, baseUrl } = this.getAuth(hubSlug);
    const res = await fetch(`${baseUrl}/api/initiatives/${encodeURIComponent(id)}/updates`, { headers });
    const data = await this.json<{ updates: InitiativeUpdate[] }>(res, 'Failed to load updates');
    return data.updates;
  }

  async postUpdate(hubSlug: string, id: string, content: string): Promise<InitiativeUpdate> {
    const { headers, baseUrl } = this.getAuth(hubSlug);
    const res = await fetch(`${baseUrl}/api/initiatives/${encodeURIComponent(id)}/updates`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
    });
    return this.json(res, 'Failed to post update');
  }

  async addComment(hubSlug: string, updateId: string, content: string): Promise<InitiativeUpdateComment> {
    const { headers, baseUrl } = this.getAuth(hubSlug);
    const res = await fetch(`${baseUrl}/api/initiatives/updates/${encodeURIComponent(updateId)}/comments`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
    });
    return this.json(res, 'Failed to post comment');
  }

  async deleteUpdate(hubSlug: string, updateId: string): Promise<void> {
    const { headers, baseUrl } = this.getAuth(hubSlug);
    const res = await fetch(`${baseUrl}/api/initiatives/updates/${encodeURIComponent(updateId)}`, { method: 'DELETE', headers });
    await this.json(res, 'Failed to remove update');
  }

  async deleteComment(hubSlug: string, commentId: string): Promise<void> {
    const { headers, baseUrl } = this.getAuth(hubSlug);
    const res = await fetch(`${baseUrl}/api/initiatives/comments/${encodeURIComponent(commentId)}`, { method: 'DELETE', headers });
    await this.json(res, 'Failed to remove comment');
  }

  async getActivity(hubSlug: string, id: string, limit = 5): Promise<InitiativeActivityEntry[]> {
    const { headers, baseUrl } = this.getAuth(hubSlug);
    const res = await fetch(`${baseUrl}/api/initiatives/${encodeURIComponent(id)}/activity?limit=${limit}`, { headers });
    const data = await this.json<{ activity: InitiativeActivityEntry[] }>(res, 'Failed to load activity');
    return data.activity;
  }

  async uploadBanner(hubSlug: string, id: string, file: File): Promise<{ file_name: string }> {
    const { headers, baseUrl } = this.getAuth(hubSlug);
    const formData = new FormData();
    formData.append('banner', file);
    const res = await fetch(`${baseUrl}/api/initiatives/${encodeURIComponent(id)}/banner`, {
      method: 'POST',
      headers,
      body: formData,
    });
    return this.json(res, 'Failed to upload banner');
  }

  async setBannerMode(hubSlug: string, id: string, data: { banner_mode: 'gradient' | 'solid'; banner_color?: string; banner_gradient_from?: string; banner_gradient_to?: string }): Promise<void> {
    const { headers, baseUrl } = this.getAuth(hubSlug);
    const res = await fetch(`${baseUrl}/api/initiatives/${encodeURIComponent(id)}/banner`, {
      method: 'PATCH',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    await this.json(res, 'Failed to update banner');
  }

  async removeBanner(hubSlug: string, id: string): Promise<void> {
    const { headers, baseUrl } = this.getAuth(hubSlug);
    const res = await fetch(`${baseUrl}/api/initiatives/${encodeURIComponent(id)}/banner`, { method: 'DELETE', headers });
    await this.json(res, 'Failed to remove banner');
  }

  getBannerUrl(hubSlug: string, id: string): string | null {
    const conn = hubService.getHubConnection(hubSlug);
    if (!conn) return null;
    return `${conn.hub.tunnelUrl}/api/initiatives/${encodeURIComponent(id)}/banner`;
  }

  async invite(hubSlug: string, id: string, userId: string): Promise<void> {
    const { headers, baseUrl } = this.getAuth(hubSlug);
    const res = await fetch(`${baseUrl}/api/initiatives/${encodeURIComponent(id)}/invite`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: userId }),
    });
    await this.json(res, 'Failed to send invite');
  }

  /** Real, canonical deep link — replaces copying whatever's in the address bar
   * (which could carry unrelated query params or be stale). */
  getShareLink(hubSlug: string, id: string): string {
    return `${window.location.origin}${hubPath(`/initiatives/${id}`, hubSlug)}`;
  }
}

export const initiativesService = new InitiativesService();
