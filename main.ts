import { cpSync, mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve, join } from 'node:path';
import { buildDossier } from './vendor/makefun-frontend.ts';

const repository = fileURLToPath(new URL('.', import.meta.url));
const outputDirectory = resolve(process.env.MAKEFUN_OUTPUT_DIR ?? '/output');
mkdirSync(outputDirectory, { recursive: true });
for (const directory of ['app', 'screenshots']) {
  cpSync(join(repository, directory), join(outputDirectory, directory), { recursive: true });
}
const dossier = buildDossier(outputDirectory, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  app_max_files: 993,
  app_max_bytes: 50331648,
});
writeFileSync(join(outputDirectory, 'dossier.json'), dossier);
