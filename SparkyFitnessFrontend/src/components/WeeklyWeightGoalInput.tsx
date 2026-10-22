import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  MAX_GOAL_MODE_WEEKLY_CHANGE_KG,
  parseWeeklyGoalRate,
} from '@workspace/shared';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

type Direction = 'maintain' | 'lose' | 'gain';
type RateUnit = 'kg' | 'g';

interface WeeklyWeightGoalInputProps {
  value: number;
  onChange: (signedKg: number) => void;
  onValidityChange: (valid: boolean) => void;
  disabled?: boolean;
}

export function WeeklyWeightGoalInput({
  value,
  onChange,
  onValidityChange,
  disabled = false,
}: WeeklyWeightGoalInputProps) {
  const { t } = useTranslation();
  const id = useId();
  const [direction, setDirection] = useState<Direction>(
    value < 0 ? 'lose' : value > 0 ? 'gain' : 'maintain'
  );
  const [unit, setUnit] = useState<RateUnit>('kg');
  const [amount, setAmount] = useState(
    value === 0 ? '' : String(Math.abs(value))
  );
  const [previousValue, setPreviousValue] = useState(value);
  const [lastReportedValue, setLastReportedValue] = useState(value);
  // Refresh data loaded from the server without normalizing text during typing.
  if (value !== previousValue) {
    setPreviousValue(value);
    if (value !== lastReportedValue) {
      setLastReportedValue(value);
      setDirection(value < 0 ? 'lose' : value > 0 ? 'gain' : 'maintain');
      setAmount(
        value === 0
          ? ''
          : String(
              unit === 'g'
                ? Math.round(Math.abs(value) * 1000)
                : Math.abs(value)
            )
      );
    }
  }
  const parsedKg = parseWeeklyGoalRate(amount, unit);
  const invalid = direction !== 'maintain' && parsedKg === null;

  const emit = (nextDirection: Direction, text: string, nextUnit: RateUnit) => {
    if (nextDirection === 'maintain') {
      setLastReportedValue(0);
      onValidityChange(true);
      onChange(0);
      return;
    }
    const kg = parseWeeklyGoalRate(text, nextUnit);
    onValidityChange(kg !== null);
    if (kg !== null) {
      const signedKg = nextDirection === 'lose' ? -kg : kg;
      setLastReportedValue(signedKg);
      onChange(signedKg);
    }
  };

  return (
    <div className="mb-4 space-y-3">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div>
          <Label htmlFor={`${id}-direction`}>
            {t('settings.goalMode.weeklyDirection', 'Weight goal')}
          </Label>
          <Select
            value={direction}
            disabled={disabled}
            onValueChange={(value: Direction) => {
              setDirection(value);
              emit(value, amount, unit);
            }}
          >
            <SelectTrigger id={`${id}-direction`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="maintain">
                {t('settings.goalMode.weeklyMaintain', 'Maintain weight')}
              </SelectItem>
              <SelectItem value="lose">
                {t('settings.goalMode.weeklyLose', 'Lose weight')}
              </SelectItem>
              <SelectItem value="gain">
                {t('settings.goalMode.weeklyGain', 'Gain weight')}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
        {direction !== 'maintain' && (
          <>
            <div>
              <Label htmlFor={`${id}-amount`}>
                {t('settings.goalMode.weeklyAmount', 'Weekly amount')}
              </Label>
              <Input
                id={`${id}-amount`}
                type="text"
                inputMode="decimal"
                value={amount}
                disabled={disabled}
                aria-invalid={invalid}
                aria-describedby={`${id}-hint`}
                onChange={(event) => {
                  setAmount(event.target.value);
                  emit(direction, event.target.value, unit);
                }}
              />
            </div>
            <div>
              <Label htmlFor={`${id}-unit`}>
                {t('settings.goalMode.weeklyUnit', 'Weekly amount unit')}
              </Label>
              <Select
                value={unit}
                disabled={disabled}
                onValueChange={(value: RateUnit) => {
                  const nextAmount =
                    parsedKg === null
                      ? amount
                      : String(
                          value === 'g' ? Math.round(parsedKg * 1000) : parsedKg
                        );
                  setUnit(value);
                  setAmount(nextAmount);
                  emit(direction, nextAmount, value);
                }}
              >
                <SelectTrigger id={`${id}-unit`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="kg">
                    {t('settings.goalMode.kgPerWeek', 'kg / week')}
                  </SelectItem>
                  <SelectItem value="g">
                    {t('settings.goalMode.gramsPerWeek', 'g / week')}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </>
        )}
      </div>
      <p
        id={`${id}-hint`}
        className={`text-sm ${invalid ? 'text-destructive' : 'text-muted-foreground'}`}
        role={invalid ? 'alert' : undefined}
      >
        {invalid
          ? t('settings.goalMode.weeklyInvalid', {
              defaultValue:
                'Enter an amount from 1 to {{maxGrams}} g ({{maxKg}} kg) per week. Use whole grams or up to three decimal places in kg.',
              maxGrams: MAX_GOAL_MODE_WEEKLY_CHANGE_KG * 1000,
              maxKg: MAX_GOAL_MODE_WEEKLY_CHANGE_KG,
            })
          : t(
              'settings.goalMode.weeklyHint',
              'This is a requested rate, not a guarantee. Your calorie target uses the same estimate as the weight projection, and your configured safety floor still applies.'
            )}
      </p>
    </div>
  );
}
