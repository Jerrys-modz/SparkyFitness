/** The dates of a weekly goal plan, as 'YYYY-MM-DD' strings. */
export interface WeeklyGoalPlanDates {
  start_date: string;
  /** null for a plan with no end date. */
  end_date: string | null;
}

/** Whether `day` ('YYYY-MM-DD') falls within the plan's dates. */
export function weeklyGoalPlanCovers(
  plan: WeeklyGoalPlanDates,
  day: string
): boolean {
  return (
    plan.start_date.slice(0, 10) <= day &&
    (plan.end_date === null || plan.end_date.slice(0, 10) >= day)
  );
}
