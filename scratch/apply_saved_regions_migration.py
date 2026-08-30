import psycopg2
import urllib.parse
import sys

pw = 'DIVDAVANE2005'
user = 'postgres.cxbnxqvpyansdabjteuv'
host = 'aws-0-ap-southeast-1.pooler.supabase.com'
escaped_pw = urllib.parse.quote(pw, safe='')
url = f'postgresql://{user}:{escaped_pw}@{host}:5432/postgres?sslmode=require'

conn = psycopg2.connect(url)
conn.autocommit = True
cur = conn.cursor()

with open('supabase/migrations/00000000000021_create_saved_regions.sql', 'r') as f:
    migration_sql = f.read()

print('Applying migration 00000000000021_create_saved_regions.sql...')
cur.execute(migration_sql)
print('Migration executed successfully!')

# Verify table columns in information_schema
cur.execute('''
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_name = 'saved_regions'
    ORDER BY ordinal_position;
''')
columns = cur.fetchall()
print('\nVerified saved_regions Columns:')
for col in columns:
    print(f' - {col[0]}: {col[1]} (nullable: {col[2]})')

# Verify RLS enabled status
cur.execute('''
    SELECT relname, relrowsecurity, relforcerowsecurity
    FROM pg_class
    WHERE relname = 'saved_regions';
''')
rls_status = cur.fetchone()
print(f'\nRLS Enabled on saved_regions: {rls_status[1]}')

# Verify RLS policies
cur.execute('''
    SELECT policyname, permissive, roles, cmd, qual, with_check
    FROM pg_policies
    WHERE tablename = 'saved_regions';
''')
policies = cur.fetchall()
print(f'\nVerified {len(policies)} RLS Policies on saved_regions:')
for p in policies:
    print(f' - Policy: "{p[0]}" | Cmd: {p[3]} | Roles: {p[2]} | Using: {p[4]} | With Check: {p[5]}')

conn.close()
