# Research: goal weight target

*Researched 2026-11-15. Status 2026-11-16: the user-set target date (Phase 1b) is built on branch `feat/goal-weight-target-date`, on top of the mobile goal weight screen from PR #3598. No source issue or discussion; this answers "how do other apps handle a goal weight target?"*

## Summary

- SparkyFitness already stores a single goal weight and draws it on charts, but it is a bare number. It has no start weight, no milestones, no deadline, and no link to the weekly-change calorie goal.
- Most popular apps treat the goal weight as one part of a **plan**: start weight, goal weight, a pace, and a projected (or target) date. They measure progress against a smoothed trend, not single weigh-ins.
- The features people ask for most, and that few apps do well, are **milestones on the way to the goal** and **a history of past goals**.

## What SparkyFitness has today (verified in source)

| Piece | Where |
|---|---|
| One scalar goal weight, kg, `NUMERIC(5,2)` | `onboarding_data.target_weight` (`SparkyFitnessServer/db/migrations/20251103000000_add_onboarding_schema.sql:19`) |
| Web editor (save / clear, kg or lbs input) | `SparkyFitnessFrontend/src/pages/Goals/GoalWeight.tsx` |
| Trend + "goal projected {date}" forecast | `shared/src/utils/weightTrend.ts` (`forecastGoalDate`, `assessGoalForecast`), used by `SparkyFitnessFrontend/src/pages/Reports/MeasurementChartsGrid.tsx` |
| Mobile shows the goal as a flat line (read-only) | `SparkyFitnessMobile/src/utils/healthTrendGoals.ts`, `DashboardScreen.tsx:344`, `MeasurementsReportScreen.tsx:109` |
| Weekly weight-change calorie mode (signed kg/week, -2 to +2) | `user_preferences.goal_mode = 'weekly'` + `goal_mode_weekly_change_kg` (`20261022140000_add_weekly_weight_goal.sql`) |
| AI coach accepts `target_weight` but ignores it | `SparkyFitnessServer/ai/tools/coachTools.ts:592` |

Gaps: mobile cannot set the goal; the goal has no history (`HealthTrendsPager.tsx:43` notes this); start weight and start date are not recorded, so "% of the way there" cannot be shown; the weekly-change mode does not know when the goal is reached.

## How other apps do it

