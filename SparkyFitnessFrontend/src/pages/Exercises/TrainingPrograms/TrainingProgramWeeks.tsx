import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { programWeeks, type RunProgram } from '@workspace/shared';
import { Button } from '@/components/ui/button';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';

interface TrainingProgramWeeksProps {
  program: RunProgram;
}

/**
 * Every workout of a program, week by week, behind a toggle. Read-only:
 * browsing a program here never changes the person's own.
 */
const TrainingProgramWeeks = ({ program }: TrainingProgramWeeksProps) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const weeks = useMemo(() => programWeeks(program), [program]);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="px-0"
          data-testid={`training-weeks-toggle-${program.id}`}
        >
          {open ? (
            <ChevronDown className="mr-1 h-4 w-4" />
          ) : (
            <ChevronRight className="mr-1 h-4 w-4" />
          )}
          {open
            ? t('trainingPrograms.picker.hideWeeks', 'Hide the weeks')
            : t('trainingPrograms.picker.showWeeks', 'Show every week')}
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div
          className="grid gap-3 sm:grid-cols-2"
          data-testid={`training-weeks-${program.id}`}
        >
          {weeks.map(({ week, workouts }) => (
            <div key={week}>
              <p className="text-xs font-semibold">
                {t('trainingPrograms.picker.week', 'Week {{week}}', {
                  week: week + 1,
                })}
              </p>
              <ul className="text-xs text-muted-foreground">
                {workouts.map(
                  ({ index, workout, totalMinutes, effortMinutes }) => (
                    <li key={index}>
                      {program.activity === 'walk'
                        ? t(
                            'trainingPrograms.picker.workoutWalk',
                            'Walk {{number}} · {{total}} min, {{effort}} min brisk',
                            {
                              number: workout.day + 1,
                              total: totalMinutes,
                              effort: effortMinutes,
                            }
                          )
                        : t(
                            'trainingPrograms.picker.workoutRun',
                            'Run {{number}} · {{total}} min, {{effort}} min of effort',
                            {
                              number: workout.day + 1,
                              total: totalMinutes,
                              effort: effortMinutes,
                            }
                          )}
                    </li>
                  )
                )}
              </ul>
            </div>
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
};

export default TrainingProgramWeeks;
