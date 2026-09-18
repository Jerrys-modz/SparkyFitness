# Polar Endpoint Expansion — Implementation Plan

*Written for an implementing agent with no prior context. Every path, signature and
line reference below was verified against the tree at the time of writing; re-check
line numbers if the files have moved.*

---

## 1. Context

Issue #2471 reported that Polar synced data but daily metrics never appeared in
Reports or the Diary. PR #2525 fixed that: steps now reach
`check_in_measurements.steps`, and a `daily_health_metrics` row is written with
`source_provider: 'polar'` carrying steps, distance, calories, resting heart rate
and VO2 max.

While fixing it we established that the integration requests only **6 of the ~13
endpoint families** Polar AccessLink exposes. This document plans the rest.

### What is fetched today

All in `SparkyFitnessServer/integrations/polar/polarService.ts`, base
`https://www.polaraccesslink.com/v3` (line 12):

| Endpoint                                        | Fetcher                      |
| ----------------------------------------------- | ---------------------------- |
| `/exercises?samples=true&zones=true`            | `fetchRecentExercises`       |
| `/users/activities?from=&to=`                   | `fetchRecentDailyActivity`   |
| `/users/sleep`                                  | `fetchRecentSleepData`       |
| `/users/nightly-recharge`                       | `fetchRecentNightlyRecharge` |
| `/users/{externalUserId}`                       | `fetchUserProfile`           |
| `/users/{id}/physical-information-transactions` | `fetchPhysicalInfo`          |

### What is not fetched

Cardio Load · Continuous HR · SpO2 · Body Temperature · Skin Temperature ·
Activity step samples · ECG.

(SleepWise is deliberately excluded from this plan — see §5.3.)

### The diagnostic bundle is not the limitation

Every fetcher already calls `logRawResponse`, so the capture layer records whatever
is requested. Add a fetcher and it appears in future bundles automatically. Do not
"fix" the bundle generator — there is nothing wrong with it.

### 1.1 Database and UI changes required — summary

**Almost nothing here needs a database change. Almost everything needs UI work.**
That is the opposite of the usual assumption, so read this table before scoping.

| Work item                        | Phase | New DB? | New UI?                    | Notes                                                                                                                                                 |
| -------------------------------- | ----- | ------- | -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cardio Load                      | 1     | **No**  | **Yes — small**            | Columns exist (`weekly_/acute_/chronic_training_load`, `acwr_ratio`). Add a tile to the existing `DailyHealthMetricsCard` + widen the selector (§2.3) |
| Overnight HRV series             | 2     | **No**  | **Yes — builds the layer** | `hrv` already allowed. No samples frontend exists: service fn + hook + chart all new (§4.8)                                                           |
| Continuous heart rate            | 2     | **No**  | **Reuses layer**           | `heart_rate` already allowed. Cheap once HRV has built the samples frontend                                                                           |
| SpO2 spot tests                  | 2     | **No**  | **Reuses layer**           | `spo2` already allowed. Note these are discrete **test results**, not an all-day curve — see §4.7                                                     |
| Body temperature                 | 3     | **No**  | **Yes — separate layer**   | `vitals_entries.body_temperature_celsius` exists, but there is **no vitals frontend at all**, and it is a different endpoint from samples             |
| **Skin temperature as a series** | 3     | **Yes** | **Reuses samples layer**   | New `metric` value → widen `chk_health_metric_samples_metric` + 3 zod edits (§5.2)                                                                    |
| ECG                              | —     | n/a     | n/a                        | Recommended out of scope (§5.4)                                                                                                                       |

**Reading the UI column.** Three distinct frontend surfaces are in play, and they
do not share code:

1. `daily_health_metrics` → `DailyHealthMetricsCard` — **exists**, so adding a
   metric here is one tile plus a selector entry.
2. `health_metric_samples` → **nothing exists.** The first metric to use it pays
   for the whole layer (service function, hook, chart); every later one is nearly
   free. This is why HRV is the recommended starting point.
3. `vitals_entries` → **nothing exists**, and it is a different endpoint from
   samples, so body temperature does not benefit from the Phase 2 layer.
4. `custom_measurements` → **exists and is automatic** (`CustomCategoryReport`).
   Anything routed here surfaces with no frontend work, at the cost of being a
   generic chart rather than a purpose-built display.

