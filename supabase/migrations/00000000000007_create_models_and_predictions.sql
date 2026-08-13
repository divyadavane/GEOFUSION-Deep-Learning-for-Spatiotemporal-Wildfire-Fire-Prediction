create table if not exists models (
    id bigint generated always as identity primary key,
    version text not null unique,
    architecture text not null,
    metrics jsonb,
    checkpoint_path text,
    trained_at timestamptz,
    is_active boolean not null default false
);

alter table models enable row level security;

create table if not exists predictions (
    id bigint generated always as identity primary key,
    grid_cell_id bigint not null references grid_cells(id) on delete cascade,
    model_id bigint references models(id),
    prediction_date date not null,
    risk_score numeric not null check (risk_score >= 0 and risk_score <= 1),
    confidence_low numeric,
    confidence_high numeric,
    created_at timestamptz not null default now(),
    unique (grid_cell_id, model_id, prediction_date)
);

alter table predictions enable row level security;
