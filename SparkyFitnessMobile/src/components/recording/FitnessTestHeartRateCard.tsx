import React, { useMemo } from 'react';
import { Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import Toast from 'react-native-toast-message';
import {
  evaluateHeartRateFieldTest,
  type FitnessTestResponse,
  type HeartRateFieldTestResult,
  type UpdateHeartRateZonesBody,
} from '@workspace/shared';
import Button from '../ui/Button';
import { useCardioSessionDetail } from '../../hooks/useCardioSessionDetail';
import {
  useHeartRateZones,
  useUpdateHeartRateZones,
} from '../../hooks/useHeartRateZones';
import { addLog } from '../../services/LogService';

interface Props {
  test: FitnessTestResponse;
}

/**
 * Heart-rate zones from a fitness test. The 30-minute run gives a threshold
 * heart rate (the average of its last 20 minutes) and zones built on it; any
 * test can show that the max heart rate in use is too low. Nothing is saved
 * until the person taps a button, and both are saved through the normal
 * Heart Rate Zones settings (custom zones, max heart rate).
 *
 * Renders nothing for a test with no recorded activity, and for a 5K or Cooper
 * test that has nothing to offer.
 */
const FitnessTestHeartRateCard: React.FC<Props> = ({ test }) => {
  if (!test.exercise_entry_id) return null;
  return <HeartRateCardBody test={test} entryId={test.exercise_entry_id} />;
};

const HeartRateCardBody: React.FC<Props & { entryId: string }> = ({
  test,
  entryId,
}) => {
  const { t } = useTranslation();
  const { heartRate, isHeartRateLoading } = useCardioSessionDetail(
    entryId,
    test.test_date
  );
  const { zones } = useHeartRateZones();
  const update = useUpdateHeartRateZones();
  const currentMaxHr = zones?.resolved.max_hr ?? null;

  const result: HeartRateFieldTestResult | null = useMemo(() => {
    const first = heartRate[0];
    if (!first) return null;
    return evaluateHeartRateFieldTest({
      testType: test.test_type,
      samples: heartRate.map((point) => ({
        t: new Date(point.timestamp).toISOString(),
        bpm: point.bpm,
      })),
      // The recording is the test, so its first reading is the start.
      startedAt: new Date(first.timestamp).toISOString(),
      currentMaxHr,
    });
  }, [heartRate, test.test_type, currentMaxHr]);

  if (isHeartRateLoading) return null;

  const isThirtyMinute = test.test_type === '30min';
  const floors = result?.floors ?? null;
  const suggestedMaxHr = result?.suggestedMaxHr ?? null;
  if (!floors && !suggestedMaxHr) {
    // Only the 30-minute run promises zones, so only it explains their absence.
    if (!isThirtyMinute) return null;
    return (
      <View className="bg-surface rounded-xl p-4 mt-4" testID="fitness-hr-card">
        <Text className="text-text-primary text-base font-semibold">
          {t('fitnessTest.heartRate.title', {
            defaultValue: 'Your heart rate zones',
          })}
        </Text>
        <Text
          className="text-text-secondary text-sm mt-1"
          testID="fitness-hr-none"
        >
          {t('fitnessTest.heartRate.none', {
            defaultValue:
              'Not enough heart rate was recorded in the last 20 minutes. Wear a heart rate monitor next time to get zones from this test.',
          })}
        </Text>
      </View>
    );
  }

  const settings = zones?.settings;
  const zonesInUse =
    !!floors &&
    settings?.method === 'custom' &&
    settings.custom_floors?.length === floors.length &&
    settings.custom_floors.every((floor, i) => floor === floors[i]);

  const save = (body: UpdateHeartRateZonesBody) => {
    update.mutate(body, {
      onSuccess: () =>
        Toast.show({
          type: 'success',
          text1: t('heartRateZones.saved', {
            defaultValue: 'Heart rate zones saved',
          }),
        }),
      onError: (error: unknown) => {
        addLog(
          `[Fitness Test] Could not save heart rate zones: ${error}`,
          'WARNING'
        );
        Toast.show({
          type: 'error',
          text1: t('fitnessTest.heartRate.saveError', {
            defaultValue: 'Could not save your zones',
          }),
          text2: t('common.tryAgain', { defaultValue: 'Please try again.' }),
        });
      },
    });
  };

  return (
    <View className="bg-surface rounded-xl p-4 mt-4" testID="fitness-hr-card">
      <Text className="text-text-primary text-base font-semibold">
        {t('fitnessTest.heartRate.title', {
          defaultValue: 'Your heart rate zones',
        })}
      </Text>

      {floors && result?.thresholdHr ? (
        <>
          <Text
            className="text-text-secondary text-sm mt-1"
            testID="fitness-hr-threshold"
          >
            {t('fitnessTest.heartRate.threshold', {
              bpm: result.thresholdHr,
              defaultValue:
                'Threshold heart rate {{bpm}} bpm, your average over the last 20 minutes.',
            })}
          </Text>
          <View className="mt-2">
            {floors.map((floor, i) => {
              const next = floors[i + 1];
              return (
                <View
                  key={floor}
                  className="flex-row justify-between py-1"
                  testID={`fitness-hr-zone-${i + 1}`}
                >
                  <Text className="text-text-primary text-sm">
                    {t('fitnessTest.heartRate.zone', {
                      zone: i + 1,
                      defaultValue: 'Zone {{zone}}',
                    })}
                  </Text>
                  <Text className="text-text-secondary text-sm">
                    {next === undefined
                      ? t('fitnessTest.heartRate.rangeTop', {
                          from: floor,
                          defaultValue: '{{from}}+ bpm',
                        })
                      : t('fitnessTest.heartRate.range', {
                          from: floor,
                          to: next - 1,
                          defaultValue: '{{from}}–{{to}} bpm',
                        })}
                  </Text>
                </View>
              );
            })}
          </View>
          {zonesInUse ? (
            <Text
              className="text-text-secondary text-sm mt-2"
              testID="fitness-hr-in-use"
            >
              {t('fitnessTest.heartRate.inUse', {
                defaultValue: 'These are your heart rate zones now.',
              })}
            </Text>
          ) : (
            <>
              <Text className="text-text-muted text-xs mt-2">
                {t('fitnessTest.heartRate.useBody', {
                  defaultValue:
                    'Saved as custom zones. Past workouts keep the zones they were recorded with.',
                })}
              </Text>
              <View className="mt-2">
                <Button
                  variant="secondary"
                  disabled={update.isPending}
                  onPress={() =>
                    save({ method: 'custom', custom_floors: floors })
                  }
                  testID="fitness-hr-use-zones"
                >
                  {t('fitnessTest.heartRate.use', {
                    defaultValue: 'Use these zones',
                  })}
                </Button>
              </View>
            </>
          )}
        </>
      ) : null}

      {suggestedMaxHr ? (
        <View className={floors ? 'mt-4' : 'mt-1'} testID="fitness-hr-max">
          <Text className="text-text-secondary text-sm">
            {currentMaxHr === null
              ? t('fitnessTest.heartRate.peak', {
                  bpm: suggestedMaxHr,
                  defaultValue:
                    'You reached {{bpm}} bpm. Your max heart rate is at least that.',
                })
              : t('fitnessTest.heartRate.peakAbove', {
                  bpm: suggestedMaxHr,
                  current: currentMaxHr,
                  defaultValue:
                    'You reached {{bpm}} bpm, above the {{current}} bpm max your zones use. Your max is at least {{bpm}}.',
                })}
          </Text>
          <View className="mt-2">
            <Button
              variant="outline"
              disabled={update.isPending}
              onPress={() => save({ max_heart_rate: suggestedMaxHr })}
              testID="fitness-hr-set-max"
            >
              {t('fitnessTest.heartRate.setMax', {
                bpm: suggestedMaxHr,
                defaultValue: 'Set max to {{bpm}} bpm',
              })}
            </Button>
          </View>
        </View>
      ) : null}
    </View>
  );
};

export default FitnessTestHeartRateCard;
