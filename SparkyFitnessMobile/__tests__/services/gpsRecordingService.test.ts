import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';

jest.mock('expo-location', () => ({
  Accuracy: { BestForNavigation: 6 },
  ActivityType: { Fitness: 3 },
  hasServicesEnabledAsync: jest.fn(),
  requestForegroundPermissionsAsync: jest.fn(),
  startLocationUpdatesAsync: jest.fn(),
  stopLocationUpdatesAsync: jest.fn(),
  hasStartedLocationUpdatesAsync: jest.fn(),
}));
jest.mock('../../src/services/LogService', () => ({ addLog: jest.fn() }));

import {
  GPS_RECORDING_TASK_NAME,
  RecordingPermissionError,
  addHeartRateSamples,
  getHeartRateSamples,
  discardRecording,
  elapsedSeconds,
  finishRecording,
  ingestFixes,
  markRecordingSaved,
  pauseRecording,
  resetRecordingStateForTests,
  resumeRecording,
  startRecording,
  type RecordingSession,
} from '../../src/services/gpsRecordingService';

const mockedLocation = Location as jest.Mocked<typeof Location>;
const notification = { title: 'Recording', body: 'Tracking' };
const DEG_PER_METER = 1 / 111_194.9;
const T0 = Date.UTC(2026, 9, 6, 10, 0, 0);

const fix = (seconds: number, metersNorth: number) => ({
  t: T0 + seconds * 1000,
  lat: 51.5 + metersNorth * DEG_PER_METER,
  lon: -0.12,
  hacc: 5,
});

// Captured at import: the task has to be registered at module scope.
const taskCall = (TaskManager.defineTask as jest.Mock).mock.calls.find(
  ([name]) => name === GPS_RECORDING_TASK_NAME
);

async function storedSession(): Promise<RecordingSession | null> {
  const raw = await AsyncStorage.getItem('@SparkyFitness/gpsRecording/session');
  return raw ? (JSON.parse(raw) as RecordingSession) : null;
}

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
  resetRecordingStateForTests();
  mockedLocation.hasServicesEnabledAsync.mockResolvedValue(true);
  mockedLocation.requestForegroundPermissionsAsync.mockResolvedValue({
    granted: true,
  } as Location.LocationPermissionResponse);
  mockedLocation.hasStartedLocationUpdatesAsync.mockResolvedValue(true);
  mockedLocation.startLocationUpdatesAsync.mockResolvedValue(undefined);
  mockedLocation.stopLocationUpdatesAsync.mockResolvedValue(undefined);
});

describe('starting', () => {
  it('registers the location task at module scope', () => {
    expect(taskCall).toBeDefined();
  });

  it('asks for while-using permission and starts a foreground-service task', async () => {
    await startRecording({ activity: 'run', notification });

    expect(mockedLocation.requestForegroundPermissionsAsync).toHaveBeenCalled();
    expect(mockedLocation.startLocationUpdatesAsync).toHaveBeenCalledWith(
      GPS_RECORDING_TASK_NAME,
      expect.objectContaining({
        showsBackgroundLocationIndicator: true,
        foregroundService: expect.objectContaining({
          notificationTitle: 'Recording',
          killServiceOnDestroy: false,
        }),
      })
    );
    expect((await storedSession())?.status).toBe('recording');
  });

  it('does not record when permission is denied', async () => {
    mockedLocation.requestForegroundPermissionsAsync.mockResolvedValue({
      granted: false,
    } as Location.LocationPermissionResponse);

    await expect(
      startRecording({ activity: 'walk', notification })
    ).rejects.toMatchObject({ reason: 'denied' });
    expect(mockedLocation.startLocationUpdatesAsync).not.toHaveBeenCalled();
    expect(await storedSession()).toBeNull();
  });

  it('reports location services being off', async () => {
    mockedLocation.hasServicesEnabledAsync.mockResolvedValue(false);
    await expect(
      startRecording({ activity: 'walk', notification })
    ).rejects.toBeInstanceOf(RecordingPermissionError);
  });

  it('leaves no session behind when the task fails to start', async () => {
    mockedLocation.startLocationUpdatesAsync.mockRejectedValue(
      new Error('boom')
    );
    await expect(
      startRecording({ activity: 'ride', notification })
    ).rejects.toThrow('boom');
    expect(await storedSession()).toBeNull();
  });
});

