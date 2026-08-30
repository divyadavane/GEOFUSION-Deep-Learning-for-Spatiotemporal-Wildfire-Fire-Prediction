import os
import sys
import psycopg2

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "data_pipeline"))
from pipeline_common import get_db_url

conn = psycopg2.connect(get_db_url())
cur = conn.cursor()

cur.execute("""
    SELECT count(*) 
    FROM fire_events f 
    JOIN static_features s ON s.grid_cell_id = f.grid_cell_id 
    JOIN weather_series w ON w.grid_cell_id = f.grid_cell_id 
    AND date_trunc('day', w.ts) = date_trunc('day', f.ignition_date)
""")
print("Joined positive rows:", cur.fetchone()[0])
