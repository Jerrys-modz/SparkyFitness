import { evaluateFitnessTest } from '@workspace/shared';
import type { RecordedPoint } from '../../src/utils/gpsRecording';
import {
  activeSecondsAtDistance,
  distanceAtActiveSeconds,
  fitnessTestName,
  fitnessTestProgress,
  fitnessTestResultText,
  measureFitnessTest,
  paceChangeText,
  paceInUnit,
  paceRangeText,
  paceText,
} from '../../src/utils/fitnessTest';
import { fitnessTest } from '../helpers/fitnessTestFixture';

const DEG_PER_METER = 1 / 111_194.9;
const START = Date.UTC(2026, 9, 6, 10, 0, 0);

/** A fix every 10 s moving north at a steady `metersPerSecond`. */
function steadyRun(
  seconds: number,
  metersPerSecond: number,
  overrides: Partial<RecordedPoint> = {}
): RecordedPoint[] {
  const points: RecordedPoint[] = [];
  for (let s = 0; s <= seconds; s += 10) {
    points.push({
      t: START + s * 1000,
      lat: 51.5 + s * metersPerSecond * DEG_PER_METER,
      lon: -0.12,
      alt: null,
      hacc: 5,
      vacc: null,
      speed: null,
      course: null,
      seg: 0,
      ...overrides,
    });
  }
  return points;
}

describe('reading a recording at a mark', () => {
  it('finds the distance after some active time, between fixes', () => {
    const points = steadyRun(100, 4);
    expect(distanceAtActiveSeconds(points, 0)).toBe(0);
    expect(distanceAtActiveSeconds(points, 50)).toBeCloseTo(200, 0);
    expect(distanceAtActiveSeconds(points, 55)).toBeCloseTo(220, 0);
    expect(distanceAtActiveSeconds(points, 100)).toBeCloseTo(400, 0);
  });

  it('returns null when the recording is shorter than the mark', () => {
    expect(distanceAtActiveSeconds(steadyRun(100, 4), 101)).toBeNull();
    expect(distanceAtActiveSeconds([], 10)).toBeNull();
  });

  it('finds the time taken to reach a distance, between fixes', () => {
    const points = steadyRun(100, 4);
    expect(activeSecondsAtDistance(points, 200)).toBeCloseTo(50, 0);
    expect(activeSecondsAtDistance(points, 222)).toBeCloseTo(55.5, 0);
    expect(activeSecondsAtDistance(points, 401)).toBeNull();
  });

  it('does not count time or distance across a pause', () => {
    const before = steadyRun(100, 4);
    // Resumed 10 minutes later, 1 km further on, in a new stretch.
    const after = steadyRun(100, 4, { seg: 1 }).map((p, i) => ({
      ...p,
      t: p.t + 700_000,
      lat: p.lat + 1000 * DEG_PER_METER + (i > 0 ? 0 : 0),
    }));
    const points = [...before, ...after];
    expect(distanceAtActiveSeconds(points, 150)).toBeCloseTo(600, 0);
    expect(activeSecondsAtDistance(points, 600)).toBeCloseTo(150, 0);
  });
});

describe('measureFitnessTest', () => {
  it('takes the time to 5 km, whatever happens afterwards', () => {
    // 5 m/s: 5 km in 1000 s, then 200 s of jogging on.
    const points = steadyRun(1200, 5);
    const m = measureFitnessTest('5k', points)!;
    expect(m).toEqual({
      type: '5k',
      distanceMeters: 5000,
      durationSeconds: 1000,
    });
    expect(evaluateFitnessTest(m)).not.toBeNull();
  });

  it('is not a 5K test when 5 km was not reached', () => {
    expect(measureFitnessTest('5k', steadyRun(900, 5))).toBeNull();
  });

  it('takes the distance at exactly 12 minutes for a Cooper test', () => {
    const points = steadyRun(800, 4);
    expect(measureFitnessTest('cooper', points)).toEqual({
      type: 'cooper',
      distanceMeters: 2880,
      durationSeconds: 720,
    });
    expect(measureFitnessTest('cooper', steadyRun(700, 4))).toBeNull();
  });

  it('takes the distance at 10 and 30 minutes for the 30-minute run', () => {
    const points = steadyRun(1900, 4);
    expect(measureFitnessTest('30min', points)).toEqual({
      type: '30min',
      distanceMeters: 7200,
      splitDistanceMeters: 2400,
      durationSeconds: 1800,
    });
    expect(measureFitnessTest('30min', steadyRun(1700, 4))).toBeNull();
  });

  it('gives a threshold pace from the last 20 minutes', () => {
    const m = measureFitnessTest('30min', steadyRun(1800, 4))!;
    const outcome = evaluateFitnessTest(m)!;
    // 4 m/s is 250 s/km.
    expect(outcome.paces.thresholdSecondsPerKm).toBe(250);
  });
});

