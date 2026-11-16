import React, { useCallback, useRef, useState } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import Toast from 'react-native-toast-message';
import { useCSSVariable } from 'uniwind';
import {
  MAX_DIET_PHASE_WEEKS,
  addDays,
  compareDays,
  dietPhaseHasStarted,
  dietPhaseSaveInputs,
  type DietPhaseSaveInput,
} from '@workspace/shared';
import BottomSheetPicker from '../components/BottomSheetPicker';
import CalendarSheet, {
  type CalendarSheetRef,
} from '../components/CalendarSheet';
import FormInput from '../components/FormInput';
import FormScreenChrome from '../components/FormScreenChrome';
import Icon from '../components/Icon';
import StatusView from '../components/StatusView';
import WeeklyWeightGoalFields from '../components/WeeklyWeightGoalFields';
import { dietPhaseSaveErrorText } from '../components/DietPhasesSection';
import { useDietPhases, useSaveDietPhases } from '../hooks/useGoals';
import { useEnergyUnit } from '../hooks/useEnergyUnit';
import { usePreferences } from '../hooks/usePreferences';
import { useAppLocale } from '../localization';
import type { RootStackScreenProps } from '../types/navigation';
import { formatDate } from '../utils/dateUtils';
import { kgToLbs, lbsToKg } from '../utils/unitConversions';

type DietPhaseEditScreenProps = RootStackScreenProps<'DietPhaseEdit'>;
type EndMode = 'date' | 'weeks' | 'target';

const signedRate = (phase: DietPhaseSaveInput) =>
  phase.phase_type === 'loss'
    ? -phase.weekly_change_kg
    : phase.phase_type === 'gain'
      ? phase.weekly_change_kg
      : 0;

const DateRow: React.FC<{
  label: string;
  value: string | null;
  locale: string;
  disabled?: boolean;
  onPress: () => void;
}> = ({ label, value, locale, disabled, onPress }) => {
  const { t } = useTranslation();
  const [textMuted] = useCSSVariable(['--color-text-muted']) as [string];
  return (
    <View className="gap-1">
      <Text className="text-sm font-medium text-text-primary">{label}</Text>
      <TouchableOpacity
        onPress={onPress}
        disabled={disabled}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={label}
        className={`flex-row items-center justify-between px-3 py-2.5 rounded-lg border border-border-subtle bg-raised min-h-11 ${disabled ? 'opacity-50' : ''}`}
      >
        <Text className="text-base text-text-primary">
          {value
            ? formatDate(value, locale)
            : t('goals.dietPhases.pickDate', { defaultValue: 'Pick a date' })}
        </Text>
        <Icon name="calendar" size={16} color={textMuted} />
      </TouchableOpacity>
    </View>
  );
};

interface PhaseFormProps {
  phase: DietPhaseSaveInput;
  others: DietPhaseSaveInput[];
  today: string;
  onDone: () => void;
}

