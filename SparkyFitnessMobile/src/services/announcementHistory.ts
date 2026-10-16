import AsyncStorage from '@react-native-async-storage/async-storage';
import { addLog } from './LogService';

// Past announcements about the mobile app, kept on the device so What's New can
// show them after the popup is dismissed. The server marks these with the
// `app: mobile` frontmatter field in announcement.md; anything else (web,
// project notices) is never stored.
const HISTORY_KEY = '@WhatsNew:announcementHistory';
const MAX_HISTORY = 30;

export type AnnouncementHistoryEntry = {
  id: string;
  title: string;
  message: string;
  publishedAt?: string;
};

export type IncomingAnnouncement = AnnouncementHistoryEntry & {
  active: boolean;
  app?: string;
};

function isHistoryEntry(value: unknown): value is AnnouncementHistoryEntry {
  if (typeof value !== 'object' || value === null) return false;
  const entry = value as Record<string, unknown>;
  return (
    typeof entry.id === 'string' &&
    typeof entry.title === 'string' &&
    typeof entry.message === 'string' &&
    (entry.publishedAt === undefined || typeof entry.publishedAt === 'string')
  );
}

export async function getAnnouncementHistory(): Promise<
  AnnouncementHistoryEntry[]
> {
  try {
    const raw = await AsyncStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isHistoryEntry) : [];
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    addLog(
      `[WhatsNew Announcements] Failed to read history: ${message}`,
      'WARNING'
    );
    return [];
  }
}

// Stores an active mobile announcement, newest first, one entry per id. An id
// that is already stored is refreshed in place so edited text replaces the old.
export async function recordMobileAnnouncement(
  announcement: IncomingAnnouncement
): Promise<void> {
  if (
    !announcement.active ||
    announcement.app !== 'mobile' ||
    !announcement.id
  ) {
    return;
  }
  try {
    const existing = await getAnnouncementHistory();
    const entry: AnnouncementHistoryEntry = {
      id: announcement.id,
      title: announcement.title,
      message: announcement.message,
      publishedAt: announcement.publishedAt,
    };
    const next = [entry, ...existing.filter((e) => e.id !== entry.id)].slice(
      0,
      MAX_HISTORY
    );
    await AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(next));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    addLog(
      `[WhatsNew Announcements] Failed to save announcement: ${message}`,
      'WARNING'
    );
  }
}
