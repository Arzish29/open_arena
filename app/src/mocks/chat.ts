// Mock for POST /api/chat: keyword-matches games.ts and streams the answer at ~30 chars/sec,
// with sources, so Pip is fully demo-able without the RAG backend.
import type { ChatHandlers, ChatRequest, Source } from '../api/chat';
import { GAMES, type Game } from '../games';

interface Chunk { source: Source; text: string; words: Set<string>; }

const words = (s: string) => new Set(s.toLowerCase().match(/[a-z0-9]+/g) ?? []);
const list = (items: string[]) => items.map((s) => `- ${s}`).join('\n');

function chunksFor(g: Game): Chunk[] {
  const sections: [string, string][] = [
    ['Rules', g.rules.join(' ')],
    ['Controls', list(g.controls)],
    ['Scoring', g.scoring],
    ['Tips', list(g.tips)],
    ['Troubleshooting', list(g.troubleshooting)],
  ];
  return sections.map(([section, text]) => ({
    source: { id: `${g.slug}#${section.toLowerCase()}`, title: g.title, game: g.slug, section, snippet: text },
    text,
    words: words(`${g.title} ${g.slug} ${section} ${text}`),
  }));
}

const CHUNKS = GAMES.flatMap(chunksFor);

function mentioned(q: string): Game | undefined {
  const lq = q.toLowerCase();
  return GAMES.find((g) => lq.includes(g.title.toLowerCase()) || lq.includes(g.slug.replace('-', ' '))
    || (g.slug === 'rps' && /\brps\b|rock|paper|scissor/.test(lq))
    || (g.slug === 'quiz-battle' && /\bquiz\b/.test(lq))
    || (g.slug === 'scream-chicken' && /chicken/.test(lq))
    || (g.slug === 'rail-rush' && /runner|rail/.test(lq))
    || (g.slug === 'hill-climb' && /\bcar\b|hill/.test(lq)));
}

function pick(game: Game, section: string): Chunk {
  return CHUNKS.find((c) => c.source.game === game.slug && c.source.section === section)!;
}

/** Builds an answer and its sources from the question, the way the real RAG backend would. */
export function answerFor(message: string, gameSlug?: string): { answer: string; sources: Source[] } {
  const q = message.toLowerCase();
  const scoped = GAMES.find((g) => g.slug === gameSlug);
  const game = mentioned(q) ?? scoped;

  if (/\bmic|microphone|voice\b/.test(q) && /which|what games|list/.test(q)) {
    const mic = GAMES.filter((g) => g.needs === 'mic');
    return {
      answer: `${mic.map((g) => g.title).join(' and ')} ${mic.length > 1 ? 'need' : 'needs'} a microphone. ${mic.map((g) => g.rules[0]).join(' ')} If you don't have a mic, choose "Play with keyboard instead" on the Ready screen.`,
      sources: mic.map((g) => pick(g, 'Rules').source),
    };
  }
  if (/\bcamera|webcam\b/.test(q) && /which|what games|list/.test(q)) {
    const cam = GAMES.filter((g) => g.needs === 'camera');
    return {
      answer: `These games use your camera: ${cam.map((g) => g.title).join(', ')}. Each one also works with the keyboard.`,
      sources: cam.map((g) => pick(g, 'Controls').source),
    };
  }
  if (/camera|webcam|hand/.test(q) && /detect|work|see|found|black|blocked|not|isn/.test(q)) {
    const g = game && game.needs === 'camera' ? game : GAMES[0];
    return { answer: `Here is what usually fixes it:\n${list(g.troubleshooting)}`, sources: [pick(g, 'Troubleshooting').source] };
  }
  if (/mic|microphone|voice|hear/.test(q) && /detect|work|hear|pick|not|isn|quiet|loud/.test(q)) {
    const g = GAMES.find((x) => x.needs === 'mic')!;
    return { answer: `Try these:\n${list(g.troubleshooting)}`, sources: [pick(g, 'Troubleshooting').source] };
  }
  if (/question|quiz/.test(q) && /come from|where|source|written|made|how/.test(q)) {
    const g = GAMES.find((x) => x.slug === 'quiz-battle')!;
    return {
      answer: `AI Quiz Battle writes each question from a deck or from your own notes. Your notes are split into passages, the passages closest to the topic are retrieved, and an LLM writes a question with four options from them. Every question shows a source chip with the file and page it came from. ${g.rules[0]}`,
      sources: [pick(g, 'Rules').source, pick(g, 'Tips').source],
    };
  }
  if (game) {
    if (/score|point|win|best/.test(q)) return { answer: game.scoring, sources: [pick(game, 'Scoring').source] };
    if (/tip|better|trick|hard|beat/.test(q)) return { answer: `Some tips for ${game.title}:\n${list(game.tips)}`, sources: [pick(game, 'Tips').source] };
    if (/need|require|camera|mic|equipment/.test(q)) {
      const needs = { camera: 'your camera', mic: 'your microphone', none: 'nothing but a keyboard or mouse' }[game.needs];
      return { answer: `${game.title} needs ${needs}. ${game.needs !== 'none' ? 'You can also choose "Play with keyboard instead" on the Ready screen.' : ''}`.trim(), sources: [pick(game, 'Controls').source] };
    }
    if (/control|key|button|gesture|move|jump|how/.test(q) || mentioned(q)) {
      return {
        answer: `${game.title}: ${game.shortDescription}\n${game.rules.join(' ')}\n\nControls:\n${list(game.controls)}`,
        sources: [pick(game, 'Rules').source, pick(game, 'Controls').source],
      };
    }
  }

  // Fallback: plain keyword overlap, like a tiny retriever.
  const qw = words(q);
  const scored = CHUNKS.map((c) => ({ c, s: [...qw].filter((w) => w.length > 3 && c.words.has(w)).length + (c.source.game === gameSlug ? 0.5 : 0) }))
    .filter((x) => x.s >= 1.5)
    .sort((a, b) => b.s - a.s);
  if (scored.length) {
    const best = scored[0].c;
    return { answer: `From the ${best.source.title} ${best.source.section.toLowerCase()}:\n${best.text}`, sources: [best.source] };
  }
  return {
    answer: "I couldn't find that in the OpenArcade rules. I only know how the games here work: rules, controls, scoring and fixing camera or mic problems. Try asking about one of the games.",
    sources: [],
  };
}

const wait = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const id = setTimeout(resolve, ms);
    signal.addEventListener('abort', () => { clearTimeout(id); reject(new DOMException('Aborted', 'AbortError')); }, { once: true });
  });

export async function mockChat(req: ChatRequest, h: ChatHandlers, signal: AbortSignal): Promise<void> {
  const { answer, sources } = answerFor(req.message, req.gameSlug);
  await wait(500, signal); // "retrieving"
  // ~30 characters per second, a few characters at a time.
  for (let i = 0; i < answer.length; i += 3) {
    h.onToken(answer.slice(i, i + 3));
    await wait(100, signal);
  }
  h.onSources(sources);
}
