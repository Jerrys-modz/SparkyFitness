import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

/** The Exercises page's way into the ready-made workout programs. */
const WorkoutSplitsEntry = () => {
  const { t } = useTranslation();
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle>
          {t('workoutSplits.entry.title', 'Ready-made workout programs')}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center justify-between gap-3 pt-0">
        <p className="text-sm text-muted-foreground">
          {t(
            'workoutSplits.entry.description',
            'New to strength training? Pick a split such as full body, upper/lower or push/pull/legs and add it to your presets and plans in one step.'
          )}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <Link to="/exercises/workout-splits/finder">
              {t('workoutSplits.entry.finder', 'Find my program')}
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="/exercises/workout-splits">
              {t('workoutSplits.entry.open', 'Browse programs')}
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

export default WorkoutSplitsEntry;
