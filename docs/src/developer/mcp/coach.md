---
title: Coaching and Trends Tool
description: Provides health summaries and analyzes long-term trends for coaching insights.
---

# Coaching and Trends Tools

The coaching tools are designed to provide high-level insights into a user's health status and long-term trends. It aggregates data from various sources (food, exercise, check-ins) to offer summaries and identify patterns relevant for health coaching.

**Tool Names:** `sparky_get_health_summary`, `sparky_analyze_trends`, `sparky_get_30_day_trends`, `sparky_detect_patterns`, `sparky_generate_coaching_plan`, `sparky_get_coaching_checkin`  (a group of separate tools, not a single one)

## Tools within Coach

### `sparky_get_health_summary`
- **Description:** Get a summary of the user's health status (Nutrition, Fitness, Vitals) for a specific date range.
- **Parameters:**
    - `start_date` (string, YYYY-MM-DD): Start date for the summary.
    - `end_date` (string, YYYY-MM-DD, optional): End date for the summary. Defaults to `start_date` if not provided.

### `sparky_analyze_trends`
- **Description:** Analyze weight trends vs. calorie intake to identify plateaus or progress. (Feature coming in full Phase 3 implementation!)
- **Parameters:**
    - `days` (number, optional): Number of days to analyze. Defaults to 7.

### `sparky_review_calorie_target`
- **Description:** Read-only weekly check of the saved calorie target. Uses the adaptive TDEE (`services/AdaptiveTdeeService.ts`) as maintenance, the rate the target implies against the rate the weight trend shows, average intake against the target, and the calories for common weekly rates or a chosen one. Judges nothing while the estimate is still learning or fewer than 70% of the days were logged, flags targets under the clinical minimum, and tells the model not to lower a target the user did not follow. The arithmetic is `reviewCalorieTarget` in `shared/src/utils/calorieTargetReview.ts`. Changing the goal is `sparky_manage_goals` `set_goals`.
- **Parameters:**
    - `desired_kg_per_week` (number, -1 to 1, optional): Weekly change the user wants; negative to lose.

### `sparky_get_30_day_trends`
- **Description:** Get comprehensive trends for the last 30 days including food, exercise, mood, sleep, and biometrics. This tool gathers aggregated data across these domains to provide a holistic view of the user's progress and patterns.
- **Parameters:**
    - `end_date` (string, YYYY-MM-DD, optional): End date for the 30-day period. Defaults to today.

### `sparky_get_coaching_checkin`
- **Description:** Reads the user's weekly weight check-in: the smoothed weight trend, the estimated real calorie expenditure (from logged intake and weight change), progress against their goal rate, data-quality notes and the calorie and macro targets the app would suggest. **Read-only**: nothing changes until the user accepts a suggestion in the app, and the tool is available to read-only API keys. The result is an estimate, not medical advice.
- **Parameters:** none.
- **Returns:** `reason` (`insufficient-data`, `low-adherence`, `implausible-estimate`, `on-track`, `behind` or `ahead`), `goal`, `data_quality`, `trend_weight_kg`, `weekly_rate_kg`, `estimated_expenditure_kcal`, `expenditure_margin_kcal`, `average_logged_intake_kcal`, `current_target`, `suggested_target` (null when nothing should change), `limits` and whether Calorie Settings own the calorie target.
