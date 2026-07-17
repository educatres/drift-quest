#!/usr/bin/env python3
"""Generate the bundled teaching current field used before Copernicus data is configured."""

from __future__ import annotations

import json
import math
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "data" / "ocean" / "current-latest.json"


def vector(lat: float, lon: float, depth: int, month: int) -> tuple[float, float]:
    season = math.sin(((month - 4) / 12) * math.pi * 2)
    winter = math.cos(((month - 1) / 12) * math.pi * 2)
    depth_factor = max(0.3, 1 - depth / 95)

    axis_lon = 121.5 + max(0, lat - 19) * 0.72
    distance_axis = lon - axis_lon
    kurosio = 1.05 * math.exp(-(distance_axis**2) / 3.8) * depth_factor
    u = kurosio * (0.25 + max(0, lat - 22) * 0.028)
    v = kurosio * (0.88 - max(0, lat - 29) * 0.045)

    in_strait = math.exp(-((lon - 119.4) ** 2) / 2.4) * math.exp(-((lat - 23.8) ** 2) / 13)
    v += in_strait * (0.48 * season - 0.34 * winter) * depth_factor
    u += in_strait * (0.08 * season)

    eddy_x = lon - 127.5
    eddy_y = lat - 25.5
    eddy_r = max(1.2, eddy_x**2 + eddy_y**2)
    eddy = 0.28 * math.exp(-eddy_r / 16) * (1 - depth / 120)
    u += -eddy_y / math.sqrt(eddy_r) * eddy
    v += eddy_x / math.sqrt(eddy_r) * eddy

    u += 0.07 * math.sin((lat - 18) / 4) + 0.03 * season
    v += 0.035 * math.cos((lon - 120) / 4)

    rotation = (depth / 50) * 0.22
    cos_r = math.cos(rotation)
    sin_r = math.sin(rotation)
    return u * cos_r - v * sin_r, u * sin_r + v * cos_r


def float_range(start: float, stop: float, step: float) -> list[float]:
    values: list[float] = []
    current = start
    while current <= stop + 1e-9:
        values.append(round(current, 3))
        current += step
    return values


def main() -> None:
    latitudes = float_range(15, 38, 1.0)
    longitudes = float_range(112, 145, 1.0)
    depths = [0, 10, 30, 50]
    months = list(range(1, 13))

    records = []
    for month in months:
        for depth in depths:
            for lat in latitudes:
                for lon in longitudes:
                    u, v = vector(lat, lon, depth, month)
                    records.append(
                        {
                            "month": month,
                            "depth": depth,
                            "lat": lat,
                            "lon": lon,
                            "u": round(u, 4),
                            "v": round(v, 4),
                        }
                    )

    payload = {
        "meta": {
            "source": "內建教學洋流場（簡化模型）",
            "generatedAt": datetime.now(timezone.utc).isoformat(),
            "isReal": False,
            "region": "Western Pacific 112–145°E, 15–38°N",
            "note": "用於遊戲預覽與離線備援；設定 Copernicus Marine Secrets 後會由真實資料取代。",
        },
        "grid": {
            "latitudes": latitudes,
            "longitudes": longitudes,
            "months": months,
            "depths": depths,
            "records": records,
        },
    }

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"Wrote {OUTPUT} ({len(records):,} records)")


if __name__ == "__main__":
    main()
