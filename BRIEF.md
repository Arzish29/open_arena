TASK
This repo already has work in it from my teammates, including some game folders. Do NOT scaffold a new project and do NOT overwrite or restructure existing files.

Step 1: explore the repo (README, package.json, folder layout, each game folder). Write a short summary of what exists: framework, how games are built and launched, and which of the 5 games below already have code.
Step 2: plan how to integrate the landing page, game pages and Pip around what is already there. Wait for my approval of the plan before editing anything.

openarcade.html (in reference/) is the current landing page. Keep its look exactly: do not redesign it. Changes needed: (1) replace the game list with the 5 games below, (2) make START navigate to a full-screen game page, (3) add "Pip", a RAG guide chatbot in the bottom-right corner.

PROJECT CONTEXT
OpenArcade is a student team project built on what we learned in training: computer vision, RAG, chatbots and LLMs. It is an arcade where games are played with hand gestures, voice, or an AI quiz that reads your notes.

STACK
Use the repo's existing stack and conventions. Only add what's missing, and ask before adding a dependency. Likely additions: React Router, Three.js (landing terrain and the runner game), MediaPipe Tasks Vision HandLandmarker (hand tracking, loaded only on game pages). Use the Web Audio API for mic loudness and Canvas 2D for the other games. If the repo is plain HTML/JS rather than React, adapt the pages and Pip to that instead of converting everything. Code-split each game. Pin library versions. Prefer plain CSS with custom properties (no Tailwind, no component library) unless the repo already uses one.

EXISTING GAMES
Reuse existing game code wherever it works. Wrap it in the /play/:slug page and the shared input layer rather than rewriting it. If a game's folder name differs from my slugs, keep the folder and map it in games.ts. Don't edit another teammate's game folder beyond a thin adapter, and list every file you touch so I can tell them.

GIT
Work on a new branch (feat/landing-and-guide). Make small commits, one per stage. Never push, force-push or rewrite history.

DESIGN TOKENS (keep from the current page)
Colors: bg #07040f, bg2 #0d0620, line #2f1766, line2 #47228f, text #efe9ff, soft text #cfc4f2, cyan #19f0ff, pink #ff2bd6, coin yellow #ffe14a, violet #6a2cff, horizon #3a0b57.
Fonts (Google Fonts): Jersey 10 for display and game titles, Chakra Petch for body text, VT323 for CRT screen text and readouts.
Color means input type: cyan = hand, pink = voice, yellow = RAG/notes. Use it everywhere (list tags, placard, game page accents, bot source chips).
Single dark theme on purpose. CRT details: scanlines, vignette, slight chromatic text-shadow, power-on animation. Square corners, thick black borders with a thin inset line2 ring. No emoji, no purple-gradient SaaS cards, no Inter or Space Grotesk, no scroll-reveal fades. Respect prefers-reduced-motion everywhere.

GAMES (single source of truth in src/games.ts, one object per game: slug, title, input, players, color, shortDescription, rules[], controls[], scoring, tips[], needs ("camera" | "mic" | "none"))
List order on the cabinet: hand games first, then voice, then RAG.
1. Rail Rush (slug rail-rush), hand, 1 player. Subway-Surfers-style 3-lane endless runner in low-poly Three.js. Hand x position in the camera frame picks the lane (left/middle/right third). Raising the hand quickly = jump. Closing a fist = roll. Collect coins, dodge trains and barriers, speed rises. One hit ends the run. Score = distance + coins.
2. Hill Climb (slug hill-climb), hand, 1 player. 2D side-view car on procedurally generated hills with simple spring suspension. Open palm = gas, fist = brake/reverse, hand tilt = lean in the air. Fuel runs down, fuel cans and coins on the road. Score = distance + coins + air-time bonus.
3. Rock Paper Scissors (slug rps), hand, 1 player vs computer. Fist = rock, open palm = paper, index + middle finger = scissors. 3-2-1 countdown, then the gesture is locked on "shoot". Best of 5. Show the live detected gesture with a confidence bar. Fallback buttons if the camera fails.
4. Scream Chicken (slug scream-chicken), voice, 1 player. A pixel chicken on a side-scrolling course with gaps and walls. Mic loudness drives it: quiet = idle, medium = walk, loud = jump (louder = higher). A 2-second noise-floor calibration at start and a sensitivity slider on the Ready screen.
5. AI Quiz Battle (slug quiz-battle), RAG, 1 player vs AI (2-player local as an option). Choose a deck: Computer Vision, RAG, Chatbots, LLMs, or "My notes" (paste text or upload a PDF). 10 questions, 15-second timer, 4 options, keys 1-4 or click (optionally point with the index finger and hold 1s). HP bars for both sides, faster correct answers do more damage. Every question shows a source chip ("notes_week3.pdf p.4"). Calls POST /api/quiz/question.
Use original names and art for everything. No copyrighted assets or logos.

