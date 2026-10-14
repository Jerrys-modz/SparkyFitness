'use strict';
/**
 * Finds user-visible string literals in the Swift targets (watch app, watch
 * complications, iOS widget) that bypass localization.
 *
 * SwiftUI looks a bare literal up in Localizable.strings by its English text,
 * so a literal is only translatable when that text is a key in an
 * `en.lproj/Localizable.strings`. The targets use dotted keys with
 * `String(localized:defaultValue:)`, which this scanner never reports.
 *
 * Add `// i18n-ignore` to a line to exempt a literal that must stay as is.
 */
const fs = require('node:fs');
const path = require('node:path');

const VIEW_CALLS = [
  'Text',
  'Button',
  'Label',
  'Toggle',
  'Section',
  'Picker',
  'TextField',
  'SecureField',
  'Link',
  'ProgressView',
  'LabeledContent',
  'Menu',
  'NavigationLink',
  'DisclosureGroup',
  'Stepper',
  'GroupBox',
  'ContentUnavailableView',
];
const MODIFIER_CALLS = [
  'navigationTitle',
  'accessibilityLabel',
  'accessibilityHint',
  'accessibilityValue',
  'help',
  'badge',
  'alert',
  'confirmationDialog',
  'configurationDisplayName',
  'description',
];
const CALL_PATTERN = new RegExp(
  `(?:\\b(${VIEW_CALLS.join('|')})|\\.(${MODIFIER_CALLS.join('|')}))\\(\\s*"`,
  'g'
);

// Units and symbols that read the same in every language.
const NEUTRAL =
  /^(kg|g|lb|lbs|oz|mg|ml|l|cm|mm|m|km|mi|ft|in|kcal|cal|kj|bpm|rpm|spm|min|sec|s|h|hr|ms|mph|kph|km\/h|pace|rpe|hr|hrv|vo2 ?max|kj|kcal\/day|sparkyfitness|am|pm|ok|id)$/i;

function parseString(src, quoteIndex) {
  let i = quoteIndex + 1;
  let text = '';
  while (i < src.length) {
    const ch = src[i];
    if (ch === '\\') {
      if (src[i + 1] === '(') {
        let depth = 1;
        i += 2;
        while (i < src.length && depth > 0) {
          if (src[i] === '"') i = parseString(src, i).end;
          else {
            if (src[i] === '(') depth += 1;
            else if (src[i] === ')') depth -= 1;
            i += 1;
          }
        }
        text += '\u0000';
        continue;
      }
      text += src[i + 1] ?? '';
      i += 2;
      continue;
    }
    if (ch === '"') return { text, end: i + 1 };
    if (ch === '\n') return { text, end: i };
    text += ch;
    i += 1;
  }
  return { text, end: i };
}

function listSwiftFiles(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) listSwiftFiles(full, out);
    else if (entry.name.endsWith('.swift')) out.push(full);
  }
  return out;
}

function loadEnglishKeys(targetsDir) {
  const keys = new Set();
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (
        entry.name === 'Localizable.strings' &&
        path.basename(path.dirname(full)) === 'en.lproj'
      ) {
        const re = /"((?:\\.|[^"\\])*)"\s*=/g;
        const content = fs.readFileSync(full, 'utf8');
        let m;
        while ((m = re.exec(content)) !== null) keys.add(m[1]);
      }
    }
  };
  walk(targetsDir);
  return keys;
}

function scanSource(src, englishKeys = new Set()) {
  const findings = [];
  const lines = src.split('\n');
  CALL_PATTERN.lastIndex = 0;
  let match;
  while ((match = CALL_PATTERN.exec(src)) !== null) {
    const quoteIndex = match.index + match[0].length - 1;
    if (src.startsWith('"""', quoteIndex)) continue;
    const { text } = parseString(src, quoteIndex);
    const visible = text.replaceAll('\u0000', '').trim();
    const line = src.slice(0, quoteIndex).split('\n').length;
    if (!/[A-Za-z]{2,}/.test(visible)) continue;
    if (NEUTRAL.test(visible)) continue;
    if (englishKeys.has(text.replaceAll('\u0000', ''))) continue;
    if ((lines[line - 1] ?? '').includes('i18n-ignore')) continue;
    findings.push({
      line,
      call: match[1] ?? `.${match[2]}`,
      text: visible,
    });
  }
  return findings;
}

function scanTargets(targetsDir) {
  const englishKeys = loadEnglishKeys(targetsDir);
  const byFile = {};
  for (const file of listSwiftFiles(targetsDir).sort()) {
    const findings = scanSource(fs.readFileSync(file, 'utf8'), englishKeys);
    if (findings.length) {
      byFile[
        path.relative(path.dirname(targetsDir), file).replaceAll(path.sep, '/')
      ] = findings;
    }
  }
  return byFile;
}

/** Counts per file; the baseline may only go down. */
function compareToBaseline(byFile, baseline) {
  const increases = [];
  const improvements = [];
  for (const [file, findings] of Object.entries(byFile)) {
    const allowed = baseline[file] ?? 0;
    if (findings.length > allowed)
      increases.push({ file, allowed, found: findings.length, findings });
  }
  for (const [file, allowed] of Object.entries(baseline)) {
    const found = byFile[file]?.length ?? 0;
    if (found < allowed) improvements.push({ file, allowed, found });
  }
  return { increases, improvements };
}

module.exports = {
  parseString,
  scanSource,
  scanTargets,
  compareToBaseline,
  loadEnglishKeys,
};
