import type { HeartRateZonesResponse } from '@workspace/shared';
import { watchHeartRateZoneFloors } from '../../src/utils/watchHeartRateZones';

const zonesFrom = (floors: number[]): HeartRateZonesResponse =>
  ({
    settings: {},
    resolved: {
      zones: floors.map((lower_bpm, i) => ({
        zone: i + 1,
        lower_bpm,
        upper_bpm: floors[i + 1] ?? null,
      })),
    },
  }) as unknown as HeartRateZonesResponse;

describe('watchHeartRateZoneFloors', () => {
  it('returns the five floors, zone 1 first', () => {
    expect(
      watchHeartRateZoneFloors(zonesFrom([95, 114, 133, 152, 171]))
    ).toEqual([95, 114, 133, 152, 171]);
  });

  it('is null until the zones are known', () => {
    expect(watchHeartRateZoneFloors(undefined)).toBeNull();
  });

  it('is null for floors that are not five ascending values', () => {
    expect(watchHeartRateZoneFloors(zonesFrom([95, 114, 133, 152]))).toBeNull();
    expect(
      watchHeartRateZoneFloors(zonesFrom([95, 114, 114, 152, 171]))
    ).toBeNull();
    expect(
      watchHeartRateZoneFloors(zonesFrom([0, 114, 133, 152, 171]))
    ).toBeNull();
  });
});
