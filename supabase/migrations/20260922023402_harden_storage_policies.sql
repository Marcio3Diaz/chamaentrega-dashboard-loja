-- Storage hardening and policy cleanup.

-- Store logos are intentionally public for rendering, but writes are restricted
-- to the authenticated user's own folder and image MIME types only.
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

drop policy if exists "store_owner_upload_own_logo" on storage.objects;
drop policy if exists "store_owner_update_own_logo" on storage.objects;
drop policy if exists "store_owner_delete_own_logo" on storage.objects;
drop policy if exists "store_logos_public_read" on storage.objects;
drop policy if exists "store_logos_insert_own_folder" on storage.objects;
drop policy if exists "store_logos_update_own_folder" on storage.objects;
drop policy if exists "store_logos_delete_own_folder" on storage.objects;

create policy "store_logos_public_read"
on storage.objects
for select
to public
using (bucket_id = 'store-logos');

create policy "store_logos_insert_own_folder"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'store-logos'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

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

create policy "store_logos_delete_own_folder"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'store-logos'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

-- Remove legacy duplicate courier-photo policies. The canonical policies
-- already enforce own-folder writes and the intended JPG object name.
drop policy if exists "courier_upload_own_profile_photo" on storage.objects;
drop policy if exists "courier_update_own_profile_photo" on storage.objects;
drop policy if exists "courier_delete_own_profile_photo" on storage.objects;

-- Reassert privacy and upload limits for verification documents.
insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'courier-verification-documents',
  'courier-verification-documents',
  false,
  8388608,
  array['image/jpeg','image/png','image/webp']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
