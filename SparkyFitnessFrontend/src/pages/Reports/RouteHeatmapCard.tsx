import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  MapContainer,
  Rectangle,
  TileLayer,
  useMap,
  useMapEvents,
} from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import {
  HEATMAP_MAX_CELLS,
  heatIntensityClass,
  nearestHeatCell,
  todayInZone,
  type HeatCell,
  type HeatmapResponse,
} from '@workspace/shared';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { usePreferences } from '@/contexts/PreferencesContext';
import { useHeatmap } from '@/hooks/Reports/useReports';
import type { HeatmapRequest } from '@/hooks/Reports/useReports';
import {
  HEATMAP_PERIODS,
  heatmapPeriodStart,
  type HeatmapPeriod,
} from '@/utils/heatmapPeriod';

const ACTIVITIES = ['all', 'run', 'walk', 'ride', 'hike'] as const;
type Activity = (typeof ACTIVITIES)[number];
const PERIODS = HEATMAP_PERIODS;
type Period = HeatmapPeriod;

/** Fill colours, faint to strong. */
const COLORS = ['#ffbe46', '#ff9628', '#ff6914', '#f03c14', '#dc143c'] as const;
const WEB_MAX_CELLS = 2500;
const M_PER_DEG_LAT = 111_320;

type View = NonNullable<HeatmapRequest['view']>;

