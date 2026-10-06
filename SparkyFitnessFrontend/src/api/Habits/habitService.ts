import type { Habit, HabitLog } from '@workspace/shared';
import { api } from '@/api/api';

export const listHabits = async (): Promise<Habit[]> => api.get('/habits');

export const listHabitLogs = async (
  startDate: string,
  endDate: string
): Promise<HabitLog[]> =>
  api.get('/habits/logs', { params: { startDate, endDate } });

export const createHabit = async (name: string): Promise<Habit> =>
  api.post('/habits', { body: { name } });

export const logHabit = async (
  habitId: string,
  entryDate: string,
  completed: boolean
): Promise<void> => {
  await api.put(`/habits/${habitId}/log`, {
    body: { entry_date: entryDate, completed },
  });
};

export const deleteHabit = async (habitId: string): Promise<void> => {
  await api.delete(`/habits/${habitId}`);
};
