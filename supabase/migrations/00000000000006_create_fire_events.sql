create table if not exists fire_events (
    id bigint generated always as identity primary key,
    grid_cell_id bigint not null references grid_cells(id) on delete cascade,
    ignition_date date not null,
    perimeter_geom geometry(MultiPolygon, 4326),
    area_ha numeric,
    source text not null
);

create index if not exists fire_events_perimeter_geom_idx on fire_events using gist(perimeter_geom);
create index if not exists fire_events_ignition_date_idx on fire_events using btree(ignition_date);

alter table fire_events enable row level security;
