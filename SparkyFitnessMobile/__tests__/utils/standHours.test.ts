import { countStandHours } from '../../src/utils/standHours';

describe('countStandHours', () => {
  it('counts hours stood in and ignores idle hours', () => {
    expect(
      countStandHours([
        { value: 0, startDate: '2026-10-31T08:00:00Z' },
        { value: 1, startDate: '2026-10-31T09:00:00Z' },
        { value: 0, startDate: '2026-10-31T10:05:00Z' },
      ])
    ).toBe(2);
  });

  it('counts an hour recorded by two sources once', () => {
    expect(
      countStandHours([
        { value: 0, startDate: new Date('2026-10-31T08:00:00Z') },
        { value: 0, startDate: new Date('2026-10-31T08:00:00Z') },
      ])
    ).toBe(1);
  });

  it('is zero with no samples or an unreadable start', () => {
    expect(countStandHours([])).toBe(0);
    expect(countStandHours([{ value: 0, startDate: 'not a date' }])).toBe(0);
  });
});
