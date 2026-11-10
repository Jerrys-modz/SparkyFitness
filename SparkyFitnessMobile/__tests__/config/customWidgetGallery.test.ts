import fs from 'fs';
import path from 'path';

const swiftSource = fs.readFileSync(
  path.join(__dirname, '../../targets/widget/customWidget.swift'),
  'utf8'
);

// Without recommendations() the widget gallery shows one "Custom widget" that
// previews only the first saved layout, so a second widget never appears.
describe('custom widget gallery', () => {
  it('offers one gallery card per saved layout', () => {
    expect(swiftSource).toMatch(
      /func recommendations\(\) -> \[AppIntentRecommendation<SelectCustomWidgetIntent>\]/
    );
    expect(swiftSource).toMatch(/loadCustomWidgetLayouts\(\)\.map/);
  });

  it('asks the system to refresh that list when the widget reloads', () => {
    expect(swiftSource).toMatch(
      /WidgetCenter\.shared\.invalidateConfigurationRecommendations\(\)/
    );
  });
});
