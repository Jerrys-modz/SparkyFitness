import { renderHook, act, waitFor } from '@testing-library/react-native';
import Toast from 'react-native-toast-message';
import {
  WORKOUT_PROGRAM_FILE_FORMAT,
  WORKOUT_PROGRAM_FILE_VERSION,
  type WorkoutProgramFile,
} from '@workspace/shared';
import {
  useImportWorkoutProgram,
  useShareWorkoutProgram,
} from '../../src/hooks/useWorkoutProgramSharing';
import {
  exportWorkoutPlan,
  exportWorkoutPreset,
  importWorkoutProgram,
} from '../../src/services/api/workoutProgramsApi';
import { shareWorkoutProgramFile } from '../../src/services/workoutProgramFiles';
import {
  createTestQueryClient,
  createQueryWrapper,
  type QueryClient,
} from './queryTestUtils';

jest.mock('../../src/services/api/workoutProgramsApi', () => ({
  exportWorkoutPlan: jest.fn(),
  exportWorkoutPreset: jest.fn(),
  importWorkoutProgram: jest.fn(),
}));
jest.mock('../../src/services/workoutProgramFiles', () => ({
  shareWorkoutProgramFile: jest.fn(),
}));

const program: WorkoutProgramFile = {
  format: WORKOUT_PROGRAM_FILE_FORMAT,
  version: WORKOUT_PROGRAM_FILE_VERSION,
  exercises: [{ key: 'e1', name: 'Push Up' }],
  presets: [
    {
      key: 'p1',
      name: 'Push Day',
      workoutFormat: 'standard',
      exercises: [{ exercise: 'e1', sets: [{ setNumber: 1, reps: 10 }] }],
    },
  ],
  plan: null,
};

describe('useWorkoutProgramSharing', () => {
  let queryClient: QueryClient;
  let wrapper: ReturnType<typeof createQueryWrapper>;

  beforeEach(() => {
    jest.clearAllMocks();
    queryClient = createTestQueryClient();
    wrapper = createQueryWrapper(queryClient);
  });

  afterEach(() => queryClient.clear());

  it('exports a preset and opens the share sheet with it', async () => {
    jest.mocked(exportWorkoutPreset).mockResolvedValue(program);
    jest.mocked(shareWorkoutProgramFile).mockResolvedValue(true);
    const { result } = renderHook(() => useShareWorkoutProgram(), { wrapper });

    act(() => {
      result.current.shareProgram({ kind: 'preset', id: 11, name: 'Push Day' });
    });

    await waitFor(() =>
      expect(shareWorkoutProgramFile).toHaveBeenCalledWith(program, 'Push Day')
    );
    expect(exportWorkoutPreset).toHaveBeenCalledWith(11);
    expect(exportWorkoutPlan).not.toHaveBeenCalled();
  });

  it('shows an error toast when a plan cannot be exported', async () => {
    jest.mocked(exportWorkoutPlan).mockRejectedValue(new Error('404'));
    const { result } = renderHook(() => useShareWorkoutProgram(), { wrapper });

    act(() => {
      result.current.shareProgram({ kind: 'plan', id: 3, name: 'Week' });
    });

    await waitFor(() =>
      expect(Toast.show).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'error',
          text1: 'Could not share the workout',
        })
      )
    );
    expect(shareWorkoutProgramFile).not.toHaveBeenCalled();
  });

  it('imports a file and refreshes the preset and plan caches', async () => {
    jest.mocked(importWorkoutProgram).mockResolvedValue({
      planId: null,
      presetIds: { p1: 5 },
      addedExerciseCount: 1,
    });
    const invalidate = jest.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() => useImportWorkoutProgram(), { wrapper });

    await act(async () => {
      await result.current.importProgramAsync({ program, activate: false });
    });

    expect(importWorkoutProgram).toHaveBeenCalledWith({
      program,
      activate: false,
    });
    const keys = invalidate.mock.calls.map((call) => call[0]?.queryKey);
    expect(keys).toContainEqual(['workoutPresets']);
    expect(keys).toContainEqual(['workoutPlanTemplates']);
  });
});
