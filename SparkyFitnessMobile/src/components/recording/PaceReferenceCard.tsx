import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import {
  equivalent5kPace,
  PACE_REFERENCE_RACES,
  type PaceReferenceRace,
  type PaceReferenceRaceId,
} from '@workspace/shared';
import Button from '../ui/Button';
import FormInput from '../FormInput';
import SegmentedControl from '../SegmentedControl';
import { raceDistanceName, raceIdForDistance } from '../../utils/paceReference';
import { formatClock } from '../../utils/gpsRecording';

/** A whole number from what was typed, or 0 for nothing or something that is not a number. */
const wholeNumber = (text: string): number => {
  const value = Number.parseInt(text, 10);
  return Number.isFinite(value) && value > 0 ? value : 0;
};

const parts = (seconds: number) => ({
  h: Math.floor(seconds / 3600),
  m: Math.floor((seconds % 3600) / 60),
  s: Math.round(seconds % 60),
});

export interface PaceReferenceCardProps {
  /** The saved race result, or null when none is set. */
  race: PaceReferenceRace | null;
  onSave: (race: PaceReferenceRace | null) => void;
}

/**
 * "Your race pace": a recent 5K, 10K, half marathon or marathon time, which the
 * Record screen turns into pace ranges for easy runs, tempo, marathon pace,
 * strides and fast stretches. Optional; without it the ranges come from recent
 * sessions. Kept on this device.
 */
const PaceReferenceCard: React.FC<PaceReferenceCardProps> = ({
  race,
  onSave,
}) => {
  const { t } = useTranslation();
  const [raceId, setRaceId] = useState<PaceReferenceRaceId>(
    (race && raceIdForDistance(race.distanceKm)) ?? '5k'
  );
  const initial = race ? parts(race.seconds) : null;
  const [hours, setHours] = useState(initial?.h ? String(initial.h) : '');
  const [minutes, setMinutes] = useState(initial ? String(initial.m) : '');
  const [seconds, setSeconds] = useState(initial ? String(initial.s) : '');
  const [invalid, setInvalid] = useState(false);

  const save = () => {
    const distance = PACE_REFERENCE_RACES.find((r) => r.id === raceId)!;
    const total =
      wholeNumber(hours) * 3600 +
      wholeNumber(minutes) * 60 +
      wholeNumber(seconds);
    const result = { distanceKm: distance.distanceKm, seconds: total };
    if (equivalent5kPace(result) === null) {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    onSave(result);
  };

  const clear = () => {
    setInvalid(false);
    setHours('');
    setMinutes('');
    setSeconds('');
    onSave(null);
  };

  return (
    <View
      className="bg-surface rounded-xl p-4 mt-4"
      testID="pace-reference-card"
    >
      <Text className="text-text-primary text-base font-semibold">
        {t('paceReference.title', { defaultValue: 'Your race pace' })}
      </Text>
      <Text className="text-text-secondary text-sm mt-1">
        {t('paceReference.intro', {
          defaultValue:
            'Enter a recent race time and the Record screen can suggest pace ranges for easy runs, tempo, marathon pace, strides and fast stretches. Without one, it uses the pace of your recent runs. Kept on this device.',
        })}
      </Text>
      <View className="mt-3">
        <SegmentedControl
          segments={PACE_REFERENCE_RACES.map((r) => ({
            key: r.id,
            label: raceDistanceName(t, r.id),
          }))}
          activeKey={raceId}
          onSelect={setRaceId}
        />
      </View>
      <View className="flex-row gap-2 mt-3">
        {(
          [
            [
              'hours',
              hours,
              setHours,
              t('paceReference.hours', { defaultValue: 'h' }),
            ],
            [
              'minutes',
              minutes,
              setMinutes,
              t('paceReference.minutes', { defaultValue: 'min' }),
            ],
            [
              'seconds',
              seconds,
              setSeconds,
              t('paceReference.seconds', { defaultValue: 'sec' }),
            ],
          ] as const
        ).map(([key, value, setValue, label]) => (
          <View key={key} className="flex-1">
            <Text className="text-text-muted text-xs mb-1">{label}</Text>
            <FormInput
              testID={`pace-reference-${key}`}
              value={value}
              onChangeText={(text) => setValue(text.replace(/[^0-9]/g, ''))}
              keyboardType="number-pad"
              maxLength={2}
              placeholder="0"
              accessibilityLabel={label}
            />
          </View>
        ))}
      </View>
      {invalid ? (
        <Text
          className="text-red-500 text-xs mt-2"
          testID="pace-reference-error"
        >
          {t('paceReference.invalid', {
            defaultValue:
              'That time does not look right for this distance. Check the hours, minutes and seconds.',
          })}
        </Text>
      ) : null}
      {race ? (
        <Text
          className="text-text-secondary text-xs mt-2"
          testID="pace-reference-saved"
        >
          {t('paceReference.saved', {
            race: raceDistanceName(
              t,
              raceIdForDistance(race.distanceKm) ?? '5k'
            ),
            time: formatClock(race.seconds),
            defaultValue: 'Saved: {{race}} in {{time}}.',
          })}
        </Text>
      ) : null}
      <View className="flex-row gap-2 mt-3">
        <View className="flex-1">
          <Button variant="outline" onPress={save} testID="pace-reference-save">
            {t('paceReference.save', { defaultValue: 'Save' })}
          </Button>
        </View>
        {race ? (
          <View className="flex-1">
            <Button
              variant="ghost"
              onPress={clear}
              testID="pace-reference-clear"
            >
              {t('paceReference.clear', { defaultValue: 'Clear' })}
            </Button>
          </View>
        ) : null}
      </View>
    </View>
  );
};

export default PaceReferenceCard;