**Implication for sequencing.** Phases 1 and 2 touch the database not at all — no
migration, no RLS review, no schema-backup sync, no security-tier docs. Only skin
temperature pulls in `agent-docs/new-migration-checklist.md`. The real cost across
this plan is frontend, not schema.

Note that "no DB change" does **not** mean "no schema file change": a new *metric
value* still requires editing the shared zod schemas even when the table itself is
untouched — and that is a runtime failure if missed. See §5.2 step 3.

---

## 2. Read this before scoping anything

### 2.1 There is no frontend consumer for intraday samples

Grepping `SparkyFitnessFrontend/src` for `health_metric_samples`, `vitals_entries`,
`generic-health/samples` or `generic-health/vitals` returns **nothing**. Only
`daily_health_metrics` has a UI path.

**Consequence:** HRV series, continuous HR and SpO2 will land in the database and
be queryable over the API, but will appear **nowhere in the product** until a
service function, a hook and a chart component are written from scratch. Budget for
that; it is the majority of the work in Phase 2, not an afterthought.

### 2.2 The existing card renders only 13 fields

`SparkyFitnessFrontend/src/components/Health/DailyHealthMetricsCard.tsx` renders:
`body_battery_highest/lowest/charged/drained`, `avg_stress_level`,
`max_stress_level`, `resting_heart_rate`, `heart_rate_recovery_1min`, `vo2_max`,
`fitness_age`, `training_readiness_score`, `recovery_time_hours`, `source_provider`.

Training-load columns exist in the database but **are not rendered**. Even Phase 1
therefore needs a frontend change.

### 2.3 The card's visibility gate must be widened alongside any new tile

`SparkyFitnessFrontend/src/utils/dailyHealthMetrics.ts` exports
`selectDisplayableHealthMetrics`, which picks the provider row carrying displayable
metrics. It currently keys on five fields only (`body_battery_highest`,
`avg_stress_level`, `resting_heart_rate`, `vo2_max`, `training_readiness_score`).

`daily_health_metrics` holds **one row per provider per day** and the API orders
only by `entry_date`, so for a multi-provider user the first row is arbitrary. If
you add a tile without adding its field to this selector, a Polar-only row will be
skipped and the tile will never render. This exact bug hid the card entirely before
PR #2525.

### 2.4 Two standing oddities

**Physical information is a one-shot transaction.** `fetchPhysicalInfo` calls
`createTransaction(..., 'physical-information')`. Polar transactions are consumed
once committed, so VO2 max, resting HR, max HR and the aerobic/anaerobic thresholds
appear only when Polar has new data. They cannot be replayed on demand from a
captured bundle, and their absence from a bundle is not a bug.

**`checkNotifications` is dead code.** Defined at
`integrations/polar/polarService.ts:203`, exported twice, and called from nowhere in
the server. Webhook-driven sync is half-built. Completing it would replace hourly
polling and is arguably higher value than any single endpoint below — but it is a
separate piece of work and is **out of scope for this document**.

---

## 3. Phase 1 — Cardio Load

The cheapest visible win. No migration.

**Storage already exists.** `daily_health_metrics` has `weekly_training_load`,
`acute_training_load`, `chronic_training_load` and `acwr_ratio`.

**Backend**

1. Add `fetchRecentCardioLoad` to `integrations/polar/polarService.ts` using the
   template in §6.1. Log key: `raw_cardio_load`.
2. Add `processPolarCardioLoad` to `integrations/polar/polarDataProcessor.ts`. It
   should write a **partial** `upsertDailyHealthMetrics` with only the columns it
   owns plus `source_provider: 'polar'`; the repository COALESCEs per column, so it
   merges with the activity and nightly-recharge writes for the same day.
   Precedent: `polarDataProcessor.ts:303`, `:456`, `:736`.
3. Wire both sync branches — see §6.3.

**Frontend**

4. Add a "Training Load" tile to `DailyHealthMetricsCard.tsx`, following the
   existing tile structure. Each tile is gated on its own headline value so
   providers that do not report it do not render a wall of `--`.
5. Add the headline field to `selectDisplayableHealthMetrics` in
   `src/utils/dailyHealthMetrics.ts` — see §2.3. **Skipping this is the most likely
   failure mode of this phase.**
