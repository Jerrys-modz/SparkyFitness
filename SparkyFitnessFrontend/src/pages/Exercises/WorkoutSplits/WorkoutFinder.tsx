import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  applyTrainerOptions,
  recommendWorkoutSplits,
  TRAINER_DAYS_PER_WEEK,
  TRAINER_FOCUSES,
  TRAINER_SESSION_MINUTES,
  WORKOUT_SPLIT_GOALS,
  WORKOUT_SPLIT_VENUES,
  type TrainerFocus,
  type TrainerRecommendation,
  type TrainerSessionMinutes,
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
import {
  focusLabel,
  goalLabel,
  levelLabel,
  venueLabel,
} from '@/utils/workoutSplits';
import ImportWorkoutSplitDialog from './ImportWorkoutSplitDialog';
import WorkoutSplitCard from './WorkoutSplitCard';

const BALANCED = 'balanced';
const LEVELS: readonly WorkoutSplitLevel[] = ['beginner', 'intermediate'];

interface Pending {
  split: WorkoutSplit;
  sessionMinutes: TrainerSessionMinutes;
  focus: TrainerFocus | undefined;
  venue: WorkoutSplitVenue;
}

/**
 * The program finder: a few answers pick the closest ready-made program, fitted
 * to the person's session length and a muscle to focus on. The server rebuilds
 * the same program from the answers when it is added, so only the answers are
 * sent. Importing writes to the person's own library, so it is not offered
 * while acting on behalf of someone else.
 */
