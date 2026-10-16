#!/usr/bin/env node
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const {
  auditWatch,
  scanBareLiterals,
  countByFile,
  BASELINE_FILE,
} = require('./i18n-audit/watchScanner.cjs');

const rootDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..'
);

// Lowers the allowance once hardcoded watch text has been moved to the catalog.
if (process.argv.includes('--update-baseline')) {
  const counts = countByFile(scanBareLiterals(rootDir));
  fs.writeFileSync(BASELINE_FILE, `${JSON.stringify(counts, null, 2)}\n`);
  console.log(`[watch-i18n] baseline written to ${BASELINE_FILE}`);
  process.exit(0);
}

const result = auditWatch(rootDir);

if (result.missingKeys.length > 0) {
  console.log('\nString(localized:) keys missing from Localizable.strings:');
  for (const e of result.missingKeys) {
    console.log(`  - "${e.key}" at ${e.file}:${e.line}`);
  }
}
if (result.newHardcoded.length > 0) {
  console.log(
    '\nHardcoded watch UI text (use String(localized:defaultValue:)):'
  );
  for (const e of result.newHardcoded) {
    console.log(`  - "${e.text}" at ${e.file}:${e.line}`);
  }
  console.log(
    '\nMove the text to targets/watch/en.lproj/Localizable.strings. For text that must stay literal, add "// i18n-ignore" on the line.'
  );
}

const remaining = Object.values(result.bareLiteralCounts).reduce(
  (a, b) => a + b,
  0
);
console.log(
  `watch i18n: ${result.missingKeys.length} missing keys, ${result.newHardcoded.length} new hardcoded strings (${remaining} legacy allowed by baseline)`
);
process.exit(result.hasErrors ? 1 : 0);