6. Add i18n keys to `SparkyFitnessFrontend/public/locales/en/translation.json` under
   `dailyHealthMetrics`. **Only edit the `en` file** — the other 27 locales are
   machine-synced by a workflow and hand edits cause conflicts.

**Done when:** a Polar-only user sees a populated Training Load tile in the Diary
for a day with cardio-load data.

---

## 4. Phase 2 — Intraday samples (HRV, continuous HR, SpO2)

### 4.1 HRV needs no new API call

`raw_nightly_recharge` **already contains** `hrv_samples` — roughly 100 readings per
night at 5-minute intervals. `processPolarNightlyRecharge` currently reads only
`heart-rate-variability-avg` and discards the series. This is free data already on
disk.

Start here. It requires no new endpoint, no migration and no schema edit.

### 4.2 No schema work needed for these three

`heart_rate`, `hrv` and `spo2` are already permitted by both the database CHECK
constraint and the shared zod enum. Only §5 metrics need schema changes.

### 4.3 Use the bucketing writer, not the raw repository call

```ts
// SparkyFitnessServer/services/healthMetricSampleWriter.ts:68
export async function upsertSamplesByDay(
  userId: string,
  actingUserId: string,
  metric: HealthMetric,
  sourceProvider: string,
  flatSamples: FlatHealthSample[],
  options: SampleWriteOptions = {}   // { mode?: 'replace' | 'merge', window?: {startMs, endMs} }
): Promise<number>                   // returns number of day buckets written
```

`FlatHealthSample` (`:25`):
`{ entry_date: string; timestamp: Date; ex?: string; sl?: string; device_name?: string | null; [metricField: string]: unknown }`

### 4.4 Sample element shape

From `shared/src/schemas/database/HealthMetricSamples.zod.ts:37-64`. Base is
`{ t: ISO timestamp with offset, ex?: exercise_entries.id, sl?: sleep_entries.id }`,
extended per metric:

| metric         | fields                             |
| -------------- | ---------------------------------- |
| `heart_rate`   | `bpm`, `context?`                  |
| `hrv`          | `rmssd_ms?`, `sdnn_ms?`, `status?` |
| `respiration`  | `brpm`, `context?`                 |
| `spo2`         | `percentage`                       |
| `stress`       | `level`                            |
| `body_battery` | `level`                            |

**Units are encoded in the key name. There is no separate `unit` field.** Follow
that convention exactly.

### 4.5 Copy Garmin's caller as the template

`SparkyFitnessServer/services/garmin/garminHealthProcessor.ts:443-497` (heart rate)
and `:702-741` (SpO2). The SpO2 one shows the `new Date(\`${item.date}T12:00:00Z\`)`
midday-anchor trick for day-granular data — useful for any Polar metric that has a
date but no time.

### 4.6 Upsert is replace-per-day

`genericHealthRepository.ts:31` uses
`ON CONFLICT ... DO UPDATE SET samples = EXCLUDED.samples` — the whole day bucket is
replaced, not merged. A partial re-sync will overwrite a fuller earlier read unless
you pass `mode: 'merge'`. Think about which you want before writing.

### 4.7 SpO2 is a spot test, not a curve

Unlike HRV and continuous HR, Polar's SpO2 comes from `/v3/users/biosensing/spo2`
as discrete **test results** — a handful of readings, each with a pass/fail status,
not an all-day series. Fields in §6.4.

Two consequences:

- A line chart is the wrong display. Render these as individual readings with
  their `spo2_class` band, and honour `test_status`: anything other than
  `SPO2_TEST_PASSED` is an inconclusive measurement and must not be plotted as a
  real value.
- `health_metric_samples` with `metric: 'spo2'` still fits (the sample carries
  `percentage`), but consider whether `vitals_entries` is the better home given
  these are point-in-time clinical-style readings. Either works; decide before
  writing the processor rather than after.

### 4.8 Frontend layer — the bulk of this phase

The server endpoint already exists:
`GET /api/generic-health/samples?metric=&startDate=&endDate=`
(`SparkyFitnessServer/routes/genericHealthRoutes.ts:240`, handler `:71`). It
validates `metric` against the shared zod enum and 400s with the allowed list.

None of the following exist and all must be written:

