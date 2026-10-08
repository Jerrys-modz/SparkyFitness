/**
 * The rows under the four cards in the + sheet, in the order the sheet shipped
 * with. A saved order is reconciled against this array (`resolveKeyOrder`), so
 * a row added later shows up, at the end, for users who already arranged theirs.
 * The four cards (Food, Exercise, Measurements, Scan Food) are not here: they
 * stay put, and Exercise opens its own sub-menu.
 */
export const ADD_MENU_ITEM_KEYS = [
  'recordActivity',
  'progressPhotos',
  'wellness',
  'symptoms',
  'mood',
  'mindfulness',
  'askSparky',
  'syncHealth',
] as const;

export type AddMenuItemKey = (typeof ADD_MENU_ITEM_KEYS)[number];

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
  recordActivity: (t) =>
    t('addSheet.recordActivity', { defaultValue: 'Record Activity' }),
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
