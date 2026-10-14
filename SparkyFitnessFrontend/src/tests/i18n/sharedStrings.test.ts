import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { REPO_ROOT, listSourceFiles, literalText, parse } from './auditHelpers';

// Properties that carry display text. Anything the shared package ships in
// one of these is shown to people in at least one app, so it needs a
// translation path (a catalog entry in each app, like symptoms.builtIn.*, or
// a key in the English catalog that the apps resolve).
const DISPLAY_PROPERTIES = new Set([
  'label',
  'displayName',
  'title',
  'description',
  'message',
  'hint',
  'placeholder',
  'text',
  'body',
]);

const SHARED_SRC = path.join(REPO_ROOT, 'shared/src');
const BASELINE_PATH = path.join(__dirname, 'sharedStringsBaseline.json');

const countDisplayStrings = (): Record<string, number> => {
  const counts: Record<string, number> = {};
  for (const file of listSourceFiles(SHARED_SRC, {
    skipDirs: ['schemas', 'node_modules'],
  })) {
    if (/\.test\.tsx?$/.test(file)) continue;
    let count = 0;
    const visit = (node: ts.Node) => {
      if (
        ts.isPropertyAssignment(node) &&
        DISPLAY_PROPERTIES.has(node.name.getText())
      ) {
        const text = literalText(node.initializer);
        if (
          text !== null &&
          /[A-Za-z]{3,}\s+[A-Za-z]|^[A-Z][a-z]{2,}/.test(text)
        )
          count += 1;
      }
      ts.forEachChild(node, visit);
    };
    visit(parse(file));
    if (count > 0)
      counts[path.relative(SHARED_SRC, file).replaceAll(path.sep, '/')] = count;
  }
  return counts;
};

describe('display strings in @workspace/shared', () => {
  const found = countDisplayStrings();

  if (process.env['UPDATE_SHARED_STRINGS_BASELINE']) {
    fs.writeFileSync(BASELINE_PATH, `${JSON.stringify(found, null, 2)}\n`);
  }

  const baseline = JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8')) as Record<
    string,
    number
  >;

  it('do not grow without a translation path', () => {
    const grown = Object.entries(found)
      .filter(([file, count]) => count > (baseline[file] ?? 0))
      .map(
        ([file, count]) =>
          `${file}: ${count} display strings, ${baseline[file] ?? 0} tracked`
      );
    // New user-facing text in shared/ must be translatable in every app. Add
    // catalog entries for it (see sharedLabels.test.ts for the symptom labels),
    // then run: UPDATE_SHARED_STRINGS_BASELINE=1 pnpm exec jest sharedStrings
    expect(grown).toEqual([]);
  });

  it('has no tracked file that was deleted or cleaned up', () => {
    const stale = Object.entries(baseline)
      .filter(([file, count]) => (found[file] ?? 0) < count)
      .map(([file]) => file);
    expect(stale).toEqual([]);
  });
});
