import type { RoutePoint } from '../schemas/api/Route.api.zod.ts';

const CDATA_OPEN = '<![CDATA[';
const CDATA_CLOSE = ']]>';

/** Unwraps CDATA sections with plain scans, so odd input cannot make it slow. */
function unwrapCdata(text: string): string {
  let out = '';
  let from = 0;
  for (;;) {
    const open = text.indexOf(CDATA_OPEN, from);
    if (open === -1) break;
    const close = text.indexOf(CDATA_CLOSE, open + CDATA_OPEN.length);
    if (close === -1) break;
    out += text.slice(from, open) + text.slice(open + CDATA_OPEN.length, close);
    from = close + CDATA_CLOSE.length;
  }
  return out + text.slice(from);
}

const decodeXml = (text: string): string =>
  unwrapCdata(text)
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .trim();

/**
 * Whether a code point may appear in an XML 1.0 document: tab, line feed,
 * carriage return, and the ranges above the control characters, minus the
 * surrogate block and the two non-characters at the top of the BMP.
 */
const isXml10Char = (code: number): boolean =>
  code === 0x9 ||
  code === 0xa ||
  code === 0xd ||
  (code >= 0x20 && code <= 0xd7ff) ||
  (code >= 0xe000 && code <= 0xfffd) ||
  (code >= 0x10000 && code <= 0x10ffff);

/** The text without the characters XML 1.0 cannot carry (a name may hold any). */
const stripXmlForbidden = (text: string): string => {
  let out = '';
  for (const char of text) {
    if (isXml10Char(char.codePointAt(0) as number)) out += char;
  }
  return out;
};

const escapeXml = (text: string): string =>
  stripXmlForbidden(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/** The text with its `<!-- -->` comments removed (an unclosed one runs to the end). */
function stripComments(text: string): string {
  let out = '';
  let from = 0;
  for (;;) {
    const open = text.indexOf('<!--', from);
    if (open === -1) break;
    out += text.slice(from, open);
    const close = text.indexOf('-->', open + 4);
    if (close === -1) return out;
    from = close + 3;
  }
  return out + text.slice(from);
}

function attribute(attributes: string, name: string): number | null {
  const match = new RegExp(`\\b${name}\\s*=\\s*["']([^"']+)["']`).exec(
    attributes
  );
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) ? value : null;
}

export interface ParsedGpx {
  name: string | null;
  points: RoutePoint[];
}

const isNameChar = (c: string | undefined): boolean =>
  c !== undefined && /[A-Za-z0-9_]/.test(c);

/** The index of the next `<tag` that is the whole tag name, or -1. */
function findOpenTag(text: string, tag: string, from: number): number {
  const needle = `<${tag}`;
  let at = text.indexOf(needle, from);
  while (at !== -1 && isNameChar(text[at + needle.length])) {
    at = text.indexOf(needle, at + needle.length);
  }
  return at;
}

/** The text of the first `<name>` after `from`, or null. */
function nameAfter(text: string, from: number): string | null {
  const open = text.indexOf('<name>', from);
  if (open === -1) return null;
  const close = text.indexOf('</name>', open + 6);
  return close === -1 ? null : text.slice(open + 6, close);
}

/** The altitude in a point's first well-formed `<ele>`, or null when it is out of range. */
function elevation(body: string): number | null {
  let from = 0;
  for (;;) {
    const open = body.indexOf('<ele>', from);
    if (open === -1) return null;
    const close = body.indexOf('</ele>', open + 5);
    if (close === -1) return null;
    from = open + 5;
    // A number is short; anything longer is not one and is not worth slicing.
    if (close - from > 40) continue;
    const text = body.slice(from, close).trim();
    if (text.length === 0 || /\s/.test(text) || text.includes('<')) continue;
    // The first well-formed element decides, in range or not.
    const alt = Number(text);
    return Number.isFinite(alt) && alt >= -1000 && alt <= 10000 ? alt : null;
  }
}

/**
 * Reads the track (`trkpt`) or, failing that, route (`rtept`) points from a
 * GPX file. Points with a missing or out-of-range position are dropped.
 * Deliberately tolerant and dependency-free; it is not a general XML parser.
 * It is a single left-to-right scan with `indexOf`, never a backtracking
 * expression, so a hostile or malformed file (thousands of unclosed tags, say)
 * costs time in proportion to its size.
 */