- `fetchHealthMetricSamples` in `SparkyFitnessFrontend/src/api/Health/genericHealthService.ts`
  (mirror `fetchDailyHealthMetrics` at `:9`).
- `useHealthMetricSamples` plus a query key in `src/hooks/useGenericHealth.ts`
  (mirror `useDailyHealthMetrics` at `:15` and `genericHealthKeys` at `:5`).
- A consuming chart component. Follow the repo's chart conventions and reuse the
  existing Recharts patterns under `src/components/ExerciseCharts/` or
  `ZoomableChart.tsx` rather than introducing a new charting approach.

**Done when:** a user can see an overnight HRV curve in the UI, drawn from data that
was already being fetched and thrown away.

---

## 5. Phase 3 — Temperature

Most expensive. Do not start here.

### 5.1 Body temperature — cheap

`vitals_entries.body_temperature_celsius` already exists. Write through
`bulkUpsertVitals` (`genericHealthRepository.ts:161`), which upserts on
`(user_id, source_provider, timestamp)` with per-column COALESCE. No migration.
Note there is still no frontend consumer for vitals (§2.1).

### 5.2 Skin temperature as a series — full new-metric checklist

This is where an implementing agent is most likely to ship something broken. A new
`metric` value requires **all** of the following:

1. **Migration** widening `chk_health_metric_samples_metric`. The original is
   `db/migrations/20260730000000_create_generic_health_and_workout_tables.sql:153`.
   There is no widening precedent for this table — copy the style from
   `db/migrations/20250927212000_add_free_exercise_db_to_provider_type_check.sql`
   (`DROP CONSTRAINT IF EXISTS` then `ADD CONSTRAINT`).
   File name format: `YYYYMMDDHHMMSS_description.sql`.

2. **`shared/src/schemas/database/HealthMetricSamples.zod.ts` — three edit sites**,
   not one:
   - the `healthMetricSchema` enum (`:16`)
   - the read discriminated union (`:83`)
   - the initializer discriminated union (`:127`)
   plus a new `<metric>SampleSchema` extending `baseSampleSchema`.

3. Be aware that `healthMetricSampleWriter.ts:157` calls
   `healthMetricSamplesInitializerSchema.parse()` before any SQL runs. An unknown
   metric therefore **throws at runtime, not compile time** — if you do the
   migration but skip step 2, it will typecheck and then fail on first ingest.

4. **The cross-package checklist** in `agent-docs/new-migration-checklist.md`:
   review `db/rls_policies.sql`, update
   `docs/content/8.developer/11.database-security-tiers.md` and
   `docs/content/2.features/9.family-friends-sharing.md`. **Leave
   `db_schema_backup.sql` alone** — CI regenerates it and opens a sync PR.

5. Restart the server (`pnpm start` from `SparkyFitnessServer/`) to apply the
   migration.

### 5.3 SleepWise — deliberately excluded

Polar's SleepWise (hourly alertness forecasts and circadian bedtime) is **not in
scope**, and should not be added without revisiting this decision. Reasons:

1. **It is enum data, not numbers.** Alertness is
   `ALERTNESS_LEVEL_MINIMAL|VERY_LOW|LOW|HIGH|VERY_HIGH` per hourly band, not a
   scalar. It does not fit `health_metric_samples`, which stores numeric readings.
2. **No other provider has an equivalent.** Garmin has Body Battery, Oura and
   Fitbit have readiness scores — these are different concepts, not the same metric
   under other names. Ingesting Polar's version means only Polar users on supported
   devices ever see it, widening the per-provider divergence in the Diary card.
3. **SparkyFitness already computes the useful half.**
   `SparkyFitnessServer/services/sleepScienceService.ts` implements MCTQ
   methodology — `getMCTQStats` returns `sdWorkday`, `sdFreeday` and
   `socialJetlag`, with `classifyDaysAutomatically` and `circularMedian`. Mid-sleep
   on free days is the standard published proxy for circadian phase, which is
   essentially what Polar's circadian bedtime estimates. That path is fed by
   `sleep_entries`, which **every** sleep provider populates.

**If circadian bedtime is wanted, extend the existing sleep science rather than
ingesting Polar's.** One implementation, every provider, and it is visibly
SparkyFitness's own estimate rather than a near-copy of Polar's that will not match
the Flow app and will be reported as a bug.

