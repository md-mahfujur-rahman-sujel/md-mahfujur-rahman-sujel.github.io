#!/usr/bin/env python3
"""Build the public SUJEL.OS snapshot with Python's standard library only."""

import argparse
from collections import Counter
from datetime import date, datetime, timedelta, timezone
import json
import os
from pathlib import Path
import re
import sys
from urllib.error import HTTPError, URLError
from urllib.parse import urljoin, urlsplit
from urllib.request import HTTPRedirectHandler, Request, build_opener


USERNAME = "md-mahfujur-rahman-sujel"
API = "https://api.github.com"
CONTRIBUTIONS_URL = f"https://github-contributions-api.jogruber.de/v4/{USERNAME}?y=last"
WINDOW_DAYS = 364
DEFAULT_OUTPUT = Path(__file__).resolve().parents[1] / "data" / "stats.json"
CURATED_REPOS = (
    (f"{USERNAME}/Apex-Arcade", "owner", "WEB"),
    (f"{USERNAME}/Unrot", "owner", "ANDROID"),
    ("masum-mir/Oppzy", "collaborator", "WEB"),
)


class DataError(ValueError):
    """A source failed or returned data that cannot be used honestly."""


def utc_now():
    return datetime.now(timezone.utc)


def utc_datetime(value):
    if value.tzinfo is None:
        raise DataError("A timezone-aware timestamp is required")
    return value.astimezone(timezone.utc)


def timestamp(value):
    return utc_datetime(value).isoformat(timespec="seconds").replace("+00:00", "Z")


def parse_date(value):
    parsed = date.fromisoformat(value)
    if parsed.isoformat() != value:
        raise DataError("Expected an ISO YYYY-MM-DD date")
    return parsed


def checked_timestamp(value):
    utc_datetime(datetime.fromisoformat(value.replace("Z", "+00:00")))
    return value


def number(value):
    if type(value) is not int or value < 0:
        raise DataError("Expected a non-negative integer")
    return value


def github_api_url(url):
    try:
        parts = urlsplit(url)
        return (parts.scheme == "https" and parts.hostname == "api.github.com"
                and parts.port in (None, 443) and parts.username is None
                and parts.password is None)
    except ValueError:
        return False


class ScopedRedirectHandler(HTTPRedirectHandler):
    """urllib normally forwards Authorization, including across hosts."""

    def redirect_request(self, req, fp, code, msg, headers, newurl):
        redirected = super().redirect_request(req, fp, code, msg, headers, newurl)
        if redirected is not None and not github_api_url(newurl):
            redirected.remove_header("Authorization")
        return redirected


class APIClient:
    def __init__(self, token=None, opener=None, timeout=30):
        self.token = token
        self.opener = opener if opener is not None else build_opener(ScopedRedirectHandler())
        self.timeout = timeout
        self.cache = {}

    def request(self, url, payload=None):
        if payload is None and url in self.cache:
            cached = self.cache[url]
            if isinstance(cached, DataError):
                raise cached
            return cached
        headers = {"User-Agent": "SUJEL.OS-stats-generator", "Accept": "application/json"}
        if github_api_url(url):
            headers.update({"Accept": "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28"})
            if self.token:
                headers["Authorization"] = f"Bearer {self.token}"
        body = None
        if payload is not None:
            body = json.dumps(payload).encode("utf-8")
            headers["Content-Type"] = "application/json"
        request = Request(url, data=body, headers=headers)
        try:
            with self.opener.open(request, timeout=self.timeout) as response:
                result = (json.load(response), response.headers)
        except (HTTPError, URLError, OSError, ValueError) as exc:
            detail = f"HTTP {exc.code}: {exc.reason}" if isinstance(exc, HTTPError) else str(exc)
            if isinstance(exc, HTTPError):
                exc.close()
            if self.token:
                detail = detail.replace(self.token, "[redacted]")
            error = DataError(detail)
            if payload is None:
                self.cache[url] = error
            raise error from exc
        if payload is None:
            self.cache[url] = result
        return result


