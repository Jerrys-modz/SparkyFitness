import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  heartRateZoneBands,
  type ResolvedHeartRateZones,
} from '@workspace/shared';
import { maxHrSourceLabel, zoneMethodName } from '@/utils/heartRateZoneLabels';

interface HeartRateZoneLegendProps {
  resolved: ResolvedHeartRateZones;
  /** True until the person's own zones have loaded. */
  isDefault?: boolean;
  /** Add the line saying where the zones come from. */
  showSource?: boolean;
  className?: string;
}

/** The person's five zones, each with its color and bpm range. */
export const HeartRateZoneLegend = ({
  resolved,
  isDefault = false,
  showSource = false,
  className = '',
}: HeartRateZoneLegendProps) => {
  const { t } = useTranslation();
  const bands = heartRateZoneBands(resolved.zones);

  return (
    <div
      className={`space-y-1.5 text-[11px] font-medium text-muted-foreground ${className}`}
      data-testid="heart-rate-zone-legend"
    >
      <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
        {bands.map((band) => (
          <span
            key={band.zone}
            className="flex items-center gap-1.5"
            data-testid={`heart-rate-zone-legend-${band.zone}`}
          >
            <span
              className="w-2 h-2 rounded-full"
              style={{ backgroundColor: band.color }}
            />
            {t('settings.heartRateZones.zone', {
              defaultValue: 'Zone {{zone}}',
              zone: band.zone,
            })}
            <span className="font-normal">
              {band.upperBpm === null
                ? t('settings.heartRateZones.zoneRangeOpen', {
                    defaultValue: '{{lower}}+ bpm',
                    lower: band.lowerBpm,
                  })
                : t('settings.heartRateZones.zoneRange', {
                    defaultValue: '{{lower}}–{{upper}} bpm',
                    lower: band.lowerBpm,
                    upper: band.upperBpm,
                  })}
            </span>
          </span>
        ))}
      </div>
      {showSource && (
        <p
          className="text-center font-normal"
          data-testid="heart-rate-zone-source"
        >
          {isDefault
            ? t(
                'heartRate.zoneSourceDefault',
                'Typical zones (% of a 190 bpm max) until your own load.'
              )
            : t('heartRate.zoneSource', {
                defaultValue:
                  'Your zones: {{method}}, max heart rate {{max}} bpm ({{source}}).',
                method: zoneMethodName(t, resolved.effectiveMethod),
                max: resolved.maxHr,
                source: maxHrSourceLabel(t, resolved.maxHrSource),
              })}{' '}
          <Link
            to="/settings?tab=heart-rate-zones"
            className="underline hover:text-foreground"
          >
            {t('heartRate.zoneSettingsLink', 'Heart rate zone settings')}
          </Link>
        </p>
      )}
    </div>
  );
};
