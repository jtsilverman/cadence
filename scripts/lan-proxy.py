#!/usr/bin/env python3
"""Forward the LAN to the Next dev server.

The macOS firewall blocks incoming connections to node and allows python3, so
the Network URL Next prints has never been reachable from another machine. This
listens on the allowed binary and forwards to 127.0.0.1:3000 over loopback,
which the firewall does not filter. Nothing about the machine's security
settings changes.
"""
import http.server
import socketserver
import urllib.error
import urllib.request

UPSTREAM = "http://127.0.0.1:3000"
PORT = 8788
HOP_BY_HOP = {
    "connection", "keep-alive", "proxy-authenticate", "proxy-authorization",
    "te", "trailers", "transfer-encoding", "upgrade", "content-encoding",
    "content-length",
}


class Proxy(http.server.BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def _forward(self, method):
        length = int(self.headers.get("Content-Length") or 0)
        body = self.rfile.read(length) if length else None
        headers = {k: v for k, v in self.headers.items() if k.lower() not in HOP_BY_HOP}
        headers["Accept-Encoding"] = "identity"
        request = urllib.request.Request(
            UPSTREAM + self.path, data=body, headers=headers, method=method
        )
        try:
            with urllib.request.urlopen(request) as response:
                payload = response.read()
                status = response.status
                out = response.headers
        except urllib.error.HTTPError as err:  # 404s and friends still have a page
            payload = err.read()
            status = err.code
            out = err.headers
        except Exception as err:  # noqa: BLE001 - the dev server is down or restarting
            payload = f"upstream unreachable: {err}".encode()
            self.send_response(502)
            self.send_header("Content-Type", "text/plain")
            self.send_header("Content-Length", str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)
            return

        self.send_response(status)
        for key, value in out.items():
            if key.lower() not in HOP_BY_HOP:
                self.send_header(key, value)
        # always the current file, never a stale one
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def do_GET(self):
        self._forward("GET")

    def do_POST(self):
        self._forward("POST")

    def do_HEAD(self):
        self._forward("HEAD")

    def log_message(self, fmt, *args):
        pass


class Server(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
    daemon_threads = True


with Server(("0.0.0.0", PORT), Proxy) as httpd:
    print(f"forwarding 0.0.0.0:{PORT} -> {UPSTREAM}")
    httpd.serve_forever()
