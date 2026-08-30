import { createClient } from '@supabase/supabase-js';

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://cxbnxqvpyansdabjteuv.supabase.co';
const supabaseAnonKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN4Ym54cXZweWFuc2RhYmp0ZXV2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY2MDI3MDcsImV4cCI6MjEwMjE3ODcwN30._nnU1nvmUjU3PciNZZhTxAyUA7tz-GvRcX6fsgW_exs';

// Client-safe Supabase instance using only the public anon key
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
});
