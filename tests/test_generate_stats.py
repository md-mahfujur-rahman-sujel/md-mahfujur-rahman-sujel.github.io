"""Deterministic, offline tests for the public stats generator."""

from datetime import date, datetime, timedelta, timezone
import importlib.util
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
from urllib.error import HTTPError, URLError
from urllib.request import Request


SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "generate_stats.py"
spec = importlib.util.spec_from_file_location("generate_stats", SCRIPT)
stats = importlib.util.module_from_spec(spec)
spec.loader.exec_module(stats)
NOW = datetime(2026, 10, 8, 12, 30, tzinfo=timezone.utc)


def daily(as_of=NOW.date(), active=None, length=364):
    active = active or {}
    start = as_of - timedelta(days=length - 1)
    return [{"date": (start + timedelta(days=index)).isoformat(),
             "count": active.get(start + timedelta(days=index), 0)} for index in range(length)]


def repo(slug=None, stars=2, fork=False):
    slug = slug or f"{stats.USERNAME}/Apex-Arcade"
    owner, name = slug.split("/")
    return {"name": name, "full_name": slug, "owner": {"login": owner}, "fork": fork,
            "stargazers_count": stars, "forks_count": 3, "language": "Python",
            "description": "A full description. " * 40,
            "pushed_at": "2026-09-28T01:02:03Z", "updated_at": "2026-10-07T15:00:00Z"}


def event(event_id="123", event_type="PushEvent", payload=None):
    return {"id": event_id, "type": event_type, "created_at": "2026-10-07T23:24:25Z",
            "repo": {"name": f"{stats.USERNAME}/Apex-Arcade"},
            "payload": {"ref": "refs/heads/main", "size": 2} if payload is None else payload}


class Response(io.BytesIO):
    def __init__(self, body, headers=None):
        super().__init__(json.dumps(body).encode("utf-8"))
        self.headers = headers or {}


class FakeOpener:
    def __init__(self, routes=None, failure=None):
        self.routes = routes or {}
        self.failure = failure
        self.requests = []

    def open(self, request, timeout):
        self.requests.append(request)
        if self.failure:
            raise self.failure
        if request.full_url not in self.routes:
            raise AssertionError(f"Unexpected network request: {request.full_url}")
        response = self.routes[request.full_url]
        if isinstance(response, Exception):
            raise response
        body, headers = response
        return Response(body, headers)


def client(routes=None, token=None, failure=None):
    return stats.APIClient(token=token, opener=FakeOpener(routes, failure))


def source(api_client):
    return stats.Source(api_client, stats.timestamp(NOW))


def routes_for_snapshot(as_of=NOW.date()):
    owned = [repo(slug) for slug, role, _ in stats.CURATED_REPOS if role == "owner"]
    routes = {
        f"{stats.API}/users/{stats.USERNAME}": (
            {"public_repos": 2, "followers": 4, "following": 5, "created_at": "2020-02-29T09:10:11Z"}, {}),
        stats.OWNED_REPOS_URL: (owned, {}),
        stats.CONTRIBUTIONS_URL: ({"contributions": daily(as_of, {as_of: 2}), "total": {"2026": 99999}}, {}),
        f"{stats.API}/users/{stats.USERNAME}/events/public?per_page=100": ([event()], {}),
    }
    for slug, role, _ in stats.CURATED_REPOS:
        routes[f"{stats.API}/repos/{slug}"] = (repo(slug), {})
        if role == "owner":
            routes[f"{stats.API}/repos/{slug}/languages"] = ({"Python": 75, "HTML": 25}, {})
    return routes


