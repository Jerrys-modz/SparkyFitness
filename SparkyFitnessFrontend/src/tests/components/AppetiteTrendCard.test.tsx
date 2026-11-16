import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { AppetiteTrendCard } from '@/pages/Reports/AppetiteTrendCard';
import type {
  CustomCategoriesResponse,
  CustomMeasurementsResponse,
} from '@workspace/shared';
import type { NutritionData } from '@/types/reports';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (
      key: string,
      options?: string | { defaultValue?: string; [k: string]: unknown }
    ) => {
      if (typeof options === 'string') return options;
      let text = options?.defaultValue ?? key;
      for (const [name, value] of Object.entries(options ?? {})) {
        text = text.replace(`{{${name}}}`, String(value));
      }
      return text;
    },
  }),
  initReactI18next: { type: '3rdParty', init: jest.fn() },
}));

jest.mock('@/contexts/PreferencesContext', () => ({
  usePreferences: () => ({
    energyUnit: 'kcal',
    convertEnergy: (value: number) => value,
    getEnergyUnitString: (unit: string) => unit,
    formatDateInUserTimezone: (date: string) => date,
  }),
}));

// Recharts needs a measured container; the chart itself is not under test.
jest.mock('recharts', () => {
  const Pass = ({ children }: { children?: React.ReactNode }) => (
    <div>{children}</div>
  );
  return {
    ResponsiveContainer: Pass,
    ComposedChart: Pass,
    CartesianGrid: () => null,
    XAxis: () => null,
    YAxis: () => null,
    Tooltip: () => null,
    Legend: () => null,
    Bar: () => null,
    Line: () => null,
  };
});

const categories = [
  { id: 'c-h', name: 'GLP Hunger' },
  { id: 'c-f', name: 'GLP Fullness' },
] as unknown as CustomCategoriesResponse[];

const measurement = (category_id: string, value: string, entry_date: string) =>
  ({ category_id, value, entry_date }) as CustomMeasurementsResponse;

const day = (date: string, calories: number) =>
  ({ date, calories }) as NutritionData;

describe('AppetiteTrendCard', () => {
  it('renders nothing without a score in the range', () => {
    const { container } = render(
      <AppetiteTrendCard
        customCategories={categories}
        customMeasurementsData={[]}
        nutritionData={[day('2026-11-01', 2000)]}
      />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the averages and calories on hungrier days', () => {
    render(
      <AppetiteTrendCard
        customCategories={categories}
        customMeasurementsData={[
          measurement('c-h', '8', '2026-11-02'),
          measurement('c-h', '2', '2026-11-01'),
          measurement('c-f', '6', '2026-11-01'),
        ]}
        nutritionData={[day('2026-11-01', 1800), day('2026-11-02', 2600)]}
      />
    );
    expect(
      screen.getByText('Hunger & fullness vs calories')
    ).toBeInTheDocument();
    expect(screen.getByText('5.0')).toBeInTheDocument();
    expect(screen.getByText('6.0')).toBeInTheDocument();
    expect(
      screen.getByText(
        'On your hungrier days you ate 2600 kcal on average, against 1800 kcal on the others.'
      )
    ).toBeInTheDocument();
  });
});
