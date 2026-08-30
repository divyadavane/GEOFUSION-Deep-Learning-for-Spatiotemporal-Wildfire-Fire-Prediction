"""
backfill_static_features.py

Backfills static_features rows for fire-event grid cells that currently lack them.
Uses Open-Meteo Elevation API for elevation_m; slope_deg/aspect_deg/land_cover/fuel_type
are documented gaps (no free unauthenticated API available at this stage).

Run this AFTER backfill_fire_cell_weather.py completes.
"""

import asyncio
import httpx
import psycopg2
from pipeline_common import get_db_url

DB_URL = get_db_url()
OPEN_METEO_ELEVATION_URL = "https://api.open-meteo.com/v1/elevation"

# Open-Meteo elevation API supports batched queries (up to 100 coords at once)
BATCH_SIZE = 50
SLEEP_SECS = 1.5


async def fetch_elevations_batch(client: httpx.AsyncClient, lat_list: list, lon_list: list):
    """Fetch elevation for a batch of coordinates. Returns list of elevations."""
    params = {
        "latitude": ",".join(str(x) for x in lat_list),
        "longitude": ",".join(str(x) for x in lon_list),
    }
    try:
        r = await client.get(OPEN_METEO_ELEVATION_URL, params=params, timeout=30.0)
        r.raise_for_status()
        data = r.json()
        return data.get("elevation", [None] * len(lat_list))
    except Exception as e:
        print(f"    Warning: Elevation fetch failed: {e}")
        return [None] * len(lat_list)


async def main():
    conn = psycopg2.connect(DB_URL)
    cur = conn.cursor()

    # Find fire-event cells that are missing static_features
    print("Identifying fire-event cells missing static_features...")
    cur.execute("""
        SELECT DISTINCT
            g.id,
            ST_Y(g.centroid::geometry) AS lat,
            ST_X(g.centroid::geometry) AS lon
        FROM fire_events f
        JOIN grid_cells g ON g.id = f.grid_cell_id
        WHERE g.id NOT IN (SELECT grid_cell_id FROM static_features)
        ORDER BY g.id
    """)
    missing_cells = cur.fetchall()
    print(f"  Cells needing static_features backfill: {len(missing_cells)}")

    if not missing_cells:
        print("  All fire-event cells already have static_features. Nothing to do.")
        conn.close()
        return

    total_written = 0
    async with httpx.AsyncClient() as client:
        for i in range(0, len(missing_cells), BATCH_SIZE):
            batch = missing_cells[i:i + BATCH_SIZE]
            cell_ids = [r[0] for r in batch]
            lats = [r[1] for r in batch]
            lons = [r[2] for r in batch]

            print(f"\n  Batch {i//BATCH_SIZE + 1}: {len(batch)} cells")
            elevations = await fetch_elevations_batch(client, lats, lons)

            rows = []
            for cell_id, lat, lon, elevation in zip(cell_ids, lats, lons, elevations):
                rows.append((
                    cell_id,
                    float(elevation) if elevation is not None else None,
                    None,   # slope_deg: requires DEM processing (documented gap)
                    None,   # aspect_deg: requires DEM processing (documented gap)
                    None,   # land_cover_class: no free API without auth (documented gap)
                    None,   # fuel_type: no free API without auth (documented gap)
                ))
                print(f"    cell {cell_id} ({lat:.3f},{lon:.3f}): elevation={elevation}")

            cur.executemany(
                """
                INSERT INTO static_features
                    (grid_cell_id, elevation_m, slope_deg, aspect_deg,
                     land_cover_class, fuel_type, updated_at)
                VALUES (%s, %s, %s, %s, %s, %s, now())
                ON CONFLICT (grid_cell_id) DO NOTHING
                """,
                rows,
            )
            conn.commit()
            total_written += len(rows)
            print(f"    Committed {len(rows)} static_features rows")

            await asyncio.sleep(SLEEP_SECS)

    print(f"\nStatic features backfill complete. Total rows written: {total_written}")

    # Report coverage after backfill
    cur.execute("""
        SELECT COUNT(DISTINCT f.grid_cell_id) AS with_sf
        FROM fire_events f
        WHERE f.grid_cell_id IN (SELECT grid_cell_id FROM static_features)
    """)
    covered = cur.fetchone()[0]
    cur.execute("SELECT COUNT(DISTINCT grid_cell_id) FROM fire_events")
    total = cur.fetchone()[0]
    print(f"Fire-event cells with static_features: {covered}/{total}")

    conn.close()
    print("\nDone. Next: refresh mat view if not already done, then re-export and re-split.")


if __name__ == "__main__":
    asyncio.run(main())
