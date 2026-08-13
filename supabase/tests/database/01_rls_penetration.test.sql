begin;
select plan(33);

-- Test variables
select tests.create_supabase_user('test_anon');
select tests.create_supabase_user('test_viewer');
select tests.create_supabase_user('test_researcher');
select tests.create_supabase_user('test_admin');

-- Set roles in profiles for the specific tests
insert into public.profiles (id, role) values
  ((select id from auth.users where email = 'test_viewer@supabase.io'), 'authenticated_viewer'),
  ((select id from auth.users where email = 'test_researcher@supabase.io'), 'researcher'),
  ((select id from auth.users where email = 'test_admin@supabase.io'), 'admin');

-- Helper to switch context
create or replace function set_role_context(p_role text, p_email text default null) returns void as $$
begin
  execute format('set local role %I', p_role);
  if p_email is not null then
    execute format('set local request.jwt.claims = ''{"sub": "%s"}''', (select id from auth.users where email = p_email));
  else
    execute 'set local request.jwt.claims = ''{}''';
  end if;
end;
$$ language plpgsql;

--------------------------------------------------------------------------------
-- 1. ANALYZE ANON (PUBLIC) ROLE
--------------------------------------------------------------------------------
select set_role_context('anon');

-- Can read public tables
select lives_ok('select * from grid_cells limit 1', 'Anon can read grid_cells');
select lives_ok('select * from static_features limit 1', 'Anon can read static_features');
select lives_ok('select * from predictions limit 1', 'Anon can read predictions');

-- Cannot read restricted tables
select throws_ok('select * from imagery_tiles limit 1', '42501', NULL, 'Anon cannot read imagery_tiles (Adversarial)');
select throws_ok('select * from weather_series limit 1', '42501', NULL, 'Anon cannot read weather_series');
select throws_ok('select * from fire_events limit 1', '42501', NULL, 'Anon cannot read fire_events');
select throws_ok('select * from models limit 1', '42501', NULL, 'Anon cannot read models');
select throws_ok('select * from pipeline_runs limit 1', '42501', NULL, 'Anon cannot read pipeline_runs');

-- RPCs
select lives_ok('select * from get_risk_heatmap(''california'', ''2026-08-01'')', 'Anon can call get_risk_heatmap');
select lives_ok('select * from get_cell_timeseries(1, ''2026-01-01'', ''2026-01-02'')', 'Anon can call get_cell_timeseries');
select is_empty('select * from get_active_model()', 'Anon gets empty result for get_active_model (Adversarial)');
select is_empty('select * from get_pipeline_health()', 'Anon gets empty result for get_pipeline_health (Adversarial)');

-- Cannot write anywhere
select throws_ok('insert into predictions (grid_cell_id, model_id, prediction_date, risk_score) values (1, 1, ''2026-08-01'', 0.5)', '42501', NULL, 'Anon cannot insert predictions');


--------------------------------------------------------------------------------
-- 2. ANALYZE AUTHENTICATED VIEWER ROLE
--------------------------------------------------------------------------------
select set_role_context('authenticated', 'test_viewer@supabase.io');

-- Same permissions as anon for these tables
select lives_ok('select * from grid_cells limit 1', 'Viewer can read grid_cells');
select throws_ok('select * from imagery_tiles limit 1', '42501', NULL, 'Viewer cannot read imagery_tiles');
select lives_ok('select * from get_risk_heatmap(''california'', ''2026-08-01'')', 'Viewer can call get_risk_heatmap');

-- Check get_cell_timeseries returns nulls for weather
select ok(
  (select count(*) from get_cell_timeseries(1, '2026-01-01', '2026-01-02') where temperature_c is not null) = 0,
  'Viewer sees null weather data in get_cell_timeseries'
);

--------------------------------------------------------------------------------
-- 3. ANALYZE RESEARCHER ROLE
--------------------------------------------------------------------------------
select set_role_context('authenticated', 'test_researcher@supabase.io');

-- Can read restricted tables
select lives_ok('select * from imagery_tiles limit 1', 'Researcher can read imagery_tiles');
select lives_ok('select * from weather_series limit 1', 'Researcher can read weather_series');
select lives_ok('select * from models limit 1', 'Researcher can read models');
select lives_ok('select * from pipeline_runs limit 1', 'Researcher can read pipeline_runs');

-- RPCs
select lives_ok('select * from get_active_model()', 'Researcher can call get_active_model');
select lives_ok('select * from get_pipeline_health()', 'Researcher can call get_pipeline_health');

-- Writes
-- Cannot write to models (service_role only)
select throws_ok('update models set is_active = true where id = 1', '42501', NULL, 'Researcher cannot update models (Adversarial)');

--------------------------------------------------------------------------------
-- 4. ANALYZE ADMIN ROLE
--------------------------------------------------------------------------------
select set_role_context('authenticated', 'test_admin@supabase.io');

-- Can delete from imagery_tiles
select lives_ok('delete from imagery_tiles where id = -1', 'Admin can delete from imagery_tiles');

--------------------------------------------------------------------------------
-- 5. ANALYZE SERVICE ROLE
--------------------------------------------------------------------------------
select set_role_context('service_role');

select lives_ok('insert into grid_cells (cell_geom, centroid, resolution_m, region) values (ST_GeomFromText(''POLYGON((0 0, 1 0, 1 1, 0 1, 0 0))''), ST_GeomFromText(''POINT(0.5 0.5)''), 1000, ''test'')', 'Service role can insert grid_cells');
select lives_ok('insert into models (version, architecture) values (''1.0'', ''CNN'')', 'Service role can insert models');

-- Cleanup
select tests.clear_authentication();
delete from auth.users where email like 'test_%@supabase.io';

select * from finish();
rollback;
