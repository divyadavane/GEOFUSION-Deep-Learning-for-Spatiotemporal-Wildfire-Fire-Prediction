import psycopg2
import urllib.parse
import urllib.request
import json

pw = 'DIVDAVANE2005'
user = 'postgres.cxbnxqvpyansdabjteuv'
host = 'aws-0-ap-southeast-1.pooler.supabase.com'
escaped_pw = urllib.parse.quote(pw, safe='')
url = f'postgresql://{user}:{escaped_pw}@{host}:5432/postgres?sslmode=require'

conn = psycopg2.connect(url)
conn.autocommit = True
cur = conn.cursor()

# Clean up test table
cur.execute("DELETE FROM public.grid_cells WHERE region = 'sierra_nevada_foothills_test';")

# Fetch from database RPC
cur.execute("SELECT * FROM public.get_available_regions();")
rows = cur.fetchall()

print("--- POSTGRESQL get_available_regions() RPC OUTPUT ---")
for r in rows:
    print(f"  * Region ID: {r[0]:<28} | Name: {r[1]:<32} | Cells: {r[2]:,}")

conn.close()

# Fetch from Next.js API endpoint
req = urllib.request.Request("http://localhost:3000/api/available-regions")
with urllib.request.urlopen(req) as resp:
    api_regions = json.loads(resp.read().decode())

print("\n--- NEXT.JS /api/available-regions LIVE API OUTPUT ---")
for r in api_regions:
    print(f"  * [{r['region_id']}] {r['name']} ({r['cell_count']:,} Cells)")
