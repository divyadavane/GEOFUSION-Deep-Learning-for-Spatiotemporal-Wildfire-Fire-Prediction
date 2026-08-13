create table if not exists imagery_tiles (
    id bigint generated always as identity primary key,
    grid_cell_id bigint not null references grid_cells(id) on delete cascade,
    source text not null check (source in ('sentinel2','modis','viirs')),
    capture_date date not null,
    bands text[] not null,
    bbox geometry(Polygon, 4326) not null,
    storage_path text not null,
    cloud_cover_pct numeric,
    unique (grid_cell_id, source, capture_date)
);

create index if not exists imagery_tiles_bbox_idx on imagery_tiles using gist(bbox);
create index if not exists imagery_tiles_capture_date_idx on imagery_tiles using btree(capture_date);

alter table imagery_tiles enable row level security;