describe('collecting fixes', () => {
  it('picks the track back up after the app is killed and relaunched', async () => {
    await startRecording({ activity: 'run', notification });
    await ingestFixes([fix(0, 0), fix(5, 15), fix(10, 30)]);

    // A fresh JS context: nothing in memory, everything on disk.
    resetRecordingStateForTests();
    await ingestFixes([fix(15, 45)]);

    const raw = await AsyncStorage.getItem(
      '@SparkyFitness/gpsRecording/chunk/0'
    );
    expect(JSON.parse(raw as string)).toHaveLength(4);
    expect((await storedSession())?.status).toBe('recording');
  });

  it('drops glitches and keeps the rest', async () => {
    await startRecording({ activity: 'run', notification });
    await ingestFixes([fix(0, 0), fix(5, 5000), fix(10, 30)]);
    const raw = await AsyncStorage.getItem(
      '@SparkyFitness/gpsRecording/chunk/0'
    );
    expect(JSON.parse(raw as string)).toHaveLength(2);
  });

  it('chunks a long track', async () => {
    await startRecording({ activity: 'ride', notification });
    const fixes = Array.from({ length: 250 }, (_, i) => fix(i * 5, i * 20));
    await ingestFixes(fixes);
    const chunks = await Promise.all(
      [0, 1, 2, 3].map((i) =>
        AsyncStorage.getItem(`@SparkyFitness/gpsRecording/chunk/${i}`)
      )
    );
    expect(JSON.parse(chunks[0] as string)).toHaveLength(100);
    expect(JSON.parse(chunks[1] as string)).toHaveLength(100);
    expect(JSON.parse(chunks[2] as string)).toHaveLength(50);
    expect(chunks[3]).toBeNull();
  });

  it('ignores fixes while paused', async () => {
    await startRecording({ activity: 'run', notification });
    await ingestFixes([fix(0, 0)]);
    await pauseRecording();
    await ingestFixes([fix(5, 15)]);
    const raw = await AsyncStorage.getItem(
      '@SparkyFitness/gpsRecording/chunk/0'
    );
    expect(JSON.parse(raw as string)).toHaveLength(1);
  });

  it('keeps the location task running through a pause', async () => {
    await startRecording({ activity: 'run', notification });
    await pauseRecording();
    expect(mockedLocation.stopLocationUpdatesAsync).not.toHaveBeenCalled();
    expect((await storedSession())?.status).toBe('paused');
  });

  it('resumes without starting the task again when it is still running', async () => {
    await startRecording({ activity: 'run', notification });
    await pauseRecording();
    await resumeRecording(notification);
    expect(mockedLocation.startLocationUpdatesAsync).toHaveBeenCalledTimes(1);
    expect((await storedSession())?.status).toBe('recording');
  });

  it('starts the task again on resume when the OS dropped it', async () => {
    await startRecording({ activity: 'run', notification });
    await pauseRecording();
    mockedLocation.hasStartedLocationUpdatesAsync.mockResolvedValueOnce(false);
    await resumeRecording(notification);
    expect(mockedLocation.startLocationUpdatesAsync).toHaveBeenCalledTimes(2);
  });

  it('starts a new segment on resume so the pause is not counted as distance', async () => {
    await startRecording({ activity: 'run', notification });
    await ingestFixes([fix(0, 0), fix(5, 15)]);
    await pauseRecording();
    await resumeRecording(notification);
    // Far from the last fix: a jump, but across a pause.
    await ingestFixes([fix(600, 5000)]);
    const raw = await AsyncStorage.getItem(
      '@SparkyFitness/gpsRecording/chunk/0'
    );
    const stored = JSON.parse(raw as string) as { seg: number }[];
    expect(stored.map((p) => p.seg)).toEqual([0, 0, 1]);
  });
});

