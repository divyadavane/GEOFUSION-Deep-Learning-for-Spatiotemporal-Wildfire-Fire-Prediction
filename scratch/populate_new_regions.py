import psycopg2
import urllib.parse

pw = 'DIVDAVANE2005'
user = 'postgres.cxbnxqvpyansdabjteuv'
host = 'aws-0-ap-southeast-1.pooler.supabase.com'
escaped_pw = urllib.parse.quote(pw, safe='')
url = f'postgresql://{user}:{escaped_pw}@{host}:5432/postgres?sslmode=require'

conn = psycopg2.connect(url)
conn.autocommit = True
cur = conn.cursor()

print("Populating 6 new global/US wildfire monitoring regions into PostgreSQL grid_cells...")

regions = {
    'sierra_nevada': {
        'name': 'Sierra Nevada Foothills',
        'bbox': [-121.2, 36.5, -118.0, 39.5],
        'cols': 40,
        'rows': 40,
        'start_id': 100000
    },
    'socal_coastal': {
        'name': 'Southern California Coastal',
        'bbox': [-120.5, 32.5, -116.5, 35.0],
        'cols': 40,
        'rows': 30,
        'start_id': 200000
    },
    'pacific_northwest': {
        'name': 'Pacific Northwest Cascades',
        'bbox': [-124.5, 43.5, -120.5, 47.5],
        'cols': 40,
        'rows': 40,
        'start_id': 300000
    },
    'colorado_rockies': {
        'name': 'Colorado Rocky Mountains',
        'bbox': [-107.5, 38.0, -104.5, 41.0],
        'cols': 40,
        'rows': 40,
        'start_id': 400000
    },
    'arizona_southwest': {
        'name': 'Arizona & Southwest Forests',
        'bbox': [-113.5, 33.5, -109.5, 36.5],
        'cols': 40,
        'rows': 30,
        'start_id': 500000
    },
    'mediterranean_basin': {
        'name': 'Mediterranean Wildfire Pilot',
        'bbox': [20.0, 36.5, 24.5, 40.5],
        'cols': 40,
        'rows': 40,
        'start_id': 600000
    }
}

for reg_id, cfg in regions.items():
    cur.execute("DELETE FROM public.grid_cells WHERE region = %s;", (reg_id,))
    
    bbox = cfg['bbox']
    cols = cfg['cols']
    rows = cfg['rows']
    start_id = cfg['start_id']
    
    dLon = (bbox[2] - bbox[0]) / cols
    dLat = (bbox[3] - bbox[1]) / rows
    
    cells_data = []
    cell_idx = 1
    
    for r in range(rows):
        for c in range(cols):
            min_lon = bbox[0] + c * dLon
            max_lon = min_lon + dLon
            min_lat = bbox[1] + r * dLat
            max_lat = min_lat + dLat
            
            centroid_lon = min_lon + dLon / 2.0
            centroid_lat = min_lat + dLat / 2.0
            
            poly_wkt = f"POLYGON(({min_lon} {min_lat}, {max_lon} {min_lat}, {max_lon} {max_lat}, {min_lon} {max_lat}, {min_lon} {min_lat}))"
            
            current_id = start_id + cell_idx
            cells_data.append((current_id, reg_id, poly_wkt, centroid_lon, centroid_lat))
            cell_idx += 1
            
    print(f"Inserting {len(cells_data)} grid cells for '{cfg['name']}' ({reg_id})...")
    
    cur.executemany("""
        INSERT INTO public.grid_cells (id, region, cell_geom, centroid, resolution_m)
        OVERRIDING SYSTEM VALUE
        VALUES (
            %s,
            %s,
            extensions.st_setsrid(extensions.st_geomfromtext(%s), 4326),
            extensions.st_setsrid(extensions.st_point(%s, %s), 4326),
            10000
        )
        ON CONFLICT (id) DO NOTHING;
    """, cells_data)

# Remove the test region from earlier test
cur.execute("DELETE FROM public.grid_cells WHERE region = 'sierra_nevada_foothills_test';")

cur.execute("SELECT * FROM public.get_available_regions();")
rows = cur.fetchall()

print("\n--- NEW COMPLETE REGIONS LIST FROM DATABASE RPC ---")
for r in rows:
    print(f"  - [{r[0]}] {r[1]} ({r[2]:,} Cells)")

conn.close()
print("\nAll new regions successfully populated in PostgreSQL!")
