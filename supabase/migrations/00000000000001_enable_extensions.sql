-- Enable PostGIS for geometry/geography types & spatial queries
create extension if not exists postgis schema extensions;

-- Enable pgvector for future embedding search
create extension if not exists vector schema extensions;

-- Enable pg_cron for scheduled jobs
-- Note: pg_cron must be enabled in the pg_catalog schema in some environments, but Supabase standardly puts extensions in extensions or public.
create extension if not exists pg_cron schema extensions;

-- Enable pg_net for HTTP calls from cron/triggers to Edge Functions
create extension if not exists pg_net schema extensions;
