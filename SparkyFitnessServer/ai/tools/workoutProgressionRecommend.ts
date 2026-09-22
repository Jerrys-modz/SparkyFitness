import type {
  ProgressionIncrementType,
  ProgressionMode,
} from '@workspace/shared';

export const PROGRESSION_MODE_LABELS: Record<ProgressionMode, string> = {
  rep_goal: 'Total Rep Goal',
  fixed: 'Fixed Target',
  step_load: 'Step-Load (Reps Only)',
  manual: 'Manual (No Overload)',
};

export interface ProgressionRecommendation {
  progression_mode: ProgressionMode;
  rep_goal: number | null;
  increment_type: ProgressionIncrementType;
  increment_value: number;
  reason: string;
}

export interface RecommendProgressionInput {
  name: string;
  category?: string | null;
  modality?: string | null;
  equipment?: unknown;
  workingSets?: readonly {
    reps?: number | null;
    set_type?: string | null;
  }[];
}

function asList(value: unknown): string[] {
  if (!value) return [];
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed.map(String);
    } catch {
      /* not JSON */
    }
    if (value.includes(',')) {
      return value
        .split(',')
        .map((part) => part.trim())
        .filter(Boolean);
    }
    return value ? [value] : [];
  }
  return [];
}

function workingSetReps(
  sets: RecommendProgressionInput['workingSets']
): number[] {
  if (!sets) return [];
  return sets
    .filter((set) => {
      const type = (set.set_type ?? 'Working Set').toLowerCase();
      return !type.includes('warmup') && !type.includes('warm-up');
    })
    .map((set) => Number(set.reps) || 0)
    .filter((reps) => reps > 0);
}

/**
 * Pick a progression config from the in-app guide:
 * barbell compounds → Fixed Target, bodyweight → Step-Load,
 * cardio → Manual, everything else → Total Rep Goal.
 */
export function recommendProgression(
  input: RecommendProgressionInput
): ProgressionRecommendation {
  const equipment = asList(input.equipment);
  const haystack = [input.name, input.category, ...equipment]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  const reps = workingSetReps(input.workingSets);
  const setCount = reps.length || 3;
  const perSet = reps.length > 0 ? Math.min(...reps) : 8;
  const totalReps = reps.length > 0 ? reps.reduce((sum, n) => sum + n, 0) : 24;

  const modality = (input.modality ?? '').toLowerCase();
  if (
    modality === 'duration' ||
    modality === 'duration_distance' ||
    /\b(cardio|running|cycling|rowing|walk)\b/.test(haystack)
  ) {
    return {
      progression_mode: 'manual',
      rep_goal: null,
      increment_type: 'weight',
      increment_value: 2.5,
      reason:
        'Cardio and timed work has no weight/reps overload. Manual leaves the target alone.',
    };
  }

  if (
    /\b(bodyweight|calisthenic|pull-?up|chin-?up|dip|push-?up|pushup|plank)\b/.test(
      haystack
    ) ||
    (equipment.length === 1 && /^none$/i.test(equipment[0]))
  ) {
    return {
      progression_mode: 'step_load',
      rep_goal: totalReps,
      increment_type: 'reps',
      increment_value: 3,
      reason:
        'Bodyweight and calisthenics keep the load fixed and step the rep target up each time you hit it.',
    };
  }

  const isMachineOrIsolation =
    /\b(dumbbell|machine|cable|smith|kettlebell|goblet)\b/.test(haystack);
  if (
    /\bbarbell\b/.test(haystack) ||
    (!isMachineOrIsolation &&
      /\b(bench press|squat|deadlift|overhead press|ohp)\b/.test(haystack))
  ) {
    return {
      progression_mode: 'fixed',
      rep_goal: perSet,
      increment_type: 'weight',
      increment_value: 2.5,
      reason:
        'Heavy barbell compounds do best when every working set has to hit the target before the load moves.',
    };
  }

  return {
    progression_mode: 'rep_goal',
    rep_goal: totalReps,
    increment_type: 'weight',
    increment_value: equipment.some((item) => /dumbbell/i.test(item)) ? 2 : 2.5,
    reason: `Total Rep Goal fits machines, cables, dumbbells and accessories — ${setCount} working set${setCount === 1 ? '' : 's'} aiming for ${totalReps} reps combined, then a small load bump.`,
  };
}

export function formatProgressionSettings(input: {
  progression_mode?: string | null;
  rep_goal?: number | null;
  increment_type?: string | null;
  increment_value?: number | string | null;
}): string {
  const mode = (input.progression_mode ?? 'rep_goal') as ProgressionMode;
  const label = PROGRESSION_MODE_LABELS[mode] ?? mode;
  if (mode === 'manual') return `${label} (manual)`;
  const incrementType = input.increment_type ?? 'weight';
  const parsedIncrement = Number(input.increment_value);
  const incrementValue = parsedIncrement > 0 ? parsedIncrement : 2.5;
  const increment =
    incrementType === 'reps'
      ? `+${incrementValue} reps`
      : `+${incrementValue} kg`;
  const target =
    mode === 'fixed'
      ? `${input.rep_goal ?? 8} reps/set`
      : `${input.rep_goal ?? 24} total reps`;
  return `${label} · ${target} · ${increment}`;
}
