import { findProgram, type RunProgramResponse } from '@workspace/shared';
import { queryClient } from '../../src/hooks/queryClient';
import { runProgramQueryKey } from '../../src/hooks/queryKeys';
import {
  fetchRunProgram,
  markRunProgramWorkoutDone,
  saveRunProgram,
} from '../../src/services/api/runProgramApi';
import {
  completeProgramWorkout,
  getProgramStatus,
  restartProgram,
  setProgramEnabled,
  setProgramPosition,
  skipProgramWorkout,
} from '../../src/services/runProgramService';

jest.mock('../../src/services/api/runProgramApi');

const stored = (
  over: Partial<RunProgramResponse> = {}
): RunProgramResponse => ({
  id: 'p1',
  program_id: 'beginner5k',
  enabled: true,
  next_index: 0,
  workouts: findProgram('beginner5k')!.workouts,
  adjustment_log: [],
  updated_at: '2026-10-10T00:00:00.000Z',
  ...over,
});

const mockedFetch = jest.mocked(fetchRunProgram);
const mockedSave = jest.mocked(saveRunProgram);
const mockedDone = jest.mocked(markRunProgramWorkoutDone);

beforeEach(() => {
  jest.resetAllMocks();
  queryClient.clear();
});

test('has no program until the server has one', async () => {
  mockedFetch.mockResolvedValue({ program: null });
  expect(await getProgramStatus()).toBeNull();
});

test('reads the place and the adjusted workouts from the server', async () => {
  const workouts = findProgram('beginner5k')!.workouts.map((w, i) =>
    i === 4 ? { ...w, plan: { ...w.plan, steps: w.plan.steps.slice(0, 3) } } : w
  );
  mockedFetch.mockResolvedValue({
    program: stored({ next_index: 4, workouts }),
  });
  const status = await getProgramStatus();
  expect(status?.done).toBe(4);
  expect(status?.workout?.plan.steps).toHaveLength(3);
});

test('a switched-off program is not reported as being used', async () => {
  mockedFetch.mockResolvedValue({ program: stored({ enabled: false }) });
  expect(await getProgramStatus()).toBeNull();
});

test('switching on starts the program and caches the answer', async () => {
  mockedSave.mockResolvedValue({ program: stored() });
  await setProgramEnabled(true, 'beginner5k');
  expect(mockedSave).toHaveBeenCalledWith({
    program_id: 'beginner5k',
    enabled: true,
  });
  expect(
    queryClient.getQueryData<RunProgramResponse>(runProgramQueryKey)?.id
  ).toBe('p1');
});

test('switching off with nothing started does nothing', async () => {
  await setProgramEnabled(false, 'beginner5k');
  expect(mockedSave).not.toHaveBeenCalled();
});

test('moves, restarts and skips relative to the cached place', async () => {
  queryClient.setQueryData(runProgramQueryKey, stored({ next_index: 3 }));
  mockedSave.mockImplementation(async (body) => ({
    program: stored({ next_index: body.next_index ?? 0 }),
  }));

  await skipProgramWorkout();
  expect(mockedSave).toHaveBeenLastCalledWith({
    program_id: 'beginner5k',
    next_index: 4,
  });
  await setProgramPosition(13);
  expect(mockedSave).toHaveBeenLastCalledWith({
    program_id: 'beginner5k',
    next_index: 13,
  });
  await restartProgram();
  expect(mockedSave).toHaveBeenLastCalledWith({
    program_id: 'beginner5k',
    next_index: 0,
  });
});

test('a move without a program does nothing', async () => {
  await setProgramPosition(5);
  expect(mockedSave).not.toHaveBeenCalled();
});

test('completing a workout sends its index and caches the result', async () => {
  mockedDone.mockResolvedValue({ program: stored({ next_index: 1 }) });
  await completeProgramWorkout('beginner5k', 0);
  expect(mockedDone).toHaveBeenCalledWith({ index: 0 });
  expect(
    queryClient.getQueryData<RunProgramResponse>(runProgramQueryKey)?.next_index
  ).toBe(1);
});
