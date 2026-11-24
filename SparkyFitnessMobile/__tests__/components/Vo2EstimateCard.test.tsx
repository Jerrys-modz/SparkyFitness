import React from 'react';
import {
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Toast from 'react-native-toast-message';

import Vo2EstimateCard from '../../src/components/Vo2EstimateCard';
import { setExerciseEntryVo2Estimate } from '../../src/services/api/exerciseApi';
import { addLog } from '../../src/services/LogService';
import { initializeI18n } from '../../src/localization/i18n';

jest.mock('../../src/services/api/exerciseApi');
jest.mock('../../src/services/LogService', () => ({ addLog: jest.fn() }));

const mockedSet = jest.mocked(setExerciseEntryVo2Estimate);

const renderCard = (excluded: boolean, onChanged = jest.fn()) => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const spy = jest.spyOn(client, 'invalidateQueries');
  render(
    <QueryClientProvider client={client}>
      <Vo2EstimateCard
        exerciseEntryId="entry-1"
        excluded={excluded}
        onChanged={onChanged}
      />
    </QueryClientProvider>
  );
  return { onChanged, spy };
};

const toggle = () => screen.getByLabelText('Use in VO2 max estimate');

beforeAll(async () => {
  await initializeI18n();
});

beforeEach(() => {
  jest.clearAllMocks();
});

describe('Vo2EstimateCard', () => {
  it('is on for a run that counts', () => {
    renderCard(false);
    expect(toggle().props.value).toBe(true);
  });

  it('is off for a run that was left out', () => {
    renderCard(true);
    expect(toggle().props.value).toBe(false);
  });

  it('leaves the run out, tells the screen and refreshes the estimate', async () => {
    mockedSet.mockResolvedValue(undefined);
    const { onChanged, spy } = renderCard(false);
    fireEvent(toggle(), 'valueChange', false);
    await waitFor(() => expect(onChanged).toHaveBeenCalledWith(true));
    expect(mockedSet).toHaveBeenCalledWith('entry-1', true);
    expect(spy).toHaveBeenCalledWith({ queryKey: ['runEstimates'] });
    expect(spy).toHaveBeenCalledWith({ queryKey: ['vo2MaxRange'] });
  });

  it('puts it back when switched on again', async () => {
    mockedSet.mockResolvedValue(undefined);
    const { onChanged } = renderCard(true);
    fireEvent(toggle(), 'valueChange', true);
    await waitFor(() => expect(onChanged).toHaveBeenCalledWith(false));
    expect(mockedSet).toHaveBeenCalledWith('entry-1', false);
  });

  it('goes back and says so when the save fails', async () => {
    mockedSet.mockRejectedValue(new Error('Offline'));
    const { onChanged } = renderCard(false);
    fireEvent(toggle(), 'valueChange', false);
    await waitFor(() =>
      expect(Toast.show).toHaveBeenCalledWith({
        type: 'error',
        text1: 'Failed to update the VO2 max estimate',
        text2: 'Please try again.',
      })
    );
    expect(onChanged).not.toHaveBeenCalled();
    expect(addLog).toHaveBeenCalledWith(
      'Failed to update the VO2 max estimate: Error: Offline',
      'ERROR'
    );
    await waitFor(() => expect(toggle().props.value).toBe(true));
  });
});
