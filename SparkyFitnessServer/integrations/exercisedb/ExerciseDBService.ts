import axios from 'axios';
import { log } from '../../config/logging.js';
import { describeError } from '../../utils/errors.js';
import { normalizeEquipment, normalizeMuscle } from '@workspace/shared';

// Free hosted ExerciseDB V1 API by AscendAPI (https://oss.exercisedb.dev/docs).
// No key is needed. The free tier is for non-commercial use, serves 180p GIFs
// and applies strict rate limits, so every lookup here is a live call: nothing
// from the API is cached or downloaded, and the GIF is only ever referenced by
// the URL the API returns.
const EXERCISEDB_BASE_URL = 'https://oss.exercisedb.dev/api/v1';
const REQUEST_TIMEOUT_MS = 15 * 1000;
// The list endpoint caps a page at 25 rows.
const API_PAGE_SIZE = 25;
// Bounds the calls one search can make while walking the cursor to a deep page.
const MAX_PAGES_PER_SEARCH = 8;

// Vocabulary served by GET /muscles and GET /equipments. Used to translate the
// canonical filter names the clients send into the names the API understands.
const EXERCISEDB_MUSCLES = [
  'tibialis anterior',
  'hands',
  'sternocleidomastoid',
  'soleus',
  'adductors',
  'abdominals',
  'grip muscles',
  'wrist extensors',
  'wrist flexors',
  'latissimus dorsi',
  'pectorals',
  'rotator cuff',
  'wrists',
  'brachialis',
  'deltoids',
  'feet',
  'ankles',
  'trapezius',
  'rear deltoids',
  'quadriceps',
  'back',
  'core',
  'ankle stabilizers',
  'rhomboids',
  'obliques',
  'erector spinae',
  'hip flexors',
  'levator scapulae',
  'abductors',
  'serratus anterior',
  'forearms',
  'biceps',
  'upper back',
  'cardiovascular system',
  'triceps',
  'hamstrings',
  'glutes',
  'calves',
];

const EXERCISEDB_EQUIPMENT = [
  'stepmill machine',
  'elliptical machine',
  'trap bar',
  'tire',
  'stationary bike',
  'ab wheel',
  'smith machine',
  'hammer',
  'ski ergometer',
  'roller',
  'resistance band',
  'bosu ball',
  'weighted',
  'olympic barbell',
  'kettlebell',
  'upper body ergometer',
  'sled machine',
  'EZ bar',
  'dumbbell',
  'rope',
  'barbell',
  'stability ball',
  'medicine ball',
  'assisted',
  'leverage machine',
  'cable',
  'bodyweight',
  'towel',
  'tennis ball',
  'suspension trainer',
];

export interface ExerciseDBExercise {
  exerciseId: string;
  name: string;
  gifUrl: string;
  bodyParts: string[];
  equipments: string[];
  targetMuscles: string[];
  secondaryMuscles: string[];
  instructions: string[];
}

interface ExerciseDBListResponse {
  success: boolean;
  meta?: {
    total: number;
    hasNextPage: boolean;
    nextCursor?: string;
  };
  data: unknown;
}

interface ExerciseDBItemResponse {
  success: boolean;
  data: unknown;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => typeof v === 'string');
}

function toStringArray(value: unknown): string[] {
  return isStringArray(value) ? value : [];
}

/** The API prefixes every instruction with "Step:N ". The UI numbers them itself. */
function stripStepPrefix(instruction: string): string {
  return instruction.replace(/^\s*Step\s*:\s*\d+\s*/i, '').trim();
}

function toExercise(value: unknown): ExerciseDBExercise | null {
  if (typeof value !== 'object' || value === null) return null;
  const row = value as Record<string, unknown>;
  if (typeof row.exerciseId !== 'string' || typeof row.name !== 'string') {
    return null;
  }
  return {
    exerciseId: row.exerciseId,
    name: row.name,
    gifUrl: typeof row.gifUrl === 'string' ? row.gifUrl : '',
    bodyParts: toStringArray(row.bodyParts),
    equipments: toStringArray(row.equipments),
    targetMuscles: toStringArray(row.targetMuscles),
    secondaryMuscles: toStringArray(row.secondaryMuscles),
    instructions: toStringArray(row.instructions)
      .map(stripStepPrefix)
      .filter(Boolean),
  };
}

