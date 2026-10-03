import { create } from 'zustand';

export type ChatTraceKind = 'prompt' | 'tool' | 'reply' | 'error';

export interface ChatTraceEvent {
  at: number;
  kind: ChatTraceKind;
  text: string;
}

export const MAX_TRACE_EVENTS = 100;

interface ChatDebugState {
  events: ChatTraceEvent[];
  add: (kind: ChatTraceKind, text: string) => void;
  clear: () => void;
}

/** In memory only: a scratch log for tuning on-device chat. */
export const useOnDeviceChatDebugStore = create<ChatDebugState>((set) => ({
  events: [],
  add: (kind, text) =>
    set((state) => ({
      events: [...state.events, { at: Date.now(), kind, text }].slice(
        -MAX_TRACE_EVENTS
      ),
    })),
  clear: () => set({ events: [] }),
}));

export function formatTrace(events: ChatTraceEvent[]): string {
  return events
    .map((e) => {
      const time = new Date(e.at).toISOString().slice(11, 23);
      return `[${time}] ${e.kind.toUpperCase()} ${e.text}`;
    })
    .join('\n');
}
