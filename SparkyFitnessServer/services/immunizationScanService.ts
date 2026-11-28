import {
  immunizationExtractionSchema,
  type ImmunizationExtraction,
  type ImmunizationScanRecord,
  type ImmunizationResponse,
} from '@workspace/shared';
import {
  extractDocumentJson,
  type DocumentScanErrorCategory,
} from './documentScanService.js';

const IMMUNIZATION_PROMPT =
  'Read this vaccine or immunization record and return a JSON object with one field: ' +
  'records (array, one entry for every vaccine that was GIVEN, in the order printed). ' +
  'Each record has vaccine_name (string, the vaccine as printed, e.g. "Influenza", "Tdap", "COVID-19"), ' +
  'administered_on (string YYYY-MM-DD, the date it was given; leave the whole entry out when no date is shown), ' +
  'dose_number (integer, which dose of a series it was; null when not shown), ' +
  'lot_number (string, null when not shown), ' +
  'administered_by (string, the pharmacy, clinic or person who gave it; null when not shown), ' +
  'site (string, such as "Left arm"; null when not shown). ' +
  'Leave out vaccines that are only recommended, declined or due in the future, and leave out patient details. ' +
  'Never invent a value that is not printed. Return only the JSON object, no other text.';

export type ImmunizationScanErrorCategory = DocumentScanErrorCategory;

export type ExtractImmunizationsResult =
  | { success: true; extraction: ImmunizationExtraction }
  | {
      success: false;
      category: ImmunizationScanErrorCategory;
      error: string;
    };

const asText = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() !== '' ? value.trim() : null;

function asDate(value: unknown): string | null {
  const text = asText(value);
  if (!text || !/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  const parsed = new Date(`${text}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== text
    ? null
    : text;
}

function asDose(value: unknown): number | null {
  const n = typeof value === 'string' ? Number(value.trim()) : value;
  return typeof n === 'number' && Number.isInteger(n) && n >= 1 && n <= 20
    ? n
    : null;
}

/**
 * Shapes a model's JSON into the extraction contract. A record without a name
 * or a real date is dropped; loose optional values become null. Returns null
 * when nothing usable is left.
 */
export function normalizeImmunizations(
  raw: unknown
): ImmunizationExtraction | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const source = raw as Record<string, unknown>;
  const records = (Array.isArray(source.records) ? source.records : []).flatMap(
    (row: unknown) => {
      if (typeof row !== 'object' || row === null) return [];
      const item = row as Record<string, unknown>;
      const vaccine_name = asText(item.vaccine_name);
      const administered_on = asDate(item.administered_on);
      if (!vaccine_name || !administered_on) return [];
      return [
        {
          vaccine_name,
          administered_on,
          dose_number: asDose(item.dose_number),
          lot_number: asText(item.lot_number),
          administered_by: asText(item.administered_by),
          site: asText(item.site),
        },
      ];
    }
  );
  const parsed = immunizationExtractionSchema.safeParse({ records });
  return parsed.success && parsed.data.records.length > 0 ? parsed.data : null;
}

/** Marks each record the person already has: same vaccine (any case) on the same day. */
export function flagAlreadyRecorded(
  extraction: ImmunizationExtraction,
  existing: Pick<ImmunizationResponse, 'vaccine_name' | 'administered_on'>[]
): ImmunizationScanRecord[] {
  const known = new Set(
    existing.map(
      (record) =>
        `${record.vaccine_name.trim().toLowerCase()}|${record.administered_on}`
    )
  );
  return extraction.records.map((record) => ({
    ...record,
    already_recorded: known.has(
      `${record.vaccine_name.toLowerCase()}|${record.administered_on}`
    ),
  }));
}

export async function extractImmunizations(
  base64Document: string,
  mimeType: string,
  userId: string,
  actorIsAdmin = false
): Promise<ExtractImmunizationsResult> {
  const read = await extractDocumentJson({
    base64Document,
    mimeType,
    userId,
    actorIsAdmin,
    prompt: IMMUNIZATION_PROMPT,
    textHeading: 'Vaccine record text:',
    noun: 'record',
    items: 'vaccines',
    logLabel: 'Immunization scan',
  });
  if (!read.success) return read;
  const extraction = normalizeImmunizations(read.json);
  if (!extraction) {
    return {
      success: false,
      category: 'parse_error',
      error: 'No vaccines could be read from the record',
    };
  }
  return { success: true, extraction };
}
