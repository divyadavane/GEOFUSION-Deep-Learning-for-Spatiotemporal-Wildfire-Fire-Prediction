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
        "daily": [
            "temperature_2m_max",
            "temperature_2m_mean",
            "precipitation_sum",
            "wind_speed_10m_max",
            "wind_direction_10m_dominant",
            "relative_humidity_2m_mean",
            "soil_moisture_0_to_7cm_mean",
            "wind_gusts_10m_max"
        ],
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
                wkt = cell.get("centroid", "")
                try:
                    import shapely.wkb
                    pt = shapely.wkb.loads(bytes.fromhex(wkt))
                    lon, lat = float(pt.x), float(pt.y)
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
                    def _safe_float(val, default=0.0):
                        if val is None:
                            logger.warning(f"Null value found for cell {cell_id} on {date_str}. Using default.")
                            return default
                        return float(val)
                        
                    payload = {
                        "grid_cell_id": cell_id,
                        "ts": f"{date_str}T12:00:00Z",
                        "temperature_c": _safe_float(daily.get("temperature_2m_mean", [])[i] if i < len(daily.get("temperature_2m_mean", [])) else None),
                        "humidity_pct": _safe_float(daily.get("relative_humidity_2m_mean", [])[i] if i < len(daily.get("relative_humidity_2m_mean", [])) else None),
                        "wind_speed_ms": _safe_float(daily.get("wind_speed_10m_max", [])[i] if i < len(daily.get("wind_speed_10m_max", [])) else None),
                        "wind_dir_deg": _safe_float(daily.get("wind_direction_10m_dominant", [])[i] if i < len(daily.get("wind_direction_10m_dominant", [])) else None),
                        "precip_mm": _safe_float(daily.get("precipitation_sum", [])[i] if i < len(daily.get("precipitation_sum", [])) else None),
                        "wind_gusts_ms": _safe_float(daily.get("wind_gusts_10m_max", [])[i] if i < len(daily.get("wind_gusts_10m_max", [])) else None),
                        "soil_moisture": _safe_float(daily.get("soil_moisture_0_to_7cm_mean", [])[i] if i < len(daily.get("soil_moisture_0_to_7cm_mean", [])) else None),
                        "drought_index": _safe_float(daily.get("soil_moisture_0_to_7cm_mean", [])[i] if i < len(daily.get("soil_moisture_0_to_7cm_mean", [])) else None),
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
