import { cpSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-frontend.ts';

const repository = fileURLToPath(new URL('.', import.meta.url));
const outputDirectory = resolve(process.env.MAKEFUN_OUTPUT_DIR || '/output');

function assertCatalogCoverage() {
  const catalog = JSON.parse(readFileSync(join(repository, 'app/data/trophies.json'), 'utf8'));
  const records = catalog.trophies;
  if (!Array.isArray(records) || records.length !== 55) throw new Error('The PS5 catalog must contain 55 trophies.');
  if (new Set(records.map((record) => record.name)).size !== 55) throw new Error('Trophy names must be unique.');
  const expectedGrades = { platinum: 1, gold: 2, silver: 6, bronze: 46 };
  for (const [grade, expected] of Object.entries(expectedGrades)) {
    if (records.filter((record) => record.grade === grade).length !== expected) throw new Error(`Incorrect ${grade} total.`);
  }
  if (records.filter((record) => record.hidden).length !== 28) throw new Error('Expected 28 PSN-hidden trophies.');
  const sourceIds = new Set(catalog.sources.map((source) => source.id));
  for (const record of records) {
    if (!record.guide?.trim() || !record.description?.trim()) throw new Error(`Missing guide or official description: ${record.name}`);
    if (!record.steps?.length) throw new Error(`No steps: ${record.name}`);
    for (const step of record.steps) {
      if (!step.text?.trim() || !step.sources?.length || step.sources.some((id) => !sourceIds.has(id))) {
        throw new Error(`Uncited or incomplete guidance: ${record.name}`);
      }
    }
  }
}

function assertCaptureManifest() {
  const manifest = JSON.parse(readFileSync(join(repository, 'shots.json'), 'utf8'));
  const screenshots = readdirSync(join(repository, 'screenshots')).filter((name) => !name.startsWith('.')).sort();
  const planned = manifest.map((shot) => shot.file).sort();
  if (screenshots.length !== 4 || JSON.stringify(screenshots) !== JSON.stringify(planned)) {
    throw new Error('The four browser screenshots must match shots.json.');
  }
}

assertCatalogCoverage();
assertCaptureManifest();
if (outputDirectory === resolve(repository)) throw new Error('The output must be separate from the repository.');
mkdirSync(outputDirectory, { recursive: true });
for (const directory of ['app', 'screenshots']) {
  cpSync(join(repository, directory), join(outputDirectory, directory), { recursive: true });
}
const dossier = buildDossier(outputDirectory, {
  text_max_bytes: 160 * 1024,
  screenshots: { max: 4, max_bytes: 256 * 1024 },
  app_max_files: 993,
  app_max_bytes: 48 * 1024 * 1024,
});
writeFileSync(join(outputDirectory, 'dossier.json'), dossier);
