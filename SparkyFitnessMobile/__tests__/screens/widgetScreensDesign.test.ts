import fs from 'fs';
import path from 'path';

// DESIGN.md, Do's and Don'ts: no hex literals, and a raw RN Switch only
// where ui/Switch cannot fit. These guard the widget builder screens.
const SCREENS = ['WidgetEditorScreen.tsx', 'WidgetsScreen.tsx'];

describe.each(SCREENS)('%s follows DESIGN.md', (file) => {
  const source = fs.readFileSync(
    path.join(__dirname, '../../src/screens', file),
    'utf8'
  );

  it('has no hex color literals', () => {
    expect(source).not.toMatch(/['"`]#[0-9a-fA-F]{3,8}['"`]/);
  });

  it('uses the shared Switch, not the raw React Native one', () => {
    expect(source).not.toMatch(/\bSwitch\b[^;]*from 'react-native'/);
  });

  it('has no Tailwind palette classes or dark: variants', () => {
    expect(source).not.toMatch(
      /\b(text|bg|border)-(red|blue|green|purple|emerald|amber|gray|slate)-\d{2,3}\b/
    );
    expect(source).not.toMatch(/\bdark:/);
  });
});
