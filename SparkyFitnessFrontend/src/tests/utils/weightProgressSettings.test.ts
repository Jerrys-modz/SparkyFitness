import { DEFAULT_WEIGHT_PROGRESS_SETTINGS } from '@workspace/shared';
import {
  loadWeightProgressSettings,
  saveWeightProgressSettings,
} from '@/utils/weightProgressSettings';
import {
  signedPercent,
  signedWeight,
} from '@/pages/Reports/weightProgressCopy';

describe('weight progress settings', () => {
  beforeEach(() => window.localStorage.clear());

  it('keeps each person their own choices', () => {
    saveWeightProgressSettings('a', {
      customStart: { date: '2026-01-01', weight: 90 },
      milestonesHidden: true,
      seen: { startDate: '2026-01-01', ids: ['goal'] },
    });
    expect(loadWeightProgressSettings('a').milestonesHidden).toBe(true);
    expect(loadWeightProgressSettings('a').customStart).toEqual({
      date: '2026-01-01',
      weight: 90,
    });
    expect(loadWeightProgressSettings('b')).toEqual(
      DEFAULT_WEIGHT_PROGRESS_SETTINGS
    );
    expect(loadWeightProgressSettings(null)).toEqual(
      DEFAULT_WEIGHT_PROGRESS_SETTINGS
    );
  });

  it('drops malformed stored values', () => {
    window.localStorage.setItem(
      'sparky.weightProgress.v1.a',
      JSON.stringify({ customStart: { date: 'soon' }, seen: 'x' })
    );
    expect(loadWeightProgressSettings('a')).toEqual(
      DEFAULT_WEIGHT_PROGRESS_SETTINGS
    );
    window.localStorage.setItem('sparky.weightProgress.v1.a', '{not json');
    expect(loadWeightProgressSettings('a')).toEqual(
      DEFAULT_WEIGHT_PROGRESS_SETTINGS
    );
  });
});

describe('weight progress copy', () => {
  it('signs changes and never shows a signed zero', () => {
    expect(signedWeight(-2.44, 'kg')).toBe('-2.4 kg');
    expect(signedWeight(1, 'lbs')).toMatch(/^\+2\.2/);
    expect(signedWeight(-0.01, 'kg')).toBe('0 kg');
    expect(signedPercent(-4.24)).toBe('-4.2%');
    expect(signedPercent(0.01)).toBe('0%');
  });
});
