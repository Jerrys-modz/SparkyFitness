import {
  estimateMaxHrFromAge,
  heartRateStanding,
  heartRateZoneRange,
  zone2HeartRateRange,
  zone2HeartRateRangeForAge,
  zone2LiveBand,
  ZONE2_DRIFT_FULL_SECONDS,
  ZONE2_DRIFT_MAX_BPM,
  ZONE2_DRIFT_START_SECONDS,
  ZONE2_SETTLE_BPM,
  ZONE2_SETTLE_SECONDS,
} from '@workspace/shared';

describe('estimateMaxHrFromAge', () => {
  test('matches the server estimate used for time in zone', () => {
    expect(estimateMaxHrFromAge(40)).toBe(185);
    expect(estimateMaxHrFromAge(25)).toBe(195);
  });
});

describe('heartRateZoneRange', () => {
  test('gives each zone from its floor to one below the next floor', () => {
    expect(heartRateZoneRange(185, 1)).toEqual({ minBpm: 93, maxBpm: 110 });
    expect(heartRateZoneRange(185, 2)).toEqual({ minBpm: 111, maxBpm: 129 });
    expect(heartRateZoneRange(185, 3)).toEqual({ minBpm: 130, maxBpm: 147 });
    expect(heartRateZoneRange(185, 5)).toEqual({ minBpm: 167, maxBpm: 185 });
  });

  test('zones sit end to end with no gap or overlap', () => {
    for (const max of [150, 172, 185, 198]) {
      for (const zone of [1, 2, 3, 4] as const) {
        const a = heartRateZoneRange(max, zone)!;
        const b = heartRateZoneRange(max, (zone + 1) as 2 | 3 | 4 | 5)!;
        expect(b.minBpm).toBe(a.maxBpm + 1);
      }
    }
  });

  test('is null for a maximum that cannot be right', () => {
    expect(heartRateZoneRange(0, 2)).toBeNull();
    expect(heartRateZoneRange(Number.NaN, 2)).toBeNull();
    expect(heartRateZoneRange(-5, 2)).toBeNull();
    // Too narrow to hold a heart-rate target.
    expect(heartRateZoneRange(40, 2)).toBeNull();
  });
});

describe('zone 2', () => {
  test('is the second band, 60 to 70 percent of the maximum', () => {
    expect(zone2HeartRateRange(185)).toEqual(heartRateZoneRange(185, 2));
    expect(zone2HeartRateRange(200)).toEqual({ minBpm: 120, maxBpm: 139 });
  });

  test('from age uses the age-based maximum, and refuses an age it cannot believe', () => {
    expect(zone2HeartRateRangeForAge(40)).toEqual({ minBpm: 111, maxBpm: 129 });
    expect(zone2HeartRateRangeForAge(5)).toBeNull();
    expect(zone2HeartRateRangeForAge(120)).toBeNull();
    expect(zone2HeartRateRangeForAge(Number.NaN)).toBeNull();
  });
});

describe('zone2LiveBand', () => {
  const band = { minBpm: 111, maxBpm: 129 };

  test('is the plain range in the middle of a short run', () => {
    expect(zone2LiveBand(band, ZONE2_SETTLE_SECONDS)).toEqual(band);
    expect(zone2LiveBand(band, ZONE2_DRIFT_START_SECONDS)).toEqual(band);
  });

  test('relaxes the lower edge while heart rate settles at the start', () => {
    expect(zone2LiveBand(band, 0)).toEqual({
      minBpm: band.minBpm - ZONE2_SETTLE_BPM,
      maxBpm: band.maxBpm,
    });
    expect(zone2LiveBand(band, -30).minBpm).toBe(
      band.minBpm - ZONE2_SETTLE_BPM
    );
  });

  test('lets the top edge drift up gradually on a long run, then stop', () => {
    const half = (ZONE2_DRIFT_START_SECONDS + ZONE2_DRIFT_FULL_SECONDS) / 2;
    expect(zone2LiveBand(band, half).maxBpm).toBe(
      band.maxBpm + Math.round(ZONE2_DRIFT_MAX_BPM / 2)
    );
    expect(zone2LiveBand(band, ZONE2_DRIFT_FULL_SECONDS).maxBpm).toBe(
      band.maxBpm + ZONE2_DRIFT_MAX_BPM
    );
    expect(zone2LiveBand(band, 3 * 3600).maxBpm).toBe(
      band.maxBpm + ZONE2_DRIFT_MAX_BPM
    );
  });
});

describe('heartRateStanding', () => {
  const band = { minBpm: 111, maxBpm: 129 };
  test('says above, below or inside, edges included', () => {
    expect(heartRateStanding(130, band)).toBe('above');
    expect(heartRateStanding(129, band)).toBe('inside');
    expect(heartRateStanding(111, band)).toBe('inside');
    expect(heartRateStanding(110, band)).toBe('below');
  });
});
