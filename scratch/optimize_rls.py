import psycopg2, urllib.parse

pw = 'DIVDAVANE2005'
user = 'postgres.cxbnxqvpyansdabjteuv'
host = 'aws-0-ap-southeast-1.pooler.supabase.com'
escaped_pw = urllib.parse.quote(pw, safe='')
url = f'postgresql://{user}:{escaped_pw}@{host}:5432/postgres?sslmode=require'

conn = psycopg2.connect(url)
conn.autocommit = True
cur = conn.cursor()

sql = """
DROP POLICY IF EXISTS "Researcher/Admin read access" ON weather_series;
CREATE POLICY "Researcher/Admin read access" ON weather_series FOR SELECT 
USING ((select current_user_role()) in ('researcher', 'admin'));

DROP POLICY IF EXISTS "Researcher/Admin read access" ON imagery_tiles;
CREATE POLICY "Researcher/Admin read access" ON imagery_tiles FOR SELECT 
USING ((select current_user_role()) in ('researcher', 'admin'));

DROP POLICY IF EXISTS "Researcher/Admin read access" ON fire_events;
CREATE POLICY "Researcher/Admin read access" ON fire_events FOR SELECT 
USING ((select current_user_role()) in ('researcher', 'admin'));

DROP POLICY IF EXISTS "Researcher/Admin read access for models" ON models;
CREATE POLICY "Researcher/Admin read access for models" ON models FOR SELECT 
USING ((select current_user_role()) in ('researcher', 'admin'));
"""

cur.execute(sql)
print("RLS InitPlan optimization successfully executed!")
conn.close()