class ContributionsTests(unittest.TestCase):
    def test_current_streak_ends_today(self):
        today = NOW.date()
        active = {today - timedelta(days=index): index + 1 for index in range(3)}
        result = stats.summarize_contributions(daily(active=active), today)
        self.assertEqual(result["currentStreak"], {"days": 3, "from": "2026-10-06", "to": "2026-10-08"})
        self.assertEqual(result["longestStreak"], result["currentStreak"])
        self.assertEqual(result["peak"], {"date": "2026-10-06", "count": 3})
        self.assertEqual(result["total"], 6)
        self.assertEqual(result["activeDays"], 3)

    def test_current_streak_can_end_yesterday_but_not_two_days_ago(self):
        today = NOW.date()
        active = {today - timedelta(days=index): 1 for index in range(1, 4)}
        result = stats.summarize_contributions(daily(active=active), today)
        self.assertEqual(result["currentStreak"], {"days": 3, "from": "2026-10-05", "to": "2026-10-07"})
        del active[today - timedelta(days=1)]
        result = stats.summarize_contributions(daily(active=active), today)
        self.assertEqual(result["currentStreak"], {"days": 0, "from": None, "to": None})
        self.assertEqual(result["longestStreak"]["days"], 2)

    def test_no_activity_has_no_invented_peak_or_streak_dates(self):
        result = stats.summarize_contributions(daily(), NOW.date())
        self.assertEqual(result["total"], 0)
        self.assertEqual(result["activeDays"], 0)
        self.assertEqual(result["peak"], {"date": None, "count": 0})
        for key in ("currentStreak", "longestStreak"):
            self.assertEqual(result[key], {"days": 0, "from": None, "to": None})

    def test_leap_day_and_year_boundary_are_contiguous(self):
        for end, start in ((date(2024, 3, 1), date(2024, 2, 28)),
                           (date(2025, 1, 2), date(2024, 12, 31))):
            with self.subTest(end=end):
                active = {start + timedelta(days=index): 2 for index in range(3)}
                result = stats.summarize_contributions(daily(end, active), end)
                self.assertEqual(result["currentStreak"], {"days": 3, "from": start.isoformat(), "to": end.isoformat()})
                self.assertEqual(len(result["days"]), 364)
                if end.year == 2024:
                    self.assertIn({"date": "2024-02-29", "count": 2}, result["days"])

    def test_exact_52_weeks_filter_outside_window_and_keep_14_day_strip(self):
        end = NOW.date()
        start = end - timedelta(days=363)
        active = {start + timedelta(days=index): index % 5 for index in range(364)}
        records = daily(end, active)
        records += [{"date": (start - timedelta(days=1)).isoformat(), "count": 100000},
                    {"date": (end + timedelta(days=1)).isoformat(), "count": 100000}]
        result = stats.summarize_contributions(records, end)
        self.assertEqual(result["windowDays"], 364)
        self.assertEqual(len(result["weeks"]), 52)
        self.assertEqual(result["days"][0]["date"], start.isoformat())
        self.assertEqual(result["days"][-1]["date"], end.isoformat())
        self.assertEqual(result["days"][-14]["date"], (end - timedelta(days=13)).isoformat())
        self.assertEqual(result["total"], sum(active.values()))
        self.assertEqual(sum(week["count"] for week in result["weeks"]), result["total"])
        for index, week in enumerate(result["weeks"]):
            self.assertEqual(week["start"], (start + timedelta(days=7 * index)).isoformat())
            self.assertEqual(week["count"], sum(day["count"] for day in result["days"][index * 7:index * 7 + 7]))

    def test_longest_and_peak_ties_keep_earliest_run(self):
        end = NOW.date()
        active = {end - timedelta(days=index): 2 for index in (9, 8, 2, 1)}
        result = stats.summarize_contributions(daily(end, active), end)
        self.assertEqual(result["longestStreak"]["from"], (end - timedelta(days=9)).isoformat())
        self.assertEqual(result["peak"]["date"], result["longestStreak"]["from"])

    def test_full_window_streak_is_bounded(self):
        records = daily()
        for record in records:
            record["count"] = 1
        result = stats.summarize_contributions(records, NOW.date())
        self.assertEqual(result["currentStreak"]["days"], 364)
        self.assertEqual(result["longestStreak"]["days"], 364)

    def test_missing_or_invalid_counts_are_not_silently_zero_filled(self):
        with self.assertRaisesRegex(stats.DataError, "missing days"):
            stats.summarize_contributions(daily()[1:], NOW.date())
        for invalid in (-1, True, "2"):
            records = daily()
            records[-1]["count"] = invalid
            with self.subTest(invalid=invalid), self.assertRaises(stats.DataError):
                stats.summarize_contributions(records, NOW.date())
        with self.assertRaisesRegex(stats.DataError, "Conflicting"):
            stats.summarize_contributions(daily() + [{"date": NOW.date().isoformat(), "count": 5}], NOW.date())

    def test_as_of_uses_utc_not_local_date(self):
        local = datetime(2026, 10, 9, 0, 30, tzinfo=timezone(timedelta(hours=14)))
        result = stats.collect_snapshot(client(routes_for_snapshot()), now=local)
        self.assertEqual(result["contributions"]["asOf"], "2026-10-08")
        self.assertEqual(result["generatedAt"], "2026-10-08T10:30:00Z")
        with self.assertRaises(stats.DataError):
            stats.collect_snapshot(client(), now=datetime(2026, 10, 8))

    def test_historical_source_is_marked_stale_not_dated_today(self):
        historical = date(2025, 12, 31)
        result = stats.collect_snapshot(client(routes_for_snapshot(historical)), NOW)
        self.assertEqual(result["status"], "partial")
        self.assertEqual(result["sources"]["contributions"]["status"], "stale")
        self.assertTrue(result["sources"]["contributions"]["errors"])
        self.assertEqual(result["contributions"]["asOf"], historical.isoformat())
        self.assertEqual(result["contributions"]["days"][-1]["date"], historical.isoformat())
        self.assertEqual(result["contributions"]["total"], 2)  # Ignore upstream annual aggregates.

    def test_graphql_window_and_daily_normalization(self):
        records = daily(active={NOW.date(): 7})
        calendar = {"weeks": [{"contributionDays": [{"date": day["date"], "contributionCount": day["count"]}
                                                    for day in records]}]}
        api_client = client({f"{stats.API}/graphql": (
            {"data": {"user": {"contributionsCollection": {
                "totalCommitContributions": 5, "totalIssueContributions": 1,
                "totalPullRequestContributions": 1, "totalPullRequestReviewContributions": 0,
                "contributionCalendar": calendar}}}}, {})}, token="test-token")
        src = source(api_client)
        result = stats.fetch_contributions(src, NOW)
        variables = json.loads(api_client.opener.requests[0].data)["variables"]
        self.assertEqual(variables["from"], f"{records[0]['date']}T00:00:00Z")
        self.assertEqual(variables["to"], "2026-10-08T12:30:00Z")
        self.assertEqual(result["total"], 7)
        self.assertEqual(result["types"], {"commits": 5, "issues": 1, "pullRequests": 1, "codeReviews": 0})
        self.assertEqual(src.meta["selected"], f"{stats.API}/graphql")
        self.assertEqual(len(api_client.opener.requests), 1)

    def test_graphql_errors_fall_back_without_sending_token_to_public_source(self):
        api_client = client({f"{stats.API}/graphql": ({"errors": [{"message": "Not authorized"}]}, {}),
                             stats.CONTRIBUTIONS_URL: ({"contributions": daily()}, {})}, token="test-token")
        src = source(api_client)
        result = stats.fetch_contributions(src, NOW)
        self.assertEqual(result["total"], 0)
        self.assertNotIn("types", result)
        self.assertIn("Not authorized", src.meta["errors"][0]["message"])
        self.assertEqual(src.meta["selected"], stats.CONTRIBUTIONS_URL)
        self.assertEqual(api_client.opener.requests[0].get_header("Authorization"), "Bearer test-token")
        self.assertIsNone(api_client.opener.requests[1].get_header("Authorization"))


