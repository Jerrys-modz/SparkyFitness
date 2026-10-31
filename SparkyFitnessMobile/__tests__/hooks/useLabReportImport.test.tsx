import { renderHook, waitFor } from '@testing-library/react-native';
import {
  useImportLabReport,
  useScanLabReport,
} from '../../src/hooks/useLabReportImport';
import {
  importLabReport,
  scanLabReport,
} from '../../src/services/api/labReportApi';
import { createQueryWrapper, createTestQueryClient } from './queryTestUtils';

jest.mock('../../src/services/api/labReportApi', () => ({
  importLabReport: jest.fn(),
  scanLabReport: jest.fn(),
}));

const body = {
  lab_name: 'Quest',
  entry_date: '2026-09-12',
  results: [
    {
      marker_key: 'hba1c',
      value_numeric: 5.1,
      unit: '%',
      ref_range_low: 4.8,
      ref_range_high: 5.6,
    },
  ],
};

describe('useScanLabReport', () => {
  beforeEach(() => jest.clearAllMocks());

  it('reads a report and saves nothing', async () => {
    jest.mocked(scanLabReport).mockResolvedValue({ report: {} } as never);
    const { result } = renderHook(() => useScanLabReport(), {
      wrapper: createQueryWrapper(createTestQueryClient()),
    });

    result.current.mutate({ document: 'AAA', mimeType: 'application/pdf' });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(scanLabReport).toHaveBeenCalledWith('AAA', 'application/pdf');
    expect(importLabReport).not.toHaveBeenCalled();
  });
});

describe('useImportLabReport', () => {
  beforeEach(() => jest.clearAllMocks());

  it('saves the whole report in one call and refreshes the lab caches', async () => {
    jest
      .mocked(importLabReport)
      .mockResolvedValue({ report: { id: 'rep-1' }, results: [] } as never);
    const queryClient = createTestQueryClient();
    const invalidate = jest.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() => useImportLabReport(), {
      wrapper: createQueryWrapper(queryClient),
    });

    result.current.mutate(body);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(importLabReport).toHaveBeenCalledTimes(1);
    expect(importLabReport).toHaveBeenCalledWith(body);
    const keys = invalidate.mock.calls.map((call) => call[0]?.queryKey?.[0]);
    expect(keys).toEqual(
      expect.arrayContaining(['labMarkers', 'labLatest', 'labHistory'])
    );
  });

  it('reports a failure without refreshing anything', async () => {
    jest.mocked(importLabReport).mockRejectedValue(new Error('boom'));
    const queryClient = createTestQueryClient();
    const invalidate = jest.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() => useImportLabReport(), {
      wrapper: createQueryWrapper(queryClient),
    });

    result.current.mutate(body);

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(invalidate).not.toHaveBeenCalled();
  });
});
