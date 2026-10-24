import React from 'react';
import { useTranslation } from 'react-i18next';
import { View, Text } from 'react-native';
import type {
  DeloadReason,
  DeloadStatus,
  StrengthVolume,
  VolumeStatus,
} from '@workspace/shared';
import StatusView from '../StatusView';
import { formatLocalizedNumber } from '../../localization';
import { localizeExerciseTaxonomyValue } from '../../localization/exerciseTaxonomy';

interface StrengthVolumeCardProps {
  data: StrengthVolume | undefined;
  isLoading: boolean;
  isError: boolean;
}

const STATUS_CLASS: Record<VolumeStatus, string> = {
  under: 'text-orange-500',
  inRange: 'text-green-600',
  over: 'text-red-500',
  building: 'text-text-muted',
};

const StrengthVolumeCard: React.FC<StrengthVolumeCardProps> = ({
  data,
  isLoading,
  isError,
}) => {
  const { t } = useTranslation();

  const statusLabel = (status: VolumeStatus) => {
    switch (status) {
      case 'under':
        return t('exerciseStatistics.volume.status.under', {
          defaultValue: 'Under',
        });
      case 'inRange':
        return t('exerciseStatistics.volume.status.inRange', {
          defaultValue: 'In range',
        });
      case 'over':
        return t('exerciseStatistics.volume.status.over', {
          defaultValue: 'Over',
        });
      case 'building':
        return t('exerciseStatistics.volume.status.building', {
          defaultValue: 'Building',
        });
    }
  };

  const deloadStatusText = (status: DeloadStatus) =>
    status === 'notEnoughData'
      ? t('exerciseStatistics.volume.deload.notEnoughData', {
          defaultValue:
            'Log a few weeks of strength training to get a deload suggestion.',
        })
      : status === 'recentlyDeloaded'
        ? t('exerciseStatistics.volume.deload.recentlyDeloaded', {
            defaultValue:
              'You trained lighter last week, so no deload is suggested.',
          })
        : t('exerciseStatistics.volume.deload.ok', {
            defaultValue: 'No deload needed right now.',
          });

  const reasonText = (reason: DeloadReason, max: number) => {
    const value =
      reason.value == null ? '' : formatLocalizedNumber(reason.value);
    const items = reason.items.join(', ');
    switch (reason.code) {
      case 'e1rm_dropping':
        return t('exerciseStatistics.volume.reason.e1rm_dropping', {
          value,
          items,
          defaultValue:
            'Estimated max is down {{value}}% from its peak: {{items}}.',
        });
      case 'e1rm_stalled':
        return t('exerciseStatistics.volume.reason.e1rm_stalled', {
          items,
          defaultValue:
            'No new estimated max for two or more weeks: {{items}}.',
        });
      case 'rpe_rising':
        return t('exerciseStatistics.volume.reason.rpe_rising', {
          items,
          defaultValue: 'The same weights feel harder ({{items}}).',
        });
      case 'high_volume':
        return t('exerciseStatistics.volume.reason.high_volume', {
          max: formatLocalizedNumber(max),
          items: reason.items
            .map((item) => localizeExerciseTaxonomyValue(t, 'muscle', item))
            .join(', '),
          defaultValue: 'Two weeks in a row above {{max}} sets for {{items}}.',
        });
      case 'readiness_low':
        return t('exerciseStatistics.volume.reason.readiness_low', {
          value,
          defaultValue:
            'Training readiness is {{value}}% below your recent baseline.',
        });
      case 'hrv_low':
        return t('exerciseStatistics.volume.reason.hrv_low', {
          value,
          defaultValue:
            'Overnight HRV is {{value}}% below your recent baseline.',
        });
    }
  };

  const renderBody = () => {
    if (isLoading) return <StatusView inline loading />;
    if (!data) {
      return isError ? (
        <Text className="text-text-secondary text-sm">
          {t('exerciseStatistics.volume.loadFailed', {
            defaultValue: 'Could not load your weekly muscle volume.',
          })}
        </Text>
      ) : null;
    }
    const { range, deload, muscles } = data;
    return (
      <>
        {muscles.length === 0 ? (
          <Text className="text-text-muted text-xs">
            {t('exerciseStatistics.volume.noSets', {
              defaultValue: 'No hard sets logged in the last few weeks.',
            })}
          </Text>
        ) : (
          <>
            <View className="flex-row justify-end pb-1">
              <Text className="text-xs text-text-muted w-24 text-right">
                {t('exerciseStatistics.volume.thisWeek', {
                  defaultValue: 'This week',
                })}
              </Text>
              <Text className="text-xs text-text-muted w-24 text-right">
                {t('exerciseStatistics.volume.lastWeek', {
                  defaultValue: 'Last week',
                })}
              </Text>
            </View>
            {muscles.map((row, index) => (
              <View
                key={row.muscle}
                className={`flex-row items-center py-2 ${
                  index === muscles.length - 1
                    ? ''
                    : 'border-b border-border-subtle'
                }`}
              >
                <Text className="flex-1 text-text-primary text-sm">
                  {localizeExerciseTaxonomyValue(t, 'muscle', row.muscle)}
                </Text>
                <View className="w-24 items-end">
                  <Text className="text-text-primary text-sm font-semibold">
                    {formatLocalizedNumber(row.thisWeek)}
                  </Text>
                  <Text
                    className={`text-xs ${STATUS_CLASS[row.thisWeekStatus]}`}
                  >
                    {statusLabel(row.thisWeekStatus)}
                  </Text>
                </View>
                <View className="w-24 items-end">
                  <Text className="text-text-secondary text-sm">
                    {formatLocalizedNumber(row.lastWeek)}
                  </Text>
                  <Text
                    className={`text-xs ${STATUS_CLASS[row.lastWeekStatus]}`}
                  >
                    {statusLabel(row.lastWeekStatus)}
                  </Text>
                </View>
              </View>
            ))}
          </>
        )}

        <View className="mt-4 rounded-lg border border-border-subtle p-3">
          {deload.status === 'suggest' && deload.plan ? (
            <>
              <Text className="text-text-primary text-sm font-bold mb-1">
                {t('exerciseStatistics.volume.deload.title', {
                  defaultValue: 'Consider a lighter week',
                })}
              </Text>
              <Text className="text-text-primary text-sm mb-2">
                {t('exerciseStatistics.volume.deload.intro', {
                  weekStart: deload.plan.weekStart,
                  setsMin: formatLocalizedNumber(deload.plan.setsPercent.min),
                  setsMax: formatLocalizedNumber(deload.plan.setsPercent.max),
                  loadMin: formatLocalizedNumber(deload.plan.loadPercent.min),
                  loadMax: formatLocalizedNumber(deload.plan.loadPercent.max),
                  defaultValue:
                    'Next week ({{weekStart}}), try about {{setsMin}} to {{setsMax}}% of your usual sets at {{loadMin}} to {{loadMax}}% of your usual weights.',
                })}
              </Text>
              {deload.reasons.map((reason) => (
                <Text
                  key={reason.code}
                  className="text-text-secondary text-xs mb-1"
                >
                  {'• '}
                  {reasonText(reason, range.max)}
                </Text>
              ))}
              {deload.plan.muscleTargets.length > 0 ? (
                <Text className="text-text-secondary text-xs mt-1">
                  {t('exerciseStatistics.volume.deload.targets', {
                    defaultValue: 'Hard sets per muscle',
                  })}
                  {': '}
                  {deload.plan.muscleTargets
                    .slice(0, 6)
                    .map(
                      (target) =>
                        `${localizeExerciseTaxonomyValue(t, 'muscle', target.muscle)} ${formatLocalizedNumber(target.from)}-${formatLocalizedNumber(target.to)}`
                    )
                    .join(', ')}
                </Text>
              ) : null}
              <Text className="text-text-muted text-xs mt-2">
                {t('exerciseStatistics.volume.deload.adviceOnly', {
                  defaultValue:
                    'This is a suggestion only. Nothing in your plans or programs has been changed.',
                })}
              </Text>
            </>
          ) : (
            <Text className="text-text-secondary text-sm">
              {deloadStatusText(deload.status)}
            </Text>
          )}
        </View>
      </>
    );
  };

  return (
    <View className="bg-surface rounded-xl p-4 mb-4 shadow-sm">
      <Text className="text-text-primary text-base font-bold">
        {t('exerciseStatistics.volume.title', {
          defaultValue: 'Weekly Muscle Volume',
        })}
      </Text>
      <Text className="text-text-secondary text-xs mt-0.5 mb-3">
        {t('exerciseStatistics.volume.subtitle', {
          min: formatLocalizedNumber(data?.range.min ?? 10),
          max: formatLocalizedNumber(data?.range.max ?? 20),
          defaultValue:
            'Hard sets per muscle against {{min}} to {{max}} a week. A set counts 1 for its main muscles and 0.5 for helper muscles; warm-ups and sets logged as easy are left out.',
        })}
      </Text>
      {renderBody()}
    </View>
  );
};

export default StrengthVolumeCard;
