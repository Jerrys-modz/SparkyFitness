import type { RouteCue, RouteCueKind, RoutePoint } from '@workspace/shared';

/** One maneuver of a Valhalla `/route` leg. Lengths are kilometres. */
export interface ValhallaManeuver {
  type: number;
  instruction?: string;
  length?: number;
  begin_shape_index?: number;
}

export interface ValhallaLeg {
  /** Encoded polyline, precision 6. */
  shape: string;
  maneuvers: ValhallaManeuver[];
}

/**
 * Valhalla `DirectionsLeg_Maneuver_Type` values onto our cue kinds. `null`
 * means "no instruction worth giving" (type 0, `none`).
 */
const CUE_KIND_BY_TYPE: Record<number, RouteCueKind | null> = {
  0: null,
  1: 'depart',
  2: 'depart',
  3: 'depart',
  4: 'arrive',
  5: 'arrive',
  6: 'arrive',
  7: 'straight', // becomes
  8: 'straight', // continue
  9: 'slight_right',
  10: 'right',
  11: 'sharp_right',
  12: 'uturn',
  13: 'uturn',
  14: 'sharp_left',
  15: 'left',
  16: 'slight_left',
  17: 'straight', // ramp straight
  18: 'slight_right', // ramp right
  19: 'slight_left', // ramp left
  20: 'slight_right', // exit right
  21: 'slight_left', // exit left
  22: 'straight', // stay straight
  23: 'slight_right', // stay right
  24: 'slight_left', // stay left
  25: 'straight', // merge
  26: 'straight', // roundabout enter
  27: 'straight', // roundabout exit
  36: 'slight_right', // merge right
  37: 'slight_left', // merge left
};

/** Maps one Valhalla maneuver type to a cue kind; anything unknown is straight. */
export function maneuverTypeToCueKind(type: number): RouteCueKind | null {
  return type in CUE_KIND_BY_TYPE ? CUE_KIND_BY_TYPE[type] : 'straight';
}

/** Decodes an encoded polyline (Valhalla uses precision 6). */
export function decodePolyline(encoded: string, precision = 6): RoutePoint[] {
  const factor = 10 ** precision;
  const points: RoutePoint[] = [];
  let index = 0;
  let lat = 0;
  let lon = 0;

  const readValue = (): number => {
    let result = 0;
    let shift = 0;
    let byte: number;
    do {
      if (index >= encoded.length) {
        throw new RangeError('Truncated polyline');
      }
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    return result & 1 ? ~(result >> 1) : result >> 1;
  };

  while (index < encoded.length) {
    lat += readValue();
    lon += readValue();
    points.push({ lat: lat / factor, lon: lon / factor });
  }
  return points;
}

export interface MappedRoute {
  points: RoutePoint[];
  cues: RouteCue[];
}

const TEXT_MAX = 120;

/**
 * Joins the legs of a Valhalla response into one track and maps the maneuvers
 * to cues. Legs share their join point, so it is kept once and cue indexes are
 * offset into the joined track. A multi-leg route would otherwise say "arrive"
 * and "depart" at every via point, so only the first `depart` and the last
 * `arrive` are kept.
 */
export function mapValhallaLegs(legs: readonly ValhallaLeg[]): MappedRoute {
  const points: RoutePoint[] = [];
  const cues: RouteCue[] = [];
  let travelledM = 0;

  legs.forEach((leg, legIndex) => {
    const shape = decodePolyline(leg.shape);
    const offset = legIndex === 0 ? 0 : points.length - 1;
    points.push(...(legIndex === 0 ? shape : shape.slice(1)));

    for (const maneuver of leg.maneuvers) {
      const kind = maneuverTypeToCueKind(maneuver.type);
      const lengthM = Math.max(0, (maneuver.length ?? 0) * 1000);
      const isJoin =
        (kind === 'arrive' && legIndex < legs.length - 1) ||
        (kind === 'depart' && legIndex > 0);
      if (kind !== null && !isJoin) {
        const begin = maneuver.begin_shape_index ?? 0;
        const text = maneuver.instruction?.trim().slice(0, TEXT_MAX);
        cues.push({
          index: Math.min(offset + begin, Math.max(0, points.length - 1)),
          kind,
          ...(text ? { text } : {}),
          distanceM: Math.round(travelledM * 10) / 10,
        });
      }
      travelledM += lengthM;
    }
  });

  return { points, cues };
}
