import argparse
import sys
import json
import httpx
import asyncio
from datetime import datetime
from pipeline_common import PipelineRunLogger, get_supabase_client, upsert_with_retry, logger

async def search_stac(client: httpx.AsyncClient, bbox: list, start_date: str, end_date: str):
    # Earth Search AWS STAC API (Sentinel-2 L2A)
    # bbox: [min_lon, min_lat, max_lon, max_lat]
    url = "https://earth-search.aws.element84.com/v1/search"
    payload = {
        "collections": ["sentinel-2-l2a"],
        "bbox": bbox,
        "datetime": f"{start_date}T00:00:00Z/{end_date}T23:59:59Z",
        "limit": 1
    }
    
    try:
        response = await client.post(url, json=payload)
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
        logger.error(f"STAC Search failed: {e}")
        return None

async def process_imagery(region: str, start_date: str, end_date: str):
    supabase = get_supabase_client()
    # Need cell_geom to get a bbox. For simplicity, we assume centroid is enough to make a small bbox,
    # or we can parse the cell_geom. We'll parse centroid and make a 0.1 deg bbox.
    res = supabase.table("grid_cells").select("id, centroid").eq("region", region).execute()
    
    if not res.data:
        raise ValueError(f"No grid cells found for region: {region}")

    rows_written = 0
    
    async with httpx.AsyncClient(timeout=30.0) as client:
        batch_size = 20
        for i in range(0, len(res.data), batch_size):
            batch = res.data[i:i+batch_size]
            tasks = []
            valid_cells = []
            
            for cell in batch:
                wkt = cell.get("centroid", "")
                if wkt.startswith("POINT"):
                    try:
                        coords = wkt.replace("POINT(", "").replace(")", "").split(" ")
                        lon, lat = float(coords[0]), float(coords[1])
                        # roughly 10km bbox around centroid
                        bbox = [lon - 0.05, lat - 0.05, lon + 0.05, lat + 0.05]
                        tasks.append(search_stac(client, bbox, start_date, end_date))
                        valid_cells.append(cell["id"])
                    except Exception as e:
                        logger.error(f"Error parsing WKT {wkt}: {e}")
                        continue
                        
            if not tasks:
                continue
                
            results = await asyncio.gather(*tasks)
            
            upsert_payloads = []
            for cell_id, stac_data in zip(valid_cells, results):
                if stac_data is None:
                    continue
                    
                payload = {
                    "grid_cell_id": cell_id,
                    "source": "Sentinel-2 (Earth Search)",
                    "capture_date": stac_data["capture_date"],
                    "bands": ["B02", "B03", "B04", "B08"], # typical visible + NIR
                    "cloud_cover_pct": float(stac_data["cloud_cover"]),
                    "storage_path": stac_data["asset_url"] # We store the remote STAC asset URL
                }
                upsert_payloads.append(payload)
            
            if upsert_payloads:
                try:
                    upsert_with_retry(supabase, "imagery_tiles", upsert_payloads)
                    rows_written += len(upsert_payloads)
                except Exception as e:
                    logger.error(f"DB Insert chunk failed: {e}")
                    
            await asyncio.sleep(0.5)
            
    return rows_written

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--region", required=True)
    parser.add_argument("--start-date", required=True)
    parser.add_argument("--end-date", required=True)
    args = parser.parse_args()

    run_logger = PipelineRunLogger("ingest_imagery", "Earth Search STAC")
    run_logger.start(details={"region": args.region, "start_date": args.start_date, "end_date": args.end_date})

    try:
        rows = asyncio.run(process_imagery(args.region, args.start_date, args.end_date))
        run_logger.finish("success", rows_written=rows)
        print(json.dumps({"status": "success", "pipeline": "ingest_imagery", "rows_written": rows}))
    except Exception as e:
        logger.error(f"Failed: {e}")
        run_logger.finish("failed", error_message=str(e))
        print(json.dumps({"status": "failed", "error": str(e)}))
        sys.exit(1)
