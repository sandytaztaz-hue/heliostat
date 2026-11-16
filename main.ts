// main.ts — HELIOSTAT entrypoint (Node 22 stdlib only). Copies game/ and
// screenshots/ from beside this file into /output (or MAKEFUN_OUTPUT_DIR
// outside the grader) and writes /output/dossier.json via buildDossier from
// vendor/makefun-threejs.ts, with the gate caps from RULES.txt.

import { buildDossier } from './vendor/makefun-threejs.ts';
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(process.env.MAKEFUN_OUTPUT_DIR ?? '/output');

const gameSrc = join(root, 'game');
const shotsSrc = join(root, 'screenshots');

if (!existsSync(gameSrc)) throw new Error('main.ts: no game/ beside main.ts');
if (!existsSync(shotsSrc)) throw new Error('main.ts: no screenshots/ beside main.ts');

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

cpSync(gameSrc, join(outDir, 'game'), { recursive: true, dereference: false });
cpSync(shotsSrc, join(outDir, 'screenshots'), { recursive: true, dereference: false });

const dossier = buildDossier(outDir, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
});

writeFileSync(join(outDir, 'dossier.json'), dossier);
console.log('heliostat: wrote ' + join(outDir, 'dossier.json') + ' (' + dossier.length + ' bytes)');
console.log('heliostat: game + screenshots copied to ' + outDir);
