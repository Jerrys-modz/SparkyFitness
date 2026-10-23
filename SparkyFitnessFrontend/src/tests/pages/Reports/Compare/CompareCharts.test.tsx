import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import type { ReactNode } from 'react';
import type {
  CompareQuestion,
  CompareResponse,
  CompareResult,
} from '@workspace/shared';
import { CompareDotsChart } from '@/pages/Reports/Compare/CompareDotsChart';
import { CompareOverTimeChart } from '@/pages/Reports/Compare/CompareOverTimeChart';

jest.mock('react-i18next', () =>
  jest.requireActual('@/tests/mocks/reactI18next')
);

jest.mock('@/contexts/PreferencesContext', () => ({
  usePreferences: () => ({
    timezone: 'UTC',
    formatDateInUserTimezone: (d: string) => d,
  }),
}));

jest.mock('@/components/ZoomableChart', () => ({
  __esModule: true,
  default: ({
    children,
  }: {
    children: (maximized: boolean, zoom: number) => ReactNode;
  }) => <div>{children(false, 1)}</div>,
}));

interface Dot {
  x: number;
  y: number;
}
let scatterData: Dot[] = [];
let lineKeys: string[] = [];

jest.mock('recharts', () => {
  const Passthrough = ({ children }: { children?: ReactNode }) => (
    <div>{children}</div>
  );
  return {
    ResponsiveContainer: Passthrough,
    ScatterChart: Passthrough,
    LineChart: Passthrough,
    Scatter: ({ data }: { data: Dot[] }) => {
      scatterData = data;
      return <div data-testid="scatter" />;
    },
    Line: ({ dataKey }: { dataKey: string }) => {
      lineKeys.push(dataKey);
      return null;
    },
    ReferenceLine: () => <div data-testid="trend" />,
    XAxis: () => null,
    YAxis: () => null,
    CartesianGrid: () => null,
    Tooltip: () => null,
  };
});

const Q: CompareQuestion = { a: 'timeAsleep', b: 'energy', choice: 'sameDay' };
const YES_NO_Q: CompareQuestion = {
  a: 'meditated',
  b: 'energy',
  choice: 'sameDay',
};

function response(
  result: Partial<CompareResult>,
  q: CompareQuestion,
  dev: { a: Record<string, number>; b: Record<string, number> } = {
    a: {},
    b: {},
  }
): CompareResponse {
  return {
    a: { key: q.a, values: { '2026-10-01': 400, '2026-10-02': 480 } },
    b: { key: q.b, values: { '2026-10-01': 3, '2026-10-02': 4 } },
    through: '2026-10-21',
    deviations: dev,
    result: {
      status: 'ok',
      n: 62,
      needed: 14,
      checks: { ownNormal: true },
      ...result,
    },
  };
}

const DEV = {
  a: { '2026-10-01': -1, '2026-10-02': 1, '2026-10-03': 0.5 },
  b: { '2026-10-01': -0.5, '2026-10-02': 0.8, '2026-10-03': 0.2 },
};

beforeEach(() => {
  scatterData = [];
  lineKeys = [];
});

describe('CompareDotsChart', () => {
  test('draws a dot per paired day and the trend only when linked', () => {
    const { unmount } = render(
      <CompareDotsChart
        response={response({ linked: true }, Q, DEV)}
        question={Q}
      />
    );
    expect(scatterData).toHaveLength(3);
    expect(screen.getByTestId('trend')).toBeInTheDocument();
    expect(screen.getByText('Each day as a dot')).toBeInTheDocument();
    unmount();
    render(
      <CompareDotsChart
        response={response({ linked: false }, Q, DEV)}
        question={Q}
      />
    );
    expect(screen.queryByTestId('trend')).not.toBeInTheDocument();
  });

  test('shows the empty state with no dots', () => {
    render(
      <CompareDotsChart
        response={response({ status: 'not_enough' }, Q)}
        question={Q}
      />
    );
    expect(screen.getByText('No days with both yet')).toBeInTheDocument();
    expect(screen.queryByTestId('scatter')).not.toBeInTheDocument();
  });

  test('a yes/no question by day renders bars, not the scatter', () => {
    render(
      <CompareDotsChart
        response={response(
          {
            linked: true,
            binary: {
              yesKey: 'meditated',
              yesMean: 1,
              noMean: 0.5,
              diff: 0.5,
              yesCount: 10,
              noCount: 1,
            },
          },
          YES_NO_Q,
          DEV
        )}
        question={YES_NO_Q}
      />
    );
    expect(screen.getByTestId('compare-bar-yes')).toBeInTheDocument();
    expect(screen.getByTestId('compare-bar-no')).toBeInTheDocument();
    expect(screen.queryByTestId('scatter')).not.toBeInTheDocument();
    expect(screen.getByText(/· 1 day$/)).toBeInTheDocument();
  });
});

describe('CompareOverTimeChart', () => {
  test('draws both series and names each metric in the legend', () => {
    render(
      <CompareOverTimeChart response={response({}, Q, DEV)} question={Q} />
    );
    expect(lineKeys).toEqual(['a', 'b']);
    expect(screen.getByText(/^Energy/)).toBeInTheDocument();
    expect(screen.getByText(/Time asleep/)).toBeInTheDocument();
  });

  test('shows the empty state when nothing is logged', () => {
    const empty = response({}, Q);
    empty.a.values = {};
    empty.b.values = {};
    render(<CompareOverTimeChart response={empty} question={Q} />);
    expect(
      screen.getByText('Nothing logged in this range')
    ).toBeInTheDocument();
  });
});
