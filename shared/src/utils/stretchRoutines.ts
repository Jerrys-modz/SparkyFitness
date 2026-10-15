/**
 * Starter stretching routines. Pure data: the server turns one into
 * `duration`-modality exercises plus a workout preset for the user.
 */

export interface StretchMove {
  /** Stable id, used as the exercise source_id so a move is created once per user. */
  id: string;
  name: string;
  primaryMuscles: string[];
  /** Seconds to hold each side (or the whole move when not per side). */
  holdSeconds: number;
  /** Hold once per side: the move is stored as two sets. */
  perSide: boolean;
  instructions: string;
}

export interface StretchRoutine {
  id: string;
  name: string;
  description: string;
  moves: StretchMove[];
}

const move = (
  id: string,
  name: string,
  primaryMuscles: string[],
  holdSeconds: number,
  perSide: boolean,
  instructions: string,
): StretchMove => ({
  id,
  name,
  primaryMuscles,
  holdSeconds,
  perSide,
  instructions,
});

const CALF = move(
  "calf-wall",
  "Calf Stretch (Wall)",
  ["calves"],
  30,
  true,
  "Hands on a wall, one leg back with the heel down and the knee straight. Lean in until you feel the calf stretch.",
);
const QUAD = move(
  "standing-quad",
  "Standing Quad Stretch",
  ["quadriceps"],
  30,
  true,
  "Stand tall, pull one heel toward your glute, knees together. Hold a wall for balance.",
);
const HAMSTRING = move(
  "hamstring-seated",
  "Seated Hamstring Stretch",
  ["hamstrings"],
  30,
  true,
  "Sit with one leg straight, the other bent in. Hinge from the hips toward the straight foot.",
);
const HIP_FLEXOR = move(
  "hip-flexor-lunge",
  "Kneeling Hip Flexor Stretch",
  ["hip flexors"],
  30,
  true,
  "Half-kneel, tuck the pelvis under and shift forward until the front of the rear hip stretches.",
);
const GLUTE = move(
  "figure-four",
  "Figure-Four Glute Stretch",
  ["glutes"],
  30,
  true,
  "On your back, cross an ankle over the opposite knee and pull that thigh toward your chest.",
);
const IT_BAND = move(
  "standing-it-band",
  "Standing IT Band Stretch",
  ["abductors"],
  30,
  true,
  "Cross one leg behind the other and lean away from the back leg until the outer hip stretches.",
);
const CHILD = move(
  "childs-pose",
  "Child's Pose",
  ["lower back"],
  45,
  false,
  "Kneel, sit back on your heels and reach your arms forward along the floor.",
);
const CAT_COW = move(
  "cat-cow",
  "Cat-Cow",
  ["lower back"],
  40,
  false,
  "On hands and knees, alternate arching and rounding your spine with your breath.",
);
const NECK = move(
  "neck-side",
  "Neck Side Stretch",
  ["neck"],
  20,
  true,
  "Tilt one ear toward the shoulder and let the weight of the head deepen the stretch.",
);
const CHEST = move(
  "doorway-chest",
  "Doorway Chest Stretch",
  ["chest"],
  30,
  false,
  "Forearms on a door frame, step through until the chest and front of the shoulders open.",
);

export const STRETCH_ROUTINES: readonly StretchRoutine[] = [
  {
    id: "post-run",
    name: "Post-Run Stretch",
    description: "Cool-down stretches for the legs and hips after a run.",
    moves: [CALF, QUAD, HAMSTRING, HIP_FLEXOR, GLUTE, IT_BAND],
  },
  {
    id: "hips-and-hamstrings",
    name: "Hips & Hamstrings",
    description:
      "Lower-body flexibility session for tight hips and hamstrings.",
    moves: [HIP_FLEXOR, GLUTE, HAMSTRING, CHILD],
  },
  {
    id: "desk-reset",
    name: "Desk Reset",
    description: "Quick neck, chest and back stretches for a long day sitting.",
    moves: [NECK, CHEST, CAT_COW, CHILD],
  },
];

export function getStretchRoutine(id: string): StretchRoutine | undefined {
  return STRETCH_ROUTINES.find((routine) => routine.id === id);
}

/** Source tag stored on the exercises created from these routines. */
export const STRETCH_EXERCISE_SOURCE = "starter-stretch";
