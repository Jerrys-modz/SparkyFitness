import { useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Utensils, Brain, Soup, Zap, Activity } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useActiveUser } from '@/contexts/ActiveUserContext';
import { usePreferences } from '@/contexts/PreferencesContext';
import {
  APPETITE_CATEGORY_SETTINGS,
  APPETITE_SCORE_DEFAULT,
  APPETITE_SCORE_MAX,
  APPETITE_SCORE_MIN,
  appetiteCategoryIds,
  appetiteMetricsFor,
  appetiteValuesForDay,
  todayInZone,
  type AppetiteCheckInVariant,
  type AppetiteMetricKey,
  type UpdateCustomMeasurementsRequest,
} from '@workspace/shared';
import {
  useCustomCategories,
  useExistingCustomMeasurements,
  useSaveCustomMeasurementMutation,
} from '@/hooks/CheckIn/useCheckIn';
import { useAddCategoryMutation } from '@/hooks/Settings/useCustomCategories';
import { appetiteMetricLabel } from '@/utils/appetiteLabels';

const METRIC_STYLE: Record<
  AppetiteMetricKey,
  { Icon: LucideIcon; color: string; chip: string }
> = {
  hunger: {
    Icon: Utensils,
    color: 'text-orange-500',
    chip: 'bg-orange-100 dark:bg-orange-900/50',
  },
  food_noise: {
    Icon: Brain,
    color: 'text-violet-500',
    chip: 'bg-violet-100 dark:bg-violet-900/50',
  },
  fullness: {
    Icon: Soup,
    color: 'text-emerald-500',
    chip: 'bg-emerald-100 dark:bg-emerald-900/50',
  },
  energy: {
    Icon: Zap,
    color: 'text-amber-500',
    chip: 'bg-amber-100 dark:bg-amber-900/50',
  },
};

interface AppetiteCheckInProps {
  selectedDate?: string;
  /**
   * `appetite` is the Check-in card for everyone; `glp1` is the GLP-1 daily
   * check-in on Medications, which adds energy. Both save the same rows.
   */
  variant: AppetiteCheckInVariant;
}

/**
 * Hunger, fullness and cravings on a 0-10 scale, saved as daily custom
 * measurements (`utils/appetiteCheckIn.ts` in shared names the categories).
 */
export default function AppetiteCheckIn({
  selectedDate,
  variant,
}: AppetiteCheckInProps) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { activeUserId } = useActiveUser();
  const currentUserId = activeUserId || user?.id;
  const { timezone } = usePreferences();
  const today = todayInZone(timezone);
  const targetDate = selectedDate || today;
  const metrics = appetiteMetricsFor(variant);

  const { data: categories = [] } = useCustomCategories(currentUserId);
  const { data: existing = [] } = useExistingCustomMeasurements(targetDate);
  const { mutateAsync: saveMeasurement, isPending: saving } =
    useSaveCustomMeasurementMutation();
  const { mutateAsync: addCategory, isPending: creating } =
    useAddCategoryMutation(currentUserId ?? undefined);

  const loadedValues = useMemo(
    () => appetiteValuesForDay(categories, existing, variant).values,
    [categories, existing, variant]
  );

  // Categories created by a save that then failed part-way. The category list
  // may not have refetched yet and the server does not dedupe by name, so a
  // retry reuses these instead of creating a second copy.
  const createdIds = useRef(new Map<AppetiteMetricKey, string>());

  // Local edits layered over the stored values; cleared after a successful
  // save so the sliders show what was saved.
  const [edits, setEdits] = useState<
    Partial<Record<AppetiteMetricKey, number>>
  >({});
  const valueFor = (key: AppetiteMetricKey) =>
    edits[key] ?? loadedValues[key] ?? APPETITE_SCORE_DEFAULT;

  const saveAll = async () => {
    const ids = appetiteCategoryIds(categories);
    // One at a time: two parallel first saves could create the same category.
    for (const m of metrics) {
      let categoryId = ids[m.key] ?? createdIds.current.get(m.key);
      if (!categoryId) {
        const created = await addCategory({
          name: m.categoryName,
          display_name: appetiteMetricLabel(m.key, variant, t),
          ...APPETITE_CATEGORY_SETTINGS,
        });
        categoryId = String(created.id);
        createdIds.current.set(m.key, categoryId);
      }
      const payload: UpdateCustomMeasurementsRequest = {
        category_id: categoryId,
        value: String(valueFor(m.key)),
        entry_date: targetDate,
        entry_hour: null,
        entry_timestamp: new Date().toISOString(),
        notes: '',
      };
      await saveMeasurement(payload);
    }
  };

  const handleSave = async () => {
    try {
      await saveAll();
      setEdits({});
    } catch {
      // The failed mutation already shows its error toast; the edits stay so
      // the person can try again.
    }
  };

  const busy = saving || creating;
  const isGlp = variant === 'glp1';

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base font-semibold">
          <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-pink-100 dark:bg-pink-900/50">
            <Activity className="h-3.5 w-3.5 text-pink-500" />
          </span>
          {isGlp
            ? t('medications.checkin.title', 'GLP-1 daily check-in')
            : t('checkIn.appetite.title', 'Hunger & fullness')}
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          {isGlp
            ? t(
                'medications.checkin.subtitle',
                'Track how the medication is affecting you — saved to your daily measurements, so it also shows in Check-in & Reports.'
              )
            : t(
                'checkIn.appetite.subtitle',
                'How hungry, full and snacky you felt today, from 0 (not at all) to 10 (extremely). Shown next to your calories in Reports.'
              )}
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {metrics.map((m) => {
            const style = METRIC_STYLE[m.key];
            const label = appetiteMetricLabel(m.key, variant, t);
            return (
              <div key={m.key} className="space-y-1.5">
                <div className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2 font-medium">
                    <span
                      className={`inline-flex h-6 w-6 items-center justify-center rounded-full ${style.chip}`}
                    >
                      <style.Icon className={`h-3.5 w-3.5 ${style.color}`} />
                    </span>
                    {label}
                  </span>
                  <span className="font-semibold tabular-nums">
                    {valueFor(m.key)}{' '}
                    <span className="text-muted-foreground">
                      / {APPETITE_SCORE_MAX}
                    </span>
                  </span>
                </div>
                <Slider
                  aria-label={label}
                  min={APPETITE_SCORE_MIN}
                  max={APPETITE_SCORE_MAX}
                  step={1}
                  value={[valueFor(m.key)]}
                  onValueChange={([v]) =>
                    setEdits((prev) => ({ ...prev, [m.key]: v }))
                  }
                />
              </div>
            );
          })}
        </div>
        <Button onClick={handleSave} disabled={busy} className="w-full">
          {busy
            ? t('medications.common.saving', 'Saving…')
            : targetDate === today
              ? t('medications.checkin.saveToday', "Save today's check-in")
              : t('medications.checkin.save', 'Save check-in')}
        </Button>
      </CardContent>
    </Card>
  );
}
