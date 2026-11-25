import '@testing-library/jest-dom';
import { render } from '@testing-library/react';
import ExercisePresetEntryDisplay from '@/pages/Diary/ExercisePresetEntryDisplay';
import type { PresetSessionEntry } from '@/types/exercises';

jest.mock('react-i18next', () =>
  jest.requireActual('@/tests/mocks/reactI18next')
);

const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({ useNavigate: () => mockNavigate }));

const mockActiveUserId = 'user-1';
jest.mock('@/contexts/ActiveUserContext', () => ({
  useActiveUser: () => ({
    activeUserId: mockActiveUserId,
    hasWritePermission: () => true,
  }),
}));

jest.mock('@/contexts/PreferencesContext', () => ({
  usePreferences: () => ({ timeFormat: 'HH:mm' }),
}));

const mockUpdatePresetSession = jest.fn();
jest.mock('@/hooks/Exercises/useExerciseEntries', () => ({
  useUpdatePresetSessionMutation: () => ({
    mutateAsync: mockUpdatePresetSession,
  }),
  isPresetSessionConflictError: () => false,
}));

jest.mock('@/hooks/use-toast', () => ({ toast: jest.fn() }));

jest.mock('@/pages/Diary/WorkoutFeedbackPanel', () => () => null);
jest.mock('@/pages/Diary/ExerciseEntryDisplay', () => () => null);

const entryWith = (
  exercises: Array<{ id: string; avg_heart_rate?: number; hr_source?: string }>
) =>
  ({
    type: 'preset',
    id: 'session-1',
    entry_date: '2026-04-27',
    workout_preset_id: null,
    name: 'Upper Body',
    description: null,
    notes: null,
    source: 'sparky',
    status: 'completed',
    revision: 1,
    total_duration_minutes: 0,
    exercises: exercises.map((exercise) => ({
      sets: [],
      duration_minutes: 10,
      calories_burned: 0,
      ...exercise,
    })),
    activity_details: [],
  }) as unknown as PresetSessionEntry;

const renderEntry = (presetEntry: PresetSessionEntry) =>
  render(
    <ExercisePresetEntryDisplay
      presetEntry={presetEntry}
      currentUserId="user-1"
      handleDelete={jest.fn()}
      handleDeleteExerciseEntry={jest.fn()}
      handleEdit={jest.fn()}
      handleEditExerciseDatabase={jest.fn()}
      setExerciseToPlay={jest.fn()}
      setIsPlaybackModalOpen={jest.fn()}
      energyUnit="kcal"
      convertEnergy={(value) => value}
      getEnergyUnitString={() => 'kcal'}
    />
  );

describe('ExercisePresetEntryDisplay heart rate source', () => {
  it('says what measured the heart rate', () => {
    const { getByText } = renderEntry(
      entryWith([{ id: 'a', avg_heart_rate: 130, hr_source: 'headphones' }])
    );
    expect(getByText('Headphones')).toBeInTheDocument();
  });

  it('names both when a workout used each', () => {
    const { getByText } = renderEntry(
      entryWith([
        { id: 'a', avg_heart_rate: 130, hr_source: 'watch' },
        { id: 'b', avg_heart_rate: 120, hr_source: 'headphones' },
      ])
    );
    expect(getByText('Apple Watch + Headphones')).toBeInTheDocument();
  });

  it('says nothing for a synced workout with no recorded source', () => {
    const { queryByText } = renderEntry(
      entryWith([{ id: 'a', avg_heart_rate: 130 }])
    );
    expect(queryByText('Apple Watch')).toBeNull();
    expect(queryByText('Headphones')).toBeNull();
  });
});
