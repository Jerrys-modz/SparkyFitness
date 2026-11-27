import {
  hasOtherAppVo2Reading,
  vo2SeriesByDay,
} from '../../../src/services/shared/vo2Writeback';

describe('vo2SeriesByDay', () => {
  it('maps the server series by day', () => {
    expect(
      vo2SeriesByDay({
        value: 48,
        runs: 3,
        from: '2026-10-01',
        to: '2026-10-20',
        series: [
          { day: '2026-10-01', value: 47.5 },
          { day: '2026-10-20', value: 48.5 },
        ],
      })
    ).toEqual(
      new Map([
        ['2026-10-01', 47.5],
        ['2026-10-20', 48.5],
      ])
    );
  });

  it('drops values outside 10 to 100', () => {
    const map = vo2SeriesByDay({
      value: 48,
      runs: 3,
      from: '2026-10-01',
      to: '2026-10-20',
      series: [
        { day: '2026-10-01', value: 9.9 },
        { day: '2026-10-02', value: 100.1 },
        { day: '2026-10-03', value: Number.NaN },
        { day: '2026-10-04', value: 10 },
      ],
    });
    expect([...map.keys()]).toEqual(['2026-10-04']);
  });

  it('is empty without an estimate or a series', () => {
    expect(vo2SeriesByDay(null).size).toBe(0);
    expect(vo2SeriesByDay(undefined).size).toBe(0);
    expect(
      vo2SeriesByDay({ value: 48, runs: 2, from: 'a', to: 'b' }).size
    ).toBe(0);
  });
});

describe('hasOtherAppVo2Reading', () => {
  it('is true for any real reading and false for none', () => {
    expect(hasOtherAppVo2Reading([44.2])).toBe(true);
    expect(hasOtherAppVo2Reading([])).toBe(false);
    expect(hasOtherAppVo2Reading([Number.NaN, 0])).toBe(false);
  });
});
