-- Functional/security tests in a rollback-only transaction; no test options persist.
begin;
do $$ begin
 if public.normalize_catalog_option('caliber','.410') <> '.410 BORE'
 or public.normalize_catalog_option('caliber','9x19') <> '9×19 MM'
 or public.normalize_catalog_option('caliber','12 gauge') <> '12 GA'
 or public.normalize_catalog_option('caliber','9x19mm') <> '9×19 MM'
 or public.normalize_catalog_option('caliber','.308win') <> '308 WIN'
 or public.normalize_catalog_option('barrelLength','051,50 cm') <> '51.5'
 or public.normalize_catalog_option('barrelLength','130 სმ') <> '130'
 or public.normalize_catalog_option('brand',' hatsan ') <> 'HATSAN'
 then raise exception 'Normalization mismatch'; end if;
end $$;
select set_config('request.jwt.claim.sub',(select user_id::text from public.catalog_admins limit 1),true) is not null as configured_admin;
set local role authenticated;
do $$ declare found text; begin
 if not public.is_catalog_admin() then raise exception 'No administrator configured'; end if;
 insert into public.catalog_options(kind,value) values('brand',' magnum qa registry 20261125 ') returning value into found;
 if found <> 'MAGNUM QA REGISTRY 20261125' then raise exception 'Canonical insert failed'; end if;
 if not exists(select 1 from public.catalog_options where kind='brand' and value=found) then raise exception 'Admin read failed'; end if;
 begin
  insert into public.catalog_options(kind,value) values('brand','Magnum QA Registry 20261125');
  raise exception 'Duplicate was accepted';
 exception when unique_violation then null; end;
 begin
  insert into public.catalog_options(kind,value) values('barrelLength','999');
  raise exception using errcode='P0002',message='Invalid length accepted';
 exception when raise_exception then null; end;
end $$;
reset role;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true) is not null as configured_nonadmin;
set local role authenticated;
do $$ begin
 if exists(select 1 from public.catalog_options) then raise exception 'Nonadmin can read options'; end if;
 begin
  insert into public.catalog_options(kind,value) values('brand','MAGNUM QA FORBIDDEN');
  raise exception 'Nonadmin write accepted';
 exception when insufficient_privilege then null; end;
end $$;
reset role;
set local role anon;
do $$ begin
 begin
  perform * from public.catalog_options;
  raise exception 'Anonymous read accepted';
 exception when insufficient_privilege then null; end;
end $$;
reset role;
rollback;
select 'passed: canonical inserts, duplicates, validation, administrator access and nonadmin/anonymous denial; test rows rolled back' as result;
