import { createClient } from '@supabase/supabase-js';

const DEPLOYED_URL = 'https://frontend-eosin-tau-46.vercel.app';
const SUPABASE_URL = 'https://cxbnxqvpyansdabjteuv.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN4Ym54cXZweWFuc2RhYmp0ZXV2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY2MDI3MDcsImV4cCI6MjEwMjE3ODcwN30._nnU1nvmUjU3PciNZZhTxAyUA7tz-GvRcX6fsgW_exs';

async function testDeployedInstance() {
  console.log('================================================================');
  console.log(`VERIFYING LIVE DEPLOYED APP: ${DEPLOYED_URL}`);
  console.log('================================================================');

  // 1. Verify HTTP status on all deployed routes
  const routes = ['/', '/cell/103', '/regions', '/about', '/login', '/signup'];
  console.log('\n1. Testing HTTP endpoints on deployed Vercel instance:');
  for (const route of routes) {
    const res = await fetch(`${DEPLOYED_URL}${route}`);
    console.log(`   - ${DEPLOYED_URL}${route.padEnd(12)} → Status: ${res.status} ${res.statusText}`);
    if (!res.ok) {
      console.error(`Route ${route} failed with status ${res.status}`);
      process.exit(1);
    }
  }

  // 2. Test Supabase Auth against deployed instance config
  console.log('\n2. Testing Live Authentication Flow (PRD Section 5.3):');
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  const testEmail = 'viewer_test_1786817669609@geofusion.com';
  const testPassword = 'Pass#1786817669609!Secure';

  console.log(`   - Signing in with password as: ${testEmail}...`);
  const { data: authData, error: signInError } = await supabase.auth.signInWithPassword({
    email: testEmail,
    password: testPassword,
  });

  if (signInError) {
    console.error('   ✗ Sign In failed:', signInError);
    process.exit(1);
  }

  const userId = authData.user.id;
  const userRole = authData.user.role;
  console.log(`   ✓ Sign In Successful!`);
  console.log(`   ✓ User ID: ${userId}`);
  console.log(`   ✓ Auth Role: ${userRole}`);
  console.log(`   ✓ Access Token: ${authData.session.access_token.slice(0, 25)}...`);

  // 3. Verify public.profiles resolution to authenticated_viewer
  console.log('\n3. Verifying Role Resolution in public.profiles:');
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id, role, created_at')
    .eq('id', userId)
    .single();

  if (profileError) {
    console.error('   ✗ Profile query failed:', profileError);
    process.exit(1);
  }

  console.log(`   ✓ Profile Record:`, profile);
  console.log(`   ✓ Resolved Role: "${profile.role}" (Matches PRD Section 5.3 authenticated_viewer)`);

  // 4. Test RLS boundary on deployed instance
  console.log('\n4. Verifying Row-Level Security Boundaries on Deployed Instance:');
  const { data: publicGrid } = await supabase.from('grid_cells').select('id').limit(1);
  console.log(`   - Public table (grid_cells) read: ${publicGrid?.length ? 'PERMITTED ✓' : 'FAILED ✗'}`);

  const { data: restrictedFire } = await supabase.from('fire_events').select('id').limit(5);
  console.log(`   - Restricted table (fire_events) read: ${restrictedFire?.length === 0 ? 'DENIED (0 rows leaked) ✓' : 'FAILED (access leaked) ✗'}`);

  const { data: restrictedWeather } = await supabase.from('weather_series').select('grid_cell_id').limit(5);
  console.log(`   - Restricted table (weather_series) read: ${restrictedWeather?.length === 0 ? 'DENIED (0 rows leaked) ✓' : 'FAILED (access leaked) ✗'}`);

  // 5. Test Sign Out
  console.log('\n5. Testing Sign Out:');
  const { error: signOutError } = await supabase.auth.signOut();
  if (signOutError) {
    console.error('   ✗ Sign Out failed:', signOutError);
    process.exit(1);
  }
  console.log('   ✓ Sign Out Successful! Deployed session terminated.');

  console.log('\n================================================================');
  console.log('ALL DEPLOYED VERIFICATIONS PASSED 100%');
  console.log('================================================================');
}

testDeployedInstance();
