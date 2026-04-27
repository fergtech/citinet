import { hubService } from './hubService';

export interface AiStatus {
  enabled: boolean;
  model: string;
  ollamaReady: boolean;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export const SUGGESTED_MODELS = [
  { id: 'llama3.2:1b',  label: 'Llama 3.2 1B',  note: 'Fast · works on any hardware' },
  { id: 'llama3.2:3b',  label: 'Llama 3.2 3B',  note: 'Balanced · 8 GB+ RAM' },
  { id: 'llama3.1:8b',  label: 'Llama 3.1 8B',  note: 'Best quality · 16 GB+ RAM' },
  { id: 'phi3.5',       label: 'Phi 3.5 Mini',   note: 'Efficient · good on low RAM' },
];

function conn(hubSlug: string) {
  const c = hubService.getHubConnection(hubSlug);
  if (!c) throw new Error('No hub connection');
  return { base: c.hub.tunnelUrl, token: c.user?.authToken ?? '' };
}

async function get<T>(hubSlug: string, path: string): Promise<T> {
  const { base, token } = conn(hubSlug);
  const r = await fetch(`${base}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!r.ok) {
    const body = await r.json().catch(() => ({ error: r.statusText }));
    throw new Error(body.error ?? r.statusText);
  }
  return r.json();
}

async function patch<T>(hubSlug: string, path: string, body: unknown): Promise<T> {
  const { base, token } = conn(hubSlug);
  const r = await fetch(`${base}${path}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const b = await r.json().catch(() => ({ error: r.statusText }));
    throw new Error(b.error ?? r.statusText);
  }
  return r.json();
}

export interface ActionField {
  key: string;
  value: string;
}

export interface PendingAction {
  type: 'action_required';
  tool: string;
  args: Record<string, unknown>;
  preview: { label: string; fields: ActionField[] };
}

export interface ConversationSummary {
  id: string;
  title: string;
  updated_at: string;
  message_count: number;
}

export interface ConversationDetail extends ConversationSummary {
  created_at: string;
  messages: ChatMessage[];
}

export interface IndexStatus {
  total: number;
  indexed: number;
  embedModel: string;
  embedReady: boolean;
}

export const aiService = {
  async getStatus(hubSlug: string): Promise<AiStatus> {
    return get(hubSlug, '/api/ai/status');
  },

  async listModels(hubSlug: string): Promise<string[]> {
    const data = await get<{ models: string[] }>(hubSlug, '/api/ai/models');
    return data.models;
  },

  async updateConfig(hubSlug: string, cfg: { enabled?: boolean; model?: string }): Promise<void> {
    await patch(hubSlug, '/api/ai/config', cfg);
  },

  async listConversations(hubSlug: string): Promise<ConversationSummary[]> {
    const data = await get<{ conversations: ConversationSummary[] }>(hubSlug, '/api/ai/conversations');
    return data.conversations;
  },

  async createConversation(hubSlug: string, title: string): Promise<ConversationSummary> {
    const { base, token } = conn(hubSlug);
    const r = await fetch(`${base}/api/ai/conversations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ title }),
    });
    if (!r.ok) throw new Error('Failed to create conversation');
    return r.json();
  },

  async getConversation(hubSlug: string, id: string): Promise<ConversationDetail> {
    return get(hubSlug, `/api/ai/conversations/${id}`);
  },

  async updateConversationTitle(hubSlug: string, id: string, title: string): Promise<void> {
    await patch(hubSlug, `/api/ai/conversations/${id}`, { title });
  },

  async deleteConversation(hubSlug: string, id: string): Promise<void> {
    const { base, token } = conn(hubSlug);
    await fetch(`${base}/api/ai/conversations/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
  },

  async appendMessage(hubSlug: string, conversationId: string, role: string, content: string): Promise<void> {
    const { base, token } = conn(hubSlug);
    await fetch(`${base}/api/ai/conversations/${conversationId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ role, content }),
    });
  },

  async getIndexStatus(hubSlug: string): Promise<IndexStatus> {
    return get(hubSlug, '/api/ai/index/status');
  },

  async triggerReindex(hubSlug: string): Promise<void> {
    const { base, token } = conn(hubSlug);
    const r = await fetch(`${base}/api/ai/index`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!r.ok) {
      const b = await r.json().catch(() => ({ error: r.statusText }));
      throw new Error(b.error ?? r.statusText);
    }
  },

  // Sends a chat message. The server either streams a text response OR returns a
  // JSON action proposal for write operations that need user confirmation.
  chat(
    hubSlug: string,
    messages: ChatMessage[],
    onChunk: (text: string) => void,
    onDone: () => void,
    onError: (err: string) => void,
    onActionRequired?: (action: PendingAction) => void,
  ): AbortController {
    const ac = new AbortController();
    const { base, token } = conn(hubSlug);

    (async () => {
      try {
        const r = await fetch(`${base}/api/ai/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ messages }),
          signal: ac.signal,
        });

        if (!r.ok) {
          const body = await r.json().catch(() => ({ error: r.statusText }));
          onError(body.error ?? 'AI request failed');
          return;
        }

        // Action proposal — server returns JSON instead of streaming text
        const ct = r.headers.get('content-type') ?? '';
        if (ct.includes('application/json')) {
          const action = await r.json() as PendingAction;
          onActionRequired?.(action);
          onDone();
          return;
        }

        // Regular text response
        const reader = r.body!.getReader();
        const decoder = new TextDecoder();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          onChunk(decoder.decode(value, { stream: true }));
        }
        onDone();
      } catch (err: unknown) {
        if ((err as Error).name !== 'AbortError') {
          onError((err as Error).message ?? 'Connection lost');
        }
      }
    })();

    return ac;
  },

  async executeAction(hubSlug: string, tool: string, args: Record<string, unknown>): Promise<string> {
    const { base, token } = conn(hubSlug);
    const r = await fetch(`${base}/api/ai/action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ tool, args }),
    });
    if (!r.ok) {
      const b = await r.json().catch(() => ({ error: r.statusText }));
      throw new Error(b.error ?? 'Action failed');
    }
    const { result } = await r.json();
    return result as string;
  },

  // Streams pull progress lines (NDJSON). Returns abort controller.
  pullModel(
    hubSlug: string,
    model: string,
    onProgress: (line: string) => void,
    onDone: () => void,
    onError: (err: string) => void,
  ): AbortController {
    const ac = new AbortController();
    const { base, token } = conn(hubSlug);

    (async () => {
      try {
        const r = await fetch(`${base}/api/ai/model/pull`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ model }),
          signal: ac.signal,
        });
        if (!r.ok) {
          onError('Pull request failed');
          return;
        }
        const reader = r.body!.getReader();
        const decoder = new TextDecoder();
        let buf = '';
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          const lines = buf.split('\n');
          buf = lines.pop() ?? '';
          for (const line of lines) {
            if (line.trim()) onProgress(line);
          }
        }
        onDone();
      } catch (err: unknown) {
        if ((err as Error).name !== 'AbortError') onError((err as Error).message);
      }
    })();

    return ac;
  },
};
