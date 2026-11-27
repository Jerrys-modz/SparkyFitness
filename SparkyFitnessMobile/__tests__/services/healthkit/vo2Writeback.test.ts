import {
  saveQuantitySample,
  deleteObjects,
  queryQuantitySamples,
} from '@kingstinct/react-native-healthkit';
import {
  loadHealthPreference,
  saveHealthPreference,
} from '../../../src/services/healthkit/preferences';
import { writeVo2MaxForDate } from '../../../src/services/healthkit/vo2Writeback';
import { isOwnWrittenVo2Sample } from '../../../src/services/healthkit/dataTransformation';

jest.mock('@kingstinct/react-native-healthkit', () => ({
  saveQuantitySample: jest.fn(),
  deleteObjects: jest.fn().mockResolvedValue(1),
  queryQuantitySamples: jest.fn().mockResolvedValue([]),
}));
jest.mock('../../../src/services/healthkit/preferences', () => ({
  loadHealthPreference: jest.fn(),
  saveHealthPreference: jest.fn(),
}));
jest.mock('../../../src/services/LogService', () => ({ addLog: jest.fn() }));

const mockSave = saveQuantitySample as jest.Mock;
const mockDelete = deleteObjects as jest.Mock;
const mockQuery = queryQuantitySamples as jest.Mock;

let store: Record<string, unknown> = {};
let uuid = 0;
beforeEach(() => {
  jest.clearAllMocks();
  store = {};
  uuid = 0;
  (loadHealthPreference as jest.Mock).mockImplementation((key: string) =>
    Promise.resolve(key in store ? store[key] : null)
  );
  (saveHealthPreference as jest.Mock).mockImplementation(
    (key: string, value: unknown) => {
      store[key] = value;
      return Promise.resolve();
    }
  );
  mockSave.mockImplementation(() => Promise.resolve({ uuid: `u${++uuid}` }));
  mockQuery.mockResolvedValue([]);
  mockDelete.mockResolvedValue(1);
});

const DATE = '2026-06-01';
const AFTER = new Date(2026, 5, 2, 9);
const MORNING = new Date(2026, 5, 1, 9);
const NOON = new Date(2026, 5, 1, 12);

describe('isOwnWrittenVo2Sample', () => {
  it('matches by metadata key, not by bundle id', () => {
    expect(
      isOwnWrittenVo2Sample({ metadata: { SparkyVo2MaxWriteback: 'x' } })
    ).toBe(true);
    expect(isOwnWrittenVo2Sample({ metadata: { HKWasUserEntered: 1 } })).toBe(
      false
    );
    expect(isOwnWrittenVo2Sample({})).toBe(false);
  });
});

describe('writeVo2MaxForDate', () => {
  it('saves the estimate in ml/(kg*min) with the marker, once', async () => {
    await writeVo2MaxForDate(DATE, 47.5, 1, AFTER);
    expect(mockSave).toHaveBeenCalledWith(
      'HKQuantityTypeIdentifierVO2Max',
      'ml/(kg*min)',
      47.5,
      NOON,
      NOON,
      { SparkyVo2MaxWriteback: `${DATE}-1` }
    );
    expect(store[`writebackVo2MaxUuids:${DATE}`]).toEqual(['u1']);

    await writeVo2MaxForDate(DATE, 47.5, 2, AFTER);
    expect(mockSave).toHaveBeenCalledTimes(1);
  });

  it('waits for noon on the day itself', async () => {
    await writeVo2MaxForDate(DATE, 47.5, 1, MORNING);
    expect(mockSave).not.toHaveBeenCalled();
  });

  it('replaces the sample when the estimate changes', async () => {
    await writeVo2MaxForDate(DATE, 47.5, 1, AFTER);
    await writeVo2MaxForDate(DATE, 48.1, 2, AFTER);
    expect(mockDelete).toHaveBeenCalledWith('HKQuantityTypeIdentifierVO2Max', {
      uuids: ['u1'],
    });
    expect(store[`writebackVo2MaxUuids:${DATE}`]).toEqual(['u2']);
  });

  it('removes the sample when the day no longer has an estimate', async () => {
    await writeVo2MaxForDate(DATE, 47.5, 1, AFTER);
    await writeVo2MaxForDate(DATE, null, 2, AFTER);
    expect(mockDelete).toHaveBeenCalledTimes(1);
    expect(mockSave).toHaveBeenCalledTimes(1);
    expect(store[`writebackVo2MaxUuids:${DATE}`]).toEqual([]);
  });

  it('keeps the old sample and signature when deleting it fails', async () => {
    await writeVo2MaxForDate(DATE, 47.5, 1, AFTER);
    mockDelete.mockRejectedValueOnce(new Error('locked'));
    await writeVo2MaxForDate(DATE, 48.1, 2, AFTER);
    expect(mockSave).toHaveBeenCalledTimes(1);
    expect(store[`writebackVo2MaxUuids:${DATE}`]).toEqual(['u1']);
    expect(store[`writebackVo2MaxSig:${DATE}`]).toBe('');
  });

  it('leaves a day alone when another app has a reading on it', async () => {
    mockQuery.mockResolvedValue([{ quantity: 52, metadata: {} }]);
    await writeVo2MaxForDate(DATE, 47.5, 1, AFTER);
    expect(mockSave).not.toHaveBeenCalled();
  });

  it('does not count its own samples as another app', async () => {
    mockQuery.mockResolvedValue([
      { quantity: 47.5, metadata: { SparkyVo2MaxWriteback: 'x' } },
    ]);
    await writeVo2MaxForDate(DATE, 47.5, 1, AFTER);
    expect(mockSave).toHaveBeenCalledTimes(1);
  });

  it('saves anyway when the read of other readings fails', async () => {
    mockQuery.mockRejectedValue(new Error('denied'));
    await writeVo2MaxForDate(DATE, 47.5, 1, AFTER);
    expect(mockSave).toHaveBeenCalledTimes(1);
  });
});
