export const MACRO_ALERT_KEYS = [
  'protein',
  'carbs',
  'fat',
  'fiber',
  'calories',
] as const;
export type MacroAlertKey = (typeof MACRO_ALERT_KEYS)[number];

/** "Alert me if I am under this share of the day's target." */
export const MACRO_ALERT_PERCENTS = [50, 60, 70, 80, 90] as const;
export type MacroAlertPercent = (typeof MACRO_ALERT_PERCENTS)[number];

export const DEFAULT_MACRO_ALERT_PERCENT: MacroAlertPercent = 70;
export const DEFAULT_MACRO_ALERT_TIME = '18:00';
/** `data.kind` carried by every macro alert notification. */
export const MACRO_ALERT_KIND = 'macro-alert';
export const MACRO_ALERT_MIN_LEAD_MS = 60_000;

/** One rule per macro: if under `percent`% of its target at `time`, say so. */
export interface MacroAlertRule {
  macro: MacroAlertKey;
  percent: MacroAlertPercent;
  /** Zero-padded local `HH:MM`. */
  time: string;
}

export interface MacroProgress {
  consumed: number;
  goal: number | null | undefined;
}

export type MacroTotals = Partial<Record<MacroAlertKey, MacroProgress>>;

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Keeps valid rules only, one per macro (the first wins), in macro order. */
export function normalizeMacroAlertRules(
  rules: readonly MacroAlertRule[]
): MacroAlertRule[] {
  const byMacro = new Map<MacroAlertKey, MacroAlertRule>();
  for (const rule of rules) {
    if (
      !MACRO_ALERT_KEYS.includes(rule?.macro) ||
      !(MACRO_ALERT_PERCENTS as readonly number[]).includes(rule.percent) ||
      !TIME_PATTERN.test(rule.time) ||
      byMacro.has(rule.macro)
    ) {
      continue;
    }
    byMacro.set(rule.macro, {
      macro: rule.macro,
      percent: rule.percent,
      time: rule.time,
    });
  }
  return MACRO_ALERT_KEYS.flatMap((macro) => {
    const rule = byMacro.get(macro);
    return rule ? [rule] : [];
  });
}

export interface MacroAlert {
  macro: MacroAlertKey;
  percent: MacroAlertPercent;
  date: Date;
  consumed: number;
  goal: number;
  /** Whole units still to eat to reach the target. */
  remaining: number;
  /** Whole percent of the target eaten so far. */
  progressPercent: number;
}

export interface ComputeMacroAlertsInput {
  rules: readonly MacroAlertRule[];
  totals: MacroTotals;
  now: Date;
}

/**
 * The alerts to have pending for today: a rule fires only while its time is
 * still ahead, the macro has a target, and the amount eaten so far is under
 * the rule's share of it. Later days are not scheduled, because nothing is
 * known about them yet; the next reconcile does that.
 */
export function computeMacroAlerts({
  rules,
  totals,
  now,
}: ComputeMacroAlertsInput): MacroAlert[] {
  const earliest = now.getTime() + MACRO_ALERT_MIN_LEAD_MS;
  const out: MacroAlert[] = [];
  for (const rule of normalizeMacroAlertRules(rules)) {
    const progress = totals[rule.macro];
    const goal = progress?.goal;
    if (!progress || !goal || goal <= 0) continue;
    const consumed = Math.max(0, progress.consumed);
    if (consumed >= (goal * rule.percent) / 100) continue;
    const [hour, minute] = rule.time.split(':').map(Number);
    const date = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      hour,
      minute,
      0,
      0
    );
    if (date.getTime() < earliest) continue;
    out.push({
      macro: rule.macro,
      percent: rule.percent,
      date,
      consumed,
      goal,
      remaining: Math.max(0, Math.round(goal - consumed)),
      progressPercent: Math.round((consumed / goal) * 100),
    });
  }
  return out.sort((a, b) => a.date.getTime() - b.date.getTime());
}
