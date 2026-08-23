#!/usr/bin/env python3
"""Loopback-only low-latency desktop control for the Rakazo supervisor."""

import base64
import hmac
import json
import os
import subprocess
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

TOKEN = os.environ.get("RAKAZO_COMPUTER_CONTROL_TOKEN", "")


def capture(display):
    env = {**os.environ, "DISPLAY": display}
    def output(argv, fallback=""):
        return subprocess.run(argv, env=env, capture_output=True, text=True).stdout.strip() or fallback
    geometry = output(["xdotool", "getdisplaygeometry"], "1280 800").split()
    cursor = output(["xdotool", "getmouselocation", "--shell"])
    window = output(["xdotool", "getactivewindow"])
    title = output(["xdotool", "getwindowname", window]) if window else ""
    image = subprocess.run(
        ["import", "-define", "png:compression-level=3", "-window", "root", "png:-"],
        env=env,
        capture_output=True,
    )
    if image.returncode:
        raise RuntimeError(image.stderr.decode("utf-8", "replace") or "screen capture failed")
    fields = dict(line.split("=", 1) for line in cursor.splitlines() if "=" in line)
    return {
        "image": base64.b64encode(image.stdout).decode("ascii"),
        "mimeType": "image/png",
        "width": int(geometry[0]),
        "height": int(geometry[1]),
        **({"cursor": {"x": int(fields["X"]), "y": int(fields["Y"])}} if "X" in fields and "Y" in fields else {}),
        **({"activeWindow": {"id": window, **({"title": title} if title else {})}} if window else {}),
    }


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *_args):
        pass

    def do_POST(self):
        if self.path != "/v1/desktop" or not TOKEN or not hmac.compare_digest(
            self.headers.get("Authorization", "").removeprefix("Bearer "), TOKEN
        ):
            self.send_error(401)
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            body = json.loads(self.rfile.read(length))
            display = body.get("display", ":1")
            for step in body.get("steps", []):
                if "waitMs" in step:
                    time.sleep(max(0, min(int(step["waitMs"]), 5000)) / 1000)
                    continue
                result = subprocess.run(step["argv"], env={**os.environ, "DISPLAY": display})
                if result.returncode:
                    raise RuntimeError("computer action failed")
            settle_ms = max(0, min(int(body.get("settleMs", 0)), 5000))
            if settle_ms:
                time.sleep(settle_ms / 1000)
            response = {"completed": len(body.get("steps", []))}
            if body.get("observe", True):
                response["observation"] = capture(display)
            encoded = json.dumps(response, separators=(",", ":")).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(encoded)))
            self.end_headers()
            self.wfile.write(encoded)
        except Exception as error:
            encoded = json.dumps({"error": str(error)}).encode("utf-8")
            self.send_response(500)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(encoded)))
            self.end_headers()
            self.wfile.write(encoded)


ThreadingHTTPServer(("0.0.0.0", 7070), Handler).serve_forever()
