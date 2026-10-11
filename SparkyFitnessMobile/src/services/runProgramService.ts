import { useQuery } from '@tanstack/react-query';
import {
  storedProgramStatus,
  type ProgramStatus,
  type RunProgramAdjustment,
  type RunProgramResponse,
} from '@workspace/shared';
import { queryClient } from '../hooks/queryClient';
import { runProgramQueryKey } from '../hooks/queryKeys';
import {
  fetchRunProgram,
  markRunProgramWorkoutDone,
  saveRunProgram,
} from './api/runProgramApi';

/**
 * The person's run program and place in it. It lives on the server so the AI
 * assistant can adjust upcoming workouts and every device agrees on where they
 * are; this keeps the React Query copy in step after each change. The weekly
 * reminders stay on the phone (`runReminderService`).
 */

const setCache = (program: RunProgramResponse | null) =>
  queryClient.setQueryData(runProgramQueryKey, program);

async function load(): Promise<RunProgramResponse | null> {
  return (await fetchRunProgram()).program;
}

/** The stored program as the server has it now, not as this device last saw it. */
const freshProgram = (): Promise<RunProgramResponse | null> =>
  queryClient.fetchQuery({
    queryKey: runProgramQueryKey,
    queryFn: load,
    staleTime: 0,
  });

/** The program being used, or null when none is chosen or it is switched off. */
export async function getProgramStatus(): Promise<ProgramStatus | null> {
  const program = await freshProgram();
  return program?.enabled ? storedProgramStatus(program) : null;
}

/**
 * Switches the program on or off. Turning it on for the first time starts
 * `programId` from its first workout; after that it picks up where the person
 * left off. Turning it off keeps their place.
 */
export async function setProgramEnabled(
  enabled: boolean,
  programId: string
): Promise<void> {
  const current = await freshProgram();
  if (!current && !enabled) return;
  setCache(
    (
      await saveRunProgram({
        program_id: current?.program_id ?? programId,
        enabled,
      })
    ).program
  );
}

/**
 * Starts `programId` from its first workout and switches it on. Choosing the
 * program already held just switches it on and keeps the place; choosing a
 * different one replaces it (the server reseeds the workouts and the place).
 */
export async function startProgram(programId: string): Promise<void> {
  setCache(
    (await saveRunProgram({ program_id: programId, enabled: true })).program
  );
}

/** Jumps to any workout (0-based), to repeat one or start further in. */
export async function setProgramPosition(index: number): Promise<void> {
  const current = await freshProgram();
  if (!current) return;
  setCache(
    (
      await saveRunProgram({
        program_id: current.program_id,
        next_index: Math.max(0, Math.floor(index)),
      })
    ).program
  );
}

/** Goes back to the first workout, keeping the program switched on. */
export const restartProgram = (): Promise<void> => setProgramPosition(0);

/** Skips the workout that is due. */
export async function skipProgramWorkout(): Promise<void> {
  const current = await freshProgram();
  if (current) await setProgramPosition(current.next_index + 1);
}

/** Records workout `index` as done, if it is the one that was due. */
export async function completeProgramWorkout(
  programId: string,
  index: number
): Promise<void> {
  setCache(
    (await markRunProgramWorkoutDone({ index, program_id: programId })).program
  );
}

/** The current program status, or null when none is active. */
export function useRunProgram(): {
  /** The place in the program, even while it is switched off. */
  status: ProgramStatus | null;
  /** Whether the person is using it. */
  enabled: boolean;
  /** The most recent change to the workouts or place made by Sparky or the person, if any. */
  lastAdjustment: RunProgramAdjustment | null;
  loaded: boolean;
} {
  const { data, isSuccess } = useQuery({
    queryKey: runProgramQueryKey,
    queryFn: load,
    // Always re-read on opening a screen: the assistant may have changed it.
    staleTime: 0,
  });
  return {
    status: data ? storedProgramStatus(data) : null,
    enabled: data?.enabled ?? false,
    lastAdjustment: data?.adjustment_log.at(-1) ?? null,
    loaded: isSuccess,
  };
}
