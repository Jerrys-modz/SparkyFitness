import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import StarterRoutinesModal from '../../src/components/StarterRoutinesModal';
import { useAddStarterRoutine, useStarterRoutines } from '../../src/hooks';

jest.mock('../../src/hooks', () => ({
  useStarterRoutines: jest.fn(),
  useAddStarterRoutine: jest.fn(),
}));

const mockAddRoutine = jest.fn();
const insets = { top: 0, bottom: 0, left: 0, right: 0 };
const frame = { x: 0, y: 0, width: 390, height: 844 };

const renderModal = () =>
  render(
    <SafeAreaProvider initialMetrics={{ insets, frame }}>
      <StarterRoutinesModal visible onClose={jest.fn()} />
    </SafeAreaProvider>
  );

describe('StarterRoutinesModal', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (useStarterRoutines as jest.Mock).mockReturnValue({
      data: [
        {
          id: 'post-run',
          name: 'Post-Run Stretch',
          description: 'Cool-down stretches.',
          move_count: 6,
        },
      ],
      isLoading: false,
    });
    (useAddStarterRoutine as jest.Mock).mockReturnValue({
      addRoutine: mockAddRoutine,
      isPending: false,
      pendingRoutineId: undefined,
    });
  });

  it('lists the routines the server offers', () => {
    const { getByText } = renderModal();
    expect(getByText('Post-Run Stretch')).toBeTruthy();
    expect(getByText('6 moves')).toBeTruthy();
  });

  it('adds the tapped routine', () => {
    const { getByLabelText } = renderModal();
    fireEvent.press(getByLabelText('Add Post-Run Stretch to workout presets'));
    expect(mockAddRoutine).toHaveBeenCalledWith('post-run');
  });
});
