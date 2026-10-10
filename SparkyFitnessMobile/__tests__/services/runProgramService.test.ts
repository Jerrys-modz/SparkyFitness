import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  completeProgramWorkout,
  getProgramStatus,
  resetRunProgramForTests,
  setProgramPosition,
  skipProgramWorkout,
  setProgramEnabled,
  restartProgram,
  getStoredProgram,
} from '../../src/services/runProgramService';

beforeEach(async () => {
  await AsyncStorage.clear();
  resetRunProgramForTests();
});

test('has no program until one is started', async () => {
  expect(await getProgramStatus()).toBeNull();
  await setProgramEnabled(true, 'beginner5k');
  expect((await getProgramStatus())?.done).toBe(0);
});

test('ignores an unknown program', async () => {
  await setProgramEnabled(true, 'nope');
  expect(await getProgramStatus()).toBeNull();
});

test('moves on only when the due workout is completed', async () => {
  await setProgramEnabled(true, 'beginner5k');
  await completeProgramWorkout('beginner5k', 3);
  expect((await getProgramStatus())?.done).toBe(0);
  await completeProgramWorkout('beginner5k', 0);
  expect((await getProgramStatus())?.done).toBe(1);
  await completeProgramWorkout('other', 1);
  expect((await getProgramStatus())?.done).toBe(1);
});

test('skips a workout and can start over', async () => {
  await setProgramEnabled(true, 'beginner5k');
  await skipProgramWorkout();
  expect((await getProgramStatus())?.done).toBe(1);
  await restartProgram();
  expect((await getProgramStatus())?.done).toBe(0);
});

test('switching it off hides the program but keeps the place', async () => {
  await setProgramEnabled(true, 'beginner5k');
  await skipProgramWorkout();
  await skipProgramWorkout();
  await setProgramEnabled(false, 'beginner5k');
  expect(await getProgramStatus()).toBeNull();
  expect((await getStoredProgram())?.enabled).toBe(false);
  expect((await getStoredProgram())?.status.done).toBe(2);
  await setProgramEnabled(true, 'beginner5k');
  expect((await getProgramStatus())?.done).toBe(2);
});

test('switching it off with nothing started does nothing', async () => {
  await setProgramEnabled(false, 'beginner5k');
  expect(await getStoredProgram()).toBeNull();
});

test('older stored progress counts as switched on', async () => {
  await AsyncStorage.setItem(
    '@SparkyFitness/runProgram',
    JSON.stringify({ programId: 'beginner5k', next: 3 })
  );
  expect((await getProgramStatus())?.done).toBe(3);
});

test('survives a relaunch', async () => {
  await setProgramEnabled(true, 'beginner5k');
  await skipProgramWorkout();
  resetRunProgramForTests();
  expect((await getProgramStatus())?.done).toBe(1);
});

test('drops stored junk', async () => {
  await AsyncStorage.setItem(
    '@SparkyFitness/runProgram',
    JSON.stringify({ programId: 'gone', next: 'x' })
  );
  expect(await getProgramStatus()).toBeNull();
});

test('jumps to any workout and clamps out-of-range positions', async () => {
  await setProgramEnabled(true, 'beginner5k');
  await setProgramPosition(13);
  expect((await getProgramStatus())?.done).toBe(13);
  await setProgramPosition(999);
  expect((await getProgramStatus())?.done).toBe(26);
  await setProgramPosition(-4);
  expect((await getProgramStatus())?.done).toBe(0);
});

test('a jump does nothing without a program', async () => {
  await setProgramPosition(5);
  expect(await getProgramStatus()).toBeNull();
});
