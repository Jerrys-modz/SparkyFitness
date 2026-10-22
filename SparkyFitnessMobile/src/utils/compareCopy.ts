import {
  COMPARE_METRICS,
  type CompareMetricKey,
  type CompareResponse,
  type CompareResult,
} from '@workspace/shared';
import {
  COMPARE_METRIC_LABELS,
  compareDisplayValue,
  isSleepMetric,
} from '../constants/compareMetrics';
import type { Translator } from '../constants/reports';
import { formatLocalizedNumber } from '../localization';
import {
  timingOf,
  type CompareMode,
  type CompareQuestion,
  type CompareSpan,
} from './compareQuestion';

function lowerFirst(text: string): string {
  return text.charAt(0).toLowerCase() + text.slice(1);
}

/** The label in lower case, for the middle of a sentence. */
function plainLabel(key: CompareMetricKey, t: Translator): string {
  return lowerFirst(COMPARE_METRIC_LABELS[key](t));
}

/** "last night's time asleep" for sleep metrics, else the label in lower case. */
export function metricPhrase(key: CompareMetricKey, t: Translator): string {
  const label = plainLabel(key, t);
  return isSleepMetric(key)
    ? t('compareReport.phrase.lastNights', {
        defaultValue: "last night's {{metric}}",
        metric: label,
      })
    : label;
}

/**
 * The metric as a noun in a sentence. Yes/no metrics are labelled with a
 * past-tense verb ("Meditated"), so they get a gerund here; every other
 * metric reads as its plain phrase.
 */
export function metricNoun(key: CompareMetricKey, t: Translator): string {
  if (key === 'meditated') {
    return t('compareReport.metricNouns.meditated', {
      defaultValue: 'meditating',
    });
  }
  return metricPhrase(key, t);
}

export function timingPhrase(q: CompareQuestion, t: Translator): string {
  switch (q.choice) {
    case 'sameDay':
      return isSleepMetric(q.a)
        ? t('compareReport.timing.thatDay', { defaultValue: 'that day' })
        : t('compareReport.timing.sameDay', { defaultValue: 'the same day' });
    case 'nextDay':
      return isSleepMetric(q.b)
        ? t('compareReport.timing.thatNight', { defaultValue: 'that night' })
        : t('compareReport.timing.nextDay', { defaultValue: 'the next day' });
    case 'dayBefore':
      return t('compareReport.timing.dayBefore', {
        defaultValue: 'the day before',
      });
    case 'sameWeek':
      return t('compareReport.timing.sameWeek', {
        defaultValue: 'the same week',
      });
    case 'nextWeek':
      return t('compareReport.timing.nextWeek', {
        defaultValue: 'the next week',
      });
  }
}

export function sentenceText(q: CompareQuestion, t: Translator): string {
  return t('compareReport.verdict.question', {
    defaultValue: 'Does {{a}} go with {{b}} {{timing}}?',
    a: metricNoun(q.a, t),
    b:
      COMPARE_METRICS[q.b].kind === 'binary'
        ? metricNoun(q.b, t)
        : plainLabel(q.b, t),
    timing: timingPhrase(q, t),
  });
}

function units(count: number, mode: CompareMode, t: Translator): string {
  return mode === 'week'
    ? t('compareReport.verdict.weeks', {
        defaultValue: '{{count}} weeks',
        count,
      })
    : t('compareReport.verdict.days', {
        defaultValue: '{{count}} days',
        count,
      });
}

function strengthWord(
  strength: CompareResult['strength'],
  t: Translator
): string {
  switch (strength) {
    case 'strong':
      return t('compareReport.verdict.strength.strong', {
        defaultValue: 'strong',
      });
    case 'moderate':
      return t('compareReport.verdict.strength.moderate', {
        defaultValue: 'moderate',
      });
    default:
      return t('compareReport.verdict.strength.weak', {
        defaultValue: 'weak',
      });
  }
}

function binaryKey(q: CompareQuestion): CompareMetricKey | null {
  if (COMPARE_METRICS[q.a].kind === 'binary') return q.a;
  if (COMPARE_METRICS[q.b].kind === 'binary') return q.b;
  return null;
}

