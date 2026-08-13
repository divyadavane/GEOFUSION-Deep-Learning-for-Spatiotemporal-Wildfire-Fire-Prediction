create table if not exists weather_series (
    id bigint generated always as identity primary key,
    grid_cell_id bigint not null references grid_cells(id) on delete cascade,
    ts timestamptz not null,
    temperature_c numeric,
    humidity_pct numeric,
    wind_speed_ms numeric,
    wind_dir_deg numeric,
    precip_mm numeric,
    drought_index numeric,
    source text not null,
    unique (grid_cell_id, ts, source)
);

create index if not exists weather_series_grid_cell_id_ts_idx on weather_series using btree(grid_cell_id, ts);

alter table weather_series enable row level security;
