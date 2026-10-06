import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import ExerciseTypeReviewDialog from '@/pages/Exercises/ExerciseTypeReviewDialog';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (
      _key: string,
      defaultValue?: string | { count?: number; defaultValue?: string }
    ) =>
      typeof defaultValue === 'string'
        ? defaultValue
        : (defaultValue?.defaultValue ?? '').replace(
            '{{count}}',
            String(defaultValue?.count ?? '')
          ),
  }),
  initReactI18next: { type: '3rdParty', init: jest.fn() },
}));

const mockApply = jest.fn();
let mockSuggestions: unknown[] = [];
jest.mock('@/hooks/Exercises/useExerciseTypeReview', () => ({
  useExerciseTypeSuggestions: () => ({
    data: mockSuggestions,
    isLoading: false,
    isError: false,
    refetch: jest.fn(),
  }),
  useApplyExerciseTypeSuggestions: () => ({
    mutate: mockApply,
    isPending: false,
  }),
}));

describe('ExerciseTypeReviewDialog', () => {
  beforeEach(() => {
    mockApply.mockClear();
    mockSuggestions = [
      {
        id: 'e1',
        name: "Farmer's Walk",
        currentModality: 'weight_reps',
        suggestedModality: 'weight_distance',
      },
      {
        id: 'e2',
        name: 'Weighted Plank',
        currentModality: 'duration',
        suggestedModality: 'weight_duration',
      },
    ];
  });

  it('lists the suggested changes and applies the ones left checked', () => {
    render(<ExerciseTypeReviewDialog open onOpenChange={jest.fn()} />);
    expect(screen.getByText("Farmer's Walk")).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('checkbox')[1]!);
    fireEvent.click(screen.getByRole('button', { name: /Apply 1 change/ }));
    expect(mockApply).toHaveBeenCalledWith(
      [{ id: 'e1', modality: 'weight_distance' }],
      expect.anything()
    );
  });

  it('says so when nothing needs changing', () => {
    mockSuggestions = [];
    render(<ExerciseTypeReviewDialog open onOpenChange={jest.fn()} />);
    expect(screen.getByText(/already match/)).toBeInTheDocument();
  });
});
