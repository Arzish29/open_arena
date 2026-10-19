// POST /api/chat — streams Pip's answer. Accepts SSE (text/event-stream) with
// {type:"token"|"sources"|"done"} events, or a plain JSON { answer, sources } body.
import { API_BASE, USE_MOCK } from './config';

export interface Source {
  id: string;
  title: string;
  /** Game slug, used to colour the chip by input type. May be empty for general topics. */
  game: string;
  section: string;
  snippet: string;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ChatRequest {
  message: string;
  history: ChatMessage[];
  gameSlug?: string;
}

export interface ChatHandlers {
  onToken(text: string): void;
  onSources(sources: Source[]): void;
}

export class ChatNetworkError extends Error {}

export async function streamChat(req: ChatRequest, h: ChatHandlers, signal: AbortSignal): Promise<void> {
  if (USE_MOCK) {
    const { mockChat } = await import('../mocks/chat');
    return mockChat(req, h, signal);
  }
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream, application/json' },
      body: JSON.stringify(req),
      signal,
    });
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw err;
    throw new ChatNetworkError('network');
  }
  if (!res.ok) throw new ChatNetworkError(`status ${res.status}`);

  if (!(res.headers.get('content-type') ?? '').includes('text/event-stream') || !res.body) {
    const data = (await res.json().catch(() => null)) as { answer?: string; sources?: Source[] } | null;
    if (!data || typeof data.answer !== 'string') throw new ChatNetworkError('bad json');
    h.onSources(Array.isArray(data.sources) ? data.sources : []);
    h.onToken(data.answer);
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let cut: number;
    while ((cut = buf.indexOf('\n\n')) >= 0) {
      const block = buf.slice(0, cut);
      buf = buf.slice(cut + 2);
      const data = block.split('\n').filter((l) => l.startsWith('data:')).map((l) => l.slice(5).trim()).join('\n');
      if (!data) continue;
      let ev: { type?: string; text?: string; sources?: Source[] };
      try {
        ev = JSON.parse(data);
      } catch {
        continue;
      }
      if (ev.type === 'token' && ev.text) h.onToken(ev.text);
      else if (ev.type === 'sources' && Array.isArray(ev.sources)) h.onSources(ev.sources);
      else if (ev.type === 'done') return;
    }
  }
}
