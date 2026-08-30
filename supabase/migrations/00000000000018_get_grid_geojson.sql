-- 00000000000018_get_grid_geojson.sql
-- Returns grid cell geometries as GeoJSON text for frontend map rendering.
-- Piggybacks on the existing "Public read access for grid_cells" RLS policy.

create or replace function get_grid_geojson(p_region text)
returns table (
    id bigint,
    geojson text
)
language sql
stable
security invoker
as $$
    select
        g.id,
        ST_AsGeoJSON(g.cell_geom)::text as geojson
    from grid_cells g
    where g.region = p_region;
$$;
