import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  splitFitsVenue,
  WORKOUT_SPLITS,
  WORKOUT_SPLIT_GOALS,
  WORKOUT_SPLIT_VENUES,
  type WorkoutSplit,
  type WorkoutSplitGoal,
  type WorkoutSplitLevel,
  type WorkoutSplitVenue,
} from '@workspace/shared';
import { ArrowLeft } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useActiveUser } from '@/contexts/ActiveUserContext';
import { useImportWorkoutSplitMutation } from '@/hooks/Exercises/useWorkoutSplits';
import { goalLabel, levelLabel, venueLabel } from '@/utils/workoutSplits';
import ImportWorkoutSplitDialog from './ImportWorkoutSplitDialog';
import WorkoutSplitCard from './WorkoutSplitCard';

const ANY = 'any';
const LEVELS: readonly WorkoutSplitLevel[] = ['beginner', 'intermediate'];

/** The distinct days-a-week values the catalog offers, ascending. */
const DAYS_OPTIONS = [
  ...new Set(WORKOUT_SPLITS.map((split) => split.daysPerWeek)),
].sort((a, b) => a - b);

/**
 * Ready-made strength splits: filter by where the person trains, their level,
 * goal and days a week, look at the sessions, and add one to their own presets
 * and plans. Importing writes to the person's own library, so it is not
 * offered while acting on behalf of someone else.
 */
const WorkoutSplits = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { isActingOnBehalf } = useActiveUser();
  const importSplit = useImportWorkoutSplitMutation();
  const [venue, setVenue] = useState<string>(ANY);
  const [level, setLevel] = useState<string>(ANY);
  const [goal, setGoal] = useState<string>(ANY);
  const [days, setDays] = useState<string>(ANY);
  const [importing, setImporting] = useState<WorkoutSplit | null>(null);

  const visible = WORKOUT_SPLITS.filter(
    (split) =>
      (venue === ANY || splitFitsVenue(split, venue as WorkoutSplitVenue)) &&
      (level === ANY || split.level === level) &&
      (goal === ANY || split.goal === goal) &&
      (days === ANY || split.daysPerWeek === Number(days))
  );

  const heading = (
    <Link
      to="/exercises"
      className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
    >
      <ArrowLeft className="h-4 w-4" />
      {t('workoutSplits.page.back', 'Exercises')}
    </Link>
  );

  if (isActingOnBehalf) {
    return (
      <div className="space-y-4">
        {heading}
        <Card>
          <CardContent className="pt-6 text-sm text-muted-foreground">
            {t(
              'workoutSplits.page.ownOnly',
              'Adding a program changes your own library and plans. Switch back to your own account to add one.'
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  const filters: {
    id: string;
    label: string;
    value: string;
    onChange: (value: string) => void;
    options: { value: string; label: string }[];
  }[] = [
    {
      id: 'venue',
      label: t('workoutSplits.filters.venue', 'Where I train'),
      value: venue,
      onChange: setVenue,
      options: [
        { value: ANY, label: t('workoutSplits.filters.any', 'Any') },
        ...WORKOUT_SPLIT_VENUES.map((value) => ({
          value,
          label: venueLabel(t, value),
        })),
      ],
    },
    {
      id: 'level',
      label: t('workoutSplits.filters.level', 'Level'),
      value: level,
      onChange: setLevel,
      options: [
        { value: ANY, label: t('workoutSplits.filters.any', 'Any') },
        ...LEVELS.map((value) => ({ value, label: levelLabel(t, value) })),
      ],
    },
    {
      id: 'goal',
      label: t('workoutSplits.filters.goal', 'Goal'),
      value: goal,
      onChange: setGoal,
      options: [
        { value: ANY, label: t('workoutSplits.filters.any', 'Any') },
        ...WORKOUT_SPLIT_GOALS.map((value: WorkoutSplitGoal) => ({
          value,
          label: goalLabel(t, value),
        })),
      ],
    },
    {
      id: 'days',
      label: t('workoutSplits.filters.days', 'Days a week'),
      value: days,
      onChange: setDays,
      options: [
        { value: ANY, label: t('workoutSplits.filters.any', 'Any') },
        ...DAYS_OPTIONS.map((value) => ({
          value: String(value),
          label: String(value),
        })),
      ],
    },
  ];

  return (
    <div className="space-y-6">
      {heading}
      <div>
        <h1 className="text-2xl font-bold">
          {t('workoutSplits.page.title', 'Workout programs')}
        </h1>
        <p className="text-sm text-muted-foreground">
          {t(
            'workoutSplits.page.intro',
            'Ready-made strength splits for getting started. Each exercise has a rep range: reach the top on every set and the next session suggests a little more weight. Add one and change anything you like afterwards.'
          )}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {filters.map((filter) => (
          <div key={filter.id} className="space-y-1.5">
            <Label htmlFor={`workout-splits-filter-${filter.id}`}>
              {filter.label}
            </Label>
            <Select value={filter.value} onValueChange={filter.onChange}>
              <SelectTrigger id={`workout-splits-filter-${filter.id}`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {filter.options.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ))}
      </div>

      {visible.length === 0 ? (
        <Card>
          <CardContent className="pt-6 text-sm text-muted-foreground">
            {t(
              'workoutSplits.page.none',
              'No program matches those filters. Try a different one.'
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4" data-testid="workout-splits-list">
          {visible.map((split) => (
            <WorkoutSplitCard
              key={split.id}
              split={split}
              onImport={setImporting}
            />
          ))}
        </div>
      )}

      <ImportWorkoutSplitDialog
        split={importing}
        busy={importSplit.isPending}
        onCancel={() => setImporting(null)}
        onImport={(split, planName, sessionNames, activate) =>
          importSplit.mutate(
            { splitId: split.id, body: { planName, sessionNames, activate } },
            {
              onSuccess: () => {
                setImporting(null);
                navigate('/exercises');
              },
            }
          )
        }
      />
    </div>
  );
};

export default WorkoutSplits;
