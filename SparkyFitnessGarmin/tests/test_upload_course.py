import io
import sys
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch

GARMIN_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(GARMIN_DIR))

from garminconnect import GarminConnectConnectionError

from course_fit import (
    COURSE_POINT_TYPES,
    build_fit_course,
    build_gpx_course,
    cumulative_distances,
)
from routes import upload_course
from schemas import UploadCourseRequest

POINTS = [
    {"lat": 40.0, "lon": -74.0, "alt": 10.0},
    {"lat": 40.001, "lon": -74.0, "alt": 12.0},
    {"lat": 40.001, "lon": -74.001},
    {"lat": 40.002, "lon": -74.001, "alt": 15.0},
]
CUES = [
    {"index": 0, "kind": "depart"},
    {"index": 1, "kind": "left", "text": "Turn left onto Main St"},
    {"index": 2, "kind": "sharp_right"},
    {"index": 3, "kind": "arrive"},
]


def request(**overrides):
    body = {
        "user_id": "u1",
        "tokens": "{}",
        "name": "Morning loop",
        "activity": "run",
        "points": POINTS,
        "cues": CUES,
    }
    body.update(overrides)
    return UploadCourseRequest(**body)


class FitCourseTests(unittest.TestCase):
    def decode(self, data):
        import fitdecode

        frames = []
        with fitdecode.FitReader(io.BytesIO(data), check_crc=True) as reader:
            for frame in reader:
                if frame.frame_type == fitdecode.FIT_FRAME_DATA:
                    frames.append(frame)
        return frames

    def test_file_is_a_valid_course_with_records_and_course_points(self):
        frames = self.decode(build_fit_course("Morning loop", POINTS, CUES))
        by_name = {}
        for f in frames:
            by_name.setdefault(f.name, []).append(f)

        self.assertEqual(by_name["file_id"][0].get_value("type"), "course")
        self.assertEqual(by_name["course"][0].get_value("name"), "Morning loop")
        self.assertEqual(len(by_name["record"]), len(POINTS))
        self.assertAlmostEqual(by_name["record"][0].get_value("position_lat"), 40.0, places=5)
        self.assertAlmostEqual(by_name["record"][0].get_value("altitude"), 10.0, places=1)
        self.assertIsNone(by_name["record"][2].get_value("altitude"))

    def test_cues_become_typed_course_points_and_depart_is_skipped(self):
        frames = self.decode(build_fit_course("Loop", POINTS, CUES))
        cps = [f for f in frames if f.name == "course_point"]
        self.assertEqual(
            [f.get_value("type") for f in cps], ["left", "sharp_right", "generic"]
        )
        self.assertEqual(cps[0].get_value("name"), "Turn left onto Main St")
        dists = cumulative_distances(POINTS)
        self.assertAlmostEqual(cps[0].get_value("distance"), dists[1], delta=0.01)

    def test_every_cue_kind_but_depart_has_a_course_point_type(self):
        from schemas import CourseCue  # noqa: F401

        kinds = {
            "straight", "slight_left", "left", "sharp_left",
            "slight_right", "right", "sharp_right", "uturn", "arrive",
        }  # fmt: skip
        self.assertEqual(kinds, set(COURSE_POINT_TYPES))

    def test_long_names_are_cut_on_a_character_boundary(self):
        frames = self.decode(build_fit_course("é" * 60, POINTS, []))
        name = [f for f in frames if f.name == "course"][0].get_value("name")
        self.assertTrue(name and len(name.encode("utf-8")) <= 31)

    def test_rejects_a_single_point(self):
        with self.assertRaises(ValueError):
            build_fit_course("x", POINTS[:1], [])
        with self.assertRaises(ValueError):
            build_gpx_course("x", POINTS[:1], [])

    def test_gpx_fallback_has_track_and_cue_waypoints(self):
        gpx = build_gpx_course("A & B", POINTS, CUES).decode()
        self.assertIn("<name>A &amp; B</name>", gpx)
        self.assertEqual(gpx.count("<trkpt"), 4)
        self.assertEqual(gpx.count("<wpt"), 3)


class UploadCourseTests(unittest.TestCase):
    def garmin(self, *responses):
        g = MagicMock()
        g.client.post.side_effect = list(responses)
        return g

    def test_uploads_fit_to_the_course_importer(self):
        g = self.garmin({"courseId": 123})
        out = upload_course(g, request())
        self.assertEqual(out, {"format": "fit", "course_id": 123})
        args, kwargs = g.client.post.call_args
        self.assertEqual(args, ("connectapi", "/course-service/course/import"))
        self.assertTrue(kwargs["files"]["file"][0].endswith(".fit"))
        self.assertEqual(kwargs["files"]["file"][1][:12][8:12], b".FIT")

    def test_retries_as_gpx_when_garmin_rejects_the_fit(self):
        g = self.garmin(GarminConnectConnectionError("API Error 400"), {"courseId": 9})
        out = upload_course(g, request())
        self.assertEqual(out["format"], "gpx")
        self.assertEqual(g.client.post.call_count, 2)
        self.assertTrue(g.client.post.call_args[1]["files"]["file"][0].endswith(".gpx"))

    def test_saves_the_parsed_course_when_import_returns_no_id(self):
        g = self.garmin({"geoPoints": [1, 2]}, {"courseId": 55})
        out = upload_course(g, request())
        self.assertEqual(out["course_id"], 55)
        save = g.client.post.call_args
        self.assertEqual(save[0][1], "/course-service/course")
        self.assertEqual(save[1]["json"]["courseName"], "Morning loop")

    def test_gpx_failure_propagates(self):
        g = self.garmin(
            GarminConnectConnectionError("a"), GarminConnectConnectionError("b")
        )
        with self.assertRaises(GarminConnectConnectionError):
            upload_course(g, request())


class UploadCourseEndpointTests(unittest.TestCase):
    def client(self):
        from fastapi.testclient import TestClient
        from main import app

        return TestClient(app)

    def body(self):
        return request().model_dump()

    def patched(self, upload):
        garmin = MagicMock()
        garmin.client.dumps.return_value = '{"di_token": "t"}'
        return patch("routes.Garmin", return_value=garmin), patch(
            "routes.upload_course", upload
        )

    def test_success_returns_new_tokens(self):
        a, b = self.patched(MagicMock(return_value={"format": "fit", "course_id": 1}))
        with a, b:
            res = self.client().post("/data/upload_course", json=self.body())
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json()["status"], "uploaded")
        self.assertEqual(res.json()["new_tokens"], {"di_token": "t"})

    def test_garmin_rejection_is_502(self):
        a, b = self.patched(MagicMock(side_effect=GarminConnectConnectionError("no")))
        with a, b:
            res = self.client().post("/data/upload_course", json=self.body())
        self.assertEqual(res.status_code, 502)

    def test_too_few_points_is_422(self):
        body = self.body()
        body["points"] = body["points"][:1]
        res = self.client().post("/data/upload_course", json=body)
        self.assertEqual(res.status_code, 422)


if __name__ == "__main__":
    unittest.main()