class Source:
    def __init__(self, client, fetched_at):
        self.client = client
        self.fetched_at = fetched_at
        self.meta = {"status": "unavailable", "urls": [], "fetchedAt": None, "errors": []}

    def request(self, url, payload=None):
        if url not in self.meta["urls"]:
            self.meta["urls"].append(url)
        try:
            return self.client.request(url, payload)
        except DataError as exc:
            self.meta["errors"].append({"url": url, "message": str(exc)})
            raise

    def json(self, url, payload=None):
        return self.request(url, payload)[0]

    def paginate(self, url):
        result, visited = [], set()
        while url:
            if not github_api_url(url) or url in visited:
                raise DataError("Invalid or cyclic GitHub pagination link")
            visited.add(url)
            page, headers = self.request(url)
            if not isinstance(page, list):
                raise DataError("Expected a paginated JSON array")
            result.extend(page)
            next_link = re.search(r'<([^>]+)>;\s*rel="next"', headers.get("Link", ""))
            url = urljoin(url, next_link.group(1)) if next_link else None
        return result


OWNED_REPOS_URL = f"{API}/users/{USERNAME}/repos?type=owner&per_page=100&sort=full_name"


def owned_repos(source):
    return [repo for repo in source.paginate(OWNED_REPOS_URL)
            if repo["owner"]["login"].casefold() == USERNAME.casefold()]


def fetch_profile(source):
    user = source.json(f"{API}/users/{USERNAME}")
    repos = owned_repos(source)
    return {"repos": number(user["public_repos"]),
            "stars": sum(number(repo["stargazers_count"]) for repo in repos),
            "followers": number(user["followers"]), "following": number(user["following"]),
            "memberSince": checked_timestamp(user["created_at"])[:7]}


def fetch_languages(source):
    totals = Counter()
    for repo in owned_repos(source):
        if type(repo["fork"]) is not bool:
            raise DataError("Expected a repository fork flag")
        if not repo["fork"]:
            languages = source.json(f"{API}/repos/{repo['full_name']}/languages")
            for name, count in languages.items():
                totals[name] += number(count)
    total = sum(totals.values())
    # Percentages use unrounded byte totals; zero-byte languages have no bar.
    rows = [{"name": name, "pct": round(count * 100 / total, 2)}
            for name, count in sorted(totals.items(), key=lambda item: (-item[1], item[0]))
            if count]
    return rows, total


def fetch_repos(source):
    repos = []
    for slug, role, kind in CURATED_REPOS:
        repo = source.json(f"{API}/repos/{slug}")
        pushed_at = repo["pushed_at"]
        repos.append({"name": repo["name"], "slug": repo["full_name"],
                      "owner": repo["owner"]["login"], "role": role,
                      "desc": repo["description"], "kind": kind, "language": repo["language"],
                      "stars": number(repo["stargazers_count"]), "forks": number(repo["forks_count"]),
                      "updatedAt": checked_timestamp(pushed_at) if pushed_at is not None else None})
    return repos


def normalize_event(event):
    raw_type = event["type"]
    kind = re.sub(r"(?<!^)(?=[A-Z])", "_", raw_type.removesuffix("Event")).lower()
    repo, payload = event["repo"]["name"], event["payload"]
    action = payload.get("action", "")
    summary = raw_type.removesuffix("Event")
    if kind == "push":
        ref = payload.get("ref", "").removeprefix("refs/heads/")
        size = payload.get("size")
        summary = (f"Pushed {number(size)} commit{'s' if size != 1 else ''}"
                   if size is not None else "Pushed")
        if ref:
            summary += f" to {ref}"
    elif kind in ("create", "delete"):
        summary = f"{'Created' if kind == 'create' else 'Deleted'} {payload.get('ref_type', 'ref')}"
        if payload.get("ref"):
            summary += f" {payload['ref']}"
    elif kind in ("issues", "issue_comment", "pull_request", "pull_request_review", "pull_request_review_comment"):
        item = payload.get("issue") or payload.get("pull_request") or {}
        noun = "issue" if kind.startswith("issue") else "pull request"
        summary = f"{action.capitalize() or 'Updated'} {noun}"
        if item.get("number") is not None:
            summary += f" #{item['number']}"
        if item.get("title"):
            summary += f": {item['title']}"
    elif kind == "watch":
        summary = "Starred repository" if action == "started" else "Watch activity"
    elif kind == "fork":
        summary = "Forked repository"
        if payload.get("forkee", {}).get("full_name"):
            summary += f" to {payload['forkee']['full_name']}"
    elif kind == "release":
        release = payload.get("release", {})
        summary = f"{action.capitalize() or 'Updated'} release {release.get('name') or release.get('tag_name') or ''}".strip()
    elif kind == "public":
        summary = "Made repository public"
    return {"id": str(event["id"]), "type": kind, "at": checked_timestamp(event["created_at"]),
            "repo": repo, "summary": summary}