ROUTES
/ landing page (existing design). /play/:slug full-screen game page. Unknown slug: a CRT-style "Game not found" screen with a link back to /.
Landing page changes: HUD says "5 GAMES". Update the "Three ways to control a game" section so each input type lists the right games (hand: Rail Rush, Hill Climb, Rock Paper Scissors; voice: Scream Chicken; notes: AI Quiz Battle). Add 5 new pixel-art attract demos on the 256x192 preview canvas, in the same pixel style as now: Rail Rush (3 lanes in perspective, runner switching lanes, coins, small hand icon pointing left/right), Hill Climb (car on scrolling hills, open-palm/fist icon toggling), Rock Paper Scissors (two pixel hands cycling rock/paper/scissors with a 3-2-1 countdown), Scream Chicken (chicken hopping gaps, mic bar rising with each jump), Quiz Battle (reuse the existing Quiz Duel demo). Remove the old "START = take control" mode. START (button, Enter key) now navigates to /play/<selected slug>. Remember the last selected game in sessionStorage so Back returns to it.

GAME PAGE (/play/:slug)
- 100dvh, no scroll, black background, canvas letterboxed to 16:9. On portrait phones show a "rotate your phone" screen.
- Ready screen (CRT-styled overlay): game title in Jersey 10, 3 lines of rules from games.ts, what it needs (camera / mic / nothing), and one big START button. On that click, in this order: request fullscreen (fullscreen needs a user gesture and does not carry across page loads, which is why we do it here), then getUserMedia for what the game needs, then init MediaPipe. If fullscreen is refused, continue windowed. Camera: show a small mirrored preview (about 160px) in a corner with landmark dots and a "hand found / no hand" light. Mic: show a level meter.
- Permission errors in plain words with a fix ("Camera blocked. Click the camera icon in the address bar, allow it, then press Start again") and a "Play with keyboard instead" option.
- Then a 3-2-1 countdown in pixel type, then play.
- HUD overlay: score top-left; pause, mute, fullscreen toggle, rules (opens Pip) and exit top-right. Esc pauses. Pause menu: Resume, Restart, Rules, Exit.
- Game over: score, best score (localStorage per game), Retry, Back to arcade.
- On unmount or exit: stop all camera and mic tracks and leave fullscreen.
- Input layer: src/input/hand.ts exposes { present, x, y, gesture: "open" | "fist" | "peace" | "point", jumpEvent, tilt }. src/input/mic.ts exposes { level, smoothed, noiseFloor }. Every game also works with the keyboard (arrows, space, 1-4) so the team can develop without a camera. ?debug=1 shows landmarks and raw numbers.
- Hand model runs at 30fps or better on its own loop, games target 60fps.