export function parseGpx(source: string): ParsedGpx {
  // Point-shaped text in a comment is not a point.
  const gpx = stripComments(source);
  const tracks: RoutePoint[] = [];
  const routes: RoutePoint[] = [];
  const rest: string[] = []; // the text between points, for the name lookup
  // The next closing tag per point tag, found once and reused; -2 = none left.
  const closers: Record<string, number> = { trkpt: -1, rtept: -1 };
  // The next opening tag per point tag, found once and reused; -2 = none left.
  const opens: Record<string, number> = { trkpt: -1, rtept: -1 };
  let cursor = 0;
  let copied = 0;
  // The next CDATA section, found once and reused; -2 = none left. Text inside
  // one is data, so a point tag in it is not a point.
  let cdataAt = -1;
  const nextCdata = (): number => {
    if (cdataAt === -2) return -1;
    if (cdataAt < cursor) {
      const found = gpx.indexOf(CDATA_OPEN, cursor);
      cdataAt = found === -1 ? -2 : found;
    }
    return cdataAt === -2 ? -1 : cdataAt;
  };
  const nextOpen = (tag: 'trkpt' | 'rtept'): number => {
    if (opens[tag] === -2) return -1;
    if ((opens[tag] as number) < cursor) {
      const found = findOpenTag(gpx, tag, cursor);
      opens[tag] = found === -1 ? -2 : found;
    }
    return opens[tag] === -2 ? -1 : (opens[tag] as number);
  };

  while (cursor < gpx.length) {
    const track = nextOpen('trkpt');
    const route = nextOpen('rtept');
    let start: number;
    let tag: 'trkpt' | 'rtept';
    if (track === -1 && route === -1) break;
    if (route === -1 || (track !== -1 && track < route)) {
      start = track;
      tag = 'trkpt';
    } else {
      start = route;
      tag = 'rtept';
    }
    const cdata = nextCdata();
    if (cdata !== -1 && cdata < start) {
      const close = gpx.indexOf(CDATA_CLOSE, cdata + CDATA_OPEN.length);
      if (close === -1) break;
      cursor = close + CDATA_CLOSE.length;
      continue;
    }
    const attributesStart = start + 1 + tag.length;
    const tagEnd = gpx.indexOf('>', attributesStart);
    if (tagEnd === -1) break;
    const selfClosing = gpx[tagEnd - 1] === '/';
    const attributes = gpx.slice(
      attributesStart,
      selfClosing ? tagEnd - 1 : tagEnd
    );
    let end = tagEnd + 1;
    let body = '';
    if (!selfClosing) {
      const closing = `</${tag}>`;
      if (closers[tag] !== -2 && (closers[tag] as number) < end) {
        const found = gpx.indexOf(closing, end);
        closers[tag] = found === -1 ? -2 : found;
      }
      const closeAt = closers[tag] as number;
      if (closeAt === -2) {
        // No closing tag anywhere after this: not a point. Keep scanning.
        cursor = attributesStart;
        continue;
      }
      body = gpx.slice(end, closeAt);
      end = closeAt + closing.length;
    }
    rest.push(gpx.slice(copied, start));
    copied = end;
    cursor = end;

    const lat = attribute(attributes, 'lat');
    const lon = attribute(attributes, 'lon');
    if (lat === null || lon === null) continue;
    if (lat < -90 || lat > 90 || lon < -180 || lon > 180) continue;
    const point: RoutePoint = { lat, lon };
    const alt = elevation(body);
    if (alt !== null) point.alt = alt;
    (tag === 'trkpt' ? tracks : routes).push(point);
  }
  rest.push(gpx.slice(copied));
  const nameSource = rest.join('');

  const nameOf = (tag: string): string | null => {
    const at = findOpenTag(nameSource, tag, 0);
    return at === -1 ? null : nameAfter(nameSource, at);
  };
  const rawName = nameOf('trk') ?? nameOf('rte') ?? nameOf('metadata');
  const name = rawName ? decodeXml(rawName) : '';

  return {
    name: name.length > 0 ? name : null,
    points: tracks.length > 0 ? tracks : routes,
  };
}

/** A GPX 1.1 file with one track of one segment. */
export function serializeGpx(
  name: string,
  points: readonly RoutePoint[]
): string {
  const body = points
    .map((p) => {
      const ele = p.alt === undefined ? '' : `<ele>${p.alt}</ele>`;
      return `      <trkpt lat="${p.lat}" lon="${p.lon}">${ele}</trkpt>`;
    })
    .join('\n');
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
