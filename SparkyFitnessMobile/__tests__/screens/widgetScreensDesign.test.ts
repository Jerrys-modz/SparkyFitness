import fs from 'fs';
import path from 'path';
import { WIDGET_ACCENTS } from '@workspace/shared';
import { WIDGET_ACCENT_TOKENS } from '../../src/constants/widgetBuilder';

// DESIGN.md, Do's and Don'ts: no hex literals, and a raw RN Switch only
// where ui/Switch cannot fit. These guard the widget builder screens.
const FILES = [
  'screens/WidgetEditorScreen.tsx',
  'screens/WidgetsScreen.tsx',
  'components/widgets/WidgetPreview.tsx',
  'constants/widgetBuilder.ts',
  'hooks/useWidgetAccentColors.ts',
];

describe.each(FILES)('%s follows DESIGN.md', (file) => {
  const source = fs.readFileSync(
    path.join(__dirname, '../../src', file),
    'utf8'
  );

  it('has no hex color literals', () => {
    expect(source).not.toMatch(/['"`]#[0-9a-fA-F]{3,8}['"`]/);
  });

  it('adds no hex alpha suffix to a color (use withAlpha)', () => {
    expect(source).not.toMatch(/\$\{\w*[cC]olor\w*\}[0-9a-fA-F]{2}\b/);
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

// A new color goes in global.css in all three theme blocks (DESIGN.md, Color
// rules). The widget accents must resolve in every theme.
describe('widget accent tokens', () => {
  const css = fs.readFileSync(path.join(__dirname, '../../global.css'), 'utf8');
  const blocks = ['light', 'dark', 'amoled'].map((name) => {
    const start = css.indexOf(`@variant ${name} {`);
    expect(start).toBeGreaterThan(-1);
    const next = css.indexOf('@variant ', start + 1);
    return css.slice(start, next === -1 ? undefined : next);
  });

  it.each(Object.entries(WIDGET_ACCENT_TOKENS))(
    '%s is defined in light, dark and amoled: %s',
    (_accent, token) => {
      for (const block of blocks) {
        expect(block).toContain(`${token}:`);
      }
    }
  );

  it('covers every accent', () => {
    expect(Object.keys(WIDGET_ACCENT_TOKENS).sort()).toEqual(
      [...WIDGET_ACCENTS].sort()
    );
  });
});
