import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { sharedTextKey } from '@workspace/shared';
import {
  EN_CATALOG_PATH,
  REPO_ROOT,
  listSourceFiles,
  literalText,
  lookup,
  parse,
  readCatalog,
  type Catalog,
} from './auditHelpers';

// `@workspace/shared` ships English display text (flow levels, vitamin names,
// article titles, ...). Each app translates it for display from
// `sharedText.<sharedTextKey(text)>` in its own English catalog, so a string
// added to shared/ without that entry would reach translators as nothing.
const SHARED_SRC = path.join(REPO_ROOT, 'shared/src');
const MOBILE_CATALOG_PATH = path.join(
  REPO_ROOT,
  'SparkyFitnessMobile/src/localization/locales/en/translation.json'
);

/** Files whose strings are translated through `sharedText.*` on the web. */
const WEB_FILES = [
  'cycle/constants.ts',
  'cycle/content.ts',
  'cycle/pregnancy.ts',
  'cycle/pregnancyContent.ts',
  'medications/glp1.ts',
  'nutrients/alcoholUnits.ts',
  'nutrients/macroPickerFields.ts',
  'nutrients/micronutrientCatalog.ts',
  'symptoms/builtIns.ts',
  'utils/parseCsv.ts',
  'ai/confidenceLabels.ts',
  'nutrients/nutrientAlgorithms.ts',
];

/** Display names the mobile app shows through its own `sharedText.*` map. */
const MOBILE_FILES = [
  'medications/glp1.ts',
  'nutrients/macroPickerFields.ts',
  'nutrients/micronutrientCatalog.ts',
];

/**
 * Files with display text that is deliberately not run through `sharedText`,
 * each with the reason.
 */
const NOT_VIA_SHARED_TEXT = new Set([
  // Controlled messages that the apps map to their own keys by code.
  'cycle/predictions.ts',
  // Returned in the suggestion object but never rendered by either app.
  'utils/progressionEngine.ts',
  // Translated under their own keys (symptoms.builtIn.*, mood.*, ...).
  'symptoms/bodyRegions.ts',
  'medications/symptoms.ts',
  'mood/index.ts',
  'utils/servingSizeConversions.ts',
  // Server-side only: the sport names become stored activity names.
  'constants/corosSportTypes.ts',
  // Search keyword, not shown.
  'constants/exercise.ts',
  // Stored database values; shown through the exercise display label keys.
  'constants/exerciseTaxonomy.ts',
  'utils/muscleBodyMap.ts',
  // Dose and strength are numbers; the schedule sentences are not used by the apps.
  'medications/format.ts',
  // Translated through the drink_presets.* keys.
  'nutrients/drinkPresetCatalog.ts',
  // "Mine" is translated through symptoms.triggerGroups.mine.
  'symptoms/choices.ts',
  // Translated by the callers under exerciseAnalytics.records.sportGroups.*.
  'utils/activitySport.ts',
  // Translated through calculationSettings.bodyFatAlgorithmOptions.*.
  'utils/bodyComposition.ts',
  // Date patterns, not words.
  'utils/csvFormat.ts',
  // Placeholder text written into the note being edited.
  'utils/markdownToolbar.ts',
]);

// Properties that hold a code, not words people read.
const NOT_DISPLAY = new Set([
  'value',
  'key',
  'id',
  'icon',
  'color',
  'category',
  'phase',
  'type',
  'unit',
  'view',
  'template',
  'scaleType',
  'kind',
  'mode',
  'tone',
  'code',
  'method',
  'status',
  'level',
  'severity',
  'stage',
  'tag',
  'field',
  'format',
  'source',
  'weight',
  'sex',
  'slug',
]);
// Search synonyms and brand names, not display text.
const NOT_TRANSLATED_LISTS = new Set(['aliases', 'brands', 'keywords']);

