#!/usr/bin/env node
/**
 * Compares every locale JSON in expenses-tracker-frontend/src/i18n/locales/
 * against the canonical en.json. Reports any missing keys (translation will
 * fall back to English) and any extra keys (likely typo / orphan).
 *
 * Wired into `npm run typecheck` via the `check-locales` script in
 * package.json, so a missing or stray key fails the standard pre-push check.
 * Run directly with `npm run check-locales` (or `node scripts/check-locale-parity.mjs`).
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const LOCALES_DIR = resolve(HERE, '..', '..', 'expenses-tracker-frontend', 'src', 'i18n', 'locales');

function flatten(obj, prefix = '') {
  const out = new Set();
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      for (const child of flatten(v, key)) out.add(child);
    } else {
      out.add(key);
    }
  }
  return out;
}

const en = JSON.parse(readFileSync(join(LOCALES_DIR, 'en.json'), 'utf8'));
const enKeys = flatten(en);

let issues = 0;
const files = readdirSync(LOCALES_DIR).filter((f) => f.endsWith('.json') && f !== 'en.json').sort();
for (const file of files) {
  const data = JSON.parse(readFileSync(join(LOCALES_DIR, file), 'utf8'));
  const keys = flatten(data);
  const missing = [...enKeys].filter((k) => !keys.has(k));
  const extra = [...keys].filter((k) => !enKeys.has(k));
  if (missing.length === 0 && extra.length === 0) {
    console.log(`OK   ${file} (${keys.size} keys)`);
  } else {
    issues++;
    console.log(`FAIL ${file} (${keys.size} keys)`);
    if (missing.length) console.log(`  missing: ${missing.join(', ')}`);
    if (extra.length) console.log(`  extra:   ${extra.join(', ')}`);
  }
}
process.exit(issues === 0 ? 0 : 1);
