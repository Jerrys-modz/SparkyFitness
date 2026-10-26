import { fireEvent, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import WorkoutFinder from '@/pages/Exercises/WorkoutSplits/WorkoutFinder';
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
      <WorkoutFinder />
    </MemoryRouter>
  );

const pick = (question: string, option: string) => {
  fireEvent.keyDown(screen.getByRole('combobox', { name: question }), {
    key: 'ArrowDown',
  });
  fireEvent.click(screen.getByRole('option', { name: option }));
};

const resultIds = () =>
  screen.getAllByTestId(/^workout-finder-result-/).map((result) =>
    within(result)
      .getByTestId(/^workout-split-(?!sessions)/)
      .getAttribute('data-testid')
  );

describe('WorkoutFinder', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    mockActingOnBehalf = false;
    (useImportWorkoutSplitMutation as jest.Mock).mockReturnValue({
      mutate,
      isPending: false,
    });
  });

  it('recommends the closest programs, best match first', () => {
    renderPage();
    pick('Where I train', 'At home');
    pick('Days a week', '4');
    expect(resultIds()[0]).toBe('workout-split-upper_lower_4_home');
    const best = within(screen.getByTestId('workout-finder-result-0'));
    expect(best.getByText(/Best match\./)).toBeInTheDocument();
    expect(
      best.getByText(/Matches everything you asked for\./)
    ).toBeInTheDocument();
  });

  it('says where the closest program differs from what was asked', () => {
    renderPage();
    pick('Where I train', 'At home');
    pick('Days a week', '5');
    expect(
      within(screen.getByTestId('workout-finder-result-0')).getByText(
        /Closest match: .*days a week/
      )
    ).toBeInTheDocument();
  });

  it('shows the sessions fitted to the workout length', () => {
    renderPage();
    pick('Where I train', 'Gym');
    pick('Workout length', '40 minutes');
    const card = within(screen.getByTestId('workout-finder-result-0'));
    fireEvent.click(card.getByRole('button', { name: 'Show sessions' }));
    expect(card.getAllByText(/about 40 min/).length).toBeGreaterThan(0);
  });

  it('adds the focus muscle exercise to the fitted sessions', () => {
    renderPage();
    pick('Where I train', 'At home');
    pick('Muscle to focus on', 'Core');
    const card = within(screen.getByTestId('workout-finder-result-0'));
    fireEvent.click(card.getByRole('button', { name: 'Show sessions' }));
    expect(card.getAllByText('Plank').length).toBeGreaterThan(0);
  });

  it('adds with the answers, not an exercise list', () => {
    renderPage();
    pick('Where I train', 'At home');
    pick('Days a week', '4');
    pick('Workout length', '40 minutes');
    pick('Muscle to focus on', 'Arms');

    const card = within(screen.getByTestId('workout-finder-result-0'));
    fireEvent.click(card.getByRole('button', { name: 'Add to my workouts' }));
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: 'Add program' }));

    expect(mutate).toHaveBeenCalledWith(
      {
        splitId: 'upper_lower_4_home',
        body: expect.objectContaining({
          activate: true,
          trainer: { venue: 'home', sessionMinutes: 40, focus: 'arms' },
        }),
      },
      expect.any(Object)
    );
  });

  it('does not offer programs while acting on behalf of someone', () => {
    mockActingOnBehalf = true;
    renderPage();
    expect(
      screen.queryByTestId('workout-finder-results')
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(/Switch back to your own account/)
    ).toBeInTheDocument();
  });
});
