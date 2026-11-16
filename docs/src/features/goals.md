# Goals

SparkyFitness allows you to set and track various fitness and nutrition goals, helping you stay motivated and monitor your progress.

---

## Goal Weight

Set your goal weight under **Goals**. It was previously only asked once during onboarding. Enter it in your preferred weight unit (stones and pounds users enter pounds); it is stored in kilograms. **Clear** removes it. The mobile Weight chart uses it for the dashed goal line and the projected goal date.

The destination weight and the desired weekly pace are separate settings. Under [Calculation Settings → Goal Mode](/features/settings/calculation-settings#_4-goal-mode-caloric-deficits), select **Weekly weight change** to choose maintenance, loss, or gain in kg or g per week. The weekly pace adjusts the calorie target; it does not change the saved destination weight.

## Macros per kg of Body Weight

Protein, carbs and fat can each be set in **grams per kg** instead of grams or a percentage of calories, for example 2.0 g/kg of protein. A gram target typed by hand stays put while your weight goes down; a per-kg target can follow it.

On the Goals page (web), in **Edit goals for today** (web Diary), in goal presets, or in Goals (mobile), switch on **Set protein per kg**, **Set carbs per kg** and/or **Set fat per kg** and enter the value. Then choose:

- **Per kg of**: **Body weight**, or **Lean mass** (your weight × (1 − body fat %)). With no body fat % logged, lean mass uses body weight instead and the Goals page says so.
- **Weight to use**:
  - **Follow my logged weight** (the default): each day uses the latest weight measured on or before that day, so the grams change after a weigh-in, including one synced from a scale or watch.
  - **Fixed reference weight**: a weight you enter, prefilled from your latest weight (shown and typed in your weight unit). The grams change only when you save a new reference weight, however your logged weight moves. With **Lean mass**, the number you enter is your lean mass.

Allowed values are 0.1–5 g/kg for protein, 0.5–12 g/kg for carbs, 0.1–3 g/kg for fat, and a reference weight of 20–400 kg. A preview under the switches shows the grams and the weight they came from before you save.

**No weight logged yet.** When following your logged weight, the goal falls back to the grams saved with it and the Goals page asks you to log a weight or enter a fixed one.

**How the remaining calories are split.** A per-kg macro is fixed first:

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

---

## Interactions with Calculation Settings

The Nutrient Goal Direction feature only changes how progress is *displayed* against whatever goal number already exists — it doesn't compute goal values itself (except the Added Sugar auto-calculate above). Two things to be aware of when combining it with [Calculation Settings](/features/settings/calculation-settings):

- **Calories in Target mode vs. Adaptive/Dynamic goals:** if your Daily Calorie Goal Adjustment is set to Adaptive, Dynamic, Percentage Earn-Back, or Device Projection, your calorie *goal value* recalculates regularly (e.g. as your Adaptive TDEE updates). A manually entered Target band for calories does **not** move with it — you'll need to revisit and adjust the band yourself if your adaptive goal shifts significantly. Target range for calories pairs best with a **Fixed** goal adjustment, where the goal value stays constant.
- **Two separate "sugar" calculations:** Calculation Settings' **Sugar Calculation Algorithm** (WHO Guidelines/Low-Carb-Keto/Balanced) computes a recommendation for the built-in **Total Sugar** goal. The **Auto-calculate** control described above is a distinct calculation for your **Added Sugars** custom nutrient. They share "WHO guidelines" terminology but target different fields with different percentages — check which one you're adjusting.
