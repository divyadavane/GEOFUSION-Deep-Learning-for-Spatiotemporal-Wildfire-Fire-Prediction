-- Enable Supabase Realtime for the predictions table
alter publication supabase_realtime add table predictions;

-- Ensure replica identity full so all columns are broadcast in payload
alter table predictions replica identity full;
