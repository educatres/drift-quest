#!/usr/bin/env python3
"""Download recent Western Pacific IBTrACS tracks and convert them to compact JSON."""

from __future__ import annotations

import csv
import io
import json
from datetime import datetime, timezone
from pathlib import Path
from urllib.request import urlopen

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "data" / "typhoons" / "ibtracs-latest.json"
URL = (
    "https://www.ncei.noaa.gov/data/"
    "international-best-track-archive-for-climate-stewardship-ibtracs/"
    "v04r01/access/csv/ibtracs.last3years.list.v04r01.csv"
)


def as_float(value: str) -> float | None:
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def main() -> None:
    with urlopen(URL, timeout=90) as response:
        text = response.read().decode("utf-8", errors="replace")

    rows = list(csv.DictReader(io.StringIO(text)))
    if rows and rows[0].get("ISO_TIME", "").strip().lower() in {"yyyy-mm-dd hh:mm:ss", "iso_time"}:
        rows = rows[1:]

    storms: dict[str, dict] = {}
    for row in rows:
        basin = (row.get("BASIN") or row.get("SUBBASIN") or "").strip()
        lat = as_float(row.get("LAT", ""))
        lon = as_float(row.get("LON", ""))
        sid = (row.get("SID") or "").strip()
        if basin != "WP" or not sid or lat is None or lon is None:
            continue
        if not (8 <= lat <= 42 and 105 <= lon <= 155):
            continue

        storm = storms.setdefault(
            sid,
            {
                "sid": sid,
                "name": (row.get("NAME") or "UNNAMED").strip(),
                "season": int(row.get("SEASON") or 0),
                "points": [],
            },
        )
        storm["points"].append(
            {
                "time": (row.get("ISO_TIME") or "").strip(),
                "lat": lat,
                "lon": lon,
                "windKt": as_float(row.get("USA_WIND", "") or row.get("WMO_WIND", "")),
                "pressureHpa": as_float(row.get("USA_PRES", "") or row.get("WMO_PRES", "")),
                "nature": (row.get("NATURE") or "").strip(),
            }
        )

    selected = sorted(storms.values(), key=lambda item: (item["season"], item["sid"]), reverse=True)[:30]
    payload = {
        "meta": {
            "source": "NOAA NCEI IBTrACS v04r01",
            "generatedAt": datetime.now(timezone.utc).isoformat(),
            "url": URL,
            "note": "Recent Western Pacific tracks prepared for custom/history levels. Fixed teaching levels use calibrated teaching tracks.",
        },
        "storms": selected,
    }
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"Wrote {OUTPUT} ({len(selected)} storms)")


if __name__ == "__main__":
    main()
