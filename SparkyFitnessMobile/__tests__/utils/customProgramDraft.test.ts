import {
  addStep,
  addWorkout,
  cycleStepKind,
  draftFromProgram,
  draftProblem,
  draftToInput,
  duplicateWorkout,
  emptyDraft,
  moveWorkout,
  nudgeStep,
  removeStep,
  removeWorkout,
  setWorkoutTitle,
  workoutSeconds,
} from '../../src/utils/customProgramDraft';

describe('customProgramDraft', () => {
  it('starts with one workout and needs a name', () => {
    const draft = emptyDraft();
    expect(draft.workouts).toHaveLength(1);
    expect(draftProblem(draft)).toBe('name');
    expect(draftProblem({ ...draft, name: ' My plan ' })).toBeNull();
  });

  it('refuses a workout with no steps or a plan with no workouts', () => {
    const draft = { ...emptyDraft(), name: 'x' };
    expect(draftProblem(removeWorkout(draft, 0))).toBe('noWorkouts');
    let emptied = draft;
    for (let i = 0; i < 3; i++) emptied = removeStep(emptied, 0, 0);
    expect(draftProblem(emptied)).toBe('emptyWorkout');
  });

  it('adds, copies, moves and removes workouts', () => {
    let draft = setWorkoutTitle({ ...emptyDraft(), name: 'x' }, 0, 'Long');
    draft = addWorkout(draft);
    draft = duplicateWorkout(draft, 0);
    expect(draft.workouts.map((w) => w.title)).toEqual(['Long', 'Long', '']);
    // The copy is independent of the original.
    draft = nudgeStep(draft, 1, 1, 1);
    expect(draft.workouts[0].steps[1].seconds).toBe(1200);
    expect(draft.workouts[1].steps[1].seconds).toBe(1260);
    draft = moveWorkout(draft, 2, -2);
    expect(draft.workouts[0].title).toBe('');
    expect(moveWorkout(draft, 0, -1)).toBe(draft);
    expect(removeWorkout(draft, 0).workouts).toHaveLength(2);
  });

  it('adds recovery after work, work after anything else', () => {
    let draft = emptyDraft();
    draft = addStep(draft, 0);
    expect(draft.workouts[0].steps.at(-1)?.kind).toBe('work');
    draft = addStep(draft, 0);
    expect(draft.workouts[0].steps.at(-1)?.kind).toBe('recovery');
  });

  it('cycles a step through the kinds', () => {
    let draft = emptyDraft();
    draft = cycleStepKind(draft, 0, 0);
    expect(draft.workouts[0].steps[0].kind).toBe('work');
    draft = cycleStepKind(
      cycleStepKind(cycleStepKind(draft, 0, 0), 0, 0),
      0,
      0
    );
    expect(draft.workouts[0].steps[0].kind).toBe('warmup');
  });

  it('nudges a step in half minutes, then minutes, never below 30 s', () => {
    let draft = emptyDraft();
    draft = nudgeStep(draft, 0, 0, -1);
    expect(draft.workouts[0].steps[0].seconds).toBe(270);
    draft = nudgeStep(emptyDraft(), 0, 0, 1);
    expect(draft.workouts[0].steps[0].seconds).toBe(360);
    let tiny = emptyDraft();
    for (let i = 0; i < 20; i++) tiny = nudgeStep(tiny, 0, 0, -1);
    expect(tiny.workouts[0].steps[0].seconds).toBe(30);
  });

  it('converts to the request and back', () => {
    let draft = { ...emptyDraft(), name: '  Mine ', activity: 'walk' as const };
    draft = setWorkoutTitle(draft, 0, ' Easy ');
    const input = draftToInput(draft);
    expect(input.name).toBe('Mine');
    expect(input.workouts[0].title).toBe('Easy');
    expect(input.workouts[0].plan.style).toBe('fastEasy');
    expect(workoutSeconds(draft.workouts[0])).toBe(1800);
    const back = draftFromProgram({
      id: 'id',
      name: 'Mine',
      activity: 'walk',
      workouts: input.workouts.map((w, i) => ({
        ...w,
        week: 0,
        day: i,
      })),
      created_at: '',
      updated_at: '',
    });
    expect(back.workouts[0].title).toBe('Easy');
    expect(back.workouts[0].steps).toHaveLength(3);
  });
});
