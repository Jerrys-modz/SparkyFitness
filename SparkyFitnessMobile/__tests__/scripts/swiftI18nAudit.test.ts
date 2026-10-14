import path from 'node:path';
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(pathToFileURL(__filename));
const scanner = require('../../scripts/i18n-audit/swiftScanner.cjs');

interface Finding {
  line: number;
  call: string;
  text: string;
}
const scanSource = scanner.scanSource as (
  src: string,
  englishKeys?: Set<string>
) => Finding[];
const scanTargets = scanner.scanTargets as (
  dir: string
) => Record<string, Finding[]>;
const compareToBaseline = scanner.compareToBaseline as (
  byFile: Record<string, Finding[]>,
  baseline: Record<string, number>
) => {
  increases: { file: string; allowed: number; found: number }[];
  improvements: { file: string; allowed: number; found: number }[];
};

const root = path.resolve(__dirname, '../..');

describe('swift i18n scanner', () => {
  it('reports bare SwiftUI literals', () => {
    const found = scanSource(`
      Text("Nothing logged yet today")
      Button("Cancel") {}
      .navigationTitle("Today")
    `);
    expect(found.map((f) => [f.call, f.text])).toEqual([
      ['Text', 'Nothing logged yet today'],
      ['Button', 'Cancel'],
      ['.navigationTitle', 'Today'],
    ]);
  });

  it('keeps the literal when text surrounds an interpolation', () => {
    const found = scanSource(
      'Text("Lap \\(state.lapCount) of \\(max("a", "b"))")'
    );
    expect(found).toHaveLength(1);
    expect(found[0]?.text).toBe('Lap  of');
  });

  it('ignores values, units and localized strings', () => {
    const found = scanSource(`
      Text("\\(bpm)")
      Text("kg")
      Text(verbatim: "Raw")
      Text(String(localized: "watch.fasting.end", defaultValue: "End fast"))
      Text("Skip") // i18n-ignore
    `);
    expect(found).toEqual([]);
  });

  it('accepts literals that are keys in en.lproj/Localizable.strings', () => {
    expect(scanSource('Text("Steps")', new Set(['Steps']))).toEqual([]);
    expect(scanSource('Text("Steps")', new Set())).toHaveLength(1);
  });

  it('fails only when a file grows past its baseline', () => {
    const one = [{ line: 1, call: 'Text', text: 'Hello' }];
    const two = [...one, { line: 2, call: 'Text', text: 'World' }];
    expect(
      compareToBaseline({ 'a.swift': two }, { 'a.swift': 1 }).increases
    ).toHaveLength(1);
    expect(compareToBaseline({ 'b.swift': one }, {}).increases).toHaveLength(1);
    expect(
      compareToBaseline({ 'a.swift': one }, { 'a.swift': 2 }).increases
    ).toHaveLength(0);
    expect(
      compareToBaseline({ 'a.swift': one }, { 'a.swift': 2 }).improvements
    ).toHaveLength(1);
  });
});

describe('watch and widget targets', () => {
  it('add no new untranslated string literals', () => {
    const baseline = JSON.parse(
      fs.readFileSync(
        path.join(root, 'scripts/i18n-audit/swift-baseline.json'),
        'utf8'
      )
    ) as Record<string, number>;
    const byFile = scanTargets(path.join(root, 'targets'));
    const { increases } = compareToBaseline(byFile, baseline);
    expect(
      increases.map((i) => `${i.file}: ${i.found} found, ${i.allowed} allowed`)
    ).toEqual([]);
  });
});
