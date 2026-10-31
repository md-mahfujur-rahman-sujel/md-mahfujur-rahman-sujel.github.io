#!/usr/bin/env python3
"""Render the desktop SVG panels from data/stats.json.

The panels are hand-authored templates in scripts/panels/. This script fills
their placeholders so the scheduled data refresh also refreshes the panels the
desktop site and README embed. A panel whose data section is unavailable is
left untouched (its own date stamp keeps it honest).
"""
from __future__ import annotations

import argparse
import json
import math
import os
import re
import sys
import tempfile
from datetime import date, datetime, timezone
from html import escape
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TEMPLATE_DIR = ROOT / 'scripts' / 'panels'
ASSET_DIR = ROOT / 'assets'
PANELS = ('telemetry', 'activity', 'repos')

MONTHS = ('JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC')
LEVEL_COLORS = {0: '#111B27', 1: '#244C7D', 2: '#2F6BC0', 3: '#3B82F6', 4: '#FBCA03'}
BAR_COLORS = ('#3B82F6', '#67C7EB', '#FBCA03', '#4F8DFF')
BAR_TEXT_COLORS = ('#93C5FD', '#67C7EB', '#FBCA03', '#BFDBFE')
STRIP_COLORS = ('#A9C7FF', '#4F8DFF', '#67C7EB')
CARD_ACCENTS = ('#A9C7FF', '#67C7EB', '#E10F19')
CARD_OPEN_COLORS = ('#A9C7FF', '#67C7EB', '#FF8B80')
LANGUAGE_COLORS = {
    'HTML': '#FBCA03', 'CSS': '#A9C7FF', 'JavaScript': '#A9C7FF', 'TypeScript': '#67C7EB',
    'Java': '#BFDBFE', 'Kotlin': '#E10F19', 'Python': '#67C7EB', 'SCSS': '#4F8DFF',
}
EVENT_STYLES = {
    'push': ('PUSH', '#A9C7FF'),
    'pull_request': ('PR', '#FF5C5C'),
    'issues': ('ISSUE', '#4F8DFF'),
    'issue_comment': ('COMMENT', '#4F8DFF'),
    'watch': ('STAR', '#FBCA03'),
    'create': ('CREATE', '#4F8DFF'),
    'delete': ('DELETE', '#7E93A8'),
    'fork': ('FORK', '#A9C7FF'),
    'release': ('RELEASE', '#FBCA03'),
}

CIRCUMFERENCE = 326.7
BAR_TRACK = 366.6666666666667


def parse_time(value):
    if not isinstance(value, str):
        return None
    try:
        parsed = datetime.fromisoformat(value.replace('Z', '+00:00'))
    except ValueError:
        return None
    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def parse_day(value):
    if not isinstance(value, str):
        return None
    try:
        return date.fromisoformat(value[:10])
    except ValueError:
        return None


def number(value):
    return value if isinstance(value, (int, float)) and math.isfinite(value) else None


def pad(value, width=2):
    if not isinstance(value, int) or value < 0:
        return '—'
    return str(value).rjust(width, '0')


def stamp(ref):
    return f'{ref.day} {MONTHS[ref.month - 1]} {ref.year} · {ref:%H:%M} UTC'


def short_day(value):
    day = parse_day(value)
    return f'{MONTHS[day.month - 1]} {day.day}' if day else '—'


def day_month(value):
    moment = parse_time(value)
    return f'{moment.day} {MONTHS[moment.month - 1]}' if moment else '—'


def long_day(value):
    day = parse_day(value)
    return f'{day.day} {MONTHS[day.month - 1]} {day.year}' if day else '—'


def month_year(value):
    if not isinstance(value, str):
        return '—'
    parts = value.split('-')
    if len(parts) >= 2 and parts[0].isdigit() and parts[1].isdigit() and 1 <= int(parts[1]) <= 12:
        return f'{MONTHS[int(parts[1]) - 1]} {parts[0]}'
    return '—'


def window_label(days):
    first, last = parse_day(days[0]['date']), parse_day(days[-1]['date'])
    if not first or not last:
        return '—'
    return f'{MONTHS[first.month - 1]} {first.year} → {MONTHS[last.month - 1]} {last.year}'


