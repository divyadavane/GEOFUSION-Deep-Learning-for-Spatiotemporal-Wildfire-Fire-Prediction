# GEOFUSION Backend

Phase 0: Backend Foundations (Supabase)

This repository contains the Supabase setup for the GEOFUSION project, a multimodal deep learning system that predicts wildfire ignition risk.

## Local Development

1. **Install Dependencies**: Make sure you have the Supabase CLI installed, or use `npx supabase`.
2. **Start Supabase**: 
   ```bash
   npx supabase start
   ```
3. **Run Tests**:
   ```bash
   npm run test:backend
   ```
   Or explicitly using the CLI:
   ```bash
   npx supabase test db
   ```

## Admin User Setup

We use a custom `profiles` table to manage user roles (`authenticated_viewer`, `researcher`, `admin`).
To create the first admin user, follow these steps:

1. **Register the User**: Sign up a new user via your application's frontend authentication flow, or create the user manually via the Supabase Studio dashboard (Authentication -> Add User).
2. **Assign the Admin Role**: Once the user is created, log into the Supabase Studio SQL Editor (or connect via `psql`) and run the following one-off SQL script to update their role to `admin`:

```sql
-- Replace the UUID with the actual user ID of the newly registered user
UPDATE public.profiles
SET role = 'admin'
WHERE id = 'insert-user-uuid-here';
```

> **WARNING**: Never hardcode real credentials or seed a fake admin with a known password into version control. The test researcher seeded in local development is strictly for local use.
