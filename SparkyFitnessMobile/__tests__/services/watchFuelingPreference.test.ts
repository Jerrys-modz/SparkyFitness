import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  getWatchFuelingPreference,
  normalizeWatchFuelingPreference,
  onWatchFuelingPreferenceChange,
  saveWatchFuelingPreference,
  watchFuelingContext,
} from '../../src/services/watchFuelingPreference';

const KEY = '@SparkyFitness/watchFuelingPreference';
const plan = {
  carbIntervalMin: 25,
  portionGrams: 25,
  drinkIntervalMin: 20,
  mlPerDrink: 150,
};

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe('normalizeWatchFuelingPreference', () => {
  it('keeps values the watch accepts', () => {
    expect(normalizeWatchFuelingPreference(plan)).toEqual(plan);
  });

  it('brings values inside the ranges the watch steppers allow', () => {
    expect(
      normalizeWatchFuelingPreference({
        carbIntervalMin: 3,
        portionGrams: 900,
        drinkIntervalMin: 500,
        mlPerDrink: 1,
      })
    ).toEqual({
      carbIntervalMin: 10,
      portionGrams: 100,
      drinkIntervalMin: 60,
      mlPerDrink: 50,
    });
  });

  it('rounds to whole numbers', () => {
    expect(
      normalizeWatchFuelingPreference({ ...plan, carbIntervalMin: 24.6 })
        ?.carbIntervalMin
    ).toBe(25);
  });

  it('rejects anything unusable', () => {
    expect(normalizeWatchFuelingPreference(null)).toBeNull();
    expect(
      normalizeWatchFuelingPreference({ ...plan, portionGrams: 'x' })
    ).toBeNull();
    expect(normalizeWatchFuelingPreference({ carbIntervalMin: 25 })).toBeNull();
  });
});

describe('the saved preference', () => {
  it('is empty until something is saved', async () => {
    expect(await getWatchFuelingPreference()).toBeNull();
  });

  it('saves, reads back and tells listeners', async () => {
    const listener = jest.fn();
    const unsubscribe = onWatchFuelingPreferenceChange(listener);

    await saveWatchFuelingPreference(plan);

    expect(await getWatchFuelingPreference()).toEqual(plan);
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
  });

  it('stays quiet when nothing changed', async () => {
    await saveWatchFuelingPreference(plan);
    const listener = jest.fn();
    const unsubscribe = onWatchFuelingPreferenceChange(listener);

    await saveWatchFuelingPreference({ ...plan });

    expect(listener).not.toHaveBeenCalled();
    unsubscribe();
  });

  it('stores the clamped numbers', async () => {
    await saveWatchFuelingPreference({ ...plan, portionGrams: 5000 });
    expect((await getWatchFuelingPreference())?.portionGrams).toBe(100);
  });

  it('ignores an unreadable record', async () => {
    await AsyncStorage.setItem(KEY, 'not json');
    expect(await getWatchFuelingPreference()).toBeNull();
  });

  it('does not throw when storage fails', async () => {
    (AsyncStorage.setItem as jest.Mock).mockRejectedValueOnce(
      new Error('disk full')
    );
    await expect(saveWatchFuelingPreference(plan)).resolves.toBeUndefined();
    expect(await getWatchFuelingPreference()).toBeNull();
  });
});

describe('watchFuelingContext', () => {
  it('names the four values the watch reads', () => {
    expect(watchFuelingContext(plan)).toEqual({
      runFuelIntervalMin: 25,
      runFuelPortionGrams: 25,
      runDrinkIntervalMin: 20,
      runDrinkMl: 150,
    });
  });

  it('sends nothing without a preference, so the watch keeps its last', () => {
    expect(watchFuelingContext(null)).toEqual({});
  });
});
