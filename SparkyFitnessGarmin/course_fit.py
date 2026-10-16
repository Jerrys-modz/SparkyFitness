"""Builds Garmin course files (FIT, or GPX as a fallback) from a saved route.

The garminconnect library has no FIT course writer, so this encodes the few
messages a course needs: file_id (type=course), course, lap, record and
course_point. Cues become course points, which a watch announces as turn
alerts ("Turn left in 100 m").
"""

from __future__ import annotations

import math
import struct
from datetime import datetime, timezone
from xml.sax.saxutils import escape

# Seconds between the Unix epoch and the FIT epoch (1989-12-31T00:00:00Z).
FIT_EPOCH_OFFSET = 631065600

# FIT global message numbers.
MESG_FILE_ID = 0
MESG_LAP = 19
MESG_RECORD = 20
MESG_COURSE = 31
MESG_COURSE_POINT = 32

# FIT base types: (type byte, struct format, invalid value).
ENUM = (0x00, "B", 0xFF)
UINT8 = (0x02, "B", 0xFF)
SINT32 = (0x85, "i", 0x7FFFFFFF)
UINT16 = (0x84, "H", 0xFFFF)
UINT32 = (0x86, "I", 0xFFFFFFFF)
UINT32Z = (0x8C, "I", 0)
STRING = (0x07, "s", b"\x00")

# FIT `course_point` enum, keyed by the route cue kind.
COURSE_POINT_TYPES = {
    "straight": 8,
    "left": 6,
    "right": 7,
    "slight_left": 19,
    "sharp_left": 20,
    "slight_right": 21,
    "sharp_right": 22,
    "uturn": 23,
    "arrive": 0,  # generic: the end of the course
}

# FIT `sport` enum, keyed by the route activity.
SPORTS = {"run": 1, "ride": 2, "walk": 11, "hike": 17}
# Metres per second used to give the track plausible timestamps.
PACE_MPS = {"run": 3.0, "ride": 7.0, "walk": 1.4, "hike": 1.2}

NAME_BYTES = 32
MAX_POINTS = 10000  # Garmin Connect refuses very large courses


def _semicircles(degrees: float) -> int:
    return int(round(degrees * (2**31) / 180.0))


def _haversine(a: dict, b: dict) -> float:
    r = 6371008.8
    p1, p2 = math.radians(a["lat"]), math.radians(b["lat"])
    dphi = p2 - p1
    dlmb = math.radians(b["lon"] - a["lon"])
    h = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlmb / 2) ** 2
    return 2 * r * math.asin(min(1.0, math.sqrt(h)))


def cumulative_distances(points: list[dict]) -> list[float]:
    """Metres from the start to each point."""
    total = 0.0
    out = [0.0]
    for prev, cur in zip(points, points[1:]):
        total += _haversine(prev, cur)
        out.append(total)
    return out


def _fit_name(text: str | None, fallback: str) -> str:
    """UTF-8 text cut to fit a 32 byte FIT string field, on a character boundary."""
    value = (text or "").strip() or fallback
    raw = value.encode("utf-8")[: NAME_BYTES - 1]
    return raw.decode("utf-8", errors="ignore")


def _crc16(data: bytes, crc: int = 0) -> int:
    table = [
        0x0000, 0xCC01, 0xD801, 0x1400, 0xF001, 0x3C00, 0x2800, 0xE401,
        0xA001, 0x6C00, 0x7800, 0xB401, 0x5000, 0x9C01, 0x8801, 0x4400,
    ]  # fmt: skip
    for byte in data:
        tmp = table[crc & 0xF]
        crc = (crc >> 4) & 0x0FFF
        crc = crc ^ tmp ^ table[byte & 0xF]
        tmp = table[crc & 0xF]
        crc = (crc >> 4) & 0x0FFF
        crc = crc ^ tmp ^ table[(byte >> 4) & 0xF]
    return crc


class _Writer:
    """Minimal FIT writer: one local message type per global message."""

    def __init__(self) -> None:
        self.body = bytearray()
        self._locals: dict[int, int] = {}

    def define(self, local: int, global_num: int, fields: list[tuple]) -> None:
        """fields: (field number, base type, size in bytes)."""
        self._locals[local] = global_num
        self.body += struct.pack("<BBBHB", 0x40 | local, 0, 0, global_num, len(fields))
        for number, base, size in fields:
            self.body += struct.pack("<BBB", number, size, base[0])

    def write(self, local: int, values: list[tuple]) -> None:
        """values: (base type, size, value or None for invalid)."""
        self.body += struct.pack("<B", local)
        for base, size, value in values:
            if base is STRING:
                raw = (value or "").encode("utf-8")[: size - 1]
                self.body += raw + b"\x00" * (size - len(raw))
                continue
            if value is None:
                value = base[2]
            self.body += struct.pack("<" + base[1], int(value))

    def finish(self) -> bytes:
        header = struct.pack("<BBHI4s", 14, 0x20, 2140, len(self.body), b".FIT")
        header += struct.pack("<H", _crc16(header))
        payload = header + bytes(self.body)
        return payload + struct.pack("<H", _crc16(payload[14:]))


