import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  computeFuelingPlan,
  type FuelingExperience,
  type FuelingIntensityZone,
} from '@workspace/shared';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const ZONES: FuelingIntensityZone[] = [1, 2, 3, 4, 5];
const EXPERIENCES: FuelingExperience[] = [
  'beginner',
  'intermediate',
  'advanced',
];

const parseNumber = (value: string): number | null => {
  const parsed = Number(value);
  return value.trim() !== '' && Number.isFinite(parsed) ? parsed : null;
};

const formatClock = (minutes: number): string => {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}:${String(m).padStart(2, '0')}`;
};

/**
 * Fueling plan for a long run or race: carbohydrates per hour, portion size and
 * when to take each portion. The numbers come from the shared calculator, so
 * the web and the phone agree.
 */
const FuelingPlanner: React.FC = () => {
  const { t } = useTranslation();
  const [hours, setHours] = useState('3');
  const [minutes, setMinutes] = useState('0');
  const [zone, setZone] = useState<FuelingIntensityZone>(3);
  const [experience, setExperience] =
    useState<FuelingExperience>('intermediate');
  const [carbsOverride, setCarbsOverride] = useState('');
  const [portionOverride, setPortionOverride] = useState('');

  const durationMin =
    (parseNumber(hours) ?? 0) * 60 + (parseNumber(minutes) ?? 0);

  const plan = useMemo(
    () =>
      computeFuelingPlan({
        durationMin,
        intensityZone: zone,
        experience,
        overrides: {
          carbsPerHour: parseNumber(carbsOverride),
          portionGrams: parseNumber(portionOverride),
        },
      }),
    [durationMin, zone, experience, carbsOverride, portionOverride]
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('fueling.title', 'Fueling plan')}</CardTitle>
        <CardDescription>
          {t(
            'fueling.description',
            'Work out how many carbohydrates to take per hour on a long run or race, and when to take each portion.'
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="fueling-hours">
              {t('fueling.duration', 'Duration')}
            </Label>
            <div className="flex items-center gap-2">
              <Input
                id="fueling-hours"
                type="number"
                min={0}
                inputMode="numeric"
                value={hours}
                onChange={(e) => setHours(e.target.value)}
                aria-label={t('fueling.hours', 'Hours')}
              />
              <span className="text-sm text-muted-foreground">
                {t('fueling.hoursShort', 'h')}
              </span>
              <Input
                type="number"
                min={0}
                max={59}
                inputMode="numeric"
                value={minutes}
                onChange={(e) => setMinutes(e.target.value)}
                aria-label={t('fueling.minutes', 'Minutes')}
              />
              <span className="text-sm text-muted-foreground">
                {t('fueling.minutesShort', 'min')}
              </span>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="fueling-zone">
              {t('fueling.intensity', 'Effort (heart rate zone)')}
            </Label>
            <Select
              value={String(zone)}
              onValueChange={(value) =>
                setZone(Number(value) as FuelingIntensityZone)
              }
            >
              <SelectTrigger id="fueling-zone">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ZONES.map((z) => (
                  <SelectItem key={z} value={String(z)}>
                    {t('fueling.zone', 'Zone {{zone}}', { zone: z })}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="fueling-experience">
              {t('fueling.experience', 'Gut training')}
            </Label>
            <Select
              value={experience}
              onValueChange={(value) =>
                setExperience(value as FuelingExperience)
              }
            >
              <SelectTrigger id="fueling-experience">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {EXPERIENCES.map((level) => (
                  <SelectItem key={level} value={level}>
                    {t(`fueling.experienceLevels.${level}`, level)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-2">
              <Label htmlFor="fueling-carbs-override">
                {t('fueling.carbsOverride', 'Your carbs (g/h)')}
              </Label>
              <Input
                id="fueling-carbs-override"
                type="number"
                min={0}
                inputMode="numeric"
                placeholder={t('fueling.useDefault', 'Default')}
                value={carbsOverride}
                onChange={(e) => setCarbsOverride(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="fueling-portion-override">
                {t('fueling.portionOverride', 'Portion (g)')}
              </Label>
              <Input
                id="fueling-portion-override"
                type="number"
                min={0}
                inputMode="numeric"
                placeholder={String(plan.portionGrams)}
                value={portionOverride}
                onChange={(e) => setPortionOverride(e.target.value)}
              />
            </div>
          </div>
        </div>

        {plan.needsFuel && plan.intervalMin !== null ? (
          <div className="space-y-3" data-testid="fueling-result">
            <p className="text-lg font-medium">
              {t(
                'fueling.summary',
                '{{carbs}} g/h: take {{portion}} g every {{interval}} min',
                {
                  carbs: plan.carbsPerHour,
                  portion: plan.portionGrams,
                  interval: plan.intervalMin,
                }
              )}
            </p>
            <p className="text-sm text-muted-foreground">
              {t(
                'fueling.total',
                'About {{total}} g of carbohydrate in total.',
                {
                  total: plan.totalCarbsGrams,
                }
              )}
            </p>
            {plan.carbsPerHourOverridden && plan.range.max > 0 && (
              <p className="text-sm text-muted-foreground">
                {t(
                  'fueling.defaultRange',
                  'The usual range for this duration is {{min}} to {{max}} g/h.',
                  { min: plan.range.min, max: plan.range.max }
                )}
              </p>
            )}
            {plan.reminderOffsetsMin.length > 0 && (
              <div>
                <p className="text-sm font-medium">
                  {t('fueling.schedule', 'Schedule')}
                </p>
                <ul className="mt-1 flex flex-wrap gap-2 text-sm">
                  {plan.reminderOffsetsMin.map((offset) => (
                    <li
                      key={offset}
                      className="rounded-md border px-2 py-1 tabular-nums"
                    >
                      {t('fueling.scheduleItem', '{{time}}: {{grams}} g', {
                        time: formatClock(offset),
                        grams: plan.portionGrams,
                      })}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        ) : (
          <p
            className="text-sm text-muted-foreground"
            data-testid="fueling-none"
          >
            {t(
              'fueling.notNeeded',
              'Runs under an hour usually do not need fueling. Enter your own carbs per hour to plan one anyway.'
            )}
          </p>
        )}

        <p className="text-xs text-muted-foreground">
          {t(
            'fueling.disclaimer',
            'General guidance, not medical advice. Practise your plan in training before race day.'
          )}
        </p>
      </CardContent>
    </Card>
  );
};

export default FuelingPlanner;
