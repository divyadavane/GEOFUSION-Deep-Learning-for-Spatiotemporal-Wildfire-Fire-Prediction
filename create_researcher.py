import psycopg2
import uuid

url = 'postgresql://postgres.cxbnxqvpyansdabjteuv:REDACTED_DB_PASSWORD@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres'
conn = psycopg2.connect(url)
cur = conn.cursor()

user_id = str(uuid.uuid4())
email = 'real_researcher@example.com'

try:
    cur.execute('''
        INSERT INTO auth.users (
            instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, 
            invited_at, confirmation_token, confirmation_sent_at, recovery_token, 
            recovery_sent_at, email_change_token_new, email_change, email_change_sent_at, 
            last_sign_in_at, raw_app_meta_data, raw_user_meta_data, is_super_admin, 
            created_at, updated_at, phone, phone_confirmed_at, phone_change, 
            phone_change_token, phone_change_sent_at, email_change_token_current, 
            banned_until, reauthentication_token, 
            reauthentication_sent_at, is_sso_user, deleted_at, is_anonymous
        ) VALUES (
            '00000000-0000-0000-0000-000000000000', %s, 'authenticated', 'authenticated', %s, 
            'dummy_hash', now(), NULL, '', NULL, '', NULL, '', '', NULL, now(), 
            '{"provider":"email","providers":["email"]}', '{}', FALSE, now(), now(), 
            NULL, NULL, '', '', NULL, '', NULL, '', NULL, FALSE, NULL, FALSE
        )
    ''', (user_id, email))
    
    cur.execute('''
        INSERT INTO public.profiles (id, role, created_at)
        VALUES (%s, 'researcher', now())
    ''', (user_id,))
    
    conn.commit()
    print('Successfully created researcher user with ID:', user_id)
except Exception as e:
    conn.rollback()
    print('Failed to create user:', e)

conn.close()
