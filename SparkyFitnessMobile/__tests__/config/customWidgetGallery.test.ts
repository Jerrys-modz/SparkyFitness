import fs from 'fs';
import path from 'path';

const read = (relative: string) =>
  fs.readFileSync(path.join(__dirname, '../..', relative), 'utf8');

const swiftSource = read('targets/widget/customWidget.swift');
const appSource = read('App.tsx');

// The iOS widget gallery shows one card per widget kind and size, so saved
// widgets are chosen in Edit Widget, as in Home Assistant's custom widget.
// AppIntentRecommendation is NOT a way around that: Apple's docs say that on
// platforms with a dedicated widget configuration UI (iOS, macOS) it is
// inactive, so it only adds dead code.
describe('custom widget choosing', () => {
  it('lists every saved layout in Edit Widget, not only the first', () => {
    expect(swiftSource).toMatch(/func suggestedEntities\(\)/);
    expect(swiftSource).toMatch(
      /loadCustomWidgetLayouts\(\)\.map \{ CustomWidgetLayoutEntity\(layout: \$0\) \}/
    );
  });

  it('shows the first saved layout when none has been picked', () => {
    expect(swiftSource).toMatch(/\?\? layouts\.first/);
  });

  it('does not use recommendations, which are inactive on iOS', () => {
    expect(swiftSource).not.toMatch(/AppIntentRecommendation/);
    expect(swiftSource).not.toMatch(/func recommendations\(/);
    expect(swiftSource).not.toMatch(/invalidateConfigurationRecommendations/);
  });

  // The layouts used to be mirrored from the Dashboard's hook, so a widget
  // saved while the Dashboard was not updating never reached the widget.
  it('mirrors saved widgets from the app root, not from a screen', () => {
    expect(appSource).toMatch(/useCustomWidgetLayoutSync\(\)/);
    expect(read('src/screens/DashboardScreen.tsx')).not.toMatch(
      /useCustomWidgetLayoutSync/
    );
  });

  // The gallery card previews the first saved widget and cannot show the
  // others, so its description is where a person learns to use Edit Widget.
  it('tells the person in the gallery to choose in Edit Widget', () => {
    const strings = read('targets/widget/en.lproj/Localizable.strings');
    const description = strings.match(
      /"widget\.custom\.description" = "([^"]*)";/
    )?.[1];
    expect(description).toMatch(/Edit Widget/);
  });

  it('shows what each saved widget contains in the Edit Widget list', () => {
    expect(swiftSource).toMatch(
      /DisplayRepresentation\(title: "\\\(name\)", subtitle: "\\\(summary\)"\)/
    );
    expect(swiftSource).toMatch(/layout\.metrics\.prefix\(3\)\.compactMap/);
  });
});
