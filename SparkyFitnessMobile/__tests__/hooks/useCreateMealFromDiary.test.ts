import { renderHook, waitFor, act } from '@testing-library/react-native';
import { useCreateMealFromDiary } from '../../src/hooks/useCreateMealFromDiary';
import { createMealFromDiary } from '../../src/services/api/mealsApi';
import {
  createTestQueryClient,
  createQueryWrapper,
  type QueryClient,
} from './queryTestUtils';

jest.mock('../../src/services/api/mealsApi', () => ({
  createMealFromDiary: jest.fn(),
}));

jest.mock('react-native-toast-message', () => ({
  show: jest.fn(),
}));

const mockCreate = createMealFromDiary as jest.MockedFunction<
  typeof createMealFromDiary
>;

const payload = {
  date: '2026-05-15',
  mealType: 'breakfast',
  mealName: 'Breakfast - 2026-05-15',
  description: null,
  isPublic: false,
};

describe('useCreateMealFromDiary', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    jest.clearAllMocks();
    queryClient = createTestQueryClient();
  });

  afterEach(() => {
    queryClient.clear();
  });

  test('invalidates meal caches and calls onSuccess after a successful create', async () => {
    const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');
    const onSuccess = jest.fn();
    mockCreate.mockResolvedValue({ id: 'meal-1' } as never);

    const { result } = renderHook(() => useCreateMealFromDiary({ onSuccess }), {
      wrapper: createQueryWrapper(queryClient),
    });

    act(() => {
      result.current.createMeal(payload);
    });

    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalledWith(payload);
    });
    expect(mockCreate).toHaveBeenCalledWith(payload);
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['meals'] });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['mealDetail', 'meal-1'],
    });
  });

  test('does not call onSuccess when the request fails', async () => {
    const onSuccess = jest.fn();
    mockCreate.mockRejectedValue(new Error('boom'));

    const { result } = renderHook(() => useCreateMealFromDiary({ onSuccess }), {
      wrapper: createQueryWrapper(queryClient),
    });

    act(() => {
      result.current.createMeal(payload);
    });

    await waitFor(() => expect(result.current.isPending).toBe(false));
    expect(onSuccess).not.toHaveBeenCalled();
  });
});
