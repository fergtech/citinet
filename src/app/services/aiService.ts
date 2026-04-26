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

  // Streams assistant reply token-by-token. Calls onChunk for each text fragment,
  // calls onDone when the stream ends. Returns abort controller so caller can cancel.
  chat(
    hubSlug: string,
    messages: ChatMessage[],
    onChunk: (text: string) => void,
    onDone: () => void,
    onError: (err: string) => void,
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
