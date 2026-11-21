import React from 'react';
import { Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import {
  findProgram,
  programOutline,
  programVersions,
  type RunProgram,
} from '@workspace/shared';
import SegmentedControl from '../SegmentedControl';
import { programDescription, programName } from './RunProgramCard';
import { programStructure } from './RunProgramGuide';
import RunProgramWeekPreview from './RunProgramWeekPreview';

interface Props {
  /** The built-in program the card is for (its three-runs-a-week version). */
  basic: RunProgram;
  /** The version picked on a card that has both, or undefined for `basic`. */
  versionId: string | undefined;
  onVersion: (id: string) => void;
  /** The program the person holds now (running or paused), if any. */
  currentId?: string | null;
  /** Buttons under the description; they get the version shown. */
  renderActions: (program: RunProgram) => React.ReactNode;
}

/**
 * One built-in program to look at: its versions, what it involves and every
 * week of it. What the card lets the person do is up to the caller.
 */
const RunProgramPickerCard: React.FC<Props> = ({
  basic,
  versionId,
  onVersion,
  currentId,
  renderActions,
}) => {
  const { t } = useTranslation();
  const versions = programVersions(basic.id);
  const program = versions.find((v) => v.id === versionId) ?? basic;
  const full = findProgram(program.id) ?? program;
  const outline = programOutline(full);
  const isCurrent = currentId === program.id;

  return (
    <View
      className="bg-surface rounded-xl p-4 mt-4"
      testID={`run-program-${basic.id}`}
    >
      <View className="flex-row items-center flex-wrap">
        <Text className="text-text-primary text-base font-semibold mr-2">
          {programName(t, basic.id)}
        </Text>
        {isCurrent ? (
          <Text
            className="text-accent-primary text-xs font-semibold"
            testID={`run-program-current-${basic.id}`}
          >
            {t('runPrograms.browse.current', {
              defaultValue: 'Current program',
            })}
          </Text>
        ) : null}
      </View>
      {versions.length > 1 ? (
        <View className="mt-2" testID={`run-versions-${basic.id}`}>
          <SegmentedControl
            segments={versions.map((v) => ({
              key: v.id,
              label: t('runPrograms.runsPerWeekOption', {
                count: v.workoutsPerWeek,
                defaultValue: '{{count}} runs a week',
                defaultValue_one: '{{count}} run a week',
              }),
            }))}
            activeKey={program.id}
            onSelect={onVersion}
          />
          <Text className="text-text-muted text-xs mt-1">
            {t('runPrograms.runsPerWeekHint', {
              defaultValue:
                'A fourth run adds a short easy run, so the long run is a smaller share of your week.',
            })}
          </Text>
        </View>
      ) : null}
      <Text className="text-text-muted text-xs mt-0.5">
        {t('runPrograms.weeksRuns', {
          weeks: program.weeks,
          runs: program.workoutsPerWeek,
          defaultValue: '{{weeks}} weeks, {{runs}} workouts a week',
        })}
      </Text>
      <Text className="text-text-secondary text-sm mt-2">
        {programDescription(t, program.id)}
      </Text>
      <Text className="text-text-secondary text-sm mt-2">
        {programStructure(t, program.id)}
      </Text>
      <Text className="text-text-secondary text-xs mt-2">
        {program.activity === 'walk'
          ? t('recordActivity.program.outlineWalk', {
              weekOne: outline.firstWeek.join(', '),
              peak: outline.peakRunMinutes,
              defaultValue:
                'Week 1: workouts of {{weekOne}} minutes. Builds to {{peak}} minutes of brisk walking.',
            })
          : t('recordActivity.program.outline', {
              weekOne: outline.firstWeek.join(', '),
              peak: outline.peakRunMinutes,
              defaultValue:
                'Week 1: workouts of {{weekOne}} minutes. Builds to {{peak}} minutes of effort.',
            })}
      </Text>
      <RunProgramWeekPreview
        program={full}
        testID={`run-program-weeks-${basic.id}`}
      />
      {renderActions(program)}
    </View>
  );
};

export default RunProgramPickerCard;
