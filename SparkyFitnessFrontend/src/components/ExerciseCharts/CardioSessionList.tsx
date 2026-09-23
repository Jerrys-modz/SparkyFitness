import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown } from 'lucide-react';
import { usePreferences } from '@/contexts/PreferencesContext';
import ActivityReportVisualizer from '@/pages/Reports/ActivityReportVisualizer';
import type { ExerciseProgressResponse } from '@workspace/shared';

interface CardioSessionListProps {
  entries: ExerciseProgressResponse[];
  formatDate: (date: Date, formatStr: string) => string;
  parseISO: (dateString: string) => Date;
}

function sessionName(entry: ExerciseProgressResponse): string {
  const named = entry as ExerciseProgressResponse & {
    exercise_name?: string | null;
  };
  return (
    named.exercise_preset_entry_name ||
    named.exercise_name ||
    named.category ||
    'Workout'
  );
}

export const CardioSessionList = ({
  entries,
  formatDate,
  parseISO,
}: CardioSessionListProps) => {
  const { t } = useTranslation();
  const { convertDistance, distanceUnit } = usePreferences();
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <div className="space-y-3">
      <div>
        <h2 className="text-lg font-semibold">
          {t('exerciseAnalytics.cardio.routesTitle', 'Routes & heart rate')}
        </h2>
        <p className="text-xs text-muted-foreground">
          {t(
            'exerciseAnalytics.cardio.routesHint',
            'Open a workout to see its GPS route and heart-rate graph.'
          )}
        </p>
      </div>
      {entries.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {t(
            'exerciseAnalytics.cardio.noSessions',
            'No cardio workouts in this date range.'
          )}
        </p>
      ) : (
        entries.map((entry) => {
          const id = entry.exercise_entry_id;
          const open = openId === id;
          const distance =
            entry.distance != null && entry.distance > 0
              ? `${convertDistance(entry.distance, 'km', distanceUnit).toFixed(2)} ${distanceUnit}`
              : null;
          const duration =
            entry.duration_minutes > 0
              ? `${Math.round(entry.duration_minutes)} min`
              : null;
          const heartRate =
            entry.avg_heart_rate != null && entry.avg_heart_rate > 0
              ? `${Math.round(entry.avg_heart_rate)} bpm`
              : null;
          const detail = [
            formatDate(parseISO(entry.entry_date), 'MMM d, yyyy'),
            distance,
            duration,
            heartRate,
          ]
            .filter(Boolean)
            .join(' · ');
          return (
            <div key={id} className="rounded-lg border bg-card">
              <button
                type="button"
                className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
                aria-expanded={open}
                onClick={() => setOpenId(open ? null : id)}
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">
                    {sessionName(entry)}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {detail}
                  </span>
                </span>
                <ChevronDown
                  className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${
                    open ? 'rotate-180' : ''
                  }`}
                />
              </button>
              {open && (
                <div className="border-t px-3 py-3">
                  <ActivityReportVisualizer
                    exerciseEntryId={id}
                    providerName={entry.provider_name || 'garmin'}
                    variant="outdoor"
                  />
                </div>
              )}
            </div>
          );
        })
      )}
    </div>
  );
};
