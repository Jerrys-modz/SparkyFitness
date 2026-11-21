# Goals

SparkyFitness allows you to set and track various fitness and nutrition goals, helping you stay motivated and monitor your progress.

---

## Goal Setup

New accounts are walked through a short goal setup: sex, main goal (lose, maintain or gain weight), current weight, height, date of birth, a rough body-fat estimate, goal weight, meals per day, how often you exercise, and whether exercise calories are added to your daily budget. It then suggests daily calories, protein, carbs, fat, fiber and water, which you can adjust before saving.

- **Web:** shown the first time you sign in.
- **Mobile app:** shown right after you first sign in to a server, if the account has not finished or skipped goal setup on the web or in the app. Accounts that are already set up go straight to the Dashboard. You can also run it at any time from **Settings → Goals → Work out my goals step by step**. On the phone you pick one of the preset eating styles (Balanced, Mediterranean, DASH, Atkins, Low fat, Low carb); a custom macro split and the advanced nutrient algorithms are set afterwards in Goals or on the web.

Both use the same calculation, so the web and the app suggest the same numbers for the same answers. Saving sets today's goals and the days after it, keeps targets the setup does not ask about (such as caffeine or steps) when run from the app, records your weight and height on today's check-in, and stores your goal mode as maintain/manual so the goal you picked is not applied twice. **Skip** leaves your goals unchanged and is remembered, so you are not asked again after signing in.

## Goal Weight

