import { describe, it, expect, vi, beforeEach } from 'vitest';
import axios from 'axios';
import { exportWorkoutsToLiftosaur } from '../integrations/liftosaur/liftosaurWorkoutExportService.js';
import { getSystemClient } from '../db/poolManager.js';

vi.mock('axios');
vi.mock('../db/poolManager.js');
vi.mock('../config/logging.js', () => ({
  log: vi.fn(),
}));

describe('liftosaurWorkoutExportService', () => {
  let mockClient: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockClient = {
      query: vi.fn(),
      release: vi.fn(),
    };
    vi.mocked(getSystemClient).mockResolvedValue(mockClient);
  });

  it('queries non-Liftosaur workouts, attaches sets, and posts serialized history', async () => {
    // 1. Mock exercise entries query
    mockClient.query.mockImplementationOnce((sql: string) => {
      expect(sql).toContain("LOWER(ee.source) != 'liftosaur'");
      return Promise.resolve({
        rows: [
          {
            id: 'entry-1',
            user_id: 'user-1',
            exercise_name: 'Bench Press',
            entry_date: '2026-03-01',
            entry_time: '10:00',
            duration_minutes: 30,
            notes: 'Felt strong',
            source: 'manual',
            exercise_preset_entry_id: 'preset-entry-1',
            preset_name: 'Push Day',
          },
          {
            id: 'entry-2',
            user_id: 'user-1',
            exercise_name: 'Overhead Press',
            entry_date: '2026-03-01',
            entry_time: '10:30',
            duration_minutes: 20,
            notes: null,
            source: 'manual',
            exercise_preset_entry_id: 'preset-entry-1',
            preset_name: 'Push Day',
          },
        ],
      });
    });

    // 2. Mock sets query for entry-1
    mockClient.query.mockImplementationOnce(() =>
      Promise.resolve({
        rows: [
          {
            set_number: 1,
            set_type: 'working',
            reps: 5,
            weight: 100,
            rpe: 8,
            duration: null,
            notes: null,
          },
        ],
      })
    );

    // 3. Mock sets query for entry-2
    mockClient.query.mockImplementationOnce(() =>
      Promise.resolve({
        rows: [
          {
            set_number: 1,
            set_type: 'working',
            reps: 8,
            weight: 50,
            rpe: 8.5,
            duration: null,
            notes: null,
          },
        ],
      })
    );

    const mockedPost = vi.mocked(axios.post);
    mockedPost.mockResolvedValueOnce({ status: 201 });

    const exported = await exportWorkoutsToLiftosaur(
      'user-1',
      'test-key',
      'UTC',
      '2026-03-01',
      '2026-03-01'
    );

    expect(exported).toBe(1);
    expect(mockedPost).toHaveBeenCalledTimes(1);
    expect(mockedPost).toHaveBeenCalledWith(
      expect.stringContaining('/api/v1/history'),
      expect.objectContaining({
        text: expect.stringContaining('Push Day'),
      }),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer test-key',
        }),
      })
    );
  });

  it('returns 0 when there are no eligible entries', async () => {
    mockClient.query.mockResolvedValueOnce({ rows: [] });

    const exported = await exportWorkoutsToLiftosaur('user-1', 'test-key', 'UTC');
    expect(exported).toBe(0);
    expect(axios.post).not.toHaveBeenCalled();
  });
});
