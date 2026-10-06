import NodeCache from 'node-cache';
import { log } from '../../config/logging.js';
import {
  createGuardedFetch,
  PUBLIC_ONLY_AI_NETWORK_POLICY,
} from '../../utils/outboundUrlPolicy.js';
import { normalizeEquipment, normalizeMuscle } from '@workspace/shared';

/**
 * The community-hosted ExerciseDB mirror. Its terms allow personal,
 * non-commercial and community use and ask for credit to AscendAPI; see
 * docs/src/features/exercises/exercise-catalogs.md.
 */
export const EXERCISEDB_OSS_PROVIDER_TYPE = 'exercisedb-oss';

const MIRROR_URL = 'https://oss.exercisedb.dev';
const REQUEST_TIMEOUT_MS = 15_000;
/** The mirror never returns more than this many exercises per request. */
const MIRROR_PAGE_SIZE = 25;

// Responses are untrusted, so calls go through the public-host guard.
const publicFetch = createGuardedFetch(PUBLIC_ONLY_AI_NETWORK_POLICY);

// The mirror pages by cursor only (`offset` is ignored). Remember the cursor
// that starts each page so a later page does not re-walk the earlier ones.
const cursorCache = new NodeCache({ stdTTL: 600, maxKeys: 1000 });
const cursorKey = (name: string, page: number) => `${name}\u0000${page}`;

/** One exercise as the community mirror returns it. */
interface RawExerciseDBExercise {
  exerciseId?: string;
  name?: string;
  gifUrl?: string;
  bodyParts?: string[];
  equipments?: string[];
  targetMuscles?: string[];
  secondaryMuscles?: string[];
  instructions?: string[];
}

/** An ExerciseDB record mapped onto the shape the exercise library imports. */
export interface MappedExerciseDBExercise {
  id: string;
  name: string;
  category: string;
  level: string | null;
  equipment: string[];
  primary_muscles: string[];
  secondary_muscles: string[];
  instructions: string[];
  description: string;
  /** The mirror's media URL; imports keep it as a link and never download it. */
  mediaUrl: string | null;
}

export interface ExerciseDBSearchResult {
  exercises: MappedExerciseDBExercise[];
  totalCount: number;
  hasMore: boolean;
}

function titleCase(value: string): string {
  return value.replace(/\b\w/g, (c) => c.toUpperCase());
}

function stripStepPrefix(step: string): string {
  return step.replace(/^\s*step\s*:?\s*\d+\s*[:.)-]?\s*/i, '').trim();
}

function mapEquipment(value: string): string {
  const canonical = normalizeEquipment(value);
  if (canonical) return canonical;
  const lower = value.trim().toLowerCase();
  // "leverage machine", "sled machine" and the like are all selectorised or
  // plate-loaded machines; anything else (e.g. "assisted") stays as written so
  // name-based type detection and the filters still see it.
  return lower.includes('machine') ? 'machine' : lower;
}

function mapMuscle(value: string): string {
  return normalizeMuscle(value) ?? value.trim().toLowerCase();
}

export function mapExerciseDBExercise(
  raw: RawExerciseDBExercise
): MappedExerciseDBExercise | null {
  const id = raw.exerciseId;
  const name = raw.name?.trim();
  if (!id || !name) return null;
  const instructions = (raw.instructions ?? [])
    .map(stripStepPrefix)
    .filter((step) => step !== '');
  return {
    id: String(id),
    name: titleCase(name),
    // ExerciseDB has a "cardio" body part; everything else is strength work.
    category: (raw.bodyParts ?? []).some((p) => p.toLowerCase() === 'cardio')
      ? 'cardio'
      : 'strength',
    level: null,
    equipment: [...new Set((raw.equipments ?? []).map(mapEquipment))],
    primary_muscles: [...new Set((raw.targetMuscles ?? []).map(mapMuscle))],
    secondary_muscles: [
      ...new Set((raw.secondaryMuscles ?? []).map(mapMuscle)),
    ],
    instructions,
    description: instructions[0] || name,
    mediaUrl: raw.gifUrl ?? null,
  };
}

async function requestJson(url: string): Promise<unknown> {
  const response = await publicFetch(url, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 200);
    log('error', `[ExerciseDB] ${response.status} from ${url}: ${detail}`);
    throw new Error(`ExerciseDB request failed with status ${response.status}`);
  }
  return response.json();
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)
    : {};
}

function mapAll(rows: unknown): MappedExerciseDBExercise[] {
  if (!Array.isArray(rows)) return [];
  return rows
    .map((row) => mapExerciseDBExercise(asRecord(row) as RawExerciseDBExercise))
    .filter((row): row is MappedExerciseDBExercise => row !== null);
}

async function fetchMirrorPage(name: string, page: number) {
  const params = new URLSearchParams({ limit: String(MIRROR_PAGE_SIZE) });
  if (name) params.set('name', name);
  if (page > 0) {
    const after = cursorCache.get<string>(cursorKey(name, page));
    if (!after) throw new Error('missing cursor');
    params.set('after', after);
  }
  const body = asRecord(
    await requestJson(`${MIRROR_URL}/api/v1/exercises?${params.toString()}`)
  );
  const meta = asRecord(body.meta);
  const nextCursor =
    meta.hasNextPage === true && typeof meta.nextCursor === 'string'
      ? meta.nextCursor
      : null;
  if (nextCursor) cursorCache.set(cursorKey(name, page + 1), nextCursor);
  const total = Number(meta.total);
  return {
    exercises: mapAll(body.data),
    total: Number.isFinite(total) ? total : null,
  };
}

/**
 * Exercises `offset`..`offset + limit` of a search. The mirror serves 25 at a
 * time and only by cursor, so this walks from the nearest remembered page.
 */
async function search(
  query: string,
  limit: number,
  offset: number
): Promise<ExerciseDBSearchResult> {
  const name = query.trim();
  const firstPage = Math.floor(offset / MIRROR_PAGE_SIZE);
  const lastPage = Math.floor((offset + limit - 1) / MIRROR_PAGE_SIZE);

  let start = firstPage;
  while (start > 0 && !cursorCache.has(cursorKey(name, start))) start -= 1;

  const gathered: MappedExerciseDBExercise[] = [];
  let total: number | null = null;
  let reachedEnd = false;
  for (let page = start; page <= lastPage; page += 1) {
    const result = await fetchMirrorPage(name, page);
    total = result.total ?? total;
    if (page >= firstPage) gathered.push(...result.exercises);
    if (result.exercises.length < MIRROR_PAGE_SIZE) {
      reachedEnd = true;
      break;
    }
  }

  const skip = offset - firstPage * MIRROR_PAGE_SIZE;
  const exercises = gathered.slice(skip, skip + limit);
  const totalCount =
    total ?? (reachedEnd ? offset + exercises.length : offset + limit + 1);
  return {
    exercises,
    totalCount,
    hasMore: offset + exercises.length < totalCount,
  };
}

async function getById(
  exerciseId: string
): Promise<MappedExerciseDBExercise | null> {
  const body = asRecord(
    await requestJson(
      `${MIRROR_URL}/api/v1/exercises/${encodeURIComponent(exerciseId)}`
    )
  );
  return mapExerciseDBExercise(asRecord(body.data) as RawExerciseDBExercise);
}

export default { search, getById };