def build_fit_course(
    name: str,
    points: list[dict],
    cues: list[dict],
    activity: str = "run",
    start: datetime | None = None,
) -> bytes:
    """Encode a route as a FIT course file with turn-by-turn course points."""
    if len(points) < 2:
        raise ValueError("A course needs at least two points")
    if len(points) > MAX_POINTS:
        raise ValueError(f"A course may have at most {MAX_POINTS} points")

    start = start or datetime.now(timezone.utc)
    start_fit = int(start.timestamp()) - FIT_EPOCH_OFFSET
    dist = cumulative_distances(points)
    total_m = dist[-1]
    pace = PACE_MPS.get(activity, PACE_MPS["run"])

    def stamp(distance_m: float) -> int:
        return start_fit + int(round(distance_m / pace))

    course_name = _fit_name(name, "Route")
    w = _Writer()

    w.define(
        0, MESG_FILE_ID,
        [(0, ENUM, 1), (1, UINT16, 2), (2, UINT16, 2), (3, UINT32Z, 4), (4, UINT32, 4)],
    )  # fmt: skip
    w.write(
        0,
        [(ENUM, 1, 6), (UINT16, 2, 255), (UINT16, 2, 0), (UINT32Z, 4, 1), (UINT32, 4, start_fit)],
    )  # fmt: skip

    w.define(1, MESG_COURSE, [(4, ENUM, 1), (5, STRING, NAME_BYTES)])
    w.write(1, [(ENUM, 1, SPORTS.get(activity, 1)), (STRING, NAME_BYTES, course_name)])

    w.define(
        2, MESG_LAP,
        [
            (253, UINT32, 4), (2, UINT32, 4), (3, SINT32, 4), (4, SINT32, 4),
            (5, SINT32, 4), (6, SINT32, 4), (7, UINT32, 4), (8, UINT32, 4), (9, UINT32, 4),
        ],
    )  # fmt: skip
    elapsed_ms = int(round(total_m / pace * 1000))
    w.write(
        2,
        [
            (UINT32, 4, stamp(total_m)), (UINT32, 4, start_fit),
            (SINT32, 4, _semicircles(points[0]["lat"])), (SINT32, 4, _semicircles(points[0]["lon"])),
            (SINT32, 4, _semicircles(points[-1]["lat"])), (SINT32, 4, _semicircles(points[-1]["lon"])),
            (UINT32, 4, elapsed_ms), (UINT32, 4, elapsed_ms), (UINT32, 4, int(round(total_m * 100))),
        ],
    )  # fmt: skip

    w.define(
        3, MESG_COURSE_POINT,
        [
            (1, UINT32, 4), (2, SINT32, 4), (3, SINT32, 4), (4, UINT32, 4),
            (5, ENUM, 1), (6, STRING, NAME_BYTES),
        ],
    )  # fmt: skip
    # Course points must appear before the records that pass them.
    for cue in sorted(cues, key=lambda c: c["index"]):
        kind = cue.get("kind")
        if kind == "depart" or kind not in COURSE_POINT_TYPES:
            continue
        idx = cue["index"]
        if idx < 0 or idx >= len(points):
            continue
        label = cue.get("text") or ("Arrive" if kind == "arrive" else kind.replace("_", " ").title())
        w.write(
            3,
            [
                (UINT32, 4, stamp(dist[idx])),
                (SINT32, 4, _semicircles(points[idx]["lat"])),
                (SINT32, 4, _semicircles(points[idx]["lon"])),
                (UINT32, 4, int(round(dist[idx] * 100))),
                (ENUM, 1, COURSE_POINT_TYPES[kind]),
                (STRING, NAME_BYTES, _fit_name(label, "Turn")),
            ],
        )

    w.define(
        4, MESG_RECORD,
        [(253, UINT32, 4), (0, SINT32, 4), (1, SINT32, 4), (2, UINT16, 2), (5, UINT32, 4)],
    )  # fmt: skip
    for point, d in zip(points, dist):
        alt = point.get("alt")
        # altitude: scale 5, offset 500
        alt_raw = None if alt is None else max(0, min(0xFFFE, int(round((alt + 500) * 5))))
        w.write(
            4,
            [
                (UINT32, 4, stamp(d)),
                (SINT32, 4, _semicircles(point["lat"])),
                (SINT32, 4, _semicircles(point["lon"])),
                (UINT16, 2, alt_raw),
                (UINT32, 4, int(round(d * 100))),
            ],
        )
    return w.finish()


def build_gpx_course(name: str, points: list[dict], cues: list[dict]) -> bytes:
    """GPX track with the cues as named waypoints.

    A watch gets the line to follow but no turn alerts: GPX has no course
    point type, and Garmin Connect treats waypoints as plain map markers.
    """
    if len(points) < 2:
        raise ValueError("A course needs at least two points")
    out = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<gpx version="1.1" creator="SparkyFitness" xmlns="http://www.topografix.com/GPX/1/1">',
    ]
    for cue in sorted(cues, key=lambda c: c["index"]):
        idx = cue["index"]
        if cue.get("kind") == "depart" or not 0 <= idx < len(points):
            continue
        label = cue.get("text") or cue.get("kind", "").replace("_", " ").title()
        p = points[idx]
        out.append(
            f'<wpt lat="{p["lat"]:.7f}" lon="{p["lon"]:.7f}"><name>{escape(_fit_name(label, "Turn"))}</name></wpt>'
        )
    out.append(f"<trk><name>{escape(_fit_name(name, 'Route'))}</name><trkseg>")
    for p in points:
        ele = f'<ele>{p["alt"]:.1f}</ele>' if p.get("alt") is not None else ""
        out.append(f'<trkpt lat="{p["lat"]:.7f}" lon="{p["lon"]:.7f}">{ele}</trkpt>')
    out.append("</trkseg></trk></gpx>")
    return "\n".join(out).encode("utf-8")
