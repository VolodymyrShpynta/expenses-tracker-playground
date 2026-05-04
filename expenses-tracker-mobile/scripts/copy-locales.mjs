/**
 * Copy locale JSON files from the web frontend into the mobile module so
 * both clients render the same key set verbatim.
 *
 * Run on demand (`npm run copy-locales`) and as a `prebuild` hook so EAS
 * builds always pick up the latest copy. NOT a symlink — Windows symlink
 * support is unreliable, and EAS Build's macOS workers checkout from git
 * which strips symlinks anyway.
 *
 * If the web frontend's i18n changes its keys, the mobile module must
 * follow in the same commit. The `copy` step is a manual sync, NOT a
 * generator — divergence is a code-review concern.
 */
import { copyFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const SOURCE = join(ROOT, '..', 'expenses-tracker-frontend', 'src', 'i18n', 'locales');
const TARGET = join(ROOT, 'src', 'i18n', 'locales');

const LOCALES = ['en.json', 'cs.json', 'uk.json'];

await mkdir(TARGET, { recursive: true });

for (const locale of LOCALES) {
  await copyFile(join(SOURCE, locale), join(TARGET, locale));
  console.log(`Copied ${locale}`);
}
