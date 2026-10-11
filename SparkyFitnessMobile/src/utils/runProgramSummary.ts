import type { TFunction } from 'i18next';
import {
  projectRuns,
  storedProgramStatus,
  type ProgramStatus,
  type RunProgramResponse,
} from '@workspace/shared';
import { formatDayLabel } from './dayLabel';

/**
 * One line for after a program run is saved: what is next and when. Works from
 * the program as the server now holds it, so the workout just finished is
 * already behind it.
 */
export function nextProgramLine(
  t: TFunction,
  stored: RunProgramResponse,
  today: string,
  workoutLabel: (status: ProgramStatus) => string
): string {
  const status = storedProgramStatus(stored);
  if (status.finished) {
    return t('recordActivity.program.savedFinished', {
      defaultValue: 'Program complete. Well done!',
    });
  }
  const label = workoutLabel(status);
  const [next] = projectRuns({
    total: status.total,
    next: status.done,
    today,
    doneToday: true,
    limit: 1,
    schedule: {
      runDays: stored.run_days,
      startDay: stored.start_date,
      endDay: stored.end_date,
    },
  });
  if (!next) {
    return t('recordActivity.program.savedNext', {
      label,
      defaultValue: 'Next: {{label}}',
    });
  }
  return t('recordActivity.program.savedNextOn', {
    label,
    date: formatDayLabel(next.day),
    defaultValue: 'Next: {{label}} on {{date}}',
  });
}
