-- Before running this file, replace REPLACE_WITH_OWNER_EMAIL below with the
-- existing Supabase Authentication email of the store owner. The transaction
-- aborts without changing access policies if the account cannot be found.
begin;

create table if not exists public.products (
  id text primary key,
  name text not null,
  price text not null,
  amount numeric not null default 0,
  category text not null,
  brand text,
  caliber text,
  "barrelLength" text,
  image text not null,
  description text,
  "createdAt" timestamptz default now(),
  source text,
  "brandTags" jsonb not null default '[]'::jsonb,
  "caliberTags" jsonb not null default '[]'::jsonb,
  "barrelLengthTags" jsonb not null default '[]'::jsonb,
  "brandStatus" text not null default 'unverified',
  "sourcePrice" text not null default ''
);

alter table public.products add column if not exists "brandTags" jsonb not null default '[]'::jsonb;
alter table public.products add column if not exists "caliberTags" jsonb not null default '[]'::jsonb;
alter table public.products add column if not exists "barrelLengthTags" jsonb not null default '[]'::jsonb;
alter table public.products add column if not exists "brandStatus" text not null default 'unverified';
alter table public.products add column if not exists "sourcePrice" text not null default '';

-- Optional product attributes are stored as empty strings, never the literal value "null".
update public.products set brand = coalesce(brand, ''), caliber = coalesce(caliber, ''), "barrelLength" = coalesce("barrelLength", ''), description = coalesce(description, '');
alter table public.products alter column brand set default '';
alter table public.products alter column caliber set default '';
alter table public.products alter column "barrelLength" set default '';
alter table public.products alter column description set default '';

-- Staff access is an explicit allowlist. This table intentionally has no client
-- policies or grants; add/remove administrators only from the SQL Editor.
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

-- The public storefront can see only this fixed list of fields. The definer
-- view is deliberate: anonymous users receive no privileges on products.
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

-- Apply once in Supabase SQL Editor. Keeps product data and access policies unchanged.
begin;
alter table public.products add column if not exists revision bigint not null default 1;
create or replace function public.bump_product_revision()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.revision := old.revision + 1;
  return new;
end;
$$;
create or replace trigger products_revision_before_update
before update on public.products
for each row execute function public.bump_product_revision();
commit;

-- Run once as project owner. Adds an admin-only vocabulary without changing products.
begin;
create or replace function public.normalize_catalog_option(p_kind text, p_value text)
returns text language plpgsql immutable set search_path = '' as $$
declare v text; compact text; parts text[];
begin
 if p_kind not in ('brand','caliber','barrelLength') or p_kind is null then raise exception 'Invalid option kind'; end if;
 v := upper(regexp_replace(trim(normalize(coalesce(p_value,''), NFKC)), '\s+', ' ', 'g'));
 if v = '' or length(v) > 80 or v ~ '[<>[:cntrl:]]' then raise exception 'Invalid option value'; end if;
 if p_kind = 'barrelLength' then
  v := trim(replace(regexp_replace(v, '\s*(CM|სმ|ᲡᲛ)$', ''), ',', '.'));
  if v !~ '^\d+(\.\d{1,2})?$' then raise exception 'Use centimeters, up to two decimals'; end if;
  if v::numeric <= 0 or v::numeric > 130 then raise exception 'Invalid barrel length'; end if;
  return trim(trailing '.' from trim(trailing '0' from (v::numeric * 1.00)::numeric(8,2)::text));
 end if;
 if p_kind = 'caliber' then
  v := regexp_replace(replace(v, ',', '.'), '\s*[X×]\s*(?=\d)', '×', 'g');
  compact := regexp_replace(regexp_replace(v, '\s+', '', 'g'), '^\.(?=\d)', '');
  if compact ~ '^(410|0\.410)(BORE|GAUGE|GA|CAL)?$' then return '.410 BORE'; end if;
  if compact = '9MMLUGER' then return '9×19 MM'; end if;
  if compact ~ '^\d+(\.\d+)?×\d+(\.\d+)?(MM)?$' then return regexp_replace(compact, 'MM$', '') || ' MM'; end if;
  parts := regexp_match(compact, '^(10|12|16|20|24|28|32)(GAUGE|GA|CAL)$');
  if parts is not null then return parts[1] || ' GA'; end if;
  parts := regexp_match(compact, '^(17|22)(LR|WMR|HMR|WSM)$');
  if parts is not null then return parts[1] || ' ' || parts[2]; end if;
  v := regexp_replace(v, '^\.(?=\d)', '');
  v := regexp_replace(v, '(\d)\s*MM\y', '\1 MM', 'g');
  v := regexp_replace(v, '^(\d+(\.\d+)?)(WIN|REM|MAG|SPL|ACP|COLT)\y', '\1 \3');
  if v !~ '\d' then raise exception 'Caliber must include a number'; end if;
 end if;
 return v;
end $$;
revoke all on function public.normalize_catalog_option(text,text) from public;
grant execute on function public.normalize_catalog_option(text,text) to authenticated;

create table if not exists public.catalog_options (
 id bigint generated always as identity primary key,
 kind text not null check (kind in ('brand','caliber','barrelLength')),
 value text not null check (value = public.normalize_catalog_option(kind,value)),
 created_at timestamptz not null default now(),
 unique(kind,value)
);
alter table public.catalog_options enable row level security;
revoke all on public.catalog_options from public, anon, authenticated;
grant select, insert on public.catalog_options to authenticated;
grant usage on sequence public.catalog_options_id_seq to authenticated;
create or replace function public.canonicalize_catalog_option()
returns trigger language plpgsql set search_path = '' as $$
begin new.value := public.normalize_catalog_option(new.kind,new.value); return new; end $$;
create or replace trigger canonicalize_catalog_option before insert or update on public.catalog_options
for each row execute function public.canonicalize_catalog_option();
drop policy if exists "Catalog administrators read options" on public.catalog_options;
drop policy if exists "Catalog administrators add options" on public.catalog_options;
create policy "Catalog administrators read options" on public.catalog_options for select to authenticated using (public.is_catalog_admin());
create policy "Catalog administrators add options" on public.catalog_options for insert to authenticated with check (public.is_catalog_admin());

insert into public.catalog_options(kind,value)
select distinct attributes.kind, public.normalize_catalog_option(attributes.kind, vals.value)
from public.products p
cross join lateral (values
 ('brand', coalesce(p."brandTags",'[]'::jsonb) || jsonb_build_array(p.brand)),
 ('caliber', coalesce(p."caliberTags",'[]'::jsonb) || jsonb_build_array(p.caliber)),
 ('barrelLength', coalesce(p."barrelLengthTags",'[]'::jsonb) || jsonb_build_array(p."barrelLength"))
) attributes(kind, items)
cross join lateral jsonb_array_elements_text(attributes.items) vals(value)
where coalesce(trim(vals.value),'') <> ''
on conflict(kind,value) do nothing;
commit;
notify pgrst, 'reload schema';
select kind,count(*) as options from public.catalog_options group by kind order by kind;
