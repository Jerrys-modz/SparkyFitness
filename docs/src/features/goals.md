# Goals

SparkyFitness allows you to set and track various fitness and nutrition goals, helping you stay motivated and monitor your progress.

---

## Goal Weight

Set your goal weight under **Goals**. It was previously only asked once during onboarding. Enter it in your preferred weight unit (stones and pounds users enter pounds); it is stored in kilograms. **Clear** removes it. The mobile Weight chart uses it for the dashed goal line and the projected goal date.

The destination weight and the desired weekly pace are separate settings. Under [Calculation Settings → Goal Mode](/features/settings/calculation-settings#_4-goal-mode-caloric-deficits), select **Weekly weight change** to choose maintenance, loss, or gain in kg or g per week. The weekly pace adjusts the calorie target; it does not change the saved destination weight.

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

| Option | Basis | Formula |
| :--- | :--- | :--- |
| **WHO Ideal** | WHO's conditional recommendation for additional health benefit | 5% of your daily calorie goal ÷ 4 kcal/g |
| **WHO Maximum** | WHO's strong recommendation | 10% of your daily calorie goal ÷ 4 kcal/g |
| **AHA Fixed** | American Heart Association | 36g/day (men), 25g/day (women) — a flat guideline, not scaled by calories |

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
- **An optional target weight (loss and gain only):** the phase ends as soon as your smoothed weight trend (the same 7-day trend the weight chart and Adaptive TDEE use) reaches it, at or below the target for a loss phase, at or above it for a gain phase. A phase can also run with only a target and no end date, until the trend gets there. It ends on the day SparkyFitness sees the trend reach the target (when the plan or a day's calorie target is next loaded), never earlier, so weighing in late cannot change a day you already logged.

While a phase covers a day, it **replaces your Goal Mode** for that day with **Weekly weight change** at the phase's rate. Everything else in Calculation Settings still applies as you set it: the calculation method (Adaptive or Manual), the daily calorie goal adjustment mode, the safety floor and calorie cycling. Days outside every phase, including gaps between phases, use your Goal Mode from Calculation Settings. With no phases planned, nothing changes.

**Rules for a plan:**

- **Phases cannot overlap.** Each day belongs to at most one phase. A phase with only a target weight (no end) must be the last one.
- **Past days keep their targets.** A phase that has started can only change its end: you can end it today (or yesterday) or move its end later, but not change its type, rate or start, or delete it. New phases start today or later. This keeps every logged day on the target it was logged against, like every other calculation setting.

The Goals page shows the current phase, the days left in it and what comes next, and warns you three days before a phase starts or ends. Calculation Settings notes when a phase sets your Goal Mode today.

### How phases, weekly plans, presets and calorie cycling fit together

For each day, in this order:

1. **The day's base goal** comes from an active [weekly goal plan](#goal-presets-and-weekly-plans) (its preset for that weekday), else your daily goals. Phases do not change it.
2. **Goal Mode** comes from the diet phase covering the day, else from Calculation Settings. It adjusts the base goal as described in [Goal Mode](/features/settings/calculation-settings#_4-goal-mode-caloric-deficits).
3. **Calorie cycling** then spreads the result over the week, unless a weekly plan sets the day (cycling is paused on those days).

So a weekly plan and a diet phase work together: the plan picks the numbers you start from on each weekday, and the phase picks how much to add or cut.

---

## Interactions with Calculation Settings

The Nutrient Goal Direction feature only changes how progress is *displayed* against whatever goal number already exists — it doesn't compute goal values itself (except the Added Sugar auto-calculate above). Two things to be aware of when combining it with [Calculation Settings](/features/settings/calculation-settings):

- **Calories in Target mode vs. Adaptive/Dynamic goals:** if your Daily Calorie Goal Adjustment is set to Adaptive, Dynamic, Percentage Earn-Back, or Device Projection, your calorie *goal value* recalculates regularly (e.g. as your Adaptive TDEE updates). A manually entered Target band for calories does **not** move with it — you'll need to revisit and adjust the band yourself if your adaptive goal shifts significantly. Target range for calories pairs best with a **Fixed** goal adjustment, where the goal value stays constant.
- **Two separate "sugar" calculations:** Calculation Settings' **Sugar Calculation Algorithm** (WHO Guidelines/Low-Carb-Keto/Balanced) computes a recommendation for the built-in **Total Sugar** goal. The **Auto-calculate** control described above is a distinct calculation for your **Added Sugars** custom nutrient. They share "WHO guidelines" terminology but target different fields with different percentages — check which one you're adjusting.
