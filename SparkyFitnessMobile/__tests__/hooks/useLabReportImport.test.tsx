import { renderHook, waitFor } from '@testing-library/react-native';
import { useImportLabResults } from '../../src/hooks/useLabReportImport';
import { saveLabResult } from '../../src/services/labResultsService';
import { createQueryWrapper, createTestQueryClient } from './queryTestUtils';

jest.mock('../../src/services/api/labReportApi', () => ({
  scanLabReport: jest.fn(),
}));
jest.mock('../../src/services/labResultsService', () => ({
  saveLabResult: jest.fn(),
}));
jest.mock('../../src/hooks/refreshHealthSyncCache', () => ({
  refreshHealthSyncCache: jest.fn(),
}));

const input = (categoryId: string) => ({
  target: { categoryId },
  value: 1,
  date: '2026-09-20',
});

describe('useImportLabResults', () => {
  beforeEach(() => jest.clearAllMocks());

  it('saves every row in order and reports the count', async () => {
    jest.mocked(saveLabResult).mockResolvedValue({} as never);
    const { result } = renderHook(() => useImportLabResults(), {
      wrapper: createQueryWrapper(createTestQueryClient()),
    });

    result.current.mutate([
      { name: 'HbA1c', input: input('a') },
      { name: 'LDL', input: input('b') },
    ]);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({ saved: 2, failed: [] });
    expect(
      jest.mocked(saveLabResult).mock.calls.map(([arg]) => arg.target)
    ).toEqual([{ categoryId: 'a' }, { categoryId: 'b' }]);
  });

  it('keeps going after a failure and names what failed', async () => {
    jest
      .mocked(saveLabResult)
      .mockRejectedValueOnce(new Error('exists'))
      .mockResolvedValueOnce({} as never);
    const { result } = renderHook(() => useImportLabResults(), {
      wrapper: createQueryWrapper(createTestQueryClient()),
    });

    result.current.mutate([
      { name: 'HbA1c', input: input('a') },
      { name: 'LDL', input: input('b') },
    ]);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({ saved: 1, failed: ['HbA1c'] });
  });
});
