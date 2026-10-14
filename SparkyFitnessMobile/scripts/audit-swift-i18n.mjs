#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const {
  scanTargets,
  compareToBaseline,
} = require('./i18n-audit/swiftScanner.cjs');

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const targetsDir = path.join(root, 'targets');
const baselinePath = path.join(root, 'scripts/i18n-audit/swift-baseline.json');
const update = process.argv.includes('--update-baseline');

const byFile = scanTargets(targetsDir);

if (update) {
  const counts = Object.fromEntries(
    Object.entries(byFile).map(([file, findings]) => [file, findings.length])
  );
  fs.writeFileSync(baselinePath, `${JSON.stringify(counts, null, 2)}\n`);
  console.log(
    `[swift-i18n] baseline written: ${Object.keys(counts).length} files, ${Object.values(counts).reduce((a, b) => a + b, 0)} literals`
  );
  process.exit(0);
}

const baseline = fs.existsSync(baselinePath)
  ? JSON.parse(fs.readFileSync(baselinePath, 'utf8'))
  : {};
const { increases, improvements } = compareToBaseline(byFile, baseline);

if (improvements.length > 0) {
  console.log(
    `[swift-i18n] ${improvements.length} file(s) now have fewer untranslated literals than the baseline; run "pnpm run swift-i18n:baseline" to lock that in.`
  );
}

if (increases.length > 0) {
  console.error('\nUntranslated Swift string literals (blocking):');
  for (const { file, allowed, found, findings } of increases) {
    console.error(`  ${file}: ${found} found, ${allowed} allowed`);
    for (const f of findings)
      console.error(`    ${file}:${f.line} ${f.call}("${f.text}")`);
  }
  console.error(
    '\nUse String(localized: "watch.<area>.<name>", defaultValue: "...") and add the key to the target\'s en.lproj/Localizable.strings,\nor mark a literal that must stay as-is with "// i18n-ignore".'
  );
  process.exit(1);
}

const total = Object.values(byFile).reduce((n, f) => n + f.length, 0);
console.log(
  `[swift-i18n] OK (${total} legacy literal(s) tracked in the baseline)`
);
