import path from 'node:path';
import ts from 'typescript';
import {
  SRC_ROOT,
  lineOf,
  listSourceFiles,
  literalText,
  parse,
} from './auditHelpers';

// Attributes and object properties that end up in front of the user.
const UI_ATTRIBUTES = new Set([
  'placeholder',
  'title',
  'aria-label',
  'alt',
  'label',
  'description',
  'tooltip',
  'helperText',
  'emptyText',
]);
const UI_PROPERTIES = new Set([
  ...UI_ATTRIBUTES,
  'message',
  'errorTitle',
  'errorMessage',
  'successMessage',
]);

// Text that reads the same in every language, or is not prose.
const LANGUAGE_NEUTRAL =
  /^(kg|g|mg|mcg|µg|μg|ml|l|oz|lb|lbs|cm|mm|m|km|mi|ft|in|kcal|cal|kj|bpm|brpm|rpm|spm|w|%|min|sec|s|h|hr|ms|mph|kph|ml\/kg\/min|iu|totp|rem|hrv|ai|csv|json|pdf|api|url|gps)$/i;
const BRAND_OR_PRODUCT =
  /^(garmin|fitbit|withings|polar|strava|wahoo|google|openai|ollama|nutritionix|fatsecret|usda|sparkyfitness|github|oura|coros|yazio|wger)$/i;
