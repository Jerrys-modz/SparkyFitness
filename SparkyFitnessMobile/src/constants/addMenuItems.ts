import type { IconName } from '../components/Icon';

/**
 * Everything the + sheet can offer, in the order it shipped with: the four
 * cards, then the rows. Any item can sit in one of the four card slots
 * (`addMenuCards`) or in the rows below them. A saved order is reconciled
 * against this array (`resolveKeyOrder`), so an item added later shows up, at
 * the end, for users who already arranged theirs. Exercise opens its own
 * sub-menu wherever it sits.
 */
export const ADD_MENU_ITEM_KEYS = [
  'food',
  'exercise',
  'measurements',
  'scanFood',
  'progressPhotos',
  'wellness',
  'symptoms',
  'mood',
  'mindfulness',
  'askSparky',
  'syncHealth',
] as const;

export type AddMenuItemKey = (typeof ADD_MENU_ITEM_KEYS)[number];

/** How many big cards the sheet has room for: two rows of two. */
export const ADD_MENU_CARD_COUNT = 4;

/** The cards the sheet shipped with. */
export const DEFAULT_ADD_MENU_CARDS: AddMenuItemKey[] = [
  'food',
  'exercise',
  'measurements',
  'scanFood',
];

type Translator = (key: string, options: { defaultValue: string }) => string;

/**
 * A row's name as the sheet and its settings screen show it. Resolvers rather
 * than key strings because the i18n audit needs the literal key at the call
 * site; a total record so a row added without a name is a compile error.
 */
export const ADD_MENU_ITEM_LABELS: Record<
  AddMenuItemKey,
  (t: Translator) => string
> = {
  food: (t) => t('addSheet.food', { defaultValue: 'Food' }),
  exercise: (t) => t('addSheet.exercise', { defaultValue: 'Exercise' }),
  measurements: (t) =>
    t('addSheet.measurements', { defaultValue: 'Measurements' }),
  scanFood: (t) => t('addSheet.scanFood', { defaultValue: 'Scan Food' }),
  progressPhotos: (t) =>
    t('addSheet.progressPhotos', { defaultValue: 'Progress Photos' }),
  wellness: (t) => t('addSheet.wellness', { defaultValue: 'Wellness' }),
  symptoms: (t) => t('addSheet.symptoms', { defaultValue: 'Symptoms' }),
  mood: (t) => t('addSheet.mood', { defaultValue: 'Mood' }),
  mindfulness: (t) =>
    t('addSheet.mindfulness', { defaultValue: 'Mindfulness' }),
  askSparky: (t) => t('addSheet.askSparky', { defaultValue: 'Ask Sparky' }),
  syncHealth: (t) =>
    t('addSheet.syncHealth', { defaultValue: 'Sync Health Data' }),
};

/** Each item's icon, on a card and in a row. */
export const ADD_MENU_ITEM_ICONS: Record<AddMenuItemKey, IconName> = {
  food: 'food',
  exercise: 'exercise-weights',
  measurements: 'measurements',
  scanFood: 'scan',
  progressPhotos: 'camera',
  wellness: 'wellness-filled',
  symptoms: 'symptoms',
  mood: 'mood',
  mindfulness: 'exercise-yoga',
  askSparky: 'sparkles',
  syncHealth: 'sync',
};
