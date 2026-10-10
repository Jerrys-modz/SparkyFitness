import { tool } from 'ai';
import {
  adjustRunning,
  firstIndexOfWeek,
  moveTo,
  planMinutes,
  ProgramAdjustError,
  repeatWeek,
  type RunProgramResponse,
} from '@workspace/shared';
import { log } from '../../config/logging.js';
import {
  adjustRunProgram,
  getRunProgram,
  upsertRunProgram,
} from '../../models/runProgramRepository.js';
import { ERRORS, formatZodError } from './errors.js';
import { formatConfirmation } from './formatting.js';
import { normalizeActionArgs } from './dates.js';
import {
  manageRunProgramSchema,
  manageRunProgramInput,
  RUN_PROGRAM_ACTIONS,
  type ManageRunProgramInput,
} from './schemas/runProgram.js';

const VALID_ACTIONS = [...RUN_PROGRAM_ACTIONS];

const NO_PROGRAM =
  'The user is not following a run program. Offer to start one (action start_run_program) if they want to; do not assume.';

const runSeconds = (workout: RunProgramResponse['workouts'][number]): number =>
  workout.plan.steps
    .filter((step) => step.kind === 'work')
    .reduce((sum, step) => sum + step.seconds, 0);

function describeWorkout(
  workout: RunProgramResponse['workouts'][number]
): string {
  return `week ${workout.week + 1}, run ${workout.day + 1}: ${planMinutes(workout.plan)} min in all, ${Math.round(runSeconds(workout) / 60)} min of running`;
}

function summarise(program: RunProgramResponse): string {
  const total = program.workouts.length;
  const done = Math.min(program.next_index, total);
  const lines = [
    `# Run program: ${program.program_id}`,
    `Switched on: ${program.enabled ? 'yes' : 'no'}`,
    `Progress: ${done} of ${total} workouts done${done >= total ? ' (finished)' : ''}`,
  ];
  const upcoming = program.workouts.slice(done, done + 3);
  if (upcoming.length > 0) {
    lines.push('', 'Next workouts:');
    upcoming.forEach((workout, i) =>
      lines.push(`${i + 1}. ${describeWorkout(workout)}`)
    );
  }
  const recent = program.adjustment_log.slice(-5);
  if (recent.length > 0) {
    lines.push('', 'Recent changes:');
    for (const entry of recent) {
      lines.push(
        `- ${entry.at.slice(0, 10)} (${entry.source}): ${entry.summary}`
      );
    }
  }
  return lines.join('\n');
}

const confirmFirst = (what: string): string =>
  `${what} Confirm with the user first. If they agree, call this action again with the same fields and confirmed=true. Nothing was changed.`;

export function buildRunProgramTools(userId: string, tz: string) {
  return {
    sparky_manage_run_program: tool({
      description: `The user's run program (for example the nine-week Beginner 5K): see where they are, and adjust the upcoming workouts based on how their runs have gone.

This tool takes a FLAT object with an "action" field. Do NOT nest fields under the action name.

To judge progress, read the user's recent runs first (sparky_get_exercise_stats / sparky_get_exercise_diary) and listen to what they say (an injury, a missed week, a hard run). Prefer the smallest change that helps. Changes only ever touch workouts not yet done, and running time can be eased by up to 30% but raised by at most 10% at a time. Always say what you changed and why.

Actions:
- action: 'get_run_program' — progress, the next workouts and recent changes
- action: 'start_run_program' (fields: program_id? default beginner5k, confirmed) — starts the program from workout 1, or switches it on
- action: 'set_run_program_enabled' (fields: enabled, confirmed) — switches the program on or off, keeping their place
- action: 'repeat_run_program_week' (fields: week (1-based), confirmed) — goes back to the start of a week to do it again
- action: 'move_run_program' (fields: week (1-based), run? (1-based, default 1), confirmed) — jumps to a workout
- action: 'adjust_run_program_running' (fields: percent (-30 to +10), count? (1-9, default 1), confirmed) — makes the running in the next workouts shorter or a little longer, keeping walking, warm-up and cool-down

Every change needs confirmed=true after the user has agreed.`,
      inputSchema: manageRunProgramInput,
      execute: async (rawArgs) => {
        const normalized = normalizeActionArgs(
          rawArgs,
          tz,
          VALID_ACTIONS,
          () => 'get_run_program'
        );
        const parsed = manageRunProgramSchema.safeParse(normalized);
        if (!parsed.success) return formatZodError(parsed.error);
        const args: ManageRunProgramInput = parsed.data;
        try {
          if (args.action === 'get_run_program') {
            const program = await getRunProgram(userId, userId);
            return program ? summarise(program) : NO_PROGRAM;
          }

          if (args.action === 'start_run_program') {
            if (args.confirmed !== true) {
              return confirmFirst('This will start the run program.');
            }
            const program = await upsertRunProgram(
              userId,
              {
                program_id: args.program_id ?? 'beginner5k',
                enabled: true,
              },
              userId
            );
            return `${formatConfirmation('Run program started.')}\n\n${summarise(program)}`;
          }

          const existing = await getRunProgram(userId, userId);
          if (!existing) return NO_PROGRAM;

          if (args.action === 'set_run_program_enabled') {
            if (args.confirmed !== true) {
              return confirmFirst(
                `This will switch the run program ${args.enabled ? 'on' : 'off'}.`
              );
            }
            const program = await upsertRunProgram(
              userId,
              { program_id: existing.program_id, enabled: args.enabled },
              userId
            );
            return `${formatConfirmation(`Run program switched ${args.enabled ? 'on' : 'off'}.`)}\n\n${summarise(program)}`;
          }

          let change;
          let describe: string;
          if (args.action === 'repeat_run_program_week') {
            if (firstIndexOfWeek(existing.workouts, args.week - 1) < 0) {
              return ERRORS.VALIDATION(`There is no week ${args.week}.`);
            }
            describe = `This will take the user back to the start of week ${args.week}.`;
            change = (state: Parameters<typeof repeatWeek>[0]) =>
              repeatWeek(state, args.week - 1);
          } else if (args.action === 'move_run_program') {
            const first = firstIndexOfWeek(existing.workouts, args.week - 1);
            if (first < 0) {
              return ERRORS.VALIDATION(`There is no week ${args.week}.`);
            }
            const target = first + (args.run ?? 1) - 1;
            describe = `This will move the user to week ${args.week}, run ${args.run ?? 1}.`;
            change = (state: Parameters<typeof moveTo>[0]) =>
              moveTo(state, target);
          } else {
            const count = args.count ?? 1;
            describe = `This will change the running time in the next ${count} workout${count === 1 ? '' : 's'} by ${args.percent}%.`;
            change = (state: Parameters<typeof adjustRunning>[0]) =>
              adjustRunning(state, args.percent, count);
          }
          if (args.confirmed !== true) return confirmFirst(describe);

          const program = await adjustRunProgram(
            userId,
            'assistant',
            change,
            userId
          );
          if (!program) return NO_PROGRAM;
          const last =
            program.adjustment_log[program.adjustment_log.length - 1];
          return `${formatConfirmation(last?.summary ?? 'Run program updated.')}\n\n${summarise(program)}`;
        } catch (error) {
          if (error instanceof ProgramAdjustError) {
            return ERRORS.VALIDATION(error.message);
          }
          log('error', '[Run Program Tool] Error:', error);
          return ERRORS.DB_ERROR(error);
        }
      },
    }),
  };
}
