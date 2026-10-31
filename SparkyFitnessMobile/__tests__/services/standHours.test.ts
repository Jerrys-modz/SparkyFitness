import { queryCategorySamples } from '@kingstinct/react-native-healthkit';
import { readStandHours } from '../../src/services/standHours.ios';

const mockQuery = queryCategorySamples as jest.Mock;

describe('readStandHours', () => {
  beforeEach(() => mockQuery.mockReset());

  it('asks for stand-hour samples across the day and counts hours stood in', async () => {
    mockQuery.mockResolvedValue([
      { value: 0, startDate: '2026-10-31T08:00:00Z' },
      { value: 1, startDate: '2026-10-31T09:00:00Z' },
      { value: 0, startDate: '2026-10-31T10:00:00Z' },
    ]);

    await expect(readStandHours('2026-10-31')).resolves.toBe(2);

    const [identifier, options] = mockQuery.mock.calls[0];
    expect(identifier).toBe('HKCategoryTypeIdentifierAppleStandHour');
    const { startDate, endDate } = options.filter.date;
    expect(endDate.getTime() - startDate.getTime()).toBeGreaterThanOrEqual(
      23 * 3_600_000
    );
  });
});
