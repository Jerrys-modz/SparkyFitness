import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  advanceProgress,
  findProgram,
  programStatus,
  type ProgramProgress,
  type ProgramStatus,
} from '@workspace/shared';

/**
 * The person's place in a multi-week run program, kept on this phone (it is
 * a training plan, not diary data). One program at a time.
 */
const KEY = '@SparkyFitness/runProgram';

let cache: ProgramProgress | null | undefined;
const listeners = new Set<() => void>();

async function read(): Promise<ProgramProgress | null> {
  if (cache !== undefined) return cache;
  try {
    const raw = await AsyncStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as Partial<ProgramProgress>) : null;
    cache =
      parsed &&
      typeof parsed.programId === 'string' &&
      typeof parsed.next === 'number' &&
      findProgram(parsed.programId)
        ? {
            programId: parsed.programId,
            next: parsed.next,
            enabled: parsed.enabled !== false,
          }
        : null;
  } catch {
    cache = null;
  }
  return cache;
}

async function write(progress: ProgramProgress | null): Promise<void> {
  cache = progress;
  try {
    if (progress) await AsyncStorage.setItem(KEY, JSON.stringify(progress));
    else await AsyncStorage.removeItem(KEY);
  } catch {
    // Kept in memory for this launch.
  }
  listeners.forEach((listener) => listener());
}

/** The program the person has a place in, whether or not it is switched on. */
export async function getStoredProgram(): Promise<{
  status: ProgramStatus;
  enabled: boolean;
} | null> {
  const progress = await read();
  const status = progress ? programStatus(progress) : null;
  return status && progress
    ? { status, enabled: progress.enabled !== false }
    : null;
}

/** The program being used, or null when none is chosen or it is switched off. */
export async function getProgramStatus(): Promise<ProgramStatus | null> {
  const stored = await getStoredProgram();
  return stored?.enabled ? stored.status : null;
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
  const progress = await read();
  if (progress && findProgram(progress.programId)) {
    await write({ ...progress, enabled });
  } else if (enabled && findProgram(programId)) {
    await write({ programId, next: 0, enabled: true });
  }
}

/** Goes back to the first workout, keeping the program switched on. */
export async function restartProgram(): Promise<void> {
  const progress = await read();
  if (progress) await write({ ...progress, next: 0 });
}

/** Jumps to workout `index` (any week), to repeat one or start further in. */
export async function setProgramPosition(index: number): Promise<void> {
  const progress = await read();
  const program = progress ? findProgram(progress.programId) : null;
  if (!progress || !program) return;
  const next = Math.min(
    program.workouts.length - 1,
    Math.max(0, Math.floor(index))
  );
  await write({ ...progress, next });
}

/** Skips the workout that is due. */
export async function skipProgramWorkout(): Promise<void> {
  const progress = await read();
  if (progress) await write({ ...progress, next: progress.next + 1 });
}

/** Records workout `index` as done, if it is the one that was due. */
export async function completeProgramWorkout(
  programId: string,
  index: number
): Promise<void> {
  const progress = await read();
  if (!progress || progress.programId !== programId) return;
  const next = advanceProgress(progress, index);
  if (next !== progress) await write(next);
}

/** Test seam. */
export function resetRunProgramForTests(): void {
  cache = undefined;
  listeners.clear();
}

/** The current program status, or null when none is active. */
export function useRunProgram(): {
  /** The place in the program, even while it is switched off. */
  status: ProgramStatus | null;
  /** Whether the person is using it. */
  enabled: boolean;
  loaded: boolean;
} {
  const [state, setState] = useState<{
    status: ProgramStatus | null;
    enabled: boolean;
    loaded: boolean;
  }>({ status: null, enabled: false, loaded: false });
  useEffect(() => {
    let active = true;
    const refresh = () => {
      void getStoredProgram().then((stored) => {
        if (active) {
          setState({
            status: stored?.status ?? null,
            enabled: stored?.enabled ?? false,
            loaded: true,
          });
        }
      });
    };
    refresh();
    listeners.add(refresh);
    return () => {
      active = false;
      listeners.delete(refresh);
    };
  }, []);
  return state;
}