function allEqual(values: Record<string, number>): boolean {
  const list = Object.values(values);
  return list.length > 0 && list.every((v) => v === list[0]);
}

function isLongestSpan(span: CompareSpan, mode: CompareMode): boolean {
  return span === 'custom' || span === (mode === 'week' ? '1y' : '90d');
}

export function verdictCopy(
  response: CompareResponse,
  q: CompareQuestion,
  span: CompareSpan,
  t: Translator
): { headline: string; detail: string } {
  const { result } = response;
  const mode = timingOf(q.choice).mode;
  const n = units(result.n, mode, t);

  if (result.status === 'not_enough') {
    const needed = units(result.needed, mode, t);
    const yes = binaryKey(q);
    const yesText = yes ? metricPhrase(yes, t) : '';
    switch (result.reason) {
      case 'noVariation': {
        const flat = allEqual(response.a.values)
          ? q.a
          : allEqual(response.b.values)
            ? q.b
            : null;
        return {
          headline: t('compareReport.verdict.noVariationHeadline', {
            defaultValue: 'Nothing to compare yet',
          }),
          detail: flat
            ? t('compareReport.verdict.noVariationDetail', {
                defaultValue:
                  "{{metric}} was the same every time over this span, so there's nothing to compare it with.",
                metric: COMPARE_METRIC_LABELS[flat](t),
              })
            : t('compareReport.verdict.noVariationGeneric', {
                defaultValue: "One of these didn't change over this span.",
              }),
        };
      }
      case 'fewYes':
        return {
          headline: t('compareReport.verdict.fewYesHeadline', {
            defaultValue: 'Not enough days when you {{yes}} yet',
            yes: yesText,
          }),
          detail: t('compareReport.verdict.fewYesDetail', {
            defaultValue:
              'You have {{n}}; an answer needs {{needed}}. Try a longer span.',
            n,
            needed,
          }),
        };
      case 'fewNo':
        return {
          headline: t('compareReport.verdict.fewNoHeadline', {
            defaultValue: 'Not enough days without {{yesNoun}} yet',
            yesNoun: yes ? metricNoun(yes, t) : '',
          }),
          detail: t('compareReport.verdict.fewNoDetail', {
            defaultValue:
              "You {{yes}} on almost every day here, so there's nothing to compare against. Try a longer span.",
            yes: yesText,
          }),
        };
      default: {
        const parts = [
          t('compareReport.verdict.tooFewDetail', {
            defaultValue: 'You have {{n}}; an answer needs {{needed}}.',
            n,
            needed,
          }),
        ];
        const aCount = Object.keys(response.a.values).length;
        const bCount = Object.keys(response.b.values).length;
        const weaker = aCount <= bCount ? q.a : q.b;
        const missing = Math.max(result.needed - result.n, 1);
        parts.push(
          mode === 'week'
            ? t('compareReport.verdict.logWeeks', {
                defaultValue:
                  'Log {{weaker}} for {{count}} more weeks, or pick a longer span.',
                weaker: plainLabel(weaker, t),
                count: missing,
              })
            : t('compareReport.verdict.logDays', {
                defaultValue:
                  'Log {{weaker}} on {{count}} more days, or pick a longer span.',
                weaker: plainLabel(weaker, t),
                count: missing,
              })
        );
        if (mode === 'day' && Math.max(aCount, bCount) >= result.needed) {
          parts.push(
            t('compareReport.verdict.needsHistory', {
              defaultValue:
                'Each day is compared with your previous two weeks, so a day needs a week of history first.',
            })
          );
        }
        return {
          headline:
            mode === 'week'
              ? t('compareReport.verdict.tooFewHeadlineWeeks', {
                  defaultValue: 'Not enough weeks yet',
                })
              : t('compareReport.verdict.tooFewHeadline', {
                  defaultValue: 'Not enough days yet',
                }),
          detail: parts.join(' '),
        };
      }
    }
  }

  const isDifference = result.method === 'difference';
  const hint = isLongestSpan(span, mode)
    ? ''
    : isDifference
      ? ` ${t('compareReport.verdict.longerSpanDifference', {
          defaultValue: 'A longer span makes a small difference easier to see.',
        })}`
      : ` ${t('compareReport.verdict.longerSpan', {
          defaultValue: 'A longer span makes a weak link easier to see.',
        })}`;

  if (result.method === 'difference' && result.binary) {
    const { yesKey, diff } = result.binary;
    const outcome = plainLabel(yesKey === q.a ? q.b : q.a, t);
    if (!result.linked) {
      return {
        headline: t('compareReport.verdict.noDifferenceHeadline', {
          defaultValue: 'No clear difference',
        }),
        detail:
          t('compareReport.verdict.noDifferenceDetail', {
            defaultValue:
              "Over these {{n}}, your {{outcome}} wasn't different enough between the two kinds of day to rule out chance.",
            n,
            outcome,
          }) + hint,
      };
    }
    const yes = metricPhrase(yesKey, t);
    return {
      headline: t('compareReport.verdict.differenceHeadline', {
        defaultValue: 'Yes, a difference',
      }),
      detail:
        diff >= 0
          ? t('compareReport.verdict.differenceHigher', {
              defaultValue:
                'On days you {{yes}}, your {{outcome}} was higher than usual.',
              yes,
              outcome,
            })
          : t('compareReport.verdict.differenceLower', {
              defaultValue:
                'On days you {{yes}}, your {{outcome}} was lower than usual.',
              yes,
              outcome,
            }),
    };
  }

  if (!result.linked) {
    return {
      headline: t('compareReport.verdict.noLinkHeadline', {
        defaultValue: 'No clear link',
      }),
      detail:
        t('compareReport.verdict.noLinkDetail', {
          defaultValue:
            "Over these {{n}}, they didn't move together more than chance would explain.",
          n,
        }) + hint,
    };
  }

  const a = metricPhrase(q.a, t);
  const b = plainLabel(q.b, t);
  const timing = timingPhrase(q, t);
  return {
    headline: t('compareReport.verdict.linkedHeadline', {
      defaultValue: 'Yes, a {{strength}} link',
      strength: strengthWord(result.strength, t),
    }),
    detail:
      result.sign === 'negative'
        ? t('compareReport.verdict.linkedNegative', {
            defaultValue:
              'When {{a}} was higher than usual, your {{b}} {{timing}} was lower than usual.',
            a,
            b,
            timing,
          })
        : t('compareReport.verdict.linkedPositive', {
            defaultValue:
              'When {{a}} was higher than usual, your {{b}} {{timing}} was higher than usual too.',
            a,
            b,
            timing,
          }),
  };
}

