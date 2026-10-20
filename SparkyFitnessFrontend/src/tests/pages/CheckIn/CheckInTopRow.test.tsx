import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { CheckInTopRow } from '@/pages/CheckIn/CheckInTopRow';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, arg?: unknown) => (typeof arg === 'string' ? arg : key),
  }),
}));

jest.mock('@/pages/CheckIn/MoodMeter', () => ({
  __esModule: true,
  default: () => <div data-testid="mood-meter" />,
}));

jest.mock('@/pages/CheckIn/HomeDashboardFasting', () => ({
  __esModule: true,
  default: () => <div data-testid="fasting" />,
}));

const renderRow = (props: {
  isSavingMood?: boolean;
  isLoadingMood?: boolean;
}) =>
  render(
    <CheckInTopRow
      mood={50}
      moodNotes=""
      moodTags={[]}
      energy={null}
      focus={null}
      setMood={jest.fn()}
      setMoodNotes={jest.fn()}
      setMoodTags={jest.fn()}
      setEnergy={jest.fn()}
      setFocus={jest.fn()}
      onSaveMood={jest.fn()}
      isSavingMood={props.isSavingMood ?? false}
      isLoadingMood={props.isLoadingMood ?? false}
    />
  );

describe('CheckInTopRow save button', () => {
  it('is disabled while the selected date mood entry is loading', () => {
    renderRow({ isLoadingMood: true });
    expect(screen.getByRole('button', { name: 'Save Mood' })).toBeDisabled();
  });

  it('is enabled once the entry has loaded', () => {
    renderRow({ isLoadingMood: false });
    expect(screen.getByRole('button', { name: 'Save Mood' })).toBeEnabled();
  });

  it('is disabled while a save is in flight', () => {
    renderRow({ isSavingMood: true });
    expect(screen.getByRole('button', { name: 'Saving...' })).toBeDisabled();
  });
});
