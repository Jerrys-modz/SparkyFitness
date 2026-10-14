import path from 'node:path';
import ts from 'typescript';
import {
  EN_CATALOG_PATH,
  SRC_ROOT,
  listSourceFiles,
  lineOf,
  literalText,
  lookup,
  parse,
  placeholders,
  readCatalog,
} from './auditHelpers';

const catalog = readCatalog(EN_CATALOG_PATH);
const PLURAL_SUFFIXES = ['_zero', '_one', '_two', '_few', '_many', '_other'];

interface TCall {
  where: string;
  key: string;
  fallback: string | null;
}

const collectCalls = (): TCall[] => {
  const calls: TCall[] = [];
  for (const file of listSourceFiles(SRC_ROOT)) {
    const sf = parse(file);
    const visit = (node: ts.Node) => {
      if (
        ts.isCallExpression(node) &&
        /^(t|i18n\.t)$/.test(node.expression.getText()) &&
        node.arguments.length > 0
      ) {
        const key = literalText(node.arguments[0]);
        if (key !== null) {
          calls.push({
            where: `${path.relative(SRC_ROOT, file)}:${lineOf(sf, node)}`,
            key,
            fallback: literalText(node.arguments[1]),
          });
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);
  }
  return calls;
};

// Existing keys whose catalog text and in-code fallback disagree about the
// {{placeholders}} they take. The catalog wins at runtime, so each of these
// renders a literal "{{name}}" or drops a value. Fix the key (or its call
// sites) and remove it from this list; do not add to it.
const KNOWN_PLACEHOLDER_MISMATCHES = new Set([
  'exerciseReportsDashboard.repsVsWeight',
  'admin.userManagement.deleteSuccess',
  'mealManagement.failedToDeleteMeal',
  'settings.cnf.lastImportFailed',
  'reports.foodDiaryExportHeaders.calories',
  'reports.exerciseEntriesExportHeaders.caloriesBurned',
  'reports.customMeasurementsExportSuccess',
  'reports.daysInTargetRange',
  'settings.cnf.lastImportSuccess',
]);

describe('English translation catalog', () => {
  const calls = collectCalls();

  it('finds translation calls to check', () => {
    expect(calls.length).toBeGreaterThan(1000);
  });

  it('contains every statically referenced key', () => {
    const missing = calls
      .filter(
        ({ key }) =>
          lookup(catalog, key) === undefined &&
          !PLURAL_SUFFIXES.some((s) => lookup(catalog, key + s) !== undefined)
      )
      .map(({ where, key }) => `${where}  ${key}`);
    // A key that only exists as a code default cannot be translated: the
    // sync pipeline and Weblate only see public/locales/en/translation.json.
    expect(missing).toEqual([]);
  });

  it('uses the same {{placeholders}} in the catalog and the code fallback', () => {
    const mismatched = calls
      .filter(({ key, fallback }) => {
        const text = lookup(catalog, key);
        return (
          text !== undefined &&
          fallback !== null &&
          !KNOWN_PLACEHOLDER_MISMATCHES.has(key) &&
          placeholders(text) !== placeholders(fallback)
        );
      })
      .map(({ where, key }) => `${where}  ${key}`);
    expect(mismatched).toEqual([]);
  });

  it('keeps the known placeholder mismatches list honest', () => {
    const stillMismatched = new Set(
      calls
        .filter(({ key, fallback }) => {
          const text = lookup(catalog, key);
          return (
            text !== undefined &&
            fallback !== null &&
            placeholders(text) !== placeholders(fallback)
          );
        })
        .map(({ key }) => key)
    );
    const fixed = [...KNOWN_PLACEHOLDER_MISMATCHES].filter(
      (key) => !stillMismatched.has(key)
    );
    expect(fixed).toEqual([]);
  });
});
