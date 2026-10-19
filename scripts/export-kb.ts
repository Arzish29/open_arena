// npm run export-kb: writes knowledge/<slug>.md for every game in app/src/games.ts,
// so the RAG ingestion and the UI use the same text. Re-run it after editing games.ts.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GAMES, INPUT_META } from '../app/src/games';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'knowledge');
mkdirSync(outDir, { recursive: true });

const NEEDS = { camera: 'A webcam', mic: 'A microphone', none: 'Nothing but a keyboard or mouse' };
const bullets = (items: string[]) => items.map((s) => `- ${s}`).join('\n');

for (const g of GAMES) {
  const md = `---
slug: ${g.slug}
title: ${g.title}
input: ${g.input}
players: ${g.players}
needs: ${g.needs}
---

# ${g.title}

${g.shortDescription}

Input: ${INPUT_META[g.input].label}. Players: ${g.players}. Needs: ${NEEDS[g.needs]}.
Play it at /play/${g.slug}.

## Rules

${bullets(g.rules)}

## Controls

${bullets(g.controls)}

## Scoring

${g.scoring}

## Tips

${bullets(g.tips)}

## Troubleshooting

${bullets(g.troubleshooting)}
`;
  writeFileSync(join(outDir, `${g.slug}.md`), md);
  console.log(`wrote knowledge/${g.slug}.md`);
}
