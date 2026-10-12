"""Fetch orchestration with fake clients. No network, no garminconnect import."""

from __future__ import annotations

import json
import tempfile
import unittest
from datetime import date
from pathlib import Path
from types import SimpleNamespace

from integrations.dates import date_window
from integrations.garmin_source import connect_garmin, fetch_garmin
from integrations.mfp_source import as_numbers, diary_from_day, fetch_mfp, load_cookie_jar


class Dates(unittest.TestCase):
    def test_window_is_inclusive_and_ordered(self):
        self.assertEqual(
            date_window(3, today=date(2026, 7, 26)),
            ["2026-07-24", "2026-07-25", "2026-07-26"],
        )

    def test_rejects_out_of_range(self):
        with self.assertRaises(ValueError):
            date_window(0)
        with self.assertRaises(ValueError):
            date_window(367)


class FakeGarmin:
    """First construction has no session; the credential construction does."""

    calls = 0

    def __init__(self, email=None, password=None, prompt_mfa=None):
        type(self).calls += 1
        self.email = email
        self.password = password
        self.prompt_mfa = prompt_mfa
        self.client = self
        self.dumped = []
        self.login_paths = []
        self.queries = []

    def login(self, path):
        self.login_paths.append(path)
        if not self.email:
            raise RuntimeError("no saved tokens")

    def dump(self, path):
        self.dumped.append(path)

    def get_activities_by_date(self, start, end):
        self.queries.append(("activities", start, end))
        return [{"activityId": 1}]

    def get_body_battery(self, start, end):
        self.queries.append(("battery", start, end))
        return [{"date": start, "charged": 40}]

    def get_stats(self, day):
        self.queries.append(("stats", day))
        return {"totalSteps": 1000, "activeKilocalories": 200}

    def get_sleep_data(self, day):
        self.queries.append(("sleep", day))
        raise RuntimeError("sleep down")

    def get_hrv_data(self, day):
        self.queries.append(("hrv", day))
        return {"hrvSummary": {"lastNightAvg": 42}}

    def get_training_status(self, day):
        self.queries.append(("load", day))
        return {"acuteTrainingLoad": 10}


class GarminFetch(unittest.TestCase):
    def setUp(self):
        FakeGarmin.calls = 0

    def test_login_falls_back_to_password_and_dumps_tokens(self):
        import os

        os.environ["GARMIN_EMAIL"] = "owner@example.com"
        os.environ["GARMIN_PASSWORD"] = "secret"
        os.environ["GARMINTOKENS"] = tempfile.mkdtemp()
        try:
            client = connect_garmin(FakeGarmin)
        finally:
            os.environ.pop("GARMIN_EMAIL", None)
            os.environ.pop("GARMIN_PASSWORD", None)
            os.environ.pop("GARMINTOKENS", None)
        self.assertEqual(client.email, "owner@example.com")
        self.assertTrue(client.login_paths)
        self.assertEqual(client.dumped, client.login_paths)
        self.assertEqual(FakeGarmin.calls, 2)

    def test_fetch_assembles_a_bundle_and_keeps_going_when_one_call_fails(self):
        client = FakeGarmin(email="a", password="b")
        bundle = fetch_garmin(client, ["2026-07-25", "2026-07-26"])
        self.assertEqual(bundle["source"], "garmin")
        self.assertEqual(bundle["activities"], [{"activityId": 1}])
        self.assertEqual(len(bundle["days"]), 2)
        self.assertEqual(bundle["days"][0]["stats"]["totalSteps"], 1000)
        self.assertIn("_error", bundle["days"][0]["sleep"])
        self.assertEqual(bundle["days"][1]["hrv"]["hrvSummary"]["lastNightAvg"], 42)
        activity_calls = [q for q in client.queries if q[0] == "activities"]
        self.assertEqual(activity_calls, [("activities", "2026-07-25", "2026-07-26")])

    def test_dict_wrapped_activities_are_unwrapped(self):
        class Wrapped(FakeGarmin):
            def get_activities_by_date(self, start, end):
                return {"activities": [{"activityId": 9}]}

        bundle = fetch_garmin(Wrapped(email="a", password="b"), ["2026-07-26"])
        self.assertEqual(bundle["activities"], [{"activityId": 9}])


class Entry:
    def __init__(self, name, totals):
        self.name = name
        self.totals = totals


class Meal:
    def __init__(self, name, entries):
        self.name = name
        self.entries = entries


class MfpFetch(unittest.TestCase):
    def test_diary_normalizes_meals_totals_and_goals(self):
        day = SimpleNamespace(
            date=date(2026, 7, 26),
            meals=[Meal("Breakfast", [Entry("oats", {"calories": 300, "protein": 12, "carbohydrates": 40, "fat": 6})])],
            totals={"calories": 1800, "protein": 120, "carbohydrates": 180, "fat": 55},
            goals={"calories": 2200, "protein": 150, "carbohydrates": 200, "fat": 70},
        )
        diary = diary_from_day(day)
        self.assertEqual(diary["date"], "2026-07-26")
        self.assertEqual(diary["meals"][0]["entries"][0]["name"], "oats")
        self.assertEqual(diary["totals"]["calories"], 1800)
        self.assertEqual(diary["goals"]["protein"], 150)

    def test_measurement_magnitudes_become_numbers(self):
        class Mass:
            magnitude = 30.5

        self.assertEqual(as_numbers({"protein": Mass()})["protein"], 30.5)

    def test_fetch_calls_get_date_per_day(self):
        seen = []

        class Client:
            def get_date(self, year, month, day):
                seen.append((year, month, day))
                return SimpleNamespace(
                    date=date(year, month, day),
                    meals=[],
                    totals={},
                    goals={},
                )

        bundle = fetch_mfp(Client(), ["2026-07-26", "2026-07-27"])
        self.assertEqual(bundle["source"], "mfp")
        self.assertEqual(seen, [(2026, 7, 26), (2026, 7, 27)])

    def test_cookie_file_loads_without_network(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "cookies.json"
            path.write_text(
                json.dumps(
                    [
                        {
                            "name": "__Secure-next-auth.session-token",
                            "value": "session",
                            "domain": ".myfitnesspal.com",
                        }
                    ]
                )
            )
            jar = load_cookie_jar(path)
            names = [cookie.name for cookie in jar]
        self.assertEqual(names, ["__Secure-next-auth.session-token"])


if __name__ == "__main__":
    unittest.main()
