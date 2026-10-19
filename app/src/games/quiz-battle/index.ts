// AI Quiz Battle: 10 questions from a deck or your own notes, against the AI or a friend.
// Faster right answers do more damage. Questions come from POST /api/quiz/question.
import { fetchQuestion, type Deck, type QuizQuestion } from '../../api/quiz';
import type { GameContext, GameInstance } from '../../play/types';
import './quiz.css';

export const countdown = false; // the deck picker comes first

const QUESTIONS = 10;
const TIME = 15;
const HP = 100;
const DECKS = [
  { id: 'cv', label: 'Computer Vision' },
  { id: 'rag', label: 'RAG' },
  { id: 'chatbots', label: 'Chatbots' },
  { id: 'llms', label: 'LLMs' },
  { id: 'notes', label: 'My notes' },
];
const P1_KEYS = ['Digit1', 'Digit2', 'Digit3', 'Digit4'];
const P2_KEYS = ['Digit7', 'Digit8', 'Digit9', 'Digit0'];

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const damageFor = (left: number) => Math.round(8 + 12 * (left / TIME));

interface Side { hp: number; dealt: number; pick: number | null; at: number; }

export function create(ctx: GameContext): GameInstance {
  const root = document.createElement('div');
  root.className = 'qb';
  ctx.view.appendChild(root);

  let phase: 'setup' | 'loading' | 'question' | 'reveal' | 'error' | 'done' = 'setup';
  let deckId = 'rag', twoPlayer = false, notes = '', notesTitle = 'Your notes';
  let q: QuizQuestion | null = null, qn = 0, left = TIME, revealT = 0, aiAt = 0, aiRight = false;
  let abort: AbortController | null = null;
  const asked: string[] = [];
  const p1: Side = { hp: HP, dealt: 0, pick: null, at: 0 };
  const p2: Side = { hp: HP, dealt: 0, pick: null, at: 0 };
  const name2 = () => (twoPlayer ? 'P2' : 'AI');

  /* ---------- setup ---------- */
  function renderSetup(status = '') {
    root.innerHTML = `
      <div class="qb-setup">
        <h2 class="qb-h">Choose a deck</h2>
        <div class="qb-decks" role="radiogroup" aria-label="Deck">
          ${DECKS.map((d) => `<button type="button" role="radio" aria-checked="${d.id === deckId}" data-deck="${d.id}">${d.label}</button>`).join('')}
        </div>
        <div class="qb-notes" ${deckId === 'notes' ? '' : 'hidden'}>
          <label for="qbText">Paste your notes</label>
          <textarea id="qbText" rows="5" placeholder="Paste a few paragraphs from your lecture notes.">${esc(notes)}</textarea>
          <label class="qb-file">Or upload a PDF or text file <input type="file" id="qbFile" accept=".pdf,.txt,.md,application/pdf,text/plain"></label>
          <p class="qb-status" id="qbStatus" aria-live="polite">${esc(status)}</p>
        </div>
        <div class="qb-mode" role="radiogroup" aria-label="Players">
          <button type="button" role="radio" aria-checked="${!twoPlayer}" data-mode="1">1 player vs AI</button>
          <button type="button" role="radio" aria-checked="${twoPlayer}" data-mode="2">2 players</button>
        </div>
        <p class="qb-hint">${twoPlayer ? 'Player 1 answers with 1 to 4. Player 2 answers with 7, 8, 9 and 0.' : 'Answer with keys 1 to 4 or click. The AI answers too.'}</p>
        <button type="button" class="qb-go" data-act="go">Start battle</button>
      </div>`;
    root.querySelector<HTMLElement>('[aria-checked="true"]')?.focus();
  }

  root.addEventListener('click', async (e) => {
    const el = (e.target as HTMLElement).closest<HTMLElement>('button');
    if (!el) return;
    if (el.dataset.deck) {
      notes = root.querySelector<HTMLTextAreaElement>('#qbText')?.value ?? notes;
      deckId = el.dataset.deck;
      renderSetup();
    } else if (el.dataset.mode) {
      notes = root.querySelector<HTMLTextAreaElement>('#qbText')?.value ?? notes;
      twoPlayer = el.dataset.mode === '2';
      renderSetup();
    } else if (el.dataset.act === 'go') {
      notes = root.querySelector<HTMLTextAreaElement>('#qbText')?.value ?? notes;
      if (deckId === 'notes' && notes.trim().split(/\s+/).length < 40) {
        renderSetup('Add a bit more: at least 40 words of notes, or upload a file.');
        return;
      }
      void next();
    } else if (el.dataset.act === 'retry') {
      void next();
    } else if (el.dataset.opt && phase === 'question') {
      answer(p1, Number(el.dataset.opt));
    }
  });

  root.addEventListener('change', async (e) => {
    const input = e.target as HTMLInputElement;
    if (input.id !== 'qbFile' || !input.files?.[0]) return;
    const file = input.files[0];
    const status = root.querySelector('#qbStatus')!;
    status.textContent = `Reading ${file.name}...`;
    try {
      if (/\.pdf$/i.test(file.name) || file.type === 'application/pdf') {
        const { pdfToText } = await import('./pdf');
        notes = await pdfToText(file);
      } else {
        notes = await file.text();
      }
      notesTitle = file.name;
      const words = notes.split(/\s+/).length;
      renderSetup(words < 40
        ? `${file.name} has almost no text. If it is a scan, paste the text instead.`
        : `Loaded ${file.name}: about ${words} words.`);
    } catch {
      renderSetup(`Couldn't read ${file.name}. Try another file, or paste the text.`);
    }
  });

  /* ---------- battle ---------- */
  function deck(): Deck {
    return deckId === 'notes' ? { text: notes, title: notesTitle } : deckId;
  }

  async function next() {
    if (qn >= QUESTIONS || p1.hp <= 0 || p2.hp <= 0) return finish();
    phase = 'loading';
    root.innerHTML = `${bars()}<p class="qb-wait">Writing question ${qn + 1}...</p>`;
    abort = new AbortController();
    try {
      q = await fetchQuestion({ deck: deck(), difficulty: 'normal', askedIds: asked }, abort.signal);
    } catch (err) {
      if ((err as Error).name === 'AbortError') return;
      phase = 'error';
      root.innerHTML = `${bars()}<div class="qb-err" role="alert"><p>${esc((err as Error).message)}</p>
        <button type="button" class="qb-go" data-act="retry">Retry</button></div>`;
      root.querySelector<HTMLElement>('.qb-go')?.focus();
      return;
    }
    asked.push(q.id);
    qn++;
    left = TIME;
    p1.pick = p2.pick = null;
    aiAt = TIME - (3 + Math.random() * 8);
    aiRight = Math.random() < 0.6;
    phase = 'question';
    renderQuestion();
  }

  function bars() {
    const bar = (label: string, s: Side, cls: string) =>
      `<div class="qb-side ${cls}"><span>${label}</span><div class="qb-hp" role="meter" aria-label="${label} HP" aria-valuemin="0" aria-valuemax="${HP}" aria-valuenow="${s.hp}"><i style="width:${(s.hp / HP) * 100}%"></i></div><b>${s.hp}</b></div>`;
    return `<div class="qb-top">${bar('P1', p1, 'p1')}<span class="qb-n">Q ${Math.max(qn, 1)}/${QUESTIONS}</span>${bar(name2(), p2, 'p2')}</div>`;
  }

  function renderQuestion() {
    if (!q) return;
    const keys2 = ['7', '8', '9', '0'];
    root.innerHTML = `
      ${bars()}
      <div class="qb-timer"><i id="qbTime"></i></div>
      <h2 class="qb-q" id="qbQ">${esc(q.question)}</h2>
      <div class="qb-opts" role="group" aria-labelledby="qbQ">
        ${q.options.map((o, i) => `<button type="button" class="qb-opt" data-opt="${i}"><b>${i + 1}${twoPlayer ? ` / ${keys2[i]}` : ''}</b><span>${esc(o)}</span><em></em></button>`).join('')}
      </div>
      <div class="qb-foot"><span class="qb-chip" title="Where this question came from">${esc(q.source.title)} p.${esc(String(q.source.page))}</span><span class="qb-locks" id="qbLocks"></span></div>`;
    updateLive();
  }

  function updateLive() {
    const bar = root.querySelector<HTMLElement>('#qbTime');
    if (bar) bar.style.width = `${(left / TIME) * 100}%`;
    const locks = root.querySelector('#qbLocks');
    if (locks) {
      const txt = [p1.pick !== null ? 'P1 LOCKED' : '', p2.pick !== null ? `${name2()} LOCKED` : ''].filter(Boolean).join(' · ');
      if (locks.textContent !== txt) locks.textContent = txt;
    }
  }

  function answer(side: Side, i: number) {
    if (side.pick !== null || phase !== 'question') return;
    side.pick = i;
    side.at = left;
    ctx.sound.beep(side === p1 ? 660 : 520, 0.05);
    root.querySelector(`[data-opt="${i}"]`)?.classList.add(side === p1 ? 'pick1' : 'pick2');
    if (p1.pick !== null && p2.pick !== null) reveal();
  }

  function reveal() {
    if (!q) return;
    phase = 'reveal';
    revealT = 0;
    const lines: string[] = [];
    const hit = (from: Side, to: Side, who: string) => {
      if (from.pick === q!.answerIndex) {
        const d = damageFor(from.at);
        to.hp = Math.max(0, to.hp - d);
        from.dealt += d;
        lines.push(`${who} hits for ${d}`);
      }
    };
    hit(p1, p2, 'P1');
    hit(p2, p1, name2());
    ctx.sound.beep(p1.pick === q.answerIndex ? 880 : 200, 0.15);
    root.querySelectorAll<HTMLButtonElement>('.qb-opt').forEach((b, i) => {
      b.disabled = true;
      if (i === q!.answerIndex) b.classList.add('right');
      else if (i === p1.pick || i === p2.pick) b.classList.add('wrong');
      const tags = [i === p1.pick ? 'P1' : '', i === p2.pick ? name2() : ''].filter(Boolean).join(' ');
      b.querySelector('em')!.textContent = tags;
    });
    root.querySelector('.qb-top')!.outerHTML = bars();
    const box = document.createElement('p');
    box.className = 'qb-explain';
    box.setAttribute('role', 'status');
    box.textContent = `${lines.length ? lines.join('. ') + '. ' : 'No hits. '}${q.explanation}`;
    root.querySelector('.qb-foot')!.before(box);
    ctx.setScore(score());
  }

  const score = () => p1.dealt + (p1.hp > 0 && (qn >= QUESTIONS || p2.hp <= 0) ? p1.hp : 0);

  function finish() {
    phase = 'done';
    const final = score();
    ctx.setScore(final);
    const note = p1.hp === p2.hp && p1.dealt === p2.dealt ? 'A draw.'
      : p1.hp > p2.hp || (p1.hp === p2.hp && p1.dealt > p2.dealt) ? 'Player 1 wins the battle.'
      : twoPlayer ? 'Player 2 wins the battle.' : 'The AI wins this time.';
    ctx.gameOver(final, note);
  }

  renderSetup();

  return {
    update(dt) {
      if (phase === 'question') {
        left = Math.max(0, left - dt);
        P1_KEYS.forEach((k, i) => { if (ctx.keys.pressed(k)) answer(p1, i); });
        if (twoPlayer) P2_KEYS.forEach((k, i) => { if (ctx.keys.pressed(k)) answer(p2, i); });
        else if (p2.pick === null && left <= aiAt && q) {
          const wrong = [0, 1, 2, 3].filter((i) => i !== q!.answerIndex);
          answer(p2, aiRight ? q.answerIndex : wrong[Math.floor(Math.random() * 3)]);
        }
        if (phase === 'question') {
          if (left <= 0) reveal();
          else updateLive();
        }
      } else if (phase === 'reveal') {
        revealT += dt;
        if (revealT > 3.2 || ctx.keys.pressed('Space') || ctx.keys.pressed('Enter')) void next();
      }
    },
    destroy() {
      abort?.abort();
      root.remove();
    },
  };
}
