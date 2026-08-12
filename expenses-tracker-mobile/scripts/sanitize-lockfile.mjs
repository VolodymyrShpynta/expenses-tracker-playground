#!/usr/bin/env node
/**
 * Rewrite `package-lock.json` entries that point at a private npm mirror
 * back to the public registry.
 *
 * Why this exists: this repo is public, but installs here go through a
 * corporate proxy (`npm config get registry`), so npm records internal
 * CDN hostnames in `resolved` and legacy sha1 hashes in `integrity`.
 * Committing those leaks infrastructure names and, worse, produces a
 * lockfile nobody outside the network can `npm ci` from.
 *
 * The mirror's URL path after `…/npm/registry/` is byte-identical to the
 * public registry's, so the rewrite is a pure prefix swap. Integrity is
 * recomputed as sha512 from the tarball already sitting in the local npm
 * cache — the bytes are the same whichever mirror served them, so this
 * needs no network access (the public registry is firewalled here).
 *
 * Usage:
 *   node scripts/sanitize-lockfile.mjs           # rewrite in place
 *   node scripts/sanitize-lockfile.mjs --check   # exit 1 if dirty
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const PUBLIC_REGISTRY = 'https://registry.npmjs.org';
/** Everything a mirror puts in front of the package path. */
const MIRROR_PREFIX = /^https?:\/\/[^/]+\/.*?\/npm\/registry\//;

const lockPath = join(fileURLToPath(new URL('..', import.meta.url)), 'package-lock.json');
const checkOnly = process.argv.includes('--check');

const raw = readFileSync(lockPath, 'utf8');
const lock = JSON.parse(raw);

// npm exports its resolved cache path to lifecycle scripts; the fallbacks
// cover a direct `node scripts/…` run. Shelling out to `npm config get` is
// not an option — Node refuses to execFile a `.cmd` shim.
const cacheRoot = join(
  process.env.npm_config_cache ??
    (process.platform === 'win32'
      ? join(process.env.LOCALAPPDATA ?? homedir(), 'npm-cache')
      : join(homedir(), '.npm')),
  '_cacache',
  'content-v2',
);

const rewritten = [];
const unverified = [];

for (const [name, entry] of Object.entries(lock.packages ?? {})) {
  if (typeof entry.resolved !== 'string') continue;
  if (entry.resolved.startsWith(`${PUBLIC_REGISTRY}/`)) continue;
  const publicUrl = entry.resolved.replace(MIRROR_PREFIX, `${PUBLIC_REGISTRY}/`);
  if (publicUrl === entry.resolved) continue;

  entry.resolved = publicUrl;

  const sha512 = entry.integrity?.startsWith('sha512-')
    ? entry.integrity
    : sha512FromCache(entry.integrity);
  if (sha512) entry.integrity = sha512;
  else unverified.push(name);

  rewritten.push(name);
}

if (rewritten.length === 0) {
  console.log('OK   package-lock.json references only the public registry');
  process.exit(0);
}

if (checkOnly) {
  console.error('package-lock.json references a private npm mirror:');
  for (const name of rewritten) console.error(`  - ${name}`);
  console.error('\nRun: npm run sanitize-lock');
  process.exit(1);
}

writeFileSync(lockPath, `${JSON.stringify(lock, null, 2)}\n`);
console.log(`Rewrote ${rewritten.length} entr${rewritten.length === 1 ? 'y' : 'ies'}:`);
for (const name of rewritten) console.log(`  - ${name}`);
if (unverified.length > 0) {
  console.warn(
    `\nKept the mirror's original integrity for ${unverified.length} package(s) — ` +
      'their tarballs are not in the npm cache, so sha512 could not be derived offline:',
  );
  for (const name of unverified) console.warn(`  - ${name}`);
}

/**
 * Locate a tarball in npm's content-addressed cache by the integrity the
 * mirror reported, and re-hash it as sha512. Returns null when the cache
 * has been cleaned since the install.
 */
function sha512FromCache(integrity) {
  if (typeof integrity !== 'string' || !integrity.includes('-')) return null;
  const [algorithm, base64] = integrity.split('-');
  const hex = Buffer.from(base64, 'base64').toString('hex');
  const contentPath = join(cacheRoot, algorithm, hex.slice(0, 2), hex.slice(2, 4), hex.slice(4));
  if (!existsSync(contentPath)) return null;
  return `sha512-${createHash('sha512').update(readFileSync(contentPath)).digest('base64')}`;
}
