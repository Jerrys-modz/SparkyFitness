import fs from 'fs';
import path from 'path';
import { WIDGET_METRICS, WIDGET_METRIC_LINK_PATHS } from '@workspace/shared';

const appSource = fs.readFileSync(
  path.join(__dirname, '../../App.tsx'),
  'utf8'
);
const swiftSource = fs.readFileSync(
  path.join(__dirname, '../../targets/widget/customWidget.swift'),
  'utf8'
);

describe('custom widget tap links', () => {
  it('has a link for every metric', () => {
    expect(Object.keys(WIDGET_METRIC_LINK_PATHS).sort()).toEqual(
      [...WIDGET_METRICS].sort()
    );
  });

  it.each([...new Set(Object.values(WIDGET_METRIC_LINK_PATHS))])(
    'opens a screen registered in the linking config: %s',
    (linkPath) => {
      const registered = new RegExp(`:\\s*'${linkPath}'`);
      expect(appSource).toMatch(registered);
    }
  );

  it('uses only paths that carry no parameters', () => {
    for (const linkPath of Object.values(WIDGET_METRIC_LINK_PATHS)) {
      expect(linkPath).not.toMatch(/[:?{}]/);
    }
  });

  it('opens links under the same scheme the app registers', () => {
    expect(swiftSource).toContain('"sparkyfitnessmobile://"');
    expect(appSource).toContain("'sparkyfitnessmobile://'");
  });

  it('reads the links the app sends and links numbers only where allowed', () => {
    expect(swiftSource).toMatch(/let links: \[String: String\]\?/);
    expect(swiftSource).toMatch(/linkable = familyKey == "medium"/);
    expect(swiftSource).toMatch(/Link\(destination: url\)/);
  });
});
