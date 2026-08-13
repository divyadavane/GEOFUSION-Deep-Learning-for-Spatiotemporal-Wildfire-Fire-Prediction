-- 1. Create the `profiles` table for role management
create table if not exists profiles (
    id uuid primary key references auth.users(id) on delete cascade,
    role text not null default 'authenticated_viewer' check (role in ('authenticated_viewer', 'researcher', 'admin')),
    created_at timestamptz default now()
);
alter table profiles enable row level security;

-- profiles RLS: user can read their own profile; only service_role can write/update roles.
create policy "Users can read own profile" on profiles for select to authenticated using (auth.uid() = id);
create policy "Service role has full access to profiles" on profiles to service_role using (true) with check (true);

-- 2. Create helper function `current_user_role()`
create or replace function current_user_role()
returns text
language sql
stable
security definer
as $$
  select coalesce(
    (select role from public.profiles where id = auth.uid()),
    'public'
  );
$$;

-- 3. Apply RLS policies to domain tables

-- grid_cells & static_features: public + authenticated can SELECT. Only service_role can INSERT/UPDATE/DELETE.
create policy "Public read access for grid_cells" on grid_cells for select using (true);
create policy "Service role write access for grid_cells" on grid_cells to service_role using (true) with check (true);

create policy "Public read access for static_features" on static_features for select using (true);
create policy "Service role write access for static_features" on static_features to service_role using (true) with check (true);


-- imagery_tiles, weather_series, fire_events: SELECT restricted to researcher/admin/service_role only.
-- INSERT/UPDATE restricted to researcher/admin/service_role; DELETE restricted to admin/service_role.
create policy "Researcher/Admin read access" on imagery_tiles for select using (current_user_role() in ('researcher', 'admin'));
create policy "Researcher/Admin insert/update access" on imagery_tiles for insert with check (current_user_role() in ('researcher', 'admin'));
create policy "Researcher/Admin update access" on imagery_tiles for update using (current_user_role() in ('researcher', 'admin')) with check (current_user_role() in ('researcher', 'admin'));
create policy "Admin delete access" on imagery_tiles for delete using (current_user_role() = 'admin');
create policy "Service role full access" on imagery_tiles to service_role using (true) with check (true);

create policy "Researcher/Admin read access" on weather_series for select using (current_user_role() in ('researcher', 'admin'));
create policy "Researcher/Admin insert/update access" on weather_series for insert with check (current_user_role() in ('researcher', 'admin'));
create policy "Researcher/Admin update access" on weather_series for update using (current_user_role() in ('researcher', 'admin')) with check (current_user_role() in ('researcher', 'admin'));
create policy "Admin delete access" on weather_series for delete using (current_user_role() = 'admin');
create policy "Service role full access" on weather_series to service_role using (true) with check (true);

create policy "Researcher/Admin read access" on fire_events for select using (current_user_role() in ('researcher', 'admin'));
create policy "Researcher/Admin insert/update access" on fire_events for insert with check (current_user_role() in ('researcher', 'admin'));
create policy "Researcher/Admin update access" on fire_events for update using (current_user_role() in ('researcher', 'admin')) with check (current_user_role() in ('researcher', 'admin'));
create policy "Admin delete access" on fire_events for delete using (current_user_role() = 'admin');
create policy "Service role full access" on fire_events to service_role using (true) with check (true);


-- predictions: SELECT open to everyone. INSERT/UPDATE/DELETE restricted to service_role only.
create policy "Public read access for predictions" on predictions for select using (true);
create policy "Service role write access for predictions" on predictions to service_role using (true) with check (true);

-- models: SELECT restricted to researcher/admin/service_role. All writes restricted to service_role only.
create policy "Researcher/Admin read access for models" on models for select using (current_user_role() in ('researcher', 'admin'));
create policy "Service role full access for models" on models to service_role using (true) with check (true);


-- 4. Policy Test Checklist
/*
POLICY TEST CHECKLIST:
1. profiles
   - authenticated_viewer: SELECT (self=allow, other=deny), INSERT/UPDATE/DELETE (deny)
   - service_role: SELECT/INSERT/UPDATE/DELETE (allow)
2. grid_cells & static_features
   - anon/public/authenticated_viewer: SELECT (allow), INSERT/UPDATE/DELETE (deny)
   - service_role: SELECT/INSERT/UPDATE/DELETE (allow)
3. imagery_tiles, weather_series, fire_events
   - anon/public/authenticated_viewer: SELECT/INSERT/UPDATE/DELETE (deny)
   - researcher: SELECT/INSERT/UPDATE (allow), DELETE (deny)
   - admin: SELECT/INSERT/UPDATE/DELETE (allow)
   - service_role: SELECT/INSERT/UPDATE/DELETE (allow)
4. predictions
   - anon/public/authenticated_viewer/researcher/admin: SELECT (allow), INSERT/UPDATE/DELETE (deny)
   - service_role: SELECT/INSERT/UPDATE/DELETE (allow)
5. models
   - anon/public/authenticated_viewer: SELECT/INSERT/UPDATE/DELETE (deny)
   - researcher/admin: SELECT (allow), INSERT/UPDATE/DELETE (deny)
   - service_role: SELECT/INSERT/UPDATE/DELETE (allow)
*/
