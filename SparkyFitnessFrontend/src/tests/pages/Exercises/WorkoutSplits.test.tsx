import { fireEvent, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import { WORKOUT_SPLITS } from '@workspace/shared';
import WorkoutSplits from '@/pages/Exercises/WorkoutSplits/WorkoutSplits';
import { useImportWorkoutSplitMutation } from '@/hooks/Exercises/useWorkoutSplits';

jest.mock('react-i18next', () =>
  jest.requireActual('@/tests/mocks/reactI18next')
);

jest.mock('@/hooks/Exercises/useWorkoutSplits', () => ({
  useImportWorkoutSplitMutation: jest.fn(),
}));

let mockActingOnBehalf = false;
jest.mock('@/contexts/ActiveUserContext', () => ({
  useActiveUser: () => ({ isActingOnBehalf: mockActingOnBehalf }),
}));

const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
}));

const mutate = jest.fn();

const renderPage = () =>
  render(
    <MemoryRouter>
      <WorkoutSplits />
    </MemoryRouter>
  );

const pick = (filter: string, option: string) => {
  fireEvent.keyDown(screen.getByRole('combobox', { name: filter }), {
    key: 'ArrowDown',
  });
  fireEvent.click(screen.getByRole('option', { name: option }));
};

const cardIds = () =>
  screen
    .getAllByTestId(/^workout-split-(?!sessions)/)
    .map((card) => card.getAttribute('data-testid'));

describe('WorkoutSplits', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    mockActingOnBehalf = false;
    (useImportWorkoutSplitMutation as jest.Mock).mockReturnValue({
      mutate,
      isPending: false,
    });
  });

  it('lists every program', () => {
    renderPage();
    expect(cardIds()).toHaveLength(WORKOUT_SPLITS.length);
    expect(screen.getByText('Linear 5x5')).toBeInTheDocument();
  });

  it('shows only what the chosen venue can do, plus the smaller ones', () => {
    renderPage();
    pick('Where I train', 'At home');
    expect(cardIds()).toEqual([
      'workout-split-full_body_3_home',
      'workout-split-upper_lower_4_home',
      'workout-split-push_pull_legs_3_home',
    ]);

    pick('Where I train', 'Garage gym');
    expect(cardIds()).toContain('workout-split-linear_5x5');
    expect(cardIds()).toContain('workout-split-full_body_3_home');
    expect(cardIds()).not.toContain('workout-split-body_part_5');
  });

  it('combines the filters and says when nothing matches', () => {
    renderPage();
    pick('Where I train', 'At home');
    pick('Goal', 'Gain strength');
    expect(screen.getByText(/No program matches/)).toBeInTheDocument();
  });

  it('shows a split’s sessions with their targets', () => {
    renderPage();
    const card = screen.getByTestId('workout-split-linear_5x5');
    fireEvent.click(
      within(card).getByRole('button', { name: 'Show sessions' })
    );
    const sessions = screen.getByTestId('workout-split-sessions-linear_5x5');
    expect(within(sessions).getByText('Workout A')).toBeInTheDocument();
    expect(within(sessions).getAllByText('Barbell Squat')).toHaveLength(2);
    expect(within(sessions).getAllByText('5 x 5').length).toBeGreaterThan(0);
  });

  it('adds a program only after the disclaimer is accepted, with the shown names', () => {
    renderPage();
    const card = screen.getByTestId('workout-split-linear_5x5');
    fireEvent.click(
      within(card).getByRole('button', { name: 'Add to my workouts' })
    );

    const add = screen.getByRole('button', { name: 'Add program' });
    expect(add).toBeDisabled();
    fireEvent.click(screen.getByRole('checkbox'));
    expect(add).toBeEnabled();
    fireEvent.click(add);

    expect(mutate).toHaveBeenCalledWith(
      {
        splitId: 'linear_5x5',
        body: {
          planName: 'Linear 5x5',
          sessionNames: { workout_a: 'Workout A', workout_b: 'Workout B' },
          activate: true,
        },
      },
      expect.any(Object)
    );
  });

  it('closes and opens the exercises page when the import succeeds', () => {
    mutate.mockImplementation((_vars, options) => options.onSuccess());
    renderPage();
    const card = screen.getByTestId('workout-split-linear_5x5');
    fireEvent.click(
      within(card).getByRole('button', { name: 'Add to my workouts' })
    );
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: 'Add program' }));

    expect(mockNavigate).toHaveBeenCalledWith('/exercises');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('does not offer programs while acting on behalf of someone', () => {
    mockActingOnBehalf = true;
    renderPage();
    expect(screen.queryByTestId('workout-splits-list')).not.toBeInTheDocument();
    expect(
      screen.getByText(/Switch back to your own account/)
    ).toBeInTheDocument();
  });
});