const looksLikeCode = (text: string): boolean =>
  /^[a-z0-9_.\-/:#]+$/.test(text) ||
  (/^[A-Z0-9_]+$/.test(text) && !/\s/.test(text)) ||
  /^(https?:|\/)/.test(text);

const displayTextIn = (file: string): string[] => {
  const found: string[] = [];
  const visit = (node: ts.Node) => {
    const text = literalText(node);
    const parent = node.parent;
    if (
      text !== null &&
      parent &&
      !ts.isImportDeclaration(parent) &&
      !ts.isExportDeclaration(parent) &&
      !ts.isLiteralTypeNode(parent) &&
      !ts.isCallExpression(parent) &&
      !ts.isBinaryExpression(parent) &&
      !ts.isElementAccessExpression(parent) &&
      !ts.isCaseClause(parent)
    ) {
      const owner = ts.isPropertyAssignment(parent)
        ? parent
        : ts.isArrayLiteralExpression(parent) &&
            ts.isPropertyAssignment(parent.parent)
          ? parent.parent
          : null;
      const inProperty = ts.isPropertyAssignment(parent);
      const inArray = ts.isArrayLiteralExpression(parent);
      const ownerName = owner ? owner.name.getText() : '';
      if (
        (inProperty || inArray) &&
        !NOT_DISPLAY.has(ownerName) &&
        !NOT_TRANSLATED_LISTS.has(ownerName) &&
        /[A-Za-z]{3,}/.test(text) &&
        !looksLikeCode(text) &&
        /\s|^[A-Z]/.test(text)
      )
        found.push(text);
    }
    ts.forEachChild(node, visit);
  };
  visit(parse(path.join(SHARED_SRC, file)));
  return found;
};

const web = readCatalog(EN_CATALOG_PATH);
const mobile = readCatalog(MOBILE_CATALOG_PATH);

/** Text another feature already translates, so it is not repeated. */
const translatedElsewhere = (catalog: Catalog): Set<string> => {
  const out = new Set<string>();
  const collect = (node: Catalog | string | undefined) => {
    if (typeof node === 'string') out.add(node);
    else if (node) Object.values(node).forEach(collect);
  };
  const symptoms = catalog['symptoms'] as Catalog | undefined;
  collect(symptoms?.['builtIn']);
  const meds = catalog['medications'] as Catalog | undefined;
  collect((meds?.['sites'] as Catalog | undefined)?.['label']);
  return out;
};

describe('display text owned by @workspace/shared', () => {
  const covered = translatedElsewhere(web);

  it.each(WEB_FILES)('%s has web sharedText entries', (file) => {
    const missing = [...new Set(displayTextIn(file))]
      .filter((text) => !covered.has(text))
      .filter(
        (text) => lookup(web, `sharedText.${sharedTextKey(text)}`) !== text
      );
    // Run the catalog generator for the file, or add
    // sharedText.<sharedTextKey(text)> with the exact English text to
    // SparkyFitnessFrontend/public/locales/en/translation.json.
    expect(missing).toEqual([]);
  });

  it.each(MOBILE_FILES)('%s has mobile sharedText entries', (file) => {
    const names = [...new Set(displayTextIn(file))].filter((text) => {
      // The mobile map covers display names only, not notes or brand lists.
      const source = fs.readFileSync(path.join(SHARED_SRC, file), 'utf8');
      return source.includes(`displayName: ${JSON.stringify(text)}`);
    });
    const missing = names.filter(
      (text) => lookup(mobile, `sharedText.${sharedTextKey(text)}`) !== text
    );
    expect(missing).toEqual([]);
  });

  it('classifies every shared file that has display text', () => {
    const known = new Set([...WEB_FILES, ...NOT_VIA_SHARED_TEXT]);
    const unclassified = listSourceFiles(SHARED_SRC, {
      skipDirs: ['schemas', 'node_modules'],
    })
      .map((file) => path.relative(SHARED_SRC, file).replaceAll(path.sep, '/'))
      .filter((file) => !/\.test\.ts$/.test(file) && !known.has(file))
      .filter((file) => displayTextIn(file).length > 0);
    // A new shared file with user-visible English must be added to WEB_FILES
    // (and given sharedText entries) or to NOT_VIA_SHARED_TEXT with a reason.
    expect(unclassified).toEqual([]);
  });
});
