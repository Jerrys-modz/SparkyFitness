import * as DocumentPicker from 'expo-document-picker';
import * as Sharing from 'expo-sharing';
import {
  WORKOUT_PROGRAM_FILE_FORMAT,
  WORKOUT_PROGRAM_FILE_VERSION,
} from '@workspace/shared';
import {
  InvalidWorkoutProgramFileError,
  parseWorkoutProgramFile,
  pickWorkoutProgramFile,
  shareWorkoutProgramFile,
  workoutProgramFileName,
} from '../../src/services/workoutProgramFiles';

const mockText = jest.fn();
const mockWrite = jest.fn();
const mockDelete = jest.fn();
jest.mock('expo-file-system', () => ({
  File: jest.fn().mockImplementation((dirOrUri: unknown, name?: string) => ({
    uri: name ? `file:///cache/${name}` : dirOrUri,
    exists: false,
    create: jest.fn(),
    write: (...args: unknown[]) => mockWrite(...args),
    text: (...args: unknown[]) => mockText(...args),
    delete: (...args: unknown[]) => mockDelete(...args),
  })),
  Paths: { cache: { uri: 'file:///cache/' } },
}));
jest.mock('expo-document-picker', () => ({ getDocumentAsync: jest.fn() }));

const pick = DocumentPicker.getDocumentAsync as jest.Mock;
const share = Sharing.shareAsync as jest.Mock;

const program = {
  format: WORKOUT_PROGRAM_FILE_FORMAT,
  version: WORKOUT_PROGRAM_FILE_VERSION,
  exercises: [{ key: 'e1', name: 'Push Up' }],
  presets: [
    {
      key: 'p1',
      name: 'Push Day',
      workoutFormat: 'standard' as const,
      exercises: [{ exercise: 'e1', sets: [{ setNumber: 1, reps: 10 }] }],
    },
  ],
  plan: null,
};

beforeEach(() => {
  jest.clearAllMocks();
  share.mockResolvedValue(undefined);
});

describe('workoutProgramFileName', () => {
  it('makes a safe file name', () => {
    expect(workoutProgramFileName('Push Day!')).toBe(
      'push-day.sparkyfitness.json'
    );
    expect(workoutProgramFileName('!!!')).toBe('workout.sparkyfitness.json');
  });
});

describe('shareWorkoutProgramFile', () => {
  it('writes the JSON to the cache and opens the share sheet', async () => {
    await expect(shareWorkoutProgramFile(program, 'Push Day')).resolves.toBe(
      true
    );
    expect(JSON.parse(mockWrite.mock.calls[0][0])).toEqual(program);
    expect(share).toHaveBeenCalledWith(
      'file:///cache/push-day.sparkyfitness.json',
      expect.objectContaining({ mimeType: 'application/json' })
    );
  });

  it('resolves to false when the sheet is dismissed', async () => {
    share.mockRejectedValueOnce(new Error('User cancelled'));
    await expect(shareWorkoutProgramFile(program, 'Push Day')).resolves.toBe(
      false
    );
  });
});

describe('parseWorkoutProgramFile', () => {
  it('accepts a program file', () => {
    expect(
      parseWorkoutProgramFile(JSON.stringify(program)).presets
    ).toHaveLength(1);
  });

  it.each(['not json', '{"hello":"world"}'])('rejects %s', (text) => {
    expect(() => parseWorkoutProgramFile(text)).toThrow(
      InvalidWorkoutProgramFileError
    );
  });
});

describe('pickWorkoutProgramFile', () => {
  it('resolves to null when the picker is closed', async () => {
    pick.mockResolvedValue({ canceled: true, assets: null });
    await expect(pickWorkoutProgramFile()).resolves.toBeNull();
  });

  it('reads and checks the chosen file, then removes the cached copy', async () => {
    pick.mockResolvedValue({
      canceled: false,
      assets: [{ uri: 'file:///cache/push.json', size: 400 }],
    });
    mockText.mockResolvedValue(JSON.stringify(program));
    await expect(pickWorkoutProgramFile()).resolves.toMatchObject({
      presets: [{ name: 'Push Day' }],
    });
    expect(mockDelete).toHaveBeenCalled();
  });

  it('refuses a file that is not a workout file', async () => {
    pick.mockResolvedValue({
      canceled: false,
      assets: [{ uri: 'file:///cache/photo.jpg', size: 400 }],
    });
    mockText.mockResolvedValue('garbage');
    await expect(pickWorkoutProgramFile()).rejects.toBeInstanceOf(
      InvalidWorkoutProgramFileError
    );
    expect(mockDelete).toHaveBeenCalled();
  });

  it('refuses a file far too big without reading it', async () => {
    pick.mockResolvedValue({
      canceled: false,
      assets: [{ uri: 'file:///cache/big.json', size: 50 * 1024 * 1024 }],
    });
    await expect(pickWorkoutProgramFile()).rejects.toBeInstanceOf(
      InvalidWorkoutProgramFileError
    );
    expect(mockText).not.toHaveBeenCalled();
  });
});
