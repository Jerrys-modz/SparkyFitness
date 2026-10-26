import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { estimateSessionMinutes, type WorkoutSplit } from '@workspace/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  exerciseLabel,
  exerciseTarget,
  goalLabel,
  levelLabel,
  sessionName,
  splitDescription,
  splitName,
  venueLabel,
} from '@/utils/workoutSplits';

interface WorkoutSplitCardProps {
  split: WorkoutSplit;
  onImport: (split: WorkoutSplit) => void;
  /** The program as fitted to the person; its sessions are shown, with their length. */
  fitted?: WorkoutSplit;
  /** Where the program differs from what was asked, for the program finder. */
  note?: string;
}

/** One built-in split: what it is, what it needs, a look at its sessions, and the way to add it. */
const WorkoutSplitCard = ({
  split,
  onImport,
  fitted,
  note,
}: WorkoutSplitCardProps) => {
  const { t } = useTranslation();
  const [showSessions, setShowSessions] = useState(false);

  return (
    <Card data-testid={`workout-split-${split.id}`}>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{splitName(t, split.id)}</CardTitle>
        <div className="flex flex-wrap gap-1.5">
          <Badge variant="secondary">{levelLabel(t, split.level)}</Badge>
          <Badge variant="outline">{goalLabel(t, split.goal)}</Badge>
          <Badge variant="outline">{venueLabel(t, split.venue)}</Badge>
        </div>
        <p className="text-xs text-muted-foreground">
          {t(
            'workoutSplits.card.summary',
            '{{days}} days a week, {{sessions}} sessions in rotation',
            { days: split.daysPerWeek, sessions: split.sessions.length }
          )}
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          {splitDescription(t, split.id)}
        </p>
        {note ? <p className="text-sm font-medium">{note}</p> : null}
        {showSessions ? (
          <div
            className="space-y-3"
            data-testid={`workout-split-sessions-${split.id}`}
          >
            {(fitted ?? split).sessions.map((session) => (
              <div key={session.id}>
                <h4 className="text-sm font-medium">
                  {sessionName(t, session.id)}
                  {fitted
                    ? ` · ${t('workoutSplits.card.minutes', 'about {{minutes}} min', { minutes: estimateSessionMinutes(session) })}`
                    : ''}
                </h4>
                <ul className="mt-1 space-y-0.5 text-sm text-muted-foreground">
                  {session.exercises.map((exercise) => (
                    <li
                      key={exercise.exerciseId}
                      className="flex justify-between gap-3"
                    >
                      <span>{exerciseLabel(exercise.exerciseId)}</span>
                      <span className="shrink-0 tabular-nums">
                        {exerciseTarget(t, exercise)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-expanded={showSessions}
            onClick={() => setShowSessions((shown) => !shown)}
          >
            {showSessions
              ? t('workoutSplits.card.hideSessions', 'Hide sessions')
              : t('workoutSplits.card.showSessions', 'Show sessions')}
          </Button>
          <Button type="button" size="sm" onClick={() => onImport(split)}>
            {t('workoutSplits.card.add', 'Add to my workouts')}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

export default WorkoutSplitCard;
