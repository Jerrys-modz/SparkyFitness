import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import type {
  ExerciseSessionResponse,
  FitnessFatigueResponse,
} from '@workspace/shared';

import HeartRateDashboardCard from '../../../src/components/dashboard/HeartRateDashboardCard';
import MealsDashboardCard from '../../../src/components/dashboard/MealsDashboardCard';
import StepsDashboardCard from '../../../src/components/dashboard/StepsDashboardCard';
import SummaryStatusLine from '../../../src/components/dashboard/SummaryStatusLine';
import { useHealthTrends } from '../../../src/hooks/useHealthTrends';
import {
  useMedicationEntries,
  useMedications,
} from '../../../src/hooks/useMedications';
import { useWorkoutHeartRateZones } from '../../../src/hooks/useWorkoutHeartRateZones';
import ReadinessDashboardCard from '../../../src/components/dashboard/ReadinessDashboardCard';
import SleepDashboardCard from '../../../src/components/dashboard/SleepDashboardCard';
import WorkoutsDashboardCard from '../../../src/components/dashboard/WorkoutsDashboardCard';
import { useActiveWorkoutPlans } from '../../../src/hooks/useActiveWorkoutPlan';
import { useFitnessFatigue } from '../../../src/hooks/useFitnessFatigue';
import { useMealTypes } from '../../../src/hooks/useMealTypes';
import { useSleepDay } from '../../../src/hooks/useSleepDay';
import type { FoodEntry } from '../../../src/types/foodEntries';
import type { MealType } from '../../../src/types/mealTypes';
import type { SleepEntry } from '../../../src/types/sleep';
import type { WorkoutPlanTemplate } from '../../../src/types/workoutPlans';

// ProgressRing pauses its animation while the screen is blurred.
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useIsFocused: () => true,
}));
jest.mock('../../../src/hooks/useSleepDay', () => ({
  useSleepDay: jest.fn(),
}));
jest.mock('../../../src/hooks/useFitnessFatigue', () => ({
  useFitnessFatigue: jest.fn(),
}));
jest.mock('../../../src/hooks/useMealTypes', () => ({
  useMealTypes: jest.fn(),
}));
jest.mock('../../../src/hooks/useHealthTrends', () => ({
  useHealthTrends: jest.fn(),
}));
jest.mock('../../../src/hooks/useWorkoutHeartRateZones', () => ({
  useWorkoutHeartRateZones: jest.fn(),
}));
jest.mock('../../../src/hooks/useMedications', () => ({
  useMedications: jest.fn(),
  useMedicationEntries: jest.fn(),
}));
jest.mock('@workspace/shared', () => ({
  ...jest.requireActual('@workspace/shared'),
  getDueDosesForDate: jest.fn(),
}));
jest.mock('../../../src/hooks/useActiveWorkoutPlan', () => ({
  useActiveWorkoutPlans: jest.fn(),
}));

const night = (overrides: Partial<SleepEntry> = {}): SleepEntry =>
  ({
    id: 'sleep-1',
    entry_date: '2026-11-05',
    bedtime: '2026-11-04T23:15:00Z',
    wake_time: '2026-11-05T07:03:00Z',
    duration_in_seconds: 28_080,
    time_asleep_in_seconds: 28_080,
    sleep_score: 88,
    source: 'healthkit',
    deep_sleep_seconds: 5_700,
    light_sleep_seconds: 13_920,
    rem_sleep_seconds: 6_300,
    awake_sleep_seconds: 2_160,
    resting_heart_rate: 54,
    avg_overnight_hrv: 64,
    record_timezone: null,
    record_utc_offset_minutes: null,
    stage_events: [],
    ...overrides,
  }) as SleepEntry;

const mockSleep = (entry: SleepEntry | null, isForbidden = false) =>
  jest.mocked(useSleepDay).mockReturnValue({
    wakeUp: entry,
    naps: [],
    bedTime: null,
    isLoading: false,
    isError: false,
    isForbidden,
    refetch: jest.fn(),
  } as never);

