import type { Poll } from '../types/poll';
import { hubService } from './hubService';

function rowToPoll(row: Record<string, unknown>): Poll {
  return {
    id:                  row.id as string,
    question:            row.question as string,
    options:             row.options as string[],
    created_by:          (row.created_by as string | null) ?? null,
    created_by_username: (row.created_by_username as string | null) ?? null,
    closes_at:           (row.closes_at as string | null) ?? null,
    closed:              Boolean(row.closed),
    created_at:          row.created_at as string,
    request_id:          (row.request_id as string | null) ?? null,
    request_problem:     (row.request_problem as string | null) ?? null,
    quorum_pct:          (row.quorum_pct as number) ?? 0,
    pass_pct:            (row.pass_pct as number) ?? 50,
    vote_counts:         (row.vote_counts as number[]) ?? [],
    total_votes:         (row.total_votes as number) ?? 0,
    member_count:        (row.member_count as number) ?? 0,
    my_vote:             row.my_vote != null ? (row.my_vote as number) : null,
    passed:              row.passed != null ? Boolean(row.passed) : null,
  };
}

class PollsService {
  private getConn(hubSlug: string) {
    const conn = hubService.getHubConnection(hubSlug);
    if (!conn?.user?.authToken) return null;
    return { baseUrl: conn.hub.tunnelUrl || 'http://localhost:9090', token: conn.user.authToken };
  }

  async list(hubSlug: string): Promise<Poll[]> {
    const conn = this.getConn(hubSlug);
    if (!conn) return [];
    try {
      const res = await fetch(`${conn.baseUrl}/api/polls`, {
        headers: { Authorization: `Bearer ${conn.token}` },
      });
      if (!res.ok) return [];
      const data = await res.json();
      return (data.polls as Record<string, unknown>[]).map(rowToPoll);
    } catch {
      return [];
    }
  }

  async create(hubSlug: string, data: { question: string; options: string[]; closes_at?: string; request_id?: string; quorum_pct?: number; pass_pct?: number }): Promise<Poll> {
    const conn = this.getConn(hubSlug);
    if (!conn) throw new Error('Not connected to hub');
    const res = await fetch(`${conn.baseUrl}/api/polls`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${conn.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Failed to create poll' }));
      throw new Error((err as { error?: string }).error ?? 'Failed to create poll');
    }
    return rowToPoll(await res.json());
  }

  async vote(hubSlug: string, pollId: string, optionIndex: number): Promise<void> {
    const conn = this.getConn(hubSlug);
    if (!conn) throw new Error('Not connected to hub');
    const res = await fetch(`${conn.baseUrl}/api/polls/${pollId}/vote`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${conn.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ option_index: optionIndex }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Failed to vote' }));
      throw new Error((err as { error?: string }).error ?? 'Failed to vote');
    }
  }

  async close(hubSlug: string, pollId: string): Promise<void> {
    const conn = this.getConn(hubSlug);
    if (!conn) throw new Error('Not connected to hub');
    await fetch(`${conn.baseUrl}/api/polls/${pollId}/close`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${conn.token}` },
    });
  }

  /** Reopens a closed poll. Omitting `closesAt` reopens with no deadline (open
   * until manually closed again) rather than immediately re-closing against a
   * stale past date. */
  async reopen(hubSlug: string, pollId: string, closesAt?: string): Promise<void> {
    const conn = this.getConn(hubSlug);
    if (!conn) throw new Error('Not connected to hub');
    const res = await fetch(`${conn.baseUrl}/api/polls/${pollId}/reopen`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${conn.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ closes_at: closesAt || undefined }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Failed to reopen poll' }));
      throw new Error((err as { error?: string }).error ?? 'Failed to reopen poll');
    }
  }

  async update(hubSlug: string, pollId: string, data: { question?: string; options?: string[]; closes_at?: string | null; quorum_pct?: number; pass_pct?: number }): Promise<Poll> {
    const conn = this.getConn(hubSlug);
    if (!conn) throw new Error('Not connected to hub');
    const res = await fetch(`${conn.baseUrl}/api/polls/${pollId}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${conn.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Failed to edit poll' }));
      throw new Error((err as { error?: string }).error ?? 'Failed to edit poll');
    }
    return rowToPoll(await res.json());
  }
}

export const pollsService = new PollsService();
