import { z } from 'zod';
import { COMPARE_METRIC_KEYS, COMPARE_METRICS } from '../../compare/metrics.ts';
import { daysBetween, isDayString } from '../../utils/timezone.ts';

const dayString = z
  .string()
  .refine(isDayString, { message: 'Expected YYYY-MM-DD' });

const metricKey = z.enum(COMPARE_METRIC_KEYS);

const MAX_DAY_SPAN = 180;
const MAX_WEEK_SPAN = 366;

export const compareQuerySchema = z
  .object({
    a: metricKey,
    b: metricKey,
    mode: z.enum(['day', 'week']).default('day'),
    timing: z.coerce.number().int().min(-1).max(1).default(0),
    start: dayString,
    end: dayString,
  })
  .superRefine((q, ctx) => {
    if (q.a === q.b) {
      ctx.addIssue({
        code: 'custom',
        path: ['b'],
        message: 'Pick two different things to compare',
      });
    }
    if (q.mode === 'week') {
      if (q.timing === -1) {
        ctx.addIssue({
          code: 'custom',
          path: ['timing'],
          message: 'Week mode supports timing 0 or 1 only',
        });
      }
      for (const key of ['a', 'b'] as const) {
        if (COMPARE_METRICS[q[key]].weekly === null) {
          ctx.addIssue({
            code: 'custom',
            path: [key],
            message: `${q[key]} has no weekly form; use day mode`,
          });
        }
      }
    }
    if (!isDayString(q.start) || !isDayString(q.end)) return;
    if (q.start > q.end) {
      ctx.addIssue({
        code: 'custom',
        path: ['start'],
        message: 'start must not be after end',
      });
      return;
    }
    // Span counts both ends: start === end is 1 day.
    const span = daysBetween(q.start, q.end) + 1;
    const limit = q.mode === 'week' ? MAX_WEEK_SPAN : MAX_DAY_SPAN;
    if (span > limit) {
      ctx.addIssue({
        code: 'custom',
        path: ['end'],
        message: `The range can be at most ${limit} days in ${q.mode} mode`,
      });
    }
  });
export type CompareQuery = z.infer<typeof compareQuerySchema>;

export const compareResultSchema = z.object({
  status: z.enum(['ok', 'not_enough']),
  n: z.number(),
  needed: z.number(),
  reason: z.enum(['tooFew', 'noVariation', 'fewYes', 'fewNo']).optional(),
  method: z.enum(['pearson', 'spearman', 'difference']).optional(),
  nEff: z.number().optional(),
  r: z.number().optional(),
  p: z.number().optional(),
  low: z.number().optional(),
  high: z.number().optional(),
  linked: z.boolean().optional(),
  strength: z.enum(['weak', 'moderate', 'strong']).optional(),
  sign: z.enum(['positive', 'negative']).optional(),
  binary: z
    .object({
      yesKey: metricKey,
      yesMean: z.number(),
      noMean: z.number(),
      yesCount: z.number(),
      noCount: z.number(),
      diff: z.number(),
    })
    .optional(),
  checks: z.object({
    ownNormal: z.literal(true),
    direction: z
      .enum(['firstComesFirst', 'strongerOtherWay', 'cantTell'])
      .optional()
      .describe(
        "'firstComesFirst': the thing on the earlier day leads — A for timing 0 and 1, B for timing −1. 'strongerOtherWay': the link is stronger with the other thing first. 'cantTell': neither order stands out."
      ),
    weekend: z.enum(['holds', 'mayBeWeekends']).optional(),
  }),
});

const dayValues = z.record(z.string(), z.number());
const metricSeries = z.object({ key: metricKey, values: dayValues });

export const compareResponseSchema = z.object({
  a: metricSeries,
  b: metricSeries,
  deviations: z
    .object({ a: dayValues, b: dayValues })
    .describe(
      "Each side's values as the analysis paired them: deviations from its own normal. In day mode a yes/no side's values are its raw 0/1 flags, not deviations."
    ),
  result: compareResultSchema,
});
export type CompareResponse = z.infer<typeof compareResponseSchema>;
