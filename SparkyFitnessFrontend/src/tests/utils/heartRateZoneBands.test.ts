import {
  fallbackZoneFloors,
  zoneEdges,
  zoneGradientStops,
  zoneStroke,
} from '@/utils/heartRateZoneBands';

// Heart rate reserve floors for max 188, resting 68
const floors = [128, 140, 152, 164, 176];
const edges = zoneEdges(floors);

describe('heartRateZoneBands', () => {
  it('uses zones 2 to 5 as the color edges', () => {
    expect(edges).toEqual([140, 152, 164, 176]);
  });

  it('falls back to the default zones for a wrong floor count', () => {
    expect(zoneEdges([1, 2])).toEqual(fallbackZoneFloors().slice(1));
  });

  it('puts a hard edge at every floor inside the line range', () => {
    const stops = zoneGradientStops(100, 190, edges);
    const hard = stops.filter((s, i) => stops[i + 1]?.offset === s.offset);
    expect(hard.map((s) => s.offset)).toEqual([
      (190 - 176) / 90,
      (190 - 164) / 90,
      (190 - 152) / 90,
      (190 - 140) / 90,
    ]);
    expect(stops[0]?.color).toBe('#ef4444');
    expect(stops[stops.length - 1]?.color).toBe('#94a3b8');
  });

  it('draws a flat line in one solid color', () => {
    const stops = zoneGradientStops(90, 90, edges);
    expect(new Set(stops.map((s) => s.color)).size).toBe(1);
  });

  it('chooses a solid stroke or the gradient', () => {
    expect(zoneStroke(zoneGradientStops(60, 100, edges), 'g')).toBe('#94a3b8');
    expect(zoneStroke(zoneGradientStops(100, 180, edges), 'g')).toBe('url(#g)');
    expect(zoneStroke([], 'g')).toBe('none');
  });
});