const PhaseForm: React.FC<PhaseFormProps> = ({
  phase,
  others,
  today,
  onDone,
}) => {
  const { t } = useTranslation();
  const locale = useAppLocale();
  const energyUnit = useEnergyUnit();
  const { preferences } = usePreferences();
  const weightUnit = preferences?.default_weight_unit ?? 'kg';
  const targetUnit: 'kg' | 'lbs' = weightUnit === 'kg' ? 'kg' : 'lbs';
  const { savePhases, isPending } = useSaveDietPhases();
  const started = dietPhaseHasStarted(phase, today);

  const [label, setLabel] = useState(phase.label ?? '');
  const [startDate, setStartDate] = useState(phase.start_date);
  const [rateKg, setRateKg] = useState(signedRate(phase));
  const [endMode, setEndMode] = useState<EndMode>(
    phase.end_date ? 'date' : phase.duration_weeks ? 'weeks' : 'target'
  );
  const [endDate, setEndDate] = useState<string | null>(phase.end_date);
  const [weeks, setWeeks] = useState(
    phase.duration_weeks ? String(phase.duration_weeks) : '8'
  );
  const [target, setTarget] = useState(
    phase.target_weight_kg === null
      ? ''
      : String(
          Number(
            (targetUnit === 'kg'
              ? phase.target_weight_kg
              : kgToLbs(phase.target_weight_kg)
            ).toFixed(1)
          )
        )
  );
  const startSheetRef = useRef<CalendarSheetRef>(null);
  const endSheetRef = useRef<CalendarSheetRef>(null);

  const maintenance = rateKg === 0;
  const effectiveEndMode: EndMode =
    maintenance && endMode === 'target' ? 'date' : endMode;
  const targetNumber = Number(target.replace(',', '.'));
  const targetKg =
    target.trim() === '' || !Number.isFinite(targetNumber) || targetNumber <= 0
      ? null
      : Math.round(
          (targetUnit === 'kg' ? targetNumber : lbsToKg(targetNumber)) * 100
        ) / 100;
  const weeksNumber = Number(weeks);

  const endModeOptions = [
    {
      label: t('goals.dietPhases.endOnDate', { defaultValue: 'On a date' }),
      value: 'date',
    },
    {
      label: t('goals.dietPhases.endAfterWeeks', {
        defaultValue: 'After a number of weeks',
      }),
      value: 'weeks',
    },
    ...(maintenance
      ? []
      : [
          {
            label: t('goals.dietPhases.endAtTarget', {
              defaultValue: 'When I reach a target weight',
            }),
            value: 'target',
          },
        ]),
  ];

  const handleSave = useCallback(async () => {
    const error =
      effectiveEndMode === 'date' &&
      (endDate === null || compareDays(endDate, startDate) < 0)
        ? t('goals.dietPhases.endBeforeStart', {
            defaultValue: 'Pick a last day on or after the start date.',
          })
        : effectiveEndMode === 'weeks' &&
            !(
              Number.isInteger(weeksNumber) &&
              weeksNumber >= 1 &&
              weeksNumber <= MAX_DIET_PHASE_WEEKS
            )
          ? t('goals.dietPhases.invalidWeeks', {
              defaultValue: 'Enter between 1 and {{max}} weeks.',
              max: MAX_DIET_PHASE_WEEKS,
            })
          : effectiveEndMode === 'target' && targetKg === null
            ? t('goals.dietPhases.invalidTarget', {
                defaultValue: 'Enter a target weight.',
              })
            : null;
    if (error) {
      Toast.show({ type: 'error', text1: error });
      return;
    }
    const saved: DietPhaseSaveInput = {
      id: phase.id,
      label: label.trim() === '' ? null : label.trim(),
      phase_type: rateKg < 0 ? 'loss' : rateKg > 0 ? 'gain' : 'maintenance',
      weekly_change_kg: Math.abs(rateKg),
      start_date: startDate,
      end_date: effectiveEndMode === 'date' ? endDate : null,
      duration_weeks: effectiveEndMode === 'weeks' ? weeksNumber : null,
      target_weight_kg: maintenance ? null : targetKg,
    };
    try {
      await savePhases({ phases: [...others, saved] });
      onDone();
    } catch (saveError) {
      Toast.show({
        type: 'error',
        text1: t('common.error', { defaultValue: 'Error' }),
        text2: dietPhaseSaveErrorText(saveError, t),
      });
    }
  }, [
    effectiveEndMode,
    endDate,
    label,
    maintenance,
    onDone,
    others,
    phase.id,
    rateKg,
    savePhases,
    startDate,
    t,
    targetKg,
    weeksNumber,
  ]);

  return (
    <FormScreenChrome
      title={
        phase.id
          ? t('goals.dietPhases.editTitle', { defaultValue: 'Diet phase' })
          : t('goals.dietPhases.newTitle', { defaultValue: 'New diet phase' })
      }
      saveLabel={t('common.save', { defaultValue: 'Save' })}
      savingLabel={t('common.saving', { defaultValue: 'Saving…' })}
      isSaving={isPending}
      onSave={handleSave}
      onCancel={onDone}
    >
      <Text className="text-sm text-text-secondary">
        {started
          ? t('goals.dietPhases.startedHint', {
              defaultValue:
                'This phase has started. Past days keep the settings they were logged with, so only its end can change.',
            })
          : t('goals.dietPhases.dialogHint', {
              defaultValue:
                'During the phase, its weekly weight change replaces your Goal Mode.',
            })}
      </Text>
      <View className="gap-1">
        <Text className="text-sm font-medium text-text-primary">
          {t('goals.dietPhases.label', { defaultValue: 'Name (optional)' })}
        </Text>
        <FormInput
          value={label}
          maxLength={60}
          onChangeText={setLabel}
          placeholder={t('goals.dietPhases.labelPlaceholder', {
            defaultValue: 'Summer cut',
          })}
          accessibilityLabel={t('goals.dietPhases.label', {
            defaultValue: 'Name (optional)',
          })}
          testID="diet-phase-label"
        />
      </View>
      {!started && (
        <WeeklyWeightGoalFields
          weeklyChangeKg={rateKg}
          weightUnit={weightUnit}
          energyUnit={energyUnit}
          onChange={setRateKg}
        />
      )}
      <DateRow
        label={t('goals.dietPhases.startDate', { defaultValue: 'Start date' })}
        value={startDate}
        locale={locale}
        disabled={started}
        onPress={() => startSheetRef.current?.present()}
      />
      <View className="gap-1">
        <Text className="text-sm font-medium text-text-primary">
          {t('goals.dietPhases.endsBy', { defaultValue: 'Ends' })}
        </Text>
        <BottomSheetPicker
          value={effectiveEndMode}
          options={endModeOptions}
          onSelect={(value) => setEndMode(value as EndMode)}
          title={t('goals.dietPhases.endsBy', { defaultValue: 'Ends' })}
        />
      </View>
      {effectiveEndMode === 'date' && (
        <DateRow
          label={t('goals.dietPhases.lastDay', { defaultValue: 'Last day' })}
          value={endDate}
          locale={locale}
          onPress={() => endSheetRef.current?.present()}
        />
      )}
      {effectiveEndMode === 'weeks' && (
        <View className="gap-1">
          <Text className="text-sm font-medium text-text-primary">
            {t('goals.dietPhases.weeks', { defaultValue: 'Weeks' })}
          </Text>
          <FormInput
            value={weeks}
            onChangeText={setWeeks}
            keyboardType="number-pad"
            accessibilityLabel={t('goals.dietPhases.weeks', {
              defaultValue: 'Weeks',
            })}
            testID="diet-phase-weeks"
          />
        </View>
      )}
      {!maintenance && (
        <View className="gap-1">
          <Text className="text-sm font-medium text-text-primary">
            {effectiveEndMode === 'target'
              ? t('goals.dietPhases.targetWeight', {
                  defaultValue: 'Target weight ({{unit}})',
                  unit: targetUnit,
                })
              : t('goals.dietPhases.targetWeightOptional', {
                  defaultValue: 'End early at weight ({{unit}}, optional)',
                  unit: targetUnit,
                })}
          </Text>
          <FormInput
            value={target}
            onChangeText={setTarget}
            keyboardType="decimal-pad"
            accessibilityLabel={t('goals.dietPhases.targetWeightLabel', {
              defaultValue: 'Target weight',
            })}
            testID="diet-phase-target"
          />
          <Text className="text-xs text-text-muted">
            {t('goals.dietPhases.targetHint', {
              defaultValue:
                'The phase ends on the day your weight trend reaches this weight.',
            })}
          </Text>
        </View>
      )}
      <CalendarSheet
        ref={startSheetRef}
        selectedDate={startDate}
        minDate={today}
        onSelectDate={setStartDate}
      />
      <CalendarSheet
        ref={endSheetRef}
        selectedDate={endDate ?? startDate}
        // A started phase may end yesterday at the earliest: any earlier
        // would change a day already logged.
        minDate={started ? addDays(today, -1) : startDate}
        onSelectDate={setEndDate}
      />
    </FormScreenChrome>
  );
};

