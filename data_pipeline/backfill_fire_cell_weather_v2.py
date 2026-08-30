"""
backfill_fire_cell_weather_v2.py — Resumable weather backfill for fire-event cells.

Approved plan (2026-08-14):
  - Target: all fire-event cells currently lacking ANY weather_series rows (2,266 as of last audit).
  - Window: 2015-01-01 -> 2021-12-31 (matches the full validated export window).
  - Source: Open-Meteo archive API, UTC noon timestamps, source='Open-Meteo ERA5 (backfill)'.
  - Batching: 5 concurrent requests per batch, 2s sleep between batches (respects free tier).
  - Resumability: local checkpoint file of completed cell ids + idempotent ON CONFLICT upsert.
  - Connection: direct host by default (db.<ref>.supabase.co:5432) with sslmode=require,
    avoiding the pooler transaction-mode statement_timeout; password via SUPABASE_DB_PASSWORD.

Usage:
  set SUPABASE_DB_PASSWORD=<password>
  python data_pipeline/backfill_fire_cell_weather_v2.py
"""
import asyncio
import json
import os
import sys
from datetime import date

import httpx
import psycopg2
from psycopg2.extras import execute_values

from pipeline_common import get_db_url, logger

START_DATE = "2015-01-01"
END_DATE = "2021-12-31"
OPEN_METEO_URL = "https://archive-api.open-meteo.com/v1/archive"
BATCH = 5
SLEEP_S = 2.0
CHECKPOINT = os.path.join(os.path.dirname(__file__), ".weather_backfill_checkpoint.json")
DIRECT_HOST = "aws-0-ap-southeast-1.pooler.supabase.com"
DIRECT_PORT = "5432"
REGION = "northern_california_pilot"


def load_checkpoint() -> set:
    if os.path.exists(CHECKPOINT):
        try:
            with open(CHECKPOINT, "r", encoding="utf-8") as fh:
                return set(json.load(fh))
        except Exception as e:
            logger.warning(f"Could not read checkpoint, starting fresh: {e}")
    return set()


def save_checkpoint(done: set):
    with open(CHECKPOINT, "w", encoding="utf-8") as fh:
        json.dump(sorted(done), fh)


async def fetch_weather(client: httpx.AsyncClient, lat: float, lon: float, max_retries: int = 6):
    params = {
        "latitude": lat,
        "longitude": lon,
        "start_date": START_DATE,
        "end_date": END_DATE,
        "daily": [
            "temperature_2m_max",
            "temperature_2m_mean",
            "precipitation_sum",
            "wind_speed_10m_max",
            "wind_direction_10m_dominant",
            "relative_humidity_2m_mean",
            "soil_moisture_0_to_7cm_mean",
            "wind_gusts_10m_max",
        ],
        "timezone": "UTC",
    }
    for attempt in range(max_retries):
        try:
            r = await client.get(OPEN_METEO_URL, params=params, timeout=30.0)
            if r.status_code == 429:
                wait = 10.0 * (2 ** attempt) + (attempt * 5.0)
                logger.warning(
                    f"429 rate limit for ({lat:.4f},{lon:.4f}) attempt {attempt+1}/{max_retries}; "
                    f"backing off {wait:.0f}s"
                )
                await asyncio.sleep(wait)
                continue
            r.raise_for_status()
            return r.json()
        except httpx.HTTPStatusError:
            return None
        except Exception as e:
            logger.warning(f"Open-Meteo fetch failed for ({lat:.4f},{lon:.4f}): {e}")
            return None
    logger.warning(f"Giving up on ({lat:.4f},{lon:.4f}) after {max_retries} attempts (429).")
    return None


def build_upsert_rows(cell_id: int, weather_json: dict) -> list:
    daily = weather_json.get("daily", {})
    dates = daily.get("time", [])
    rows = []
    for i, date_str in enumerate(dates):
        def sf(v, default=0.0):
            return float(v) if v is not None else default
        rows.append((
            cell_id,
            f"{date_str}T12:00:00Z",
            sf(daily.get("temperature_2m_mean", [])[i] if i < len(daily.get("temperature_2m_mean", [])) else None),
            sf(daily.get("relative_humidity_2m_mean", [])[i] if i < len(daily.get("relative_humidity_2m_mean", [])) else None),
            sf(daily.get("wind_speed_10m_max", [])[i] if i < len(daily.get("wind_speed_10m_max", [])) else None),
            sf(daily.get("wind_direction_10m_dominant", [])[i] if i < len(daily.get("wind_direction_10m_dominant", [])) else None),
            sf(daily.get("precipitation_sum", [])[i] if i < len(daily.get("precipitation_sum", [])) else None),
            sf(daily.get("soil_moisture_0_to_7cm_mean", [])[i] if i < len(daily.get("soil_moisture_0_to_7cm_mean", [])) else None),
            "Open-Meteo ERA5 (backfill)",
        ))
    return rows