def fetch_events(source):
    # REST exposes at most 300 events / 90 days, not a complete activity history.
    events = source.paginate(f"{API}/users/{USERNAME}/events/public?per_page=100")
    unique = {str(event["id"]): normalize_event(event) for event in events}
    return sorted(unique.values(), key=lambda event: event["at"], reverse=True)


def summarize_contributions(records, as_of):
    """Require complete UTC coverage; absent dates are unknown, not zero."""
    start = as_of - timedelta(days=WINDOW_DAYS - 1)
    counts = {}
    for record in records:
        day = parse_date(record["date"])
        if not start <= day <= as_of:
            continue
        count = number(record["count"])
        if day in counts and counts[day] != count:
            raise DataError(f"Conflicting contribution counts for {day}")
        counts[day] = count
    dates = [start + timedelta(days=index) for index in range(WINDOW_DAYS)]
    missing = [day for day in dates if day not in counts]
    if missing:
        raise DataError(f"Incomplete contribution window: {len(missing)} missing days (first {missing[0]})")
    days = [{"date": day.isoformat(), "count": counts[day]} for day in dates]
    longest = {"days": 0, "from": None, "to": None}
    run = 0
    for day in dates:
        run = run + 1 if counts[day] else 0
        if run > longest["days"]:
            longest = {"days": run, "from": (day - timedelta(days=run - 1)).isoformat(),
                       "to": day.isoformat()}
    end = as_of if counts[as_of] else as_of - timedelta(days=1)
    cursor = end
    while cursor >= start and counts[cursor]:
        cursor -= timedelta(days=1)
    length = (end - cursor).days
    current = {"days": length, "from": (cursor + timedelta(days=1)).isoformat() if length else None,
               "to": end.isoformat() if length else None}
    peak = max(days, key=lambda item: item["count"])
    return {"asOf": as_of.isoformat(), "total": sum(counts.values()), "windowDays": WINDOW_DAYS,
            "activeDays": sum(count > 0 for count in counts.values()),
            "peak": dict(peak) if peak["count"] else {"date": None, "count": 0},
            "currentStreak": current, "longestStreak": longest, "days": days,
            "weeks": [{"start": days[index]["date"],
                       "count": sum(day["count"] for day in days[index:index + 7])}
                      for index in range(0, WINDOW_DAYS, 7)]}


GRAPHQL_QUERY = """
query($login: String!, $from: DateTime!, $to: DateTime!) {
  user(login: $login) {
    contributionsCollection(from: $from, to: $to) {
      totalCommitContributions
      totalIssueContributions
      totalPullRequestContributions
      totalPullRequestReviewContributions
      contributionCalendar { weeks { contributionDays { date contributionCount } } }
    }
  }
}
"""


