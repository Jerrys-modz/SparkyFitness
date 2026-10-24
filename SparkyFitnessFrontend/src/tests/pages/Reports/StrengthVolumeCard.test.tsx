import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import type { StrengthVolume } from '@workspace/shared';
import StrengthVolumeCard from '@/pages/Reports/StrengthVolumeCard';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: string | Record<string, unknown>) => {
      if (typeof options === 'string') return options;
      const values: { defaultValue?: string; items?: string } = options ?? {};
      const text = values.defaultValue ?? key;
      return `${text}${
        key.startsWith('strengthVolume.reason.') ? ` ${values.items ?? ''}` : ''
      }`;
    },
  }),
}));

const BASE: StrengthVolume = {
  today: '2026-10-02',
  firstDayOfWeek: 1,
  thisWeekStart: '2026-09-28',
  lastWeekStart: '2026-09-21',
  range: { min: 10, max: 20 },
  muscles: [
    {
      muscle: 'Chest',
      thisWeek: 12,
      lastWeek: 8,
      thisWeekStatus: 'inRange',
      lastWeekStatus: 'under',
    },
    {
      muscle: 'Back',
      thisWeek: 22,
      lastWeek: 21,
      thisWeekStatus: 'over',
      lastWeekStatus: 'over',
    },
  ],
  deload: { status: 'ok', reasons: [], score: 0, plan: null },
};

describe('StrengthVolumeCard', () => {
  it('shows each muscle with its status and no deload prompt when fine', () => {
    render(<StrengthVolumeCard data={BASE} />);
    expect(screen.getByText('Weekly Muscle Volume')).toBeInTheDocument();
    expect(screen.getByText('under')).toBeInTheDocument();
    expect(screen.getAllByText('over')).toHaveLength(2);
    expect(
      screen.queryByText('Consider a lighter week')
    ).not.toBeInTheDocument();
  });

  it('shows the reasons and the advice-only note for a suggestion', () => {
    render(
      <StrengthVolumeCard
        data={{
          ...BASE,
          deload: {
            status: 'suggest',
            score: 2,
            reasons: [{ code: 'e1rm_dropping', items: ['Squat'], value: 8 }],
            plan: {
              weekStart: '2026-10-05',
              setsPercent: { min: 50, max: 60 },
              loadPercent: { min: 90, max: 100 },
              muscleTargets: [{ muscle: 'Chest', from: 6, to: 7 }],
            },
          },
        }}
      />
    );
    expect(screen.getByText('Consider a lighter week')).toBeInTheDocument();
    expect(screen.getByText(/Squat/)).toBeInTheDocument();
    expect(screen.getByText(/Chest 6-7/)).toBeInTheDocument();
  });

  it('renders nothing without data', () => {
    const { container } = render(<StrengthVolumeCard data={undefined} />);
    expect(container).toBeEmptyDOMElement();
  });
});
