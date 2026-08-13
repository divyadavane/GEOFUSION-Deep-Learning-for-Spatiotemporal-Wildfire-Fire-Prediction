create table if not exists pipeline_runs (
    id bigint generated always as identity primary key,
    pipeline_name text not null,
    source text not null,
    started_at timestamptz not null default now(),
    finished_at timestamptz,
    status text not null check (status in ('running', 'success', 'failed')),
    rows_written integer,
    error_message text,
    details jsonb
);

alter table pipeline_runs enable row level security;

-- service_role full access, researcher read-only, no public access
create policy "Service role full access on pipeline_runs" on pipeline_runs to service_role using (true) with check (true);
create policy "Researcher read-only on pipeline_runs" on pipeline_runs for select using (public.current_user_role() in ('researcher', 'admin'));
