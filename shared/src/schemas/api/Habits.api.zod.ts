import { z } from "zod";

const dayString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD");

export const habitSchema = z.object({
  id: z.string(),
  name: z.string(),
  display_name: z.string().nullable(),
});

export const habitLogSchema = z.object({
  habit_id: z.string(),
  entry_date: dayString,
  completed: z.boolean(),
});

export const createHabitRequestSchema = z.object({
  name: z.string().trim().min(1).max(50),
});

export const logHabitRequestSchema = z.object({
  entry_date: dayString,
  completed: z.boolean(),
});

export const habitLogsQuerySchema = z.object({
  startDate: dayString,
  endDate: dayString,
});

export type Habit = z.infer<typeof habitSchema>;
export type HabitLog = z.infer<typeof habitLogSchema>;
export type CreateHabitRequest = z.infer<typeof createHabitRequestSchema>;
export type LogHabitRequest = z.infer<typeof logHabitRequestSchema>;