### 5.4 ECG — recommend excluding

Nothing in this schema can hold a waveform, and `health_metric_samples` is a jsonb
array of scalar readings. Adding ECG means designing new storage for a fundamentally
different data shape. Out of scope unless separately prioritised.

---

## 6. Mechanics — applies to every phase

### 6.1 Fetcher template

Verbatim from `integrations/polar/polarService.ts:717`:

```ts
async function fetchRecentNightlyRecharge(userId: any, accessToken: any) {
  try {
    log('info', `Fetching recent Polar nightly recharge data (List API) for user ${userId}...`);
    const response = await axios.get(
      `${POLAR_API_BASE_URL}/users/nightly-recharge`,
      { headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' } }
    );
    logRawResponse('polar', 'raw_nightly_recharge', response.data);
    const rechargeData = response.data.recharges || [];
    log('info', `Fetched ${rechargeData.length} records for user ${userId}.`);
    return rechargeData;          // array; [] on error, never throws
  } catch (error) {
    log('error', `Error fetching nightly recharge: ${error.message}`);
    return [];
  }
}
```

New code must **not** copy the `any` parameter types or the `eslint-disable`
comments — see §7. Endpoints needing the Polar user id take
`(userId, externalUserId, accessToken)`; see `fetchUserProfile`.

The `logRawResponse` dataType string is the exact key the replay path reads back, so
choose it deliberately.

### 6.2 Register the fetcher in BOTH export blocks

`integrations/polar/polarService.ts` ends with a named `export { ... }` list
(around `:846-861`) **and** an `export default { ... }` object (around `:862-888`).
`services/polarService.ts` calls through the **default** export. Adding only the
named export yields `undefined is not a function` at runtime, with a clean
typecheck.

### 6.3 Wire BOTH sync branches

`services/polarService.ts` has two independent dispatch paths. The replay branch
does **not** reuse the live branch's logic — you must edit both.

**Live path.** Two-phase: fetch everything first, then process. `safeFetch` is
declared inline at `:195` and returns `null` on failure, so list-returning fetchers
are written `(await safeFetch(...)) || []`.

```ts
// Phase 1
const newCardioLoad = await safeFetch('cardio_load', () =>
  polarIntegrationService.fetchRecentCardioLoad(userId, accessToken)
);

// Phase 2
if (newCardioLoad && newCardioLoad.length > 0) {
  await polarDataProcessor.processPolarCardioLoad(userId, userId, newCardioLoad);
}
```

**Replay path.** Gated at `:33` on `POLAR_DATA_SOURCE` (env
`SPARKY_FITNESS_POLAR_DATA_SOURCE`, default `'polar'`). Loads a bundle via
`loadRawBundle('polar')` and reads by key, where each value is `{ data: <payload> }`:

```ts
if (responses['raw_cardio_load']) {
  await polarDataProcessor.processPolarCardioLoad(
    userId, userId, responses['raw_cardio_load'].data
  );
}
```

Some keys use fallback chains (`raw_sleep_list` then `raw_sleep`) or prefix scans
(`key.startsWith('raw_activity_item_')`). Match whichever the endpoint needs.

### 6.4 Verified endpoint paths and payload shapes

Taken from Polar's published OpenAPI spec (`https://www.polar.com/accesslink-api/swagger.yaml`).
Note the biosensing paths are **unhyphenated**.

| Data             | Path                                                            |
| ---------------- | --------------------------------------------------------------- |
| Cardio Load      | `/v3/users/cardio-load`, `/v3/users/cardio-load/date?from=&to=` |
| Continuous HR    | `/v3/users/continuous-heart-rate`                               |
| SpO2             | `/v3/users/biosensing/spo2`                                     |
| Body temperature | `/v3/users/biosensing/bodytemperature`                          |
| Skin temperature | `/v3/users/biosensing/skintemperature`                          |
| Activity samples | `/v3/users/activities/samples`                                  |
| ECG              | `/v3/users/biosensing/ecg`                                      |

**Cardio Load** returns one object per day for the last 28 days (days without data
carry `LOAD_STATUS_NOT_AVAILABLE`). Field mapping to `daily_health_metrics`:

