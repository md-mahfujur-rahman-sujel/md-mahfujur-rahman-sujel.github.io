"""Deterministic, offline tests for the desktop panel renderer."""

import importlib.util
import html
import json
from pathlib import Path
import re
import tempfile
import unittest
import xml.etree.ElementTree as ET


ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "scripts" / "render_panels.py"
spec = importlib.util.spec_from_file_location("render_panels", SCRIPT)
panels = importlib.util.module_from_spec(spec)
spec.loader.exec_module(panels)

STATS = json.loads((ROOT / "data" / "stats.json").read_text(encoding="utf-8"))


def clone(stats):
    return json.loads(json.dumps(stats))


class HelperTests(unittest.TestCase):
    def test_age_uses_snapshot_time_not_wall_clock(self):
        ref = panels.parse_time("2026-10-30T03:39:27Z")
        self.assertEqual(panels.age("2026-10-28T13:57:16Z", ref), "1D AGO")
        self.assertEqual(panels.age("2026-10-29T15:17:39Z", ref), "12H AGO")
        self.assertEqual(panels.age("2026-08-17T19:03:05Z", ref), "2MO AGO")
        self.assertEqual(panels.age("2026-10-30T03:20:00Z", ref), "NOW")
        self.assertEqual(panels.age("not-a-date", ref), "—")

    def test_member_since_accepts_year_month(self):
        self.assertEqual(panels.month_year("2026-07"), "JUL 2026")
        self.assertEqual(panels.month_year("2026-10-30"), "OCT 2026")
        self.assertEqual(panels.month_year(None), "—")

    def test_bytes_use_binary_units_like_the_panel_design(self):
        self.assertEqual(panels.byte_label(2263669), "2.2 MB")
        self.assertEqual(panels.byte_label(None), "—")

    def test_pad_never_invents_zero(self):
        self.assertEqual(panels.pad(4), "04")
        self.assertEqual(panels.pad(None), "—")


class RenderTests(unittest.TestCase):
    def render(self, stats):
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        results = panels.render(stats, assets=directory.name)
        return {name: Path(directory.name, f"{name}.svg") for name in panels.PANELS}, results

    def test_committed_panels_match_a_fresh_render(self):
        files, _ = self.render(STATS)
        for name in panels.PANELS:
            committed = (ROOT / "assets" / f"{name}.svg").read_text(encoding="utf-8")
            self.assertEqual(files[name].read_text(encoding="utf-8"), committed,
                             f"assets/{name}.svg is stale; run scripts/render_panels.py")

    def test_panels_are_wellformed_and_free_of_template_markers(self):
        files, _ = self.render(STATS)
        for name in panels.PANELS:
            markup = files[name].read_text(encoding="utf-8")
            ET.fromstring(markup)
            self.assertNotIn("{{", markup)
            self.assertNotIn("<!--@", markup)

    def test_telemetry_reflects_the_snapshot(self):
        files, _ = self.render(STATS)
        markup = files["telemetry"].read_text(encoding="utf-8")
        contributions = STATS["contributions"]
        days = contributions["days"]
        months = {day["date"][:7] for day in days}
        self.assertIn(f'>{contributions["total"]}<', markup)
        self.assertIn(f'ACTIVE <tspan fill="#67C7EB">{contributions["activeDays"]}</tspan>', markup)
        self.assertIn(f'PEAK <tspan fill="#A9C7FF">{contributions["peak"]["count"]}</tspan>', markup)
        self.assertEqual(len(re.findall(r'width="12.5" height="12.5"', markup)), len(days))
        self.assertEqual(len(re.findall(r'y="478"', markup)), len(months))
        self.assertIn(f'{contributions["total"]} contributions · {contributions["activeDays"]} active days · {len(days)}d window', markup)
        self.assertIn("TOP 4 · BY BYTES", markup)
        self.assertLessEqual(markup.count('class="grow"'), 4)

    def test_activity_shows_the_newest_public_events(self):
        files, _ = self.render(STATS)
        markup = files["activity"].read_text(encoding="utf-8")
        events = sorted(STATS["events"], key=lambda event: event["at"], reverse=True)
        shown = events[:7]
        self.assertEqual(len(re.findall(r'<g class="rise"', markup)), len(shown))
        self.assertIn(f'EVENTS {len(events):02d}', markup)
        self.assertIn(html.escape(shown[0]["summary"], quote=False), markup)
        self.assertIn(f'{len(shown)} latest of {len(events)} public events', markup)

    def test_repositories_match_the_snapshot(self):
        files, _ = self.render(STATS)
        markup = files["repos"].read_text(encoding="utf-8")
        repos = STATS["repos"]
        owned = sum(1 for repo in repos if repo.get("role") == "owner")
        self.assertEqual(len(re.findall(r'<g class="rise"', markup)), min(3, len(repos)))
        for repo in repos[:3]:
            self.assertIn(f'>{repo["name"]}<', markup)
        self.assertIn("UPDATED ", markup)
        self.assertIn(f'{len(repos)} repositories · {owned} owned', markup)

    def test_missing_sections_leave_the_previous_panel_untouched(self):
        partial = clone(STATS)
        partial["contributions"] = None
        partial["events"] = None
        partial["repos"] = None
        files, results = self.render(partial)
        self.assertEqual({name: state for name, _, state in results},
                         {name: "data unavailable" for name in panels.PANELS})
        for path in files.values():
            self.assertFalse(path.exists())

    def test_rendering_twice_is_byte_identical(self):
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        panels.render(STATS, assets=directory.name)
        first = {name: Path(directory.name, f"{name}.svg").read_text(encoding="utf-8") for name in panels.PANELS}
        panels.render(STATS, assets=directory.name)
        second = {name: Path(directory.name, f"{name}.svg").read_text(encoding="utf-8") for name in panels.PANELS}
        self.assertEqual(first, second)

    def test_unknown_placeholders_fail_loudly(self):
        with self.assertRaises(ValueError):
            panels.fill("<svg>{{nope}}</svg>", "test", {}, {})


if __name__ == "__main__":
    unittest.main()
