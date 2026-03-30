import { hubService } from './hubService';

export type RequestStatus   = 'submitted' | 'needs_clarification' | 'under_review' | 'approved' | 'building' | 'shipped' | 'declined';
export type RequestPriority = 'nice_to_have' | 'important' | 'urgent';
export type RequestScope    = 'hub_only' | 'all_hubs';
export type RequestData     = 'none' | 'public' | 'private';

export interface HubRequest {
  id:              string;
  authorId:        string | null;
  authorUsername:  string | null;
  problem:         string;
  whoItHelps:      string | null;
  expectedOutcome: string | null;
  dataInvolved:    RequestData;
  scope:           RequestScope;
  priority:        RequestPriority;
  status:          RequestStatus;
  adminNote:       string | null;
  pollId:          string | null;
  pollQuestion:    string | null;
  pollClosed:      boolean | null;
  createdAt:       string;
  updatedAt:       string;
}

function rowToRequest(row: Record<string, unknown>): HubRequest {
  return {
    id:              row.id as string,
    authorId:        (row.author_id as string | null) ?? null,
    authorUsername:  (row.author_username as string | null) ?? null,
    problem:         row.problem as string,
    whoItHelps:      (row.who_it_helps as string | null) ?? null,
    expectedOutcome: (row.expected_outcome as string | null) ?? null,
    dataInvolved:    ((row.data_involved as string) ?? 'none') as RequestData,
    scope:           ((row.scope as string) ?? 'hub_only') as RequestScope,
    priority:        ((row.priority as string) ?? 'nice_to_have') as RequestPriority,
    status:          ((row.status as string) ?? 'submitted') as RequestStatus,
    adminNote:       (row.admin_note as string | null) ?? null,
    pollId:          (row.poll_id as string | null) ?? null,
    pollQuestion:    (row.poll_question as string | null) ?? null,
    pollClosed:      row.poll_closed != null ? Boolean(row.poll_closed) : null,
    createdAt:       row.created_at as string,
    updatedAt:       row.updated_at as string,
  };
}

class RequestsService {
  private getConn(hubSlug: string) {
    const conn = hubService.getHubConnection(hubSlug);
    if (!conn?.user?.authToken) return null;
    return { baseUrl: conn.hub.tunnelUrl || 'http://localhost:9090', token: conn.user.authToken };
  }

  async submit(hubSlug: string, data: {
    problem:         string;
    whoItHelps?:     string;
    expectedOutcome?: string;
    dataInvolved:    RequestData;
    scope:           RequestScope;
    priority:        RequestPriority;
  }): Promise<HubRequest> {
    const conn = this.getConn(hubSlug);
    if (!conn) throw new Error('Not connected to hub');
    const res = await fetch(`${conn.baseUrl}/api/requests`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${conn.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        problem:          data.problem,
        who_it_helps:     data.whoItHelps,
        expected_outcome: data.expectedOutcome,
        data_involved:    data.dataInvolved,
        scope:            data.scope,
        priority:         data.priority,
      }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Failed to submit' }));
      throw new Error((err as { error?: string }).error ?? 'Failed to submit');
    }
    return rowToRequest(await res.json());
  }

  async list(hubSlug: string): Promise<HubRequest[]> {
    const conn = this.getConn(hubSlug);
    if (!conn) return [];
    try {
      const res = await fetch(`${conn.baseUrl}/api/requests`, {
        headers: { Authorization: `Bearer ${conn.token}` },
      });
      if (!res.ok) return [];
      const data = await res.json();
      return (data.requests as Record<string, unknown>[]).map(rowToRequest);
    } catch {
      return [];
    }
  }

  async updateStatus(hubSlug: string, id: string, status: RequestStatus, adminNote?: string): Promise<void> {
    const conn = this.getConn(hubSlug);
    if (!conn) throw new Error('Not connected');
    await fetch(`${conn.baseUrl}/api/requests/${id}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${conn.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ status, admin_note: adminNote }),
    });
  }
}

export const requestsService = new RequestsService();
