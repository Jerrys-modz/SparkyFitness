import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { useNutrientGoalPreferences } from '@/hooks/Settings/useNutrientGoalPreferences';
import { useRecentAndTopFoodsQuery } from '@/hooks/Foods/useFoods';
import { CENTRAL_NUTRIENT_CONFIG } from '@/constants/nutrients';
import type { ExpandedGoals } from '@/types/goals';
import type { NutritionData } from '@/types/reports';
import type { UserCustomNutrient } from '@/types/customNutrient';
import type { Food } from '@/types/food';
import {
  computeNutrientInsights,
  rankFoodSuggestions,
  type InsightStatus,
  type NutrientInsight,
} from '@/utils/nutrientInsights';
import {
  formatNutrientValue,
  getNutrientMetadata,
} from '@/utils/nutrientUtils';

interface NutrientInsightsCardProps {
  nutritionData: NutritionData[];
  customNutrients: UserCustomNutrient[];
  goals?: Record<string, ExpandedGoals>;
}

const SUGGESTION_POOL_SIZE = 50;

const STATUS_BADGE_CLASS: Record<InsightStatus, string> = {
  deficient: 'bg-red-500/15 text-red-600 dark:text-red-400',
  low: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
  onTarget: 'bg-green-500/15 text-green-600 dark:text-green-400',
  over: 'bg-orange-500/15 text-orange-600 dark:text-orange-400',
};

const NutrientInsightsCard = ({
  nutritionData,
  customNutrients,
  goals,
}: NutrientInsightsCardProps) => {
  const { t } = useTranslation();
  const { data: goalOverrides } = useNutrientGoalPreferences();
  const { data: recentTop } = useRecentAndTopFoodsQuery(SUGGESTION_POOL_SIZE);

  const { insights, nutritionScore, loggedDays } = useMemo(
    () =>
      computeNutrientInsights({
        nutritionData,
        goals,
        goalOverrides,
        defaultGoalType: (key) =>
          CENTRAL_NUTRIENT_CONFIG[key]?.defaultGoalType ?? 'minimum',
        customNutrientNames: customNutrients.map((cn) => cn.name),
      }),
    [nutritionData, goals, goalOverrides, customNutrients]
  );

  const suggestions = useMemo(() => {
    const pool: Food[] = [
      ...(recentTop?.topFoods ?? []),
      ...(recentTop?.recentFoods ?? []),
    ];
    return rankFoodSuggestions(pool, insights);
  }, [recentTop, insights]);

  const labelFor = (key: string) => {
    const meta = getNutrientMetadata(key, customNutrients, goalOverrides);
    return t(meta.label, meta.defaultLabel);
  };
  const format = (key: string, value: number) =>
    `${formatNutrientValue(key, value, customNutrients)} ${
      getNutrientMetadata(key, customNutrients).unit
    }`;

  const statusLabel = (status: InsightStatus) =>
    ({
      deficient: t('nutrientInsights.status.deficient', 'Deficient'),
      low: t('nutrientInsights.status.low', 'Low'),
      onTarget: t('nutrientInsights.status.onTarget', 'On target'),
      over: t('nutrientInsights.status.over', 'Over limit'),
    })[status];

  const sorted = useMemo(() => {
    const rank: Record<InsightStatus, number> = {
      deficient: 0,
      over: 1,
      low: 2,
      onTarget: 3,
    };
    return [...insights].sort(
      (a, b) => rank[a.status] - rank[b.status] || a.ratio - b.ratio
    );
  }, [insights]);

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle>
            {t('nutrientInsights.title', 'Nutrient Insights')}
          </CardTitle>
          {nutritionScore !== null && (
            <div className="text-right" data-testid="nutrition-score">
              <div className="text-3xl font-bold leading-none">
                {nutritionScore}
                <span className="text-base font-normal text-muted-foreground">
                  /100
                </span>
              </div>
              <div className="text-xs text-muted-foreground">
                {t('nutrientInsights.score', 'Nutrition score')}
              </div>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {insights.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {t(
              'nutrientInsights.empty',
              'Log food and set nutrient goals in Goals to see how your intake compares.'
            )}
          </p>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              {t(
                'nutrientInsights.basis',
                'Average daily intake over {{count}} logged days compared with your goals.',
                { count: loggedDays }
              )}
            </p>
            <ul className="space-y-3">
              {sorted.map((insight: NutrientInsight) => (
                <li key={insight.key} data-testid={`insight-${insight.key}`}>
                  <div className="mb-1 flex items-center justify-between gap-2 text-sm">
                    <span className="font-medium">{labelFor(insight.key)}</span>
                    <span className="flex items-center gap-2">
                      <span className="text-muted-foreground">
                        {format(insight.key, insight.average)} /{' '}
                        {insight.goalType === 'maximum'
                          ? t('nutrientInsights.limit', 'limit {{value}}', {
                              value: format(insight.key, insight.target),
                            })
                          : format(insight.key, insight.target)}
                      </span>
                      <Badge
                        variant="secondary"
                        className={STATUS_BADGE_CLASS[insight.status]}
                      >
                        {statusLabel(insight.status)}
                      </Badge>
                    </span>
                  </div>
                  <Progress
                    value={Math.min(insight.ratio, 1) * 100}
                    className="h-2"
                  />
                </li>
              ))}
            </ul>

            <div>
              <h4 className="mb-2 text-sm font-semibold">
                {t(
                  'nutrientInsights.suggestionsTitle',
                  'Foods to fill the gaps'
                )}
              </h4>
              {suggestions.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {t(
                    'nutrientInsights.noSuggestions',
                    'No gaps to fill, or none of your recent foods help with them.'
                  )}
                </p>
              ) : (
                <ul className="space-y-2">
                  {suggestions.map(({ food, covers }) => (
                    <li
                      key={food.id}
                      className="rounded-md border p-2 text-sm"
                      data-testid={`suggestion-${food.id}`}
                    >
                      <div className="font-medium">
                        {food.name}
                        {food.brand ? (
                          <span className="font-normal text-muted-foreground">
                            {' '}
                            ({food.brand})
                          </span>
                        ) : null}
                      </div>
                      <div className="text-muted-foreground">
                        {t('nutrientInsights.perServing', 'Per {{serving}}:', {
                          serving:
                            `${food.default_variant?.serving_size ?? ''} ${
                              food.default_variant?.serving_unit ?? ''
                            }`.trim(),
                        })}{' '}
                        {covers
                          .slice(0, 3)
                          .map(
                            (c) =>
                              `${labelFor(c.key)} ${format(c.key, c.amount)}`
                          )
                          .join(', ')}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
};

export default NutrientInsightsCard;
