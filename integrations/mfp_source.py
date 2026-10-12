"""MyFitnessPal diary fetch.

python-myfitnesspal's username/password login is broken: MyFitnessPal sits
behind Cloudflare and NextAuth, and the old form login no longer returns a
session. The library's diary reader still works when it is given the browser
session cookies. Export those to a JSON file outside the repo
(MFP_COOKIE_PATH, default ~/.cadence/mfp-cookies.json):

    [{"name": "__Secure-next-auth.session-token", "value": "...", "domain": ".myfitnesspal.com"}]

mfp-mcp is the other maintained reader and it uses this same library plus a
Chrome-impersonating HTTP client. We stay on the library so a diary day is
just get_date(); if Cloudflare rejects the stock ``requests`` session, the
sync fails with the HTTP error instead of writing a partial day.
"""

from __future__ import annotations

import json
import os
from http.cookiejar import Cookie, CookieJar
from pathlib import Path
from typing import Any


def cookie_path() -> Path:
    raw = os.environ.get("MFP_COOKIE_PATH", "~/.cadence/mfp-cookies.json")
    return Path(raw).expanduser()


def load_cookie_jar(path: Path) -> CookieJar:
    data = json.loads(path.read_text())
    if not isinstance(data, list):
        raise ValueError("cookie file must be a JSON list of {name, value, domain}")
    jar = CookieJar()
    for item in data:
        domain = item.get("domain") or ".myfitnesspal.com"
        jar.set_cookie(
            Cookie(
                version=0,
                name=item["name"],
                value=item["value"],
                port=None,
                port_specified=False,
                domain=domain,
                domain_specified=True,
                domain_initial_dot=domain.startswith("."),
                path=item.get("path") or "/",
                path_specified=True,
                secure=bool(item.get("secure", True)),
                expires=item.get("expires"),
                discard=False,
                comment=None,
                comment_url=None,
                rest={"HttpOnly": item.get("httpOnly", None)},
                rfc2109=False,
            )
        )
    return jar


def connect_mfp(jar: CookieJar | None = None) -> Any:
    path = cookie_path()
    if jar is None:
        if not path.is_file():
            raise SystemExit(
                f"MyFitnessPal cookie file not found at {path}. "
                "Password login no longer works; export a browser session "
                "to MFP_COOKIE_PATH. See the README."
            )
        jar = load_cookie_jar(path)
    try:
        import myfitnesspal
    except ImportError as error:
        raise SystemExit(
            "myfitnesspal is not installed. pip install -r integrations/requirements.txt"
        ) from error
    # unit_aware=False keeps calories and grams as numbers, not measurements.
    return myfitnesspal.Client(cookiejar=jar, unit_aware=False)


def _plain(value: Any) -> Any:
    if isinstance(value, bool) or value is None:
        return value
    if isinstance(value, (int, float)):
        return value
    magnitude = getattr(value, "magnitude", None)
    if isinstance(magnitude, (int, float)) and not isinstance(magnitude, bool):
        return magnitude
    return value


_KEYS = ("calories", "protein", "carbohydrates", "carbs", "fat", "sodium", "sugar", "fiber")


def as_numbers(value: Any) -> dict[str, Any]:
    if value is None:
        return {}
    if isinstance(value, dict):
        return {str(k): _plain(v) for k, v in value.items()}
    out: dict[str, Any] = {}
    for key in _KEYS:
        try:
            out[key] = _plain(value[key])
        except Exception:
            continue
    return {k: v for k, v in out.items() if isinstance(v, (int, float))}


def diary_from_day(day: Any) -> dict[str, Any]:
    meals = []
    for meal in getattr(day, "meals", None) or []:
        entries = []
        for entry in getattr(meal, "entries", None) or []:
            entries.append(
                {
                    "name": getattr(entry, "name", "") or "",
                    "nutrition": as_numbers(getattr(entry, "totals", None)),
                }
            )
        meals.append({"name": getattr(meal, "name", "meal") or "meal", "entries": entries})
    when = getattr(day, "date", None)
    date = when.isoformat() if hasattr(when, "isoformat") else str(when)
    return {
        "date": date,
        "meals": meals,
        "totals": as_numbers(getattr(day, "totals", None)),
        "goals": as_numbers(getattr(day, "goals", None)),
    }


def fetch_mfp(client: Any, dates: list[str]) -> dict[str, Any]:
    days = []
    for iso in dates:
        year, month, day = (int(part) for part in iso.split("-"))
        days.append(diary_from_day(client.get_date(year, month, day)))
    return {"source": "mfp", "days": days}
