import { beltSpeedFromPaceText } from '../../src/utils/beltPace';

const MILE = 1609.344;
const KM = 1000;

describe('beltSpeedFromPaceText', () => {
  it('reads minutes and seconds per mile', () => {
    expect(beltSpeedFromPaceText('12:00', MILE)).toBeCloseTo(2.2352, 3);
  });

  it('reads plain minutes, with a dot or a comma', () => {
    expect(beltSpeedFromPaceText('12', MILE)).toBeCloseTo(2.2352, 3);
    expect(beltSpeedFromPaceText('6,5', KM)).toBeCloseTo(1000 / 390, 3);
  });

  it('works per kilometre', () => {
    expect(beltSpeedFromPaceText('6:00', KM)).toBeCloseTo(2.7778, 3);
  });

  it('ignores surrounding space', () => {
    expect(beltSpeedFromPaceText('  10:30 ', MILE)).toBeCloseTo(MILE / 630, 3);
  });

  it('refuses text that is not a pace', () => {
    expect(beltSpeedFromPaceText('', MILE)).toBeNull();
    expect(beltSpeedFromPaceText('fast', MILE)).toBeNull();
    expect(beltSpeedFromPaceText('12:75', MILE)).toBeNull();
    expect(beltSpeedFromPaceText('-5', MILE)).toBeNull();
  });

  it('refuses a pace slower than a jog or faster than a sprint', () => {
    expect(beltSpeedFromPaceText('20:00', MILE)).toBeNull();
    expect(beltSpeedFromPaceText('1:00', KM)).toBeNull();
  });
});
