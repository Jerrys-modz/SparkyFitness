import type { ChatToolCategorySlug } from '@workspace/shared';

// English fallbacks kept inline (2nd arg) so the control is readable before the
// translation keys land in every locale, matching the repo's inline-fallback
// convention for translated strings.
export const CATEGORY_LABELS: Record<ChatToolCategorySlug, [string, string]> = {
  food: ['chat.toolCategories.food', 'Food & Water'],
  exercise: ['chat.toolCategories.exercise', 'Exercise'],
  checkin: ['chat.toolCategories.checkin', 'Body & Check-ins'],
  goals: ['chat.toolCategories.goals', 'Goals'],
  reports: ['chat.toolCategories.reports', 'Reports & Analytics'],
  coaching: ['chat.toolCategories.coaching', 'Coaching'],
  vision: ['chat.toolCategories.vision', 'Vision'],
  profile: ['chat.toolCategories.profile', 'Profile & Habits'],
  medications: ['chat.toolCategories.medications', 'Medications'],
};
