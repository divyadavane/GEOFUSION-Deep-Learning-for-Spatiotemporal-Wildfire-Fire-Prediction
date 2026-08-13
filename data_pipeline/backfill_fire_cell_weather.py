import asyncio
import httpx
import psycopg2
from psycopg2.extras import execute_values

DB_URL = 'postgresql://postgres.cxbnxqvpyansdabjteuv:REDACTED_DB_PASSWORD@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres'
OPEN_METEO_URL = "https://archive-api.open-meteo.com/v1/archive"

# Date range matching the fire_events backfill window (2021-01-01 to 2021-12-31)
START_DATE = "2015-01-01"
END_DATE   = "2020-12-31"



async def fetch_weather(client: httpx.AsyncClient, lat: float, lon: float):
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
            "wind_gusts_10m_max"
        ],
        "timezone": "UTC",
    }
    try:
        r = await client.get(OPEN_METEO_URL, params=params, timeout=30.0)
        r.raise_for_status()
        return r.json()
    except Exception as e:
        print(f"    Warning: Open-Meteo fetch failed for ({lat:.4f},{lon:.4f}): {e}")
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


async def main():
    conn = psycopg2.connect(DB_URL)
    cur = conn.cursor()

    # 1. Find all grid cells with fire events
    print("Fetching fire-event grid cells...")
    cur.execute("""
        SELECT DISTINCT
            g.id,
            ST_Y(g.centroid::geometry) AS lat,
            ST_X(g.centroid::geometry) AS lon
        FROM fire_events f
        JOIN grid_cells g ON g.id = f.grid_cell_id
        ORDER BY g.id
    """)

    fire_cells = cur.fetchall()  # each row: (cell_id, lat, lon)
    print(f"  Found {len(fire_cells)} distinct grid cells with fire events")

    # We must fetch weather for the target date range for ALL fire cells, 
    # even if they already have weather data for a different year (like 2021).
    # The ON CONFLICT DO NOTHING will silently ignore duplicate days.
    cells_to_fetch = [(cid, lat, lon) for cid, lat, lon in fire_cells]
    print(f"  Cells needing weather backfill for 2015-2020: {len(cells_to_fetch)}")

    if not cells_to_fetch:
        print("  All fire-event cells already have weather data. Skipping fetch.")
    else:
        # 3. Fetch weather in batches of 20 (respect Open-Meteo free tier)
        BATCH = 5  # conservative: avoid 429 from Open-Meteo free tier
        total_rows_written = 0

        async with httpx.AsyncClient() as client:
            for batch_start in range(0, len(cells_to_fetch), BATCH):
                batch = cells_to_fetch[batch_start:batch_start + BATCH]
                print(f"\n  Batch {batch_start//BATCH + 1}: cells {[b[0] for b in batch]}")

                # batch rows are already (cell_id, lat, lon)
                decoded = batch

                # Fetch weather concurrently for this batch
                tasks = [fetch_weather(client, lat, lon) for _, lat, lon in decoded]
                results = await asyncio.gather(*tasks)

                # Build and insert rows
                all_rows = []
                for (cell_id, lat, lon), weather_data in zip(decoded, results):
                    if not weather_data or "daily" not in weather_data:
                        print(f"    Skipping cell {cell_id} (no data)")
                        continue
                    cell_rows = build_upsert_rows(cell_id, weather_data)
                    all_rows.extend(cell_rows)
                    print(f"    cell {cell_id} ({lat:.3f},{lon:.3f}): {len(cell_rows)} rows")

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
                    total_rows_written += len(all_rows)
                    print(f"    Committed {len(all_rows)} rows")

                # Rate-limit: 2 seconds between batches (Open-Meteo free tier: ~10k req/day)
                await asyncio.sleep(2.0)

        print(f"\nWeather backfill complete. Total rows written: {total_rows_written}")

    # 4. Check static_features coverage for fire-event cells
    print("\nChecking static_features coverage for fire-event cells...")
    cur.execute("""
        SELECT COUNT(DISTINCT f.grid_cell_id)
        FROM fire_events f
        WHERE f.grid_cell_id NOT IN (SELECT DISTINCT grid_cell_id FROM static_features)
    """)
    missing_sf = cur.fetchone()[0]
    print(f"  Fire-event cells still lacking static_features: {missing_sf}")
    if missing_sf > 0:
        # Show which cells are missing
        cur.execute("""
            SELECT DISTINCT f.grid_cell_id
            FROM fire_events f
            WHERE f.grid_cell_id NOT IN (SELECT DISTINCT grid_cell_id FROM static_features)
            ORDER BY f.grid_cell_id
            LIMIT 20
        """)
        missing_ids = [r[0] for r in cur.fetchall()]
        print(f"  Sample missing cell IDs: {missing_ids}")
        print("  NOTE: These cells will still be absent from training_export_v1_data")
        print("        (which requires INNER JOIN on static_features).")
        print("        Run backfill_static_features.py to fix them, or accept the gap.")

    # 5. Refresh the materialized view
    print("\nRefreshing materialized view training_export_v1_data ...")
    cur.execute("REFRESH MATERIALIZED VIEW CONCURRENTLY training_export_v1_data")
    conn.commit()
    print("  Refresh complete.")

    # 6. Report new positive label counts
    cur.execute("SELECT has_fire, COUNT(*) FROM training_export_v1_data GROUP BY has_fire ORDER BY has_fire")
    rows = cur.fetchall()
    print("\n=== MATERIALIZED VIEW: updated has_fire distribution ===")
    total = sum(r[1] for r in rows)
    for r in rows:
        print(f"  has_fire={r[0]}: count={r[1]} ({r[1]/total*100:.2f}%)")

    conn.close()
    print("\nDone. Next: run export_training_data.py → build_features.py → make_splits.py")


if __name__ == "__main__":
    asyncio.run(main())
