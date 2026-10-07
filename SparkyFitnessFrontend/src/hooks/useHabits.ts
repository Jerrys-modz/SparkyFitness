import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as habitService from '@/api/Habits/habitService';
import { habitKeys } from '@/api/keys/habits';

export const useHabits = () =>
  useQuery({
    queryKey: habitKeys.list(),
    queryFn: habitService.listHabits,
    meta: { errorMessage: 'Failed to load your habits.' },
  });

export const useHabitLogs = (startDate: string, endDate: string) =>
  useQuery({
    queryKey: habitKeys.logs(startDate, endDate),
    queryFn: () => habitService.listHabitLogs(startDate, endDate),
    meta: { errorMessage: 'Failed to load habit history.' },
  });

export const useCreateHabit = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: habitService.createHabit,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: habitKeys.all }),
    meta: { errorMessage: 'Failed to create habit.' },
  });
};

export const useLogHabit = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (v: { habitId: string; date: string; completed: boolean }) =>
      habitService.logHabit(v.habitId, v.date, v.completed),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: [...habitKeys.all, 'logs'],
      }),
    meta: { errorMessage: 'Failed to update habit.' },
  });
};

export const useDeleteHabit = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: habitService.deleteHabit,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: habitKeys.all }),
    meta: { errorMessage: 'Failed to delete habit.' },
  });
};
