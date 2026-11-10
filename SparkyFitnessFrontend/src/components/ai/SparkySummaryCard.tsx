import { Loader2, RefreshCw, Sparkles } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useSparkyDailySummary } from '@/hooks/AI/useSparkyDailySummary';

/**
 * Sparky's short summary of today with one or two suggestions (#2013). Render
 * it only for the signed-in person's own diary on today's date.
 */
export function SparkySummaryCard({ today }: { today: string }) {
  const { t } = useTranslation();
  const { summary, isLoading, isError, isRefreshing, refresh } =
    useSparkyDailySummary(today, true);

  let body: React.ReactNode;
  if (isLoading) {
    body = (
      <p className="text-sm text-muted-foreground">
        {t('sparkySummary.loading', 'Sparky is looking at your day…')}
      </p>
    );
  } else if (isError && !summary) {
    body = (
      <p className="text-sm text-muted-foreground" role="alert">
        {t(
          'sparkySummary.error',
          'Sparky could not write a summary right now. Use refresh to try again.'
        )}
      </p>
    );
  } else if (summary?.status === 'no_ai_service') {
    body = (
      <p className="text-sm text-muted-foreground">
        {t(
          'sparkySummary.noAiService',
          'Set up an AI service in Settings to get a daily summary.'
        )}
      </p>
    );
  } else if (summary?.status === 'no_data') {
    body = (
      <p className="text-sm text-muted-foreground">
        {t(
          'sparkySummary.noData',
          'Log a meal, a workout or some water and Sparky will sum up your day here.'
        )}
      </p>
    );
  } else if (summary?.summary) {
    body = (
      <>
        <p>{summary.summary}</p>
        {summary.suggestions.length > 0 && (
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
            {summary.suggestions.map((suggestion) => (
              <li key={suggestion}>{suggestion}</li>
            ))}
          </ul>
        )}
      </>
    );
  } else {
    return null;
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Sparkles className="h-4 w-4" />
          {t('sparkySummary.title', 'Today with Sparky')}
        </CardTitle>
        <Button
          variant="ghost"
          size="icon"
          disabled={isRefreshing || isLoading}
          onClick={refresh}
          aria-label={t('sparkySummary.refresh', 'Write a new summary')}
        >
          {isRefreshing ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
        </Button>
      </CardHeader>
      <CardContent>{body}</CardContent>
    </Card>
  );
}
