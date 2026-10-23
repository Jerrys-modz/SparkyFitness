import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ColumnDef, SortingState } from '@tanstack/react-table';
import {
  COMPARE_METRICS,
  timingOf,
  type CompareMetricKey,
  type CompareQuestion,
  type CompareResponse,
} from '@workspace/shared';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DataTable } from '@/components/ui/DataTable';
import type { DataTableFeatures } from '@/components/ui/dataTableFeatures';
import { usePreferences } from '@/contexts/PreferencesContext';
import {
  compareAmountText,
  compareValueText,
  metricName,
  timingLabel,
} from './compareCopy';
import { dayRows, type CompareDayRow } from './compareTables';

interface CompareDaysTableProps {
  response: CompareResponse;
  question: CompareQuestion;
}

export const CompareDaysTable = ({
  response,
  question,
}: CompareDaysTableProps) => {
  const { t, i18n } = useTranslation();
  const { formatDateInUserTimezone } = usePreferences();
  const [sorting, setSorting] = useState<SortingState>([
    { id: 'day', desc: true },
  ]);

  const rows = useMemo(() => dayRows(response, question), [response, question]);
  const chosen = timingOf(question.choice);
  const isWeek = chosen.mode === 'week';
  const bTiming = chosen.mode === 'since' ? 0 : chosen.timing;

  const columns = useMemo<ColumnDef<DataTableFeatures, CompareDayRow>[]>(() => {
    const yesNo = (key: CompareMetricKey, value: number) => {
      if (COMPARE_METRICS[key].kind !== 'binary') {
        return compareValueText(key, value);
      }
      // By week a habit's value is the count of days you did it.
      if (isWeek) {
        const count = Math.round(value);
        return t('compareReport.days.count', {
          count,
          defaultValue: '{{count}} days',
          defaultValue_one: '{{count}} day',
          defaultValue_other: '{{count}} days',
        });
      }
      return value >= 0.5
        ? t('compareReport.days.yes', { defaultValue: 'Yes' })
        : t('compareReport.days.no', { defaultValue: 'No' });
    };
    const vsUsual = (key: CompareMetricKey, suffix: string) =>
      t('compareReport.days.vsUsual', {
        defaultValue: '{{metric}} vs. your usual',
        metric: `${metricName(key, t)}${suffix}`,
      });
    const bSuffix =
      bTiming === 0
        ? ''
        : ` (${timingLabel(question.choice, question.a, question.b, t)})`;
    const devCell = (key: CompareMetricKey, dev: number | null) => {
      if (dev === null) return '—';
      if (isWeek && COMPARE_METRICS[key].kind === 'binary') {
        // Days against your usual weeks, so a fraction is real.
        const amount = new Intl.NumberFormat(i18n.language, {
          minimumFractionDigits: 1,
          maximumFractionDigits: 1,
          signDisplay: 'exceptZero',
        }).format(dev);
        return t('compareReport.days.daysDeviation', {
          defaultValue: '{{amount}} days',
          amount,
        });
      }
      return compareAmountText(key, dev, true);
    };
    const devSort = (dev: number | null) => dev ?? Number.NEGATIVE_INFINITY;

    return [
      {
        id: 'day',
        header: isWeek
          ? t('compareReport.days.week', { defaultValue: 'Week' })
          : t('compareReport.days.day', { defaultValue: 'Day' }),
        accessorFn: (row) => row.aKey,
        cell: ({ row }) => {
          const date = formatDateInUserTimezone(row.original.aKey, 'PP');
          return isWeek
            ? t('compareReport.days.weekOf', {
                defaultValue: 'Week of {{date}}',
                date,
              })
            : date;
        },
      },
      {
        id: 'a',
        header: metricName(question.a, t),
        accessorFn: (row) => row.aRaw,
        cell: ({ row }) => yesNo(question.a, row.original.aRaw),
      },
      {
        id: 'aDev',
        header: vsUsual(question.a, ''),
        accessorFn: (row) => devSort(row.aDev),
        cell: ({ row }) => devCell(question.a, row.original.aDev),
      },
      {
        id: 'b',
        header: `${metricName(question.b, t)}${bSuffix}`,
        accessorFn: (row) => row.bRaw,
        cell: ({ row }) => yesNo(question.b, row.original.bRaw),
      },
      {
        id: 'bDev',
        header: vsUsual(question.b, bSuffix),
        accessorFn: (row) => devSort(row.bDev),
        cell: ({ row }) => devCell(question.b, row.original.bDev),
      },
    ];
  }, [question, isWeek, bTiming, t, i18n.language, formatDateInUserTimezone]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          {t('compareReport.days.title', { defaultValue: 'Every day used' })}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <DataTable
          columns={columns}
          data={rows}
          titleColumnId="day"
          getRowId={(row) => row.aKey}
          sorting={sorting}
          onSortingChange={setSorting}
        />
      </CardContent>
    </Card>
  );
};
