// SOLMAR HEAT — hand-in program (Node 22, standard library only).
//
// The game itself is the static site in game/ next to this file: open
// game/index.html in a desktop browser and it runs fully offline (three.js
// is vendored under game/vendor/, every other asset is generated at
// runtime). This program's only job is the hand-in: copy game/ and
// screenshots/ into the output directory and write dossier.json there with
// the vendored make.fun library, under the scorer's own caps.
//
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
//
// With no MAKEFUN_OUTPUT_DIR set, the output directory defaults to /output.

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const root = fileURLToPath(new URL('.', import.meta.url));
const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// Game payload first, then the screenshot set (the first file by name is
// the cover the judges see).
mkdirSync(outDir, { recursive: true });
cpSync(join(root, 'game'), join(outDir, 'game'), { recursive: true });
mkdirSync(join(outDir, 'screenshots'), { recursive: true });
if (existsSync(join(root, 'screenshots'))) {
  cpSync(join(root, 'screenshots'), join(outDir, 'screenshots'), { recursive: true });
}

// Caps mirrored from the scorer's gate: dossier text stays under 160 KiB,
// at most 4 screenshots of at most 256 KiB each, and game/ holds at most
// 993 entries / 48 MiB with no single path over 1000 bytes.
const dossier = buildDossier(outDir, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
});
writeFileSync(join(outDir, 'dossier.json'), dossier);
