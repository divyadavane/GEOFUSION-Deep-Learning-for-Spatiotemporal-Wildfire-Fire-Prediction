create table if not exists grid_cells (
    id bigint generated always as identity primary key,
    cell_geom geometry(Polygon, 4326) not null,
    centroid geography(Point, 4326) not null,
    resolution_m integer not null,
    region text not null,
    created_at timestamptz not null default now()
);

create index if not exists grid_cells_cell_geom_idx on grid_cells using gist(cell_geom);
create index if not exists grid_cells_centroid_idx on grid_cells using gist(centroid);
create index if not exists grid_cells_region_idx on grid_cells using btree(region);

alter table grid_cells enable row level security;
