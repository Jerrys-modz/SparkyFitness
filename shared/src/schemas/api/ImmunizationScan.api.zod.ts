import { z } from 'zod';
import { calendarDaySchema } from './calendarDay.zod.ts';
import { labReportScanRequestSchema } from './LabReportScan.api.zod.ts';

/**
 * What an AI reads off a vaccine record (a pharmacy printout, a clinic's
 * immunization history). One entry per vaccine given; a line without a date
 * is left out, since a record is a dated event.
 */
export const immunizationExtractionRecordSchema = z.object({
  vaccine_name: z.string().trim().min(1).max(200),
  administered_on: calendarDaySchema,
  dose_number: z.number().int().min(1).max(20).nullable(),
  lot_number: z.string().trim().min(1).max(80).nullable(),
  administered_by: z.string().trim().min(1).max(200).nullable(),
  site: z.string().trim().min(1).max(80).nullable(),
});

export const immunizationExtractionSchema = z.object({
  records: z.array(immunizationExtractionRecordSchema).max(200),
});

/** POST /api/v2/immunizations/scan: the same document body a lab report scan takes. */
export const immunizationScanRequestSchema = labReportScanRequestSchema;

/** A scanned record, flagged when the person already has that vaccine on that day. */
export const immunizationScanRecordSchema =
  immunizationExtractionRecordSchema.extend({
    already_recorded: z.boolean(),
  });

export const immunizationScanResponseSchema = z.object({
  records: z.array(immunizationScanRecordSchema),
});

/** POST /api/v2/immunizations/imports: the reviewed records of one scan. */
export const importImmunizationsBodySchema = z.object({
  records: z.array(immunizationExtractionRecordSchema).min(1).max(200),
});

export const importImmunizationsResponseSchema = z.object({
  created: z.number().int(),
});

export type ImmunizationExtraction = z.infer<
  typeof immunizationExtractionSchema
>;
export type ImmunizationExtractionRecord = z.infer<
  typeof immunizationExtractionRecordSchema
>;
export type ImmunizationScanRequest = z.infer<
  typeof immunizationScanRequestSchema
>;
export type ImmunizationScanRecord = z.infer<
  typeof immunizationScanRecordSchema
>;
export type ImmunizationScanResponse = z.infer<
  typeof immunizationScanResponseSchema
>;
export type ImportImmunizationsBody = z.infer<
  typeof importImmunizationsBodySchema
>;
export type ImportImmunizationsResponse = z.infer<
  typeof importImmunizationsResponseSchema
>;
