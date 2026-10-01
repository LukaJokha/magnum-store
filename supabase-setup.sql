-- Run this entire file once in Supabase: SQL Editor → New query → Run.
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
  source text
);

-- Optional product attributes are stored as empty strings, never the literal value "null".
update public.products set brand = coalesce(brand, ''), caliber = coalesce(caliber, ''), "barrelLength" = coalesce("barrelLength", ''), description = coalesce(description, '');
alter table public.products alter column brand set default '';
alter table public.products alter column caliber set default '';
alter table public.products alter column "barrelLength" set default '';
alter table public.products alter column description set default '';

alter table public.products enable row level security;
drop policy if exists "Public catalog read" on public.products;
drop policy if exists "Authenticated catalog management" on public.products;
create policy "Public catalog read" on public.products for select using (true);
create policy "Authenticated catalog management" on public.products for all to authenticated using (true) with check (true);

insert into storage.buckets (id, name, public) values ('product-images', 'product-images', true)
on conflict (id) do update set public = true;
drop policy if exists "Public product image read" on storage.objects;
drop policy if exists "Authenticated product image management" on storage.objects;
create policy "Public product image read" on storage.objects for select using (bucket_id = 'product-images');
create policy "Authenticated product image management" on storage.objects for all to authenticated using (bucket_id = 'product-images') with check (bucket_id = 'product-images');
