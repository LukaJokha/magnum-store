-- Magnum Store production security migration.
-- Run this file once in Supabase SQL Editor after the storefront has been
-- updated to query public.storefront_products. It is safe to run repeatedly.
-- First replace REPLACE_WITH_OWNER_EMAIL below with the existing Supabase
-- Authentication email of the store owner. The entire transaction rolls back
-- if the account cannot be found, preventing an accidental administrator lockout.

begin;

create table if not exists public.catalog_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  note text not null default ''
);
alter table public.catalog_admins enable row level security;
revoke all on table public.catalog_admins from public, anon, authenticated;

create or replace function public.is_catalog_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null
    and exists (
      select 1
      from public.catalog_admins administrator
      where administrator.user_id = auth.uid()
    );
$$;
revoke all on function public.is_catalog_admin() from public;
grant execute on function public.is_catalog_admin() to authenticated;

do $bootstrap_owner$
declare
  owner_email constant text := 'REPLACE_WITH_OWNER_EMAIL';
begin
  if owner_email = 'REPLACE_WITH_OWNER_EMAIL' then
    raise exception 'Replace REPLACE_WITH_OWNER_EMAIL with the store owner Authentication email';
  end if;

  insert into public.catalog_admins (user_id, note)
  select id, 'Store owner'
  from auth.users
  where lower(email) = lower(owner_email)
  on conflict (user_id) do nothing;

  if not exists (
    select 1
    from public.catalog_admins administrator
    join auth.users users on users.id = administrator.user_id
    where lower(users.email) = lower(owner_email)
  ) then
    raise exception 'No Supabase Authentication user exists for %', owner_email;
  end if;
end;
$bootstrap_owner$;

alter table public.products enable row level security;
drop policy if exists "Public catalog read" on public.products;
drop policy if exists "Authenticated catalog management" on public.products;
drop policy if exists "Catalog administrators can read products" on public.products;
drop policy if exists "Catalog administrators can insert products" on public.products;
drop policy if exists "Catalog administrators can update products" on public.products;
drop policy if exists "Catalog administrators can delete products" on public.products;
create policy "Catalog administrators can read products"
  on public.products for select to authenticated
  using (public.is_catalog_admin());
create policy "Catalog administrators can insert products"
  on public.products for insert to authenticated
  with check (public.is_catalog_admin());
create policy "Catalog administrators can update products"
  on public.products for update to authenticated
  using (public.is_catalog_admin())
  with check (public.is_catalog_admin());
create policy "Catalog administrators can delete products"
  on public.products for delete to authenticated
  using (public.is_catalog_admin());

create or replace view public.storefront_products
with (security_barrier = true, security_invoker = false)
as
select
  id,
  name,
  price,
  amount,
  category,
  brand,
  caliber,
  "barrelLength",
  image,
  description,
  "createdAt",
  "brandTags",
  "caliberTags",
  "barrelLengthTags"
from public.products;
alter view public.storefront_products owner to postgres;

revoke all on table public.products from public, anon, authenticated;
grant select, insert, update, delete on table public.products to authenticated;
revoke all on table public.storefront_products from public;
grant select on table public.storefront_products to anon, authenticated;
revoke create on schema public from public;
grant usage on schema public to anon, authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'product-images',
  'product-images',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']::text[]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Public product image read" on storage.objects;
drop policy if exists "Authenticated product image management" on storage.objects;
drop policy if exists "Catalog administrators can read product images" on storage.objects;
drop policy if exists "Catalog administrators can upload product images" on storage.objects;
drop policy if exists "Catalog administrators can update product images" on storage.objects;
drop policy if exists "Catalog administrators can delete product images" on storage.objects;
create policy "Catalog administrators can read product images"
  on storage.objects for select to authenticated
  using (bucket_id = 'product-images' and public.is_catalog_admin());
create policy "Catalog administrators can upload product images"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'product-images'
    and public.is_catalog_admin()
    and lower(storage.extension(name)) in ('jpg', 'jpeg', 'png', 'webp', 'gif')
  );
create policy "Catalog administrators can update product images"
  on storage.objects for update to authenticated
  using (bucket_id = 'product-images' and public.is_catalog_admin())
  with check (
    bucket_id = 'product-images'
    and public.is_catalog_admin()
    and lower(storage.extension(name)) in ('jpg', 'jpeg', 'png', 'webp', 'gif')
  );
create policy "Catalog administrators can delete product images"
  on storage.objects for delete to authenticated
  using (bucket_id = 'product-images' and public.is_catalog_admin());

revoke all on table storage.objects from anon;
grant select, insert, update, delete on table storage.objects to authenticated;

commit;
notify pgrst, 'reload schema';

-- Verify the allowlist without exposing it through the browser API:
-- select administrator.user_id, users.email, administrator.created_at, administrator.note
-- from public.catalog_admins administrator
-- join auth.users users on users.id = administrator.user_id;
