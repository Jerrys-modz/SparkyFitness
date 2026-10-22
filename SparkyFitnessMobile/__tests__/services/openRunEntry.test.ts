import { openRunEntry } from '../../src/services/openRunEntry';
import { fetchExerciseEntry } from '../../src/services/api/exerciseStatsApi';
import { cardioSessionFromDiaryEntry } from '../../src/utils/cardioSession';

jest.mock('../../src/services/api/exerciseStatsApi', () => ({
  fetchExerciseEntry: jest.fn(),
}));
jest.mock('../../src/utils/cardioSession', () => ({
  cardioSessionFromDiaryEntry: jest.fn(),
}));

const navigate = jest.fn();
const navigation = { navigate } as unknown as Parameters<
  typeof openRunEntry
>[0];

beforeEach(() => jest.clearAllMocks());

describe('openRunEntry', () => {
  it('opens the cardio session when the entry can be shown as one', async () => {
    jest.mocked(fetchExerciseEntry).mockResolvedValue({
      id: 'e1',
      exercise_snapshot: { name: 'Morning run' },
    } as never);
    jest.mocked(cardioSessionFromDiaryEntry).mockReturnValue({
      id: 'e1',
    } as never);
    await openRunEntry(navigation, 'e1', 'km');
    expect(cardioSessionFromDiaryEntry).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'e1', name: 'Morning run' }),
      'km',
      { allowInApp: true }
    );
    expect(navigate).toHaveBeenCalledWith(
      'CardioSession',
      expect.objectContaining({ distanceUnit: 'km' })
    );
  });

  it('falls back to the activity detail otherwise', async () => {
    jest.mocked(fetchExerciseEntry).mockResolvedValue({ id: 'e2' } as never);
    jest.mocked(cardioSessionFromDiaryEntry).mockReturnValue(null);
    await openRunEntry(navigation, 'e2', 'miles');
    expect(navigate).toHaveBeenCalledWith('ActivityDetail', {
      session: expect.objectContaining({ id: 'e2', name: null }),
    });
  });

  it('rejects when the entry cannot be loaded', async () => {
    jest.mocked(fetchExerciseEntry).mockRejectedValue(new Error('gone'));
    await expect(openRunEntry(navigation, 'e3', 'km')).rejects.toThrow('gone');
    expect(navigate).not.toHaveBeenCalled();
  });
});
