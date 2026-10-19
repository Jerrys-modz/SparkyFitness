# AGENTS.md

*Last updated: 2026-10-19*

`@workspace/shared` is a source-first TypeScript workspace library package for schemas, constants, and timezone/day helpers consumed by SparkyFitnessServer, SparkyFitnessFrontend, and SparkyFitnessMobile.

## Scope

- This package defines contracts and shared logic, not an app.
- Validate changes from consuming packages (server, frontend, mobile), not in isolation.
- Every schema change here potentially touches three packages.

## Structure

- `src/schemas/database/` - one Zod file per table (`Foods.zod.ts`, `Exercises.zod.ts`, ~60 files). Agent shortcut: to learn a table shape, read the matching file here instead of the SQL dump.
- `src/schemas/api/` - API request/response contracts (`*api.zod.ts`). `VoiceTranscription.api.zod.ts` defines multipart limits/MIME types, transcription responses, voice preference patches, and compatible public service options shared by web/mobile/server.
- `src/constants/` - shared constants and enums (exercises, nutrients, meal types, fasting protocols, medication schedules, cycle phases, etc.).
- `src/utils/` - timezone helpers (`todayInZone`, `instantToDay`, `dayToUtcRange`, `compareDays`, `addDays`, `isDayString`), cycle/menstruation helpers, unit/calculation utilities, the race plan generator (`racePlan.ts`, `buildRacePlan`), the run program schedule helpers (`runProgramSchedule.ts`, `runProgramCatchUp.ts`, `runProgramTimeline.ts`: `buildProgramTimeline` / `itemsByDay`, and `runProgramActions.ts`: the `PUT /api/v2/run-program` body builders; web and mobile both use them), and the training pace zones (`racePaceZones.ts`: `racePaceZones` turns a recent race result into easy, interval, tempo, marathon-pace and stride ranges with Riegel's formula; `equivalent5kPace` is the shared 5K conversion; `paceZones.ts` holds the effort-based `paceZones`, `thresholdPaceFromEffort` and `PACE_ZONE_IDS`), and the running fitness tests (`fitnessTest.ts`: `evaluateFitnessTest` turns a 5K time trial, a 30-minute all-out run (threshold = average pace of the last 20 minutes) or a 12-minute Cooper test (`cooperToFiveKSeconds`) into a threshold pace, an equivalent 5K time, the five `paceZones` and the `racePaceZones` ranges; `inclineSpeedFactor` / `applyIncline` for a treadmill test (ACSM running cost per metre relative to 1% incline, 0 to 15%), `comparePaces` for a retest, `retestStatus` for the six-to-eight-week window, and `levelFromFiveK`, `racePaceFromFiveK` and `programIdForFiveK` for starting a race plan or program from a test; `buildRacePlan` takes an optional `racePaceSecondsPerKm`). Run-program rules sit beside it: `runProgramSchedule.ts` (`projectRuns`, `countRunSlots`), `runProgramCatchUp.ts` (skip the fewest workouts), `runProgramAdjust.ts` (ease or lengthen) and `runProgramRealign.ts` (`realignProgram` rebuilds the rest of a plan to end on the goal day: drops repeats and the shortest easy runs first, folds lighter weeks, never touches the taper or final workout, keeps two runs a week for three-plus run days, stretches with repeated base weeks when there is room, eases after a long gap, and reports an unrealistic goal with the options; `applyRealign` is the confirmed change, `toRealignResult` the API shape). Its API contract is in `RunProgram.api.zod.ts` (`realignRunProgramBodySchema`, `runProgramRealignResultSchema`).
- `src/utils/gradeAdjustedPace.ts`, `gradeAdjustedTrack.ts`, `runningDynamics.ts` - grade-adjusted pace (the Minetti et al. 2002 cost-of-running model, a smoothed `ElevationProfile` with the gradient clamped to ±20%, `gradeAdjustedForSamples` over a track) and running-dynamics averages, series and the derived vertical ratio, used by mobile and web. Tests live in `SparkyFitnessServer/tests/` (`gradeAdjustedPace`, `gradeAdjustedTrack`, `runningDynamics`), because this package has no runner. Everything here must compile under the frontend's `noUncheckedIndexedAccess`.
- `src/nutrients/` - nutrient catalogs and the goal calculator used by web onboarding, the web Goals editor and mobile Goals (`nutrientCalculation.ts`: per-nutrient recommended values from age, sex, weight, calories and the saved algorithm choices; `nutrientAlgorithms.ts`: the algorithm enums and labels).
- `src/utils/trainingCalendar.ts` - planned-against-completed matching for the training calendar (`matchPlan`, `programSlots`, `weeklyPlanSlots`, `weeklyTotals`, `sportLoadOf`) on top of `trainingLoad.ts`'s `sessionLoad`; contract `src/schemas/api/TrainingCalendar.api.zod.ts`.
- `src/ai/`, `src/cycle/`, `src/medications/`, `src/mood/` - domain-specific helpers.
- Routes: `src/schemas/api/Route.api.zod.ts` (points, turn cues, bodies, run history: `routeRunSchema`, `attachEntryRouteBodySchema`; the best-run pace line the watch races: `routeGhostSchema`, `ROUTE_GHOST_INTERVAL_M`), `src/utils/routeGeometry.ts` (distance, climb, simplify, bounds), `src/utils/routeGhost.ts` (`buildGhostSplits`: a best run's GPS timeline to seconds at every 100 m of the route, even-pace fallback without a track) and `src/utils/routeGpx.ts` (dependency-free GPX read/write).
- Segments and heatmap: `src/schemas/api/Segment.api.zod.ts` (create bodies, `segmentSummarySchema`, `segmentEffortSchema`, `entrySegmentEffortSchema`, limits), `src/schemas/api/Heatmap.api.zod.ts` (`heatmapQuerySchema`, tuple cells, and `heatmapTracksQuerySchema` / `heatmapTracksResponseSchema` for the street-level lines), `src/schemas/database/Segments.zod.ts` and `SegmentEfforts.zod.ts`, `src/utils/segmentMatch.ts` (pure: `findSegmentPasses`, `bestSegmentPass`, `sliceRouteByDistance`, `prepareSegment`, `annotateEfforts`, `isSegmentPersonalBest`), `src/utils/heatmap.ts` (pure grid: `addTrackToHeatGrid`, `coarsenHeatGrid`, `sliceHeatGrid`, `nearestHeatCell`, and for lines `simplifyHeatTrack`, `heatPartBounds`, `boundsOverlap`, `countTracksNear`) and `src/utils/trackActivity.ts` (`trackActivityKind`, `segmentAcceptsActivity`). They build on `routeGeometry.ts` and are tested from the server (`tests/segmentMatch.test.ts`, `heatmapGrid.test.ts`).
- `src/symptoms/` - generic symptom tracking: constants and enums (scales, templates, sections, option kinds), template section resolution (`resolveSections`), built-in symptoms and pick-lists, head/body region ids for the location maps, and custom-field validation. The API contract is `src/schemas/api/Symptoms.api.zod.ts`.

## Naming Convention

- `X.api.zod.ts` = API request/response schema
- `X.zod.ts` = database table schema
- Export everything from `src/index.ts`; consuming packages import both types and values via `@workspace/shared`

## Cross-Package Contract Rules

- Changes to `src/schemas/api/` usually affect server routes and both frontend/mobile API clients.
- Changes to `src/schemas/database/` require matching server migrations and RLS policies when changing the stored schema. CI regenerates the schema backup after merge; never hand-edit or regenerate it locally. Mirroring existing columns missing from a Zod schema does not require another migration.
- Timezone/day-string helpers prevent bugs; prefer them over `toISOString().split('T')[0]`.
- Test any shared change from the consumer packages (`pnpm run validate` in SparkyFitnessServer, SparkyFitnessFrontend, and SparkyFitnessMobile after modifying shared).

## Working Rules

- Keep this package export-focused and schema-focused; logic that scales should live in consuming packages.
- Never export stale or unfinished types; if a consumer is drafting code and needs a type not yet here, add it.