| Polar field         | Meaning                          | Column                                       |
| ------------------- | -------------------------------- | -------------------------------------------- |
| `strain`            | average daily load, past 7 days  | `acute_training_load`                        |
| `tolerance`         | average daily load, past 28 days | `chronic_training_load`                      |
| `cardio_load_ratio` | strain ÷ tolerance               | `acwr_ratio`                                 |
| `cardio_load`       | per-session TRIMP                | no daily column — skip or custom measurement |

`cardio_load_status` and `cardio_load_level` are enums; treat as metadata.

**Continuous HR** returns `{ polar_user, date, heart_rate_samples: [{ heart_rate,
sample_time }] }`.

> **Timezone trap — read before implementing.** `sample_time` is `"HH:mm:ss"` in
> **device local time**, with no date and no UTC offset. The `t` field on a health
> metric sample requires a full ISO timestamp *with offset*. You must combine
> `date` + `sample_time` and source an offset from elsewhere. This is the same
> class of problem the sleep hypnogram hit (issue #2431) — see
> `hypnogramStageStartMs` in `polarDataProcessor.ts` for how that was solved,
> including the roll-past-midnight case. Do not assume the server's timezone.

**SpO2** is `spo2-test-result`: `{ source_device_id, test_time (unix seconds),
time_zone_offset (minutes), test_status, blood_oxygen_percent,
spo2_class, spo2_value_deviation_from_baseline }`. These are **discrete spot tests,
not a continuous curve** (see §4.7). Usefully, `time_zone_offset` *is* supplied
here, unlike continuous HR.

Anything not listed above must still be confirmed against the spec before use.

## 7. Conventions

Read `AGENTS.md` at the repo root and the relevant package guide
(`SparkyFitnessServer/AGENTS.md`, `SparkyFitnessFrontend/AGENTS.md`) before writing
code. The points most often missed:

- **No `any` in new code.** Do not copy legacy `any` signatures when extending an
  existing file, even when the surrounding code uses them. Define interfaces or
  import from `@workspace/shared`.
- Use `log()` from `config/logging.ts`, never `console.*`.
- Keep `YYYY-MM-DD` values as calendar-day strings; use the shared timezone helpers
  rather than `toISOString().split('T')[0]`.
- Extract shared logic on the **second** duplication, not the third.
- **Zero AI attribution** in commit messages, trailers, PR titles, PR bodies or
  comments. This repository is public; write as the repository author.
- These are **new features, not bug fixes**. The PR template carries a mandatory
  checkbox requiring a maintainer-approved GitHub issue for new features. Raise and
  get agreement on an issue before opening the PR.

---

## 8. Verification

**Per package** (run from the package directory):

- Server: `pnpm run validate` and `pnpm test` — test runner is **Vitest**.
- Frontend: `pnpm run validate` and `pnpm test` — test runner is **Jest**, not
  Vitest. Running `vitest` there fails with `describe is not defined`.
- `pnpm run validate` includes Knip dead-code checks; unused exports fail the build.

**Migrations:** `pnpm run test:migrations` needs its own database. CI runs
fresh-install and upgrade-path jobs on every PR against a disposable Postgres.

**Replay:** set `SPARKY_FITNESS_POLAR_DATA_SOURCE=local` and run a manual sync to
process a captured bundle without hitting the Polar API. Note
`SparkyFitnessServer/mock_data/` is gitignored, so bundles are local-only. The
replay path does **not** deduplicate activities, so it will not exercise
concurrency- or dedup-related logic.

**Per phase, finish with something visible on screen:**

| Phase | Done when                                                     |
| ----- | ------------------------------------------------------------- |
| 1     | Training Load tile renders in the Diary for a Polar-only user |
| 2     | An overnight HRV curve is visible in the UI                   |
| 3     | Temperature data appears in its chosen surface                |

A phase that only writes rows to the database is not finished — see §2.1.

---

## 9. Recommended order

1. **Phase 2's HRV slice first** if you want maximum value per unit of risk: the
   data is already fetched and discarded, and it forces the missing samples
   frontend to be built once, unlocking continuous HR and SpO2 cheaply afterwards.
2. **Phase 1** if you want something shipped quickly: smallest diff, no migration,
   reuses a card that already exists.
3. **Phase 3** last, and only after deciding whether skin temperature justifies a
   CHECK-constraint migration and its five-document checklist.

Ship all in one PR. So have all migrations in single SQL file.