# Measurements

The **Measurements** tab of the [Check-In](/features/check-in) page is where you log your body metrics. Everything you log here shows up as trend charts in [Reports](/features/reports).

## Built-in fields

For **Weight**, **Height**, **Neck**, **Waist**, **Hips**, and **Body Fat %**, a **Use Last** button appears whenever the field is empty and a previous value exists, so logging daily takes seconds:

| Field | Notes |
| --- | --- |
| **Weight** | In your preferred unit (kg or lbs) |
| **Height** | In cm or inches |
| **Steps** | Your daily step count |
| **Neck**, **Waist**, **Hips** | Tape measurements |
| **Body Fat %** | Enter it directly, or press **Calculate** to estimate it from your measurements (tick **Use Recent** to have the estimate fill missing fields with your latest values) |
| **Muscle Mass** | From a body-composition analyzer |
| **Bone Mass** | From a body-composition analyzer |
| **Body Water %** | From a body-composition analyzer |
| **BMR (kcal)** | Your resting metabolic rate, if you have a measured value |

Fill in whatever you have: you don't need to complete every field. Press **Save Check-In** when you're done.

## Custom categories

The built-in fields don't cover everything you track. Create your own categories under **Settings → Wellness → Custom Categories**:

- Give each category a name, a unit, and a type (**numeric** or **text**)
- Every category then appears on the Measurements tab with its own input (and a **Use Last** button when empty if a previous value exists)
- Numeric entries can carry a short note (for example, the machine or circumstances of the reading)
- Each custom category gets its own trend chart in Reports

## Recent measurements

Below the form, the **Recent Measurements** list shows your latest logged weight, body metrics, and custom-category entries. You can delete entries you logged by mistake.

## See your progress

- Open **Reports → Measurements** for a chart per metric, including every custom category
- Switch to the table view, pick **Body Measurements** (or a custom category), and use **Download (CSV)** to export the full history

## Weight progress

The **Weight progress** card (web: **Reports → Measurements**; app: **Reports → Measurements**, and optionally the Dashboard) sums up your weight over time. Every figure is read from the smoothed 7-day trend, not from a single weigh-in, so one heavy morning does not move it.

- **Starting weight:** your first weigh-in, or the weight you gave during setup if that came earlier. On the web you can pick your own start day under **Change start**, with or without a weight (left empty, your trend on that day is used); **Use default start** goes back. The chosen start is kept in that browser only.
- **Change (trend)** and **Of starting weight:** how far the trend has moved since the start, in your weight unit and as a share of the starting weight.
- **Toward goal:** how much of the way from your start to your [goal weight](/features/goals#goal-weight) the trend has covered, with what is left. Without a goal weight this tile is empty.

### Milestones

The card lists the milestones you have reached and the next one: every 5 kg (or 10 lb if you use pounds or stones), 5 %, 10 %, 15 % ... of your starting weight, halfway to your goal and the goal itself. They follow your goal's direction, so they work for gaining as well as losing; without a goal they follow the way the trend has moved. A milestone counts from the first day the trend crossed it and stays reached.

A newly reached milestone is announced once with a short note you can dismiss; what was already reached the first time you open the card is just listed. If you would rather not see milestones at all, choose **Hide milestones** (**Show milestones** brings them back). On the phone the Dashboard card is off until you turn it on under **Settings → Dashboard**.

### Estimated fat from your food log

Under the figures, the card estimates the fat your logged eating implies over the last 90 days (never before your start), beside the trend's actual change over the same days. It adds up, for each day with at least 200 kcal logged, your estimated daily expenditure (the [Adaptive TDEE](/features/settings/calculation-settings) figure) minus what you ate, and divides by the energy in a kilogram of body fat (9,441 kcal). Days without a food log are left out rather than counted as zero, which would invent a deficit. It appears once 7 days in the window have a food log.

This is an **estimate**, not a measurement: food logs are rarely complete, expenditure is itself estimated, and scale weight also moves with water and glycogen, so the two numbers will not match exactly.

## Waist-to-height ratio

The **Waist-to-height ratio** card divides your latest waist by your height (both from Check-In; height is carried over from the last time you logged it). The ratio has no unit, so it reads the same in centimetres or inches. It is shown against adult screening bands:

| Ratio | Band |
| --- | --- |
| under 0.5 | Lower risk |
| 0.5 to 0.59 | Increased risk |
| 0.6 and over | High risk |

A simple rule of thumb is to keep your waist under half your height. These are population screening bands, not a diagnosis, and may not fit children, pregnancy or very muscular builds. With more than one waist measurement the card also shows how the ratio has changed. Both cards can be hidden like any other card.

> [!TIP]
> Weigh yourself on the same day and at the same time of day for the cleanest trend. Day-to-day noise is normal: the charts smooth it out over weeks.

## When your weight trend levels off

If your **Goal Mode** is set to lose or gain weight and your smoothed weight trend stops moving for a while, a short note appears at the top of **Reports → Measurements** on the web, and under the Health Trends card on the mobile Dashboard and the weight chart in the mobile Measurements report. It says how long the trend has been flat and lists a few things worth checking:

- whether most meals, snacks and drinks are logged
- whether the Adaptive TDEE estimate is still adjusting to your recent data
- water and scale noise, which can hide a change for a week or two
- whether a planned stretch at maintenance calories suits you

Tap the close button to dismiss it. It stays hidden for that flat stretch and appears again only if a new one starts later. Nothing appears at maintenance or recomposition, where a steady weight is expected.

How it is decided (the same check the web, the mobile app and the AI assistant use):

- It looks at your weigh-ins from the last 90 days, smoothed the same way as the trend line on the chart.
- The trend has to have stayed flat for at least **14 days**: changing by less than **0.1% of your weight per week** (about 0.08 kg or 0.18 lb at 80 kg) and staying inside a band **0.5% of your weight** wide (about 0.4 kg at 80 kg).
- That stretch needs at least **6 weigh-ins**, with no gap longer than **7 days** between them, and your latest weigh-in must be from the last 7 days.

## Related pages

- [Check-In](/features/check-in)
- [Reports](/features/reports)
- [User Settings](/features/user-settings)
- [Goals](/features/goals)
