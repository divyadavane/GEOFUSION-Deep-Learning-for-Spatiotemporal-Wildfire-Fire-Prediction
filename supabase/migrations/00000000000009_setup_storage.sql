-- Create storage buckets
insert into storage.buckets (id, name, public) values
  ('imagery-raw', 'imagery-raw', false),
  ('imagery-processed', 'imagery-processed', false),
  ('model-checkpoints', 'model-checkpoints', false),
  ('exports', 'exports', false)
on conflict (id) do nothing;

-- Note: In Supabase, the 'service_role' bypasses RLS by default.
-- However, we create explicit policies for clarity where requested.

-- imagery-raw: only service_role can read/write.
create policy "imagery-raw service role full access" on storage.objects to service_role using (bucket_id = 'imagery-raw') with check (bucket_id = 'imagery-raw');

-- imagery-processed: service_role can write; researcher/admin/service_role can read directly;
-- authenticated_viewer/public require a signed URL. (no direct SELECT policy for them)
create policy "imagery-processed researcher/admin read" on storage.objects for select using (
  bucket_id = 'imagery-processed' and public.current_user_role() in ('researcher', 'admin')
);
create policy "imagery-processed service role write" on storage.objects to service_role using (bucket_id = 'imagery-processed') with check (bucket_id = 'imagery-processed');

-- model-checkpoints: only service_role.
create policy "model-checkpoints service role full access" on storage.objects to service_role using (bucket_id = 'model-checkpoints') with check (bucket_id = 'model-checkpoints');

-- exports: researcher/admin/service_role can read/write.
create policy "exports researcher/admin read" on storage.objects for select using (
  bucket_id = 'exports' and public.current_user_role() in ('researcher', 'admin')
);
create policy "exports researcher/admin insert" on storage.objects for insert with check (
  bucket_id = 'exports' and public.current_user_role() in ('researcher', 'admin')
);
create policy "exports researcher/admin update" on storage.objects for update using (
  bucket_id = 'exports' and public.current_user_role() in ('researcher', 'admin')
) with check (
  bucket_id = 'exports' and public.current_user_role() in ('researcher', 'admin')
);
create policy "exports researcher/admin delete" on storage.objects for delete using (
  bucket_id = 'exports' and public.current_user_role() in ('researcher', 'admin')
);
create policy "exports service role full access" on storage.objects to service_role using (bucket_id = 'exports') with check (bucket_id = 'exports');
