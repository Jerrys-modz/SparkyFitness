import { describe, expect, it } from 'vitest';
import {
  attachEntryRouteBodySchema,
  exerciseEntriesMutatorSchema,
  routeRunsResponseSchema,
  routeSummarySchema,
} from '@workspace/shared';

describe('route history contract', () => {
  it('accepts a route id or null and rejects anything else', () => {
    expect(
      attachEntryRouteBodySchema.safeParse({
        routeId: '3f2b8c1e-1d4a-4b6e-9c1a-0a1b2c3d4e5f',
      }).success
    ).toBe(true);
    expect(
      attachEntryRouteBodySchema.safeParse({ routeId: null }).success
    ).toBe(true);
    expect(attachEntryRouteBodySchema.safeParse({}).success).toBe(false);
    expect(
      attachEntryRouteBodySchema.safeParse({ routeId: 'nope' }).success
    ).toBe(false);
  });

  it('parses a run list', () => {
    const parsed = routeRunsResponseSchema.safeParse({
      runs: [
        {
          entryId: 'e1',
          date: '2026-10-16',
          durationSeconds: 1500,
          distanceM: null,
          paceSecPerKm: null,
          avgHeartRate: 150,
        },
      ],
    });
    expect(parsed.success).toBe(true);
    expect(routeRunsResponseSchema.safeParse({ runs: [{}] }).success).toBe(
      false
    );
  });

  it('requires the run stats on a summary', () => {
    const base = {
      id: 'r',
      name: 'Loop',
      activity: 'run',
      source: 'drawn',
      distanceM: 5000,
      elevationGainM: null,
      sourceExerciseEntryId: null,
      createdAt: 'a',
      updatedAt: 'b',
      start: null,
      pointCount: 2,
    };
    expect(routeSummarySchema.safeParse(base).success).toBe(false);
    expect(
      routeSummarySchema.safeParse({
        ...base,
        runCount: 0,
        bestDurationSeconds: null,
        lastRunDate: null,
      }).success
    ).toBe(true);
  });

  it('lets a diary entry carry a nullable route id', () => {
    const parsed = exerciseEntriesMutatorSchema.safeParse({
      user_id: 'u',
      route_id: null,
    });
    expect(parsed.success).toBe(true);
  });
});
