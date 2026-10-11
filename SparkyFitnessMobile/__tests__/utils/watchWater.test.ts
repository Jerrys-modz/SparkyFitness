import { watchWaterFromFoodMl } from '../../src/utils/watchWater';

describe('watchWaterFromFoodMl', () => {
  it('sends nothing when food water does not count toward intake', () => {
    expect(watchWaterFromFoodMl(false, 400)).toBeNull();
    expect(watchWaterFromFoodMl(undefined, 400)).toBeNull();
    expect(watchWaterFromFoodMl(null, 400)).toBeNull();
  });

  it('sends the amount from food when the setting is on', () => {
    expect(watchWaterFromFoodMl(true, 400)).toBe(400);
  });

  it('sends 0 when the setting is on but no food water is logged yet', () => {
    expect(watchWaterFromFoodMl(true, 0)).toBe(0);
    expect(watchWaterFromFoodMl(true, undefined)).toBe(0);
    expect(watchWaterFromFoodMl(true, NaN)).toBe(0);
  });
});
