import type { CoachingCheckInResponse } from '@workspace/shared';

export const coachingCheckInFixture = (
  overrides: Partial<CoachingCheckInResponse> = {}
): CoachingCheckInResponse => ({
  asOf: '2026-10-17',
  reason: 'behind',
  dataQuality: {
    windowDays: 28,
    loggedDays: 24,
    excludedDays: 1,
    weighIns: 20,
    outlierWeighIns: 1,
    weighInSpanDays: 27,
    adherence: 0.86,
    missingLoggedDays: 0,
    missingWeighIns: 0,
    missingSpanDays: 0,
    ready: true,
  },
  trend: {
    series: [
      { date: '2026-10-10', weightKg: 80.4, trendKg: 80.2, outlier: false },
      { date: '2026-10-12', weightKg: 84, trendKg: 80.2, outlier: true },
      { date: '2026-10-17', weightKg: 80, trendKg: 80.1, outlier: false },
    ],
    currentKg: 80.1,
    weeklyRateKg: -0.1,
  },
  expenditure: {
    kcal: 2300,
    rawKcal: 2310,
    avgIntakeKcal: 2100,
    marginKcal: 120,
    history: [
      { date: '2026-10-03', kcal: 2250, smoothedKcal: 2250 },
      { date: '2026-10-10', kcal: 2290, smoothedKcal: 2270 },
      { date: '2026-10-17', kcal: 2310, smoothedKcal: 2290 },
    ],
  },
  goal: { direction: 'lose', rateKgPerWeek: 0.5, targetWeeklyChangeKg: -0.5 },
  current: { calories: 2000, protein: 150, carbs: 200, fat: 55 },
  suggested: { calories: 1800, protein: 140, carbs: 180, fat: 50 },
  changeKcal: -200,
  limits: ['weekly-cap'],
  proteinFloorApplied: false,
  actionable: true,
  settings: { direction: 'lose', rateKgPerWeek: 0.5, checkInWeekday: 0 },
  goalManagedBySettings: false,
  checkInDue: false,
  ...overrides,
});
