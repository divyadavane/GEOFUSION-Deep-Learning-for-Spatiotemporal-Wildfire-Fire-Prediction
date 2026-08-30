-- 00000000000019_get_risk_heatmap.sql
-- RPC Function: get_risk_heatmap(p_region, p_date, p_model_id)
-- Backend PRD Section 5.7
-- Returns risk prediction scores, confidence bounds, and grid cell geometries for a given region and forecast date.

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
      and (v_model_id is null or p.model_id = v_model_id);
end;
$$;

-- Grant execute permissions to anon and authenticated callers
grant execute on function get_risk_heatmap(text, date, bigint) to anon, authenticated, service_role;