/**
 * ExerciseDB muscle names that belong to the given canonical muscle filters
 * (the names the exercise search UI sends, e.g. "chest" -> "pectorals").
 */
export function mapMuscleFilters(filters: string[]): string[] {
  const wanted = new Set(filters.map((f) => f.trim().toLowerCase()));
  return EXERCISEDB_MUSCLES.filter((muscle) => {
    const canonical = normalizeMuscle(muscle);
    return wanted.has(muscle) || (canonical !== null && wanted.has(canonical));
  });
}

/** ExerciseDB equipment names that belong to the given canonical equipment filters. */
export function mapEquipmentFilters(filters: string[]): string[] {
  const wanted = new Set(filters.map((f) => f.trim().toLowerCase()));
  return EXERCISEDB_EQUIPMENT.filter((equipment) => {
    const canonical = normalizeEquipment(equipment);
    return (
      wanted.has(equipment.toLowerCase()) ||
      (canonical !== null && wanted.has(canonical))
    );
  });
}

class ExerciseDBService {
  async getExerciseById(
    exerciseId: string
  ): Promise<ExerciseDBExercise | null> {
    try {
      const response = await axios.get<ExerciseDBItemResponse>(
        `${EXERCISEDB_BASE_URL}/exercises/${encodeURIComponent(exerciseId)}`,
        { timeout: REQUEST_TIMEOUT_MS }
      );
      return toExercise(response.data?.data);
    } catch (error) {
      log(
        'error',
        `[ExerciseDBService] Error fetching exercise ${exerciseId}:`,
        describeError(error)
      );
      return null;
    }
  }

  /**
   * Searches the catalogue. The API pages by cursor (25 rows), so a deep page
   * walks the cursor from the start; the walk is bounded by MAX_PAGES_PER_SEARCH.
   */
  async searchExercises(
    query: string | null | undefined,
    equipmentFilter: string[] = [],
    muscleGroupFilter: string[] = [],
    limit = 50,
    offset = 0
  ): Promise<{ exercises: ExerciseDBExercise[]; totalCount: number }> {
    const muscles = mapMuscleFilters(muscleGroupFilter);
    const equipments = mapEquipmentFilters(equipmentFilter);

    // A filter that maps to nothing in this catalogue can match nothing.
    if (
      (muscleGroupFilter.length > 0 && muscles.length === 0) ||
      (equipmentFilter.length > 0 && equipments.length === 0)
    ) {
      return { exercises: [], totalCount: 0 };
    }

    const params: Record<string, string> = { limit: String(API_PAGE_SIZE) };
    const name = query?.trim();
    if (name) params.name = name;
    if (muscles.length > 0) params.targetMuscles = muscles.join(',');
    if (equipments.length > 0) params.equipments = equipments.join(',');

    const wanted = offset + limit;
    const collected: ExerciseDBExercise[] = [];
    let totalCount = 0;
    let cursor: string | undefined;

    try {
      for (let page = 0; page < MAX_PAGES_PER_SEARCH; page++) {
        const response = await axios.get<ExerciseDBListResponse>(
          `${EXERCISEDB_BASE_URL}/exercises`,
          {
            params: cursor ? { ...params, after: cursor } : params,
            timeout: REQUEST_TIMEOUT_MS,
          }
        );
        const body = response.data;
        const rows = Array.isArray(body?.data) ? body.data : [];
        for (const row of rows) {
          const exercise = toExercise(row);
          if (exercise) collected.push(exercise);
        }
        totalCount = body?.meta?.total ?? collected.length;
        cursor = body?.meta?.nextCursor;
        if (!body?.meta?.hasNextPage || !cursor || collected.length >= wanted) {
          break;
        }
      }
      return { exercises: collected.slice(offset, wanted), totalCount };
    } catch (error) {
      log(
        'error',
        `[ExerciseDBService] Error searching exercises for query "${query}":`,
        describeError(error)
      );
      return { exercises: [], totalCount: 0 };
    }
  }
}

const exerciseDBService = new ExerciseDBService();
export default exerciseDBService;