describe('finishing and discarding', () => {
  it('stops collecting on finish and keeps the track for saving', async () => {
    await startRecording({ activity: 'walk', notification });
    await ingestFixes([fix(0, 0), fix(5, 8)]);
    await finishRecording();
    await ingestFixes([fix(10, 16)]);

    const session = await storedSession();
    expect(session?.status).toBe('finished');
    expect(session?.finishedAt).not.toBeNull();
    const raw = await AsyncStorage.getItem(
      '@SparkyFitness/gpsRecording/chunk/0'
    );
    expect(JSON.parse(raw as string)).toHaveLength(2);
  });

  it('remembers the saved entry id so a retry does not duplicate it', async () => {
    await startRecording({ activity: 'walk', notification });
    await markRecordingSaved('entry-1');
    expect((await storedSession())?.savedEntryId).toBe('entry-1');
  });

  it('clears the session and every chunk on discard', async () => {
    await startRecording({ activity: 'ride', notification });
    await ingestFixes(
      Array.from({ length: 120 }, (_, i) => fix(i * 5, i * 20))
    );
    await discardRecording();

    expect(await storedSession()).toBeNull();
    expect(
      await AsyncStorage.getItem('@SparkyFitness/gpsRecording/chunk/0')
    ).toBeNull();
    expect(
      await AsyncStorage.getItem('@SparkyFitness/gpsRecording/chunk/1')
    ).toBeNull();
  });
});

describe('elapsedSeconds', () => {
  const base: RecordingSession = {
    id: 'rec-1',
    activity: 'run',
    status: 'recording',
    startedAt: 1_000_000,
    finishedAt: null,
    pausedAt: null,
    pausedMs: 20_000,
    seg: 1,
    savedEntryId: null,
  };

  it('removes paused time from a running clock', () => {
    expect(elapsedSeconds(base, 1_000_000 + 100_000)).toBe(80);
  });

  it('freezes while paused', () => {
    const paused = { ...base, status: 'paused' as const, pausedAt: 1_050_000 };
    expect(elapsedSeconds(paused, 9_999_999)).toBe(30);
  });

  it('stops at the finish time', () => {
    const finished = {
      ...base,
      status: 'finished' as const,
      finishedAt: 1_070_000,
    };
    expect(elapsedSeconds(finished, 9_999_999)).toBe(50);
  });
});

describe('watch heart rate', () => {
  it('keeps readings for the live recording, sorted, and drops repeats of a batch', async () => {
    await startRecording({ activity: 'run', notification });
    const id = (await storedSession())!.id;

    await addHeartRateSamples(id, 'b2', [{ t: T0 + 60_000, bpm: 150 }]);
    await addHeartRateSamples(id, 'b1', [{ t: T0 + 30_000, bpm: 140 }]);
    await addHeartRateSamples(id, 'b1', [{ t: T0 + 30_000, bpm: 140 }]);

    expect(await getHeartRateSamples()).toEqual([
      { t: T0 + 30_000, bpm: 140 },
      { t: T0 + 60_000, bpm: 150 },
    ]);
  });

  it('ignores another recording and implausible readings', async () => {
    await startRecording({ activity: 'run', notification });
    const id = (await storedSession())!.id;

    await addHeartRateSamples('rec-other', 'b1', [{ t: T0, bpm: 140 }]);
    await addHeartRateSamples(id, 'b2', [
      { t: T0, bpm: 0 },
      { t: T0, bpm: 400 },
    ]);

    expect(await getHeartRateSamples()).toEqual([]);
  });

  it('still takes a late batch after Finish and is cleared by discard', async () => {
    await startRecording({ activity: 'run', notification });
    const id = (await storedSession())!.id;
    await finishRecording();

    await addHeartRateSamples(id, 'late', [{ t: T0, bpm: 120 }]);
    expect(await getHeartRateSamples()).toHaveLength(1);

    await discardRecording();
    expect(await getHeartRateSamples()).toEqual([]);
    expect(
      await AsyncStorage.getItem('@SparkyFitness/gpsRecording/heartRate')
    ).toBeNull();
  });

  it('survives a restart', async () => {
    await startRecording({ activity: 'run', notification });
    const id = (await storedSession())!.id;
    await addHeartRateSamples(id, 'b1', [{ t: T0, bpm: 130 }]);

    resetRecordingStateForTests();

    expect(await getHeartRateSamples()).toEqual([{ t: T0, bpm: 130 }]);
  });
});

