-- SSLG-Vault migration 001 — critical fixes (audit findings 1-4, schema side)
-- Applied by scripts/migrate.mjs inside one transaction, tracked in schema_migrations.
-- Mirror of these changes also lives in scripts/schema.sql (fresh installs).

-- ---------------------------------------------------------------------------
-- 1. Drop every FK that references profiles(username).
--    Username is a mutable display/audit field; these FKs made any approved
--    username change fail with 23503 once the user had created any record.
--    *_by columns keep their values as plain text (audit trail stays intact).
-- ---------------------------------------------------------------------------
alter table public.students        drop constraint if exists students_created_by_fkey;
alter table public.fees            drop constraint if exists fees_created_by_fkey;
alter table public.collections     drop constraint if exists collections_prepared_by_fkey;
alter table public.payments        drop constraint if exists payments_created_by_fkey;
alter table public.receipts        drop constraint if exists receipts_issued_by_fkey;
alter table public.expenses        drop constraint if exists expenses_created_by_fkey;
alter table public.income          drop constraint if exists income_created_by_fkey;
alter table public.clearances      drop constraint if exists clearances_created_by_fkey;
alter table public.clearances      drop constraint if exists clearances_decided_by_fkey;
alter table public.clearance_items drop constraint if exists clearance_items_signed_by_fkey;
alter table public.system_settings drop constraint if exists system_settings_updated_by_fkey;
alter table public.yearly_balances drop constraint if exists yearly_balances_prepared_by_fkey;

-- ---------------------------------------------------------------------------
-- 2. fee_targets: one row per (fee, student). Duplicates were accepted because
--    no constraint existed (the "Duplicate targets" branch was dead code).
--    year_level-targeted rows have student_id NULL, so they are unaffected.
-- ---------------------------------------------------------------------------
delete from public.fee_targets
 where student_id is not null
   and id not in (
     select min(id)
       from public.fee_targets
      where student_id is not null
      group by fee_id, student_id
   );

-- Idempotent: fresh installs already got this constraint from schema.sql.
do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'fee_targets_fee_student_key'
       and connamespace = 'public'::regnamespace
  ) then
    alter table public.fee_targets
      add constraint fee_targets_fee_student_key unique (fee_id, student_id);
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 3. audit_log keyword search: PostgREST rejects details::text inside .or()
--    horizontal filters, so every keyword search returned 400. A stored
--    generated text column makes the JSON searchable + trigram-indexable.
-- ---------------------------------------------------------------------------
alter table public.audit_log
  add column if not exists details_text text generated always as (details::text) stored;

create index if not exists idx_audit_details_text
  on public.audit_log using gin (details_text gin_trgm_ops);

-- ---------------------------------------------------------------------------
-- 4. RLS tightening: any authenticated user could read the whole audit log
--    and the whole profiles table straight through PostgREST, bypassing the
--    admin-only API routes. profiles is now self-only; audit_log has no
--    authenticated policy at all (the app reads it with the service role).
-- ---------------------------------------------------------------------------
drop policy if exists authenticated_read on public.profiles;
drop policy if exists authenticated_read on public.audit_log;
drop policy if exists profiles_self_read on public.profiles;

create policy profiles_self_read on public.profiles
  for select to authenticated
  using (id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- 5. Atomic receipt number allocation (replaces the read-modify-write in
--    lib/receipt-no.ts that raced under concurrency and ignored update errors).
--    Returns the number to use and advances the stored counter under a row
--    lock. Only the service role may execute it.
-- ---------------------------------------------------------------------------
create or replace function public.next_receipt_no() returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  raw   text;
  cur   bigint;
  width int;
  nextv text;
begin
  select value #>> '{}' into raw
    from public.system_settings
   where key = 'or_series_start'
     for update;

  if raw is null then
    insert into public.system_settings (key, value, description)
    values ('or_series_start', '"000001"', 'Next official receipt number')
    on conflict (key) do nothing;
    select value #>> '{}' into raw
      from public.system_settings
     where key = 'or_series_start'
       for update;
  end if;

  cur   := coalesce(nullif(regexp_replace(coalesce(raw, ''), '\D', '', 'g'), '')::bigint, 0);
  width := greatest(length(coalesce(raw, '')), 6);
  nextv := lpad((cur + 1)::text, width, '0');

  update public.system_settings
     set value = to_jsonb(nextv)
   where key = 'or_series_start';

  return lpad(cur::text, width, '0');
end;
$$;

revoke execute on function public.next_receipt_no() from public;
grant  execute on function public.next_receipt_no() to service_role;

-- ---------------------------------------------------------------------------
-- 6. collections.total_amount: single-statement recompute from live posted,
--    non-deleted payments (replaces 6 unlocked read-modify-write sites).
-- ---------------------------------------------------------------------------
create or replace function public.recompute_collection_total(p_id bigint) returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  total numeric;
begin
  update public.collections
     set total_amount = coalesce(
           (select sum(amount)
              from public.payments
             where collection_id = p_id
               and deleted_at is null
               and status = 'posted'), 0)
   where id = p_id
   returning total_amount into total;
  return coalesce(total, 0);
end;
$$;

revoke execute on function public.recompute_collection_total(bigint) from public;
grant  execute on function public.recompute_collection_total(bigint) to service_role;

-- ---------------------------------------------------------------------------
-- 7. receipts.amount must be > 0, like payments.amount (a receipt could
--    otherwise exist for an amount no payment can have).
-- ---------------------------------------------------------------------------
alter table public.receipts drop constraint if exists receipts_amount_check;
alter table public.receipts add constraint receipts_amount_check check (amount > 0);
