import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { WorkoutDayCount } from '@workspace/shared';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { usePreferences } from '@/contexts/PreferencesContext';
import { dayString, heatmapMonthsEndingAt } from '@/utils/workoutHeatmap';

function intensityClass(count: number): string {
  if (count >= 3) return 'bg-green-700 text-white';
  if (count === 2) return 'bg-green-600 text-white';
  return 'bg-green-500 text-white';
}

interface WorkoutHeatmapProps {
  /** Days with workouts in the heatmap window (sparse). */
  workoutDays: WorkoutDayCount[];
  /** Today (YYYY-MM-DD, user timezone); the heatmap ends on this month. */
  today: string;
  /** The report's filtered range; days inside it are outlined. */
  rangeStart?: string;
  rangeEnd?: string;
}

const WorkoutHeatmap = ({
  workoutDays,
  today,
  rangeStart,
  rangeEnd,
}: WorkoutHeatmapProps) => {
  const { t, i18n } = useTranslation();
  const { firstDayOfWeek: prefFirstDayOfWeek } = usePreferences();

  const countsByDay = useMemo(
    () => new Map(workoutDays.map((d) => [d.date, d.count])),
    [workoutDays]
  );
  const months = useMemo(() => heatmapMonthsEndingAt(today), [today]);
  const monthFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(i18n.language, {
        month: 'short',
        timeZone: 'UTC',
      }),
    [i18n.language]
  );

  const inRange = (day: string) =>
    rangeStart != null &&
    rangeEnd != null &&
    day >= rangeStart &&
    day <= rangeEnd;

  const baseDays = [
    { key: 'sunday', label: 'S' },
    { key: 'monday', label: 'M' },
    { key: 'tuesday', label: 'Tu' },
    { key: 'wednesday', label: 'W' },
    { key: 'thursday', label: 'Th' },
    { key: 'friday', label: 'F' },
    { key: 'saturday', label: 'S' },
  ];
  const shiftedDays = [
    ...baseDays.slice(prefFirstDayOfWeek),
    ...baseDays.slice(0, prefFirstDayOfWeek),
  ];

  return (
    <Card className="h-full border shadow-sm">
      <CardHeader>
        <CardTitle>
          {t('exerciseReportsDashboard.workoutHeatmap', 'Workout Heatmap')}
        </CardTitle>
        {rangeStart && rangeEnd && (
          <p className="text-xs text-muted-foreground">
            {t(
              'exerciseReportsDashboard.heatmapRangeHint',
              'Last 12 months. Outlined days are in the selected date range.'
            )}
          </p>
        )}
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-3 xl:grid-cols-3 gap-4">
          {months.map(({ year, month }) => {
            const daysInMonth = new Date(
              Date.UTC(year, month + 1, 0)
            ).getUTCDate();
            const firstWeekday = new Date(Date.UTC(year, month, 1)).getUTCDay();
            const leadingEmpty = (firstWeekday - prefFirstDayOfWeek + 7) % 7;
            return (
              <div
                key={`${year}-${month}`}
                className="flex flex-col items-center"
              >
                <h4 className="text-sm font-semibold mb-2">
                  {monthFormatter.format(Date.UTC(year, month, 1))} {year}
                </h4>
                <div
                  className="grid grid-cols-7 gap-1"
                  style={{ gridTemplateColumns: 'repeat(7, minmax(0, 1fr))' }}
                >
                  {shiftedDays.map((day) => (
                    <div
                      key={day.key}
                      className="text-xs text-center text-muted-foreground"
                    >
                      {t(`common.day_short.${day.key}`, day.label)}
                    </div>
                  ))}
                  {Array.from({ length: leadingEmpty }, (_, i) => (
                    <div
                      key={`empty-${i}`}
                      className="w-8 h-8 md:w-5 md:h-5 rounded-md bg-gray-100 dark:bg-gray-800"
                    />
                  ))}
                  {Array.from({ length: daysInMonth }, (_, i) => {
                    const day = dayString(year, month, i + 1);
                    const count = countsByDay.get(day) ?? 0;
                    const highlighted = inRange(day);
                    const colour =
                      count > 0
                        ? intensityClass(count)
                        : 'bg-gray-200 dark:bg-gray-700';
                    const status =
                      count > 0
                        ? t('exerciseReportsDashboard.workoutCount', {
                            defaultValue: '{{count}} workout',
                            defaultValue_other: '{{count}} workouts',
                            count,
                          })
                        : t('exerciseReportsDashboard.noWorkout', 'No Workout');
                    return (
                      <div
                        key={day}
                        data-testid={`heatmap-day-${day}`}
                        data-in-range={highlighted ? 'true' : undefined}
                        className={`w-8 h-8 md:w-5 md:h-5 rounded-md flex items-center justify-center text-center text-[10px] md:text-[8px] ${colour} ${
                          highlighted
                            ? 'ring-1 ring-primary ring-offset-1 ring-offset-background'
                            : ''
                        }`}
                        title={`${day} (${status})`}
                      >
                        {i + 1}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
};

export default WorkoutHeatmap;
