-- 00000000000013_training_export_view.sql

-- 1. Create the materialized view
-- This joins static features, rolling 14-day weather, latest imagery, and fire events.
-- Note: Phase 4 may revisit this 14-day trailing aggregation logic.
create materialized view public.training_export_v1_data as
select
    g.id as grid_cell_id,
    g.region,
    g.cell_geom,
    s.elevation_m,
    s.slope_deg,
    s.aspect_deg,
    s.land_cover_class,
    s.fuel_type,
    w.ts as target_date,
    -- 14-day trailing aggregations
    avg(w2.temperature_c) as temp_14d_avg,
    avg(w2.humidity_pct) as humidity_14d_avg,
    avg(w2.wind_speed_ms) as wind_speed_14d_avg,
    sum(w2.precip_mm) as precip_14d_sum,
    -- latest imagery (subquery)
    (select i.storage_path 
     from imagery_tiles i 
     where i.grid_cell_id = g.id and i.capture_date <= w.ts 
     order by i.capture_date desc limit 1) as latest_imagery_path,
    -- fire label
    case when exists (
        select 1 from fire_events f 
        where f.grid_cell_id = g.id and date_trunc('day', f.ignition_date) = date_trunc('day', w.ts)
    ) then 1 else 0 end as has_fire
from grid_cells g
join static_features s on s.grid_cell_id = g.id
join weather_series w on w.grid_cell_id = g.id
left join weather_series w2 on w2.grid_cell_id = g.id 
    and w2.ts between w.ts - interval '14 days' and w.ts
group by 
    g.id, g.region, g.cell_geom, s.elevation_m, s.slope_deg, s.aspect_deg, 
    s.land_cover_class, s.fuel_type, w.ts;

-- Create an index to speed up querying the materialized view
create unique index on public.training_export_v1_data (grid_cell_id, target_date);

-- 2. RLS Handling for Materialized View
-- Postgres Materialized Views do not support RLS directly.
-- We revoke direct access to the raw materialized view from the API roles.
revoke all on public.training_export_v1_data from public, anon, authenticated;
grant all on public.training_export_v1_data to service_role;

-- We create a standard view with a security barrier that enforces the exact same
-- role check as the underlying restricted tables (imagery, weather, fire).
create view public.training_export_v1
with (security_barrier = true)
as select * from public.training_export_v1_data
where current_user_role() in ('researcher', 'admin', 'service_role');

-- Grant access to the view so PostgREST exposes it. The WHERE clause protects the data.
grant select on public.training_export_v1 to anon, authenticated, service_role;

-- 3. Document the refresh strategy:
-- REFRESH MATERIALIZED VIEW CONCURRENTLY public.training_export_v1_data;
-- For Phase 3, this is manually refreshed via a script. Phase 10 will automate this via pg_cron.
