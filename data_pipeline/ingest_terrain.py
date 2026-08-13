import argparse
import sys
import json
import httpx
import asyncio
from pipeline_common import PipelineRunLogger, get_supabase_client, upsert_with_retry, logger

async def fetch_elevation(client: httpx.AsyncClient, lat: float, lon: float):
    # Open-Meteo Elevation API
    url = "https://api.open-meteo.com/v1/elevation"
    params = {
        "latitude": lat,
        "longitude": lon
    }
    
    try:
        response = await client.get(url, params=params)
        response.raise_for_status()
        data = response.json()
        if "elevation" in data and len(data["elevation"]) > 0:
            return data["elevation"][0]
        return None
    except Exception as e:
        logger.error(f"Failed to fetch elevation for {lat},{lon}: {e}")
        return None

async def process_terrain(region: str, force: bool):
    supabase = get_supabase_client()
    res = supabase.table("grid_cells").select("id, centroid").eq("region", region).execute()
    
    if not res.data:
        raise ValueError(f"No grid cells found for region: {region}")

    rows_written = 0
    
    async with httpx.AsyncClient(timeout=30.0) as client:
        batch_size = 50
        for i in range(0, len(res.data), batch_size):
            batch = res.data[i:i+batch_size]
            tasks = []
            valid_cells = []
            
            for cell in batch:
                wkt = cell.get("centroid", "")
                try:
                    import shapely.wkb
                    pt = shapely.wkb.loads(bytes.fromhex(wkt))
                    lon, lat = float(pt.x), float(pt.y)
                    tasks.append(fetch_elevation(client, lat, lon))
                    valid_cells.append(cell["id"])
                except Exception as e:
                        logger.error(f"Error parsing WKT {wkt}: {e}")
                        continue
                        
            if not tasks:
                continue
                
            results = await asyncio.gather(*tasks)
            
            upsert_payloads = []
            for cell_id, elevation in zip(valid_cells, results):
                # We skip missing elevation
                if elevation is None:
                    continue
                    
                payload = {
                    "grid_cell_id": cell_id,
                    "elevation_m": float(elevation),
                    "slope_deg": None, # Requires DEM processing (gap)
                    "aspect_deg": None, # Requires DEM processing (gap)
                    "land_cover_class": None, # No free unauth API easily available globally
                    "fuel_type": None
                }
                upsert_payloads.append(payload)
            
            if upsert_payloads:
                # Upsert directly (in Phase 1 pipeline_common, upsert_with_retry supports lists)
                try:
                    upsert_with_retry(supabase, "static_features", upsert_payloads)
                    rows_written += len(upsert_payloads)
                except Exception as e:
                    logger.error(f"DB Insert chunk failed: {e}")
                    
            await asyncio.sleep(1.0)
            
    return rows_written

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--region", required=True)
    parser.add_argument("--force", action="store_true", help="Force update even if < 90 days")
    args = parser.parse_args()

    run_logger = PipelineRunLogger("ingest_terrain", "Open-Meteo Elevation")
    run_logger.start(details={"region": args.region, "force": args.force})

    try:
        rows = asyncio.run(process_terrain(args.region, args.force))
        run_logger.finish("success", rows_written=rows)
        print(json.dumps({"status": "success", "pipeline": "ingest_terrain", "rows_written": rows}))
    except Exception as e:
        logger.error(f"Failed: {e}")
        run_logger.finish("failed", error_message=str(e))
        print(json.dumps({"status": "failed", "error": str(e)}))
        sys.exit(1)