/** Add or edit one diet phase; the whole plan is saved with it. */
const DietPhaseEditScreen: React.FC<DietPhaseEditScreenProps> = ({
  navigation,
  route,
}) => {
  const { t } = useTranslation();
  const phaseId = route.params?.phaseId;
  const { dietPhases, isLoading } = useDietPhases();
  const goBack = useCallback(() => navigation.goBack(), [navigation]);

  const existing = phaseId
    ? dietPhases?.phases.find((phase) => phase.id === phaseId)
    : null;
  if (isLoading || !dietPhases || (phaseId && !existing)) {
    const loading = isLoading;
    return (
      <StatusView
        loading={loading}
        icon={loading ? undefined : 'alert-circle'}
        title={
          loading
            ? undefined
            : t('goals.dietPhases.notFound', {
                defaultValue: 'Could not find this diet phase.',
              })
        }
        action={
          loading
            ? undefined
            : {
                label: t('goals.dietPhases.goBack', {
                  defaultValue: 'Go back',
                }),
                onPress: goBack,
              }
        }
      />
    );
  }

  const { today, phases } = dietPhases;
  const all = dietPhaseSaveInputs(phases);
  const last = phases[phases.length - 1]?.effective_end_date;
  const newStart =
    last && compareDays(addDays(last, 1), today) > 0 ? addDays(last, 1) : today;
  const phase: DietPhaseSaveInput = existing
    ? (all.find((p) => p.id === existing.id) as DietPhaseSaveInput)
    : {
        phase_type: 'loss',
        weekly_change_kg: 0.5,
        start_date: newStart,
        end_date: null,
        duration_weeks: 8,
        target_weight_kg: null,
        label: null,
      };
  const others = all.filter((p) => !existing || p.id !== existing.id);

  return (
    <PhaseForm phase={phase} others={others} today={today} onDone={goBack} />
  );
};

export default DietPhaseEditScreen;
