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

with open('supabase/migrations/00000000000019_get_risk_heatmap.sql', 'r') as f:
    sql = f.read()

cur.execute(sql)
cur.execute("NOTIFY pgrst, 'reload schema';")
print("Migration 19 applied and PostgREST schema reload notified.")

cur.execute("SELECT count(*) FROM public.get_risk_heatmap('northern_california_pilot', '2026-08-31'::date);")
print("Direct PostgreSQL RPC Row Count for 2026-08-31:", cur.fetchone()[0])

conn.close()

# Query Next.js API
req = urllib.request.Request("http://localhost:3000/api/risk-heatmap?region=northern_california_pilot&date=2026-08-31")
with urllib.request.urlopen(req) as resp:
    data = json.loads(resp.read().decode())

print("\n--- NEXT.JS RISK-HEATMAP API VERIFICATION ---")
print("Source:", data.get('source'))
print("RPC Signature:", data.get('rpc_signature'))
print("Total predictions returned:", len(data.get('predictions', {})))
print("Sample prediction Cell #1001:", data.get('predictions', {}).get('1001'))
print("Sample prediction Cell #1050:", data.get('predictions', {}).get('1050'))
print("Sample prediction Cell #1100:", data.get('predictions', {}).get('1100'))
