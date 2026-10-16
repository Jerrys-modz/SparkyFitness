const fs = require('node:fs');
const path = require('node:path');

// Swift UI sources whose user-facing text must go through String(localized:).
const WATCH_SOURCE_DIRS = ['targets/watch', 'targets/watch-widget'];
const WATCH_STRINGS_FILE = 'targets/watch/en.lproj/Localizable.strings';
const BASELINE_FILE = path.join(__dirname, 'watchBaseline.json');
const IGNORE_MARKER = 'i18n-ignore';

// Calls whose first positional string argument is shown to the user. SwiftUI
// treats a bare literal as a LocalizedStringKey, but the watch catalog uses
// semantic keys, so a bare literal never gets translated.
const UI_CALL =
  /\b(?:Text|Button|Label|Toggle|Section|NavigationLink|Picker|TextField|Link|navigationTitle|accessibilityLabel|accessibilityHint)\(\s*"/g;

function listSwiftFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listSwiftFiles(full));
    else if (entry.name.endsWith('.swift')) out.push(full);
  }
  return out.sort();
}

/**
 * Read a Swift string literal starting just after its opening quote. Returns
 * the literal text with `\( ... )` interpolations removed, or null if the
 * literal is unterminated.
 */
function readLiteral(source, start) {
  let text = '';
  let i = start;
  while (i < source.length) {
    const ch = source[i];
    if (ch === '"') return text;
    if (ch === '\n') return null;
    if (ch === '\\') {
      if (source[i + 1] === '(') {
        let depth = 1;
        i += 2;
        while (i < source.length && depth > 0) {
          if (source[i] === '(') depth += 1;
          else if (source[i] === ')') depth -= 1;
          i += 1;
        }
        continue;
      }
      i += 2;
      continue;
    }
    text += ch;
    i += 1;
  }
  return null;
}

function lineOf(source, index) {
  return source.slice(0, index).split('\n').length;
}

function scanBareLiterals(rootDir) {
  const findings = [];
  for (const dir of WATCH_SOURCE_DIRS) {
    for (const file of listSwiftFiles(path.join(rootDir, dir))) {
      const source = fs.readFileSync(file, 'utf8');
      const lines = source.split('\n');
      UI_CALL.lastIndex = 0;
      let match;
      while ((match = UI_CALL.exec(source)) !== null) {
        const text = readLiteral(source, match.index + match[0].length);
        if (text === null || !/\p{L}/u.test(text)) continue;
        const line = lineOf(source, match.index);
        if (lines[line - 1].includes(IGNORE_MARKER)) continue;
        findings.push({
          file: path.relative(rootDir, file),
          line,
          text,
        });
      }
    }
  }
  return findings;
}

function parseStringsKeys(content) {
  const keys = new Map();
  const re = /^\s*"((?:[^"\\]|\\.)*)"\s*=\s*"((?:[^"\\]|\\.)*)"\s*;/gm;
  let match;
  while ((match = re.exec(content)) !== null) keys.set(match[1], match[2]);
  return keys;
}

function scanLocalizedKeys(rootDir) {
  const used = [];
  const re = /String\(\s*localized:\s*"((?:[^"\\]|\\.)*)"/g;
  for (const dir of WATCH_SOURCE_DIRS) {
    for (const file of listSwiftFiles(path.join(rootDir, dir))) {
      const source = fs.readFileSync(file, 'utf8');
      let match;
      while ((match = re.exec(source)) !== null) {
        used.push({
          file: path.relative(rootDir, file),
          line: lineOf(source, match.index),
          key: match[1],
        });
      }
    }
  }
  return used;
}

function loadBaseline() {
  return JSON.parse(fs.readFileSync(BASELINE_FILE, 'utf8'));
}

function countByFile(findings) {
  const counts = {};
  for (const f of findings) counts[f.file] = (counts[f.file] ?? 0) + 1;
  return Object.fromEntries(Object.entries(counts).sort());
}

function auditWatch(rootDir, baseline = loadBaseline()) {
  const bare = scanBareLiterals(rootDir);
  const counts = countByFile(bare);
  const stringsPath = path.join(rootDir, WATCH_STRINGS_FILE);
  const catalog = parseStringsKeys(fs.readFileSync(stringsPath, 'utf8'));

  const missingKeys = scanLocalizedKeys(rootDir).filter(
    ({ key }) => !catalog.has(key)
  );
  const newHardcoded = bare.filter(
    (f) => counts[f.file] > (baseline[f.file] ?? 0)
  );

  return {
    bareLiteralCounts: counts,
    newHardcoded,
    missingKeys,
    hasErrors: newHardcoded.length > 0 || missingKeys.length > 0,
  };
}

module.exports = {
  auditWatch,
  scanBareLiterals,
  scanLocalizedKeys,
  parseStringsKeys,
  countByFile,
  readLiteral,
  BASELINE_FILE,
};
