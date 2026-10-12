"""Calendar windows for backfill. Dates are the machine's local calendar,
which should be the household timezone (America/New_York unless HOUSEHOLD_TZ
is set on the app)."""

from __future__ import annotations

from datetime import date, timedelta


def date_window(days: int, today: date | None = None) -> list[str]:
    if days < 1 or days > 366:
        raise ValueError("days must be an integer from 1 to 366")
    end = today or date.today()
    start = end - timedelta(days=days - 1)
    out: list[str] = []
    cursor = start
    while cursor <= end:
        out.append(cursor.isoformat())
        cursor += timedelta(days=1)
    return out