describe('pause edge cases', () => {
  it('keeps the time recorded before a pause when finishing while paused', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(T0);
    await startRecording({ activity: 'run', notification });
    // 30 minutes in, pause, then wait 10 minutes before Finish.
    jest.spyOn(Date, 'now').mockReturnValue(T0 + 30 * 60_000);
    await pauseRecording();
    jest.spyOn(Date, 'now').mockReturnValue(T0 + 40 * 60_000);
    await finishRecording();

    const finished = (await storedSession())!;
    expect(finished.status).toBe('finished');
    expect(elapsedSeconds(finished)).toBe(30 * 60);
    jest.restoreAllMocks();
  });

  it('stays paused and can retry when resuming fails to start location updates', async () => {
    await startRecording({ activity: 'run', notification });
    await pauseRecording();
    // The task was dropped while paused, so resume has to start it again.
    mockedLocation.hasStartedLocationUpdatesAsync.mockResolvedValueOnce(false);
    mockedLocation.startLocationUpdatesAsync.mockRejectedValueOnce(
      new Error('foreground service refused')
    );

    await expect(resumeRecording(notification)).rejects.toThrow('refused');
    expect((await storedSession())?.status).toBe('paused');
    expect(mockedLocation.stopLocationUpdatesAsync).toHaveBeenCalled();

    await resumeRecording(notification);
    expect((await storedSession())?.status).toBe('recording');
  });
});

describe('indoor recording', () => {
  it('starts without asking for location or running a location task', async () => {
    await startRecording({ activity: 'walk', indoor: true, notification });

    expect(mockedLocation.hasServicesEnabledAsync).not.toHaveBeenCalled();
    expect(
      mockedLocation.requestForegroundPermissionsAsync
    ).not.toHaveBeenCalled();
    expect(mockedLocation.startLocationUpdatesAsync).not.toHaveBeenCalled();
    const stored = await storedSession();
    expect(stored?.status).toBe('recording');
    expect(stored?.indoor).toBe(true);
  });

  it('starts even when location services are off or permission is denied', async () => {
    mockedLocation.hasServicesEnabledAsync.mockResolvedValue(false);
    mockedLocation.requestForegroundPermissionsAsync.mockResolvedValue({
      granted: false,
    } as Location.LocationPermissionResponse);

    await startRecording({ activity: 'run', indoor: true, notification });

    expect((await storedSession())?.status).toBe('recording');
  });

  it('pauses and resumes without starting a location task', async () => {
    await startRecording({ activity: 'run', indoor: true, notification });
    await pauseRecording();
    mockedLocation.hasStartedLocationUpdatesAsync.mockResolvedValue(false);
    await resumeRecording(notification);

    expect(mockedLocation.startLocationUpdatesAsync).not.toHaveBeenCalled();
    expect((await storedSession())?.status).toBe('recording');
  });

  it('keeps an outdoor session outdoor', async () => {
    await startRecording({ activity: 'run', notification });
    expect((await storedSession())?.indoor).toBeUndefined();
  });
});
