import { renderHook, act } from '@testing-library/react-native';
import Toast from 'react-native-toast-message';
import { useImportWorkoutSplit } from '../../src/hooks/useImportWorkoutSplit';
import { ApiError } from '../../src/services/api/errors';
import { importWorkoutSplit } from '../../src/services/api/workoutSplitsApi';
import {
  createTestQueryClient,
  createQueryWrapper,
  type QueryClient,
} from './queryTestUtils';

jest.mock('../../src/services/api/workoutSplitsApi', () => ({
  importWorkoutSplit: jest.fn(),
}));

const mockImport = importWorkoutSplit as jest.MockedFunction<
  typeof importWorkoutSplit
>;

const variables = {
  splitId: 'linear_5x5',
  body: {
    planName: 'Starter',
    sessionNames: { workout_a: 'A', workout_b: 'B' },
    activate: false,
  },
};

describe('useImportWorkoutSplit', () => {
  let queryClient: QueryClient;
  let wrapper: ReturnType<typeof createQueryWrapper>;

  beforeEach(() => {
    jest.clearAllMocks();
    queryClient = createTestQueryClient();
    wrapper = createQueryWrapper(queryClient);
  });

  afterEach(() => queryClient.clear());

  it('sends the split and refreshes the preset and plan caches', async () => {
    mockImport.mockResolvedValue({
      planId: 7,
      presetIds: { workout_a: 1, workout_b: 2 },
      addedExerciseCount: 3,
    });
    const invalidate = jest.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() => useImportWorkoutSplit(), { wrapper });

    await act(async () => {
      await result.current.importSplitAsync(variables);
    });

    expect(mockImport).toHaveBeenCalledWith('linear_5x5', variables.body);
    const keys = invalidate.mock.calls.map((call) => call[0]?.queryKey);
    expect(keys).toContainEqual(['workoutPresets']);
    expect(keys).toContainEqual(['workoutPlanTemplates']);
  });

  it('shows an error toast and rethrows when the import fails', async () => {
    mockImport.mockRejectedValue(new Error('502'));
    const { result } = renderHook(() => useImportWorkoutSplit(), { wrapper });

    await act(async () => {
      await expect(result.current.importSplitAsync(variables)).rejects.toThrow(
        '502'
      );
    });

    expect(Toast.show).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'error',
        text1: 'Could not add the program',
      })
    );
  });

  it('shows the server\u2019s reason when it gives one', async () => {
    mockImport.mockRejectedValue(
      new ApiError(
        'bad gateway',
        502,
        JSON.stringify({ error: 'Some exercises could not be added.' })
      )
    );
    const { result } = renderHook(() => useImportWorkoutSplit(), { wrapper });

    await act(async () => {
      await expect(
        result.current.importSplitAsync(variables)
      ).rejects.toThrow();
    });

    expect(Toast.show).toHaveBeenCalledWith(
      expect.objectContaining({ text2: 'Some exercises could not be added.' })
    );
  });
});
