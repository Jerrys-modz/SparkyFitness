import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(pathToFileURL(__filename));
const {
  auditWatch,
  scanBareLiterals,
  parseStringsKeys,
  readLiteral,
} = require('../../scripts/i18n-audit/watchScanner.cjs');

const repoRoot = path.resolve(__dirname, '../..');

function makeWatchTarget(swift: string, strings: string): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'watch-i18n-'));
  fs.mkdirSync(path.join(root, 'targets/watch/Presentation'), {
    recursive: true,
  });
  fs.mkdirSync(path.join(root, 'targets/watch/en.lproj'), { recursive: true });
  fs.writeFileSync(
    path.join(root, 'targets/watch/Presentation/View.swift'),
    swift
  );
  fs.writeFileSync(
    path.join(root, 'targets/watch/en.lproj/Localizable.strings'),
    strings
  );
  return root;
}

describe('watch i18n audit', () => {
  it('has no new hardcoded watch text and no missing catalog keys', () => {
    const result = auditWatch(repoRoot);
    expect(result.missingKeys).toEqual([]);
    expect(result.newHardcoded).toEqual([]);
  });

  it('flags bare UI literals but not localized, interpolation-only, or ignored text', () => {
    const root = makeWatchTarget(
      [
        'Text("Nothing logged yet")',
        'Button("Add Set") { }',
        'Text(String(localized: "watch.ok", defaultValue: "OK"))',
        'Text("\\(value) \\(unit)")',
        'Text("--")',
        'Text("Raw") // i18n-ignore',
      ].join('\n'),
      '"watch.ok" = "OK";\n'
    );
    const found = scanBareLiterals(root).map((f: { text: string }) => f.text);
    expect(found).toEqual(['Nothing logged yet', 'Add Set']);
  });

  it('fails when a file adds hardcoded text beyond its baseline', () => {
    const root = makeWatchTarget('Text("One")\nText("Two")', '');
    const file = 'targets/watch/Presentation/View.swift';
    expect(auditWatch(root, { [file]: 2 }).hasErrors).toBe(false);
    expect(auditWatch(root, { [file]: 1 }).hasErrors).toBe(true);
  });

  it('fails when String(localized:) uses a key missing from Localizable.strings', () => {
    const root = makeWatchTarget(
      'Text(String(localized: "watch.missing", defaultValue: "Hi"))',
      '"watch.other" = "Other";\n'
    );
    expect(
      auditWatch(root, {}).missingKeys.map((k: { key: string }) => k.key)
    ).toEqual(['watch.missing']);
  });

  it('parses nested interpolation and escaped quotes', () => {
    expect(readLiteral('a \\(f(b)) c")', 0)).toBe('a  c');
    expect(readLiteral('say \\"hi\\"")', 0)).toBe('say hi');
    expect([...parseStringsKeys('"a.b" = "It\\\'s";\n').keys()]).toEqual([
      'a.b',
    ]);
  });
});
