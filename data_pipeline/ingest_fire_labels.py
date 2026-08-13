import argparse
import sys
import os
import json
import httpx
import asyncio
import io
import pandas as pd
from datetime import datetime, timedelta
from pipeline_common import PipelineRunLogger, get_supabase_client, logger
import psycopg2
from psycopg2.extras import execute_values

FIRMS_MAP_KEY = os.environ.get("FIRMS_MAP_KEY")
DB_URL = os.environ.get("SUPABASE_DB_URL", "postgresql://postgres.cxbnxqvpyansdabjteuv:REDACTED_DB_PASSWORD@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres")

async def fetch_firms_chunk(client, start_date_str, days):
    # northern_california_pilot bbox: -124.0, 38.0, -120.0, 42.0
    url = f"https://firms.modaps.eosdis.nasa.gov/api/area/csv/{FIRMS_MAP_KEY}/VIIRS_SNPP_SP/-124,38,-120,42/{days}/{start_date_str}"
    try:
        r = await client.get(url, timeout=60.0)
        r.raise_for_status()
        return r.text
    except Exception as e:
        logger.warning(f"FIRMS fetch failed for {start_date_str}: {e}")
        return ""

async def process_fire_labels_async(region: str, start_date: str, end_date: str):
    if not FIRMS_MAP_KEY:
        logger.warning("FIRMS_MAP_KEY not found in environment. Cannot fetch real historical fire data. Skipping.")
        return 0
        
    start_dt = datetime.strptime(start_date, "%Y-%m-%d")
    end_dt = datetime.strptime(end_date, "%Y-%m-%d")
    
    current_dt = start_dt
    tasks = []
    
    async with httpx.AsyncClient() as client:
        while current_dt <= end_dt:
            # FIRMS API allows max 5 days for VIIRS_SNPP_SP
            chunk_end = current_dt + timedelta(days=4)
            if chunk_end > end_dt:
                chunk_end = end_dt
            
            days = (chunk_end - current_dt).days + 1
            tasks.append(fetch_firms_chunk(client, current_dt.strftime("%Y-%m-%d"), days))
            current_dt = chunk_end + timedelta(days=1)
            
        print(f"Fetching {len(tasks)} chunks from NASA FIRMS...")
        results = []
        for i in range(0, len(tasks), 5):
            batch = tasks[i:i+5]
            batch_results = await asyncio.gather(*batch)
            results.extend(batch_results)
            await asyncio.sleep(1.0)
            
    all_dfs = []
    for csv_text in results:
        if "latitude" in csv_text:
            try:
                df = pd.read_csv(io.StringIO(csv_text))
                all_dfs.append(df)
            except Exception:
                pass
        elif "Invalid" in csv_text or "Error" in csv_text:
            raise RuntimeError(f"FIRMS API returned error: {csv_text.strip()}")
            
    if not all_dfs:
        raise RuntimeError("No fire data retrieved. Verify MAP_KEY and date ranges.")
        
    master_df = pd.concat(all_dfs, ignore_index=True)
    if 'confidence' in master_df.columns:
        master_df = master_df[master_df['confidence'].isin(['n', 'h'])]
        
    print(f"Retrieved {len(master_df)} valid fire detection points.")
    
    conn = psycopg2.connect(DB_URL)
    cur = conn.cursor()
    
    # Delete the mock/existing data to prevent duplication
    cur.execute("DELETE FROM fire_events WHERE source = 'NASA_FIRMS_VIIRS'")
    
    cur.execute("""
        CREATE TEMP TABLE temp_firms (
            lat numeric,
            lon numeric,
            acq_date date
        )
    """)
    
    values = [(row['latitude'], row['longitude'], row['acq_date']) for _, row in master_df.iterrows()]
    execute_values(cur, "INSERT INTO temp_firms (lat, lon, acq_date) VALUES %s", values)
    
    # Map to grid cells and insert into fire_events
    cur.execute("""
        INSERT INTO fire_events (grid_cell_id, ignition_date, source)
        SELECT DISTINCT
            g.id,
            t.acq_date,
            'NASA_FIRMS_VIIRS'
        FROM temp_firms t
        JOIN grid_cells g ON ST_Contains(g.cell_geom, ST_SetSRID(ST_MakePoint(t.lon, t.lat), 4326))
        WHERE g.region = %s
        ON CONFLICT DO NOTHING
        RETURNING id;
    """, (region,))
    
    inserted = len(cur.fetchall())
    conn.commit()
    conn.close()
    
    print(f"Mapped and inserted {inserted} fire events into grid cells.")
    return inserted

def process_fire_labels(region: str, start_date: str, end_date: str):
    return asyncio.run(process_fire_labels_async(region, start_date, end_date))

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--region", required=True)
    parser.add_argument("--start-date", required=True)
    parser.add_argument("--end-date", required=True)
    args = parser.parse_args()

    run_logger = PipelineRunLogger("ingest_fire_labels", "NASA FIRMS")
    run_logger.start(details={"region": args.region, "start_date": args.start_date, "end_date": args.end_date})

    try:
        rows = process_fire_labels(args.region, args.start_date, args.end_date)
        run_logger.finish("success", rows_written=rows)
        print(json.dumps({"status": "success", "pipeline": "ingest_fire_labels", "rows_written": rows}))
    except Exception as e:
        logger.error(f"Failed: {e}")
        run_logger.finish("failed", error_message=str(e))
        print(json.dumps({"status": "failed", "error": str(e)}))
        sys.exit(1)