def build_db_url():
    host = os.environ.get("SUPABASE_DB_HOST") or DIRECT_HOST
    port = os.environ.get("SUPABASE_DB_PORT") or DIRECT_PORT
    url = get_db_url(port=port)
    # Force SSL for the direct connection (Supabase requires it); pooler overrides can skip.
    sslmode = os.environ.get("SUPABASE_DB_SSLMODE", "require")
    sep = "&" if "?" in url else "?"
    return f"{url}{sep}sslmode={sslmode}"


async def main():
    conn = psycopg2.connect(build_db_url())
    cur = conn.cursor()

    print("Fetching fire-event cells without weather...")
    cur.execute("""
        SELECT DISTINCT
            g.id,
            ST_Y(g.centroid::geometry) AS lat,
            ST_X(g.centroid::geometry) AS lon
        FROM fire_events f
        JOIN grid_cells g ON g.id = f.grid_cell_id
        WHERE g.id NOT IN (SELECT DISTINCT grid_cell_id FROM weather_series)
        ORDER BY g.id
    """)
    cells = cur.fetchall()
    print(f"  {len(cells)} fire-event cells lack weather.")

    done = load_checkpoint()
    todo = [(cid, lat, lon) for (cid, lat, lon) in cells if cid not in done]
    print(f"  Already backfilled (checkpoint): {len(done)} | To process now: {len(todo)}")

    if not todo:
        print("Nothing to do.")
        conn.close()
        return

    total_rows = 0
    failed_cells = []
    start_time = datetime.now()
    print(f"Starting backfill at {start_time.isoformat()} for {len(todo)} cells...")

    async with httpx.AsyncClient() as client:
        for batch_start in range(0, len(todo), BATCH):
            batch = todo[batch_start:batch_start + BATCH]
            batch_num = batch_start // BATCH + 1
            total_batches = -(-len(todo) // BATCH)
            print(f"\nBatch {batch_num}/{total_batches}: cells {[c[0] for c in batch]}")

            tasks = [fetch_weather(client, lat, lon) for _, lat, lon in batch]
            results = await asyncio.gather(*tasks)

            all_rows = []
            ok_cells = []
            for (cell_id, lat, lon), weather_data in zip(batch, results):
                if not weather_data or "daily" not in weather_data:
                    print(f"    Failed cell {cell_id} ({lat:.4f}, {lon:.4f}) - no data returned")
                    failed_cells.append((cell_id, lat, lon))
                    continue
                cell_rows = build_upsert_rows(cell_id, weather_data)
                all_rows.extend(cell_rows)
                ok_cells.append(cell_id)

            if all_rows:
                query = """
                    INSERT INTO weather_series
                        (grid_cell_id, ts, temperature_c, humidity_pct,
                         wind_speed_ms, wind_dir_deg, precip_mm, drought_index, source)
                    VALUES %s
                    ON CONFLICT (grid_cell_id, ts, source) DO NOTHING
                """
                execute_values(cur, query, all_rows)
                conn.commit()
                total_rows += len(all_rows)
                print(f"    Committed {len(all_rows)} rows for {len(ok_cells)} cells (Total so far: {total_rows:,})")

            done.update(ok_cells)
            save_checkpoint(done)

            await asyncio.sleep(SLEEP_S)

    end_time = datetime.now()
    duration = end_time - start_time
    minutes, seconds = divmod(duration.total_seconds(), 60)

    print("\n" + "=" * 60)
    print("BACKFILL SUMMARY")
    print("=" * 60)
    print(f"Start Time:     {start_time.strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"End Time:       {end_time.strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"Total Runtime:  {int(minutes)}m {int(seconds)}s ({duration.total_seconds():.1f}s)")
    print(f"Rows Inserted:  {total_rows:,}")
    print(f"Failed Cells:   {len(failed_cells)}")
    if failed_cells:
        print("  Failed cell IDs:", [f[0] for f in failed_cells])

    cur.execute("""
        SELECT COUNT(DISTINCT f.grid_cell_id)
        FROM fire_events f
        WHERE f.grid_cell_id NOT IN (SELECT DISTINCT grid_cell_id FROM weather_series)
    """)
    remaining = cur.fetchone()[0]
    print(f"Remaining fire-event cells without weather: {remaining}")
    print("=" * 60)

    conn.close()


if __name__ == "__main__":
    from datetime import datetime
    asyncio.run(main())
