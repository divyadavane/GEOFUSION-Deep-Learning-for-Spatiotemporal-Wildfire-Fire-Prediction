import os
import sys
import numpy as np
from supabase import create_client, Client
import json

SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_SERVICE_ROLE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")

if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
    print("Error: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in environment variables.")
    sys.exit(1)

supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

# Northern California bounding box (approximate)
# Longitude: -124.0 to -120.0 (4 degrees ~ 400km)
# Latitude: 38.0 to 42.0 (4 degrees ~ 400km)
XMIN, XMAX = -124.0, -120.0
YMIN, YMAX = 38.0, 42.0
RESOLUTION_DEG = 0.1 # roughly 10km
REGION_NAME = "northern_california_pilot"

def generate_grid():
    x_coords = np.arange(XMIN, XMAX, RESOLUTION_DEG)
    y_coords = np.arange(YMIN, YMAX, RESOLUTION_DEG)
    
    cells = []
    for x in x_coords:
        for y in y_coords:
            # WKT Polygon: WGS84, Counter-clockwise
            # A square cell: (x, y), (x+res, y), (x+res, y+res), (x, y+res), (x, y)
            x_next = x + RESOLUTION_DEG
            y_next = y + RESOLUTION_DEG
            
            wkt_polygon = f"POLYGON(({x} {y}, {x_next} {y}, {x_next} {y_next}, {x} {y_next}, {x} {y}))"
            wkt_centroid = f"POINT({x + RESOLUTION_DEG/2} {y + RESOLUTION_DEG/2})"
            
            cells.append({
                "cell_geom": wkt_polygon,
                "centroid": wkt_centroid,
                "resolution_m": 10000,
                "region": REGION_NAME
            })
            
    return cells

def setup_grid():
    cells = generate_grid()
    print(f"Generated {len(cells)} grid cells for {REGION_NAME}.")
    
    # We use a trick for bulk insert in Supabase: upsert or batch insert.
    # PostgREST allows bulk insert by passing a list of dicts.
    batch_size = 1000
    rows_inserted = 0
    
    for i in range(0, len(cells), batch_size):
        batch = cells[i:i+batch_size]
        # Insert raw geometry via PostgREST requires using the geometry casting or ST_GeomFromText.
        # But PostgREST natively accepts EWKB or WKT if the column is type `geometry`.
        # We will try to insert directly as strings (WKT).
        try:
            res = supabase.table("grid_cells").insert(batch).execute()
            rows_inserted += len(res.data)
        except Exception as e:
            # If standard WKT fails due to PostgREST parsing, we might need a custom RPC.
            # But PostGIS + PostgREST usually supports WKT string casting automatically.
            print(f"Error inserting batch: {e}")
            sys.exit(1)
            
    print(f"Successfully inserted {rows_inserted} grid cells.")
    
    # Generate docs/pilot_region.md
    os.makedirs("docs", exist_ok=True)
    with open("docs/pilot_region.md", "w") as f:
        f.write(f"# Pilot Region: {REGION_NAME}\n\n")
        f.write(f"- **Bounding Box**: [{XMIN}, {YMIN}] to [{XMAX}, {YMAX}]\n")
        f.write(f"- **Resolution**: ~10km ({RESOLUTION_DEG} degrees)\n")
        f.write(f"- **Total Grid Cells**: {rows_inserted}\n")
        
if __name__ == "__main__":
    setup_grid()
