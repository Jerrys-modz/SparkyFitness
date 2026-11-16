import React from 'react';
import { Alert, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import Toast from 'react-native-toast-message';
import {
  compareDays,
  dietPhaseHasStarted,
  dietPhaseSaveInputs,
  formatWeeklyGoalRate,
  getWeeklyGoalRateUnit,
  type DietPhase,
  type DietPhaseSaveInput,
} from '@workspace/shared';
import type { TFunction } from 'i18next';
import Button from './ui/Button';
import { useDietPhases, useSaveDietPhases } from '../hooks/useGoals';
import { usePreferences } from '../hooks/usePreferences';
import { useAppLocale } from '../localization';
import { dietPhaseErrorCode } from '../services/api/dietPhasesApi';
import { getApiErrorMessage } from '../services/api/errors';
import { formatDate } from '../utils/dateUtils';
import { kgToLbs } from '../utils/unitConversions';

const PHASE_DOT: Record<DietPhase['phase_type'], string> = {
  loss: 'bg-sky-500',
  maintenance: 'bg-emerald-500',
  gain: 'bg-amber-400',
};

export function dietPhaseTypeLabel(
  type: DietPhase['phase_type'],
  t: TFunction
): string {
  if (type === 'loss')
    return t('goals.dietPhases.typeLoss', { defaultValue: 'Loss' });
  if (type === 'gain')
    return t('goals.dietPhases.typeGain', { defaultValue: 'Gain' });
  return t('goals.dietPhases.typeMaintenance', { defaultValue: 'Maintenance' });
}

/** The message for a refused save, by the server's code. */
export function dietPhaseSaveErrorText(error: unknown, t: TFunction): string {
  const code = dietPhaseErrorCode(error);
  if (code === 'overlap') {
    return t('goals.dietPhases.errorOverlap', {
      defaultValue: 'Phases overlap: each day can belong to one phase only.',
    });
  }
  if (code === 'past_locked') {
    return t('goals.dietPhases.errorPastLocked', {
      defaultValue:
        'Past days keep the settings they were logged with. A phase that has started can only change from today on.',
    });
  }
  return (
    getApiErrorMessage(error) ??
    t('goals.dietPhases.saveFailed', {
      defaultValue: 'Could not save the diet phases.',
    })
  );
}

interface DietPhasesSectionProps {
  onEdit: (phaseId?: string) => void;
}

/** Diet phases on the Goals screen: today's phase, what comes next, and the plan. */
const DietPhasesSection: React.FC<DietPhasesSectionProps> = ({ onEdit }) => {
  const { t } = useTranslation();
  const locale = useAppLocale();
  const { preferences } = usePreferences();
  const { dietPhases } = useDietPhases();
  const { savePhases, isPending } = useSaveDietPhases();
  if (!dietPhases) return null;
  const { phases, status, today } = dietPhases;
  const weightUnit = preferences?.default_weight_unit;
  const rateUnit = getWeeklyGoalRateUnit(weightUnit ?? undefined);

  const phaseName = (phase: DietPhase) =>
    phase.label || dietPhaseTypeLabel(phase.phase_type, t);

  const rateText = (phase: DietPhase) => {
    if (phase.phase_type === 'maintenance') return '';
    const { amount, pounds } = formatWeeklyGoalRate(
      phase.weekly_change_kg,
      rateUnit,
      locale
    );
    return rateUnit === 'st_lbs'
      ? t('goals.dietPhases.rateStLbs', {
          defaultValue: '{{st}} st {{lbs}} lbs / week',
          st: amount,
          lbs: pounds,
        })
      : t('goals.dietPhases.rate', {
          defaultValue: '{{amount}} {{unit}} / week',
          amount,
          unit: rateUnit,
        });
  };

  const weightText = (kg: number) =>
    weightUnit === 'kg'
      ? t('goals.dietPhases.weightKg', {
          defaultValue: '{{value}} kg',
          value: Number(kg.toFixed(1)),
        })
      : t('goals.dietPhases.weightLbs', {
          defaultValue: '{{value}} lbs',
          value: Number(kgToLbs(kg).toFixed(1)),
        });

  const save = async (next: DietPhaseSaveInput[]) => {
    try {
      await savePhases({ phases: next });
    } catch (error) {
      Toast.show({
        type: 'error',
        text1: t('common.error', { defaultValue: 'Error' }),
        text2: dietPhaseSaveErrorText(error, t),
      });
    }
  };

  const confirmDelete = (phase: DietPhase) =>
    Alert.alert(
      t('goals.dietPhases.deleteTitle', { defaultValue: 'Delete phase?' }),
      t('goals.dietPhases.deleteMessage', {
        defaultValue: 'Delete "{{name}}" from the plan?',
        name: phaseName(phase),
      }),
      [
        {
          text: t('common.cancel', { defaultValue: 'Cancel' }),
          style: 'cancel',
        },
        {
          text: t('common.delete', { defaultValue: 'Delete' }),
          style: 'destructive',
          onPress: () =>
            save(dietPhaseSaveInputs(phases).filter((p) => p.id !== phase.id)),
        },
      ]
    );

  const endToday = (phase: DietPhase) =>
    save(
      dietPhaseSaveInputs(phases).map((p) =>
        p.id === phase.id ? { ...p, end_date: today, duration_weeks: null } : p
      )
    );

  const current = status.current;
  const next = status.next;

  return (
    <View className="gap-3">
      <Text className="text-sm text-text-secondary">
        {t('goals.dietPhases.sectionDescription', {
          defaultValue:
            'Plan cut, maintenance and gain phases by date. During a phase its weekly weight change replaces your Goal Mode; other days use your Goal Mode from Calorie Settings.',
        })}
      </Text>
      {status.change_soon && status.change_on && (
        <View
          className="rounded-lg border border-border-subtle bg-raised p-3"
          testID="diet-phase-change-soon"
        >
          <Text className="text-sm font-semibold text-text-primary">
            {t('goals.dietPhases.changeSoonTitle', {
              defaultValue: 'Phase change coming up',
            })}
          </Text>
          <Text className="text-sm text-text-secondary">
            {next && compareDays(next.start_date, status.change_on) === 0
              ? t('goals.dietPhases.changeSoonNext', {
                  defaultValue: '{{name}} starts on {{date}}.',
                  name: phaseName(next),
                  date: formatDate(status.change_on, locale),
                })
              : t('goals.dietPhases.changeSoonBase', {
                  defaultValue:
                    'From {{date}} your Goal Mode from Calorie Settings applies again.',
                  date: formatDate(status.change_on, locale),
                })}
          </Text>
        </View>
      )}
      <View className="gap-1 rounded-lg bg-raised p-3">
        {current ? (
          <>
            <Text className="text-base font-semibold text-text-primary">
              {t('goals.dietPhases.currentPhase', {
                defaultValue: 'Current phase: {{name}}',
                name: phaseName(current),
              })}
            </Text>
            <Text className="text-sm text-text-secondary">
              {status.days_left !== null
                ? t('goals.dietPhases.daysLeft', {
                    defaultValue: '{{count}} days left',
                    count: status.days_left,
                  })
                : t('goals.dietPhases.untilTarget', {
                    defaultValue: 'Until your trend reaches {{weight}}',
                    weight: weightText(current.target_weight_kg ?? 0),
                  })}
            </Text>
          </>
        ) : (
          <Text className="text-sm text-text-secondary">
            {t('goals.dietPhases.noCurrentPhase', {
              defaultValue:
                'No phase today: your Goal Mode from Calorie Settings applies.',
            })}
          </Text>
        )}
        {next && (
          <Text className="text-sm text-text-secondary">
            {t('goals.dietPhases.nextPhase', {
              defaultValue: 'Next: {{name}} from {{date}}',
              name: phaseName(next),
              date: formatDate(next.start_date, locale),
            })}
          </Text>
        )}
      </View>
      {phases.map((phase) => {
        const started = dietPhaseHasStarted(phase, today);
        const isCurrent = phase.id === current?.id;
        const ended =
          phase.effective_end_date !== null &&
          compareDays(phase.effective_end_date, today) < 0;
        const details = [
          dietPhaseTypeLabel(phase.phase_type, t),
          rateText(phase),
          phase.target_weight_kg !== null
            ? t('goals.dietPhases.target', {
                defaultValue: 'Target {{weight}}',
                weight: weightText(phase.target_weight_kg),
              })
            : '',
        ].filter(Boolean);
        return (
          <View key={phase.id} className="gap-2 rounded-lg bg-raised p-3">
            <View className="flex-row items-center gap-2">
              <View
                className={`h-3 w-3 rounded-full ${PHASE_DOT[phase.phase_type]}`}
              />
              <Text className="flex-shrink text-base font-semibold text-text-primary">
                {phaseName(phase)}
              </Text>
              {isCurrent && (
                <Text className="text-xs font-semibold text-accent-primary">
                  {t('goals.dietPhases.activeBadge', {
                    defaultValue: 'Active',
                  })}
                </Text>
              )}
            </View>
            <Text className="text-sm text-text-secondary">
              {phase.effective_end_date
                ? t('goals.dietPhases.range', {
                    defaultValue: '{{start}} to {{end}}',
                    start: formatDate(phase.start_date, locale),
                    end: formatDate(phase.effective_end_date, locale),
                  })
                : t('goals.dietPhases.rangeOpen', {
                    defaultValue: 'From {{start}} until the target is reached',
                    start: formatDate(phase.start_date, locale),
                  })}
            </Text>
            <Text className="text-sm text-text-secondary">
              {details.join(' · ')}
            </Text>
            {!ended && (
              <View className="flex-row flex-wrap gap-2">
                {isCurrent && started && (
                  <Button
                    variant="secondary"
                    disabled={isPending}
                    onPress={() => endToday(phase)}
                    className="py-2"
                    textClassName="text-xs"
                    testID={`diet-phase-end-${phase.id}`}
                  >
                    {t('goals.dietPhases.endToday', {
                      defaultValue: 'End today',
                    })}
                  </Button>
                )}
                <Button
                  variant="secondary"
                  disabled={isPending}
                  onPress={() => onEdit(phase.id)}
                  className="py-2"
                  textClassName="text-xs"
                  testID={`diet-phase-edit-${phase.id}`}
                >
                  {t('goals.dietPhases.edit', { defaultValue: 'Edit' })}
                </Button>
                {!started && (
                  <Button
                    variant="destructive"
                    disabled={isPending}
                    onPress={() => confirmDelete(phase)}
                    className="py-2"
                    textClassName="text-xs"
                    testID={`diet-phase-delete-${phase.id}`}
                  >
                    {t('common.delete', { defaultValue: 'Delete' })}
                  </Button>
                )}
              </View>
            )}
          </View>
        );
      })}
      <Button
        variant="secondary"
        onPress={() => onEdit()}
        testID="diet-phase-add"
      >
        {t('goals.dietPhases.addPhase', { defaultValue: 'Add phase' })}
      </Button>
    </View>
  );
};

export default DietPhasesSection;
