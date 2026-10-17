# Goals

SparkyFitness allows you to set and track various fitness and nutrition goals, helping you stay motivated and monitor your progress.

---

## Goal Weight

Set your goal weight under **Goals**. It was previously only asked once during onboarding. Enter it in your preferred weight unit (stones and pounds users enter pounds); it is stored in kilograms. **Clear** removes it. The mobile Weight chart uses it for the dashed goal line and the projected goal date.

## Weekly Coaching

Weekly Coaching turns the [Adaptive TDEE](/features/settings/calculation-settings) idea into a check-in. Once a week, or whenever you open it, SparkyFitness looks at your weight trend and the food you logged, estimates what you really burn, compares your progress with the goal you chose (lose, maintain or gain, at a rate you pick) and suggests new daily calorie and macro targets. **Nothing changes until you accept.**

It appears as a **Weekly Coaching** card on the mobile Dashboard (toggle it in Dashboard settings), as a Coaching screen (Settings → Weekly Coaching), and as a card at the top of the web **Reports → Nutrition** tab. Everyone who can see your reports can read it; only you can change the goal or accept a suggestion.

### What it looks at

- **Weight trend.** A line is fitted through the last 28 days of weigh-ins. A weigh-in that sits far off that line (a typo, a bathroom scale on a bad day) is ignored and drawn as a hollow dot, and a single heavy or light day from water barely moves it. Missed weigh-ins are fine.
- **Logged intake.** Only days you actually logged count. A day under about 40% of your usual intake is treated as not fully logged and left out.
- **Estimated expenditure.** Average logged intake minus the energy implied by the trend, using the same energy density as Adaptive TDEE. The estimate is smoothed across the last eight weeks so one odd week does not swing it, and the app shows a margin (a rough 95% interval from weigh-in noise alone; it does not include errors in what you logged).

### When it speaks up

It says nothing until the last 28 days hold at least 10 logged days, 5 weigh-ins spanning two weeks, and food logged on at least 60% of the days since you started. Until then it tells you exactly what is missing ("Log 3 more days for a reliable estimate"). The possible outcomes are:

| Outcome | Meaning |
| :--- | :--- |
| Not enough data yet | A minimum count above is not met. |
| Too many unlogged days to judge | Enough days, but too many gaps to compare food with weight. |
| The estimate looks off | The numbers imply a burn under 1,000 or over 6,000 kcal, which usually means missing logs. Nothing is changed. |
| On track | Your weekly rate is within 0.1 kg (or 25% of your goal rate) of the goal. Targets stay as they are. |
| Behind / Ahead | You are slower or faster than the goal. A new calorie target is suggested. |

### How the suggestion is built

The suggested calories are your estimated expenditure plus (or minus) the energy for your goal rate. Then:

- **At most 10% change per week.** A bigger gap is closed over several weeks.
- **A minimum safe level.** The suggestion never goes below your calorie safety floor (Calorie Settings), and never below 800 kcal even if you turned the floor off.
- **Your macro split is kept.** Carbs and fat are scaled together. Protein is held at the lower of its current amount and 1.6 g per kg of body weight, so a cut comes from carbs and fat first. A goal saved as percentages keeps its percentages unless that protein floor has to override them.

Accepting writes the new targets from today through the normal goal timeline (the same as saving goals), so they show up in the Goals screen like any other change. If your calorie target is set by Calorie Settings instead (an adaptive goal, or a goal mode other than Maintain), the check-in still reads, but Accept is unavailable because the setting would overwrite it.

### Your goal and check-in day

Pick the direction, the rate (kg or lb per week, up to 1 kg) and the weekday of your check-in on the Coaching screen or the web card. On mobile, a local notification arrives on that weekday at 09:00 once there is enough data to say something (**Settings → Notifications → Weekly Check-in**). It is scheduled on the phone when the app is opened; there is no server push.

::: warning An estimate, not medical advice
The numbers come from your logs and your scale. If either is incomplete or wrong, so is the suggestion. Short-term weight is also affected by water, salt and hormones, which is why the app shows its margin and waits for several weeks of data. Talk to a clinician before making large changes to how you eat, especially with a medical condition, pregnancy or a history of disordered eating.
:::

The AI assistant and the [MCP server](/developer/mcp/coach) can read the same check-in with `sparky_get_coaching_checkin`. It is read-only; accepting happens in the app.

---

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

## Interactions with Calculation Settings

The Nutrient Goal Direction feature only changes how progress is *displayed* against whatever goal number already exists — it doesn't compute goal values itself (except the Added Sugar auto-calculate above). Two things to be aware of when combining it with [Calculation Settings](/features/settings/calculation-settings):

- **Calories in Target mode vs. Adaptive/Dynamic goals:** if your Daily Calorie Goal Adjustment is set to Adaptive, Dynamic, Percentage Earn-Back, or Device Projection, your calorie *goal value* recalculates regularly (e.g. as your Adaptive TDEE updates). A manually entered Target band for calories does **not** move with it — you'll need to revisit and adjust the band yourself if your adaptive goal shifts significantly. Target range for calories pairs best with a **Fixed** goal adjustment, where the goal value stays constant.
- **Two separate "sugar" calculations:** Calculation Settings' **Sugar Calculation Algorithm** (WHO Guidelines/Low-Carb-Keto/Balanced) computes a recommendation for the built-in **Total Sugar** goal. The **Auto-calculate** control described above is a distinct calculation for your **Added Sugars** custom nutrient. They share "WHO guidelines" terminology but target different fields with different percentages — check which one you're adjusting.
