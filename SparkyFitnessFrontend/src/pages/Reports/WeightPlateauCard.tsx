import { useTranslation } from 'react-i18next';
import { Scale, X } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useWeightPlateau } from '@/hooks/Reports/useWeightPlateau';

const SUGGESTIONS = [
  {
    key: 'reports.weightPlateau.suggestionLogging',
    text: 'Logging: check that most meals, snacks and drinks are logged, weekends included.',
  },
  {
    key: 'reports.weightPlateau.suggestionAdaptive',
    text: 'Adaptive TDEE: if your calorie target is adaptive, it may still be adjusting to your recent data.',
  },
  {
    key: 'reports.weightPlateau.suggestionNoise',
    text: 'Water and scale noise: salt, carbohydrates, training, sleep and hormones can hide a change for a week or two.',
  },
  {
    key: 'reports.weightPlateau.suggestionMaintenance',
    text: 'Time at maintenance: a planned stretch at maintenance calories is a reasonable choice too.',
  },
] as const;

/**
 * A calm note shown when the weight trend has levelled off while the Goal Mode
 * aims to lose or gain (shared `detectWeightPlateau`). Neutral wording only:
 * it describes the trend and lists things worth checking, never a judgement.
 */
export function WeightPlateauCard() {
  const { t } = useTranslation();
  const { plateau, dismiss } = useWeightPlateau();
  if (!plateau) return null;

  return (
    <Card data-testid="weight-plateau-card">
      <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
        <CardTitle className="text-base flex items-center">
          <Scale className="w-4 h-4 mr-2" />
          {t(
            'reports.weightPlateau.title',
            'Your weight trend has levelled off'
          )}
        </CardTitle>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={dismiss}
          aria-label={t('reports.weightPlateau.dismiss', 'Dismiss')}
        >
          <X className="w-4 h-4" />
        </Button>
      </CardHeader>
      <CardContent className="space-y-2 text-sm text-muted-foreground">
        <p>
          {t('reports.weightPlateau.summary', {
            count: plateau.days,
            weighIns: plateau.weighIns,
            defaultValue_one:
              'Your smoothed weight trend has stayed in a narrow range for {{count}} day ({{weighIns}} weigh-ins).',
            defaultValue_other:
              'Your smoothed weight trend has stayed in a narrow range for {{count}} days ({{weighIns}} weigh-ins).',
          })}
        </p>
        <p>
          {t(
            'reports.weightPlateau.intro',
            'This is common and happens to most people at some point. A few things worth a look:'
          )}
        </p>
        <ul className="list-disc pl-5 space-y-1">
          {SUGGESTIONS.map((s) => (
            <li key={s.key}>{t(s.key, s.text)}</li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
