"""Recreate the training_export_v1_data materialized view at FULL population.

CRITICAL CHANGE vs the previous version:
  The old view applied a 1:9 negative:positive sampling INSIDE the view via
  `ORDER BY random() LIMIT count*9`. That artificially rebalanced the data and
  made val/test prevalence wrong (~9.64% instead of the true ~0.18%).

  New rule (matches migration 00000000000016_update_view.sql):
    - The view contains the FULL grid-day population: one row per
      (grid_cell_id, target_date) with a real has_fire label (0/1).
    - No negative sampling anywhere in the view.
    - Any class balancing (e.g. 1:9 downsample) is applied downstream at the
      SPLIT level (make_splits.py) so that val/test keep true prevalence and
      only train is downsampled.

Run from the repo root:
    python scratch/fix_view.py          # uses SUPABASE_DB_PASSWORD from env

Timeout robustness:
  The pooler (port 6543, transaction mode) does NOT reliably carry a session
  `SET statement_timeout` to the connection that runs the heavy statement, so
  we pass `options=-c statement_timeout=0` at connect time (applied before any
  statement). The build is also resumable: we create the view WITH NO DATA
  (instant), add the unique index, then REFRESH CONCURRENTLY. If a refresh is
  interrupted, re-running this script only rebuilds the data — the view never
  disappears.
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "data_pipeline"))
from pipeline_common import get_db_url

import psycopg2

VIEW_SQL = """
CREATE MATERIALIZED VIEW public.training_export_v1_data AS
SELECT
    g.id AS grid_cell_id,
    g.region,
    g.cell_geom,
    s.elevation_m,
    s.slope_deg,
    s.aspect_deg,
    s.land_cover_class,
    s.fuel_type,
    w.ts AS target_date,
    avg(w2.temperature_c) AS temp_14d_avg,
    avg(w2.humidity_pct) AS humidity_14d_avg,
    avg(w2.wind_speed_ms) AS wind_speed_14d_avg,
    sum(w2.precip_mm) AS precip_14d_sum,
    avg(w2.wind_gusts_ms) AS wind_gusts_14d_avg,
    avg(w2.soil_moisture) AS soil_moisture_14d_avg,
    avg(w2.drought_index) AS drought_index_14d_avg,
    jsonb_agg(
        jsonb_build_object(
            'ts', w2.ts,
            'temperature_c', w2.temperature_c,
            'humidity_pct', w2.humidity_pct,
            'wind_speed_ms', w2.wind_speed_ms,
            'precip_mm', w2.precip_mm,
            'wind_gusts_ms', w2.wind_gusts_ms,
            'soil_moisture', w2.soil_moisture,
            'drought_index', w2.drought_index
        ) ORDER BY w2.ts ASC
    ) AS weather_14d_sequence,
    (SELECT i.storage_path
     FROM imagery_tiles i
     WHERE i.grid_cell_id = g.id AND i.capture_date <= w.ts
     ORDER BY i.capture_date DESC LIMIT 1) AS latest_imagery_path,
    CASE WHEN EXISTS (
        SELECT 1 FROM fire_events f
        WHERE f.grid_cell_id = g.id AND date_trunc('day', f.ignition_date) = date_trunc('day', w.ts)
    ) THEN 1 ELSE 0 END AS has_fire
FROM grid_cells g
JOIN static_features s ON s.grid_cell_id = g.id
JOIN weather_series w ON w.grid_cell_id = g.id
LEFT JOIN weather_series w2 ON w2.grid_cell_id = g.id
    AND w2.ts BETWEEN w.ts - INTERVAL '14 days' AND w.ts
GROUP BY
    g.id, g.region, g.cell_geom, s.elevation_m, s.slope_deg, s.aspect_deg,
    s.land_cover_class, s.fuel_type, w.ts;
"""


def _show_timeout(cur):
    cur.execute("SHOW statement_timeout;")
    return cur.fetchone()[0].strip()

def main():
    # Session-mode pooler (port 5432) holds one backend for the whole
    # connection, so an in-session SET should persist. But Supabase's
    # Supavisor pooler hard-enforces a default statement_timeout (2min) that
    # it may refuse to raise via startup options or SET — in that case a
    # DIRECT (non-pooled) connection is required for the long REFRESH.
    conn = psycopg2.connect(get_db_url(port="5432"), connect_timeout=20, options="-c statement_timeout=0")
    conn.autocommit = True
    cur = conn.cursor()

    # Attempt 1: startup option already sent. Attempt 2: session SET.
    cur.execute("SET statement_timeout = 0;")
    st = _show_timeout(cur)
    print("  session statement_timeout =", st)
    if st != "0":
        print("ERROR: pooler keeps statement_timeout non-zero; client cannot override.")
        conn.close()
        sys.exit(2)

    print("STEP 1: Drop existing materialized view (if any)")
    cur.execute("DROP MATERIALIZED VIEW IF EXISTS public.training_export_v1_data CASCADE;")
    print("  dropped.")

    print("STEP 2: Create EMPTY materialized view (WITH NO DATA — instant)")
    cur.execute(VIEW_SQL.rstrip().rstrip(";") + " WITH NO DATA;")
    print("  empty shell created.")

    print("STEP 3: Unique index (required for REFRESH CONCURRENTLY)")
    cur.execute("CREATE UNIQUE INDEX ON public.training_export_v1_data (grid_cell_id, target_date);")
    print("  index created.")

    print("STEP 4: Build full population (REFRESH, timeout disabled — may take minutes)")
    # First population MUST use a plain REFRESH — REFRESH CONCURRENTLY errors
    # with "cannot be used when the materialized view is not populated".
    # CONCURRENTLY is only valid for subsequent refreshes after the view has
    # data (and would need the unique index, which we created in STEP 3).
    cur.execute("REFRESH MATERIALIZED VIEW public.training_export_v1_data;")
    print("  view populated.")

    print("STEP 5: Grants")
    cur.execute("REVOKE ALL ON public.training_export_v1_data FROM public, anon, authenticated;")
    cur.execute("GRANT ALL ON public.training_export_v1_data TO service_role;")
    print("  grants applied.")

    print("STEP 6: Refresh counts to confirm full population")
    cur.execute("SELECT count(*) FROM public.training_export_v1_data;")
    total = cur.fetchone()[0]
    cur.execute("SELECT count(*) FROM public.training_export_v1_data WHERE has_fire = 1;")
    pos = cur.fetchone()[0]
    print(f"RESULT: view total rows    = {total}")
    print(f"RESULT: view positive rows = {pos}")
    if total > 0:
        print(f"RESULT: view positive rate = {100*pos/total:.4f}%")

    conn.close()


if __name__ == "__main__":
    main()
