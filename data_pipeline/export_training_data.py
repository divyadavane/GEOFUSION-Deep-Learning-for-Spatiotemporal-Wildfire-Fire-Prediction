import os
import sys
import httpx
import pandas as pd
import pyarrow as pa
import pyarrow.parquet as pq
from datetime import datetime

SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_SERVICE_ROLE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")

if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
    print("Error: Environment variables missing.")
    sys.exit(1)

REST_URL = f"{SUPABASE_URL}/rest/v1"
headers = {
    # Using service_role for the export script, although researcher could also be used
    # if we fetched a JWT first.
    "apikey": SUPABASE_SERVICE_ROLE_KEY,
    "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
    "Content-Type": "application/json",
    "Accept": "application/json"
}

def export_training_data():
    print("Fetching training export data...")
    # Read from the security barrier view
    with httpx.Client(base_url=REST_URL, headers=headers, timeout=120.0) as client:
        # We might need pagination for a real large dataset. For this script, we'll assume a single large pull or limit.
        response = client.get("/training_export_v1", params={"limit": 50000})
        
        if response.status_code != 200:
            print(f"Failed to fetch data: {response.text}")
            sys.exit(1)
            
        data = response.json()
        
        if not data:
            print("No data found to export.")
            # We still create an empty dataframe to verify schema
            df = pd.DataFrame(columns=[
                "grid_cell_id", "region", "cell_geom", "elevation_m", "slope_deg", "aspect_deg",
                "land_cover_class", "fuel_type", "target_date", "temp_14d_avg", "humidity_14d_avg",
                "wind_speed_14d_avg", "precip_14d_sum", "latest_imagery_path", "has_fire"
            ])
        else:
            df = pd.DataFrame(data)
            
        os.makedirs("exports", exist_ok=True)
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filepath = f"exports/training_export_v1_{timestamp}.parquet"
        
        table = pa.Table.from_pandas(df)
        pq.write_table(table, filepath)
        
        print(f"Successfully exported {len(df)} rows to {filepath}")
        
if __name__ == "__main__":
    export_training_data()
