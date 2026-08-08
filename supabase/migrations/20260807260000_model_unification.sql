-- Model unification (#01): a configurable alias dictionary so different supplier
-- names for the same phone collapse to one canonical model name ("IP15",
-- "Apple iPhone 15" -> "iPhone 15"). Reuses import_synonyms with a new
-- kind='model_value' (synonym = raw alias, maps_to = canonical name), mirroring
-- the carrier_value pattern. omp_fold_model canonicalizes a raw model; the
-- import wizard folds new rows after commit, and apply_model_aliases
-- re-canonicalizes the existing catalog immediately when the admin edits the
-- dictionary. Applied live via MCP; this file keeps local + remote in lockstep.
alter table public.import_synonyms drop constraint if exists import_synonyms_kind_check;
alter table public.import_synonyms
  add constraint import_synonyms_kind_check check (kind in ('header', 'carrier_value', 'model_value'));

create or replace function public.omp_fold_model(p_raw text)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_norm   text := lower(regexp_replace(coalesce(p_raw, ''), '[^a-zA-Z0-9]', '', 'g'));
  v_mapped text;
begin
  if v_norm = '' then
    return trim(coalesce(p_raw, ''));
  end if;
  select maps_to into v_mapped
  from public.import_synonyms
  where kind = 'model_value'
    and maps_to is not null
    and lower(regexp_replace(synonym, '[^a-zA-Z0-9]', '', 'g')) = v_norm
  limit 1;
  return coalesce(nullif(trim(v_mapped), ''), trim(p_raw));
end;
$$;

comment on function public.omp_fold_model(text) is
  'Folds a raw supplier model string to its canonical name via import_synonyms (kind=model_value), case/spacing/punctuation-insensitively. Returns the trimmed raw when no alias matches.';

revoke execute on function public.omp_fold_model(text) from public, anon;
grant execute on function public.omp_fold_model(text) to authenticated;

create or replace function public.apply_model_aliases()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare v_count integer;
begin
  if not public.is_admin_or_staff() then
    raise exception 'staff_only' using errcode = '42501';
  end if;
  with upd as (
    update public.products p
       set model = public.omp_fold_model(p.model), updated_at = now()
     where public.omp_fold_model(p.model) is distinct from p.model
    returning 1
  )
  select count(*) into v_count from upd;
  return v_count;
end;
$$;

revoke execute on function public.apply_model_aliases() from public, anon;
grant execute on function public.apply_model_aliases() to authenticated;