describe('SleepDashboardCard', () => {
  it('shows time asleep, score, vitals and stages', () => {
    mockSleep(night());
    render(<SleepDashboardCard date="2026-11-05" onOpenSleep={jest.fn()} />);

    expect(screen.getByText('7h 48m')).toBeTruthy();
    expect(screen.getByText('Score 88')).toBeTruthy();
    expect(screen.getByText('54 bpm')).toBeTruthy();
    expect(screen.getByText('64 ms')).toBeTruthy();
    expect(screen.getByTestId('sleep-dashboard-card-stages')).toBeTruthy();
  });

  it('opens the night', () => {
    mockSleep(night());
    const onOpenSleep = jest.fn();
    render(<SleepDashboardCard date="2026-11-05" onOpenSleep={onOpenSleep} />);

    fireEvent.press(screen.getByTestId('sleep-dashboard-card'));

    expect(onOpenSleep).toHaveBeenCalledWith('sleep-1', '2026-11-05');
  });

  it('leaves out vitals the night does not have', () => {
    mockSleep(night({ resting_heart_rate: null, avg_overnight_hrv: null }));
    render(<SleepDashboardCard date="2026-11-05" onOpenSleep={jest.fn()} />);

    expect(screen.queryByText('Resting HR')).toBeNull();
    expect(screen.queryByText('HRV')).toBeNull();
  });

  it('shows nothing with no night or no permission', () => {
    mockSleep(null);
    const { toJSON, rerender } = render(
      <SleepDashboardCard date="2026-11-05" onOpenSleep={jest.fn()} />
    );
    expect(toJSON()).toBeNull();

    mockSleep(night(), true);
    rerender(<SleepDashboardCard date="2026-11-05" onOpenSleep={jest.fn()} />);
    expect(toJSON()).toBeNull();
  });
});

const fitness = (
  readiness: Partial<FitnessFatigueResponse['readiness']>
): FitnessFatigueResponse => ({
  fitnessFatigue: { points: [], today: null, status: 'noData' },
  readiness: {
    score: 69,
    level: 'moderate',
    factors: { form: 80, sleep: 45 },
    weakest: 'sleep',
    ...readiness,
  },
});

const mockFitness = (data: FitnessFatigueResponse | undefined) =>
  jest
    .mocked(useFitnessFatigue)
    .mockReturnValue({ data, isLoading: false, isError: false });

describe('ReadinessDashboardCard', () => {
  it('shows the score, level and the weakest input when it is low', () => {
    mockFitness(fitness({}));
    render(<ReadinessDashboardCard isToday onOpenDetails={jest.fn()} />);

    expect(screen.getByText('69')).toBeTruthy();
    expect(screen.getByText('Fine')).toBeTruthy();
    expect(
      screen.getByText('Fine for a normal session, but not your hardest.')
    ).toBeTruthy();
    expect(screen.getByText('Held back most by Sleep')).toBeTruthy();
  });

  it('does not name a weakest input on a good day', () => {
    mockFitness(
      fitness({
        score: 84,
        level: 'high',
        factors: { form: 90, sleep: 75 },
        weakest: 'sleep',
      })
    );
    render(<ReadinessDashboardCard isToday onOpenDetails={jest.fn()} />);

    expect(screen.getByText('Ready')).toBeTruthy();
    expect(screen.queryByText(/Held back most/)).toBeNull();
  });

  it('only fetches and shows on today', () => {
    mockFitness(fitness({}));
    const { toJSON } = render(
      <ReadinessDashboardCard isToday={false} onOpenDetails={jest.fn()} />
    );

    expect(toJSON()).toBeNull();
    expect(useFitnessFatigue).toHaveBeenLastCalledWith(false);
  });

  it('shows nothing without a score', () => {
    mockFitness(fitness({ score: null, level: 'noData', weakest: null }));
    const { toJSON } = render(
      <ReadinessDashboardCard isToday onOpenDetails={jest.fn()} />
    );

    expect(toJSON()).toBeNull();
  });
});

const mealType = (overrides: Partial<MealType>): MealType => ({
  id: 'breakfast-id',
  name: 'breakfast',
  sort_order: 1,
  user_id: null,
  created_at: '2026-01-01T00:00:00Z',
  is_visible: true,
  show_in_quick_log: true,
  ...overrides,
});

const MEAL_TYPES: MealType[] = [
  mealType({ id: 'dinner-id', name: 'dinner', sort_order: 3 }),
  mealType({ id: 'breakfast-id', name: 'breakfast', sort_order: 1 }),
  mealType({ id: 'lunch-id', name: 'lunch', sort_order: 2 }),
  mealType({
    id: 'hidden-id',
    name: 'Late snack',
    sort_order: 4,
    user_id: 'me',
    is_visible: false,
  }),
];

const foodEntry = (overrides: Partial<FoodEntry>): FoodEntry =>
  ({
    id: 'entry-1',
    meal_type: 'breakfast',
    meal_type_id: 'breakfast-id',
    food_name: 'Rolled Oats',
    quantity: 1,
    serving_size: 1,
    unit: 'serving',
    calories: 150,
    protein: 5,
    carbs: 27,
    fat: 3,
    entry_date: '2026-11-05',
    ...overrides,
  }) as FoodEntry;

