import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { CheckCircle2, Flame, Plus, Trash2 } from 'lucide-react';
import { addDays, todayInZone } from '@workspace/shared';
import DayNavigator from '@/components/DayNavigator';
import ConfirmationDialog from '@/components/ui/ConfirmationDialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { usePreferences } from '@/contexts/PreferencesContext';
import {
  useCreateHabit,
  useDeleteHabit,
  useHabitLogs,
  useHabits,
  useLogHabit,
} from '@/hooks/useHabits';
import { computeStreak } from './habitUtils';

const STREAK_LOOKBACK_DAYS = 60;

export default function Habits() {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const preferences = usePreferences();
  const timezone =
    preferences?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
  const today = todayInZone(timezone);
  const selectedDate = searchParams.get('date') || today;

  const [newName, setNewName] = useState('');
  const [habitToDelete, setHabitToDelete] = useState<string | null>(null);

  const { data: habits = [], isLoading } = useHabits();
  const { data: logs = [] } = useHabitLogs(
    addDays(selectedDate, -STREAK_LOOKBACK_DAYS),
    selectedDate
  );
  const createHabit = useCreateHabit();
  const logHabit = useLogHabit();
  const deleteHabit = useDeleteHabit();

  const completedToday = useMemo(
    () =>
      new Set(
        logs
          .filter((l) => l.entry_date === selectedDate && l.completed)
          .map((l) => l.habit_id)
      ),
    [logs, selectedDate]
  );
  const doneCount = habits.filter((h) => completedToday.has(h.id)).length;

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return;
    createHabit.mutate(name, { onSuccess: () => setNewName('') });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold">
            {t('habits.title', 'Habits & Supplements')}
          </h1>
          <p className="text-sm text-muted-foreground">
            {t(
              'habits.subtitle',
              'Tick off daily habits and supplements and keep your streaks going.'
            )}
          </p>
        </div>
        <DayNavigator
          selectedDate={selectedDate}
          onDateChange={(d) => setSearchParams({ date: d })}
          className="flex items-center justify-end gap-2 mb-0"
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5" />
            {t('habits.checklistTitle', 'Checklist')}
          </CardTitle>
          <CardDescription>
            {t('habits.progress', '{{done}} of {{total}} done', {
              done: doneCount,
              total: habits.length,
            })}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {!isLoading && habits.length === 0 && (
            <p className="text-sm text-muted-foreground">
              {t(
                'habits.empty',
                'No habits yet. Add one below, for example "Vitamin D" or "Stretch".'
              )}
            </p>
          )}
          {habits.map((habit) => {
            const label = habit.display_name || habit.name;
            const streak = computeStreak(logs, habit.id, selectedDate);
            return (
              <div
                key={habit.id}
                className="flex items-center gap-3 rounded-md border p-3"
              >
                <Checkbox
                  id={`habit-${habit.id}`}
                  aria-label={label}
                  checked={completedToday.has(habit.id)}
                  disabled={logHabit.isPending}
                  onCheckedChange={(checked) =>
                    logHabit.mutate({
                      habitId: habit.id,
                      date: selectedDate,
                      completed: checked === true,
                    })
                  }
                />
                <label
                  htmlFor={`habit-${habit.id}`}
                  className="flex-1 cursor-pointer"
                >
                  {label}
                </label>
                {streak > 0 && (
                  <span className="flex items-center gap-1 text-sm text-orange-500">
                    <Flame className="h-4 w-4" />
                    {t('habits.streakDays', '{{count}} day streak', {
                      count: streak,
                    })}
                  </span>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={t('habits.delete', 'Delete habit')}
                  onClick={() => setHabitToDelete(habit.id)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            );
          })}

          <form onSubmit={handleAdd} className="flex gap-2 pt-2">
            <Input
              value={newName}
              maxLength={50}
              onChange={(e) => setNewName(e.target.value)}
              placeholder={t(
                'habits.addPlaceholder',
                'New habit or supplement'
              )}
              aria-label={t('habits.addPlaceholder', 'New habit or supplement')}
            />
            <Button
              type="submit"
              disabled={!newName.trim() || createHabit.isPending}
            >
              <Plus className="mr-1 h-4 w-4" />
              {t('habits.add', 'Add')}
            </Button>
          </form>
        </CardContent>
      </Card>

      <ConfirmationDialog
        open={habitToDelete !== null}
        onOpenChange={(open) => !open && setHabitToDelete(null)}
        onConfirm={() => {
          if (habitToDelete) deleteHabit.mutate(habitToDelete);
          setHabitToDelete(null);
        }}
        title={t('habits.deleteTitle', 'Delete habit?')}
        description={t(
          'habits.deleteDescription',
          'This removes the habit and all of its history.'
        )}
        variant="destructive"
      />
    </div>
  );
}