class RestTests(unittest.TestCase):
    def test_profile_stars_paginate_all_owned_repos_including_forks(self):
        first = [repo(f"{stats.USERNAME}/repo-{index}") for index in range(100)]
        second_url = stats.OWNED_REPOS_URL + "&page=2"
        api_client = client({
            f"{stats.API}/users/{stats.USERNAME}": ({"public_repos": 101, "followers": 4, "following": 5,
                                                     "created_at": "2020-02-29T09:10:11Z"}, {}),
            stats.OWNED_REPOS_URL: (first, {"Link": f'<{second_url}>; rel="next", <{second_url}>; rel="last"'}),
            second_url: ([repo(f"{stats.USERNAME}/fork", stars=7, fork=True)], {}),
        })
        result = stats.fetch_profile(source(api_client))
        self.assertEqual(result, {"repos": 101, "stars": 207, "followers": 4, "following": 5, "memberSince": "2020-02"})
        self.assertEqual(len(api_client.opener.requests), 3)

    def test_language_bytes_include_noncurated_owned_repos_not_forks_or_collaborations(self):
        extra = repo(f"{stats.USERNAME}/Other")
        apex = repo()
        second_url = stats.OWNED_REPOS_URL + "&page=2"
        api_client = client({
            stats.OWNED_REPOS_URL: ([apex, repo(f"{stats.USERNAME}/Fork", fork=True)],
                                    {"Link": f'<{second_url}>; rel="next"'}),
            second_url: ([extra, repo("someone-else/collaboration")], {}),
            f"{stats.API}/repos/{apex['full_name']}/languages": ({"Python": 30, "HTML": 10}, {}),
            f"{stats.API}/repos/{extra['full_name']}/languages": ({"HTML": 60}, {}),
        })
        rows, total = stats.fetch_languages(source(api_client))
        self.assertEqual(total, 100)
        self.assertEqual(rows, [{"name": "HTML", "pct": 70.0}, {"name": "Python", "pct": 30.0}])

    def test_no_owned_repos_is_valid_empty_language_data(self):
        self.assertEqual(stats.fetch_languages(source(client({stats.OWNED_REPOS_URL: ([], {})}))), ([], 0))

    def test_curated_roles_descriptions_and_push_timestamps(self):
        repos = stats.fetch_repos(source(client(routes_for_snapshot())))
        self.assertEqual([(item["slug"], item["role"], item["kind"]) for item in repos], list(stats.CURATED_REPOS))
        self.assertEqual(repos[0]["desc"], repo()["description"])
        self.assertEqual(repos[0]["updatedAt"], repo()["pushed_at"])
        self.assertNotEqual(repos[0]["updatedAt"], repo()["updated_at"])

    def test_events_keep_ids_full_times_paginate_and_only_deduplicate_ids(self):
        url = f"{stats.API}/users/{stats.USERNAME}/events/public?per_page=100"
        next_url = url + "&page=2"
        api_client = client({url: ([event()], {"Link": f'<{next_url}>; rel="next"'}),
                             next_url: ([event(), event("124")], {})})
        events = stats.fetch_events(source(api_client))
        self.assertEqual(len(events), 2)
        self.assertEqual(events[0], {"id": "123", "type": "push", "at": "2026-10-07T23:24:25Z",
                                     "repo": f"{stats.USERNAME}/Apex-Arcade", "summary": "Pushed 2 commits to main"})

    def test_missing_push_size_does_not_invent_commit_count(self):
        normalized = stats.normalize_event(event(payload={"ref": "refs/heads/main", "commits": []}))
        self.assertEqual(normalized["summary"], "Pushed to main")
        normalized = stats.normalize_event(event(event_type="PullRequestEvent", payload={
            "action": "opened", "pull_request": {"number": 7, "title": "Complete title"}}))
        self.assertEqual(normalized["type"], "pull_request")
        self.assertEqual(normalized["summary"], "Opened pull request #7: Complete title")

    def test_pagination_does_not_silently_truncate_on_failure(self):
        next_url = stats.OWNED_REPOS_URL + "&page=2"
        routes = routes_for_snapshot()
        routes[stats.OWNED_REPOS_URL] = ([repo()], {"Link": f'<{next_url}>; rel="next"'})
        routes[next_url] = HTTPError(next_url, 503, "Unavailable", {}, None)
        snapshot = stats.collect_snapshot(client(routes), NOW)
        self.assertIsNone(snapshot["profile"])
        self.assertIsNone(snapshot["languages"])
        self.assertIsNone(snapshot["bytesTotal"])
        self.assertEqual(snapshot["status"], "partial")
        self.assertIn("HTTP 503", snapshot["sources"]["profile"]["errors"][0]["message"])
        self.assertIsNotNone(snapshot["repos"])


