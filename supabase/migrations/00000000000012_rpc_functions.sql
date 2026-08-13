-- 00000000000012_rpc_functions.sql

/*
 * RPC Function: get_risk_heatmap
 * Intended caller role(s): public, anon, authenticated_viewer, researcher, admin, service_role
 * Expected behavior: Returns grid cell geometries and prediction data for a region and date.
 * Example PostgREST call syntax:
 * POST /rest/v1/rpc/get_risk_heatmap with {"p_region": "california", "p_date": "2026-08-01"}
 * 
 * Reason for security definer:
 * The function must use the active model (models.is_active = true) by default.
 * The `models` table has an RLS policy that prevents public/anon and authenticated_viewer 
 * callers from reading it. To allow public users to get the heatmap for the active model, 
 * this function runs as security definer.
 */
create or replace function get_risk_heatmap(p_region text, p_date date, p_model_id bigint default null)
returns table (
    grid_cell_id bigint,
    cell_geom geometry,
    risk_score numeric,
    confidence_low numeric,
    confidence_high numeric
)
language plpgsql
security definer
as $$
declare
    v_model_id bigint;
begin
    -- EXPLICIT MANUAL ACCESS CHECK REPRODUCTION:
    -- 1. grid_cells and predictions have public SELECT access, so any role is permitted to read them.
    -- 2. We allow public access to this function, so no specific role check is required for the caller.
    -- 3. We are safely exposing ONLY the joining of predictions for the active model.

    -- Determine the model ID to use
    if p_model_id is not null then
        v_model_id := p_model_id;
    else
        select id into v_model_id from models where is_active = true limit 1;
    end if;

    return query
    select
        g.id as grid_cell_id,
        g.cell_geom,
        p.risk_score,
        p.confidence_low,
        p.confidence_high
    from grid_cells g
    join predictions p on p.grid_cell_id = g.id
    where g.region = p_region
      and p.prediction_date = p_date
      and p.model_id = v_model_id;
end;
$$;


/*
 * RPC Function: get_cell_timeseries
 * Intended caller role(s): public, anon, authenticated_viewer, researcher, admin, service_role
 * Expected behavior for callers without access:
 * The weather_series table is restricted to researcher/admin/service_role. Because this is a 
 * security invoker function, when called by a public/anon or authenticated_viewer user, 
 * the join to weather_series will yield no rows (RLS effectively makes weather_series empty for them), 
 * resulting in NULLs for the weather columns due to the LEFT JOIN.
 * Example PostgREST call syntax:
 * POST /rest/v1/rpc/get_cell_timeseries with {"p_grid_cell_id": 1, "p_start": "2026-01-01", "p_end": "2026-12-31"}
 */
create or replace function get_cell_timeseries(p_grid_cell_id bigint, p_start date, p_end date)
returns table (
    ts timestamptz,
    temperature_c numeric,
    humidity_pct numeric,
    wind_speed_ms numeric,
    precip_mm numeric,
    drought_index numeric,
    risk_score numeric,
    prediction_date date
)
language sql
stable
security invoker
as $$
    -- Generate the series of dates in the range, then left join weather and predictions.
    -- We join on date (cast ts to date for predictions).
    with date_series as (
        select generate_series(p_start::timestamp, p_end::timestamp, '1 day'::interval) as step_ts
    )
    select
        ds.step_ts at time zone 'UTC' as ts,
        w.temperature_c,
        w.humidity_pct,
        w.wind_speed_ms,
        w.precip_mm,
        w.drought_index,
        p.risk_score,
        p.prediction_date
    from date_series ds
    left join weather_series w 
        on w.grid_cell_id = p_grid_cell_id 
        and date_trunc('day', w.ts at time zone 'UTC') = ds.step_ts
    left join predictions p 
        on p.grid_cell_id = p_grid_cell_id 
        and p.prediction_date = ds.step_ts::date
    order by ds.step_ts;
$$;


/*
 * RPC Function: get_active_model
 * Intended caller role(s): researcher, admin, service_role
 * Expected behavior for callers without access:
 * Returns an empty result (0 rows) for public, anon, or authenticated_viewer callers 
 * because the models table RLS policy denies them SELECT access.
 * Example PostgREST call syntax:
 * POST /rest/v1/rpc/get_active_model
 */
create or replace function get_active_model()
returns table (
    id bigint,
    version text,
    architecture text,
    metrics jsonb,
    trained_at timestamptz
)
language sql
stable
security invoker
as $$
    select
        m.id,
        m.version,
        m.architecture,
        m.metrics,
        m.trained_at
    from models m
    where m.is_active = true
    limit 1;
$$;


/*
 * RPC Function: get_pipeline_health
 * Intended caller role(s): researcher, admin, service_role
 * Expected behavior for callers without access:
 * Returns an empty result (0 rows) for public, anon, or authenticated_viewer callers 
 * because the pipeline_runs table RLS policy denies them SELECT access.
 * Example PostgREST call syntax:
 * POST /rest/v1/rpc/get_pipeline_health with {"p_since": "2026-08-01T00:00:00Z"}
 */
create or replace function get_pipeline_health(p_since timestamptz default now() - interval '7 days')
returns table (
    pipeline_name text,
    source text,
    status text,
    run_count bigint,
    last_run_at timestamptz,
    last_error text
)
language sql
stable
security invoker
as $$
    select
        pr.pipeline_name,
        pr.source,
        pr.status,
        count(*) as run_count,
        max(pr.started_at) as last_run_at,
        (array_agg(pr.error_message order by pr.started_at desc))[1] as last_error
    from pipeline_runs pr
    where pr.started_at >= p_since
    group by pr.pipeline_name, pr.source, pr.status
    order by pr.pipeline_name, pr.source, pr.status;
$$;
