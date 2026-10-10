import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  advanceProgress,
  findProgram,
  programStatus,
  type ProgramProgress,
  type ProgramStatus,
} from '../utils/runPrograms';

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
        ? { programId: parsed.programId, next: parsed.next }
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

export async function getProgramStatus(): Promise<ProgramStatus | null> {
  const progress = await read();
  return progress ? programStatus(progress) : null;
}

/** Starts a program from its first workout. */
export function startProgram(programId: string): Promise<void> {
  return findProgram(programId)
    ? write({ programId, next: 0 })
    : Promise.resolve();
}

/** Leaves the program and forgets the place in it. */
export function stopProgram(): Promise<void> {
  return write(null);
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
  status: ProgramStatus | null;
  loaded: boolean;
} {
  const [state, setState] = useState<{
    status: ProgramStatus | null;
    loaded: boolean;
  }>({ status: null, loaded: false });
  useEffect(() => {
    let active = true;
    const refresh = () => {
      void getProgramStatus().then((status) => {
        if (active) setState({ status, loaded: true });
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