class FailureAndCredentialsTests(unittest.TestCase):
    def test_http_whole_failure_retains_previous_snapshot_bytes_and_mtime(self):
        failure = HTTPError(stats.API, 403, "Rate limit exceeded", {}, None)
        failed = stats.collect_snapshot(client(failure=failure), NOW)
        self.assertEqual(failed["status"], "unavailable")
        for section in ("profile", "contributions", "languages", "repos", "events"):
            self.assertIsNone(failed[section])
            self.assertEqual(failed["sources"][section]["status"], "unavailable")
            self.assertIsNone(failed["sources"][section]["fetchedAt"])
            self.assertIn("HTTP 403", failed["sources"][section]["errors"][0]["message"])
        previous = stats.collect_snapshot(client(routes_for_snapshot()), NOW - timedelta(days=1))
        with tempfile.TemporaryDirectory() as folder:
            output = Path(folder) / "stats.json"
            self.assertTrue(stats.write_snapshot(previous, output))
            original, modified = output.read_bytes(), output.stat().st_mtime_ns
            self.assertFalse(stats.write_snapshot(failed, output))
            self.assertEqual(output.read_bytes(), original)
            self.assertEqual(output.stat().st_mtime_ns, modified)

    def test_whole_failure_without_previous_file_writes_explicit_null_sections(self):
        snapshot = stats.collect_snapshot(client(failure=URLError("network offline")), NOW)
        with tempfile.TemporaryDirectory() as folder:
            output = Path(folder) / "stats.json"
            self.assertTrue(stats.write_snapshot(snapshot, output))
            written = json.loads(output.read_text(encoding="utf-8"))
            self.assertEqual(written["status"], "unavailable")
            self.assertIsNone(written["contributions"])
            self.assertTrue(written["sources"]["contributions"]["errors"])

    def test_one_curated_repo_failure_makes_only_that_section_unavailable(self):
        routes = routes_for_snapshot()
        url = f"{stats.API}/repos/masum-mir/Oppzy"
        routes[url] = HTTPError(url, 404, "Not Found", {}, None)
        snapshot = stats.collect_snapshot(client(routes), NOW)
        self.assertEqual(snapshot["status"], "partial")
        self.assertIsNone(snapshot["repos"])
        self.assertIsNotNone(snapshot["profile"])
        self.assertEqual(snapshot["sources"]["repos"]["errors"][0]["url"], url)

    def test_incomplete_contributions_become_unavailable_not_zero_activity(self):
        routes = routes_for_snapshot()
        routes[stats.CONTRIBUTIONS_URL] = ({"contributions": daily()[1:]}, {})
        snapshot = stats.collect_snapshot(client(routes), NOW)
        self.assertIsNone(snapshot["contributions"])
        self.assertIn("missing days", snapshot["sources"]["contributions"]["errors"][0]["message"])

    def test_token_only_sent_to_exact_https_github_api_origin(self):
        urls = [f"{stats.API}/users/{stats.USERNAME}", stats.CONTRIBUTIONS_URL,
                "https://github.com/user", "https://api.github.com.attacker.invalid/path",
                "http://api.github.com/user", "https://api.github.com:444/user",
                "https://api.github.com@attacker.invalid/path"]
        api_client = client({url: ({}, {}) for url in urls}, token="secret-token")
        for url in urls:
            api_client.request(url)
        for index, request in enumerate(api_client.opener.requests):
            self.assertEqual(request.get_header("Authorization"), "Bearer secret-token" if index == 0 else None)
        anonymous = client({urls[0]: ({}, {})})
        anonymous.request(urls[0])
        self.assertIsNone(anonymous.opener.requests[0].get_header("Authorization"))

    def test_redirects_strip_credentials_outside_exact_https_api_origin(self):
        handler = stats.ScopedRedirectHandler()
        request = Request(f"{stats.API}/old", headers={"Authorization": "Bearer secret-token"})
        for url in (stats.CONTRIBUTIONS_URL, "http://api.github.com/path", "https://api.github.com:444/path",
                    "https://api.github.com.attacker.invalid/path"):
            with self.subTest(url=url):
                redirected = handler.redirect_request(request, None, 302, "Found", {}, url)
                self.assertIsNone(redirected.get_header("Authorization"))
        redirected = handler.redirect_request(request, None, 302, "Found", {}, f"{stats.API}/new")
        self.assertEqual(redirected.get_header("Authorization"), "Bearer secret-token")

    def test_untrusted_and_cyclic_pagination_links_fail_before_request(self):
        for next_url in (stats.CONTRIBUTIONS_URL, stats.OWNED_REPOS_URL):
            api_client = client({stats.OWNED_REPOS_URL: ([], {"Link": f'<{next_url}>; rel="next"'})}, token="secret")
            with self.subTest(next_url=next_url), self.assertRaises(stats.DataError):
                source(api_client).paginate(stats.OWNED_REPOS_URL)
            self.assertEqual(len(api_client.opener.requests), 1)

    def test_cli_accepts_output_and_environment_token_without_writing_other_files(self):
        snapshot = stats.collect_snapshot(client(routes_for_snapshot()), NOW)
        with tempfile.TemporaryDirectory() as folder:
            output = Path(folder) / "stats.json"
            for variable in ("GH_TOKEN", "GITHUB_TOKEN"):
                with patch.dict(stats.os.environ, {variable: "environment-secret"}, clear=True), \
                        patch.object(stats, "APIClient") as factory, \
                        patch.object(stats, "collect_snapshot", return_value=snapshot), \
                        patch("sys.stdout", new_callable=io.StringIO), patch("sys.stderr", new_callable=io.StringIO):
                    self.assertEqual(stats.main(["--output", str(output)]), 0)
                    factory.assert_called_once_with(token="environment-secret")
            self.assertEqual(json.loads(output.read_text(encoding="utf-8")), snapshot)
        self.assertEqual(stats.DEFAULT_OUTPUT, SCRIPT.parents[1] / "data" / "stats.json")


if __name__ == "__main__":
    unittest.main()
