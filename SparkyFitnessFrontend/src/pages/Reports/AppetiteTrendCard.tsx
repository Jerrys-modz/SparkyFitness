import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Utensils } from 'lucide-react';
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { usePreferences } from '@/contexts/PreferencesContext';
import {
  APPETITE_SCORE_MAX,
  APPETITE_SCORE_MIN,
  buildAppetiteTrend,
  summarizeAppetiteTrend,
  type CustomCategoriesResponse,
  type CustomMeasurementsResponse,
} from '@workspace/shared';
import type { NutritionData } from '@/types/reports';
import { appetiteMetricLabel } from '@/utils/appetiteLabels';

interface AppetiteTrendCardProps {
  customCategories: CustomCategoriesResponse[];
  customMeasurementsData: CustomMeasurementsResponse[];
  nutritionData: NutritionData[];
}

/**
 * Hunger, fullness and cravings (0-10) beside the calories eaten each day.
 * Renders nothing until the range has a score.
 */
export const AppetiteTrendCard = ({
  customCategories,
  customMeasurementsData,
  nutritionData,
}: AppetiteTrendCardProps) => {
  const { t } = useTranslation();
  const {
    energyUnit,
    convertEnergy,
    getEnergyUnitString,
    formatDateInUserTimezone,
  } = usePreferences();

  const days = useMemo(
    () =>
      buildAppetiteTrend(
        customCategories,
        customMeasurementsData,
        nutritionData
      ),
    [customCategories, customMeasurementsData, nutritionData]
  );
  const summary = useMemo(() => summarizeAppetiteTrend(days), [days]);

  const chartData = useMemo(
    () =>
      days.map((d) => ({
        ...d,
        displayDate: formatDateInUserTimezone(d.date, 'MMM dd'),
        energy_eaten:
          d.calories === null
            ? null
            : Math.round(convertEnergy(d.calories, 'kcal', energyUnit)),
      })),
    [days, convertEnergy, energyUnit, formatDateInUserTimezone]
  );

  if (summary.daysLogged === 0) return null;

  const unit = getEnergyUnitString(energyUnit);
  const score = (value: number | null) =>
    value === null ? '–' : value.toFixed(1);
  const energy = (kcal: number) =>
    `${Math.round(convertEnergy(kcal, 'kcal', energyUnit))} ${unit}`;

  const tiles = [
    {
      key: 'hunger',
      label: appetiteMetricLabel('hunger', 'appetite', t),
      value: score(summary.averageHunger),
    },
    {
      key: 'fullness',
      label: appetiteMetricLabel('fullness', 'appetite', t),
      value: score(summary.averageFullness),
    },
    {
      key: 'food_noise',
      label: appetiteMetricLabel('food_noise', 'appetite', t),
      value: score(summary.averageCravings),
    },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base font-semibold">
          <Utensils className="h-4 w-4 text-orange-500" />
          {t('reports.appetite.title', 'Hunger & fullness vs calories')}
        </CardTitle>
        <CardDescription>
          {t('reports.appetite.description', {
            defaultValue:
              'Average scores (0-10) over {{count}} logged days, next to the calories you ate each day.',
            count: summary.daysLogged,
          })}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-3 gap-3">
          {tiles.map((tile) => (
            <div key={tile.key} className="rounded-lg border p-3">
              <div className="text-xs text-muted-foreground">{tile.label}</div>
              <div className="text-xl font-semibold tabular-nums">
                {tile.value}
                <span className="ml-1 text-xs font-normal text-muted-foreground">
                  / {APPETITE_SCORE_MAX}
                </span>
              </div>
            </div>
          ))}
        </div>
        {summary.caloriesOnHungrierDays !== null &&
          summary.caloriesOnLessHungryDays !== null && (
            <p className="text-sm text-muted-foreground">
              {t('reports.appetite.hungerCalories', {
                defaultValue:
                  'On your hungrier days you ate {{high}} on average, against {{low}} on the others.',
                high: energy(summary.caloriesOnHungrierDays),
                low: energy(summary.caloriesOnLessHungryDays),
              })}
            </p>
          )}
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart
              data={chartData}
              margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="displayDate" fontSize={10} />
              <YAxis
                yAxisId="score"
                domain={[APPETITE_SCORE_MIN, APPETITE_SCORE_MAX]}
                allowDecimals={false}
                fontSize={10}
              />
              <YAxis
                yAxisId="energy"
                orientation="right"
                fontSize={10}
                stroke="#94a3b8"
              />
              <Tooltip />
              <Legend />
              <Bar
                yAxisId="energy"
                dataKey="energy_eaten"
                name={t('reports.appetite.caloriesEaten', {
                  defaultValue: 'Eaten ({{unit}})',
                  unit,
                })}
                fill="#cbd5e1"
                radius={[3, 3, 0, 0]}
              />
              <Line
                yAxisId="score"
                type="monotone"
                dataKey="hunger"
                name={tiles[0]!.label}
                stroke="#f97316"
                strokeWidth={2}
                dot={{ r: 3 }}
                connectNulls
              />
              <Line
                yAxisId="score"
                type="monotone"
                dataKey="fullness"
                name={tiles[1]!.label}
                stroke="#10b981"
                strokeWidth={2}
                dot={{ r: 3 }}
                connectNulls
              />
              <Line
                yAxisId="score"
                type="monotone"
                dataKey="food_noise"
                name={tiles[2]!.label}
                stroke="#8b5cf6"
                strokeWidth={2}
                dot={{ r: 3 }}
                connectNulls
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
};
