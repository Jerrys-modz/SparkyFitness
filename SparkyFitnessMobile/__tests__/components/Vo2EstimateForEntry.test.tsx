import React from 'react';
import { render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import Vo2EstimateForEntry from '../../src/components/Vo2EstimateForEntry';
import { fetchExerciseEntry } from '../../src/services/api/exerciseStatsApi';
import { initializeI18n } from '../../src/localization/i18n';

jest.mock('../../src/services/api/exerciseStatsApi');
jest.mock('../../src/services/api/exerciseApi');
jest.mock('../../src/services/LogService', () => ({ addLog: jest.fn() }));

const mockedFetch = jest.mocked(fetchExerciseEntry);

const renderFor = (isRun: boolean) => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <Vo2EstimateForEntry exerciseEntryId="entry-1" isRun={isRun} />
    </QueryClientProvider>
  );
};

const toggle = () => screen.getByLabelText('Use in VO2 max estimate');

beforeAll(async () => {
  await initializeI18n();
});

beforeEach(() => {
  jest.clearAllMocks();
});

describe('Vo2EstimateForEntry', () => {
  it('shows the switch on for a run that counts', async () => {
    mockedFetch.mockResolvedValue({
      exclude_from_vo2_estimate: false,
    } as never);
    renderFor(true);
    await waitFor(() => expect(toggle().props.value).toBe(true));
  });

  it('shows the switch off for a run that was left out', async () => {
    mockedFetch.mockResolvedValue({
      exclude_from_vo2_estimate: true,
    } as never);
    renderFor(true);
    await waitFor(() => expect(toggle().props.value).toBe(false));
  });

  it('treats an entry from an older server (no field) as counting', async () => {
    mockedFetch.mockResolvedValue({} as never);
    renderFor(true);
    await waitFor(() => expect(toggle().props.value).toBe(true));
  });

  it('shows nothing, and asks for nothing, for a ride', async () => {
    mockedFetch.mockResolvedValue({} as never);
    renderFor(false);
    expect(screen.queryByTestId('vo2-estimate-card')).toBeNull();
    expect(mockedFetch).not.toHaveBeenCalled();
  });

  it('shows nothing until the entry has loaded', () => {
    mockedFetch.mockReturnValue(new Promise(() => {}));
    renderFor(true);
    expect(screen.queryByTestId('vo2-estimate-card')).toBeNull();
  });
});
