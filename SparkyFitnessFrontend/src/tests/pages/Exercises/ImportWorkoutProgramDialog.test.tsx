import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import {
  WORKOUT_PROGRAM_FILE_FORMAT,
  WORKOUT_PROGRAM_FILE_VERSION,
} from '@workspace/shared';
import ImportWorkoutProgramDialog from '@/pages/Exercises/WorkoutSplits/ImportWorkoutProgramDialog';
import { useImportWorkoutProgramMutation } from '@/hooks/Exercises/useWorkoutPrograms';

jest.mock('react-i18next', () =>
  jest.requireActual('@/tests/mocks/reactI18next')
);

jest.mock('@/hooks/Exercises/useWorkoutPrograms', () => ({
  useImportWorkoutProgramMutation: jest.fn(),
}));

const mutate = jest.fn();
const onImported = jest.fn();

const program = {
  format: WORKOUT_PROGRAM_FILE_FORMAT,
  version: WORKOUT_PROGRAM_FILE_VERSION,
  exercises: [{ key: 'e1', name: 'Push Up' }],
  presets: [
    {
      key: 'p1',
      name: 'Push Day',
      exercises: [{ exercise: 'e1', sets: [{ setNumber: 1, reps: 10 }] }],
    },
  ],
  plan: {
    name: 'Friend plan',
    scheduleType: 'weekly',
    sessions: [{ dayOfWeek: 1, preset: 'p1' }],
  },
};

const chooseFile = (text: string) =>
  fireEvent.change(screen.getByLabelText('Workout file'), {
    target: { files: [{ text: async () => text }] },
  });

const renderDialog = () =>
  render(
    <ImportWorkoutProgramDialog
      open
      onClose={jest.fn()}
      onImported={onImported}
    />
  );

describe('ImportWorkoutProgramDialog', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    (useImportWorkoutProgramMutation as jest.Mock).mockReturnValue({
      mutate,
      isPending: false,
    });
  });

  it('explains a file that is not a workout file', async () => {
    renderDialog();
    chooseFile('{"hello": "world"}');
    expect(
      await screen.findByText('This is not a SparkyFitness workout file.')
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add workouts' })).toBeDisabled();
  });

  it('shows what is in the file and adds it once the disclaimer is ticked', async () => {
    renderDialog();
    chooseFile(JSON.stringify(program));

    expect(
      await screen.findByText('Push Day (1 exercises)')
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Plan name')).toHaveValue('Friend plan');
    const add = screen.getByRole('button', { name: 'Add workouts' });
    expect(add).toBeDisabled();

    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.change(screen.getByLabelText('Plan name'), {
      target: { value: 'From Sam' },
    });
    fireEvent.click(add);

    await waitFor(() => expect(mutate).toHaveBeenCalled());
    const [body, options] = mutate.mock.calls[0];
    expect(body).toMatchObject({
      planName: 'From Sam',
      activate: false,
      program: { format: WORKOUT_PROGRAM_FILE_FORMAT },
    });
    options.onSuccess();
    expect(onImported).toHaveBeenCalled();
  });
});
