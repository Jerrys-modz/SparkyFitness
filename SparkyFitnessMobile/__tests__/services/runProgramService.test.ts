import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  completeProgramWorkout,
  getProgramStatus,
  resetRunProgramForTests,
  skipProgramWorkout,
  startProgram,
  stopProgram,
} from '../../src/services/runProgramService';

beforeEach(async () => {
  await AsyncStorage.clear();
  resetRunProgramForTests();
});

test('has no program until one is started', async () => {
  expect(await getProgramStatus()).toBeNull();
  await startProgram('couchTo5k');
  expect((await getProgramStatus())?.done).toBe(0);
});

test('ignores an unknown program', async () => {
  await startProgram('nope');
  expect(await getProgramStatus()).toBeNull();
});

test('moves on only when the due workout is completed', async () => {
  await startProgram('couchTo5k');
  await completeProgramWorkout('couchTo5k', 3);
  expect((await getProgramStatus())?.done).toBe(0);
  await completeProgramWorkout('couchTo5k', 0);
  expect((await getProgramStatus())?.done).toBe(1);
  await completeProgramWorkout('other', 1);
  expect((await getProgramStatus())?.done).toBe(1);
});

test('skips a workout and can be stopped', async () => {
  await startProgram('couchTo5k');
  await skipProgramWorkout();
  expect((await getProgramStatus())?.done).toBe(1);
  await stopProgram();
  expect(await getProgramStatus()).toBeNull();
});

test('survives a relaunch', async () => {
  await startProgram('couchTo5k');
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
