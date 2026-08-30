-- 00000000000023_get_available_regions.sql

drop function if exists public.get_available_regions();

create or replace function public.get_available_regions()
returns table (
    region_id text,
    name text,
    cell_count bigint,
    extent_wkt text
)
language sql
security definer
as $$
    select
        g.region as region_id,
        case 
            when g.region = 'northern_california_pilot' then 'Northern California Pilot'
            when g.region = 'sierra_nevada' then 'Sierra Nevada Foothills'
            when g.region = 'socal_coastal' then 'Southern California Coastal'
            else initcap(replace(g.region, '_', ' '))
        end as name,
        count(*)::bigint as cell_count,
        extensions.st_astext(extensions.st_extent(g.cell_geom)) as extent_wkt
    from public.grid_cells g
    group by g.region
    order by (case when g.region = 'northern_california_pilot' then 0 else 1 end), g.region;
$$;

grant execute on function public.get_available_regions() to anon, authenticated, service_role;
