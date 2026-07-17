#!/usr/bin/env python3
"""Fetch a real 12-month current field from Copernicus Marine and export compact JSON.

Required environment variables:
  COPERNICUSMARINE_SERVICE_USERNAME
  COPERNICUSMARINE_SERVICE_PASSWORD

Optional:
  OCEAN_DATA_YEAR (defaults to previous UTC calendar year)
"""

from __future__ import annotations

import json
import math
import os
from datetime import datetime, timezone
from pathlib import Path

import copernicusmarine
import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "data" / "ocean" / "current-latest.json"
DATASET_ID = "cmems_mod_glo_phy-cur_anfc_0.083deg_P1M-m"
DEPTHS = [0, 10, 30, 50]
BOUNDS = {
    "minimum_longitude": 112,
    "maximum_longitude": 145,
    "minimum_latitude": 15,
    "maximum_latitude": 38,
}


def coord_name(dataset, candidates: tuple[str, ...]) -> str:
    for name in candidates:
        if name in dataset.coords or name in dataset.dims:
            return name
    raise KeyError(f"Cannot find coordinate from {candidates}; available={list(dataset.coords)}")


def nearest_indices(values: np.ndarray, target_step_degrees: float = 0.75) -> np.ndarray:
    if values.size < 2:
        return np.arange(values.size)
    native_step = float(np.median(np.abs(np.diff(values.astype(float)))))
    stride = max(1, int(round(target_step_degrees / max(native_step, 1e-6))))
    indices = np.arange(0, values.size, stride)
    if indices[-1] != values.size - 1:
        indices = np.append(indices, values.size - 1)
    return indices


def finite_or_zero(value: float) -> float:
    return round(float(value), 4) if math.isfinite(float(value)) else 0.0


def main() -> None:
    username = os.getenv("COPERNICUSMARINE_SERVICE_USERNAME")
    password = os.getenv("COPERNICUSMARINE_SERVICE_PASSWORD")
    if not username or not password:
        raise RuntimeError("Copernicus Marine credentials are missing from environment variables.")

    now = datetime.now(timezone.utc)
    year_text = os.getenv("OCEAN_DATA_YEAR", "").strip()
    year = int(year_text) if year_text else now.year - 1
    start = f"{year}-01-01"
    end = f"{year}-12-31T23:59:59"

    dataset = copernicusmarine.open_dataset(
        dataset_id=DATASET_ID,
        username=username,
        password=password,
        variables=["uo", "vo"],
        start_datetime=start,
        end_datetime=end,
        minimum_depth=0,
        maximum_depth=55,
        coordinates_selection_method="nearest",
        **BOUNDS,
    )

    lat_name = coord_name(dataset, ("latitude", "lat", "y"))
    lon_name = coord_name(dataset, ("longitude", "lon", "x"))
    depth_name = coord_name(dataset, ("depth", "depthu", "lev"))
    time_name = coord_name(dataset, ("time",))

    lat_indices = nearest_indices(dataset[lat_name].values)
    lon_indices = nearest_indices(dataset[lon_name].values)
    subset = dataset.isel({lat_name: lat_indices, lon_name: lon_indices})

    # Monthly product should already contain one value per month. Keep the nearest
    # available value for each calendar month to make the frontend month selector stable.
    time_values = pd.to_datetime(subset[time_name].values)
    month_to_time_index: dict[int, int] = {}
    for idx, timestamp in enumerate(time_values):
        month_to_time_index.setdefault(int(timestamp.month), idx)

    missing_months = sorted(set(range(1, 13)) - set(month_to_time_index))
    if missing_months:
        raise RuntimeError(f"Dataset does not contain all 12 months for {year}: missing {missing_months}")

    latitudes = [round(float(x), 4) for x in subset[lat_name].values]
    longitudes = [round(float(x), 4) for x in subset[lon_name].values]
    records: list[dict[str, float | int]] = []
    selected_depths: list[float] = []

    for requested_depth in DEPTHS:
        selected = subset.sel({depth_name: requested_depth}, method="nearest")
        selected_depths.append(round(float(selected[depth_name].values), 3))
        for month in range(1, 13):
            time_index = month_to_time_index[month]
            u_values = selected["uo"].isel({time_name: time_index}).transpose(lat_name, lon_name).load().values
            v_values = selected["vo"].isel({time_name: time_index}).transpose(lat_name, lon_name).load().values
            for lat_idx, lat in enumerate(latitudes):
                for lon_idx, lon in enumerate(longitudes):
                    records.append(
                        {
                            "month": month,
                            "depth": requested_depth,
                            "lat": lat,
                            "lon": lon,
                            "u": finite_or_zero(u_values[lat_idx, lon_idx]),
                            "v": finite_or_zero(v_values[lat_idx, lon_idx]),
                        }
                    )

    payload = {
        "meta": {
            "source": "Copernicus Marine Global Ocean Physics Analysis and Forecast",
            "datasetId": DATASET_ID,
            "dataYear": year,
            "generatedAt": now.isoformat(),
            "isReal": True,
            "region": "Western Pacific 112–145°E, 15–38°N",
            "requestedDepthsMeters": DEPTHS,
            "selectedNativeDepthsMeters": selected_depths,
            "note": "Monthly mean eastward/northward seawater velocity (uo/vo), downsampled for classroom web use.",
        },
        "grid": {
            "latitudes": latitudes,
            "longitudes": longitudes,
            "months": list(range(1, 13)),
            "depths": DEPTHS,
            "records": records,
        },
    }

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"Wrote {OUTPUT} ({len(records):,} records, real data year={year})")


if __name__ == "__main__":
    main()