const NOT_PROSE =
  /^(https?:\/\/|\/\S*$|@|#[0-9a-f]{3,8}$|[\w.-]+@[\w.-]+$|[a-z]+(\.[A-Za-z]+)+$|[a-z0-9_-]+$)/;

const isTranslatable = (raw: string): boolean => {
  const text = raw.replace(/&[a-z]+;/g, ' ').trim();
  return (
    /[A-Za-z]{2,}/.test(text) &&
    !LANGUAGE_NEUTRAL.test(text) &&
    !BRAND_OR_PRODUCT.test(text) &&
    !NOT_PROSE.test(text) &&
    !/^[a-z]+([A-Z][a-z]+)+$/.test(text)
  );
};

// Deliberate exceptions, as "path:text". Keep each one explained.
const ALLOWED = new Set([
  // Editor/CLI snippets shown verbatim for operators to copy.
  'pages/Admin/OidcProviderDialog.tsx:proxy_set_header Host $host;',
  'pages/Admin/OidcProviderDialog.tsx:proxy_set_header X-Real-IP $remote_addr;',
  'pages/Admin/OidcProviderDialog.tsx:proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;',
  'pages/Admin/OidcProviderDialog.tsx:proxy_set_header X-Forwarded-Proto $scheme;',
  'pages/Admin/OidcProviderDialog.tsx:add_header X-Content-Type-Options "nosniff";',
  'pages/Admin/OidcProviderDialog.tsx:proxy_set_header X-Forwarded-Ssl on;',
  // Third-party library names in the barcode scanner engine picker.
  'components/FoodSearch/BarcodeScanner.tsx:@zxing/library',
  'components/FoodSearch/BarcodeScanner.tsx:html5-qrcode',
  'components/FoodSearch/BarcodeScanner.tsx:quagga2',
  // Product names for third-party providers, shown as their own brand.
  'pages/Diary/ExerciseEntryDisplay.tsx:Nutritionix',
  'pages/Exercises/ExerciseSearchListItem.tsx:Nutritionix',
  'components/Onboarding/FoodSourcesStep.tsx:FatSecret',
  'layouts/MainLayout.tsx:SparkyFitness',
  'pages/Auth/Auth.tsx:SparkyFitness',
  'pages/Auth/ForgotPassword.tsx:SparkyFitness',
  'pages/Auth/ResetPassword.tsx:SparkyFitness',
  // Provider developer-portal names (proper nouns).
  'pages/Settings/ProviderCard.tsx:Strava API Settings',
  'pages/Settings/ProviderCard.tsx:Fitbit Developer Portal',
  'pages/Settings/ProviderCard.tsx:Oura Developer Portal',
  'pages/Settings/ProviderCard.tsx:Withings Developer Dashboard',
  'pages/Settings/ProviderCard.tsx:Polar Flow Applications',
  'pages/Settings/ProviderCard.tsx:Garmin Connect',
  'pages/Settings/ProviderCard.tsx:Nutritionix Console',
  'pages/Settings/ProviderCard.tsx:FatSecret Platform Dashboard',
  'pages/Settings/ProviderCard.tsx:USDA API Guide',
  'pages/Settings/ProviderCard.tsx:Yazio API Docs',
  'pages/Settings/ProviderCard.tsx:Open Food Facts Portal',
  'pages/Settings/ProviderCard.tsx:COROS Training Hub',
  'pages/Settings/ProviderCard.tsx:Health Canada CNF Open Data Portal',
  // OAuth token auth methods are protocol identifiers.
  'pages/Admin/OidcProviderDialog.tsx:client_secret_post',
  'pages/Admin/OidcProviderDialog.tsx:client_secret_basic',
  // Prefix of a Liftosaur API key, shown as a literal.
  'pages/Settings/EditProviderForm.tsx:lftsk_',
  'pages/Settings/ProviderSpecificFields.tsx:lftsk_',
  // Clock time rendered as hh:mm.
  'pages/Reports/SleepScience/EnergySchedule.tsx:',
]);

/** Text of a string literal or template, with each ${...} left out. */
const textOf = (node: ts.Node): string | null => {
  const plain = literalText(node);
  if (plain !== null) return plain;
  if (ts.isTemplateExpression(node))
    return [node.head.text, ...node.templateSpans.map((s) => s.literal.text)]
      .join(' ')
      .replace(/\s+/g, ' ');
  return null;
};

/** Literals reachable through ternaries, `||`, `??` and `&&` fallbacks. */
const literalLeaves = (node: ts.Node): ts.Node[] => {
  if (ts.isParenthesizedExpression(node)) return literalLeaves(node.expression);
  if (ts.isConditionalExpression(node))
    return [...literalLeaves(node.whenTrue), ...literalLeaves(node.whenFalse)];
  if (
    ts.isBinaryExpression(node) &&
    [
      ts.SyntaxKind.BarBarToken,
      ts.SyntaxKind.QuestionQuestionToken,
      ts.SyntaxKind.AmpersandAmpersandToken,
    ].includes(node.operatorToken.kind)
  )
    return [...literalLeaves(node.left), ...literalLeaves(node.right)];
  return textOf(node) === null ? [] : [node];
};

interface Hit {
  where: string;
  text: string;
}

const scanFile = (file: string): Hit[] => {
  const sf = parse(file);
  const rel = path.relative(SRC_ROOT, file).replaceAll(path.sep, '/');
  const hits: Hit[] = [];
  const report = (node: ts.Node, text: string) => {
    if (!isTranslatable(text)) return;
    if (ALLOWED.has(`${rel}:${text.trim()}`)) return;
    hits.push({ where: `${rel}:${lineOf(sf, node)}`, text: text.trim() });
  };
  const inSkippedTag = (node: ts.Node): boolean => {
    for (let p: ts.Node | undefined = node.parent; p; p = p.parent) {
      if (
        ts.isJsxElement(p) &&
        /^(code|pre|kbd|samp|style|script)$/.test(
          p.openingElement.tagName.getText()
        )
      )
        return true;
    }
    return false;
  };
  const visit = (node: ts.Node) => {
    if (ts.isJsxText(node) && !inSkippedTag(node)) report(node, node.text);
    else if (
      ts.isJsxAttribute(node) &&
      UI_ATTRIBUTES.has(node.name.getText()) &&
      node.initializer
    ) {
      const expression = ts.isJsxExpression(node.initializer)
        ? node.initializer.expression
        : node.initializer;
      for (const leaf of expression ? literalLeaves(expression) : [])
        report(node, textOf(leaf) ?? '');
    } else if (
      ts.isPropertyAssignment(node) &&
      UI_PROPERTIES.has(node.name.getText())
    ) {
      for (const leaf of literalLeaves(node.initializer))
        report(node, textOf(leaf) ?? '');
    } else if (
      ts.isJsxExpression(node) &&
      node.expression &&
      (ts.isJsxElement(node.parent) || ts.isJsxFragment(node.parent)) &&
      !inSkippedTag(node)
    ) {
      // {cond ? 'Yes' : 'No'} and {value || 'Unknown'} between tags.
      for (const leaf of literalLeaves(node.expression))
        if (!ts.isStringLiteral(node.expression) || node.expression.text.trim())
          report(node, textOf(leaf) ?? '');
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return hits;
};

describe('hardcoded UI strings', () => {
  it('are routed through t() instead of being written inline', () => {
    const hits = listSourceFiles(SRC_ROOT).flatMap(scanFile);
    // Wrap the text in t('area.key', 'English text') and add the key to
    // public/locales/en/translation.json. Text that is genuinely
    // language-neutral belongs in ALLOWED above, with a reason.
    expect(hits.map((h) => `${h.where}  ${JSON.stringify(h.text)}`)).toEqual(
      []
    );
  });

  it('does not allow exceptions for strings that no longer exist', () => {
    const present = new Set<string>();
    for (const file of listSourceFiles(SRC_ROOT)) {
      const rel = path.relative(SRC_ROOT, file).replaceAll(path.sep, '/');
      if (![...ALLOWED].some((entry) => entry.startsWith(`${rel}:`))) continue;
      const source = parse(file).getFullText();
      for (const entry of ALLOWED) {
        if (
          entry.startsWith(`${rel}:`) &&
          source.includes(entry.slice(rel.length + 1))
        )
          present.add(entry);
      }
    }
    expect([...ALLOWED].filter((entry) => !present.has(entry))).toEqual([]);
  });
});
