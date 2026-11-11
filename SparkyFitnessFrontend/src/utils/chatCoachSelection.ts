import { useSyncExternalStore } from 'react';
import { rotateAllChatConversationIds } from '@/utils/chatConversationId';

/**
 * The coach the chat runs as in this browser (#2013): a built-in coach id
 * (`builtin:recovery`), the id of one of the person's own coaches, or null for
 * plain Sparky. Browser-local, like the chat's tool selection. The server
 * ignores an id that names no coach, so a stale value is harmless.
 */
const STORAGE_KEY = 'sparky.chatCoach.v1';

const listeners = new Set<() => void>();

export function getSelectedCoachId(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY) || null;
  } catch {
    return null;
  }
}

export function setSelectedCoachId(coachId: string | null): void {
  if (coachId === getSelectedCoachId()) return;
  try {
    if (coachId) localStorage.setItem(STORAGE_KEY, coachId);
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Storage can be unavailable (private mode); the chat stays on Sparky.
  }
  // A coach changes the system prompt, so the next message starts a new
  // provider session instead of extending the previous coach's.
  rotateAllChatConversationIds();
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useSelectedCoachId(): string | null {
  return useSyncExternalStore(subscribe, getSelectedCoachId, () => null);
}
