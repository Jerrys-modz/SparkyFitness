import { vi, beforeEach, describe, expect, it } from 'vitest';
import exerciseEntryRepository from '../models/exerciseEntry.js';
import userRepository from '../models/userRepository.js';
import * as workoutTelemetryRepository from '../models/workoutTelemetryRepository.js';
import { attachWatchTelemetryToExerciseEntry } from '../services/exerciseEntryService.js';

vi.mock('../config/logging', () => ({ log: vi.fn() }));
vi.mock('../models/exercise', () => ({ default: {} }));
vi.mock('../models/exerciseEntry', () => ({
  default: {
    getExerciseEntryById: vi.fn(),
    getExerciseEntryOwnerId: vi.fn(),
    updateExerciseEntryWatchTelemetry: vi.fn(),
  },
}));
vi.mock('../models/workoutPresetRepository', () => ({ default: {} }));
vi.mock('../models/activityDetailsRepository', () => ({ default: {} }));
vi.mock('../models/preferenceRepository', () => ({ default: {} }));
vi.mock('../models/userRepository', () => ({
  default: { getUserProfile: vi.fn() },
}));
vi.mock('../models/workoutTelemetryRepository', () => ({
  bulkInsertExerciseEntryHrZones: vi.fn(),
  replaceExerciseEntryHrZones: vi.fn(),
}));

const userId = 'user-1';
const entryId = 'entry-1';

/** A flat series, so the zone it lands in is decided purely by the max-HR ceiling. */
function series(bpm: number, count = 10) {
  return Array.from({ length: count }, (_, index) => ({
    t: new Date(Date.UTC(2026, 0, 1, 12, 0, index * 10)).toISOString(),
    bpm,
  }));
}

describe('attachWatchTelemetryToExerciseEntry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // @ts-expect-error TS(2339): mock method not on typed function.
    exerciseEntryRepository.getExerciseEntryById.mockResolvedValue({
      id: entryId,
      user_id: userId,
      entry_date: '2026-01-01',
    });
    // @ts-expect-error TS(2339): mock method not on typed function.
    exerciseEntryRepository.getExerciseEntryOwnerId.mockResolvedValue(userId);
    // @ts-expect-error TS(2339): mock method not on typed function.
    userRepository.getUserProfile.mockResolvedValue({ date_of_birth: null });
  });

  it('derives the zone ceiling from the stored date of birth', async () => {
    // @ts-expect-error TS(2339): mock method not on typed function.
    userRepository.getUserProfile.mockResolvedValue({
      date_of_birth: '1971-01-01',
    });

    await attachWatchTelemetryToExerciseEntry(
      userId,
      userId,
      entryId,
      series(150)
    );

    const [, , , zones] = vi.mocked(
      workoutTelemetryRepository.replaceExerciseEntryHrZones
    ).mock.calls[0];
    // Mid-fifties, so the Nes estimate puts max HR near 176 and zone 4 starts
    // at 0.8 x that. The pairing with the case below is the point: the same
    // series must not be filed under a different zone depending on whether it
    // arrived from the wrist or from a later sync of the same workout.
    expect(zones).toHaveLength(1);
    expect(zones[0].zone_index).toBe(4);
  });

  it('falls back to the observed max when no date of birth is stored', async () => {
    await attachWatchTelemetryToExerciseEntry(
      userId,
      userId,
      entryId,
      series(150)
    );

    const [, , , zones] = vi.mocked(
      workoutTelemetryRepository.replaceExerciseEntryHrZones
    ).mock.calls[0];
    // FALLBACK_MAX_HR (190) rather than an age estimate, which lands the very
    // same 150 bpm a zone lower.
    expect(zones).toHaveLength(1);
    expect(zones[0].zone_index).toBe(3);
    expect(zones[0].zone_lower_bpm).toBe(133);
  });

  it('writes measured calories with no series at all', async () => {
    await attachWatchTelemetryToExerciseEntry(
      userId,
      userId,
      entryId,
      undefined,
      312.4
    );

    expect(
      exerciseEntryRepository.updateExerciseEntryWatchTelemetry
    ).toHaveBeenCalledWith(entryId, userId, {
      calories_burned: 312,
      active_calories: 312,
    });
    // Nothing to bucket without a series.
    expect(
      workoutTelemetryRepository.replaceExerciseEntryHrZones
    ).not.toHaveBeenCalled();
  });

  it("404s instead of attaching telemetry to another user's entry", async () => {
    // @ts-expect-error TS(2339): mock method not on typed function.
    exerciseEntryRepository.getExerciseEntryOwnerId.mockResolvedValue(
      'someone-else'
    );

    await expect(
      attachWatchTelemetryToExerciseEntry(userId, userId, entryId, series(150))
    ).rejects.toMatchObject({ status: 404 });

    expect(
      exerciseEntryRepository.updateExerciseEntryWatchTelemetry
    ).not.toHaveBeenCalled();
  });

  it('does not let an older snapshot roll max HR or calories backwards', async () => {
    // @ts-expect-error TS(2339): mock method not on typed function.
    exerciseEntryRepository.getExerciseEntryById.mockResolvedValue({
      id: entryId,
      user_id: userId,
      entry_date: '2026-01-01',
      max_heart_rate: 178,
      active_calories: 400,
    });

    await attachWatchTelemetryToExerciseEntry(
      userId,
      userId,
      entryId,
      series(150),
      200
    );

    expect(
      exerciseEntryRepository.updateExerciseEntryWatchTelemetry
    ).not.toHaveBeenCalled();
    expect(
      workoutTelemetryRepository.replaceExerciseEntryHrZones
    ).not.toHaveBeenCalled();
  });
});
