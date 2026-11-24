import { z } from 'zod';

export const bloodPressureArmSchema = z.enum(['left', 'right']);
export type BloodPressureArm = z.infer<typeof bloodPressureArmSchema>;

export const bloodPressureBodyPositionSchema = z.enum([
  'sitting',
  'standing',
  'lying',
  'reclining',
]);
export type BloodPressureBodyPosition = z.infer<
  typeof bloodPressureBodyPositionSchema
>;

const systolicSchema = z.number().min(30).max(300);
const diastolicSchema = z.number().min(10).max(200);
const pulseSchema = z.number().min(20).max(300);

export const bloodPressureCreateSchema = z
  .object({
    /** ISO instant of the reading; defaults to now on the server. */
    timestamp: z.string().datetime({ offset: true }).optional(),
    systolic_mmhg: systolicSchema,
    diastolic_mmhg: diastolicSchema,
    pulse_bpm: pulseSchema.nullable().optional(),
    arm: bloodPressureArmSchema.nullable().optional(),
    body_position: bloodPressureBodyPositionSchema.nullable().optional(),
    note: z.string().max(500).nullable().optional(),
  })
  .refine((v) => v.systolic_mmhg > v.diastolic_mmhg, {
    message: 'Systolic must be higher than diastolic',
    path: ['systolic_mmhg'],
  });
export type BloodPressureCreate = z.infer<typeof bloodPressureCreateSchema>;

export const bloodPressureUpdateSchema = z
  .object({
    timestamp: z.string().datetime({ offset: true }),
    systolic_mmhg: systolicSchema,
    diastolic_mmhg: diastolicSchema,
    pulse_bpm: pulseSchema.nullable(),
    arm: bloodPressureArmSchema.nullable(),
    body_position: bloodPressureBodyPositionSchema.nullable(),
    note: z.string().max(500).nullable(),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, {
    message: 'Nothing to update',
  });
export type BloodPressureUpdate = z.infer<typeof bloodPressureUpdateSchema>;
