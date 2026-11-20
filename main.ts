import { cpSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-frontend.ts';

const root = fileURLToPath(new URL('.', import.meta.url));
const output = resolve(process.env.MAKEFUN_OUTPUT_DIR || '/output');
const releaseDirectories = ['app', 'screenshots'] as const;
mkdirSync(output, { recursive: true });
for (const name of releaseDirectories) {
  const source = join(root, name);
  const destination = join(output, name);
  if (source === destination) throw new Error('Choose a separate output directory.');
  cpSync(source, destination, { recursive: true });
}

const packed = buildDossier(output, {
  text_max_bytes: 160 * 1024,
  screenshots: { max: 4, max_bytes: 256 * 1024 },
  app_max_files: 993,
  app_max_bytes: 48 * 1024 * 1024,
});
writeFileSync(join(output, 'dossier.json'), packed);
