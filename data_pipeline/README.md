# GEOFUSION Ingestion Pipeline

This directory contains the Python ETL scripts that pull multimodal data (satellite imagery, weather, terrain, fire labels) from external APIs and push it to Supabase.

## Setup

1. Copy `.env.example` to `.env` and provide the necessary Supabase credentials and API keys.
2. Install Python dependencies:
   ```bash
   pip install -r requirements.txt
   ```

## Running Scripts Locally

You can run any script individually for a specific region and date range. For example:

```bash
python ingest_weather.py --region "California" --start-date "2023-01-01" --end-date "2023-01-07"
```

To update the static terrain features (which change rarely):
```bash
python ingest_terrain.py --region "California" --force
```

## Architecture & Scheduling

Supabase `pg_cron` cannot natively execute Python scripts. The architecture is as follows:
1. Supabase `pg_cron` is configured (in Phase 1 migrations) to periodically trigger the `ingest-webhook` Edge Function via HTTP POST.
2. The `ingest-webhook` logs the trigger in the `pipeline_runs` table and acts as a routing layer.
3. **Execution**: You must host an external scheduler (e.g. GitHub Actions, Apache Airflow, or a standard VM cron job) that actually runs these Python scripts on schedule.
4. When the Python scripts run, they write data directly to the database via the Supabase Client and update their own status in the `pipeline_runs` audit table.

## Backfilling

To backfill historical data, invoke the scripts with historical `--start-date` and `--end-date` arguments. All scripts use idempotent upserts, so they are perfectly safe to run multiple times over the same date range without creating duplicate rows.
