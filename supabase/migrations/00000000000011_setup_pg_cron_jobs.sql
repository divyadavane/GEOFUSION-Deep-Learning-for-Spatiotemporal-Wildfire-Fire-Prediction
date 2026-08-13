-- Set up pg_cron jobs to invoke the ingest-webhook Edge Function via pg_net.
-- NOTE: In a real environment, replace 'https://[PROJECT_REF].supabase.co' with your actual Supabase URL
-- and provide a valid Authorization header with the service_role key or a webhook secret.
-- For local development, this would be 'http://host.docker.internal:54321'.

-- 1. Every 6 hours: trigger weather ingestion
select cron.schedule(
  'trigger-weather-ingestion',
  '0 */6 * * *',
  $$
  select net.http_post(
      url:='https://[PROJECT_REF].supabase.co/functions/v1/ingest-webhook',
      headers:='{"Content-Type": "application/json", "Authorization": "Bearer [SERVICE_ROLE_KEY]"}'::jsonb,
      body:='{"pipeline_name": "cron_trigger", "source": "weather", "status": "running"}'::jsonb
  );
  $$
);

-- 2. Nightly at 02:00: trigger imagery ingestion sweep
select cron.schedule(
  'trigger-imagery-ingestion',
  '0 2 * * *',
  $$
  select net.http_post(
      url:='https://[PROJECT_REF].supabase.co/functions/v1/ingest-webhook',
      headers:='{"Content-Type": "application/json", "Authorization": "Bearer [SERVICE_ROLE_KEY]"}'::jsonb,
      body:='{"pipeline_name": "cron_trigger", "source": "imagery", "status": "running"}'::jsonb
  );
  $$
);

-- 3. Weekly Sunday 04:00: housekeeping placeholder
select cron.schedule(
  'weekly-housekeeping',
  '0 4 * * 0',
  $$
  -- TODO (Phase-10): Add drift-check job here.
  vacuum analyze;
  $$
);
