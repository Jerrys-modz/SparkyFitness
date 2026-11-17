import { render, screen } from '@testing-library/react';
import type { ExpandedGoals } from '@/types/goals';
import '@testing-library/jest-dom';
import { DailyGoals } from '@/pages/Goals/DailyGoals';
import { DEFAULT_GOALS } from '@/constants/goals';

jest.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'user-1' } }),
}));

jest.mock('@/contexts/PreferencesContext', () => ({
  usePreferences: () => ({
    energyUnit: 'kcal',
    convertEnergy: (val: number) => val,
    getEnergyUnitString: () => 'kcal',
    weightUnit: 'kg',
    convertWeight: (val: number) => val,
  }),
}));

jest.mock('@/hooks/Foods/useCustomNutrients', () => ({
  useCustomNutrients: () => ({ data: [] }),
}));

jest.mock('@/hooks/Diary/useMealTypes', () => ({
  useMealTypes: () => ({ data: [] }),
}));

jest.mock('@/hooks/Goals/useGoals', () => ({
  useSaveGoalsMutation: () => ({
    mutateAsync: jest.fn(),
    isPending: false,
  }),
}));

jest.mock('@/hooks/Diary/useDailyProgress', () => ({
  useDailySummary: () => ({ data: undefined }),
}));

const mockLatestCheckIn: {
  data: { weight: number; body_fat_percentage: number | null } | null;
} = { data: null };
jest.mock('@/hooks/CheckIn/useCheckIn', () => ({
  useLatestCheckInMeasurements: () => mockLatestCheckIn,
}));

jest.mock('@/hooks/Goals/useNutrientAutoCalculate', () => ({
  useNutrientAutoCalculate: () => ({
    algorithms: {},
    autoCalculateUserData: null,
    goalTypePreferences: {},
    eligibleIds: [],
    selected: new Set(),
    toggleSelected: jest.fn(),
    selectAll: jest.fn(),
    selectNone: jest.fn(),
    applySelected: jest.fn(),
  }),
}));

describe('DailyGoals - Water Goal Exclusivity (Gate 3)', () => {
  it('does not render a generic nutrient input for water_ml even if present in visibleNutrients', () => {
    const goals = { ...DEFAULT_GOALS };
    const setGoals = jest.fn();

    render(
      <DailyGoals
        goals={goals}
        setGoals={setGoals}
        visibleNutrients={['water_ml', 'sodium', 'caffeine_mg', 'alcohol_g']}
        today="2026-09-05"
      />
    );

    // Standard nutrients in visible list should render
    expect(screen.getByText(/Sodium/i)).toBeInTheDocument();
    expect(screen.getByText(/Caffeine/i)).toBeInTheDocument();
    expect(screen.getByText(/Alcohol/i)).toBeInTheDocument();

    // water_ml generic nutrient input must NOT render (Gate 3)
    // Note: Water and Exercise section has Water Goal (ml), but generic grid does not render water_ml
    const nutrientInputContainers = document.querySelectorAll('.grid > div');
    const renderedIds = Array.from(nutrientInputContainers).map(
      (el) => el.textContent
    );
    expect(
      renderedIds.some(
        (text) => text?.includes('Water') && !text.includes('Water Goal')
      )
    ).toBe(false);
  });
});

describe('DailyGoals - protein per kg', () => {
  const renderGoals = (goals: ExpandedGoals) =>
    render(
      <DailyGoals
        goals={goals}
        setGoals={jest.fn()}
        visibleNutrients={[]}
        today="2026-11-16"
      />
    );

  afterEach(() => {
    mockLatestCheckIn.data = null;
  });

  it('previews grams from the latest weight and splits the rest by percentage', () => {
    mockLatestCheckIn.data = { weight: 80, body_fat_percentage: null };
    renderGoals({
      ...(DEFAULT_GOALS as ExpandedGoals),
      calories: 2000,
      dietary_fiber: 0,
      protein_percentage: 30,
      carbs_percentage: 40,
      fat_percentage: 30,
      protein_per_kg: 2,
      fat_per_kg: null,
      macro_per_kg_basis: 'body_weight',
    });

    // 160 g protein; 2000 - 640 = 1360 kcal shared 40:30 by carbs and fat.
    expect(
      screen.getByText(
        "Today's grams from your latest logged weight of 80 kg: protein 160 g, carbs 194 g, fat 65 g."
      )
    ).toBeInTheDocument();
    // Percentages only weight the remainder, so no 100% total is required.
    expect(screen.queryByText(/Must be 100% to save/)).not.toBeInTheDocument();
  });

  it('shows a hint when no weight is logged', () => {
    renderGoals({
      ...(DEFAULT_GOALS as ExpandedGoals),
      protein: 150,
      protein_percentage: null,
      carbs_percentage: null,
      fat_percentage: null,
      protein_per_kg: 1.8,
    });

    expect(screen.getByText(/No weight logged yet/)).toBeInTheDocument();
  });

  it('says when lean mass falls back to body weight', () => {
    mockLatestCheckIn.data = { weight: 80, body_fat_percentage: null };
    renderGoals({
      ...(DEFAULT_GOALS as ExpandedGoals),
      protein_percentage: null,
      carbs_percentage: null,
      fat_percentage: null,
      protein_per_kg: 2,
      macro_per_kg_basis: 'lean_mass',
    });

    expect(
      screen.getByText(/body weight is used instead of lean mass/)
    ).toBeInTheDocument();
  });

  it('uses a fixed reference weight instead of the latest weight', () => {
    mockLatestCheckIn.data = { weight: 90, body_fat_percentage: null };
    renderGoals({
      ...(DEFAULT_GOALS as ExpandedGoals),
      protein: 150,
      carbs: 200,
      fat: 70,
      protein_percentage: null,
      carbs_percentage: null,
      fat_percentage: null,
      protein_per_kg: 2,
      macro_reference_weight_kg: 75,
    });

    expect(
      screen.getByText(
        /Grams from your reference weight of 75 kg: protein 150 g/
      )
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Reference weight (kg)')).toHaveValue(75);
  });

  it('locks carbs per kg and notes when the per-kg macros exceed the target', () => {
    mockLatestCheckIn.data = { weight: 80, body_fat_percentage: null };
    renderGoals({
      ...(DEFAULT_GOALS as ExpandedGoals),
      calories: 2000,
      dietary_fiber: 0,
      protein_percentage: 30,
      carbs_percentage: 40,
      fat_percentage: 30,
      protein_per_kg: 2,
      carbs_per_kg: 4,
      fat_per_kg: 1,
    });

    expect(screen.getByText(/carbs 320 g/)).toBeInTheDocument();
    expect(
      screen.getByText(
        'The per-kg macros add up to 2640 kcal, but the calorie target leaves 2000 kcal for macros.'
      )
    ).toBeInTheDocument();
  });

  it('shows no per-kg preview for a goal set in grams', () => {
    renderGoals({ ...(DEFAULT_GOALS as ExpandedGoals) });
    expect(screen.queryByText(/Today's grams from/)).not.toBeInTheDocument();
    expect(screen.getByText('Set protein per kg')).toBeInTheDocument();
  });
});
