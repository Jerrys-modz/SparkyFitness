import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  MAX_WIDGET_LAYOUTS,
  defaultStyleForFamily,
  normalizeWidgetLayout,
  parseStoredWidgetLayouts,
  type WidgetFamily,
  type WidgetLayout,
  type WidgetLayoutInput,
} from '@workspace/shared';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { newUuid } from '../utils/ids';

interface WidgetLayoutState {
  layouts: WidgetLayout[];
  /** Adds a layout and returns its id, or null when the list is full. */
  addLayout: (input: Omit<WidgetLayoutInput, 'id'>) => string | null;
  /** Replaces a layout, keeping its id. A missing id is ignored. */
  updateLayout: (id: string, input: Omit<WidgetLayoutInput, 'id'>) => void;
  duplicateLayout: (id: string, name: string) => string | null;
  deleteLayout: (id: string) => void;
}

/** What "New widget" starts from: a small ring of calories left. */
export function newWidgetLayoutDraft(
  family: WidgetFamily = 'small'
): Omit<WidgetLayoutInput, 'id'> {
  return {
    name: '',
    family,
    style: defaultStyleForFamily(family),
    metrics: [{ metric: 'calories_remaining' }],
  };
}

/**
 * The widgets a person built in the app. Device-local: a widget lives on this
 * phone's Home Screen, so layouts are not synced to the server. The list is
 * mirrored to the iOS app group by `useWidgetSync`, where the one generic
 * custom widget reads it.
 */
export const useWidgetLayoutStore = create<WidgetLayoutState>()(
  persist(
    (set, get) => ({
      layouts: [],
      addLayout: (input) => {
        if (get().layouts.length >= MAX_WIDGET_LAYOUTS) return null;
        const id = newUuid();
        const layout = normalizeWidgetLayout({
          ...input,
          id,
          updatedAt: Date.now(),
        });
        set((state) => ({ layouts: [...state.layouts, layout] }));
        return id;
      },
      updateLayout: (id, input) =>
        set((state) => {
          if (!state.layouts.some((l) => l.id === id)) return state;
          const layout = normalizeWidgetLayout({
            ...input,
            id,
            updatedAt: Date.now(),
          });
          return {
            layouts: state.layouts.map((l) => (l.id === id ? layout : l)),
          };
        }),
      duplicateLayout: (id, name) => {
        const source = get().layouts.find((l) => l.id === id);
        if (!source || get().layouts.length >= MAX_WIDGET_LAYOUTS) return null;
        return get().addLayout({ ...source, name });
      },
      deleteLayout: (id) =>
        set((state) => ({ layouts: state.layouts.filter((l) => l.id !== id) })),
    }),
    {
      name: '@SparkyFitness/widget-layouts',
      storage: createJSONStorage(() => AsyncStorage),
      version: 1,
      partialize: (state) => ({ layouts: state.layouts }),
      // A layout this build cannot read (written by a newer app) is dropped
      // rather than crashing hydration.
      merge: (persisted, current) => ({
        ...current,
        layouts: parseStoredWidgetLayouts(
          (persisted as { layouts?: unknown } | undefined)?.layouts
        ),
      }),
    }
  )
);
