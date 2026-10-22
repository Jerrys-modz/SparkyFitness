import { linkEntryToRoute } from '../../src/services/routeLink';
import { attachExerciseEntryRoute } from '../../src/services/api/routeApi';
import { ApiError } from '../../src/services/api/errors';
import { addLog } from '../../src/services/LogService';

jest.mock('../../src/services/api/routeApi', () => ({
  attachExerciseEntryRoute: jest.fn(),
}));
jest.mock('../../src/services/LogService', () => ({ addLog: jest.fn() }));

beforeEach(() => jest.clearAllMocks());

describe('linkEntryToRoute', () => {
  it('links the entry to the route', async () => {
    jest.mocked(attachExerciseEntryRoute).mockResolvedValue(undefined);
    await linkEntryToRoute('e1', 'r1');
    expect(attachExerciseEntryRoute).toHaveBeenCalledWith('e1', 'r1');
  });

  it('skips a route that no longer exists', async () => {
    jest
      .mocked(attachExerciseEntryRoute)
      .mockRejectedValue(new ApiError('Not found', 404));
    await expect(linkEntryToRoute('e1', 'r1')).resolves.toBeUndefined();
    expect(addLog).toHaveBeenCalledWith(
      expect.stringContaining('route r1 is gone'),
      'WARNING'
    );
  });

  it('throws other failures so the caller retries', async () => {
    jest
      .mocked(attachExerciseEntryRoute)
      .mockRejectedValue(new ApiError('Server error', 500));
    await expect(linkEntryToRoute('e1', 'r1')).rejects.toThrow('Server error');
  });
});
