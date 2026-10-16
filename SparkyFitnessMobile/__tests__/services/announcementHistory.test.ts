import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  getAnnouncementHistory,
  recordMobileAnnouncement,
} from '../../src/services/announcementHistory';

jest.mock('../../src/services/LogService', () => ({
  addLog: jest.fn(),
}));

const announcement = (overrides: Record<string, unknown> = {}) => ({
  id: 'mobile-1',
  active: true,
  app: 'mobile',
  title: 'New in the app',
  message: 'Body',
  publishedAt: '2026-10-16T00:00:00.000Z',
  ...overrides,
});

describe('announcementHistory', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  test('stores active mobile announcements newest first', async () => {
    await recordMobileAnnouncement(announcement());
    await recordMobileAnnouncement(announcement({ id: 'mobile-2' }));
    const history = await getAnnouncementHistory();
    expect(history.map((e) => e.id)).toEqual(['mobile-2', 'mobile-1']);
  });

  test('ignores announcements that are not marked mobile or not active', async () => {
    await recordMobileAnnouncement(announcement({ app: undefined }));
    await recordMobileAnnouncement(announcement({ app: 'web' }));
    await recordMobileAnnouncement(announcement({ active: false }));
    await expect(getAnnouncementHistory()).resolves.toEqual([]);
  });

  test('refreshes an existing id instead of duplicating it', async () => {
    await recordMobileAnnouncement(announcement());
    await recordMobileAnnouncement(announcement({ message: 'Edited' }));
    const history = await getAnnouncementHistory();
    expect(history).toHaveLength(1);
    expect(history[0].message).toBe('Edited');
  });

  test('returns an empty list for corrupt storage', async () => {
    await AsyncStorage.setItem('@WhatsNew:announcementHistory', '{nope');
    await expect(getAnnouncementHistory()).resolves.toEqual([]);
  });
});
