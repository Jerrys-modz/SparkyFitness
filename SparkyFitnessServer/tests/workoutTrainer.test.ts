import { describe, expect, it } from 'vitest';
import {
  applyTrainerOptions,
  estimateSessionMinutes,
  focusExercises,
  getWorkoutSplit,
  recommendWorkoutSplits,
  setsForMinutes,
  splitFitsVenue,
  TRAINER_FOCUSES,
  TRAINER_SESSION_MINUTES,
  WORKOUT_SPLIT_VENUES,
  WORKOUT_SPLITS,
  type TrainerAnswers,
  type WorkoutSplit,
  type WorkoutSplitVenue,
} from '@workspace/shared';
import snapshot from './fixtures/freeExerciseDbSplitExercises.json' with { type: 'json' };

const exercises: Record<string, { equipment: string | null }> = snapshot;

const EQUIPMENT_BY_VENUE: Record<WorkoutSplitVenue, string[]> = {
  home: ['dumbbell', 'body only', 'none'],
  garage: ['dumbbell', 'body only', 'none', 'barbell'],
  gym: [
    'dumbbell',
    'body only',
    'none',
    'barbell',
    'machine',
    'cable',
    'e-z curl bar',
  ],
};

const answers = (overrides: Partial<TrainerAnswers> = {}): TrainerAnswers => ({
  goal: 'muscle',
  level: 'beginner',
  daysPerWeek: 3,
  venue: 'gym',
  ...overrides,
});

const best = (a: TrainerAnswers) => recommendWorkoutSplits(a)[0];
const sets = (split: WorkoutSplit, index: number) =>
  split.sessions[index].exercises.reduce((sum, e) => sum + e.sets, 0);
const split = (id: string) => getWorkoutSplit(id)!;

describe('recommendWorkoutSplits', () => {
  it('picks the program with the days asked for, in the right venue', () => {
    expect(best(answers({ venue: 'home', daysPerWeek: 4 })).split.id).toBe(
      'upper_lower_4_home'
    );
    expect(best(answers({ venue: 'gym', daysPerWeek: 4 })).split.id).toBe(
      'upper_lower_4'
    );
    expect(
      best(answers({ venue: 'gym', level: 'intermediate', daysPerWeek: 6 }))
        .split.id
    ).toBe('push_pull_legs_6');
  });

  it('only offers programs that fit where the person trains', () => {
    for (const venue of WORKOUT_SPLIT_VENUES) {
      for (const rec of recommendWorkoutSplits(answers({ venue }), 20)) {
        expect(splitFitsVenue(rec.split, venue)).toBe(true);
      }
    }
  });

  it('prefers the strength program when there is one for the days', () => {
    const rec = best(answers({ goal: 'strength', venue: 'garage' }));
    expect(rec.split.id).toBe('linear_5x5');
    expect(rec.matchesGoal).toBe(true);
    expect(rec.daysDifference).toBe(0);
  });

  it('says so when the closest program has other days, goal or level', () => {
    const fiveDaysAtHome = best(answers({ venue: 'home', daysPerWeek: 5 }));
    expect(fiveDaysAtHome.daysDifference).not.toBe(0);

    const strengthAtHome = best(answers({ goal: 'strength', venue: 'home' }));
    expect(strengthAtHome.matchesGoal).toBe(false);

    const beginnerSixDays = best(answers({ daysPerWeek: 6 }));
    expect(beginnerSixDays.split.id).toBe('push_pull_legs_6');
    expect(beginnerSixDays.matchesLevel).toBe(false);
  });

  it('returns a few distinct programs, closest first', () => {
    const recs = recommendWorkoutSplits(answers({ venue: 'gym' }), 3);
    expect(recs).toHaveLength(3);
    expect(new Set(recs.map((r) => r.split.id)).size).toBe(3);
  });
});

