import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';

import ExerciseTypeReviewScreen from '../../src/screens/ExerciseTypeReviewScreen';
import {
  useApplyExerciseTypeSuggestions,
  useExerciseTypeSuggestions,
} from '../../src/hooks/useExerciseTypeReview';
import { initializeI18n } from '../../src/localization/i18n';

jest.mock('../../src/hooks/useExerciseTypeReview', () => ({
  useExerciseTypeSuggestions: jest.fn(),
  useApplyExerciseTypeSuggestions: jest.fn(),
}));

jest.mock('../../src/hooks/useScreenHeader', () => ({
  useScreenHeader: () => null,
}));

jest.mock('../../src/components/ActiveWorkoutBar', () => ({
  useActiveWorkoutBarPadding: () => 0,
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('uniwind', () => ({
  useCSSVariable: (keys: string | string[]) =>
    Array.isArray(keys) ? keys.map(() => '#111827') : '#111827',
}));

jest.mock('../../src/components/Icon', () => {
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: ({ name }: { name: string }) => <View testID={`icon-${name}`} />,
  };
});

const mockSuggestions = useExerciseTypeSuggestions as jest.Mock;
const mockApply = useApplyExerciseTypeSuggestions as jest.Mock;

const suggestions = [
  {
    id: '11111111-1111-4111-8111-111111111111',
    name: "Farmer's Carry",
    category: 'strength',
    currentModality: 'weight_reps',
    suggestedModality: 'weight_distance',
  },
  {
    id: '22222222-2222-4222-8222-222222222222',
    name: 'Weighted Plank',
    category: 'abs',
    currentModality: 'weight_reps',
    suggestedModality: 'weight_duration',
  },
];

describe('ExerciseTypeReviewScreen', () => {
  const mutate = jest.fn();

  beforeAll(async () => {
    await initializeI18n('en');
  });

  beforeEach(() => {
    mutate.mockReset();
    mockApply.mockReturnValue({ mutate, isPending: false });
  });

  const renderScreen = () =>
    render(
      <ExerciseTypeReviewScreen
        navigation={{} as any}
        route={{ key: 'k', name: 'ExerciseTypeReview' } as any}
      />
    );

  it('shows an empty state when nothing differs', () => {
    mockSuggestions.mockReturnValue({ data: [], isLoading: false });
    const { getByText } = renderScreen();
    expect(getByText('All your exercises already match')).toBeTruthy();
  });

  it('applies every suggestion by default', () => {
    mockSuggestions.mockReturnValue({ data: suggestions, isLoading: false });
    const { getByText } = renderScreen();
    expect(getByText("Farmer's Carry")).toBeTruthy();
    fireEvent.press(getByText('Apply 2 changes'));
    expect(mutate).toHaveBeenCalledWith([
      { id: suggestions[0].id, modality: 'weight_distance' },
      { id: suggestions[1].id, modality: 'weight_duration' },
    ]);
  });

  it('leaves out unchecked exercises', () => {
    mockSuggestions.mockReturnValue({ data: suggestions, isLoading: false });
    const { getByText } = renderScreen();
    fireEvent.press(getByText('Weighted Plank'));
    fireEvent.press(getByText('Apply 1 change'));
    expect(mutate).toHaveBeenCalledWith([
      { id: suggestions[0].id, modality: 'weight_distance' },
    ]);
  });
});
