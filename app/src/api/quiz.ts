// POST /api/quiz/question — see the RAG API contract in README.md.
import { API_BASE, USE_MOCK } from './config';

export type Deck = string | { text: string; title?: string };

export interface QuizRequest {
  deck: Deck;
  difficulty: 'easy' | 'normal' | 'hard';
  askedIds: string[];
}

export interface QuizQuestion {
  id: string;
  question: string;
  options: string[];
  answerIndex: number;
  explanation: string;
  source: { title: string; page: number | string };
}

function isQuestion(q: unknown): q is QuizQuestion {
  const v = q as QuizQuestion;
  return !!v && typeof v.id === 'string' && typeof v.question === 'string' && Array.isArray(v.options)
    && v.options.length === 4 && typeof v.answerIndex === 'number' && v.answerIndex >= 0 && v.answerIndex < 4
    && !!v.source && typeof v.source.title === 'string';
}

export async function fetchQuestion(req: QuizRequest, signal?: AbortSignal): Promise<QuizQuestion> {
  if (USE_MOCK) {
    const { mockQuestion } = await import('../mocks/quiz');
    return mockQuestion(req);
  }
  // The backend contract only defines { text }; drop the UI-only title.
  const deck = typeof req.deck === 'string' ? req.deck : { text: req.deck.text };
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/api/quiz/question`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...req, deck }),
      signal,
    });
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw err;
    throw new Error("Can't reach the quiz server. Check your connection, then press Retry.");
  }
  if (!res.ok) throw new Error(`The quiz server answered with an error (${res.status}). Press Retry.`);
  const data: unknown = await res.json().catch(() => null);
  if (!isQuestion(data)) throw new Error('The quiz server sent a question in the wrong format. Press Retry.');
  return data;
}
