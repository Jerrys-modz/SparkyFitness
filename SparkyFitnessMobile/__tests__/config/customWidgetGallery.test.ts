import fs from 'fs';
import path from 'path';

const appSource = fs.readFileSync(
  path.join(__dirname, '../../App.tsx'),
  'utf8'
);
const moduleSwift = fs.readFileSync(
  path.join(
    __dirname,
    '../../modules/background-water/ios/BackgroundWaterModule.swift'
  ),
  'utf8'
);
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

  it('lists every saved layout in Edit Widget, not only the first', () => {
    expect(swiftSource).toMatch(/func suggestedEntities\(\)/);
    expect(swiftSource).toMatch(
      /loadCustomWidgetLayouts\(\)\.map \{ CustomWidgetLayoutEntity\(layout: \$0\) \}/
    );
  });

  it('shows the first saved layout when none has been picked', () => {
    expect(swiftSource).toMatch(/\?\? layouts\.first/);
  });

  it('does not ask iOS to refresh the gallery from inside the widget on every reload', () => {
    // The app does it once when layouts change; doing it in snapshot() or
    // timeline() would run on every refresh.
    expect(swiftSource).not.toMatch(/invalidateConfigurationRecommendations/);
  });

  // The layouts used to be mirrored from the Dashboard's hook, so a widget
  // saved while the Dashboard was not updating never reached the widget.
  it('mirrors saved widgets from the app root, not from a screen', () => {
    expect(appSource).toMatch(/useCustomWidgetLayoutSync\(\)/);
    const dashboard = fs.readFileSync(
      path.join(__dirname, '../../src/screens/DashboardScreen.tsx'),
      'utf8'
    );
    expect(dashboard).not.toMatch(/useCustomWidgetLayoutSync/);
  });

  it('can tell iOS the gallery list changed', () => {
    expect(moduleSwift).toMatch(/Function\("reloadWidgetRecommendations"\)/);
    expect(moduleSwift).toMatch(
      /WidgetCenter\.shared\.invalidateConfigurationRecommendations\(\)/
    );
  });
});