def age(value, ref):
    moment = parse_time(value)
    if not moment:
        return '—'
    seconds = (ref - moment).total_seconds()
    if seconds < 3600:
        return 'NOW'
    days = seconds / 86400
    if days < 1:
        return f'{int(seconds // 3600)}H AGO'
    if days < 30:
        return f'{int(days)}D AGO'
    if days < 365:
        return f'{int(days // 30)}MO AGO'
    return f'{int(days // 365)}Y AGO'


def byte_label(value):
    size = number(value)
    if size is None:
        return '—'
    if size >= 1_048_576:
        return f'{size / 1_048_576:.1f} MB'
    if size >= 1_024:
        return f'{size / 1_024:.1f} KB'
    return f'{int(size)} B'


def elapsed_fraction(ref):
    start = datetime(ref.year, 1, 1, tzinfo=timezone.utc)
    end = datetime(ref.year + 1, 1, 1, tzinfo=timezone.utc)
    return max(0.0, min(1.0, (ref - start).total_seconds() / (end - start).total_seconds()))


def sync_status(stats, ok='SYNC OK'):
    return 'PARTIAL SYNC' if stats.get('status') == 'partial' else ok


def plural(count, singular, plural_form=None):
    return singular if count == 1 else (plural_form or f'{singular}s')


def image_escape(value):
    return escape(str(value), quote=False)


def attribute_escape(value):
    return escape(str(value), quote=True)


def intensity(count, peak):
    if not count:
        return 0
    return min(4, math.ceil(count / peak * 4))


def calendar_block(days):
    peak = max((day.get('count', 0) for day in days), default=0) or 1
    start = parse_day(days[0].get('date'))
    x0, y0, cell, gap = 72.0, 486.0, 12.5, 4.5
    pitch = cell + gap
    weeks = len(days) // 7
    parts = ['<rect x="40.0" y="484" width="1200.0" height="1" fill="#16263A" opacity=".35"/>']
    previous = None
    for col in range(weeks):
        day = parse_day(days[col * 7].get('date'))
        if not day:
            continue
        if day.month != previous:
            cx = x0 + col * pitch + cell / 2
            parts.append(
                f'<text class="m" x="{cx:.2f}" y="478" text-anchor="middle" font-size="9" '
                f'letter-spacing=".6" fill="#7E93A8">{MONTHS[day.month - 1]}</text>'
            )
            previous = day.month
    if start:
        for name, weekday in (('MON', 0), ('WED', 2), ('FRI', 4)):
            row = (weekday - start.weekday()) % 7
            baseline = y0 + row * pitch + cell / 2 + 3.2
            parts.append(
                f'<text class="m" x="40" y="{baseline:.2f}" font-size="9" letter-spacing=".8" fill="#7E93A8">{name}</text>'
            )
    for index, day in enumerate(days):
        col, row = divmod(index, 7)
        count = number(day.get('count')) or 0
        parts.append(
            f'<rect x="{x0 + col * pitch:.2f}" y="{y0 + row * pitch:.2f}" width="{cell}" height="{cell}" '
            f'rx="2.5" fill="{LEVEL_COLORS[intensity(count, peak)]}"/>'
        )
    swatches = ''.join(
        f'<rect x="{1069.5 + i * 15:.1f}" y="511" width="11" height="11" rx="2.5" fill="{LEVEL_COLORS[i]}"/>'
        for i in range(5)
    )
    parts.append(
        '<text class="m" x="1033.5" y="522" font-size="9" letter-spacing=".8" fill="#7E93A8">LESS</text>'
        + swatches
        + '<text class="m" x="1150.5" y="522" font-size="9" letter-spacing=".8" fill="#7E93A8">MORE</text>'
        + '<rect x="1000" y="542" width="210" height="1" fill="#16263A" opacity=".55"/>'
        + f'<text class="m" x="1105" y="562" text-anchor="middle" font-size="10" letter-spacing="1.2" fill="#7E93A8">{weeks} WEEKS · {len(days)} DAYS</text>'
        + f'<text class="m" x="1105" y="581" text-anchor="middle" font-size="9.5" letter-spacing="1" fill="#7E93A8">WINDOW ENDS {long_day(days[-1].get("date"))}</text>'
        + '<rect class="scanA" x="-140" y="484" width="140" height="115" fill="url(#scanline)"/>'
    )
    return ''.join(parts)


