create table if not exists static_features (
    grid_cell_id bigint primary key references grid_cells(id) on delete cascade,
    elevation_m numeric,
    slope_deg numeric,
    aspect_deg numeric,
    land_cover_class text,
    fuel_type text,
    updated_at timestamptz not null default now()
);

alter table static_features enable row level security;
