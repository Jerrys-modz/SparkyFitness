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
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import FoodSearchDialog from '@/components/FoodSearch/FoodSearchDialog';
import { toast } from '@/hooks/use-toast';
import { printFuelingPlan } from '@/utils/fuelingPrint';
import type { Food } from '@/types/food';
import type { Meal } from '@/types/meal';
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
  const [productName, setProductName] = useState('');
  const [foodDialogOpen, setFoodDialogOpen] = useState(false);

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

  const productLabel =
    productName.trim() || t('fueling.defaultProduct', 'Energy gel');
  const portionCount =
    plan.portionGrams > 0
      ? Math.ceil(plan.totalCarbsGrams / plan.portionGrams)
      : 0;

  const handleFoodSelect = (item: Food | Meal, type: 'food' | 'meal') => {
    setFoodDialogOpen(false);
    if (type !== 'food') return;
    const food = item as Food;
    const carbs = Math.round(food.default_variant?.carbs ?? 0);
    if (!(carbs > 0)) {
      toast({
        variant: 'destructive',
        title: t(
          'fueling.foodNoCarbs',
          'That food has no carbohydrates listed.'
        ),
      });
      return;
    }
    setProductName(food.name);
    setPortionOverride(String(carbs));
  };

  const handlePrint = () => {
    if (!plan.needsFuel || plan.intervalMin === null) return;
    const opened = printFuelingPlan({
      title: t('fueling.printTitle', 'Fueling plan'),
      summary: t(
        'fueling.summary',
        '{{carbs}} g/h: take {{portion}} g every {{interval}} min',
        {
          carbs: plan.carbsPerHour,
          portion: plan.portionGrams,
          interval: plan.intervalMin,
        }
      ),
      detail: t(
        'fueling.printDetail',
        '{{product}}, {{count}} portions over {{duration}}.',
        {
          product: productLabel,
          count: portionCount,
          duration: formatClock(durationMin),
        }
      ),
      headers: {
        time: t('fueling.printTime', 'Time into the run'),
        amount: t('fueling.printAmount', 'Take'),
        total: t('fueling.printTotal', 'Carbs so far'),
      },
      rows: plan.reminderOffsetsMin.map((offset, index) => ({
        time: formatClock(offset),
        amount: t('fueling.printAmountValue', '{{grams}} g {{product}}', {
          grams: plan.portionGrams,
          product: productLabel,
        }),
        total: t('fueling.printTotalValue', '{{grams}} g', {
          grams: plan.portionGrams * (index + 1),
        }),
      })),
      disclaimer: t(
        'fueling.disclaimer',
        'General guidance, not medical advice. Practise your plan in training before race day.'
      ),
    });
    if (!opened) {
      toast({
        variant: 'destructive',
        title: t(
          'fueling.printBlocked',
          'Allow pop-ups for this site to print the plan.'
        ),
      });
    }
  };

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

        <div className="space-y-2">
          <Label htmlFor="fueling-product">
            {t('fueling.product', 'Fuel product')}
          </Label>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              id="fueling-product"
              className="max-w-xs"
              value={productName}
              maxLength={60}
              placeholder={t('fueling.defaultProduct', 'Energy gel')}
              onChange={(e) => setProductName(e.target.value)}
            />
            <Button
              type="button"
              variant="outline"
              onClick={() => setFoodDialogOpen(true)}
            >
              {t('fueling.chooseFood', 'Choose a saved food')}
            </Button>
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
              )}{' '}
              <span data-testid="fueling-count">
                {t(
                  'fueling.portionCount',
                  'That is about {{count}} × {{product}}.',
                  { count: portionCount, product: productLabel }
                )}
              </span>
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

        {plan.needsFuel && plan.intervalMin !== null ? (
          <Button type="button" variant="outline" onClick={handlePrint}>
            {t('fueling.print', 'Print schedule')}
          </Button>
        ) : null}

        <FoodSearchDialog
          open={foodDialogOpen}
          onOpenChange={setFoodDialogOpen}
          hideMealTab
          onFoodSelect={handleFoodSelect}
          title={t('fueling.chooseFoodTitle', 'Choose your fuel')}
          description={t(
            'fueling.chooseFoodDescription',
            'Pick a food to use its carbohydrates per serving as the portion size.'
          )}
        />

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
