// Dustline Protocol — the entrypoint (Node 22, standard library only).
// The game itself is plain static files under game/; this program only hands
// them in. It copies game/ and screenshots/ from beside this file into the
// output directory and writes /output/dossier.json with the vendored make.fun
// library, which the scorer re-runs and compares byte for byte.
//
//   MAKEFUN_OUTPUT_DIR=out node main.ts
//
// Outside the grader, MAKEFUN_OUTPUT_DIR stands in for /output; inside the
// grader it is unset and the program writes /output directly.
import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-threejs.ts';

const repoRoot = fileURLToPath(new URL('.', import.meta.url));
const outputDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
const gameDir = join(repoRoot, 'game');
const shotsDir = join(repoRoot, 'screenshots');

mkdirSync(outputDir, { recursive: true });
cpSync(gameDir, join(outputDir, 'game'), { recursive: true });
mkdirSync(join(outputDir, 'screenshots'), { recursive: true });
if (existsSync(shotsDir)) {
  cpSync(shotsDir, join(outputDir, 'screenshots'), { recursive: true });
}

// Caps mirror the bounty gate: the text cap shapes the dossier's bytes, the
// rest refuse an entry the scorer would refuse anyway (too many screenshots,
// a screenshot over 256 KiB, game/ over 993 files or 48 MiB).
const dossier = buildDossier(outputDir, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
});
writeFileSync(join(outputDir, 'dossier.json'), dossier);
