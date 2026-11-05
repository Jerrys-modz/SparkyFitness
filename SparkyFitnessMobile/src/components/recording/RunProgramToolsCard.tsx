import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useCSSVariable } from 'uniwind';
import type { ProgramStatus } from '@workspace/shared';
import Icon, { type IconName } from '../Icon';
import BottomSheetPicker from '../BottomSheetPicker';
import { ProgramActionList } from './ProgramActionRow';
import { programPickerOptions, workoutPickerSections } from './RunProgramCard';

/** One tool: an icon tile, a label and hint, and a chevron. */
const ToolRow: React.FC<{
  icon: IconName;
  iconColor: string;
  label: string;
  hint: string;
  onPress: () => void;
  testID?: string;
}> = ({ icon, iconColor, label, hint, onPress, testID }) => {
  const textMuted = useCSSVariable('--color-text-muted') as string;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      testID={testID}
      className="flex-row items-center px-4 py-3"
      style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
    >
      <View className="w-10 h-10 rounded-lg bg-raised border border-border-subtle items-center justify-center mr-3">
        <Icon name={icon} size={20} color={iconColor} />
      </View>
      <View className="flex-1 mr-3">
        <Text className="text-text-primary text-sm font-semibold">{label}</Text>
        <Text className="text-text-muted text-xs mt-0.5">{hint}</Text>
      </View>
      <Icon name="chevron-forward" size={16} color={textMuted} />
    </Pressable>
  );
};

/**
 * Everything to do with the running program that is not today's workout:
 * the calendar, customizing, training paces, switching program or workout,
 * and skipping or starting over.
 */
const RunProgramToolsCard: React.FC<{
  status: ProgramStatus;
  programId: string;
  onOpenCalendar: () => void;
  /** Absent for a plan the person wrote, which is already editable. */
  onCustomize?: () => void;
  onOpenPaces: () => void;
  onChooseProgram: (programId: string) => void;
  onPickWorkout: (index: number) => void;
  onSkip: () => void;
  onRestart: () => void;
}> = ({
  status,
  programId,
  onOpenCalendar,
  onCustomize,
  onOpenPaces,
  onChooseProgram,
  onPickWorkout,
  onSkip,
  onRestart,
}) => {
  const { t } = useTranslation();
  const accent = useCSSVariable('--color-accent-primary') as string;
  const exercise = useCSSVariable('--color-exercise') as string;
  const pr = useCSSVariable('--color-pr') as string;
  const textSecondary = useCSSVariable('--color-text-secondary') as string;
  const danger = useCSSVariable('--color-icon-danger') as string;

  return (
    <View
      className="bg-surface rounded-2xl mt-4 border border-border-subtle overflow-hidden"
      testID="run-program-tools"
    >
      <Text className="px-4 pt-3.5 pb-2 text-text-muted text-xs font-bold uppercase tracking-wider">
        {t('runPrograms.tools.title', { defaultValue: 'Tools & plan actions' })}
      </Text>
      <ProgramActionList>
        <ToolRow
          icon="calendar"
          iconColor={accent}
          label={t('runPrograms.openCalendar', {
            defaultValue: 'Open the training calendar',
          })}
          hint={t('runPrograms.openCalendarHint', {
            defaultValue: 'Program and plan workouts, done and to come',
          })}
          onPress={onOpenCalendar}
        />
        {onCustomize ? (
          <ToolRow
            icon="pencil"
            iconColor={exercise}
            label={t('runPrograms.custom.customize', {
              defaultValue: 'Customize this program',
            })}
            hint={t('runPrograms.custom.customizeHint', {
              defaultValue: 'Copy it as a plan you can edit',
            })}
            onPress={onCustomize}
            testID="customize-current"
          />
        ) : null}
        <ToolRow
          icon="timer"
          iconColor={pr}
          label={t('fitnessTest.panel.emptyTitle', {
            defaultValue: 'Find your training paces',
          })}
          hint={t('runPrograms.tools.pacesHint', {
            defaultValue: 'Guided fitness test and pace ranges',
          })}
          onPress={onOpenPaces}
          testID="run-program-tools-paces"
        />
        <BottomSheetPicker<string>
          value={programId}
          options={programPickerOptions(t, status)}
          onSelect={onChooseProgram}
          title={t('recordActivity.program.chooseTitle', {
            defaultValue: 'Choose a program',
          })}
          renderTrigger={({ onPress }) => (
            <ToolRow
              icon="swap-horizontal"
              iconColor={textSecondary}
              label={t('recordActivity.program.change', {
                defaultValue: 'Change program',
              })}
              hint={t('runPrograms.tools.changeHint', {
                defaultValue: 'Pick another built-in program',
              })}
              onPress={onPress}
            />
          )}
        />
        <BottomSheetPicker<number>
          value={Math.min(status.done, status.total - 1)}
          sections={workoutPickerSections(t, status)}
          onSelect={onPickWorkout}
          title={t('recordActivity.program.pickTitle', {
            defaultValue: 'Choose a workout',
          })}
          renderTrigger={({ onPress }) => (
            <ToolRow
              icon="list"
              iconColor={textSecondary}
              label={t('recordActivity.program.pick', {
                defaultValue: 'Choose a different workout',
              })}
              hint={t('runPrograms.tools.pickHint', {
                defaultValue: 'Jump ahead or go back in the program',
              })}
              onPress={onPress}
            />
          )}
        />
        {status.finished && status.done === 0 ? null : (
          <View className="flex-row items-center justify-between px-4 py-3 bg-raised/30">
            {status.finished ? (
              <View />
            ) : (
              <Pressable
                accessibilityRole="button"
                onPress={onSkip}
                hitSlop={8}
                className="flex-1 mr-3"
              >
                <Text className="text-text-secondary text-xs font-semibold">
                  {t('runPrograms.tools.skip', {
                    defaultValue: 'Skip current workout',
                  })}
                </Text>
                <Text className="text-text-muted text-xs mt-0.5">
                  {t('recordActivity.program.skipHint', {
                    defaultValue: 'Move on without doing this workout',
                  })}
                </Text>
              </Pressable>
            )}
            {status.done > 0 ? (
              <Pressable
                accessibilityRole="button"
                accessibilityHint={t('recordActivity.program.startOverHint', {
                  defaultValue: 'Go back to the first workout',
                })}
                onPress={onRestart}
                hitSlop={8}
                className="flex-row items-center"
              >
                <Icon name="replay" size={14} color={danger} />
                <Text className="text-icon-danger text-xs font-semibold ml-1">
                  {t('recordActivity.program.startOver', {
                    defaultValue: 'Start over',
                  })}
                </Text>
              </Pressable>
            ) : null}
          </View>
        )}
      </ProgramActionList>
    </View>
  );
};

export default RunProgramToolsCard;