describe('session length', () => {
  it('turns minutes into a set budget and back', () => {
    expect(setsForMinutes(40)).toBe(14);
    expect(setsForMinutes(60)).toBe(22);
    expect(setsForMinutes(80)).toBe(30);
    expect(estimateSessionMinutes(split('push_pull_legs_3').sessions[0])).toBe(
      45
    );
  });

  it('shortens every session to fit 40 minutes without losing its main lifts', () => {
    const base = split('push_pull_legs_3');
    const short = applyTrainerOptions(base, {
      venue: 'gym',
      sessionMinutes: 40,
    });
    short.sessions.forEach((session, i) => {
      expect(sets(short, i)).toBeLessThanOrEqual(14);
      expect(session.exercises.length).toBeGreaterThanOrEqual(3);
      expect(session.exercises.slice(0, 2).map((e) => e.exerciseId)).toEqual(
        base.sessions[i].exercises.slice(0, 2).map((e) => e.exerciseId)
      );
    });
  });

  it('leaves a program alone at 60 minutes with no focus', () => {
    for (const s of WORKOUT_SPLITS) {
      expect(applyTrainerOptions(s, { venue: s.venue })).toEqual(s);
    }
  });

  it('adds a set to the two main lifts at 80 minutes', () => {
    const base = split('push_pull_legs_3');
    const long = applyTrainerOptions(base, {
      venue: 'gym',
      sessionMinutes: 80,
    });
    const first = long.sessions[0].exercises;
    expect(first[0].sets).toBe(base.sessions[0].exercises[0].sets + 1);
    expect(first[1].sets).toBe(base.sessions[0].exercises[1].sets + 1);
    expect(first[2].sets).toBe(base.sessions[0].exercises[2].sets);
  });

  it('never changes the sets of a linear 5x5', () => {
    const base = split('linear_5x5');
    expect(
      applyTrainerOptions(base, { venue: 'garage', sessionMinutes: 40 })
    ).toEqual(base);
  });

  it('does not leave a superset of one exercise', () => {
    const short = applyTrainerOptions(split('upper_lower_4'), {
      venue: 'gym',
      sessionMinutes: 40,
    });
    for (const session of short.sessions) {
      const groups = session.exercises
        .map((e) => e.supersetGroup)
        .filter((g) => g !== undefined);
      for (const g of new Set(groups)) {
        expect(groups.filter((x) => x === g).length).toBeGreaterThan(1);
      }
    }
  });
});

describe('focus muscle', () => {
  it('adds one exercise to the sessions that train it, and only those', () => {
    const base = split('push_pull_legs_3_home');
    const fitted = applyTrainerOptions(base, { venue: 'home', focus: 'chest' });
    // Push trains chest; pull and legs do not.
    expect(fitted.sessions[0].exercises).toHaveLength(
      base.sessions[0].exercises.length + 1
    );
    expect(fitted.sessions[1]).toEqual(base.sessions[1]);
    expect(fitted.sessions[2]).toEqual(base.sessions[2]);
  });

  it('adds a core exercise to every full body session, varying between them', () => {
    const fitted = applyTrainerOptions(split('full_body_3_home'), {
      venue: 'home',
      focus: 'legs',
    });
    const added = fitted.sessions.map((s) => s.exercises.at(-1)!.exerciseId);
    expect(new Set(added).size).toBe(2);
  });

  it('never repeats an exercise within a session', () => {
    for (const s of WORKOUT_SPLITS) {
      for (const focus of TRAINER_FOCUSES) {
        const fitted = applyTrainerOptions(s, { venue: s.venue, focus });
        for (const session of fitted.sessions) {
          const ids = session.exercises.map((e) => e.exerciseId);
          expect(new Set(ids).size).toBe(ids.length);
        }
      }
    }
  });

  it('keeps the added exercise when the session is shortened', () => {
    const fitted = applyTrainerOptions(split('push_pull_legs_3'), {
      venue: 'gym',
      sessionMinutes: 40,
      focus: 'shoulders',
    });
    const [firstId] = focusExercises('shoulders', 'gym').map(
      (e) => e.exerciseId
    );
    expect(fitted.sessions[0].exercises.at(-1)!.exerciseId).toBe(firstId);
    expect(sets(fitted, 0)).toBeLessThanOrEqual(14);
  });
});

describe('every adjusted program', () => {
  it('uses known exercises that fit the person’s venue', () => {
    for (const s of WORKOUT_SPLITS) {
      for (const venue of WORKOUT_SPLIT_VENUES) {
        if (!splitFitsVenue(s, venue)) continue;
        for (const sessionMinutes of TRAINER_SESSION_MINUTES) {
          for (const focus of [undefined, ...TRAINER_FOCUSES]) {
            const fitted = applyTrainerOptions(s, {
              venue,
              sessionMinutes,
              focus,
            });
            for (const session of fitted.sessions) {
              expect(session.exercises.length).toBeGreaterThanOrEqual(3);
              for (const e of session.exercises) {
                const known = exercises[e.exerciseId];
                expect(
                  known,
                  `${e.exerciseId} is not in the snapshot`
                ).toBeDefined();
                const equipment = (known.equipment ?? 'none').toLowerCase();
                expect(
                  EQUIPMENT_BY_VENUE[venue],
                  `${s.id} ${venue} ${focus}: ${e.exerciseId} needs ${equipment}`
                ).toContain(equipment);
              }
            }
          }
        }
      }
    }
  });
});
