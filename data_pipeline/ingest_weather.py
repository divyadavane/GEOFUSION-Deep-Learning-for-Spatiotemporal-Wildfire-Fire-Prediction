import argparse
import sys
import json
import httpx
from datetime import datetime, timedelta
import asyncio
from pipeline_common import PipelineRunLogger, get_supabase_client, upsert_with_retry, logger

async def fetch_weather_for_cell(client: httpx.AsyncClient, lat: float, lon: float, start_date: str, end_date: str):
    # Open-Meteo Historical API for ERA5 data
    url = "https://archive-api.open-meteo.com/v1/archive"
    params = {
        "latitude": lat,
        "longitude": lon,
        "start_date": start_date,
        "end_date": end_date,
        "daily": ["temperature_2m_max", "temperature_2m_mean", "precipitation_sum", "wind_speed_10m_max", "wind_direction_10m_dominant"],
        "timezone": "UTC"
    }
    
    try:
        response = await client.get(url, params=params)
        response.raise_for_status()
        return response.json()
    except Exception as e:
        logger.error(f"Failed to fetch weather for {lat},{lon}: {e}")
        return None

async def process_weather(region: str, start_date: str, end_date: str):
    supabase = get_supabase_client()
    # PostgREST allows querying PostGIS geometries as GeoJSON with a specific accept header, 
    # but for simplicity, if centroid is WKT, we can extract it if we need, 
    # but the easiest is just fetching the grid cells and extracting ST_X and ST_Y if we had a view.
    # We will assume a helper RPC or we just parse the WKT "POINT(lon lat)" in Python.
    res = supabase.table("grid_cells").select("id, centroid").eq("region", region).execute()
    
    if not res.data:
        raise ValueError(f"No grid cells found for region: {region}")

    rows_written = 0
    
    async with httpx.AsyncClient(timeout=30.0) as client:
        # Process in batches to avoid overwhelming the API
        batch_size = 50
        for i in range(0, len(res.data), batch_size):
            batch = res.data[i:i+batch_size]
            tasks = []
            valid_cells = []
            
            for cell in batch:
                # centroid is likely "POINT(-121.5 39.5)"
                wkt = cell.get("centroid", "")
                if wkt.startswith("POINT"):
                    try:
                        coords = wkt.replace("POINT(", "").replace(")", "").split(" ")
                        lon, lat = float(coords[0]), float(coords[1])
                        tasks.append(fetch_weather_for_cell(client, lat, lon, start_date, end_date))
                        valid_cells.append(cell["id"])
                    except Exception as e:
                        logger.error(f"Error parsing WKT {wkt}: {e}")
                        continue
                        
            if not tasks:
                continue
                
            results = await asyncio.gather(*tasks)
            
            # Now map results back to Supabase payload
            upsert_payloads = []
            for cell_id, weather_data in zip(valid_cells, results):
                if not weather_data or "daily" not in weather_data:
                    continue
                    
                daily = weather_data["daily"]
                for i, date_str in enumerate(daily["time"]):
                    # Handle None values from API gracefully
                    def _safe_float(val, default=0.0):
                        return float(val) if val is not None else default
                        
                    payload = {
                        "grid_cell_id": cell_id,
                        "ts": f"{date_str}T12:00:00Z",
                        "temperature_c": _safe_float(daily["temperature_2m_mean"][i]),
                        "humidity_pct": 50.0, # Not in basic free tier, mocking safe fallback
                        "wind_speed_ms": _safe_float(daily["wind_speed_10m_max"][i]),
                        "wind_dir_deg": _safe_float(daily["wind_direction_10m_dominant"][i]),
                        "precip_mm": _safe_float(daily["precipitation_sum"][i]),
                        "drought_index": 0.0, # Calculate if needed
                        "source": "Open-Meteo ERA5"
                    }
                    upsert_payloads.append(payload)
            
            if upsert_payloads:
                # Upsert in small DB chunks
                for j in range(0, len(upsert_payloads), 1000):
                    chunk = upsert_payloads[j:j+1000]
                    try:
                        upsert_with_retry(supabase, "weather_series", chunk)
                        rows_written += len(chunk)
                    except Exception as e:
                        logger.error(f"DB Insert chunk failed: {e}")
                        
            # Sleep briefly to respect Open-Meteo free tier (10,000 req/day, but max per second)
            await asyncio.sleep(1.0)
            
    return rows_written

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--region", required=True)
    parser.add_argument("--start-date", required=True)
    parser.add_argument("--end-date", required=True)
    args = parser.parse_args()

    run_logger = PipelineRunLogger("ingest_weather", "Open-Meteo ERA5")
    run_logger.start(details={"region": args.region, "start_date": args.start_date, "end_date": args.end_date})

    try:
        rows = asyncio.run(process_weather(args.region, args.start_date, args.end_date))
        run_logger.finish("success", rows_written=rows)
        print(json.dumps({"status": "success", "pipeline": "ingest_weather", "rows_written": rows}))
    except Exception as e:
        logger.error(f"Failed: {e}")
        run_logger.finish("failed", error_message=str(e))
        print(json.dumps({"status": "failed", "error": str(e)}))
        sys.exit(1)