describe('fitnessTestProgress', () => {
  it('counts down the distance to the 5K mark', () => {
    const p = fitnessTestProgress('5k', 600, 3000);
    expect(p).toMatchObject({
      complete: false,
      remainingMeters: 2000,
      remainingSeconds: null,
    });
    expect(p.fraction).toBeCloseTo(0.6, 6);
    expect(fitnessTestProgress('5k', 1000, 5010).complete).toBe(true);
  });

  it('counts down the Cooper test', () => {
    expect(fitnessTestProgress('cooper', 300, 1000)).toMatchObject({
      complete: false,
      remainingSeconds: 420,
    });
    expect(fitnessTestProgress('cooper', 720, 3000).complete).toBe(true);
  });

  it('says when the last 20 minutes of the 30-minute run begin', () => {
    expect(fitnessTestProgress('30min', 599, 2000).inThresholdPhase).toBe(
      false
    );
    expect(fitnessTestProgress('30min', 600, 2000).inThresholdPhase).toBe(true);
    expect(fitnessTestProgress('30min', 1800, 7000).complete).toBe(true);
  });
});

describe('words and units', () => {
  const t = ((key: string, options?: Record<string, unknown>) => {
    let text = String(options?.defaultValue ?? key);
    for (const [name, value] of Object.entries(options ?? {})) {
      text = text.split(`{{${name}}}`).join(String(value));
    }
    return text;
  }) as never;

  it('names the tests', () => {
    expect(fitnessTestName(t, '5k')).toBe('5K time trial');
    expect(fitnessTestName(t, '30min')).toBe('30-minute all-out run');
    expect(fitnessTestName(t, 'cooper')).toBe('12-minute Cooper test');
  });

  it('shows paces per kilometre or per mile', () => {
    expect(paceInUnit(300, 'km')).toBe(300);
    expect(paceInUnit(300, 'miles')).toBeCloseTo(482.8, 1);
    expect(paceText(t, 300, 'km')).toBe('5:00/km');
    expect(paceText(t, 300, 'miles')).toBe('8:03/mi');
    expect(paceRangeText(t, 290, 310, 'km')).toBe('4:50–5:10/km');
  });

  it('words each result by its test', () => {
    expect(fitnessTestResultText(t, fitnessTest(), 'km')).toBe('5K in 25:00');
    const cooper = fitnessTest({
      measurement: {
        type: 'cooper',
        distanceMeters: 3000,
        durationSeconds: 720,
      },
    });
    expect(fitnessTestResultText(t, cooper, 'km')).toBe(
      '3,000 m in 12 minutes'
    );
    expect(fitnessTestResultText(t, cooper, 'miles')).toBe(
      '1.86 mi in 12 minutes'
    );
    const thirty = fitnessTest({
      measurement: {
        type: '30min',
        distanceMeters: 6600,
        splitDistanceMeters: 2000,
        durationSeconds: 1800,
      },
    });
    expect(fitnessTestResultText(t, thirty, 'km')).toBe(
      '4:21/km over the last 20 minutes'
    );
  });

  it('words a change in pace', () => {
    expect(paceChangeText(t, -12, 'km')).toBe('12 s/km faster');
    expect(paceChangeText(t, 8, 'km')).toBe('8 s/km slower');
    expect(paceChangeText(t, 0.2, 'km')).toBe('no change');
    expect(paceChangeText(t, -10, 'miles')).toBe('16 s/mi faster');
  });
});
