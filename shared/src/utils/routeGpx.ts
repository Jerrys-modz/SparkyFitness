import type { RoutePoint } from "../schemas/api/Route.api.zod.ts";

const decodeXml = (text: string): string =>
  text
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .trim();

const escapeXml = (text: string): string =>
  text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const POINT_PATTERN = /<(trkpt|rtept)\b([^>]*?)(?:\/>|>([\s\S]*?)<\/\1>)/g;

function attribute(attributes: string, name: string): number | null {
  const match = new RegExp(`\\b${name}\\s*=\\s*["']([^"']+)["']`).exec(
    attributes,
  );
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) ? value : null;
}

export interface ParsedGpx {
  name: string | null;
  points: RoutePoint[];
}

/**
 * Reads the track (`trkpt`) or, failing that, route (`rtept`) points from a
 * GPX file. Points with a missing or out-of-range position are dropped.
 * Deliberately tolerant and dependency-free; it is not a general XML parser.
 */
export function parseGpx(gpx: string): ParsedGpx {
  const tracks: RoutePoint[] = [];
  const routes: RoutePoint[] = [];
  POINT_PATTERN.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = POINT_PATTERN.exec(gpx)) !== null) {
    const lat = attribute(match[2] ?? "", "lat");
    const lon = attribute(match[2] ?? "", "lon");
    if (lat === null || lon === null) continue;
    if (lat < -90 || lat > 90 || lon < -180 || lon > 180) continue;
    const point: RoutePoint = { lat, lon };
    const ele = /<ele>\s*([^<\s]+)\s*<\/ele>/.exec(match[3] ?? "");
    if (ele) {
      const alt = Number(ele[1]);
      if (Number.isFinite(alt) && alt >= -1000 && alt <= 10000) point.alt = alt;
    }
    (match[1] === "trkpt" ? tracks : routes).push(point);
  }

  const nameSource = gpx.replace(POINT_PATTERN, "");
  const trackName = /<trk\b[\s\S]*?<name>([\s\S]*?)<\/name>/.exec(nameSource);
  const routeName = /<rte\b[\s\S]*?<name>([\s\S]*?)<\/name>/.exec(nameSource);
  const metadataName = /<metadata\b[\s\S]*?<name>([\s\S]*?)<\/name>/.exec(
    nameSource,
  );
  const rawName = trackName?.[1] ?? routeName?.[1] ?? metadataName?.[1];
  const name = rawName ? decodeXml(rawName) : "";

  return {
    name: name.length > 0 ? name : null,
    points: tracks.length > 0 ? tracks : routes,
  };
}

/** A GPX 1.1 file with one track of one segment. */
export function serializeGpx(
  name: string,
  points: readonly RoutePoint[],
): string {
  const body = points
    .map((p) => {
      const ele = p.alt === undefined ? "" : `<ele>${p.alt}</ele>`;
      return `      <trkpt lat="${p.lat}" lon="${p.lon}">${ele}</trkpt>`;
    })
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="SparkyFitness" xmlns="http://www.topografix.com/GPX/1/1">
  <trk>
    <name>${escapeXml(name)}</name>
    <trkseg>
${body}
    </trkseg>
  </trk>
</gpx>
`;
}
