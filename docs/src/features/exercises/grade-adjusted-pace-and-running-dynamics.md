# Grade-Adjusted Pace & Running Dynamics

Two things the running apps on your wrist show for a run, now on a run's detail screen too: **grade-adjusted pace (GAP)**, which evens out hills, and **running dynamics**, the form numbers a watch or sensor measures with every step. Neither needs any setup. A number appears only when the run has the data for it, and nothing is estimated to fill a gap.

## Where to find them

- **Mobile:** Exercise Statistics → Cardio → tap a run, a walk or a ride. The stat tiles come first, the charts further down.
- **Web:** open the activity report for a workout. The tiles are in the stats grid and the charts follow the pace chart.
- **After recording a run:** the summary shows **Avg GAP** and a GAP line under each split when the route has elevation.

## Grade-adjusted pace

Running 5:00 per kilometre uphill takes far more effort than 5:00 on the flat. GAP converts each stretch of a run to the flat pace that would cost about the same effort, so a hilly run and a flat one can be compared.

- **Pace chart:** a **Grade adjusted** switch adds a second line to the Pace chart. It is drawn only over stretches that have a gradient, and the plain pace stays on the chart for comparison.
- **Avg GAP tile:** the whole run's average, worked out as moving time over flat-equivalent distance, so a steep climb counts for the effort it took rather than being averaged in as a pace.
- **Splits:** after recording, each split and lap shows its GAP under the pace.

### The model

GAP uses the energy cost of running on a slope measured by Minetti et al.:

> Minetti AE, Moia C, Roi GS, Susta D, Ferretti G. *Energy cost of walking and running at extreme uphill and downhill slopes.* Journal of Applied Physiology 93(3):1039–1046, 2002. doi:10.1152/japplphysiol.01177.2001

The cost of running a metre is `Cr(i) = 155.4 i⁵ − 30.4 i⁴ − 43.3 i³ + 46.3 i² + 19.5 i + 3.6` (joules per kilogram per metre), where `i` is the gradient as a fraction. Flat running costs 3.6, so a pace on a slope is divided by `Cr(i) / 3.6` to give its flat equivalent. A climb makes the equivalent pace faster, and a moderate descent makes it slower.

### How the gradient is read

GPS and watch altitude is noisy, so a raw point-to-point gradient would swing wildly. SparkyFitness:

1. Uses the altitude stored on the route. Whatever the source recorded is used as it is: an Apple Watch or iPhone fuses its barometer into the altitude, a Garmin file carries the device's own (usually barometric) altitude, and a phone recording uses the phone's.
2. Ignores readings that report a poor vertical accuracy (worse than 30 m, or marked invalid).
3. Averages altitude over a 50 m stretch of the route around each point.
4. Reads each gradient over at least 30 m, and **clamps it to ±20%**.

### When GAP is hidden

GAP is left out, not shown as the plain pace, when the route has no altitude, when fewer than 70% of its points have a usable one, when the altitude never changes (a stuck sensor), or when less than 80% of the distance could be graded. Indoor sessions have no GAP.

It is an estimate of effort on the flat. It does not account for wind, surface, heat or fatigue, and on a steep descent real running is often braking-limited, so treat it as a guide for comparing runs rather than a race predictor.

## Running dynamics

These come from the device, not from SparkyFitness. Each tile, chart and note is hidden when the run does not have that measurement.

| Measure | What it is | Where it comes from |
| --- | --- | --- |
| **Ground contact time** | How long each foot stays on the ground per step, in milliseconds | Apple Watch (watchOS 9+, via Apple Health), Garmin watches and running pods |
| **Vertical oscillation** | How far your torso bounces up and down with each step. Centimetres, or inches with the miles setting | Apple Watch, Garmin |
| **Vertical ratio** | Vertical oscillation as a percentage of step length. Lower means less of each step goes up instead of forward | Worked out from the two measurements above (and the step length); not a separate sensor reading |
| **Power** | The effort your watch or sensor estimates, in watts | Apple Watch (running power), Garmin, Stryd and other sensors |
| **Cadence and stride length** | Steps per minute and the distance of a step | See [GPS Activity Recording](/features/exercises/gps-activity-recording) for phone-recorded runs; watches report them too |

Each tile shows the run's average. When the route carries enough readings you also get a chart across the run, and every metric comes with a short note on what the number means. The notes are general information, not medical advice, and the numbers vary with pace, terrain and the device, so compare your own runs from the same device.

### Where the data comes from

- **Apple Health (iPhone and Apple Watch):** running ground contact time, vertical oscillation, step length and power are read for each workout, the same way heart rate is. They need an Apple Watch with iOS 16 / watchOS 9 or later (or a compatible sensor) and permission to read those types. A run recorded with the iPhone alone has none of them.
- **Garmin (Connect sync and `.fit` import):** ground contact time, vertical oscillation, step length and power are read from each record of the activity when the device recorded them. Garmin's vertical ratio and ground contact balance are not stored: the ratio is worked out from oscillation and step length instead, and balance is not shown.
- **Strava and Health Connect** do not provide these measurements.

Runs stored before this was added keep what they had: the per-step values are only on activities imported afterwards, and an older run may show just the average, or nothing.
