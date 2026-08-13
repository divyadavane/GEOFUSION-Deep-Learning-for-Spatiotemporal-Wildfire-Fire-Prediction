begin;
select plan(19);

-- 1. Check Tables and RLS
select has_table('public', 'grid_cells', 'grid_cells table exists');
select row_eq($$ select relrowsecurity from pg_class where relname = 'grid_cells' $$, ARRAY[true], 'RLS enabled on grid_cells');
select has_table('public', 'imagery_tiles', 'imagery_tiles table exists');
select row_eq($$ select relrowsecurity from pg_class where relname = 'imagery_tiles' $$, ARRAY[true], 'RLS enabled on imagery_tiles');
select has_table('public', 'weather_series', 'weather_series table exists');
select row_eq($$ select relrowsecurity from pg_class where relname = 'weather_series' $$, ARRAY[true], 'RLS enabled on weather_series');
select has_table('public', 'static_features', 'static_features table exists');
select row_eq($$ select relrowsecurity from pg_class where relname = 'static_features' $$, ARRAY[true], 'RLS enabled on static_features');
select has_table('public', 'fire_events', 'fire_events table exists');
select row_eq($$ select relrowsecurity from pg_class where relname = 'fire_events' $$, ARRAY[true], 'RLS enabled on fire_events');
select has_table('public', 'models', 'models table exists');
select row_eq($$ select relrowsecurity from pg_class where relname = 'models' $$, ARRAY[true], 'RLS enabled on models');
select has_table('public', 'predictions', 'predictions table exists');
select row_eq($$ select relrowsecurity from pg_class where relname = 'predictions' $$, ARRAY[true], 'RLS enabled on predictions');
select has_table('public', 'profiles', 'profiles table exists');
select row_eq($$ select relrowsecurity from pg_class where relname = 'profiles' $$, ARRAY[true], 'RLS enabled on profiles');

-- 2. Storage Buckets
select ok(
  (select count(*) = 4 from storage.buckets where name in ('imagery-raw', 'imagery-processed', 'model-checkpoints', 'exports') and public = false),
  'Four private storage buckets exist'
);

-- 3. PostGIS Extension
select ok(
  ST_Intersects(ST_GeomFromText('POINT(0 0)'), ST_GeomFromText('POLYGON((-1 -1, 1 -1, 1 1, -1 1, -1 -1))')),
  'PostGIS ST_Intersects works'
);

-- 4. Check Policies (Sample)
select policies_are('public', 'grid_cells', ARRAY['Public read access for grid_cells', 'Service role write access for grid_cells']);

select * from finish();
rollback;
