import { log } from '../../config/logging.js';
import {
  createGuardedFetch,
  PUBLIC_ONLY_AI_NETWORK_POLICY,
} from '../../utils/outboundUrlPolicy.js';
import externalProviderRepository from '../../models/externalProviderRepository.js';
import { normalizeEquipment, normalizeMuscle } from '@workspace/shared';

export const EXERCISEDB_OSS_PROVIDER_TYPE = 'exercisedb-oss';
export const EXERCISEDB_RAPIDAPI_PROVIDER_TYPE = 'exercisedb';
export type ExerciseDBProviderType =
  | typeof EXERCISEDB_OSS_PROVIDER_TYPE
  | typeof EXERCISEDB_RAPIDAPI_PROVIDER_TYPE;

export const DEFAULT_EXERCISEDB_OSS_URL = 'https://oss.exercisedb.dev';
const RAPIDAPI_HOST = 'exercisedb.p.rapidapi.com';
const REQUEST_TIMEOUT_MS = 15_000;

// RapidAPI is always a public host. The mirror URL is operator config, so an
// explicitly set EXERCISEDB_OSS_URL may point at a private network (a mirror
// self-hosted next to Sparky); the unset default stays public-only.
const publicFetch = createGuardedFetch(PUBLIC_ONLY_AI_NETWORK_POLICY);
const privateOkFetch = createGuardedFetch({
  allowPrivateNetwork: true,
  reason: 'env',
});

/** One exercise as the open-source mirror (and the v1 RapidAPI shape) returns it. */
interface RawExerciseDBExercise {
  exerciseId?: string;
  id?: string;
  name?: string;
  gifUrl?: string;
  imageUrl?: string;
  bodyParts?: string[];
  bodyPart?: string;
  equipments?: string[];
  equipment?: string;
  targetMuscles?: string[];
  target?: string;
  secondaryMuscles?: string[];
  instructions?: string[];
  description?: string;
  difficulty?: string;
  category?: string;
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
  /** Upstream media URL; rotates on the RapidAPI host, so imports download it. */
  mediaUrl: string | null;
}

export interface ExerciseDBSearchResult {
  exercises: MappedExerciseDBExercise[];
  totalCount: number;
  /** RapidAPI reports no total, so paging there is "full page means maybe more". */
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
  const id = raw.exerciseId ?? raw.id;
  const name = raw.name?.trim();
  if (!id || !name) return null;
  const bodyParts = raw.bodyParts ?? (raw.bodyPart ? [raw.bodyPart] : []);
  const equipment = raw.equipments ?? (raw.equipment ? [raw.equipment] : []);
  const primary = raw.targetMuscles ?? (raw.target ? [raw.target] : []);
  const instructions = (raw.instructions ?? [])
    .map(stripStepPrefix)
    .filter((step) => step !== '');
  return {
    id: String(id),
    name: titleCase(name),
    // ExerciseDB has a "cardio" body part; everything else is strength work.
    category: bodyParts.some((p) => p.toLowerCase() === 'cardio')
      ? 'cardio'
      : 'strength',
    level: raw.difficulty ? raw.difficulty.toLowerCase() : null,
    equipment: [...new Set(equipment.map(mapEquipment))],
    primary_muscles: [...new Set(primary.map(mapMuscle))],
    secondary_muscles: [
      ...new Set((raw.secondaryMuscles ?? []).map(mapMuscle)),
    ],
    instructions,
    description: raw.description?.trim() || instructions[0] || name,
    mediaUrl: raw.gifUrl ?? raw.imageUrl ?? null,
  };
}

/** Mirror base URL: `EXERCISEDB_OSS_URL` for self-hosters, else the community default. */
export function getExerciseDBOssBaseUrl(): string {
  const configured = process.env.EXERCISEDB_OSS_URL?.trim();
  return (configured || DEFAULT_EXERCISEDB_OSS_URL).replace(/\/+$/, '');
}