/** Sits inside the map: fits the first answer, reports each settled view. */
const MapWatcher = ({
  bounds,
  onView,
  onTap,
}: {
  bounds: HeatmapResponse['bounds'];
  onView: (view: View) => void;
  onTap: (lat: number, lon: number) => void;
}) => {
  const map = useMap();
  useEffect(() => {
    if (bounds) {
      map.fitBounds([
        [bounds.minLat, bounds.minLon],
        [bounds.maxLat, bounds.maxLon],
      ]);
    }
    // Frame the map once per filter, not on every pan.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, bounds?.minLat, bounds?.maxLon]);
  const report = () => {
    const b = map.getBounds();
    const padLat = (b.getNorth() - b.getSouth()) / 3;
    const padLon = (b.getEast() - b.getWest()) / 3;
    onView({
      minLat: Math.max(-90, +(b.getSouth() - padLat).toFixed(3)),
      maxLat: Math.min(90, +(b.getNorth() + padLat).toFixed(3)),
      minLon: Math.max(-180, +(b.getWest() - padLon).toFixed(3)),
      maxLon: Math.min(180, +(b.getEast() + padLon).toFixed(3)),
    });
  };
  useMapEvents({
    moveend: report,
    click: (event: { latlng: { lat: number; lng: number } }) =>
      onTap(event.latlng.lat, event.latlng.lng),
  });
  return null;
};

/**
 * Everywhere the person has run, walked, ridden or hiked, from their own
 * stored GPS tracks: brighter where they went more often. Tap to see how many
 * times a spot was used. Personal only: the server builds it from the signed-in
 * person's tracks and refuses it when acting for someone else.
 */
const RouteHeatmapCard = () => {
  const { t } = useTranslation();
  const { timezone } = usePreferences();
  const [activity, setActivity] = useState<Activity>('all');
  const [period, setPeriod] = useState<Period>('all');
  const [view, setView] = useState<View | undefined>();
  const [selected, setSelected] = useState<HeatCell | null>(null);

  const base: HeatmapRequest = useMemo(() => {
    const from = heatmapPeriodStart(period, todayInZone(timezone || 'UTC'));
    return {
      ...(activity !== 'all' ? { activities: [activity] } : {}),
      ...(from ? { from } : {}),
      maxCells: Math.min(WEB_MAX_CELLS, HEATMAP_MAX_CELLS),
    };
  }, [activity, period, timezone]);

  const overview = useHeatmap(base);
  const detail = useHeatmap({ ...base, view }, view !== undefined);
  const data =
    view !== undefined ? (detail.data ?? overview.data) : overview.data;

  const cells: HeatCell[] = useMemo(
    () => (data?.cells ?? []).map(([lat, lon, count]) => ({ lat, lon, count })),
    [data]
  );

  const changeFilter =
    <T,>(set: (value: T) => void) =>
    (value: T) => {
      setSelected(null);
      setView(undefined);
      set(value);
    };

  const activityLabel = (key: Activity) =>
    ({
      all: t('reports.routeHeatmap.activity.all', 'All'),
      run: t('reports.routeHeatmap.activity.run', 'Run'),
      walk: t('reports.routeHeatmap.activity.walk', 'Walk'),
      ride: t('reports.routeHeatmap.activity.ride', 'Ride'),
      hike: t('reports.routeHeatmap.activity.hike', 'Hike'),
    })[key];
  const periodLabel = (key: Period) =>
    ({
      '30d': t('reports.routeHeatmap.period.30d', '30 days'),
      '90d': t('reports.routeHeatmap.period.90d', '90 days'),
      '1y': t('reports.routeHeatmap.period.1y', 'Year'),
      all: t('reports.routeHeatmap.period.all', 'All time'),
    })[key];

  const chip = (selectedNow: boolean) =>
    `px-2.5 py-1 rounded font-medium text-xs transition-all ${
      selectedNow
        ? 'bg-primary text-primary-foreground shadow-sm'
        : 'text-muted-foreground hover:text-foreground'
    }`;

  const halfLat = data ? data.cellM / 2 / M_PER_DEG_LAT : 0;

  return (
    <Card data-testid="route-heatmap">
      <CardHeader>
        <CardTitle>
          {t('reports.routeHeatmap.title', 'Route heatmap')}
        </CardTitle>
        <div className="flex flex-wrap gap-2 pt-2">
          <div className="inline-flex items-center bg-muted p-1 rounded-md">
            {ACTIVITIES.map((key) => (
              <button
                key={key}
                type="button"
                className={chip(activity === key)}
                onClick={() => changeFilter(setActivity)(key)}
              >
                {activityLabel(key)}
              </button>
            ))}
          </div>
          <div className="inline-flex items-center bg-muted p-1 rounded-md">
            {PERIODS.map((key) => (
              <button
                key={key}
                type="button"
                className={chip(period === key)}
                onClick={() => changeFilter(setPeriod)(key)}
              >
                {periodLabel(key)}
              </button>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {overview.isLoading ? (
          <p className="text-sm text-muted-foreground">
            {t('reports.routeHeatmap.loading', 'Loading your heatmap...')}
          </p>
        ) : overview.isError && !data ? (
          <p className="text-sm text-muted-foreground">
            {t(
              'reports.routeHeatmap.loadFailed',
              'Failed to load your route heatmap.'
            )}
          </p>
        ) : !data || data.activityCount === 0 ? (
          <p
            className="text-sm text-muted-foreground"
            data-testid="heatmap-empty"
          >
            {t(
              'reports.routeHeatmap.empty',
              'Nothing to show for this filter yet. Runs, walks and rides with a recorded GPS track appear here.'
            )}
          </p>
        ) : (
          <>
            <div style={{ height: 460, width: '100%' }}>
              <MapContainer
                center={[
                  ((data.bounds?.minLat ?? 0) + (data.bounds?.maxLat ?? 0)) / 2,
                  ((data.bounds?.minLon ?? 0) + (data.bounds?.maxLon ?? 0)) / 2,
                ]}
                zoom={11}
                keyboard={false}
                preferCanvas
                style={{ height: '100%', width: '100%' }}
              >
                <TileLayer
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                <MapWatcher
                  bounds={overview.data?.bounds ?? null}
                  onView={setView}
                  onTap={(lat, lon) =>
                    setSelected(
                      nearestHeatCell(cells, lat, lon, data.cellM * 1.1)
                    )
                  }
                />
                {cells.map((cell) => {
                  const halfLon =
                    data.cellM /
                    2 /
                    (M_PER_DEG_LAT *
                      Math.max(0.01, Math.cos((cell.lat * Math.PI) / 180)));
                  const cls = heatIntensityClass(
                    cell.count,
                    data.maxCount,
                    COLORS.length
                  );
                  return (
                    <Rectangle
                      key={`${cell.lat}:${cell.lon}`}
                      bounds={[
                        [cell.lat - halfLat, cell.lon - halfLon],
                        [cell.lat + halfLat, cell.lon + halfLon],
                      ]}
                      pathOptions={{
                        stroke: false,
                        fillColor: COLORS[cls],
                        fillOpacity: 0.35 + 0.1 * cls,
                      }}
                    />
                  );
                })}
              </MapContainer>
            </div>
            {selected ? (
              <p className="text-sm font-medium" data-testid="heatmap-selected">
                {t('reports.routeHeatmap.used', {
                  count: selected.count,
                  defaultValue_one: 'Used {{count}} time',
                  defaultValue_other: 'Used {{count}} times',
                })}
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                {t(
                  'reports.routeHeatmap.tapHint',
                  'Click the map to see how often a road was used.'
                )}
              </p>
            )}
            <p
              className="text-xs text-muted-foreground"
              data-testid="heatmap-summary"
            >
              {t('reports.routeHeatmap.summary', {
                count: data.activityCount,
                defaultValue_one: '{{count}} activity',
                defaultValue_other: '{{count}} activities',
              })}
              {data.firstDate && data.lastDate
                ? ` · ${data.firstDate} – ${data.lastDate}`
                : ''}
            </p>
            {data.truncated ? (
              <p
                className="text-xs text-muted-foreground"
                data-testid="heatmap-truncated"
              >
                {t(
                  'reports.routeHeatmap.truncated',
                  'Showing the busiest places. Zoom in or choose a shorter period to see more.'
                )}
              </p>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  );
};

export default RouteHeatmapCard;
