import fs from 'fs';
import path from 'path';
import {
  WIDGET_ACCENTS,
  WIDGET_FAMILY_MAX_METRICS,
  WIDGET_FAMILY_STYLES,
  WIDGET_METRICS,
  WIDGET_STYLES,
} from '@workspace/shared';

import { CUSTOM_WIDGET_ACTIVE_KEY } from '../../src/hooks/useCustomWidgetActive';

const read = (relative: string) =>
  fs.readFileSync(path.join(__dirname, '../..', relative), 'utf8');

const swift = read('targets/widget/customWidget.swift');
const strings = read('targets/widget/en.lproj/Localizable.strings');

const enumBody = (name: string): string => {
  const match = swift.match(
    new RegExp(`enum ${name}: String, AppEnum \\{([\\s\\S]*?)\\n\\}`)
  );
  if (!match?.[1]) throw new Error(`enum ${name} not found`);
  return match[1];
};

const casesOf = (name: string): string[] =>
  [...enumBody(name).matchAll(/^\s+case (\w+)$/gm)].map((m) => m[1] as string);

// The person chooses what the widget shows in its own Edit Widget screen:
// four number pickers over every metric, plus style and color. There is no
// saved layout in the app to choose from.
describe('custom widget Edit Widget options', () => {
  it('offers every metric the app can supply, plus None', () => {
    expect(casesOf('CustomMetricOption').sort()).toEqual(
      ['off', ...WIDGET_METRICS].sort()
    );
  });

  it('offers every style and every accent', () => {
    expect(casesOf('CustomStyleOption').sort()).toEqual(
      ['auto', ...WIDGET_STYLES].sort()
    );
    expect(casesOf('CustomAccentOption').sort()).toEqual(
      [...WIDGET_ACCENTS].sort()
    );
  });

  it('has four number slots, style, color and large text', () => {
    for (const slot of ['first', 'second', 'third', 'fourth']) {
      expect(swift).toMatch(new RegExp(`var ${slot}: CustomMetricOption`));
    }
    expect(swift).toMatch(/var style: CustomStyleOption/);
    expect(swift).toMatch(/var accent: CustomAccentOption/);
    expect(swift).toMatch(/var largeText: Bool/);
  });

  it('gives every option a title in the widget strings', () => {
    const keys = [...swift.matchAll(/title: "(widget\.custom\.[\w.]+)"/g)].map(
      (m) => m[1] as string
    );
    expect(keys.length).toBeGreaterThan(30);
    for (const key of keys) {
      expect(strings).toContain(`"${key}" =`);
    }
  });

  it('defaults to something useful, so a freshly added widget is not empty', () => {
    expect(swift).toMatch(/default: \.calories_remaining\)\n\s+var first/);
    expect(swift).toMatch(/default: \.steps\)\n\s+var fourth/);
  });

  it('does not use recommendations, which are inactive on iOS', () => {
    expect(swift).not.toMatch(/AppIntentRecommendation/);
    expect(swift).not.toMatch(/func recommendations\(/);
  });

  it('no longer depends on layouts saved in the app', () => {
    expect(swift).not.toMatch(/customWidgetLayouts/);
    expect(swift).not.toMatch(/EntityQuery/);
  });

  it('says in the gallery description to pick numbers in Edit Widget', () => {
    const description = strings.match(
      /"widget\.custom\.description" = "([^"]*)";/
    )?.[1];
    expect(description).toMatch(/Edit Widget/);
  });
});

describe('custom widget mirrors the shared tables', () => {
  it('lists the same metric cap per family', () => {
    for (const [family, max] of Object.entries(WIDGET_FAMILY_MAX_METRICS)) {
      expect(swift).toContain(`"${family}": ${max}`);
    }
  });

  it('lists the same styles per family, default first', () => {
    for (const [family, styles] of Object.entries(WIDGET_FAMILY_STYLES)) {
      const list = styles.map((s) => `"${s}"`).join(', ');
      expect(swift).toContain(`"${family}": [${list}]`);
    }
  });
});

describe('custom widget activity stamp', () => {
  it('writes the key the app reads, only when iOS asks for a timeline', () => {
    expect(swift).toContain(`forKey: "${CUSTOM_WIDGET_ACTIVE_KEY}"`);
    const timeline = swift.match(
      /func timeline\(for configuration[\s\S]*?\n    \}\n/
    )?.[0];
    expect(timeline).toContain('markCustomWidgetActive()');
    const snapshot = swift.match(
      /func snapshot\(for configuration[\s\S]*?\n    \}\n/
    )?.[0];
    expect(snapshot).not.toContain('markCustomWidgetActive()');
  });
});
