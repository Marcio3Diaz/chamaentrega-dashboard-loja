-- ChamaEntrega: harden store logo uploads.
-- Keeps logo files public for rendering, while restricting writes to the
-- authenticated user's own folder.

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'store-logos',
  'store-logos',
  true,
  5242880,
  array['image/png','image/jpeg','image/webp']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "store_logos_public_read" on storage.objects;
create policy "store_logos_public_read"
on storage.objects
for select
to public
using (bucket_id = 'store-logos');

drop policy if exists "store_logos_insert_own_folder" on storage.objects;
create policy "store_logos_insert_own_folder"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'store-logos'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists "store_logos_update_own_folder" on storage.objects;
create policy "store_logos_update_own_folder"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'store-logos'
  and (storage.foldername(name))[1] = (select auth.uid())::text
)
with check (
  bucket_id = 'store-logos'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists "store_logos_delete_own_folder" on storage.objects;
create policy "store_logos_delete_own_folder"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'store-logos'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);