describe('MealsDashboardCard', () => {
  beforeEach(() => {
    jest.mocked(useMealTypes).mockReturnValue({
      mealTypes: MEAL_TYPES,
    } as never);
  });

  it('lists every visible meal in order, and hidden ones only with food', () => {
    render(
      <MealsDashboardCard
        foodEntries={[
          foodEntry({}),
          foodEntry({ id: 'entry-2', food_name: 'Black Coffee', calories: 5 }),
        ]}
        onAddFood={jest.fn()}
        onOpenMeal={jest.fn()}
      />
    );

    expect(screen.getByText('Breakfast')).toBeTruthy();
    expect(screen.getByText('Rolled Oats, Black Coffee')).toBeTruthy();
    expect(screen.getByText('155 Cal')).toBeTruthy();
    expect(screen.getAllByText('+ Add')).toHaveLength(2);
    expect(screen.queryByText('Late snack')).toBeNull();
  });

  it('adds to an empty meal and opens a logged one', () => {
    const onAddFood = jest.fn();
    const onOpenMeal = jest.fn();
    render(
      <MealsDashboardCard
        foodEntries={[foodEntry({})]}
        onAddFood={onAddFood}
        onOpenMeal={onOpenMeal}
      />
    );

    fireEvent.press(screen.getByTestId('meals-dashboard-card-row-lunch-id'));
    expect(onAddFood).toHaveBeenCalledWith('lunch-id');

    fireEvent.press(
      screen.getByTestId('meals-dashboard-card-row-breakfast-id')
    );
    expect(onOpenMeal).toHaveBeenCalledWith(
      expect.objectContaining({ mealTypeId: 'breakfast-id' }),
      'Breakfast'
    );

    fireEvent.press(screen.getByTestId('meals-dashboard-card-log'));
    expect(onAddFood).toHaveBeenLastCalledWith();
  });

  it('keeps food logged to a hidden meal', () => {
    render(
      <MealsDashboardCard
        foodEntries={[
          foodEntry({
            meal_type: 'Late snack',
            meal_type_id: 'hidden-id',
            food_name: 'Toast',
          }),
        ]}
        onAddFood={jest.fn()}
        onOpenMeal={jest.fn()}
      />
    );

    expect(screen.getByText('Late snack')).toBeTruthy();
    expect(screen.getByText('Toast')).toBeTruthy();
  });
});

const run = {
  type: 'individual',
  id: 'run-1',
  name: 'Morning Outdoor Run',
  duration_minutes: 28,
  calories_burned: 285,
  distance: 5.5,
  exercise_snapshot: null,
  sets: [],
} as unknown as ExerciseSessionResponse;

const plan = {
  id: 'plan-1',
  plan_name: 'Push Pull Legs',
  schedule_type: 'weekly',
  assignments: [{ id: 'a-1' }],
  next_assignment: {
    id: 'a-1',
    session_name: 'Upper Body Hypertrophy',
    workout_preset_id: 7,
  },
} as unknown as WorkoutPlanTemplate;

const renderWorkouts = (
  props: Partial<React.ComponentProps<typeof WorkoutsDashboardCard>> = {}
) => {
  const handlers = {
    onOpenSession: jest.fn(),
    onStartPlanned: jest.fn(),
    onLog: jest.fn(),
    onRecord: jest.fn(),
  };
  render(
    <WorkoutsDashboardCard
      date="2026-11-05"
      isToday
      sessions={[]}
      weightUnit="kg"
      distanceUnit="km"
      {...handlers}
      {...props}
    />
  );
  return handlers;
};

describe('WorkoutsDashboardCard', () => {
  beforeEach(() => {
    jest.mocked(useActiveWorkoutPlans).mockReturnValue({
      plans: [plan],
    } as never);
  });

  it('lists logged sessions and opens them', () => {
    const { onOpenSession } = renderWorkouts({ sessions: [run] });

    expect(screen.getByText('Morning Outdoor Run')).toBeTruthy();
    fireEvent.press(
      screen.getByTestId('workouts-dashboard-card-session-run-1')
    );
    expect(onOpenSession).toHaveBeenCalledWith(run);
  });

  it('offers to start what the plan has due today', () => {
    const { onStartPlanned } = renderWorkouts();

    expect(screen.getByText('Upper Body Hypertrophy')).toBeTruthy();
    expect(screen.getByText('Planned · Push Pull Legs')).toBeTruthy();
    fireEvent.press(screen.getByTestId('workouts-dashboard-card-start-plan-1'));
    expect(onStartPlanned).toHaveBeenCalledWith(plan, plan.next_assignment);
  });

  it('hides planned workouts on another day', () => {
    renderWorkouts({ isToday: false });

    expect(screen.queryByText('Upper Body Hypertrophy')).toBeNull();
    expect(screen.getByText('No workouts logged yet.')).toBeTruthy();
    expect(useActiveWorkoutPlans).toHaveBeenLastCalledWith('2026-11-05', {
      enabled: false,
    });
  });

  it('logs and records from the header', () => {
    const { onLog, onRecord } = renderWorkouts();

    fireEvent.press(screen.getByTestId('workouts-dashboard-card-log'));
    fireEvent.press(screen.getByTestId('workouts-dashboard-card-record'));

    expect(onLog).toHaveBeenCalled();
    expect(onRecord).toHaveBeenCalled();
  });
});

