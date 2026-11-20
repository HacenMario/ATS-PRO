#!/usr/bin/env node
/**
 * i18n audit:
 *  1. Parity check — every locale must expose exactly the reference (ar) keys.
 *     Any missing key FAILS (exit 1) so the build/CI stops.
 *  2. Unused-key detection — scans apps/web/src + apps/api/src for
 *     t('key') / translate(locale, 'key') usages and reports dictionary keys
 *     that are never referenced (warnings only, because keys are also used
 *     dynamically via template strings, e.g. `notif.title.${type}`).
 *  3. Empty-value check — a key present but with an empty string fails.
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, extname } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const root = process.cwd();
const i18nPkg = require(join(root, 'packages/i18n/dist/index.js'));

const { dictionaries, referenceKeys, missingKeys, extraKeys, LOCALES } = i18nPkg;

let failed = false;

console.log('== i18n audit ==');
for (const locale of LOCALES) {
  const missing = missingKeys(locale);
  const extra = extraKeys(locale);
  const empty = Object.entries(dictionaries[locale])
    .filter(([, v]) => typeof v !== 'string' || v.trim().length === 0)
    .map(([k]) => k);
  if (missing.length) {
    failed = true;
    console.error(`[${locale}] MISSING ${missing.length} key(s): ${missing.slice(0, 20).join(', ')}${missing.length > 20 ? ' …' : ''}`);
  }
  if (extra.length) {
    failed = true;
    console.error(`[${locale}] EXTRA key(s) not in reference: ${extra.join(', ')}`);
  }
  if (empty.length) {
    failed = true;
    console.error(`[${locale}] EMPTY value(s): ${empty.join(', ')}`);
  }
  if (!missing.length && !extra.length && !empty.length) {
    console.log(`[${locale}] OK — ${Object.keys(dictionaries[locale]).length} keys`);
  }
}

// ---- unused key detection (warning only) ----
const scanDirs = [join(root, 'apps/web/src'), join(root, 'apps/api/src')];
const usedKeys = new Set();
function walk(dir) {
  if (!existsSync(dir)) return;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p);
    else if (['.ts', '.tsx', '.js', '.jsx'].includes(extname(name))) {
      const src = readFileSync(p, 'utf8');
      for (const m of src.matchAll(/\bt\(\s*['"]([\w.:-]+)['"]/g)) usedKeys.add(m[1]);
      for (const m of src.matchAll(/translate\([^,]+,\s*['"]([\w.:-]+)['"]/g)) usedKeys.add(m[1]);
      // dynamic prefixes: notif.title.${type} -> register prefix
      for (const m of src.matchAll(/['"]([a-z]+)\.[a-zA-Z.]+\$\{/g)) usedKeys.add(m[1] + '.*');
    }
  }
}
scanDirs.forEach(walk);

const refKeys = referenceKeys();
const prefixWildcards = [...usedKeys].filter((k) => k.endsWith('.*'));
const unused = refKeys.filter((k) => {
  if (usedKeys.has(k)) return false;
  return !prefixWildcards.some((w) => k.startsWith(w));
});
if (unused.length) {
  console.warn(`[warn] ${unused.length} dictionary key(s) never referenced directly in source (may be used dynamically):`);
  console.warn('       ' + unused.slice(0, 40).join(', ') + (unused.length > 40 ? ' …' : ''));
} else {
  console.log('No unused keys.');
}

if (failed) {
  console.error('i18n audit FAILED — fix missing/extra/empty keys before building.');
  process.exit(1);
}
console.log('i18n audit passed.');
