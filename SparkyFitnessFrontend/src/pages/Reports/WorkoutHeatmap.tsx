import { useLayoutEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { info } from '@/utils/logging';
import { usePreferences } from '@/contexts/PreferencesContext';
import {
  buildWorkoutContributionGrid,
  type HeatmapWeekdayKey,
} from '@/utils/workoutHeatmap';

interface WorkoutHeatmapProps {
  workoutDates: string[];
  startDate?: string | null;
  endDate?: string | null;
}

const WEEKDAY_SHORT: Record<HeatmapWeekdayKey, string> = {
  sunday: 'S',
  monday: 'M',
  tuesday: 'Tu',
  wednesday: 'W',
  thursday: 'Th',
  friday: 'F',
  saturday: 'S',
};

const WorkoutHeatmap = ({
  workoutDates,
  startDate,
  endDate,
}: WorkoutHeatmapProps) => {
  const { t } = useTranslation();
  const { loggingLevel, firstDayOfWeek: prefFirstDayOfWeek } = usePreferences();
  info(loggingLevel, 'WorkoutHeatmap: Rendering component.');
  const scrollerRef = useRef<HTMLDivElement>(null);

  const grid = useMemo(
    () =>
      buildWorkoutContributionGrid({
        workoutDates,
        today: new Date(),
        firstDayOfWeek: prefFirstDayOfWeek,
        startDate,
        endDate,
      }),
    [workoutDates, startDate, endDate, prefFirstDayOfWeek]
  );

  useLayoutEffect(() => {
    const node = scrollerRef.current;
    if (!node) return;
    node.scrollLeft = node.scrollWidth;
  }, [grid.weeks.length, startDate, endDate]);

  const compact = grid.weeks.length > 12;

  return (
    <Card className="h-full border shadow-sm">
      <CardHeader>
        <CardTitle>
          {t('exerciseReportsDashboard.workoutHeatmap', 'Workout Heatmap')}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div ref={scrollerRef} className="overflow-x-auto">
          <div className="inline-flex gap-1">
            <div className="flex flex-col gap-[3px] pt-5 shrink-0">
              {grid.weekdayKeys.map((key) => (
                <div
                  key={key}
                  className={`${
                    compact ? 'h-3' : 'h-4'
                  } w-4 text-[9px] leading-none flex items-center text-muted-foreground`}
                >
                  {t(`common.day_short.${key}`, WEEKDAY_SHORT[key])}
                </div>
              ))}
            </div>
            <div className="flex gap-[3px]">
              {grid.weeks.map((week, weekIndex) => (
                <div
                  key={week.days[0]?.dayKey ?? weekIndex}
                  className="flex flex-col gap-[3px]"
                >
                  <div className="h-4 text-[10px] leading-4 text-muted-foreground whitespace-nowrap">
                    {week.monthLabel ?? ''}
                  </div>
                  {week.days.map((cell) => {
                    const title = cell.inRange
                      ? `${cell.dayKey} (${
                          cell.hasWorkout
                            ? t('exerciseReportsDashboard.workout', 'Workout')
                            : t(
                                'exerciseReportsDashboard.noWorkout',
                                'No Workout'
                              )
                        })`
                      : '';
                    return (
                      <div
                        key={cell.dayKey}
                        title={title}
                        aria-label={title || undefined}
                        className={`${
                          compact ? 'w-3 h-3' : 'w-4 h-4'
                        } rounded-[3px] ${
                          !cell.inRange
                            ? 'bg-transparent'
                            : cell.hasWorkout
                              ? 'bg-green-500'
                              : 'bg-muted'
                        }`}
                      />
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default WorkoutHeatmap;
