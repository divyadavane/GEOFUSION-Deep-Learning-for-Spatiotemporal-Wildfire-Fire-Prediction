import argparse
import sys
import json
import httpx
import asyncio
import os
from datetime import datetime, timedelta
import psycopg2
from psycopg2.extras import execute_values
from pipeline_common import PipelineRunLogger, logger

DB_URL = os.environ.get("SUPABASE_DB_URL", "postgresql://postgres.cxbnxqvpyansdabjteuv:REDACTED_DB_PASSWORD@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres")

async def search_stac(client: httpx.AsyncClient, bbox: list, target_date: str):
    # Earth Search AWS STAC API (Sentinel-2 L2A)
    # Target date is the fire ignition date. We want an image from BEFORE the fire.
    # Let's search the 30 days prior to the target_date.
    end_dt = datetime.strptime(str(target_date).split()[0], "%Y-%m-%d")
    start_dt = end_dt - timedelta(days=30)
    
    start_str = start_dt.strftime("%Y-%m-%d")
    end_str = end_dt.strftime("%Y-%m-%d")
    
    url = "https://earth-search.aws.element84.com/v1/search"
    payload = {
        "collections": ["sentinel-2-l2a"],
        "bbox": bbox,
        "datetime": f"{start_str}T00:00:00Z/{end_str}T23:59:59Z",
        "query": {
            "eo:cloud_cover": {"lt": 20}  # Filter out cloudy images
        },
        "sortby": [{"field": "properties.datetime", "direction": "desc"}], # Get the most recent one before the fire
        "limit": 1
    }
    
    try:
        response = await client.post(url, json=payload, timeout=30.0)
        response.raise_for_status()
        data = response.json()
        if data.get("features"):
            feature = data["features"][0]
            return {
                "capture_date": feature["properties"]["datetime"],
                "cloud_cover": feature["properties"].get("eo:cloud_cover", 0.0),
                "asset_url": feature["assets"].get("visual", {}).get("href", "")
            }
        return None
    except Exception as e:
        logger.error(f"STAC Search failed for bbox {bbox}: {e}")
        return None

async def process_imagery(region: str):
    conn = psycopg2.connect(DB_URL)
    cur = conn.cursor()
    
    # 1. Get grid cells that actually have fire events, and their earliest fire date
    # We also get negative cells (no fire ever) and assign them a random date in 2020 for background.
    # But for now, let's just fetch imagery for cells that exist in our final dataset.
    
    print("Fetching grid cells for imagery ingestion...")
    # Get a mix of positive and negative cells from the export view
    cur.execute("""
        SELECT DISTINCT v.grid_cell_id, v.target_date, ST_X(g.centroid::geometry) as lon, ST_Y(g.centroid::geometry) as lat
        FROM training_export_v1_data v
        JOIN grid_cells g ON g.id = v.grid_cell_id
        WHERE g.region = %s
        LIMIT 5000
    """, (region,))
    
    cells = cur.fetchall()
    
    if not cells:
        print(f"No grid cells found in training_export_v1_data for region: {region}")
        return 0

    print(f"Found {len(cells)} unique cell-date combinations. Fetching STAC metadata...")
    rows_written = 0
    
    async with httpx.AsyncClient() as client:
        batch_size = 50
        for i in range(0, len(cells), batch_size):
            batch = cells[i:i+batch_size]
            tasks = []
            
            for cell_id, target_date, lon, lat in batch:
                # roughly 10km bbox around centroid for Sentinel tile search
                bbox = [lon - 0.05, lat - 0.05, lon + 0.05, lat + 0.05]
                tasks.append(search_stac(client, bbox, str(target_date)))
                
            results = await asyncio.gather(*tasks)
            
            upsert_rows = []
            for (cell_id, target_date, lon, lat), stac_data in zip(batch, results):
                if stac_data and stac_data["asset_url"]:
                    min_lon, min_lat = lon - 0.05, lat - 0.05
                    max_lon, max_lat = lon + 0.05, lat + 0.05
                    upsert_rows.append((
                        cell_id,
                        "sentinel2",
                        stac_data["capture_date"],
                        ["B02", "B03", "B04", "B08"],
                        min_lon, min_lat, max_lon, max_lat,
                        stac_data["cloud_cover"],
                        stac_data["asset_url"]
                    ))
            
            if upsert_rows:
                try:
                    execute_values(cur, """
                        INSERT INTO imagery_tiles (grid_cell_id, source, capture_date, bands, bbox, cloud_cover_pct, storage_path)
                        VALUES %s
                        ON CONFLICT (grid_cell_id, source, capture_date) DO NOTHING
                    """, upsert_rows, template="(%s, %s, %s, %s, ST_MakeEnvelope(%s, %s, %s, %s, 4326), %s, %s)")
                    conn.commit()
                    rows_written += len(upsert_rows)
                    print(f"Inserted {len(upsert_rows)} imagery records. Total so far: {rows_written}")
                except Exception as e:
                    logger.error(f"DB Insert chunk failed: {e}")
                    conn.rollback()
                    
            await asyncio.sleep(0.5)
            
    conn.close()
    
    return rows_written

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--region", required=True)
    parser.add_argument("--start-date", required=False) # Deprecated, we use target_date from DB
    parser.add_argument("--end-date", required=False)
    args = parser.parse_args()

    run_logger = PipelineRunLogger("ingest_imagery", "Earth Search STAC")
    run_logger.start(details={"region": args.region})

    try:
        rows = asyncio.run(process_imagery(args.region))
        run_logger.finish("success", rows_written=rows)
        print(json.dumps({"status": "success", "pipeline": "ingest_imagery", "rows_written": rows}))
    except Exception as e:
        logger.error(f"Failed: {e}")
        run_logger.finish("failed", error_message=str(e))
        print(json.dumps({"status": "failed", "error": str(e)}))
        sys.exit(1)