def language_block(languages):
    rows = [item for item in languages if isinstance(item, dict) and isinstance(item.get('name'), str) and number(item.get('pct')) is not None]
    rows.sort(key=lambda item: item['pct'], reverse=True)
    rows = rows[:4]
    if not rows:
        return ('<text class="s" x="875.3333333333334" y="166.0" font-size="14" fill="#7E93A8">'
                'No language data yet.</text>')
    parts = []
    for index, item in enumerate(rows):
        top = 166.0 + 34 * index
        bar = top + 7
        width = max(0.0, min(1.0, item['pct'] / 100)) * BAR_TRACK
        parts.append(
            f'<text class="s" x="875.3333333333334" y="{top:.1f}" font-size="14" fill="#EEF6FF">{image_escape(item["name"])}</text>'
            f'<text class="m" x="1242.0" y="{top:.1f}" text-anchor="end" font-size="12" fill="{BAR_TEXT_COLORS[index]}">{item["pct"]:.1f}%</text>'
            f'<rect x="875.3333333333334" y="{bar:.1f}" width="{BAR_TRACK:.1f}" height="5" rx="2.5" fill="#111B27"/>'
            f'<rect class="grow" x="875.3333333333334" y="{bar:.1f}" width="{width:.1f}" height="5" rx="2.5" '
            f'fill="{BAR_COLORS[index]}" style="animation-delay:{index * 0.08:.2f}s"/>'
        )
    return ''.join(parts)


def strip_block(days, peak, color, x_start):
    parts = []
    for index, day in enumerate(days[-14:]):
        count = number(day.get('count')) or 0
        height = 2.0 if not count else round(max(3.0, count / peak * 24), 1)
        x = round(x_start + index * 8, 1)
        if height <= 2.0:
            parts.append(f'<rect x="{x}" y="390.0" width="5" height="2.0" rx="1.5" fill="#182434" opacity="1"/>')
        else:
            parts.append(f'<rect x="{x}" y="{392 - height:.1f}" width="5" height="{height:.1f}" rx="1.5" fill="{color}" opacity=".95"/>')
    return ''.join(parts)


