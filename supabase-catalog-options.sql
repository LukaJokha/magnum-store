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