const { getDueDosesForDate } = jest.requireMock('@workspace/shared') as {
  getDueDosesForDate: jest.Mock;
};

const mockTrends = (
  steps: { day: string; steps: number }[],
  heartRate: { day: string; restingHr: number }[] = []
) =>
  jest.mocked(useHealthTrends).mockReturnValue({
    steps: { data: steps, isLoading: false, isError: false },
    heartRate: { data: heartRate, isLoading: false, isError: false },
  } as never);

describe('StepsDashboardCard', () => {
  it('shows the day against the goal and a week of bars', () => {
    mockTrends([{ day: '2026-11-04', steps: 8000 }]);
    render(
      <StepsDashboardCard
        date="2026-11-05"
        steps={6420}
        goal={10000}
        onOpenTrends={jest.fn()}
      />
    );

    expect(screen.getByText('6,420')).toBeTruthy();
    expect(screen.getByText('/ 10,000 steps (64%)')).toBeTruthy();
    expect(
      screen.getByTestId('steps-dashboard-card-week').props.children
    ).toHaveLength(7);
  });

  it('shows nothing with no steps all week', () => {
    mockTrends([]);
    const { toJSON } = render(
      <StepsDashboardCard
        date="2026-11-05"
        steps={0}
        goal={10000}
        onOpenTrends={jest.fn()}
      />
    );

    expect(toJSON()).toBeNull();
  });
});

describe('HeartRateDashboardCard', () => {
  it('compares resting heart rate with the week and shows zones', () => {
    mockTrends(
      [],
      [
        { day: '2026-11-03', restingHr: 62 },
        { day: '2026-11-04', restingHr: 64 },
        { day: '2026-11-05', restingHr: 59 },
      ]
    );
    jest.mocked(useWorkoutHeartRateZones).mockReturnValue([
      { zone: 1, lowerBpm: null, upperBpm: 120, seconds: 120, share: 0.2 },
      { zone: 2, lowerBpm: 120, upperBpm: 140, seconds: 480, share: 0.8 },
    ]);
    render(
      <HeartRateDashboardCard
        date="2026-11-05"
        sessions={[]}
        onOpenReport={jest.fn()}
      />
    );

    expect(screen.getByText('59')).toBeTruthy();
    expect(screen.getByText('−4 bpm vs 7d avg')).toBeTruthy();
    expect(screen.getByText('Zone 2')).toBeTruthy();
    expect(screen.getByText('80%')).toBeTruthy();
  });

  it('shows nothing without a resting heart rate or zones', () => {
    mockTrends([], []);
    jest.mocked(useWorkoutHeartRateZones).mockReturnValue(null);
    const { toJSON } = render(
      <HeartRateDashboardCard
        date="2026-11-05"
        sessions={[]}
        onOpenReport={jest.fn()}
      />
    );

    expect(toJSON()).toBeNull();
  });
});

describe('SummaryStatusLine', () => {
  const due = (id: string) => ({
    medication: { id: `med-${id}` },
    schedule: { id: `sched-${id}` },
  });

  beforeEach(() => {
    jest.mocked(useMedications).mockReturnValue({ data: [] } as never);
    jest.mocked(useMedicationEntries).mockReturnValue({ data: [] } as never);
  });

  it('names readiness and the doses still due', () => {
    mockFitness(fitness({}));
    getDueDosesForDate.mockReturnValue([due('a'), due('b')]);
    render(<SummaryStatusLine date="2026-11-05" isToday />);

    expect(
      screen.getByText('Ready for a normal session · 2 doses still due')
    ).toBeTruthy();
  });

  it('says when every dose is taken, and leaves readiness out on another day', () => {
    mockFitness(fitness({}));
    getDueDosesForDate.mockReturnValue([due('a')]);
    jest.mocked(useMedicationEntries).mockReturnValue({
      data: [
        {
          medication_id: 'med-a',
          schedule_id: 'sched-a',
          status: 'taken',
        },
      ],
    } as never);
    render(<SummaryStatusLine date="2026-11-04" isToday={false} />);

    expect(screen.getByText('All doses taken')).toBeTruthy();
  });

  it('shows nothing when it has nothing to say', () => {
    mockFitness(undefined);
    getDueDosesForDate.mockReturnValue([]);
    const { toJSON } = render(<SummaryStatusLine date="2026-11-05" isToday />);

    expect(toJSON()).toBeNull();
  });
});
