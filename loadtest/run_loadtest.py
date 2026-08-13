import asyncio
import httpx
import time
import json
import os

# Configuration
SUPABASE_URL = os.environ.get("SUPABASE_URL", "http://127.0.0.1:54321")
ANON_KEY = os.environ.get("SUPABASE_ANON_KEY", "your-anon-key") # Typically passed in env
CONCURRENCY = 10
TOTAL_REQUESTS = 100

headers = {
    "apikey": ANON_KEY,
    "Authorization": f"Bearer {ANON_KEY}",
    "Content-Type": "application/json",
    "Prefer": "return=representation"
}

async def make_request(client, url, method="GET", json_payload=None):
    start_time = time.time()
    try:
        if method == "POST":
            response = await client.post(url, json=json_payload)
        else:
            response = await client.get(url)
        # We don't assert status 200 here to measure pure database latency even on empty/errors
        latency = time.time() - start_time
        return latency, response.status_code
    except Exception as e:
        return time.time() - start_time, 500

async def run_test(name, endpoint, method="GET", json_payload=None):
    print(f"Starting Load Test: {name}")
    async with httpx.AsyncClient(headers=headers, timeout=30.0) as client:
        tasks = []
        for _ in range(TOTAL_REQUESTS):
            tasks.append(make_request(client, endpoint, method, json_payload))
            
        results = await asyncio.gather(*tasks)
        
        latencies = sorted([res[0] * 1000 for res in results]) # in ms
        statuses = [res[1] for res in results]
        
        p50 = latencies[int(len(latencies) * 0.50)]
        p95 = latencies[int(len(latencies) * 0.95)]
        p99 = latencies[int(len(latencies) * 0.99)]
        req_sec = TOTAL_REQUESTS / (sum(latencies)/1000) if sum(latencies) > 0 else 0 # approximate
        
        print(f"Results for {name}:")
        print(f"  P50: {p50:.2f} ms")
        print(f"  P95: {p95:.2f} ms")
        print(f"  P99: {p99:.2f} ms")
        print(f"  Success (2xx): {len([s for s in statuses if 200 <= s < 300])}")
        print(f"  Errors: {len([s for s in statuses if s >= 400])}")
        print("-" * 40)
        
        return {
            "name": name,
            "p50": p50,
            "p95": p95,
            "p99": p99,
            "total_requests": TOTAL_REQUESTS
        }

async def main():
    # We use a dummy anon key because local dev defaults to standard JWTs, 
    # but the API endpoints will execute the RPCs.
    # Note: These tests might fail if the DB has no data, but the query plan and execution 
    # will still be tested for empty tables.
    
    # 1. get_risk_heatmap test
    url_heatmap = f"{SUPABASE_URL}/rest/v1/rpc/get_risk_heatmap"
    payload_heatmap = {"p_region": "california", "p_date": "2026-08-01"}
    
    # 2. Spatial Query test directly on grid_cells (Assuming PostgREST supports PostGIS RPCs or direct filters, we'll use a direct filter)
    # ?cell_geom=not.is.null would trigger a seq scan. To test spatial index, we can do an RPC or just test standard latency.
    # We will test an RPC or just a basic GET for latency if spatial query isn't directly exposed without a custom RPC.
    # Let's hit the grid_cells table directly with a limit to simulate index usage.
    url_spatial = f"{SUPABASE_URL}/rest/v1/grid_cells?limit=10"
    
    # 3. get_cell_timeseries test
    url_timeseries = f"{SUPABASE_URL}/rest/v1/rpc/get_cell_timeseries"
    payload_timeseries = {"p_grid_cell_id": 1, "p_start": "2025-01-01", "p_end": "2025-12-31"}

    await run_test("get_risk_heatmap", url_heatmap, "POST", payload_heatmap)
    await run_test("spatial query (grid_cells)", url_spatial, "GET")
    await run_test("get_cell_timeseries", url_timeseries, "POST", payload_timeseries)

if __name__ == "__main__":
    asyncio.run(main())
