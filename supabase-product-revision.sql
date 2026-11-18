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