function ossFetcher(): typeof fetch {
  return process.env.EXERCISEDB_OSS_URL?.trim() ? privateOkFetch : publicFetch;
}

async function getRapidApiKey(
  providerId: string,
  userId: string
): Promise<string> {
  // The provider id arrives from the client; confirm the caller may use it
  // before its stored key is decrypted and sent upstream.
  const allowed =
    await externalProviderRepository.checkExternalDataProviderAccess(
      providerId,
      userId
    );
  if (!allowed) throw new Error('ExerciseDB provider not found.');
  const provider =
    await externalProviderRepository.getExternalDataProviderById(providerId);
  if (
    !provider ||
    provider.provider_type !== EXERCISEDB_RAPIDAPI_PROVIDER_TYPE
  ) {
    throw new Error('ExerciseDB provider not found.');
  }
  if (!provider.app_key) {
    throw new Error('ExerciseDB provider is missing its RapidAPI key.');
  }
  return provider.app_key;
}

async function requestJson(
  url: string,
  headers: Record<string, string> = {},
  fetcher: typeof fetch = publicFetch
): Promise<unknown> {
  const response = await fetcher(url, {
    headers: { Accept: 'application/json', ...headers },
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

async function search(
  userId: string,
  providerType: ExerciseDBProviderType,
  providerId: string,
  query: string,
  limit: number,
  offset: number
): Promise<ExerciseDBSearchResult> {
  const name = query.trim();
  if (providerType === EXERCISEDB_OSS_PROVIDER_TYPE) {
    const params = new URLSearchParams({
      limit: String(limit),
      offset: String(offset),
    });
    if (name) params.set('name', name);
    const body = asRecord(
      await requestJson(
        `${getExerciseDBOssBaseUrl()}/api/v1/exercises?${params.toString()}`,
        {},
        ossFetcher()
      )
    );
    const exercises = mapAll(body.data);
    const total = Number(asRecord(body.meta).total);
    const totalCount = Number.isFinite(total) ? total : exercises.length;
    return {
      exercises,
      totalCount,
      hasMore: offset + exercises.length < totalCount,
    };
  }

  const key = await getRapidApiKey(providerId, userId);
  const params = new URLSearchParams({
    limit: String(limit),
    offset: String(offset),
  });
  const path = name
    ? `/exercises/name/${encodeURIComponent(name.toLowerCase())}`
    : '/exercises';
  const rows = await requestJson(
    `https://${RAPIDAPI_HOST}${path}?${params.toString()}`,
    { 'X-RapidAPI-Key': key, 'X-RapidAPI-Host': RAPIDAPI_HOST }
  );
  const exercises = mapAll(rows);
  return {
    exercises,
    // No total from RapidAPI: report what is known and let a full page imply more.
    totalCount: offset + exercises.length,
    hasMore: exercises.length === limit,
  };
}

async function getById(
  userId: string,
  providerType: ExerciseDBProviderType,
  providerId: string,
  exerciseId: string
): Promise<MappedExerciseDBExercise | null> {
  const id = encodeURIComponent(exerciseId);
  if (providerType === EXERCISEDB_OSS_PROVIDER_TYPE) {
    const body = asRecord(
      await requestJson(
        `${getExerciseDBOssBaseUrl()}/api/v1/exercises/${id}`,
        {},
        ossFetcher()
      )
    );
    return mapExerciseDBExercise(asRecord(body.data) as RawExerciseDBExercise);
  }
  const key = await getRapidApiKey(providerId, userId);
  const row = await requestJson(
    `https://${RAPIDAPI_HOST}/exercises/exercise/${id}`,
    { 'X-RapidAPI-Key': key, 'X-RapidAPI-Host': RAPIDAPI_HOST }
  );
  return mapExerciseDBExercise(asRecord(row) as RawExerciseDBExercise);
}

export default { search, getById };