function num(value: number, digits: number): string {
  return formatLocalizedNumber(value, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

/**
 * The numbers behind a verdict. For a yes/no result `outcome` is the metric
 * that was compared, so mood shows on the 1-10 scale.
 */
export function statsLine(
  result: CompareResult,
  mode: CompareMode,
  t: Translator,
  outcome?: CompareMetricKey
): string | null {
  if (
    result.status !== 'ok' ||
    result.low === undefined ||
    result.high === undefined ||
    result.p === undefined
  ) {
    return null;
  }
  const p =
    result.p < 0.001
      ? t('compareReport.stats.pTiny', { defaultValue: 'p < 0.001' })
      : t('compareReport.stats.p', {
          defaultValue: 'p {{p}}',
          p: num(result.p, 3),
        });
  const n = units(result.n, mode, t);

  if (result.method === 'difference' && result.binary) {
    const scale = (v: number) =>
      outcome ? compareDisplayValue(outcome, v) : v;
    return t('compareReport.stats.difference', {
      defaultValue:
        'difference {{diff}} · 95% range {{low}} to {{high}} · {{p}} · {{n}}',
      diff: num(scale(result.binary.diff), 1),
      low: num(scale(result.low), 1),
      high: num(scale(result.high), 1),
      p,
      n,
    });
  }
  if (result.r === undefined) return null;
  return t('compareReport.stats.correlation', {
    defaultValue: 'r {{r}} · 95% range {{low}} to {{high}} · {{p}} · {{n}}',
    r: num(result.r, 2),
    low: num(result.low, 2),
    high: num(result.high, 2),
    p,
    n,
  });
}
