# Weekly Muscle Volume and Deload Suggestions

Two connected views built from the workouts you have already logged. There is nothing to set up.

## Where to find it

- **Mobile:** Exercise Statistics, under Training Consistency. You can hide it in Reports settings ("Weekly muscle volume").
- **Web:** Reports → Exercise, in the left column under Training Consistency.
- **AI assistant / MCP:** the `sparky_get_exercise_stats` tool has a `strength_volume` action that returns the same figures. It is read-only, so read-only API keys can use it.

## Weekly hard sets per muscle

For each muscle you have trained in the last four weeks, you see the hard sets for this week and last week, with a status against a target range.

**What counts as a hard set**

- Warm-up sets never count. A set needs reps or a duration.
- If the set has reps in reserve (RIR), it counts at 4 or fewer. Otherwise, if it has an effort rating (RPE), it counts at 6 or higher. RIR wins when both are logged.
- A set with neither RPE nor RIR counts, as a normal working set.

**How a set counts toward a muscle**

| Muscle role                      | Weight |
| :------------------------------- | :----- |
| Primary muscle of the exercise   | 1.0    |
| Secondary muscle of the exercise | 0.5    |

A muscle listed as both primary and secondary for one exercise counts once, as primary. Totals are shown to one decimal place.

**The range and the flags**

| Weekly hard sets                       | Status                |
| :------------------------------------- | :-------------------- |
| Below 10 in a finished week            | Under                 |
| Below 10 in the week still in progress | Building (not a flag) |
| 10 to 20                               | In range              |
| Above 20                               | Over                  |

Why these numbers (they are named constants, `WEEKLY_HARD_SETS_MIN` and `WEEKLY_HARD_SETS_MAX`, in `shared/src/utils/muscleVolume.ts`):

- **10 as the minimum.** In the Schoenfeld, Ogborn and Krieger (2017) dose-response meta-analysis, muscle growth rose with weekly sets per muscle, with the clearest gains at 10 or more. The authors read 10 as the point where gains were seen; the formal comparison between the fewer-than-5, 5-to-9 and 10-or-more bands was a trend, not a firm cutoff, so treat 10 as a guide.
- **20 as the maximum.** Later meta-regressions show returns shrinking well before this point, and the common coaching view is that most people's recoverable limit sits around or above 20 sets per muscle, where extra volume mostly adds fatigue.
- **Near-effort only.** Sets stopped within about four reps of failure are generally treated as the ones that count, and sets stopped far short of it as warm-up-like work. The Refalo et al. (2023) meta-analysis on proximity to failure found no evidence that training to failure beats stopping short of it for growth (a very small, borderline edge for failure); it does not say how far short is too far, so the four-rep line is a convention. That is why sets logged easier than RPE 6 or with more than 4 RIR are left out.
- **Half a set for secondary muscles.** A common convention for fractional counting; the results are not sensitive to the exact fraction.

This is a guide for training a muscle to grow, not a prescription. A muscle you only want to maintain can sit lower, and advanced lifters may tolerate more. A muscle you trained in the last four weeks but not last week shows as Under with 0 sets.

Weeks use your profile timezone and start on the first day of the week from your preferences.

## Deload suggestion

When progress stalls or fatigue builds, the card suggests a lighter week. It **only suggests**: it never changes a workout plan or training program. Any change to a plan made from it still goes through the existing confirmed-change flow (for example the AI tools that need `confirmed=true`).

It looks at the last four weeks (this week included) and adds up signals:

| Signal                 | When it fires                                                                                                                                  | Weight |
| :--------------------- | :--------------------------------------------------------------------------------------------------------------------------------------------- | :----- |
| Estimated 1RM dropping | A main lift's best estimated 1RM this week is 5% or more below its earlier peak                                                                | 2      |
| Estimated 1RM stalled  | At least half of your main lifts have set no new best (by more than 1%) in their last two trained weeks                                        | 1      |
| RPE rising             | The same load (within 2.5%) was rated at least 1 RPE point harder than in the earliest week with an RPE logged; two or more lifts count double | 1 or 2 |
| High volume            | Two or more muscles above 20 hard sets in each of the last two full weeks                                                                      | 1      |
| Readiness low          | Average device training readiness over 7 days is 15% or more below the prior 28 days                                                           | 1      |
| HRV low                | Average overnight HRV over 7 days is more than half a standard deviation below the prior 28 days                                               | 1      |

A deload is suggested at a total of **2 or more**, so no single mild signal triggers it, but a clear 1RM drop does. Main lifts are the up to four weight-based lifts you trained in at least three of the four weeks. Estimated 1RM uses your RPE or RIR when logged (the existing effort-adjusted Epley estimate); bodyweight exercises use body weight plus added weight. Readiness and HRV come from synced devices and are skipped without enough readings (at least 4 in the last 7 days and 10 in the baseline).

It stays quiet in two cases: with fewer than three trained weeks of history, and when last week was already clearly lighter (65% or less of the hard sets of the three weeks before it).

**The proposed lighter week** is the following week, at about **50 to 60% of your usual sets** and **90 to 100% of your usual working loads**, with a hard-set target per muscle based on last week. Cutting sets and holding loads keeps your technique and strength practised while fatigue clears. These ranges follow common coaching practice, which is based on coach surveys (for example Bell et al., 2022) more than trials, so treat them as a starting point.

## Good to know

- Calorie summaries synced from a device are not workouts and are left out.
- Delegated viewers need the Reports permission, like the other exercise reports.
- No new data is stored. Everything is computed from your entries on request.
