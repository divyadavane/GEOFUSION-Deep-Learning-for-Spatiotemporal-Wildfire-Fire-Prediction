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

# 1. Insert a temporary test region
cur.execute('SELECT id FROM auth.users LIMIT 1;')
user_id = cur.fetchone()[0]

cur.execute('''
    INSERT INTO public.saved_regions (user_id, name, description, bbox, geometry)
    VALUES (
        %s,
        'Temporary Test Perimeter',
        'Test region to verify rename and delete actions',
        ARRAY[-123.0, 39.0, -122.0, 40.0],
        ST_SetSRID(ST_MakeEnvelope(-123.0, 39.0, -122.0, 40.0), 4326)
    )
    RETURNING id, name;
''', (user_id,))
test_row = cur.fetchone()
test_id = test_row[0]
print(f'1. Inserted Test Region: {test_row[1]} (ID: {test_id})')

# 2. Test Rename (UPDATE)
cur.execute('''
    UPDATE public.saved_regions
    SET name = 'Renamed Verified AOI Perimeter', updated_at = NOW()
    WHERE id = %s
    RETURNING id, name, updated_at;
''', (test_id,))
renamed_row = cur.fetchone()
print(f'2. Verified Rename Update: "{renamed_row[1]}" at {renamed_row[2]}')

# 3. Test Delete (DELETE)
cur.execute('''
    DELETE FROM public.saved_regions
    WHERE id = %s
    RETURNING id, name;
''', (test_id,))
deleted_row = cur.fetchone()
print(f'3. Verified Delete Action: Removed "{deleted_row[1]}" (ID: {deleted_row[0]})')

# 4. Check remaining count
cur.execute('SELECT count(*) FROM public.saved_regions WHERE user_id = %s;', (user_id,))
count = cur.fetchone()[0]
print(f'\nTotal active saved regions in database: {count}')

conn.close()
