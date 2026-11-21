import React from 'react';
import { Alert } from 'react-native';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import Toast from 'react-native-toast-message';
import SwipeableExerciseRow from '../../src/components/SwipeableExerciseRow';
import { discardWaitingRun } from '../../src/offline/waitingRuns';

jest.mock('../../src/offline/waitingRuns', () => ({
  discardWaitingRun: jest.fn(),
}));
jest.mock('../../src/hooks/useExerciseMutations', () => ({
  useDeleteWorkout: () => ({
    confirmAndDelete: jest.fn(),
    deleteEntry: jest.fn(),
    invalidateCache: jest.fn(),
  }),
  useDeleteExerciseEntry: () => ({
    confirmAndDelete: jest.fn(),
    deleteEntry: jest.fn(),
    invalidateCache: jest.fn(),
  }),
}));
jest.mock('react-native-toast-message', () => ({
  __esModule: true,
  default: { show: jest.fn() },
}));

const run = {
  type: 'individual',
  id: '33333333-3333-4333-8333-333333333333',
  name: 'Running',
  exercise_id: null,
  duration_minutes: 25,
  calories_burned: 250,
  entry_date: '2026-11-16',
  notes: null,
  distance: 5,
  avg_heart_rate: null,
  source: 'Manual',
  sets: [],
  exercise_snapshot: null,
  activity_details: [],
  superset_group: null,
} as never;

const renderRow = (waitingToUpload: boolean) =>
  render(
    <SwipeableExerciseRow
      session={run}
      entryDate="2026-11-16"
      onPress={jest.fn()}
      waitingToUpload={waitingToUpload}
    />
  );

describe('a run waiting to upload in the Diary', () => {
  let alertSpy: jest.SpyInstance;
  beforeEach(() => {
    jest.clearAllMocks();
    alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  });
  afterEach(() => alertSpy.mockRestore());

  const pressDelete = () => {
    const buttons = alertSpy.mock.calls[0]![2] as {
      text: string;
      onPress?: () => void;
    }[];
    buttons.find((b) => b.text === 'Delete')!.onPress!();
  };

  it('shows the waiting mark', () => {
    expect(renderRow(true).getByTestId('waiting-to-upload-pill')).toBeTruthy();
    expect(renderRow(false).queryByTestId('waiting-to-upload-pill')).toBeNull();
  });

  it('asks once on a long press, then removes it from the queue', async () => {
    jest.mocked(discardWaitingRun).mockResolvedValue(true);
    const { getByText } = renderRow(true);

    fireEvent(getByText('Running'), 'longPress');
    expect(alertSpy).toHaveBeenCalledTimes(1);
    pressDelete();

    await waitFor(() =>
      expect(discardWaitingRun).toHaveBeenCalledWith(
        '33333333-3333-4333-8333-333333333333'
      )
    );
    // The long-press menu was the confirmation: no second dialog.
    expect(alertSpy).toHaveBeenCalledTimes(1);
  });

  it('says so when it finished uploading before it could be removed', async () => {
    jest.mocked(discardWaitingRun).mockResolvedValue(false);
    const { getByText } = renderRow(true);

    fireEvent(getByText('Running'), 'longPress');
    pressDelete();

    await waitFor(() =>
      expect(Toast.show).toHaveBeenCalledWith(
        expect.objectContaining({ text1: 'Already uploaded' })
      )
    );
  });

  it('does not touch the queue for an ordinary entry', () => {
    const { getByText } = renderRow(false);
    fireEvent(getByText('Running'), 'longPress');
    pressDelete();
    expect(discardWaitingRun).not.toHaveBeenCalled();
  });
});
