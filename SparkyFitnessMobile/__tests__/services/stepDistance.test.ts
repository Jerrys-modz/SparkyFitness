import {
  getHealthStepsBetween,
  getStepsBetween,
} from '../../src/services/stepCounter';
import { getStride, learnStride } from '../../src/services/strideCalibration';
import {
  estimateIndoorDistance,
  learnFromIndoorEntry,
  learnFromOutdoorRecording,
  learnFromWatchRun,
  type IndoorDistanceEstimate,
  type StepWindow,
} from '../../src/services/stepDistance';

jest.mock('../../src/services/stepCounter');
jest.mock('../../src/services/strideCalibration');

const mockedSteps = jest.mocked(getStepsBetween);
const mockedHealthSteps = jest.mocked(getHealthStepsBetween);
const mockedStride = jest.mocked(getStride);
const mockedLearn = jest.mocked(learnStride);

const START = Date.UTC(2026, 9, 8, 10, 0, 0);
const window = (overrides: Partial<StepWindow> = {}): StepWindow => ({
  activity: 'walk',
  startedAt: START,
  finishedAt: START + 30 * 60_000,
  activeSeconds: 1800,
  ...overrides,
});

beforeEach(() => {
  jest.clearAllMocks();
  mockedSteps.mockResolvedValue(3900);
  mockedHealthSteps.mockResolvedValue(null);
  mockedStride.mockResolvedValue({ meters: 0.8, calibrated: true });
  mockedLearn.mockResolvedValue(true);
});

describe('estimateIndoorDistance', () => {
  it('turns steps into a distance with the person’s stride', async () => {
    expect(await estimateIndoorDistance(window())).toEqual({
      steps: 3900,
      distanceKm: 3.12,
      calibrated: true,
    });
    expect(mockedSteps).toHaveBeenCalledWith(START, START + 30 * 60_000, {
      askForPermission: true,
    });
  });

  it('says so when it is only a typical stride', async () => {
    mockedStride.mockResolvedValue({ meters: 0.75, calibrated: false });

    expect((await estimateIndoorDistance(window()))?.calibrated).toBe(false);
  });

  it('leaves paused time out by scaling steps to the time spent moving', async () => {
    // 30 minutes elapsed, 20 of them moving.
    const estimate = await estimateIndoorDistance(
      window({ activeSeconds: 1200 })
    );

    expect(estimate?.steps).toBe(2600);
  });

  it('has no estimate for a ride, or when the phone cannot say', async () => {
    expect(
      await estimateIndoorDistance(window({ activity: 'ride' }))
    ).toBeNull();
    expect(mockedSteps).not.toHaveBeenCalled();

    mockedSteps.mockResolvedValue(null);
    expect(await estimateIndoorDistance(window())).toBeNull();
  });

  it('passes an Android counter baseline through', async () => {
    await estimateIndoorDistance(window({ stepCounterAtStart: 1100 }));

    expect(mockedSteps).toHaveBeenCalledWith(START, START + 30 * 60_000, {
      askForPermission: true,
      stepCounterAtStart: 1100,
    });
  });

  it('has no estimate from a handful of steps', async () => {
    mockedSteps.mockResolvedValue(8);

    expect(await estimateIndoorDistance(window())).toBeNull();
  });
});

describe('learnFromIndoorEntry', () => {
  const estimate: IndoorDistanceEstimate = {
    steps: 3900,
    distanceKm: 3.12,
    calibrated: true,
  };

  it('learns from a distance the person changed', async () => {
    await learnFromIndoorEntry('walk', estimate, 3.5);

    expect(mockedLearn).toHaveBeenCalledWith('walk', 3900, 3500);
  });

  it('learns nothing from an estimate they accepted as it was', async () => {
    await learnFromIndoorEntry('walk', estimate, 3.12);
    await learnFromIndoorEntry('walk', estimate, 3.13);

    expect(mockedLearn).not.toHaveBeenCalled();
  });

  it('learns nothing without an estimate or an entered distance', async () => {
    await learnFromIndoorEntry('walk', null, 3.5);
    await learnFromIndoorEntry('walk', estimate, null);
    await learnFromIndoorEntry('walk', estimate, 0);
    await learnFromIndoorEntry('ride', estimate, 3.5);

    expect(mockedLearn).not.toHaveBeenCalled();
  });
});

describe('learnFromWatchRun', () => {
  it('prefers the steps Apple Health holds, so the phone can be left behind', async () => {
    mockedHealthSteps.mockResolvedValue(5200);

    expect(await learnFromWatchRun(window({ activity: 'run' }), 5000)).toBe(
      true
    );

    expect(mockedHealthSteps).toHaveBeenCalledWith(START, START + 30 * 60_000);
    expect(mockedSteps).not.toHaveBeenCalled();
    expect(mockedLearn).toHaveBeenCalledWith('run', 5200, 5000);
  });

  it('leaves paused time out of the Health steps', async () => {
    mockedHealthSteps.mockResolvedValue(5200);

    await learnFromWatchRun(
      window({ activity: 'run', activeSeconds: 1200 }),
      4000
    );

    expect(mockedLearn).toHaveBeenCalledWith('run', 3467, 4000);
  });

  it('learns from the phone’s steps over the run and the corrected distance, asking for access', async () => {
    expect(await learnFromWatchRun(window({ activity: 'run' }), 5000)).toBe(
      true
    );

    expect(mockedSteps).toHaveBeenCalledWith(START, START + 30 * 60_000, {
      askForPermission: true,
    });
    expect(mockedLearn).toHaveBeenCalledWith('run', 3900, 5000);
  });

  it('learns nothing from a phone that was left behind', async () => {
    mockedSteps.mockResolvedValue(5);

    expect(await learnFromWatchRun(window(), 5000)).toBe(false);
    expect(mockedLearn).not.toHaveBeenCalled();
  });

  it('learns nothing without a step reading, or from a ride', async () => {
    mockedSteps.mockResolvedValue(null);
    expect(await learnFromWatchRun(window(), 5000)).toBe(false);
    expect(await learnFromWatchRun(window({ activity: 'ride' }), 5000)).toBe(
      false
    );
    expect(mockedLearn).not.toHaveBeenCalled();
  });
});

describe('learnFromOutdoorRecording', () => {
  it('learns from the GPS distance, without asking for access', async () => {
    await learnFromOutdoorRecording(
      window({ activity: 'run', stepCounterAtStart: 800 }),
      3200
    );

    expect(mockedSteps).toHaveBeenCalledWith(START, START + 30 * 60_000, {
      askForPermission: false,
      stepCounterAtStart: 800,
    });
    expect(mockedLearn).toHaveBeenCalledWith('run', 3900, 3200);
  });

  it('learns nothing when the steps are not available', async () => {
    mockedSteps.mockResolvedValue(null);

    await learnFromOutdoorRecording(window(), 3200);

    expect(mockedLearn).not.toHaveBeenCalled();
  });

  it('learns nothing from a ride', async () => {
    await learnFromOutdoorRecording(window({ activity: 'ride' }), 20000);

    expect(mockedLearn).not.toHaveBeenCalled();
  });

  it('learns nothing from a session that paused', async () => {
    await learnFromOutdoorRecording(window({ paused: true }), 3200);

    expect(mockedSteps).not.toHaveBeenCalled();
    expect(mockedLearn).not.toHaveBeenCalled();
  });
});
