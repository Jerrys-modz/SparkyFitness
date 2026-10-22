import { renderHook, waitFor } from '@testing-library/react-native';
import {
  useDeleteImportedLabResults,
  useDeleteLabMarker,
  useSaveLabResult,
} from '../../src/hooks/useLabResults';
import {
  deleteImportedLabResults,
  deleteLabMarker,
} from '../../src/services/api/labReportApi';
import {
  createCustomCategory,
  saveCustomMeasurement,
} from '../../src/services/api/measurementsApi';
import { createQueryWrapper, createTestQueryClient } from './queryTestUtils';

jest.mock('../../src/services/api/measurementsApi', () => ({
  updateCustomCategory: jest.fn(),
  createCustomCategory: jest.fn(),
  deleteCustomMeasurement: jest.fn(),
  fetchCustomMeasurementsRange: jest.fn(),
  saveCustomMeasurement: jest.fn(),
}));
jest.mock('../../src/services/api/labReportApi', () => ({
  deleteImportedLabResults: jest.fn(),
  deleteLabMarker: jest.fn(),
}));
jest.mock('../../src/hooks/refreshHealthSyncCache', () => ({
  refreshHealthSyncCache: jest.fn(),
}));

const newMarker = {
  name: 'hba1c',
  display_name: 'HbA1c',
  measurement_type: '%',
  ref_range_low: 4,
  ref_range_high: 5.6,
};

const renderSave = () =>
  renderHook(() => useSaveLabResult(), {
    wrapper: createQueryWrapper(createTestQueryClient()),
  });

describe('useSaveLabResult', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest
      .mocked(saveCustomMeasurement)
      .mockResolvedValue({ id: 'entry-1' } as never);
  });

  it('creates a flagged lab category first when the marker is new', async () => {
    jest
      .mocked(createCustomCategory)
      .mockResolvedValue({ id: 'cat-9' } as never);
    const { result } = renderSave();

    result.current.mutate({
      target: { newMarker },
      value: 5.4,
      date: '2026-09-20',
      notes: ' fasting ',
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(createCustomCategory).toHaveBeenCalledWith({
      name: 'hba1c',
      display_name: 'HbA1c',
      measurement_type: '%',
      frequency: 'Daily',
      data_type: 'numeric',
      is_lab: true,
      ref_range_low: 4,
      ref_range_high: 5.6,
    });
    expect(saveCustomMeasurement).toHaveBeenCalledWith({
      category_id: 'cat-9',
      value: 5.4,
      entry_date: '2026-09-20',
      notes: 'fasting',
      source: 'manual',
    });
  });

  it('saves straight to an existing marker without creating a category', async () => {
    const { result } = renderSave();

    result.current.mutate({
      target: { categoryId: 'cat-1' },
      value: 120,
      date: '2026-09-20',
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(createCustomCategory).not.toHaveBeenCalled();
    expect(saveCustomMeasurement).toHaveBeenCalledWith(
      expect.objectContaining({ category_id: 'cat-1', notes: undefined })
    );
  });

  it('does not save a result when creating the category fails', async () => {
    jest.mocked(createCustomCategory).mockRejectedValue(new Error('exists'));
    const { result } = renderSave();

    result.current.mutate({
      target: { newMarker },
      value: 5.4,
      date: '2026-09-20',
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(saveCustomMeasurement).not.toHaveBeenCalled();
  });
});

describe('lab deletes', () => {
  beforeEach(() => jest.clearAllMocks());

  it('deletes the imported results and reports how many went', async () => {
    jest
      .mocked(deleteImportedLabResults)
      .mockResolvedValue({ results: 12, markers: 3 });
    const { result } = renderHook(() => useDeleteImportedLabResults(), {
      wrapper: createQueryWrapper(createTestQueryClient()),
    });

    result.current.mutate();

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({ results: 12, markers: 3 });
  });

  it('deletes one marker by id', async () => {
    jest.mocked(deleteLabMarker).mockResolvedValue({ results: 4 });
    const { result } = renderHook(() => useDeleteLabMarker(), {
      wrapper: createQueryWrapper(createTestQueryClient()),
    });

    result.current.mutate('cat-9');

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(deleteLabMarker).toHaveBeenCalledWith('cat-9');
  });
});