const WorkoutFinder = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { isActingOnBehalf } = useActiveUser();
  const importSplit = useImportWorkoutSplitMutation();
  const [goal, setGoal] = useState<WorkoutSplitGoal>('muscle');
  const [level, setLevel] = useState<WorkoutSplitLevel>('beginner');
  const [days, setDays] = useState<number>(3);
  const [minutes, setMinutes] = useState<TrainerSessionMinutes>(60);
  const [venue, setVenue] = useState<WorkoutSplitVenue>('gym');
  const [focus, setFocus] = useState<TrainerFocus | typeof BALANCED>(BALANCED);
  const [pending, setPending] = useState<Pending | null>(null);

  const heading = (
    <Link
      to="/exercises/workout-splits"
      className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
    >
      <ArrowLeft className="h-4 w-4" />
      {t('workoutSplits.finder.back', 'Workout programs')}
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

  const focusValue = focus === BALANCED ? undefined : focus;
  const recommendations = recommendWorkoutSplits({
    goal,
    level,
    daysPerWeek: days,
    venue,
  });

  const noteFor = (rec: TrainerRecommendation): string | undefined => {
    const differs: string[] = [];
    if (rec.daysDifference !== 0) {
      differs.push(
        t('workoutSplits.finder.differsDays', '{{days}} days a week', {
          days: rec.split.daysPerWeek,
        })
      );
    }
    if (!rec.matchesGoal) {
      differs.push(
        t('workoutSplits.finder.differsGoal', 'a {{goal}} program', {
          goal: goalLabel(t, rec.split.goal).toLowerCase(),
        })
      );
    }
    if (!rec.matchesLevel) {
      differs.push(
        t('workoutSplits.finder.differsLevel', 'a {{level}} program', {
          level: levelLabel(t, rec.split.level).toLowerCase(),
        })
      );
    }
    return differs.length === 0
      ? t('workoutSplits.finder.matches', 'Matches everything you asked for.')
      : t('workoutSplits.finder.differs', 'Closest match: {{differences}}.', {
          differences: differs.join(', '),
        });
  };

  const questions: {
    id: string;
    label: string;
    value: string;
    onChange: (value: string) => void;
    options: { value: string; label: string }[];
  }[] = [
    {
      id: 'goal',
      label: t('workoutSplits.filters.goal', 'Goal'),
      value: goal,
      onChange: (value) => setGoal(value as WorkoutSplitGoal),
      options: WORKOUT_SPLIT_GOALS.map((value) => ({
        value,
        label: goalLabel(t, value),
      })),
    },
    {
      id: 'level',
      label: t('workoutSplits.finder.experience', 'Training experience'),
      value: level,
      onChange: (value) => setLevel(value as WorkoutSplitLevel),
      options: LEVELS.map((value) => ({
        value,
        label:
          value === 'beginner'
            ? t('workoutSplits.finder.beginnerYears', 'Beginner, up to a year')
            : t(
                'workoutSplits.finder.intermediateYears',
                'Intermediate, over a year'
              ),
      })),
    },
    {
      id: 'days',
      label: t('workoutSplits.filters.days', 'Days a week'),
      value: String(days),
      onChange: (value) => setDays(Number(value)),
      options: TRAINER_DAYS_PER_WEEK.map((value) => ({
        value: String(value),
        label: String(value),
      })),
    },
    {
      id: 'minutes',
      label: t('workoutSplits.finder.minutes', 'Workout length'),
      value: String(minutes),
      onChange: (value) => setMinutes(Number(value) as TrainerSessionMinutes),
      options: TRAINER_SESSION_MINUTES.map((value) => ({
        value: String(value),
        label: t('workoutSplits.finder.minutesOption', '{{minutes}} minutes', {
          minutes: value,
        }),
      })),
    },
    {
      id: 'venue',
      label: t('workoutSplits.filters.venue', 'Where I train'),
      value: venue,
      onChange: (value) => setVenue(value as WorkoutSplitVenue),
      options: WORKOUT_SPLIT_VENUES.map((value) => ({
        value,
        label: venueLabel(t, value),
      })),
    },
    {
      id: 'focus',
      label: t('workoutSplits.finder.focus', 'Muscle to focus on'),
      value: focus,
      onChange: (value) => setFocus(value as TrainerFocus | typeof BALANCED),
      options: [
        {
          value: BALANCED,
          label: t('workoutSplits.finder.balanced', 'Balanced program'),
        },
        ...TRAINER_FOCUSES.map((value) => ({
          value,
          label: focusLabel(t, value),
        })),
      ],
    },
  ];

  return (
    <div className="space-y-6">
      {heading}
      <div>
        <h1 className="text-2xl font-bold">
          {t('workoutSplits.finder.title', 'Find my program')}
        </h1>
        <p className="text-sm text-muted-foreground">
          {t(
            'workoutSplits.finder.intro',
            'Answer a few questions and get the closest ready-made program, fitted to how long you want to train and a muscle you want to give extra attention.'
          )}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3">
        {questions.map((question) => (
          <div key={question.id} className="space-y-1.5">
            <Label htmlFor={`workout-finder-${question.id}`}>
              {question.label}
            </Label>
            <Select value={question.value} onValueChange={question.onChange}>
              <SelectTrigger id={`workout-finder-${question.id}`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {question.options.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ))}
      </div>

      <div className="space-y-4" data-testid="workout-finder-results">
        {recommendations.map((rec, index) => (
          <div
            key={rec.split.id}
            data-testid={`workout-finder-result-${index}`}
          >
            <WorkoutSplitCard
              split={rec.split}
              fitted={applyTrainerOptions(rec.split, {
                venue,
                sessionMinutes: minutes,
                focus: focusValue,
              })}
              note={
                index === 0
                  ? `${t('workoutSplits.finder.bestMatch', 'Best match.')} ${noteFor(rec)}`
                  : noteFor(rec)
              }
              onImport={(split) =>
                setPending({
                  split,
                  sessionMinutes: minutes,
                  focus: focusValue,
                  venue,
                })
              }
            />
          </div>
        ))}
      </div>

      <ImportWorkoutSplitDialog
        split={pending?.split ?? null}
        busy={importSplit.isPending}
        onCancel={() => setPending(null)}
        onImport={(split, planName, sessionNames, activate) =>
          pending &&
          importSplit.mutate(
            {
              splitId: split.id,
              body: {
                planName,
                sessionNames,
                activate,
                trainer: {
                  venue: pending.venue,
                  sessionMinutes: pending.sessionMinutes,
                  focus: pending.focus,
                },
              },
            },
            {
              onSuccess: () => {
                setPending(null);
                navigate('/exercises');
              },
            }
          )
        }
      />
    </div>
  );
};

export default WorkoutFinder;
