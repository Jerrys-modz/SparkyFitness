import i18n, { initializeI18n } from '../../src/localization/i18n';
import {
  buildSleepTooltipText,
  measureLabelColumnWidth,
} from '../../src/components/SleepTimelineChart';
import type { SleepTimelineDay } from '../../src/types/sleep';

const night: SleepTimelineDay = {
  day: '2026-06-03',
  timeInBedSeconds: 8 * 3600 + 12 * 60,
  timeAsleepSeconds: 7 * 3600 + 40 * 60,
  segments: [{ stage: 'other', startMs: 0, endMs: 1 }],
  zone: null,
};

describe('buildSleepTooltipText (locale-aware)', () => {
  beforeAll(async () => {
    await initializeI18n('en');
  });

  test('formats time in bed, time asleep, and the date on one line', async () => {
    await i18n.changeLanguage('en');

    const text = buildSleepTooltipText(night, i18n.t);

    expect(text).toContain('8h 12m');
    expect(text).toContain('7h 40m');
    expect(text).toContain('Jun 3');
  });

  test('returns empty copy for no selection', () => {
    expect(buildSleepTooltipText(undefined, i18n.t)).toBe('');
  });
});

describe('measureLabelColumnWidth', () => {
  test('returns the fallback width when there are no labels', () => {
    expect(measureLabelColumnWidth([], () => 999, 44)).toBe(44);
  });

  test('sizes to the widest label plus a small gap, not the fallback', () => {
    const widths: Record<string, number> = {
      '23': 12,
      '01': 12,
      '12 AM': 30,
    };
    const measureText = (label: string) => widths[label];

    expect(
      measureLabelColumnWidth(['23', '01', '12 AM'], measureText, 44)
    ).toBe(36);
  });

  test('rounds a fractional measurement up', () => {
    expect(measureLabelColumnWidth(['23'], () => 12.2, 44)).toBe(19);
  });
});
