"""CLI: backfill N days or sync the recent window, then ingest.

    python -m integrations sync                 # garmin + mfp, last 2 days
    python -m integrations sync --source garmin --days 30
    python -m integrations sync --source mfp --print-only
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path

from integrations.dates import date_window
from integrations.envfile import load_env
from integrations.garmin_source import connect_garmin, fetch_garmin
from integrations.mfp_source import connect_mfp, fetch_mfp

ROOT = Path(__file__).resolve().parents[1]


def _ingest(bundle: dict) -> dict:
    proc = subprocess.run(
        ["npx", "tsx", "scripts/ingest-external.ts"],
        input=json.dumps(bundle),
        text=True,
        capture_output=True,
        cwd=ROOT,
        check=False,
    )
    if proc.returncode != 0:
        sys.stderr.write(proc.stderr or proc.stdout)
        raise SystemExit(proc.returncode or 1)
    sys.stderr.write(proc.stderr)
    return json.loads(proc.stdout)


def main(argv: list[str] | None = None) -> int:
    load_env(ROOT / ".env.local")
    load_env(ROOT / ".env")

    parser = argparse.ArgumentParser(prog="integrations")
    sub = parser.add_subparsers(dest="cmd", required=True)
    sync = sub.add_parser("sync", help="fetch recent data and append diary events")
    sync.add_argument("--source", choices=["garmin", "mfp", "all"], default="all")
    sync.add_argument("--days", type=int, default=2)
    sync.add_argument(
        "--print-only",
        action="store_true",
        help="print the raw bundle JSON and do not write events",
    )
    args = parser.parse_args(argv)
    if args.cmd != "sync":
        parser.error(args.cmd)

    try:
        dates = date_window(args.days)
    except ValueError as error:
        print(str(error), file=sys.stderr)
        return 2

    sources = ["garmin", "mfp"] if args.source == "all" else [args.source]
    results = []
    for source in sources:
        if source == "garmin":
            bundle = fetch_garmin(connect_garmin(), dates)
        else:
            bundle = fetch_mfp(connect_mfp(), dates)
        if args.print_only:
            results.append(bundle)
            continue
        results.append(_ingest(bundle))

    json.dump(results if len(results) > 1 else results[0], sys.stdout)
    sys.stdout.write("\n")
    return 0
