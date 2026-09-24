import { useLayoutEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useActiveUser } from '@/contexts/ActiveUserContext';
import { useExerciseActivities } from '@/hooks/Reports/useExerciseStats';
import ActivityReportVisualizer from '@/pages/Reports/ActivityReportVisualizer';
import type { ExerciseActivityQueryItem } from '@workspace/shared';

interface CardioSessionListProps {
  startDate: string | null;
  endDate: string | null;
  unitSystem: 'metric' | 'imperial';
  formatDate: (date: Date, formatStr: string) => string;
  parseISO: (dateString: string) => Date;
}

function dayLabel(
  entryDate: string,
  formatDate: CardioSessionListProps['formatDate'],
  parseISO: CardioSessionListProps['parseISO'],
  todayWord: string,
  yesterdayWord: string
): string {
  const date = parseISO(entryDate);
  const today = formatDate(new Date(), 'yyyy-MM-dd');
  const yesterday = formatDate(
    new Date(Date.now() - 24 * 60 * 60 * 1000),
    'yyyy-MM-dd'
  );
  const key = formatDate(date, 'yyyy-MM-dd');
  if (key === today) return todayWord;
  if (key === yesterday) return yesterdayWord;
  const ageDays =
    (parseISO(today).getTime() - parseISO(key).getTime()) / 86_400_000;
  if (ageDays > 0 && ageDays < 7) return formatDate(date, 'EEEE');
  return formatDate(date, 'MMM d');
}

function headline(
  item: ExerciseActivityQueryItem,
  distanceUnit: string
): { value: string; unit: string } {
  if (item.distanceFormatted != null && item.distanceFormatted > 0) {
    const n = item.distanceFormatted;
    return {
      value: n >= 10 ? n.toFixed(1) : n.toFixed(2),
      unit: distanceUnit === 'miles' ? 'MI' : 'KM',
    };
  }
  if (item.caloriesBurned > 0) {
    return { value: String(Math.round(item.caloriesBurned)), unit: 'CAL' };
  }
  return { value: String(Math.round(item.durationMinutes)), unit: 'MIN' };
}

export const CardioSessionList = ({
  startDate,
  endDate,
  unitSystem,
  formatDate,
  parseISO,
}: CardioSessionListProps) => {
  const { t } = useTranslation();
  const { activeUserId } = useActiveUser();
  const [page, setPage] = useState(1);
  const [openId, setOpenId] = useState<string | null>(null);
  const [earlier, setEarlier] = useState<ExerciseActivityQueryItem[]>([]);
  // Closing the session above the tap shortens the list, so the row jumps
  // up and the page looks like it scrolled down. Put the row back.
  const stickRow = useRef<{ el: HTMLElement; top: number } | null>(null);
  useLayoutEffect(() => {
    const stuck = stickRow.current;
    if (!stuck) return;
    stickRow.current = null;
    const delta = stuck.el.getBoundingClientRect().top - stuck.top;
    if (Math.abs(delta) > 1) window.scrollBy(0, delta);
  }, [openId]);
  const { data, isLoading } = useExerciseActivities(
    startDate,
    endDate,
    activeUserId ?? undefined,
    unitSystem,
    page
  );
  const items =
    page === 1
      ? (data?.items ?? [])
      : data?.page === page
        ? [...earlier, ...data.items]
        : earlier;
  const distanceUnit = unitSystem === 'imperial' ? 'miles' : 'km';

  const groups: { label: string; items: ExerciseActivityQueryItem[] }[] = [];
  for (const item of items) {
    const label = formatDate(parseISO(item.entryDate), 'MMMM yyyy');
    const last = groups[groups.length - 1];
    if (!last || last.label !== label) {
      groups.push({ label, items: [item] });
    } else {
      last.items.push(item);
    }
  }

  return (
    <div className="space-y-4 [overflow-anchor:none]">
      <div>
        <h2 className="text-lg font-semibold">
          {t('exerciseAnalytics.cardio.sessionsTitle', 'Sessions')}
        </h2>
        <p className="text-xs text-muted-foreground">
          {t(
            'exerciseAnalytics.cardio.sessionsHint',
            'Tap a workout for its route and heart rate.'
          )}
        </p>
      </div>
      {isLoading && items.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {t('exerciseReportsDashboard.loadingExerciseData', 'Loading...')}
        </p>
      ) : items.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {t(
            'exerciseAnalytics.cardio.noSessions',
            'No cardio workouts in this date range.'
          )}
        </p>
      ) : (
        groups.map((group) => (
          <section key={group.label} className="space-y-2">
            <h3 className="text-sm font-semibold">{group.label}</h3>
            {group.items.map((item) => {
              const open = openId === item.id;
              const stat = headline(item, distanceUnit);
              return (
                <div key={item.id} className="rounded-xl border bg-card">
                  <button
                    type="button"
                    className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
                    aria-expanded={open}
                    onClick={(event) => {
                      stickRow.current = {
                        el: event.currentTarget,
                        top: event.currentTarget.getBoundingClientRect().top,
                      };
                      setOpenId(open ? null : item.id);
                    }}
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm">
                        {item.exerciseName}
                      </span>
                      <span className="block text-lg font-semibold leading-tight text-emerald-400">
                        {stat.value}
                        <span className="ml-1 text-sm">{stat.unit}</span>
                      </span>
                    </span>
                    <span className="shrink-0 text-sm text-muted-foreground">
                      {dayLabel(
                        item.entryDate,
                        formatDate,
                        parseISO,
                        t('muscleGroupRecovery.today', 'Today'),
                        t('muscleGroupRecovery.yesterday', 'Yesterday')
                      )}
                    </span>
                  </button>
                  {open && (
                    <div className="border-t px-3 py-3">
                      <ActivityReportVisualizer
                        exerciseEntryId={item.id}
                        providerName={item.source || 'garmin'}
                        variant="outdoor"
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </section>
        ))
      )}
      {data && data.page < data.totalPages && (
        <button
          type="button"
          className="w-full rounded-md border px-3 py-2 text-xs font-medium text-muted-foreground"
          onClick={() => {
            if (!data || data.page !== page) return;
            setEarlier((current) => [...current, ...data.items]);
            setPage(page + 1);
          }}
        >
          {t('exerciseAnalytics.cardio.moreSessions', 'Older sessions')}
        </button>
      )}
    </div>
  );
};