def fetch_contributions(source, now):
    today = now.date()
    if source.client.token:
        url = f"{API}/graphql"
        try:
            start = today - timedelta(days=WINDOW_DAYS - 1)
            data = source.json(url, {"query": GRAPHQL_QUERY, "variables": {
                "login": USERNAME, "from": f"{start.isoformat()}T00:00:00Z", "to": timestamp(now)}})
            if data.get("errors"):
                raise DataError("GraphQL: " + "; ".join(error["message"] for error in data["errors"]))
            collection = data["data"]["user"]["contributionsCollection"]
            weeks = collection["contributionCalendar"]["weeks"]
            records = [{"date": day["date"], "count": day["contributionCount"]}
                       for week in weeks for day in week["contributionDays"]]
            summary = summarize_contributions(records, today)
            summary["types"] = {
                "commits": number(collection["totalCommitContributions"]),
                "issues": number(collection["totalIssueContributions"]),
                "pullRequests": number(collection["totalPullRequestContributions"]),
                "codeReviews": number(collection["totalPullRequestReviewContributions"]),
            }
            source.meta["selected"] = url
            return summary
        except (DataError, KeyError, TypeError, ValueError, AttributeError) as exc:
            if not source.meta["errors"]:
                source.meta["errors"].append({"url": url, "message": str(exc)})
    data = source.json(CONTRIBUTIONS_URL)
    if data.get("error"):
        raise DataError(f"Contribution source: {data['error']}")
    records = data["contributions"]
    # Historical coverage must not invent zeroes through today's UTC date.
    known_dates = [parse_date(record["date"]) for record in records]
    as_of = min(today, max(known_dates)) if known_dates else None
    if as_of is None:
        raise DataError("Contribution source returned no daily records")
    summary = summarize_contributions(records, as_of)
    source.meta["selected"] = CONTRIBUTIONS_URL
    return summary


def collect_snapshot(client, now=None):
    now = utc_datetime(now if now is not None else utc_now())
    fetched_at = timestamp(now)
    snapshot = {"generatedAt": fetched_at, "sources": {}}
    loaders = {"profile": fetch_profile, "contributions": lambda source: fetch_contributions(source, now),
               "languages": fetch_languages, "repos": fetch_repos, "events": fetch_events}
    for section, load in loaders.items():
        source = Source(client, fetched_at)
        try:
            value = load(source)
            source.meta.update(status="ok", fetchedAt=fetched_at)
            if section == "contributions":
                source.meta["asOf"] = value["asOf"]
                if value["asOf"] < now.date().isoformat():
                    source.meta["status"] = "stale"
                    source.meta["errors"].append({"url": source.meta["selected"],
                                                  "message": f"Historical coverage ends {value['asOf']}; not current UTC data"})
            if section == "events":
                source.meta["coverage"] = "Public events only; GitHub REST limits history to 300 events / 90 days"
        except (DataError, KeyError, TypeError, ValueError, AttributeError) as exc:
            value = None
            message = str(exc) or type(exc).__name__
            if not any(error["message"] == message for error in source.meta["errors"]):
                source.meta["errors"].append({"url": source.meta["urls"][-1] if source.meta["urls"] else None,
                                              "message": message})
        if section == "languages":
            snapshot["languages"], snapshot["bytesTotal"] = value if value is not None else (None, None)
        else:
            snapshot[section] = value
        snapshot["sources"][section] = source.meta
    statuses = [source["status"] for source in snapshot["sources"].values()]
    snapshot["status"] = ("ok" if all(status == "ok" for status in statuses) else
                          "unavailable" if all(status == "unavailable" for status in statuses) else "partial")
    return snapshot


def write_snapshot(snapshot, output):
    output = Path(output)
    # Never touch an existing file on whole-source failure, including its mtime.
    if snapshot["status"] == "unavailable" and output.exists():
        return False
    serialized = json.dumps(snapshot, ensure_ascii=False, indent=2, allow_nan=False) + "\n"
    output.write_text(serialized, encoding="utf-8")
    return True


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT,
                        help="Snapshot destination (default: repository data/stats.json)")
    args = parser.parse_args(argv)
    token = os.environ.get("GH_TOKEN") or os.environ.get("GITHUB_TOKEN")
    snapshot = collect_snapshot(APIClient(token=token))
    for section, source in snapshot["sources"].items():
        print(f"{section}: {source['status']}", file=sys.stderr)
        for error in source["errors"]:
            print(f"  {error['url']}: {error['message']}", file=sys.stderr)
    try:
        written = write_snapshot(snapshot, args.output)
    except OSError as exc:
        print(f"Cannot write {args.output}: {exc}", file=sys.stderr)
        return 1
    if written:
        print(f"Wrote {args.output.resolve()} ({snapshot['status']}; generatedAt {snapshot['generatedAt']})")
    else:
        print(f"All sections unavailable; retained {args.output.resolve()} untouched", file=sys.stderr)
    return 0 if snapshot["status"] == "ok" else 1


if __name__ == "__main__":
    sys.exit(main())