PIP, THE GUIDE BOT
Closed state: fixed bottom-right (add env(safe-area-inset-*)), a 64px circle button on the landing page and game pages. Pixel-art smiley: a 16x16 grid scaled up with crisp edges, yellow disc (#ffe14a) with a darker rim, two square eyes, a pixel smile, soft neon glow, and a small ground shadow that shrinks and grows as it bounces.
- Bounce: about 1.2s loop with squash-and-stretch (slightly flatter on landing), then a short rest before the next bounce.
- Blink: eyes collapse to a 1px line for about 140ms at random 2.5-6s intervals, with an occasional double blink.
- Hover: eyes look toward the cursor and the bounce speeds up slightly.
- After 10s of no interaction on the landing page, show a small speech bubble once: "Need the rules?" for 5s.
- Reduced motion: no bounce, keep slow blinks.
Open state: panel above the button (380px wide, min(560px, 80dvh) tall). On phones it becomes a full-width bottom sheet at 85dvh. Styled as a mini CRT: thick black border, inset line2 ring, subtle scanlines at low opacity (text must stay crisp). Header: small face (no bounce, still blinks; eyes dart while "thinking"), "PIP · GAME GUIDE" in Jersey 10, clear-chat and close buttons.
Messages: bot messages on a dark panel, user messages with a cyan outline, square corners, Chakra Petch 15px body, VT323 for labels. Bot answers stream in with a blinking block cursor. While waiting: three pixel dots. Under each bot answer, source chips colored by input type ("Rock Paper Scissors · Controls"); clicking one expands the retrieved snippet. If no source was retrieved, show a "no source found" tag and the bot says it only knows OpenArcade rules.
Empty state greeting: "Hi, I'm Pip. Ask me how any game works, which controls it needs, or what to do if your camera isn't picked up." Under it, 4 suggestion chips: "How do I play Rock Paper Scissors?", "Which games need a microphone?", "My camera isn't detected", "Where do the quiz questions come from?". On /play/:slug the chips and the request are scoped to that game.
Behavior: Enter sends, Shift+Enter adds a new line, Stop button while streaming, Esc closes, focus goes to the input on open and back to the bot button on close, role="dialog", aria-live="polite" on the log, visible focus states. Keep the last 6 turns as history. Persist the chat in sessionStorage. On a network error show "I can't reach the rules server. Try again, or read the rules on the Ready screen." with a Retry button.

RAG API CONTRACT (backend is built by teammates; frontend only calls it)
POST /api/chat, body { message, history: [{role, content}], gameSlug?: string }. Response as SSE (text/event-stream) with events {type:"token", text}, {type:"sources", sources:[{id, title, game, section, snippet}]}, {type:"done"}. Also accept a plain JSON { answer, sources } response.
POST /api/quiz/question, body { deck: string | { text: string }, difficulty, askedIds: string[] }. Response { id, question, options: string[4], answerIndex, explanation, source: { title, page } }.
Env: VITE_API_BASE and VITE_USE_MOCK (or the repo's equivalent). With mock mode on, use src/mocks: the chat mock keyword-matches games.ts and streams fake tokens at about 30 chars/sec, with sources; the quiz mock holds 15 questions across CV, RAG, chatbots and LLMs. The app must be fully demo-able in mock mode.
Add an npm script (export-kb) that writes knowledge/<slug>.md for each game from games.ts (rules, controls, scoring, tips, troubleshooting), so the RAG ingestion and the UI use the same text.

QUALITY BAR
Responsive from 360px up, keyboard accessible, no horizontal scroll, no lorem ipsum, copy written for players (plain verbs, sentence case, errors say what happened and how to fix it). All art drawn in code, no external images.

DELIVER
The changes as small commits on the branch, one per stage, in this order: (1) games.ts and the landing page update, (2) game page shell with the Ready screen and input layer, (3) the games, Rock Paper Scissors first, (4) Pip and the mock API. Also add a README section covering run steps, how to switch off mock mode, and how to connect the backend. After each stage, stop and tell me what to test in the browser.