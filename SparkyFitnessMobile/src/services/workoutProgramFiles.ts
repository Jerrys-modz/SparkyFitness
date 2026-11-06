import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import {
  workoutProgramFileSchema,
  type WorkoutProgramFile,
} from '@workspace/shared';

/** Far above any real program file; a bigger pick is not one. */
const MAX_PROGRAM_FILE_BYTES = 2 * 1024 * 1024;

/** The picked file is not a SparkyFitness workout program file. */
export class InvalidWorkoutProgramFileError extends Error {
  constructor() {
    super('Not a SparkyFitness workout file.');
    this.name = 'InvalidWorkoutProgramFileError';
  }
}

/** File name for a program, matching the server's download name. */
export function workoutProgramFileName(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return `${slug || 'workout'}.sparkyfitness.json`;
}

/**
 * Writes a program file to the cache and opens the share sheet (Messages,
 * mail, Files, AirDrop...). Resolves to false when the sheet was closed
 * without choosing; other failures throw.
 */
export async function shareWorkoutProgramFile(
  program: WorkoutProgramFile,
  name: string
): Promise<boolean> {
  const file = new File(Paths.cache, workoutProgramFileName(name));
  if (file.exists) file.delete();
  file.create();
  file.write(JSON.stringify(program, null, 2));
  try {
    await Sharing.shareAsync(file.uri, {
      mimeType: 'application/json',
      UTI: 'public.json',
      dialogTitle: name,
    });
    return true;
  } catch (error: unknown) {
    if (error instanceof Error && error.message?.includes('cancel')) {
      return false;
    }
    throw error;
  }
}

/** Checks text read from a file; throws when it is not a program file. */
export function parseWorkoutProgramFile(text: string): WorkoutProgramFile {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new InvalidWorkoutProgramFileError();
  }
  const parsed = workoutProgramFileSchema.safeParse(json);
  if (!parsed.success) throw new InvalidWorkoutProgramFileError();
  return parsed.data;
}

/**
 * Lets the person pick a workout file someone shared and checks it before
 * anything is sent. Resolves to null when the picker was closed.
 */
export async function pickWorkoutProgramFile(): Promise<WorkoutProgramFile | null> {
  const picked = await DocumentPicker.getDocumentAsync({
    type: '*/*',
    copyToCacheDirectory: true,
    multiple: false,
  });
  const asset = picked.canceled ? undefined : picked.assets[0];
  if (!asset) return null;
  const copy = new File(asset.uri);
  try {
    if (asset.size !== undefined && asset.size > MAX_PROGRAM_FILE_BYTES) {
      throw new InvalidWorkoutProgramFileError();
    }
    return parseWorkoutProgramFile(await copy.text());
  } finally {
    // The picker copied the file into the cache; it is not needed afterwards.
    try {
      copy.delete();
    } catch {
      // Already gone, or not ours to delete.
    }
  }
}
