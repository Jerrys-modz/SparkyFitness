import {
  effortChartPoints,
  formatEffortGap,
  formatSegmentTime,
  segmentPaceSecPerKm,
  segmentTitle,
} from '../../src/utils/segmentDisplay';
import i18n, { initializeI18n } from '../../src/localization/i18n';

describe('segment display', () => {
  beforeAll(async () => {
    await initializeI18n('en');
  });

  it('shows a tenth under ten minutes and whole seconds after', () => {
    expect(formatSegmentTime(61)).toBe('1:01.0');
    expect(formatSegmentTime(214.44)).toBe('3:34.4');
    expect(formatSegmentTime(59.96)).toBe('1:00.0');
    expect(formatSegmentTime(600)).toBe('10:00');
    expect(formatSegmentTime(3725)).toBe('1:02:05');
  });

  it('shows the gap to the best', () => {
    expect(formatEffortGap(250, 238)).toBe('+0:12');
    expect(formatEffortGap(235, 238)).toBe('−0:03');
    expect(formatEffortGap(238.2, 238)).toBe('±0:00');
  });

  it('names a segment, falling back to its length', () => {
    const t = i18n.t.bind(i18n);
    expect(segmentTitle(t, { name: 'Park hill', lengthM: 800 }, 'km')).toBe(
      'Park hill'
    );
    expect(segmentTitle(t, { name: null, lengthM: 800 }, 'km')).toBe(
      'Segment · 0.80 km'
    );
    expect(segmentTitle(t, { name: null, lengthM: 1609.344 }, 'miles')).toBe(
      'Segment · 1.00 mi'
    );
  });

  it('orders effort points oldest first with faster higher', () => {
    const points = effortChartPoints([
      {
        entryId: 'c',
        date: '2026-10-03',
        startedAt: '',
        elapsedSeconds: 200,
        avgSpeedMps: 4,
        isBest: true,
        isPersonalRecord: true,
      },
      {
        entryId: 'b',
        date: '2026-10-02',
        startedAt: '',
        elapsedSeconds: 230,
        avgSpeedMps: 3,
        isBest: false,
        isPersonalRecord: false,
      },
      {
        entryId: 'a',
        date: '2026-10-01',
        startedAt: '',
        elapsedSeconds: 220,
        avgSpeedMps: 3,
        isBest: false,
        isPersonalRecord: false,
      },
    ]);
    expect(points.map((p) => p.date)).toEqual([
      '2026-10-01',
      '2026-10-02',
      '2026-10-03',
    ]);
    expect(points.map((p) => p.index)).toEqual([0, 1, 2]);
    expect(points[2]?.value).toBeGreaterThan(points[0]?.value ?? 0);
    expect(points.map((p) => p.isPersonalRecord)).toEqual([false, false, true]);
  });

  it('works out a pace per km', () => {
    expect(segmentPaceSecPerKm(1000, 250)).toBe(250);
    expect(segmentPaceSecPerKm(0, 250)).toBeNull();
    expect(segmentPaceSecPerKm(1000, 0)).toBeNull();
  });
});
