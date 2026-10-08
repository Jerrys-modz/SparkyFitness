import fs from 'fs';
import path from 'path';

// The watch app and the watch widget extension each compile their own copy of
// the control intents (a control that opens the app needs the intent in both).
const root = path.join(__dirname, '..', '..', 'targets');
const read = (...parts: string[]) =>
  fs.readFileSync(path.join(root, ...parts), 'utf8');

describe('watch control intents', () => {
  it('are the same in the watch app and the watch widget extension', () => {
    expect(read('watch', 'Application', 'WatchControlIntents.swift')).toBe(
      read('watch-widget', 'WatchControlIntents.swift')
    );
  });

  it('leave the note the watch app reads', () => {
    const intents = read('watch', 'Application', 'WatchControlIntents.swift');
    const route = read('watch', 'Application', 'WatchControlRoute.swift');
    const key = /"(pendingWatchControlRoute)"/;
    expect(intents.match(key)?.[1]).toBe('pendingWatchControlRoute');
    expect(route.match(key)?.[1]).toBe('pendingWatchControlRoute');
  });
});
