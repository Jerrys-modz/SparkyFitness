import { programStatus, INTERVAL_PRESETS } from '@workspace/shared';
import { buildWatchRunPlans } from '../../src/utils/watchRunPlans';

const t = ((_key: string, options?: { defaultValue?: string }) =>
  options?.defaultValue ?? _key) as never;
const names = {
  program: () => 'Beginner 5K · Week 1, run 1',
  preset: (id: string) => id,
};

test('offers the built-in plans with the step names already translated', () => {
  const plans = buildWatchRunPlans(t, { status: null, enabled: false }, names);
  expect(plans).toHaveLength(INTERVAL_PRESETS.length);
  expect(plans[0].programId).toBeUndefined();
  expect(plans[0].steps[0]).toEqual({
    label: expect.any(String),
    seconds: expect.any(Number),
  });
  expect(plans[0].steps.every((s) => s.seconds > 0)).toBe(true);
});

test("puts today's program workout first, tagged so the phone can tick it off", () => {
  const status = programStatus({ programId: 'beginner5k', next: 2 })!;
  const plans = buildWatchRunPlans(t, { status, enabled: true }, names);
  expect(plans[0]).toMatchObject({
    id: 'beginner5k',
    programId: 'beginner5k',
    programIndex: 2,
    name: 'Beginner 5K · Week 1, run 1',
  });
  expect(plans).toHaveLength(INTERVAL_PRESETS.length + 1);
});

test('leaves the program out while it is off or finished', () => {
  const status = programStatus({ programId: 'beginner5k', next: 2 })!;
  expect(buildWatchRunPlans(t, { status, enabled: false }, names)).toHaveLength(
    INTERVAL_PRESETS.length
  );
  const finished = programStatus({ programId: 'beginner5k', next: 999 })!;
  expect(
    buildWatchRunPlans(t, { status: finished, enabled: true }, names)
  ).toHaveLength(INTERVAL_PRESETS.length);
});