| Approach | Where it is common | What users say |
|---|---|---|
| **Goal weight + pace → projected date.** The person picks a rate (lb/week or % body weight/week) and the app shows an ETA and the calorie target it implies. | MacroFactor, MyFitnessPal, Cronometer, Fitbit, Withings | Clear and widely understood. Fitbit users complain they [cannot choose the date themselves](https://community.fitbit.com/t5/Manage-Weight/How-do-you-set-a-date-for-your-weight-loss-goal/td-p/49457). MyFitnessPal [wipes custom macros](https://www.techjunkie.com/myfitnesspal-change-goal/) when the goal changes, which people dislike. |
| **Rate as % of body weight per week.** The absolute loss shrinks as weight drops. | [MacroFactor](https://help.macrofactorapp.com/en/articles/222-how-does-macrofactor-make-adjustments-for-a-weight-gain-or-weight-loss-goal) | Seen as more realistic near the goal than a fixed lb/week. |
| **Deadline handled by adjusting the pace**, not by "catching up". | [MacroFactor](https://help.macrofactorapp.com/en/articles/202-what-should-i-do-if-i-m-pursuing-a-goal-with-a-strict-timeline) | Avoids punishing crash targets after a bad week. |
| **Goal reached by trend weight**, not one low weigh-in. | [MacroFactor goal features](https://macrofactor.com/goal-features/), [Happy Scale](https://apps.apple.com/us/app/happy-scale/id532430574) | Prevents a dehydrated morning from "completing" the goal. |
| **Straight-line projection from the trend**, plus a "where will I be on date X" lookup. | Happy Scale, [Libra](https://community.myfitnesspal.com/en/discussion/10603888/libra-weight-manager-app-settings) | Motivating, but [users note it can be unrealistic](https://community.myfitnesspal.com/en/discussion/10376460/neat-app-for-tracking-weight-trends) when the pace changes. |
| **Planned path line** from start to goal by a chosen date, drawn next to the actual trend. | Libra, Weight Monitor | Lets people see "ahead of / behind plan" at a glance. |
| **Milestones / sub-goals** between start and goal, each with its own projected date. | Happy Scale (paid tier) | Often requested elsewhere: [Fitbit](https://community.fitbit.com/t5/Product-Feedback/Multiple-weight-goals/m-p/1147635), [Fitbit long & short term](https://community.fitbit.com/t5/Product-Feedback/Long-amp-Short-Term-Weight-Goals/m-p/2843879), [MacroFactor feedback board](https://feedback.macrofactorapp.com/), [Cronometer milestone notifications](https://forums.cronometer.com/discussion/2723/on-screen-notifications-of-milestones-reached). Fitbit users dislike that progress resets with each new goal instead of counting from the original start. |
| **Goal history**: past goals kept with start/end dates and change. | [MacroFactor](https://macrofactor.com/mm-june-2024/) | Valued for long journeys (cut → maintain → bulk). |
| **Slider for goal and pace** with a live forecast. | [Withings](https://support.withings.com/hc/en-us/articles/202313656-Withings-App-iOS-Setting-a-Health-Goal), [Cronometer](https://support.cronometer.com/hc/en-us/articles/31975503009044) | Fast to set; Cronometer users asked for [finer 0.2 lb/week steps](https://cronometer.com/blog/macro-targets-revamp/). |
| **Paid vs free** | Projections and milestones are often paid (Happy Scale Deluxe, Withings+ BodyPath); basic goal + pace is free everywhere. | An opportunity for a self-hosted app. |

### Constraints and guidance

- **Safe pace**: the CDC says people who lose about [1–2 lb (0.5–0.9 kg) a week](https://www.cdc.gov/healthy-weight-growth/losing-weight) are more likely to keep it off, and that a 5% loss already lowers health risk. Apps commonly cap at about 2 lb/week ([Cronometer forum](https://forums.cronometer.com/discussion/1047/change-weight-loss-goal)). SparkyFitness's -2 to +2 kg/week range is wider than that cap, so a soft warning above about 1% body weight per week would fit common practice.
- **Health platforms**: no goal-weight data type was found in Apple HealthKit or Health Connect, so the goal stays a SparkyFitness-only value. No sync work is needed.
- **Units**: store kg, display in the preferred unit, including step sizes (repo rule).

## Takeaways

1. **Adopt**: turn the goal into a small plan: start weight + start date (captured when the goal is set), goal weight, and an optional target date. Show progress as "X of Y lost (Z%)" counted from the original start.
2. **Adopt**: connect it to the existing weekly-change mode instead of building a second pace setting. Setting a target date suggests a kg/week; setting a pace shows the projected date. When the trend reaches the goal, offer to switch to maintain (do not switch automatically).
3. **Adopt**: judge "goal reached" and milestones on the **trend** weight that `weightTrend.ts` already computes.
4. **Adopt (where we can beat paid apps)**: free milestones (every N kg/lb or a % step) with projected dates and an optional celebration, plus a goal history so charts can step the goal line over time instead of drawing today's goal across old data.
5. **Skip**: wiping custom macros when the goal changes (a common complaint), and forcing a date-based plan. Pace-first should stay the default and the date stays optional.

## A target date the user sets

*Added 2026-11-15.* The user picks the goal weight **and the day they want to reach it**, and the app shows whether they are on course.

### How apps that offer a chosen date do it

| App | What the date does | Notes |
|---|---|---|
| [MyNetDiary](https://www.mynetdiary.com/iphelp_targetDate.html) | Target date, weekly rate and calorie budget are [linked: change one and the other two follow](https://www.mynetdiary.com/help/calories-macros-and-goals/my-budget-changes-when-i-change-target-date). The required daily deficit is (weight left × energy per unit) ÷ days left ([formula](https://www.mynetdiary.com/calorie-planning.html)). | Capped at 2 lb/week and never below BMR. The app [moves the date by itself](https://www.mynetdiary.com/help/calories-macros-and-goals/why-did-my-target-date-change-and-can-i-see-the-old-one) when the plan becomes unrealistic or the date passes, and users then ask where the old date went. |
| [MacroFactor](https://help.macrofactorapp.com/en/articles/202-what-should-i-do-if-i-m-pursuing-a-goal-with-a-strict-timeline) | No date field. The person tunes the rate until the ETA lands on or before their deadline. | Deliberately no "catch-up": a slow week does not raise the next week's deficit. |
| [Libra](https://community.myfitnesspal.com/en/discussion/10603888/libra-weight-manager-app-settings), Weight Monitor, [Beeminder](https://help.beeminder.com/article/96-weight-gain-loss-goals) | The goal and the date draw a **planned path line** from start to goal; the actual trend is shown against it. | Shows "ahead / behind" at a glance. Beeminder uses the line as a commitment. |
| [Noom](https://www.noom.com/blog/in-the-news/calorie-goals-at-noom/) | Plan length is projected from a 1–2 lb/week pace; the user adjusts the pace. | Added guardrails after criticism: no goal below BMI 18.5, calorie floors ([Yahoo](https://www.yahoo.com/lifestyle/noom-recommends-people-stick-1-144459614.html)). |
| Fitbit, Samsung Health, Cronometer, Withings | **Rate only**; the date is computed. | Fitbit users [ask to choose the date](https://community.fitbit.com/t5/Manage-Weight/How-do-you-set-a-date-for-your-weight-loss-goal/td-p/49457) and to [backdate the start](https://community.fitbit.com/t5/Android-App/When-backdating-weight-loss-start-date-getting-error/m-p/5805551). |
| [NutriScan calculator](https://nutriscan.app/calculators/weight-loss-calculator) | If the date would need calories under a floor, it holds the floor and shows the **earliest reachable date** instead. | A useful pattern for an over-ambitious date. |

### What works and what doesn't

- **Works**: the required pace shown as plain numbers ("0.6 kg a week to make it"); a planned-path line next to the trend; ahead/behind status; the earliest realistic date when the chosen date is too soon.
- **Doesn't**: silently moving the date (MyNetDiary complaints); silently raising the deficit to catch up after a slow week (MacroFactor deliberately avoids it); targets that push calories below a safe floor.
- **Guidance**: about 0.5–1 kg (1–2 lb) a week ([CDC](https://www.cdc.gov/healthy-weight-growth/losing-weight)); a pace above roughly 1% of body weight a week is a common red flag ([Nutrola](https://nutrola.app/en/blog/my-calorie-tracker-set-unrealistic-goal-what-to-do)).

### How it fits SparkyFitness (verified in source)

- **Pace already exists.** The weekly mode (`goal_mode = 'weekly'`, `goal_mode_weekly_change_kg`) turns a signed kg/week into a calorie target (`shared/src/utils/calorieCalculations.ts:481`), so a date needs no second pace system. The date **suggests** a kg/week, and the person applies it with one tap.
- **Safety floor already exists.** `resolveCalorieSafetyFloor` / `getRecommendedCalorieSafetyFloor` (`calorieCalculations.ts:765`, `:782`) can decide whether a date is realistic and work out the earliest reachable date.
- **The forecast already exists.** `assessGoalForecast` (`shared/src/utils/weightTrend.ts:167`) gives the trend's projected date. Comparing it with the chosen date gives `ahead` / `on-track` / `behind`, with no new math beyond that comparison.
- **Data**: the goal lives on `onboarding_data.target_weight`. A date needs a nullable `DATE` for the target day plus the day the goal was set, so the planned path can start from that day's trend weight. Keep both as `YYYY-MM-DD` calendar strings (repo rule). Mobile goal-weight editing is in open PR [#3598](https://github.com/CodeWithCJ/SparkyFitness/pull/3598) (fork [#385](https://github.com/Jerrys-modz/SparkyFitness/pull/385)), so the date field should land on top of that screen rather than in a second editor.

### Proposed behavior (to confirm)

1. **Optional date** under the goal weight on web Goals and the mobile goal weight screen. Clearing it returns to today's behavior.
2. **Required pace** shown as soon as a date is picked: "To reach 75 kg by 1 Mar: 0.6 kg a week (about 510 kcal a day under maintenance)." The figure uses the app's own 6,000 kcal/kg (`ENERGY_DENSITY_KCAL_PER_KG`). The required pace is compared with what the current calorie goal mode delivers (see below), and the app offers **Use this pace**. Never change calories without that tap.
3. **Too soon**: if the pace is over the limit or would put calories under the safety floor, say so, show the earliest realistic date, and let the person keep their date anyway.
4. **Charts**: on web Reports and mobile, draw a dashed planned-path line from the start to the goal on the date. The status reads "On track", "N days ahead" or "N days behind", based on the trend.
5. **Date passed or goal reached**: keep the date as entered (never move it silently). Show "Target date passed – pick a new date?", or on reaching the goal, "Goal reached – switch to maintain?".
6. **AI coach / MCP**: include the date and the required pace in the goal snapshot so the chatbot can answer "am I on track?".

### How the date ties into the calorie goal modes (Cut, High cut, ...)

Verified in `shared/src/utils/calorieCalculations.ts`. The calorie goal (Settings → Calculation, mobile Calorie Settings) is one of these modes:

| Mode | Daily calories vs. baseline | Pace it implies |
|---|---|---|
| `recomp` | −10% | depends on baseline |
| `cut` (what onboarding's "lose weight" picks, `goalModeFromPrimaryGoal`) | −15% | depends on baseline |
| `high_cut` | −20% | depends on baseline |
| `lean_bulk` / `bulk` | +10% / +20% | depends on baseline |
| `manual` | user %, ±40% | depends on baseline |
| `weekly` | signed kg/week × 6,000 ÷ 7 | fixed kg/week |

The percentage modes do not aim at a weight or a date. They take a share off the baseline (the manual TDEE, or the adaptive TDEE once it has enough history), so the pace in kg a week **shrinks as weight and TDEE fall**. `computeCalorieTarget` already returns, for whichever mode is on:

- `projectedWeeklyChangeKg` / `projectedWeeklyChangePercent`: the pace the current setting implies. Web Calculation Settings already shows it (`CalculationSettings.tsx:2062`).
- `safetyZone`: green / yellow / red. For loss: yellow above **1%** of body weight a week, red above **1.5%**. For gain: 0.25% / 0.5%.
- `maxFeasibleDeficitPercent` and floor clamping (`wasClampedToFloor`): the largest deficit that clears the calorie safety floor. The floor is applied only in adaptive calculation or the weekly mode. A manual-calculation Cut is **not** clamped today.

`shared/src/utils/calorieTargetReview.ts` (`targetForRate`, `reviewCalorieTarget` with `desiredKgPerWeek`) already turns "the pace I want" into a calorie target against the adaptive maintenance estimate, with the floor applied. The weekly check-in and `sparky_review_calorie_target` use it.

**So the date does not need its own calorie math.** It needs one comparison:

1. **Required pace** = (goal − current trend) ÷ weeks left to the date.
2. **Setting's pace** = `projectedWeeklyChangeKg` from the active mode, and the date that pace reaches the goal, as a plain projection (the percentage modes slow as weight falls, so say "about").
3. Show both, in the person's unit: "Your Cut setting: about 0.45 kg a week, reaching 75 kg around 12 Apr. Your date (1 Mar) needs 0.6 kg a week."
4. Offer the smallest change that meets the date:
   - The setting already gets there by the date → "On course", no change offered.
   - It needs more → **Use 0.6 kg a week**: switches to `weekly` with that kg/week. If `high_cut` happens to land within about 10% of the required pace, it's offered as the alternative, so people who like the named modes can stay on one.
   - It needs less (the setting overshoots) → offer the gentler pace the same way, which avoids an unnecessarily hard cut.
   - The mode points the wrong way (goal below current weight with `lean_bulk`/`bulk`/`maintain`, or the reverse) → say so plainly: "Your calorie goal is set to gain; this goal needs a loss."
5. **Warnings (decided: warn, never block)**. Reuse `safetyZone` on the required pace: yellow above 1%/week, red above 1.5%/week for loss, and the tighter gain thresholds. When the pace would sit under the safety floor, show the **earliest reachable date** (from `maxFeasibleDeficitPercent` or `targetForRate`'s floor). There is no second threshold to drift from Calculation Settings.
6. Tapping **Use this pace** writes the same `goal_mode` / `goal_mode_weekly_change_kg` fields Calculation Settings writes, through the same endpoint. Calorie targets, the safety floor and the weekly check-in then follow as they do today.

**What does not change**: without a target date, every mode works exactly as it does now. Setting a date never changes the mode or calories until **Use this pace** is tapped. A gap in today's behavior to flag separately: a manual-calculation Cut/High cut has no floor clamp. The date warning will still flag a pace under the floor in that case, but it won't change how manual targets are calculated.

### Decisions (made 2026-11-15)

1. The date **suggests** a pace with a one-tap apply. It never drives calories automatically.
2. **Warn, never block.** Use the existing `safetyZone` thresholds (loss: 1% / 1.5% a week; gain: 0.25% / 0.5%) and the calorie safety floor, tied into the current Cut / High cut / weekly setting as described above.
3. A passed date **prompts only**. It is never moved automatically.
4. The target date and start day go on `onboarding_data` next to `target_weight` now. A later goal-history table can backfill from them.

## Rough shape if built (for a later plan, not decided)

- **Phase 1**: set and clear the goal on mobile (parity). Already in open PR [#3598](https://github.com/CodeWithCJ/SparkyFitness/pull/3598) / fork [#385](https://github.com/Jerrys-modz/SparkyFitness/pull/385).
- **Phase 1b**: the user-set target date above. It needs one migration on `onboarding_data`, a shared helper in `shared/src/utils/weightTrend.ts` for the required pace, the setting's pace, ahead/behind status and the earliest date (reusing `computeCalorieTarget` and `targetForRate`), web Goals and Reports, mobile goal weight and charts, and the coach snapshot.
- **Phase 2**: a goal-history table (`start_weight_kg`, `start_date`, `goal_weight_kg`, `target_date`, `ended_at`) that extends the existing goal domain, with the current `target_weight` backfilled as the first open row and kept in sync for older clients. Progress %, a planned-path line and stepped goal lines on web and mobile charts.
- **Phase 3**: milestones and "goal reached on trend" prompts, a soft warning about pace, and AI coach / MCP tools reading the goal (wiring the unused `target_weight` in `coachTools.ts`).

## Decisions needed (from the maintainer)

1. Should a target date be optional, with pace-first as the default? *Recommended: yes.*
2. How should milestones be defined: fixed steps (every 5 kg / 10 lb), % steps, or user-entered? *Recommended: fixed steps by default, with user-entered milestones as an option.*
3. When the goal is reached, should the app only suggest switching to maintain, or switch on its own? *Recommended: suggest only.*
4. Is a goal-history table worth a migration now, or should the target date (Phase 1b) ship first on the existing row? *Recommended: target date first.*
