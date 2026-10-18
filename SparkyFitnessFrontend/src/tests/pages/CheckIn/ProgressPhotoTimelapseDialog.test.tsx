import { act, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import type { ProgressPhotoDay } from '@workspace/shared';
import { ProgressPhotoTimelapseDialog } from '@/pages/CheckIn/ProgressPhotoTimelapseDialog';

jest.mock('@/contexts/PreferencesContext', () => ({
  usePreferences: () => ({
    weightUnit: 'kg',
    timezone: 'UTC',
    formatDate: (date: string) => date,
    parseDateInUserTimezone: (date: string) => new Date(`${date}T00:00:00`),
  }),
}));

const frontDay = (
  entry_date: string,
  weight: number | null = null
): ProgressPhotoDay => ({
  entry_date,
  weight,
  photos: {
    front: {
      id: `${entry_date}-front`,
      entry_date,
      photo_type: 'front',
      weight,
    },
  },
});

// Newest first, as the gallery endpoint returns it; all inside the default
// three-month window ending on the fixed "today" below.
const gallery = [
  frontDay('2026-06-20', 70),
  frontDay('2026-06-01'),
  frontDay('2026-05-10', 72),
];

const renderDialog = (days: ProgressPhotoDay[] = gallery) =>
  render(
    <ProgressPhotoTimelapseDialog
      open
      onOpenChange={jest.fn()}
      days={days}
      onLogWeight={jest.fn()}
    />
  );

const shownFrame = () => screen.getByAltText(/^2026-/);

describe('ProgressPhotoTimelapseDialog', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-06-30T12:00:00Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('starts on the oldest photo of the window', () => {
    renderDialog();

    expect(shownFrame()).toHaveAttribute('alt', '2026-05-10');
    expect(screen.getByText('1 of 3 · Last 3 months')).toBeInTheDocument();
  });

  it('plays forward one frame per tick and stops on the latest', () => {
    renderDialog();

    fireEvent.click(screen.getByRole('button', { name: 'Play' }));
    act(() => {
      jest.advanceTimersByTime(900);
    });
    expect(shownFrame()).toHaveAttribute('alt', '2026-06-01');

    act(() => {
      jest.advanceTimersByTime(900);
    });
    expect(shownFrame()).toHaveAttribute('alt', '2026-06-20');

    // At the end the clock stops and the button offers to play again.
    act(() => {
      jest.advanceTimersByTime(5000);
    });
    expect(screen.getByText('3 of 3 · Last 3 months')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Play' })).toBeInTheDocument();
  });

  it('runs faster at the Fast speed', () => {
    renderDialog();

    fireEvent.click(screen.getByRole('button', { name: 'Fast' }));
    fireEvent.click(screen.getByRole('button', { name: 'Play' }));
    act(() => {
      jest.advanceTimersByTime(500);
    });

    expect(shownFrame()).toHaveAttribute('alt', '2026-06-01');
  });

  it('steps with the previous and next buttons', () => {
    renderDialog();

    const previous = screen.getByRole('button', { name: 'Previous photo' });
    expect(previous).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'Next photo' }));
    expect(shownFrame()).toHaveAttribute('alt', '2026-06-01');

    fireEvent.click(previous);
    expect(shownFrame()).toHaveAttribute('alt', '2026-05-10');
  });

  it('plays the whole history when the default window is nearly empty', () => {
    renderDialog([frontDay('2025-02-01'), frontDay('2025-01-01')]);

    expect(screen.getByText('1 of 2 · All time')).toBeInTheDocument();
  });

  it('shows the empty state with fewer than two photos of the angle', () => {
    renderDialog([frontDay('2026-06-20')]);

    expect(
      screen.getByText(
        'Add photos of this angle on at least two days to play a time-lapse.'
      )
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Play' })
    ).not.toBeInTheDocument();
  });
});
