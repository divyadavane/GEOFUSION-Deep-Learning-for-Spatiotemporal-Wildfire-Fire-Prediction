import os
import sys
import pandas as pd
from supabase import create_client

SUPABASE_URL = os.environ.get("SUPABASE_URL", "https://cxbnxqvpyansdabjteuv.supabase.co")
SUPABASE_ANON_KEY = os.environ.get("SUPABASE_ANON_KEY", "dummy")

import os
import sys
import pandas as pd
import psycopg2
import json
import datetime

SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_ANON_KEY = os.environ.get("SUPABASE_ANON_KEY")

# Hardcoding connection for this environment fix
DB_URL = 'postgresql://postgres.cxbnxqvpyansdabjteuv:REDACTED_DB_PASSWORD@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres'

def export_training_data():
    print("Authenticating as researcher via direct DB session...")
    
    try:
        conn = psycopg2.connect(DB_URL)
        # Use a server-side cursor to prevent memory/SSL timeout issues on large datasets
        cur = conn.cursor('export_cursor')
        
        print("Fetching training export data (bypassing PostgREST 1000-row limit)...")
        cur.execute("""
            SELECT 
                grid_cell_id, region, ST_AsText(cell_geom) as cell_geom, elevation_m, slope_deg, 
                aspect_deg, land_cover_class, fuel_type, target_date, temp_14d_avg, 
                humidity_14d_avg, wind_speed_14d_avg, precip_14d_sum, 
                wind_gusts_14d_avg, soil_moisture_14d_avg, drought_index_14d_avg,
                weather_14d_sequence, latest_imagery_path, has_fire
            FROM public.training_export_v1_data
        """)
        
        # A server-side cursor doesn't populate description until we fetch.
        # But wait, psycopg2 does populate it if we execute a query. Let's just fetch first.
        rows = []
        batch = cur.fetchmany(10000)
        
        if not batch:
            print("No data found to export.")
            return
            
        colnames = [desc[0] for desc in cur.description]
        rows.extend(batch)
        print(f"  Fetched {len(rows)} rows so far...")
        
        while True:
            batch = cur.fetchmany(10000)
            if not batch:
                break
            rows.extend(batch)
            print(f"  Fetched {len(rows)} rows so far...")
        
        if not rows:
            print("No data found to export.")
            df = pd.DataFrame(columns=[
                "grid_cell_id", "region", "cell_geom", "elevation_m", "slope_deg", "aspect_deg",
                "land_cover_class", "fuel_type", "target_date", "temp_14d_avg", "humidity_14d_avg",
                "wind_speed_14d_avg", "precip_14d_sum", "wind_gusts_14d_avg", "soil_moisture_14d_avg", 
                "drought_index_14d_avg", "weather_14d_sequence", "latest_imagery_path", "has_fire"
            ])
        else:
            # We must parse the jsonb string for weather_14d_sequence into a list of dicts if needed,
            # or just let it remain a list/string for pandas. Parquet can store complex types (arrays of structs) 
            # if we convert jsonb strings to python objects.
            df = pd.DataFrame(rows, columns=colnames)
            # Convert stringified JSON to python objects so it saves to Parquet as structured lists
            df["weather_14d_sequence"] = df["weather_14d_sequence"].apply(
                lambda x: json.dumps(x) if x is not None else None
            )
            
        conn.close()
    except Exception as e:
        print(f"Database error: {e}")
        sys.exit(1)
        
    os.makedirs("exports", exist_ok=True)
    
    timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
    out_file = f"exports/training_export_v1_{timestamp}.parquet"
    df.to_parquet(out_file, index=False)
    
    print(f"Successfully exported {len(df)} rows to {out_file}")
    print(f"Positive labels exported: {df['has_fire'].sum()}")
    
    # Keep a symlink/copy of the latest for downstream scripts
    latest_file = "exports/training_export_v1_latest.parquet"
    df.to_parquet(latest_file, index=False)

if __name__ == "__main__":
    export_training_data()
