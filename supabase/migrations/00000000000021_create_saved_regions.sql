-- Migration 00000000000021_create_saved_regions.sql
-- Create saved_regions table for user-scoped bounding boxes and geometries with strict RLS

create table if not exists public.saved_regions (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    name text not null,
    description text,
    geometry geometry(Polygon, 4326),
    bbox numeric[],
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

-- Index for user-scoped queries and spatial bounding queries
create index if not exists saved_regions_user_id_idx on public.saved_regions(user_id);
create index if not exists saved_regions_geometry_idx on public.saved_regions using gist(geometry);

-- Enable Row Level Security
alter table public.saved_regions enable row level security;

-- Drop existing policies if any
drop policy if exists "Users can read own saved_regions" on public.saved_regions;
drop policy if exists "Users can insert own saved_regions" on public.saved_regions;
drop policy if exists "Users can update own saved_regions" on public.saved_regions;
drop policy if exists "Users can delete own saved_regions" on public.saved_regions;
drop policy if exists "Service role full access to saved_regions" on public.saved_regions;

-- RLS Policies scoping all read and write operations strictly to the owning user (auth.uid() = user_id)
create policy "Users can read own saved_regions"
    on public.saved_regions
    for select
    to authenticated
    using (auth.uid() = user_id);

create policy "Users can insert own saved_regions"
    on public.saved_regions
    for insert
    to authenticated
    with check (auth.uid() = user_id);

create policy "Users can update own saved_regions"
    on public.saved_regions
    for update
    to authenticated
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);

create policy "Users can delete own saved_regions"
    on public.saved_regions
    for delete
    to authenticated
    using (auth.uid() = user_id);

-- Service role bypass policy for administrative/pipeline actions
create policy "Service role full access to saved_regions"
    on public.saved_regions
    to service_role
    using (true)
    with check (true);
