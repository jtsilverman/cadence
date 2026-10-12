"""Garmin Connect fetch via garminconnect.

Login: email + password + MFA the first time (GARMIN_MFA_CODE, or a prompt).
After that, Garmin.login(tokenstore) reuses the saved token directory and
client.dump(path) refreshes the file. Nothing here is committed.
"""

from __future__ import annotations

import os
from collections.abc import Callable
from pathlib import Path
from typing import Any


def tokenstore_path() -> str:
    raw = os.environ.get("GARMINTOKENS", "~/.cadence/garmin")
    path = Path(raw).expanduser()
    if path.suffix == ".json":
        path.parent.mkdir(parents=True, exist_ok=True)
    else:
        path.mkdir(parents=True, exist_ok=True)
    return str(path)


def _dump(client: Any, path: str) -> None:
    inner = getattr(client, "client", None)
    dump = getattr(inner, "dump", None) if inner is not None else None
    if not callable(dump):
        dump = getattr(client, "dump", None)
    if callable(dump):
        dump(path)


def prompt_mfa() -> str:
    code = os.environ.get("GARMIN_MFA_CODE", "").strip()
    if code:
        return code
    return input("Garmin MFA code: ").strip()


def connect_garmin(factory: Callable[..., Any] | None = None) -> Any:
    """Return a logged-in garminconnect client. ``factory`` is the Garmin class
    (tests pass a fake). Tokens are loaded first; credentials are only used
    when the token store cannot resume a session."""
    path = tokenstore_path()
    email = os.environ.get("GARMIN_EMAIL") or None
    password = os.environ.get("GARMIN_PASSWORD") or None
    garmin_cls = factory or _garmin_class()

    try:
        client = garmin_cls()
        client.login(path)
        _dump(client, path)
        return client
    except Exception as first_error:
        if not email or not password:
            raise SystemExit(
                "Garmin token store is missing or stale, and GARMIN_EMAIL / "
                f"GARMIN_PASSWORD are not set ({path}). {first_error}"
            ) from first_error
        client = garmin_cls(email=email, password=password, prompt_mfa=prompt_mfa)
        client.login(path)
        _dump(client, path)
        return client


def _garmin_class() -> Callable[..., Any]:
    try:
        from garminconnect import Garmin
    except ImportError as error:
        raise SystemExit(
            "garminconnect is not installed. "
            "pip install -r integrations/requirements.txt"
        ) from error
    return Garmin


def _safe(fn: Callable[..., Any], *args: Any) -> Any:
    try:
        return fn(*args)
    except Exception as error:
        return {"_error": f"{type(error).__name__}: {error}"}


def fetch_garmin(client: Any, dates: list[str]) -> dict[str, Any]:
    if not dates:
        raise ValueError("dates must not be empty")
    start, end = dates[0], dates[-1]
    activities = client.get_activities_by_date(start, end) or []
    if isinstance(activities, dict):
        nested = activities.get("activities") or activities.get("activityList") or []
        activities = nested if isinstance(nested, list) else []
    battery = _safe(client.get_body_battery, start, end)
    days = []
    for day in dates:
        days.append(
            {
                "date": day,
                "stats": _safe(client.get_stats, day),
                "sleep": _safe(client.get_sleep_data, day),
                "hrv": _safe(client.get_hrv_data, day),
                "body_battery": battery,
                "training_status": _safe(client.get_training_status, day),
            }
        )
    return {"source": "garmin", "activities": activities, "days": days}
