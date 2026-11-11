export const chatbotKeys = {
  all: ['chatbot'] as const,
  // One thread per coach; null is plain Sparky's.
  history: (autoClearSetting: string, coachId: string | null = null) =>
    [
      ...chatbotKeys.all,
      'history',
      autoClearSetting,
      coachId ?? 'sparky',
    ] as const,
  preferences: () => [...chatbotKeys.all, 'preferences'] as const,
  todaysNutrition: (date: string) =>
    [...chatbotKeys.all, 'todaysNutrition', date] as const,
};
