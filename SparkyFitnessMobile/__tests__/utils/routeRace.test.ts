import type { TFunction } from 'i18next';
import { raceLabel, raceTimeText } from '../../src/utils/routeRace';

// Echoes the English default with {{time}} filled in.
const t = ((_key: string, options: { defaultValue: string; time?: string }) =>
  options.defaultValue.replace('{{time}}', options.time ?? '')) as TFunction;

describe('raceTimeText', () => {
  it('counts seconds under a minute and minutes from there', () => {
    expect(raceTimeText(12)).toBe('12 s');
    expect(raceTimeText(-8.4)).toBe('8 s');
    expect(raceTimeText(60)).toBe('1:00');
    expect(raceTimeText(-75)).toBe('1:15');
  });
});

describe('raceLabel', () => {
  it('says ahead in the good tone and behind in the warning one', () => {
    expect(raceLabel(12, t)).toEqual({ text: 'Ahead 12 s', tone: 'ahead' });
    expect(raceLabel(-8, t)).toEqual({ text: 'Behind 8 s', tone: 'behind' });
  });

  it('calls a dead heat even', () => {
    expect(raceLabel(0, t)).toEqual({
      text: 'Even with your best time',
      tone: 'ahead',
    });
  });

  it('is null with no race', () => {
    expect(raceLabel(null, t)).toBeNull();
    expect(raceLabel(undefined, t)).toBeNull();
    expect(raceLabel(Number.NaN, t)).toBeNull();
  });
});
