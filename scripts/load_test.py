"""Simple load test targeting NFR-003 (50 invoices/day).

Default profile is intentionally modest: 60 sequential uploads of a small sample
PDF over ~10 minutes, measuring per-request latency and overall throughput.
Ramp up by setting LOAD_INVOICES and/or LOAD_WORKERS.
"""
from __future__ import annotations

import argparse
import concurrent.futures
import os
import statistics
import sys
import time
from pathlib import Path

import httpx


def login(base: str, username: str, password: str) -> str:
    resp = httpx.post(
        f"{base}/auth/login",
        data={"username": username, "password": password},
        timeout=15.0,
    )
    resp.raise_for_status()
    return resp.json()["access_token"]


def upload_once(base: str, token: str, sample: bytes, name: str) -> tuple[bool, float]:
    t0 = time.monotonic()
    try:
        with httpx.Client(timeout=60.0) as client:
            resp = client.post(
                f"{base}/invoices/upload",
                headers={"Authorization": f"Bearer {token}"},
                files={"file": (name, sample, "application/pdf")},
            )
        ok = resp.status_code < 400
    except Exception:  # noqa: BLE001
        ok = False
    return ok, (time.monotonic() - t0) * 1000


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base", default=os.environ.get("BASE_URL", "http://localhost/api"))
    parser.add_argument("--user", default=os.environ.get("SMOKE_USER", "officer"))
    parser.add_argument("--password", default=os.environ.get("SMOKE_PASS", "Officer!pass123"))
    parser.add_argument("--count", type=int, default=int(os.environ.get("LOAD_INVOICES", "60")))
    parser.add_argument("--workers", type=int, default=int(os.environ.get("LOAD_WORKERS", "2")))
    parser.add_argument("--sample", default="")
    args = parser.parse_args()

    if args.sample and Path(args.sample).is_file():
        sample = Path(args.sample).read_bytes()
    else:
        # Minimal valid PDF byte blob so the uploader accepts it.
        sample = b"%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF"

    token = login(args.base, args.user, args.password)

    latencies: list[float] = []
    ok_count = 0
    t_start = time.monotonic()
    with concurrent.futures.ThreadPoolExecutor(max_workers=args.workers) as pool:
        futures = [
            pool.submit(upload_once, args.base, token, sample, f"load-{i}.pdf")
            for i in range(args.count)
        ]
        for f in concurrent.futures.as_completed(futures):
            ok, latency_ms = f.result()
            latencies.append(latency_ms)
            if ok:
                ok_count += 1
    elapsed = time.monotonic() - t_start

    print(f"uploaded: {ok_count}/{args.count} in {elapsed:.1f}s")
    if latencies:
        latencies.sort()
        print(
            "latency ms  p50={p50:.0f}  p95={p95:.0f}  p99={p99:.0f}  avg={avg:.0f}".format(
                p50=statistics.median(latencies),
                p95=latencies[int(len(latencies) * 0.95) - 1],
                p99=latencies[int(len(latencies) * 0.99) - 1],
                avg=statistics.mean(latencies),
            )
        )
    throughput = args.count / elapsed if elapsed else 0
    daily_capacity = int(throughput * 60 * 60 * 8)
    print(f"throughput: {throughput:.2f} req/s ({daily_capacity} invoices over 8h)")
    return 0 if ok_count == args.count else 2


if __name__ == "__main__":
    sys.exit(main())
