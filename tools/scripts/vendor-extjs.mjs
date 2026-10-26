#!/usr/bin/env node
/**
 * Vendors the public GPL build of Ext JS (6.2.0, the last one on cdnjs) for
 * the `blotter` remote. It handles that build only: a commercially licensed
 * build is copied in by hand, as described in apps/blotter/README.md under
 * "Using a licensed Ext JS build".
 *
 * Integrity model:
 *  - JS/CSS files are verified against the SRI hashes published by cdnjs.
 *  - Every file's sha256 is recorded in `extjs.lock.json`. Subsequent runs
 *    verify downloads against the lock (trust-on-first-use, then pinned), so a
 *    tampered CDN response fails the script instead of landing in the build.
 *
 * Usage: node tools/scripts/vendor-extjs.mjs [--force]
 */
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const EXTJS_VERSION = '6.2.0';
const API_URL = `https://api.cdnjs.com/libraries/extjs/${EXTJS_VERSION}?fields=files,sri`;
const CDN_BASE = `https://cdnjs.cloudflare.com/ajax/libs/extjs/${EXTJS_VERSION}/`;

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const outDir = join(root, 'apps/blotter/public/vendor/extjs', EXTJS_VERSION);
const lockPath = join(root, 'apps/blotter/extjs.lock.json');
const force = process.argv.includes('--force');

/**
 * Runtime subset: framework bundle + Triton theme, without debug or RTL builds.
 * `theme-triton-all.css` only @imports the `_1`/`_2` parts (an IE selector-limit
 * split), so those parts are required too.
 */
function isRuntimeFile(file) {
  if (file === 'ext-all.js' || file === 'classic/theme-triton/theme-triton.js') return true;
  return (
    file.startsWith('classic/theme-triton/resources/') &&
    !file.includes('-debug') &&
    !file.includes('-rtl')
  );
}

async function readLock() {
  try {
    return JSON.parse(await readFile(lockPath, 'utf8'));
  } catch {
    return null;
  }
}

async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

function digest(algorithm, buffer, encoding) {
  return createHash(algorithm).update(buffer).digest(encoding);
}

async function download(file, sri) {
  const response = await fetch(CDN_BASE + file);
  if (!response.ok) throw new Error(`GET ${file} -> HTTP ${response.status}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  if (sri) {
    const [algorithm, expected] = sri.split(/-(.*)/s);
    const actual = digest(algorithm, buffer, 'base64');
    if (actual !== expected) throw new Error(`SRI mismatch for ${file}`);
  }
  return buffer;
}

async function mapWithConcurrency(items, limit, fn) {
  const results = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: limit }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await fn(items[index], index);
    }
  });
  await Promise.all(workers);
  return results;
}

async function main() {
  const lock = await readLock();
  const marker = join(outDir, 'ext-all.js');
  if (!force && lock?.version === EXTJS_VERSION && (await exists(marker))) {
    console.log(`Ext JS ${EXTJS_VERSION} already vendored (use --force to re-download).`);
    return;
  }

  const meta = await (await fetch(API_URL)).json();
  const files = meta.files.filter(isRuntimeFile).sort();
  console.log(`Vendoring ${files.length} Ext JS ${EXTJS_VERSION} runtime files...`);

  const entries = await mapWithConcurrency(files, 16, async (file) => {
    const buffer = await download(file, meta.sri?.[file]);
    const sha256 = digest('sha256', buffer, 'hex');
    const pinned = lock?.version === EXTJS_VERSION ? lock.files[file] : undefined;
    if (pinned && pinned !== sha256) {
      throw new Error(`Integrity check failed for ${file}: lock=${pinned} actual=${sha256}`);
    }
    const target = join(outDir, file);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, buffer);
    return [file, sha256];
  });

  const nextLock = {
    version: EXTJS_VERSION,
    license: 'GPL-3.0-only',
    source: CDN_BASE,
    files: Object.fromEntries(entries),
  };
  await writeFile(lockPath, `${JSON.stringify(nextLock, null, 2)}\n`);
  await writeFile(
    join(outDir, 'NOTICE.md'),
    [
      `# Sencha Ext JS ${EXTJS_VERSION} (GPL-3.0)`,
      '',
      'Runtime subset of the GPL-licensed Ext JS distribution, vendored by',
      '`tools/scripts/vendor-extjs.mjs` from cdnjs. Integrity hashes live in',
      '`apps/blotter/extjs.lock.json`.',
      '',
      'GPL-3.0 has copyleft obligations. Production use requires a commercial',
      'Sencha license; swap this folder for your licensed build following',
      '"Using a licensed Ext JS build" in `apps/blotter/README.md`.',
      '',
    ].join('\n'),
  );
  console.log(`Done -> ${outDir}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