def telemetry_panel(stats):
    profile = stats.get('profile')
    contribution = stats.get('contributions')
    languages = stats.get('languages')
    if not isinstance(profile, dict) or not isinstance(contribution, dict) or not isinstance(contribution.get('days'), list):
        return None
    days = [day for day in contribution['days'] if isinstance(day, dict) and parse_day(day.get('date')) and number(day.get('count')) is not None]
    if len(days) < 7:
        return None
    days = days[-(len(days) // 7) * 7:]
    total = number(contribution.get('total'))
    active = number(contribution.get('activeDays'))
    if total is None or active is None:
        return None
    ref = parse_time(stats.get('generatedAt')) or parse_time(f'{days[-1]["date"]}T00:00:00Z')
    if ref is None:
        return None
    if not isinstance(languages, list):
        languages = []
    window = len(days)
    peak = max((number(day['count']) or 0 for day in days), default=0)
    peak_day = contribution.get('peak') if isinstance(contribution.get('peak'), dict) else None
    peak_date = peak_day.get('date') if peak_day and number(peak_day.get('count')) is not None else None
    current = contribution.get('currentStreak') if isinstance(contribution.get('currentStreak'), dict) else {}
    longest = contribution.get('longestStreak') if isinstance(contribution.get('longestStreak'), dict) else {}
    elapsed = elapsed_fraction(ref)
    values = {
        'aria_label': attribute_escape(
            f'GitHub telemetry for Md Mahfujur Rahman Sujel: {int(total)} contributions, '
            f'{int(number(current.get("days")) or 0)}-day current streak, {int(active)} active days'
        ),
        'stamp': stamp(ref),
        'repos': pad(number(profile.get('repos'))),
        'stars': pad(number(profile.get('stars'))),
        'followers': pad(number(profile.get('followers'))),
        'following': pad(number(profile.get('following'))),
        'member_since': month_year(profile.get('memberSince')),
        'total': str(int(total)),
        'ring_dash': f'{CIRCUMFERENCE * elapsed:.1f}',
        'year': str(ref.year),
        'elapsed': str(round(elapsed * 100)),
        'active': str(int(active)),
        'peak': str(int(peak)),
        'bytes': byte_label(stats.get('bytesTotal')),
        'current_days': pad(number(current.get('days'))),
        'longest_days': pad(number(longest.get('days'))),
        'active_days': str(int(active)),
        'current_range': streak_range(current),
        'longest_range': streak_range(longest),
        'consistency': f'{active / window * 100:.1f}',
        'window_days': str(window),
        'weeks': str(window // 7),
        'peak_date': short_day(peak_date),
        'as_of': long_day(days[-1]['date']),
        'window_label': window_label(days),
        'footer': f'{int(total)} contributions · {int(active)} active days · {window}d window',
        'sync_status': sync_status(stats),
    }
    blocks = {
        'languages': language_block(languages),
        'calendar': calendar_block(days),
        'strip1': strip_block(days, peak, STRIP_COLORS[0], 292.7),
        'strip2': strip_block(days, peak, STRIP_COLORS[1], 711.3),
        'strip3': strip_block(days, peak, STRIP_COLORS[2], 1130.0),
    }
    return values, blocks


def streak_range(streak):
    start = parse_day(streak.get('from'))
    end = parse_day(streak.get('to'))
    if not start or not end or not number(streak.get('days')):
        return '— → —'
    return f'{short_day(streak["from"])} → {short_day(streak["to"])}'


def activity_panel(stats):
    events = stats.get('events')
    if not isinstance(events, list):
        return None
    usable = [event for event in events
              if isinstance(event, dict) and parse_time(event.get('at')) and isinstance(event.get('type'), str)
              and isinstance(event.get('summary'), str) and isinstance(event.get('repo'), str)]
    usable.sort(key=lambda event: event['at'], reverse=True)
    shown = usable[:7]
    ref = parse_time(stats.get('generatedAt')) or parse_time(shown[0]['at'])
    if ref is None:
        return None
    accent = EVENT_STYLES.get(shown[0]['type'], ('EVENT', '#A9C7FF'))[1] if shown else '#A9C7FF'
    parts = []
    if not shown:
        parts.append('<g class="rise" style="animation-delay:0.00s">'
                     '<text class="m" x="24" y="120.0" font-size="12.5" fill="#DCE8F5">No recent public events.</text></g>')
    for index, event in enumerate(shown):
        top = 120.0 + 29 * index
        label, color = EVENT_STYLES.get(event['type'], (event['type'].replace('_', ' ').upper()[:9], '#A9C7FF'))
        width = max(74.0, len(label) * 6.6 + 18)
        row = [f'<g class="rise" style="animation-delay:{index * 0.07:.2f}s">']
        if index == 0:
            row.append(f'<rect x="12" y="101.0" width="1256" height="26" rx="6" fill="{accent}" fill-opacity=".055"/>'
                       f'<rect x="12" y="101.0" width="2.5" height="26" rx="1.2" fill="{accent}" fill-opacity=".8"/>')
        row.append(
            f'<text class="m" x="24" y="{top:.1f}" font-size="9.5" fill="#4B5E72">{index + 1:03d}</text>'
            f'<text class="m" x="58" y="{top:.1f}" font-size="11" fill="#7E93A8">{day_month(event["at"])} · {parse_time(event["at"]):%H:%M}</text>'
            f'<rect x="170" y="{top - 13:.1f}" width="{width:.0f}" height="19" rx="4" fill="{color}" fill-opacity=".12" stroke="{color}" stroke-opacity=".55"/>'
            f'<text class="m" x="{170 + width / 2:.1f}" y="{top - 0.5:.1f}" text-anchor="middle" font-size="9.5" letter-spacing="1.1" fill="{color}">{image_escape(label)}</text>'
            f'<text class="m" x="262" y="{top:.1f}" font-size="12.5" fill="#DCE8F5">{image_escape(event["summary"])}'
            f'<tspan fill="{color}" fill-opacity=".9">  ·  {image_escape(event["repo"])}</tspan></text>'
            f'<text class="m" x="1258" y="{top:.1f}" text-anchor="end" font-size="10" fill="#7E93A8">{age(event["at"], ref)}</text>'
        )
        row.append('</g>')
        parts.append(''.join(row))
    values = {
        'stamp': stamp(ref),
        'event_count': pad(len(usable)),
        'footer': f'{len(shown)} latest of {len(usable)} public events · 90-day window',
        'sync_status': sync_status(stats, 'STREAM OK'),
    }
    return values, {'rows': ''.join(parts)}


def repo_cards(repos, ref):
    parts = []
    for index, repo in enumerate(repos[:3]):
        top = 100.0 + 96 * index
        accent = CARD_ACCENTS[index]
        open_color = CARD_OPEN_COLORS[index]
        slug = repo.get('slug') or f'{repo.get("owner")}/{repo.get("name")}'
        owner = str(slug).split('/')[0]
        role = str(repo.get('owner_line') or owner)
        if repo.get('role') == 'collaborator':
            role = f'{owner} · COLLABORATOR'
        description = str(repo.get('desc') or 'No description provided.')
        if len(description) > 108:
            description = description[:107].rstrip() + '…'
        language = str(repo.get('language') or 'Not specified')
        color = LANGUAGE_COLORS.get(language, '#A9C7FF')
        stars = repo.get('stars')
        forks = repo.get('forks')
        parts.append(
            f'<g class="rise" style="animation-delay:{index * 0.08:.2f}s">'
            f'<rect x="20.0" y="{top:.1f}" width="1240.0" height="86.0" rx="12" fill="url(#glass)" stroke="#16263A" stroke-opacity=".6"/>'
            f'<rect x="20.0" y="{top + 12:.1f}" width="3" height="62.0" rx="1.5" fill="{accent}"/>'
            f'<rect x="20.0" y="{top:.1f}" width="1240.0" height="1.5" rx=".75" fill="{accent}" fill-opacity=".55"/>'
            f'<text class="m" x="42.0" y="{top + 35:.1f}" font-size="11.5" fill="{open_color}">{index + 1:02d}</text>'
            f'<text class="m" x="42.0" y="{top + 52:.1f}" font-size="9" letter-spacing="1.1" fill="#60748A">NODE</text>'
            f'<text class="s" x="88.0" y="{top + 34:.1f}" font-size="20" font-weight="700" fill="#EEF6FF">{image_escape(repo.get("name") or slug)}</text>'
            f'<text class="m" x="88.0" y="{top + 52:.1f}" font-size="10.5" fill="#7E93A8">{image_escape(role)}</text>'
            f'<text class="s" x="88.0" y="{top + 72:.1f}" font-size="14" fill="#B9C7D6">{image_escape(description)}</text>'
            f'<text class="m" x="42.0" y="{top + 72:.1f}" font-size="9" letter-spacing=".8" fill="{accent}" fill-opacity=".55">{image_escape(repo.get("kind") or "REPO")}</text>'
            f'<text class="m" x="1240.0" y="{top + 34:.1f}" text-anchor="end" font-size="10.5" letter-spacing="1.3" fill="{open_color}">OPEN REPOSITORY ↗</text>'
            f'<text class="m" x="1240.0" y="{top + 52:.1f}" text-anchor="end" font-size="10.5" letter-spacing=".8" fill="#7E93A8">UPDATED {age(repo.get("updatedAt"), ref)}</text>'
            f'<circle cx="992.0" cy="{top + 66:.1f}" r="3.2" fill="{color}"/>'
            f'<text class="m" x="1002.0" y="{top + 70:.1f}" font-size="12" fill="#9FB2C6">{image_escape(language)}</text>'
            f'<use href="#ic-star" transform="translate(1081 {top + 66:.0f})"/>'
            f'<text class="m" x="1092.0" y="{top + 70:.1f}" font-size="12" fill="#7E93A8">{pad(number(stars))}</text>'
            f'<use href="#ic-fork" transform="translate(1142 {top + 66:.0f})"/>'
            f'<text class="m" x="1153.0" y="{top + 70:.1f}" font-size="12" fill="#7E93A8">{pad(number(forks))}</text>'
            f'</g>'
        )
    return ''.join(parts)


def repos_panel(stats):
    repos = stats.get('repos')
    if not isinstance(repos, list) or not repos:
        return None
    usable = [repo for repo in repos if isinstance(repo, dict) and (repo.get('slug') or repo.get('name'))]
    if not usable:
        return None
    ref = parse_time(stats.get('generatedAt'))
    if ref is None:
        return None
    owned = sum(1 for repo in usable if repo.get('role') == 'owner')
    collab = sum(1 for repo in usable if repo.get('role') == 'collaborator')
    languages = {repo.get('language') for repo in usable if repo.get('language')}
    shown = len(usable[:3])
    lead = f'{shown} of {len(usable)} repositories' if len(usable) > shown else f'{len(usable)} repositories'
    values = {
        'stamp': stamp(ref),
        'all_count': pad(len(usable)),
        'owned_count': pad(owned),
        'collab_count': pad(collab),
        'lang_count': pad(len(languages)),
        'footer': f'{lead} · {owned} owned · {collab} {plural(collab, "collaborator")} · live github api',
        'sync_status': sync_status(stats),
    }
    return values, {'cards': repo_cards(usable, ref)}


RENDERERS = {'telemetry': telemetry_panel, 'activity': activity_panel, 'repos': repos_panel}


def fill(template, name, values, blocks):
    def block(match):
        key = match.group(1)
        if key not in blocks:
            raise ValueError(f'{name}: no renderer for block {key!r}')
        return blocks[key]

    filled = re.sub(r'<!--@(\w+)-->.*?<!--/@\1-->', block, template, flags=re.S)
    if '<!--@' in filled or '<!--/@' in filled:
        raise ValueError(f'{name}: unclosed block marker')

    def token(match):
        key = match.group(1)
        if key not in values:
            raise ValueError(f'{name}: no renderer for token {key!r}')
        return str(values[key])

    filled = re.sub(r'\{\{(\w+)\}\}', token, filled)
    leftover = re.findall(r'\{\{\w+\}\}', filled)
    if leftover:
        raise ValueError(f'{name}: unresolved tokens {leftover}')
    return filled


def write_atomic(path, content):
    handle, temporary = tempfile.mkstemp(dir=path.parent, prefix=path.name + '.', suffix='.tmp')
    try:
        with os.fdopen(handle, 'w', encoding='utf-8', newline='') as stream:
            stream.write(content)
        os.replace(temporary, path)
    except BaseException:
        if os.path.exists(temporary):
            os.unlink(temporary)
        raise


def render(stats, templates=TEMPLATE_DIR, assets=ASSET_DIR, check=False):
    """Return [(panel, changed)] for every panel; raise on template defects."""
    results = []
    for name in PANELS:
        template_path = Path(templates) / f'{name}.svg'
        output_path = Path(assets) / f'{name}.svg'
        template = template_path.read_text(encoding='utf-8')
        rendered = RENDERERS[name](stats)
        if rendered is None:
            results.append((name, False, 'data unavailable'))
            continue
        values, blocks = rendered
        content = fill(template, name, values, blocks)
        current = output_path.read_text(encoding='utf-8') if output_path.exists() else None
        changed = content != current
        if changed and not check:
            write_atomic(output_path, content)
        results.append((name, changed, 'rendered' if changed else 'unchanged'))
    return results


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--stats', default=str(ROOT / 'data' / 'stats.json'))
    parser.add_argument('--templates', default=str(TEMPLATE_DIR))
    parser.add_argument('--assets', default=str(ASSET_DIR))
    parser.add_argument('--check', action='store_true', help='verify the panels are current instead of writing')
    args = parser.parse_args(argv)

    with open(args.stats, encoding='utf-8') as handle:
        stats = json.load(handle)

    try:
        results = render(stats, args.templates, args.assets, check=args.check)
    except (ValueError, KeyError) as error:
        print(f'render error: {error}', file=sys.stderr)
        return 2

    for name, changed, state in results:
        print(f'{name}: {state}')
    if args.check and any(changed for _, changed, _ in results):
        print('panels are out of date; run scripts/render_panels.py', file=sys.stderr)
        return 1
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
