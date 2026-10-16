import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import type {
  CustomCategoriesResponse,
  CustomMeasurementsResponse,
} from '@workspace/shared';
import { LabResultsReport } from '@/pages/Reports/LabResultsReport';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (
      _key: string,
      arg?: unknown,
      options?: Record<string, string | number>
    ) => {
      const template =
        typeof arg === 'string'
          ? arg
          : ((arg as { defaultValue?: string } | undefined)?.defaultValue ??
            _key);
      const values = (typeof arg === 'string' ? options : (arg as object)) as
        Record<string, string | number> | undefined;
      return template.replace(/\{\{(\w+)\}\}/g, (_m, name) =>
        String(values?.[name] ?? '')
      );
    },
  }),
}));

jest.mock('@/contexts/PreferencesContext', () => ({
  usePreferences: () => ({
    chartScaleMode: 'category',
    formatDateInUserTimezone: (d: string) => String(d),
  }),
}));

jest.mock('@/components/ZoomableChart', () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// Recharts needs real layout, which jsdom does not have; the chart itself is
// not under test here.
jest.mock('recharts', () => {
  const Stub = () => null;
  return {
    CartesianGrid: Stub,
    Line: Stub,
    LineChart: Stub,
    ReferenceArea: Stub,
    ReferenceLine: Stub,
    ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
      <div data-testid="chart">{children}</div>
    ),
    Tooltip: Stub,
    XAxis: Stub,
    YAxis: Stub,
  };
});

const category = (
  overrides: Partial<CustomCategoriesResponse>
): CustomCategoriesResponse => ({
  id: 'cat-1',
  name: 'hba1c',
  display_name: 'HbA1c',
  measurement_type: '%',
  frequency: 'Daily',
  data_type: 'numeric',
  is_lab: true,
  ref_range_low: 4,
  ref_range_high: 5.6,
  ...overrides,
});

const entry = (
  id: string,
  value: string,
  entry_date: string,
  category_id = 'cat-1'
) =>
  ({
    id,
    category_id,
    value,
    entry_date,
    entry_hour: null,
    notes: null,
  }) as unknown as CustomMeasurementsResponse;

describe('LabResultsReport', () => {
  it('renders nothing when there are no lab markers', () => {
    const { container } = render(
      <LabResultsReport
        customCategories={[category({ is_lab: false, name: 'Chest' })]}
        customMeasurementsData={[]}
      />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the latest result, its status and the reference range', () => {
    render(
      <LabResultsReport
        customCategories={[category({})]}
        customMeasurementsData={[
          entry('a', '5.2', '2026-03-01'),
          entry('b', '6.1', '2026-09-20'),
        ]}
      />
    );

    expect(screen.getByText('Lab Results')).toBeInTheDocument();
    expect(screen.getByText(/6\.1 %/)).toBeInTheDocument();
    expect(screen.getByText('High')).toBeInTheDocument();
    expect(screen.getByText('Reference range: 4 - 5.6 %')).toBeInTheDocument();
    expect(screen.getByTestId('chart')).toBeInTheDocument();
  });

  it('says so when a marker has no results in the period', () => {
    render(
      <LabResultsReport
        customCategories={[category({})]}
        customMeasurementsData={[]}
      />
    );
    expect(screen.getByText('No results in this period.')).toBeInTheDocument();
  });

  it('formats a one-sided range', () => {
    render(
      <LabResultsReport
        customCategories={[
          category({
            id: 'cat-2',
            name: 'ldl',
            display_name: 'LDL',
            measurement_type: 'mg/dL',
            ref_range_low: null,
            ref_range_high: 100,
          }),
        ]}
        customMeasurementsData={[entry('c', '90', '2026-09-20', 'cat-2')]}
      />
    );
    expect(
      screen.getByText('Reference range: < 100 mg/dL')
    ).toBeInTheDocument();
    expect(screen.getByText('In range')).toBeInTheDocument();
  });
});
