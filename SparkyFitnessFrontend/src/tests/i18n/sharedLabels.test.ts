import path from 'node:path';
import type { TFunction } from 'i18next';
import {
  BODY_REGIONS,
  BUILT_IN_OPTIONS,
  BUILT_IN_PHASE_OPTIONS,
  BUILT_IN_SYMPTOM_DEFINITIONS,
  BUILT_IN_TRIGGER_GROUPS,
  HEAD_REGIONS,
} from '@workspace/shared';
import { translateSymptomLabel } from '@/pages/Symptoms/symptomLabels';
import {
  EN_CATALOG_PATH,
  REPO_ROOT,
  lookup,
  readCatalog,
} from './auditHelpers';

// The shared package owns these English labels and stores them verbatim on
// entries; each app translates them for display from its own catalog. A label
// added in shared/ without catalog entries would show up untranslated, which
// is how the symptom chips regressed in CodeWithCJ/SparkyFitness#2804.
const catalogs = {
  web: readCatalog(EN_CATALOG_PATH),
  mobile: readCatalog(
    path.join(
      REPO_ROOT,
      'SparkyFitnessMobile/src/localization/locales/en/translation.json'
    )
  ),
};

const sharedLabels = (): string[] => [
  ...Object.values(BUILT_IN_OPTIONS).flat(),
  ...Object.values(BUILT_IN_PHASE_OPTIONS).flat(),
  ...BUILT_IN_TRIGGER_GROUPS.flatMap((g) => [g.group, ...g.items]),
  ...BUILT_IN_SYMPTOM_DEFINITIONS.map((d) => d.displayName),
  ...HEAD_REGIONS.map((r) => r.label),
  ...BODY_REGIONS.map((r) => r.label),
];

// Returns the catalog key the web app would look up for a label.
const keyFor = (label: string): string =>
  translateSymptomLabel(((key: string) => key) as unknown as TFunction, label);

describe('labels owned by @workspace/shared', () => {
  const labels = [...new Set(sharedLabels())];

  it('are found', () => {
    expect(labels.length).toBeGreaterThan(100);
  });

  it.each(Object.keys(catalogs) as (keyof typeof catalogs)[])(
    'have an English catalog entry in the %s app',
    (app) => {
      const missing = labels.filter(
        (label) => lookup(catalogs[app], keyFor(label)) !== label
      );
      // Add symptoms.builtIn.<camelCasedLabel> with the exact English label to
      // the catalog (web: public/locales/en/translation.json, mobile:
      // src/localization/locales/en/translation.json).
      expect(missing).toEqual([]);
    }
  );

  it('keeps the web and mobile catalogs in step', () => {
    const only = (a: Record<string, unknown>, b: Record<string, unknown>) =>
      Object.keys(a).filter((key) => !(key in b));
    const web = (catalogs.web['symptoms'] as Record<string, unknown>)[
      'builtIn'
    ] as Record<string, unknown>;
    const mobile = (catalogs.mobile['symptoms'] as Record<string, unknown>)[
      'builtIn'
    ] as Record<string, unknown>;
    expect(only(web, mobile)).toEqual([]);
    expect(only(mobile, web)).toEqual([]);
  });
});
