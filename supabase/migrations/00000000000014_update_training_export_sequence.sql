-- 00000000000014_update_training_export_sequence.sql

-- 1. Drop the existing views
DROP VIEW IF EXISTS public.training_export_v1;
DROP MATERIALIZED VIEW IF EXISTS public.training_export_v1_data;

-- 2. Recreate the materialized view with sequence arrays instead of simple averages
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
    
    -- 14-day trailing aggregations (preserved for Baseline A XGBoost)
    avg(w2.temperature_c) AS temp_14d_avg,
    avg(w2.humidity_pct) AS humidity_14d_avg,
    avg(w2.wind_speed_ms) AS wind_speed_14d_avg,
    sum(w2.precip_mm) AS precip_14d_sum,
    
    -- NEW: 14-day sequence array for Baseline B (LSTM)
    -- We aggregate the last 14 days of weather into a single JSONB array ordered by date
    jsonb_agg(
        jsonb_build_object(
            'ts', w2.ts,
            'temperature_c', w2.temperature_c,
            'humidity_pct', w2.humidity_pct,
            'wind_speed_ms', w2.wind_speed_ms,
            'precip_mm', w2.precip_mm
        ) ORDER BY w2.ts ASC
    ) AS weather_14d_sequence,

    -- latest imagery (subquery)
    (SELECT i.storage_path 
     FROM imagery_tiles i 
     WHERE i.grid_cell_id = g.id AND i.capture_date <= w.ts 
     ORDER BY i.capture_date DESC LIMIT 1) AS latest_imagery_path,
     
    -- fire label
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

-- Recreate index
CREATE UNIQUE INDEX ON public.training_export_v1_data (grid_cell_id, target_date);

-- Re-apply RLS and Grants
REVOKE ALL ON public.training_export_v1_data FROM public, anon, authenticated;
GRANT ALL ON public.training_export_v1_data TO service_role;

CREATE VIEW public.training_export_v1
WITH (security_barrier = true)
AS SELECT * FROM public.training_export_v1_data
WHERE current_user_role() IN ('researcher', 'admin', 'service_role');

GRANT SELECT ON public.training_export_v1 TO anon, authenticated, service_role;
