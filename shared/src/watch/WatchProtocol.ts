import { z } from "zod";

/**
 * Wire contract for messages the watch sends to the phone, shared by the
 * Apple Watch app (Swift), the Wear OS app (Kotlin) and the phone bridge
 * (`SparkyFitnessMobile/modules/watch-connectivity`).
 *
 * Neither watch app can import this file, so it is enforced by a contract
 * test (`SparkyFitnessMobile/__tests__/contracts/watchProtocol.test.ts`) that
 * parses `fixtures/*.json` with these schemas and checks every `type` string
 * and field key still appears in each platform's sources. Change a message
 * here, update its fixture, then update Swift and Kotlin until the test passes.
 *
 * Optional fields are OMITTED when absent, never sent as null: the phone
 * patches records with what arrives, so a null would erase a stored value.
 */

/** `type` strings on the wire, mapped to the event the phone bridge emits. */
export const WATCH_TO_PHONE_EVENTS = {
  checkIn: "onCheckIn",
  waterIntake: "onWaterIntake",
  waterDelete: "onWaterDelete",
  requestContext: "onContextRequest",
  setCompleted: "onSetCompleted",
  restChanged: "onRestChanged",
  heartRateBatch: "onHeartRateBatch",
  workoutStop: "onWorkoutStop",
} as const;

export type WatchToPhoneMessageType = keyof typeof WATCH_TO_PHONE_EVENTS;

/** `type` strings the phone sends to the watch. */
export const PHONE_TO_WATCH_TYPES = [
  "context",
  "ack",
  "workoutStart",
  "workoutStop",
  "intervalTiming",
  "setTargets",
] as const;

export type PhoneToWatchMessageType = (typeof PHONE_TO_WATCH_TYPES)[number];

const isoInstant = z.string().min(1);
const calendarDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const WatchCheckInMessageSchema = z.strictObject({
  type: z.literal("checkIn"),
  clientId: z.string().min(1),
  entryDate: calendarDay,
  weightKg: z.number(),
  bodyFatPercentage: z.number().optional(),
});

export const WatchWaterIntakeMessageSchema = z.strictObject({
  type: z.literal("waterIntake"),
  clientId: z.string().min(1),
  entryDate: calendarDay,
  containerId: z.number().int(),
});

export const WatchWaterDeleteMessageSchema = z.strictObject({
  type: z.literal("waterDelete"),
  clientId: z.string().min(1),
  entryId: z.string().min(1),
});

export const WatchRequestContextMessageSchema = z.strictObject({
  type: z.literal("requestContext"),
});

export const WatchSetCompletedMessageSchema = z.strictObject({
  type: z.literal("setCompleted"),
  clientId: z.string().min(1),
  sessionId: z.string().min(1),
  setId: z.string().min(1),
  weightKg: z.number().optional(),
  reps: z.number().optional(),
  completedAt: isoInstant.optional(),
});

/** Epoch-ms deadlines. `endsAt` is omitted when the rest was skipped. */
export const WatchRestChangedMessageSchema = z.strictObject({
  type: z.literal("restChanged"),
  clientId: z.string().min(1).optional(),
  sessionId: z.string().min(1),
  previousEndsAt: z.number(),
  endsAt: z.number().optional(),
});

export const WatchHeartRateSampleSchema = z.strictObject({
  t: isoInstant,
  bpm: z.number(),
});

export const WatchHeartRateBatchMessageSchema = z.strictObject({
  type: z.literal("heartRateBatch"),
  clientId: z.string().min(1).optional(),
  sessionId: z.string().min(1),
  exerciseEntryId: z.string().min(1),
  samples: z.array(WatchHeartRateSampleSchema),
  /** Energy since the previous batch (a delta), in kcal. */
  activeEnergyKcal: z.number().optional(),
  durationMinutes: z.number().optional(),
  /** Server config that owned the batch when the watch captured it. */
  ownerId: z.string().min(1).optional(),
});

export const WatchWorkoutStopMessageSchema = z.strictObject({
  type: z.literal("workoutStop"),
  clientId: z.string().min(1).optional(),
  sessionId: z.string().min(1),
});

export const WatchToPhoneMessageSchema = z.discriminatedUnion("type", [
  WatchCheckInMessageSchema,
  WatchWaterIntakeMessageSchema,
  WatchWaterDeleteMessageSchema,
  WatchRequestContextMessageSchema,
  WatchSetCompletedMessageSchema,
  WatchRestChangedMessageSchema,
  WatchHeartRateBatchMessageSchema,
  WatchWorkoutStopMessageSchema,
]);

export type WatchToPhoneMessage = z.infer<typeof WatchToPhoneMessageSchema>;
