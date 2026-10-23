import { CalendarIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  addDays,
  COMPARE_SPANS,
  compareDays,
  compareWindow,
  daysBetween,
  type CompareSpan,
  dayToPickerDate,
  localDateToDay,
  MAX_CUSTOM_DAYS,
  type SpanMode,
} from '@workspace/shared';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { usePreferences } from '@/contexts/PreferencesContext';

interface CustomRange {
  startDate: string;
  endDate: string;
}

/**
 * A picked range made exactly the one `compareWindow` will query: the end
 * kept (never past today), the start never past it, and a span over the
 * mode's limit pulled in from the start.
 */
export function clampCustomRange(
  range: CustomRange,
  today: string,
  maxDays: number
): CustomRange {
  const endDate = compareDays(range.endDate, today) > 0 ? today : range.endDate;
  let startDate =
    compareDays(range.startDate, endDate) > 0 ? endDate : range.startDate;
  if (daysBetween(startDate, endDate) + 1 > maxDays) {
    startDate = addDays(endDate, -(maxDays - 1));
  }
  return { startDate, endDate };
}

interface CompareSpanControlProps {
  mode: SpanMode;
  span: CompareSpan;
  custom: CustomRange | null;
  today: string;
  onChange: (span: CompareSpan, custom: CustomRange | null) => void;
}

export function CompareSpanControl({
  mode,
  span,
  custom,
  today,
  onChange,
}: CompareSpanControlProps) {
  const { t } = useTranslation();
  const { formatDateInUserTimezone } = usePreferences();

  const labels: Record<CompareSpan, string> = {
    '30d': t('compareReport.span.30d', '30 days'),
    '60d': t('compareReport.span.60d', '60 days'),
    '90d': t('compareReport.span.90d', '90 days'),
    '6m': t('compareReport.span.6m', '6 months'),
    '1y': t('compareReport.span.1y', '1 year'),
    custom: t('compareReport.span.custom', 'Custom'),
  };

  const select = (key: CompareSpan) => {
    if (key !== 'custom') {
      onChange(key, custom);
      return;
    }
    // Custom opens on the window already on screen, to be adjusted.
    onChange('custom', compareWindow(span, mode, today, custom));
  };

  const range = span === 'custom' && custom ? custom : null;

  const picker = (
    which: 'startDate' | 'endDate',
    label: string,
    current: CustomRange
  ) => {
    const day = current[which];
    return (
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            aria-label={label}
            className="justify-start font-normal"
          >
            <CalendarIcon className="mr-2 h-4 w-4" />
            {formatDateInUserTimezone(day, 'PP')}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={dayToPickerDate(day)}
            defaultMonth={dayToPickerDate(day)}
            onSelect={(date) => {
              if (!date) return;
              onChange(
                'custom',
                clampCustomRange(
                  { ...current, [which]: localDateToDay(date) },
                  today,
                  MAX_CUSTOM_DAYS[mode]
                )
              );
            }}
            disabled={(date) => {
              const d = localDateToDay(date);
              if (which === 'startDate') {
                return (
                  compareDays(d, current.endDate) > 0 ||
                  compareDays(
                    d,
                    addDays(current.endDate, -(MAX_CUSTOM_DAYS[mode] - 1))
                  ) < 0
                );
              }
              return (
                compareDays(d, today) > 0 ||
                compareDays(d, current.startDate) < 0
              );
            }}
            autoFocus
          />
        </PopoverContent>
      </Popover>
    );
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {COMPARE_SPANS[mode].map((key) => (
          <Button
            key={key}
            size="sm"
            variant={key === span ? 'default' : 'outline'}
            aria-pressed={key === span}
            onClick={() => select(key)}
          >
            {labels[key]}
          </Button>
        ))}
      </div>
      {range && (
        <div className="flex flex-wrap items-center gap-2">
          {picker(
            'startDate',
            t('compareReport.span.startDate', 'Start date'),
            range
          )}
          <span className="text-sm text-muted-foreground">
            {t('compareReport.span.to', 'to')}
          </span>
          {picker(
            'endDate',
            t('compareReport.span.endDate', 'End date'),
            range
          )}
        </div>
      )}
    </div>
  );
}
