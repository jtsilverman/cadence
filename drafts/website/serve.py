#!/usr/bin/env python3
"""Static server for the website drafts, with caching turned off.

python3 -m http.server sends Last-Modified and no Cache-Control, so a browser
applies heuristic freshness and serves an edited page from its own cache. That
is why every reload used to need a new ?v= token. This server answers no-store,
so one stable URL always shows the current file.

    python3 drafts/website/serve.py [port]
"""
import sys
from functools import partial
from http.server import HTTPServer, SimpleHTTPRequestHandler
from pathlib import Path

ROOT = Path(__file__).resolve().parent


class NoCacheHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, must-revalidate")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

    def log_message(self, fmt, *args):
        # who fetched what, so a stale browser is visible from here
        print(f"{self.client_address[0]} {fmt % args}", flush=True)


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8787
    handler = partial(NoCacheHandler, directory=str(ROOT))
    print(f"serving {ROOT} on 0.0.0.0:{port}")
    HTTPServer(("0.0.0.0", port), handler).serve_forever()
