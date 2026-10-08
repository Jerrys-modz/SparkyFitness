import fs from 'fs';
import path from 'path';

// The watch app and the watch widget extension both compile the control
// intents (a control that opens the app needs the intent in both). The
// extension's file is a symlink to the app's, so there is one copy.
const root = path.join(__dirname, '..', '..', 'targets');
const appCopy = path.join(
  root,
  'watch',
  'Application',
  'WatchControlIntents.swift'
);
const extensionCopy = path.join(
  root,
  'watch-widget',
  'WatchControlIntents.swift'
);

describe('watch control intents', () => {
  it('are one file shared by the watch app and the widget extension', () => {
    expect(fs.lstatSync(extensionCopy).isSymbolicLink()).toBe(true);
    expect(fs.realpathSync(extensionCopy)).toBe(fs.realpathSync(appCopy));
  });

  it('leave the note the watch app reads', () => {
    const intents = fs.readFileSync(appCopy, 'utf8');
    const route = fs.readFileSync(
      path.join(root, 'watch', 'Application', 'WatchControlRoute.swift'),
      'utf8'
    );
    const key = /"(pendingWatchControlRoute)"/;
    expect(intents.match(key)?.[1]).toBe('pendingWatchControlRoute');
    expect(route.match(key)?.[1]).toBe('pendingWatchControlRoute');
  });
});
