import { useSyncExternalStore } from 'react';

/**
 * Whether the Diary shows Sparky's daily summary (#2013). Browser-local, like
 * the mobile app's Dashboard card switches, and off until the person turns it
 * on: showing the card sends a request to their AI service.
 */
const STORAGE_KEY = 'sparky.dailySummaryCard.v1';

const listeners = new Set<() => void>();

function read(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'on';
  } catch {
    return false;
  }
}

export function setSparkySummaryCardEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEY, enabled ? 'on' : 'off');
  } catch {
    // Storage can be unavailable (private mode); the card then stays off.
  }
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useSparkySummaryCardEnabled(): boolean {
  return useSyncExternalStore(subscribe, read, () => false);
}