Set your goal weight under **Goals**. It was previously only asked once during onboarding. Enter it in your preferred weight unit (stones and pounds users enter pounds); it is stored in kilograms. **Clear** removes it. On the website the goal weight, its target date and **Clear** have their own buttons. In the mobile app they are saved with the rest of your goals when you tap **Save** at the top of Settings → Goals: **Clear** empties the field and **Remove date** drops the date, and neither takes effect until you tap **Save**. The mobile Weight chart uses it for the dashed goal line and the projected goal date. To aim for a body composition instead, see [Body Fat Goal](#body-fat-goal).

### Target date

You can also pick an optional **target date**: the day you want to reach your goal weight (web Goals page, and Settings → Goals in the app). The date never changes your calories on its own. Instead, SparkyFitness shows:

* **The pace the date needs**, for example "lose 0.5 kg a week (about 430 kcal a day under maintenance)", worked out from your current trend weight.
* **What your current calorie goal gives.** This covers every goal mode (Cut, High cut, Weekly weight change, Manual and the rest), using the same maintenance estimate as the weekly calorie review, plus the day that pace would reach your goal.
* **Ahead or behind**: how many days you are ahead of or behind a straight path from the day you set the goal to the target date.
* **Warnings, never blocks**: the same green, yellow and red pace thresholds as Calculation Settings (for loss: above 1% and 1.5% of body weight a week; for gain: 0.25% and 0.5%). The safe minimum is your real **safety floor** from [Calculation Settings](/features/settings/calculation-settings): with **Standard**, the higher of your resting metabolic rate and the clinical minimum (1,500 kcal for men, 1,200 for women); with **Custom**, your own value; with **Disabled**, no floor. When the date would need calories under the floor, the earliest date reachable above it is shown.

When your setting is too slow, too fast, or points the wrong way, you can tap **Use … a week** to switch your calorie goal to **Weekly weight change** at that pace (or **Use High cut** when its pace is close). Nothing changes until you tap. If the pace would put calories under your safety floor, the calorie engine would raise the target back to the floor, so that pace is not offered: you see the warning and the earliest reachable date, and a **Use the fastest allowed** button for the fastest pace the floor permits. With the floor **Disabled** nothing holds the target back, so the warning is shown but the button for the pace stays. Once the date passes, you are asked to pick a new one; the date is never moved for you. When your trend reaches the goal, you are offered to switch the calorie goal to Maintain.

Your goal weight also drives the **Toward goal** figure and the halfway and goal milestones of the [Weight progress](/features/measurements#weight-progress) card in Reports → Measurements.

The destination weight and the desired weekly pace are separate settings. Under [Calculation Settings → Goal Mode](/features/settings/calculation-settings#_4-goal-mode-caloric-deficits), select **Weekly weight change** to choose maintenance, loss, or gain in kg or g per week. The weekly pace adjusts the calorie target; it does not change the saved destination weight.

## Body Fat Goal

If you are doing body recomposition (losing fat while keeping or building muscle), your weight can stay flat while your body changes, so a goal weight alone does not show progress. Set a **Body Fat Goal** under **Goals**, next to Goal Weight, on the website or in the mobile app (Settings → Goals). Enter a percentage from 3% to 60%, to one decimal place. On the website it has its own **Save** and **Clear** buttons, like Goal Weight. In the mobile app it is saved with the rest of your goals when you tap **Save** at the top of the screen; empty the field and tap **Save** to remove it.

- **Charts**: the Body Fat % chart (website: Reports → Measurements; mobile: Reports → Measurements) draws the goal as a dashed line, shows your smoothed trend and weekly rate of change, and projects the date you will reach the goal at that rate. The projection uses the same smoothing and rules as the weight goal date: it needs about two weeks of readings and at least four of them, and says so when you are holding steady, moving away from the goal, or more than two years out.
- **Implied goal weight**: next to the goal, SparkyFitness estimates the weight that goal means if your lean mass stays the same: lean mass = weight × (1 − body fat %), and goal weight = lean mass ÷ (1 − goal body fat %). For example, 80 kg at 25% is 60 kg of lean mass, so a 15% goal means about 70.6 kg. It is labelled as an estimate: lean mass changes during a cut or a bulk, so treat it as a guide, not a target.
- **Measurement method**: body fat readings vary a lot between methods (smart scales, calipers, tape formulas, DEXA), and a bathroom scale can move several points from day to day with hydration. Compare readings from one method, taken the same way (for example, every morning before eating), and expect the trend, not any single reading, to tell you where you are.

The body fat goal does not change your calorie target; the weekly weight-change setting in Calculation Settings still does that. Like the goal weight, only you can change it, but someone with access to your reports sees it on your charts.
## Protein and Fat per kg of Body Weight
Protein (and fat) can be set in **grams per kg** instead of grams or a percentage of calories. A gram target typed by hand stays put while your weight goes down; a per-kg target follows it.
On the Goals page (web), in **Edit goals for today** (web Diary) or in Goals (mobile), switch on **Set protein per kg** and/or **Set fat per kg** and enter the value, then choose what it is per kg of:
- **Body weight**: your latest logged weight.
- **Lean mass**: your weight × (1 − body fat %), using your latest logged body fat %. With no body fat % logged, body weight is used instead and the Goals page says so.
Allowed values are 0.1–5 g/kg for protein and 0.1–3 g/kg for fat. A preview under the switches shows today's grams for your current weight.
**Which weight is used.** Each day uses the latest weight measured on or before that day (and the latest body fat % for lean mass), so a target for a past day uses the weight you had then, and today's target moves when you log a new weight.
**No weight logged yet.** The goal falls back to the grams saved with it (worked out from your weight when you saved it) and the Goals page shows a hint asking you to log a weight.
**How the remaining calories are split.** A per-kg macro is fixed first:
- With macros set as **percentages**, the calories left after the per-kg macros (and after the fibre allowance the percentage maths already subtracts) go to the other macros in proportion to their percentages. So with protein per kg and carbs 40% / fat 30%, carbs get 40/70 of the rest and fat 30/70. With both protein and fat per kg, carbs get all of it. The percentages no longer need to add up to 100. The remainder never goes below zero.
- With macros set as **grams**, carbs (and fat, unless it is per kg) keep the grams you enter.
Calorie cycling and exercise calories added back to your macros still apply on top: they change the calories the remainder is split from, and cycling still moves carbs only.
**Past days keep their targets.** The per-kg setting is stored on the dated goal, like the rest of your goals. Saving goals today does not change the setting on earlier days, and earlier days keep using the weight they had. Goal presets carry the setting too, so a weekly goal plan can use a per-kg preset; its grams follow each day's weight.
## Macros per kg of Body Weight
Protein, carbs and fat can each be set in **grams per kg** instead of grams or a percentage of calories, for example 2.0 g/kg of protein. A gram target typed by hand stays put while your weight goes down; a per-kg target can follow it.
On the Goals page (web), in **Edit goals for today** (web Diary), in goal presets, or in Goals (mobile), switch on **Set protein per kg**, **Set carbs per kg** and/or **Set fat per kg** and enter the value. Then choose:
- **Per kg of**: **Body weight**, or **Lean mass** (your weight × (1 − body fat %)). With no body fat % logged, lean mass uses body weight instead and the Goals page says so.
- **Weight to use**:
  - **Follow my logged weight** (the default): each day uses the latest weight measured on or before that day, so the grams change after a weigh-in, including one synced from a scale or watch.
  - **Fixed reference weight**: a weight you enter, prefilled from your latest weight (shown and typed in your weight unit). The grams change only when you save a new reference weight, however your logged weight moves. With **Lean mass**, the number you enter is your lean mass.
Allowed values are 0.1–5 g/kg for protein, 0.5–12 g/kg for carbs, 0.1–3 g/kg for fat, and a reference weight of 20–400 kg. A preview under the switches shows the grams and the weight they came from before you save.
**No weight logged yet.** When following your logged weight, the goal falls back to the grams saved with it and the Goals page asks you to log a weight or enter a fixed one.
- With macros set as **percentages**, the calories left after the per-kg macros (and after the fibre allowance the percentage maths already subtracts) go to the other macros in proportion to their percentages. So with protein per kg and carbs 40% / fat 30%, carbs get 40/70 of the rest and fat 30/70. With protein and fat per kg, carbs get all of it. The percentages no longer need to add up to 100. The remainder never goes below zero.
- With macros set as **grams**, macros that are not per kg keep the grams you enter.
- With **all three per kg**, the macros no longer come from the calorie target. The Goals page shows a note when their calories add up to more or less than the target leaves for macros (or, with only some per kg, when those alone already take more than it).
Calorie cycling and exercise calories added back to your macros still apply on top: they change the calories the remainder is split from, and cycling still moves carbs on high and low days, even when carbs are set per kg.
**Past days keep their targets.** The per-kg setting and the reference weight are stored on the dated goal, like the rest of your goals. Saving goals today does not change them on earlier days, and earlier days keep using the weight they had. Goal presets carry the setting too, so a weekly goal plan can use a per-kg preset.
**Older apps.** An app version that does not know about per-kg goals keeps the setting when it saves your goals; switch the unit off in a current version to go back to grams.

## Nutrient Goal Direction (Minimum / Maximum / Target)

By default, every nutrient goal in SparkyFitness is treated as a **minimum** — a target to reach, with progress filling toward 100% as you approach it. That works well for protein or fiber, but it doesn't fit every nutrient or every person: someone managing high cholesterol wants cholesterol treated as a ceiling, not something to "fill up"; someone maintaining their weight wants calories treated as a range to stay near, not a bar to max out.

**Settings → Nutrient Goal Direction** lets you choose, per nutrient (predefined or custom), how progress should be judged:

- **Minimum** _(default for most nutrients)_ — more is better. Progress fills toward the goal; unchanged from the classic behavior.
- **Maximum** — less is better. The nutrient is shown as a limit to stay under: green with a checkmark while you're at or under the limit, red with an "Xg over" indicator once you exceed it. Cholesterol, sodium, saturated fat, trans fat, and Total Sugar default to Maximum out of the box; you can flip any nutrient back to Minimum, or set any other nutrient to Maximum, at any time.
- **Target range** — hit a band. You set a lower and upper bound (e.g. calories 1700–1900); the goal shows green while your total is inside the band, and amber/red outside it. Useful for calories when maintaining weight, or for precise macro tracking where being too far under is just as undesirable as being too far over.

A nutrient with no explicit choice saved simply uses its built-in default (Minimum, unless it's one of the five listed above) — nothing changes for existing goals until you visit the settings screen and pick something different.

This applies to the Diary page's Nutrition Summary card and to the Daily Energy Goal ring (for calories, when set to Target range).

---

## Tracking Added Sugars

SparkyFitness's built-in "Sugars" goal reflects **total sugar** (naturally occurring plus added), because that's what most food databases report per item. If you want to track **added sugars** specifically — sugar added during processing, as distinct from sugars naturally present in fruit or milk — create a custom nutrient (Settings → Custom Nutrients) named **"Added Sugars"** (matching the wording used on nutrition labels), set its Goal Direction to **Maximum**, and log it per food the same way you would any other custom nutrient.

### Auto-calculate a recommended limit

When editing goals for a custom nutrient that looks like an added-sugar tracker (recognized name variants: "Sugar(s)" or "Added Sugar(s)", singular or plural, case-insensitive) and is set to Maximum, an **Auto-calculate** control appears next to its goal field, offering three evidence-based options:

| Option          | Basis                                                          | Formula                                                                   |
| :-------------- | :------------------------------------------------------------- | :------------------------------------------------------------------------ |
| **WHO Ideal**   | WHO's conditional recommendation for additional health benefit | 5% of your daily calorie goal ÷ 4 kcal/g                                  |
| **WHO Maximum** | WHO's strong recommendation                                    | 10% of your daily calorie goal ÷ 4 kcal/g                                 |
| **AHA Fixed**   | American Heart Association                                     | 36g/day (men), 25g/day (women) — a flat guideline, not scaled by calories |

Picking an option fills in the computed gram value; you can still edit it manually afterward.

---

## Goal Presets and Weekly Plans

A **goal preset** is a saved set of goals (calories, macros and the rest), such as "Training day" and "Rest day". A **weekly goal plan** picks a preset for each weekday, from a start date on, so Monday can use one preset and Tuesday another. Create both on the Goals page (web) or Goals (mobile).

Weekly plans use fixed numbers. If you want training days higher and rest days lower while still following your Adaptive TDEE and keeping the weekly total, use [calorie cycling](/features/settings/calculation-settings#calorie-cycling) instead. When both are on, a day a plan sets uses the plan's preset and calorie cycling is paused that day.

## Diet Phases

A **diet phase** plan changes your Goal Mode by date: for example a 12-week cut, two weeks of maintenance, then another cut. Plan it under **Goals → Diet Phases** on the web or **Settings → Goals → Diet phases** in the mobile app.

Each phase has:

- **A type and weekly rate:** lose, maintain or gain, with the same weekly weight change you set in [Goal Mode → Weekly weight change](/features/settings/calculation-settings#weekly-weight-change) (kg, g, lb or st + lb per week, up to 2 kg). Maintenance has no rate.
- **A start date and an end:** a last day, or a number of whole weeks counted from the start day (4 weeks from Monday 5 January ends on Sunday 1 February).
- **An optional target weight (loss and gain only):** the phase ends as soon as your smoothed weight trend (the same 7-day trend the weight chart and Adaptive TDEE use) reaches it, at or below the target for a loss phase, at or above it for a gain phase. A phase can also run with only a target and no end date, until the trend gets there. It ends on the day SparkyFitness sees the trend reach the target (when you log or sync a weight, or when the plan or a day's calorie target is next loaded), never earlier, so weighing in late cannot change a day you already logged.

While a phase covers a day, it **replaces your Goal Mode** for that day with **Weekly weight change** at the phase's rate. Everything else in Calculation Settings still applies as you set it: the calculation method (Adaptive or Manual), the daily calorie goal adjustment mode, the safety floor and calorie cycling. Days outside every phase, including gaps between phases, use your Goal Mode from Calculation Settings. With no phases planned, nothing changes.

**Rules for a plan:**

- **Phases cannot overlap.** Each day belongs to at most one phase. A phase with only a target weight (no end) must be the last one.
- **Past days keep their targets.** A phase that has started can only change its end: you can end it today (or yesterday) or move its end later, but not change its type, rate or start, or delete it. New phases start today or later. This keeps every logged day on the target it was logged against, like every other calculation setting.

The Goals page shows the current phase, the days left in it and what comes next, and warns you three days before a phase starts or ends. Calculation Settings notes when a phase sets your Goal Mode today; its live preview still shows the Goal Mode chosen there, while the Diary shows today's target with the phase. The AI assistant can read your plan ("Which diet phase am I in?"), but phases are edited on the Goals page.

### How phases, weekly plans, presets and calorie cycling fit together

For each day, in this order:

1. **The day's base goal** comes from an active [weekly goal plan](#goal-presets-and-weekly-plans) (its preset for that weekday), else your daily goals. Phases do not change it.
2. **Goal Mode** comes from the diet phase covering the day, else from Calculation Settings. It adjusts the base goal as described in [Goal Mode](/features/settings/calculation-settings#_4-goal-mode-caloric-deficits).
3. **Calorie cycling** then spreads the result over the week, unless a weekly plan sets the day (cycling is paused on those days).

So a weekly plan and a diet phase work together: the plan picks the numbers you start from on each weekday, and the phase picks how much to add or cut.

---

## Interactions with Calculation Settings

The Nutrient Goal Direction feature only changes how progress is _displayed_ against whatever goal number already exists — it doesn't compute goal values itself (except the Added Sugar auto-calculate above). Two things to be aware of when combining it with [Calculation Settings](/features/settings/calculation-settings):

- **Calories in Target mode vs. Adaptive/Dynamic goals:** if your Daily Calorie Goal Adjustment is set to Adaptive, Dynamic, Percentage Earn-Back, or Device Projection, your calorie _goal value_ recalculates regularly (e.g. as your Adaptive TDEE updates). A manually entered Target band for calories does **not** move with it — you'll need to revisit and adjust the band yourself if your adaptive goal shifts significantly. Target range for calories pairs best with a **Fixed** goal adjustment, where the goal value stays constant.
- **Two separate "sugar" calculations:** Calculation Settings' **Sugar Calculation Algorithm** (WHO Guidelines/Low-Carb-Keto/Balanced) computes a recommendation for the built-in **Total Sugar** goal. The **Auto-calculate** control described above is a distinct calculation for your **Added Sugars** custom nutrient. They share "WHO guidelines" terminology but target different fields with different percentages — check which one you're adjusting.
