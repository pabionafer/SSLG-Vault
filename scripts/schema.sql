-- SSLG-Vault — §04 Database DDL (Supabase / PostgreSQL)
-- 16 tables · 5 roles · money NUMERIC(10,2) · soft delete for Trash
-- NOTE: scripts/migrations/*.sql is the source of truth for databases that
-- already exist; keep this file in sync with every migration.

create extension if not exists pg_trgm;

-- ---------------------------------------------------------------------------
-- 4.1 Tables
-- ---------------------------------------------------------------------------

-- 1. profiles — one row per auth user (replaces the original "users" table)
create table if not exists public.profiles (
  id                   uuid primary key references auth.users(id) on delete cascade,
  username             text not null unique check (char_length(username) between 3 and 30),
  full_name            text not null default '',
  role                 text not null check (role in ('admin','treasurer','president','officer','adviser')),
  is_active            boolean not null default true,
  bio                  text,
  profile_image_url    text,
  pending_username     text,
  username_requested_at timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

-- 2. students
-- NOTE on *_by columns (students.created_by, fees.created_by, payments.created_by,
-- receipts.issued_by, expenses.created_by, income.created_by, clearances.*_by,
-- clearance_items.signed_by, system_settings.updated_by, yearly_balances.prepared_by,
-- collections.prepared_by): they are plain text usernames on purpose. They used to
-- reference profiles(username), which made every approved username change fail
-- with 23503 once the user had created a record (migration 001).
create table if not exists public.students (
  id                bigserial primary key,
  student_no        text not null unique,
  last_name         text not null,
  first_name        text not null,
  middle_name       text,
  year_level        int not null check (year_level between 1 and 6),
  course            text,
  section           text,
  status            text not null default 'enrolled'
                    check (status in ('enrolled','graduated','transferred','dropped')),
  email             text,
  contact_no        text,
  guardian_name     text,
  guardian_contact  text,
  created_by        text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  deleted_at        timestamptz
);

-- 3. categories — shared by fees, expenses and income
create table if not exists public.categories (
  id          bigserial primary key,
  name        text not null,
  type        text not null check (type in ('fee','expense','income','igp')),
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (name, type)
);

-- 4. fees — one fee definition per academic year / semester
create table if not exists public.fees (
  id             bigserial primary key,
  name           text not null,
  category_id    bigint references public.categories(id),
  amount         numeric(10,2) not null check (amount >= 0),
  academic_year  text not null,
  semester       text not null check (semester in ('1st Semester','2nd Semester','Summer')),
  due_date       date,
  description    text,
  is_active      boolean not null default true,
  created_by     text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  deleted_at     timestamptz,
  unique (name, academic_year, semester)
);

-- 5. fee_targets — WHO a fee applies to; EMPTY TARGET SET = applies to everyone
create table if not exists public.fee_targets (
  id          bigserial primary key,
  fee_id      bigint not null references public.fees(id) on delete cascade,
  student_id  bigint references public.students(id) on delete cascade,
  year_level  int check (year_level between 1 and 6),
  created_at  timestamptz not null default now(),
  check (student_id is not null or year_level is not null)
);

-- 6. collections — daily transmittal batches (soft lifecycle: active → inactive → purged)
create table if not exists public.collections (
  id               bigserial primary key,
  collection_date  date not null default current_date,
  academic_year    text not null,
  semester         text not null check (semester in ('1st Semester','2nd Semester','Summer')),
  total_amount     numeric(10,2) not null default 0 check (total_amount >= 0),
  notes            text,
  status           text not null default 'active' check (status in ('active','inactive')),
  deactivated_at   timestamptz,
  prepared_by      text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  deleted_at       timestamptz
);

-- 7. payments — soft delete: deleted_at → (30 days) pending_hard_delete → (7 days) purge
create table if not exists public.payments (
  id                     bigserial primary key,
  receipt_no             text not null unique,
  student_id             bigint not null references public.students(id),
  fee_id                 bigint references public.fees(id),
  collection_id          bigint references public.collections(id),
  amount                 numeric(10,2) not null check (amount > 0),
  payment_date           date not null default current_date,
  mode                   text not null default 'cash'
                         check (mode in ('cash','gcash','bank_transfer','other')),
  reference_no           text,
  academic_year          text not null,
  semester               text check (semester in ('1st Semester','2nd Semester','Summer')),
  status                 text not null default 'posted' check (status in ('posted','void')),
  remarks                text,
  created_by             text,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  deleted_at             timestamptz,
  deleted_by             text,
  delete_reason          text,
  pending_hard_delete    boolean not null default false,
  pending_hard_delete_at timestamptz
);

-- 8. receipts — issued document records (PDF rendered from payment + snapshot)
create table if not exists public.receipts (
  id           bigserial primary key,
  receipt_no   text not null unique,
  payment_id   bigint not null unique references public.payments(id),
  amount       numeric(10,2) not null check (amount > 0),
  snapshot     jsonb not null default '{}'::jsonb,
  issued_at    timestamptz not null default now(),
  issued_by    text
);

-- 9. expenses
create table if not exists public.expenses (
  id             bigserial primary key,
  category_id    bigint references public.categories(id),
  description    text not null,
  amount         numeric(10,2) not null check (amount >= 0),
  expense_date   date not null default current_date,
  voucher_no     text,
  payee          text,
  academic_year  text not null,
  semester       text check (semester in ('1st Semester','2nd Semester','Summer')),
  status         text not null default 'posted' check (status in ('draft','posted','void')),
  created_by     text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  deleted_at     timestamptz
);

-- 10. igps — income-generating projects
create table if not exists public.igps (
  id           bigserial primary key,
  name         text not null unique,
  description  text,
  category_id  bigint references public.categories(id),
  custodian    text,
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz
);

-- 11. income — IGP earnings and other income (donations, rentals, ...)
create table if not exists public.income (
  id             bigserial primary key,
  igp_id         bigint references public.igps(id),
  category_id    bigint references public.categories(id),
  source         text not null default 'other' check (source in ('igp','other')),
  description    text not null,
  amount         numeric(10,2) not null check (amount > 0),
  income_date    date not null default current_date,
  reference_no   text,
  academic_year  text not null,
  semester       text check (semester in ('1st Semester','2nd Semester','Summer')),
  created_by     text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  deleted_at     timestamptz
);

-- 12. clearances — clearance request per student per purpose
create table if not exists public.clearances (
  id             bigserial primary key,
  student_id     bigint not null references public.students(id),
  purpose        text not null,
  academic_year  text,
  status         text not null default 'pending'
                 check (status in ('pending','approved','rejected','released')),
  remarks        text,
  requested_at   timestamptz not null default now(),
  decided_at     timestamptz,
  decided_by     text,
  created_by     text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  deleted_at     timestamptz
);

-- 13. clearance_items — the checklist inside one clearance (kind='fee' rows are auto-computed)
create table if not exists public.clearance_items (
  id            bigserial primary key,
  clearance_id  bigint not null references public.clearances(id) on delete cascade,
  fee_id        bigint references public.fees(id) on delete set null,
  label         text not null,
  kind          text not null default 'manual' check (kind in ('fee','manual')),
  status        text not null default 'pending'
                check (status in ('pending','cleared','not_applicable')),
  remarks       text,
  signed_by     text,
  signed_at     timestamptz,
  created_at    timestamptz not null default now(),
  unique (clearance_id, label)
);

-- 14. audit_log — every create/update/delete and auth event
create table if not exists public.audit_log (
  id           bigserial primary key,
  username     text,
  action       text not null check (action in (
                 'login','logout','create','update','delete','restore','purge',
                 'import','export','approve','reject','void','print','download',
                 'settings_update','username_request','role_change')),
  target_table text,
  target_id    text,
  details      jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now()
);

-- 15. system_settings — academic year, semester, school info (key/value JSON)
create table if not exists public.system_settings (
  id          bigserial primary key,
  key         text not null unique,
  value       jsonb not null,
  description text,
  updated_by  text,
  updated_at  timestamptz not null default now()
);

-- 16. yearly_balances — computed snapshot per academic year
create table if not exists public.yearly_balances (
  id              bigserial primary key,
  academic_year   text not null unique,
  total_income    numeric(12,2) not null default 0,
  total_expenses  numeric(12,2) not null default 0,
  balance         numeric(12,2) not null default 0,
  computed_at     timestamptz not null default now(),
  prepared_by     text
);

-- ---------------------------------------------------------------------------
-- 4.2 Indexes
-- ---------------------------------------------------------------------------

create index if not exists idx_students_last_name        on public.students (lower(last_name));
create index if not exists idx_students_last_name_trgm   on public.students using gin (lower(last_name) gin_trgm_ops);
create index if not exists idx_students_year_level       on public.students (year_level) where deleted_at is null;
create index if not exists idx_fees_year_semester        on public.fees (academic_year, semester) where deleted_at is null;
create index if not exists idx_fee_targets_fee           on public.fee_targets (fee_id);
-- one target row per (fee, student); name must match migration 001
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
create index if not exists idx_payments_student          on public.payments (student_id);
create index if not exists idx_payments_fee              on public.payments (fee_id);
create index if not exists idx_payments_date             on public.payments (payment_date);
create index if not exists idx_payments_collection       on public.payments (collection_id);
create index if not exists idx_payments_cleanup          on public.payments (deleted_at) where deleted_at is not null;
create index if not exists idx_payments_hard_delete      on public.payments (pending_hard_delete_at) where pending_hard_delete = true;
create index if not exists idx_receipts_payment          on public.receipts (payment_id);
create index if not exists idx_expenses_date             on public.expenses (expense_date);
create index if not exists idx_expenses_category         on public.expenses (category_id);
create index if not exists idx_income_date               on public.income (income_date);
create index if not exists idx_income_igp                on public.income (igp_id);
create index if not exists idx_clearances_student        on public.clearances (student_id);
create index if not exists idx_clearance_items_clearance on public.clearance_items (clearance_id);
create index if not exists idx_clearance_items_fee on public.clearance_items (fee_id);
create index if not exists idx_audit_created             on public.audit_log (created_at desc);
create index if not exists idx_audit_username            on public.audit_log (username);
create index if not exists idx_audit_target              on public.audit_log (target_table, target_id);
-- searchable JSON payload (PostgREST rejects details::text inside or() filters,
-- so keyword search goes through this stored generated column)
alter table public.audit_log
  add column if not exists details_text text generated always as (details::text) stored;
create index if not exists idx_audit_details_text        on public.audit_log using gin (details_text gin_trgm_ops);
create index if not exists idx_collections_cleanup       on public.collections (deactivated_at) where status = 'inactive';

-- ---------------------------------------------------------------------------
-- updated_at trigger
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

do $$
declare t text;
begin
  foreach t in array array['profiles','students','categories','fees','collections','payments',
                           'expenses','igps','income','clearances','system_settings']
  loop
    execute format('drop trigger if exists trg_%s_updated on public.%s', t, t);
    execute format('create trigger trg_%s_updated before update on public.%s
                    for each row execute function public.set_updated_at()', t, t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 4.5 Row Level Security — reads are open per table (writes only happen
--     through API routes using the service role), EXCEPT:
--       profiles  → self-only (id = auth.uid())
--       audit_log → no authenticated read (admin routes use service role)
-- ---------------------------------------------------------------------------

do $$
declare t text;
begin
  foreach t in array array['students','categories','fees','fee_targets','collections',
                           'payments','receipts','expenses','igps','income','clearances',
                           'clearance_items','system_settings','yearly_balances']
  loop
    execute format('alter table public.%s enable row level security', t);
    execute format('drop policy if exists authenticated_read on public.%s', t);
    execute format('create policy authenticated_read on public.%s
                    for select to authenticated using (true)', t);
  end loop;

  -- profiles: self-only. The guards read their own row through the cookie
  -- client; giving every authenticated user a blanket read would expose the
  -- whole user table (roles, pending usernames) around the admin API.
  execute format('alter table public.profiles enable row level security');
  execute format('drop policy if exists profiles_self_read on public.profiles');
  execute format('drop policy if exists authenticated_read on public.profiles');
  execute format('create policy profiles_self_read on public.profiles
                  for select to authenticated using (id = (select auth.uid()))');

  -- audit_log: no authenticated read at all — admin routes use the service role.
  execute format('alter table public.audit_log enable row level security');
  execute format('drop policy if exists authenticated_read on public.audit_log');
end $$;

-- ---------------------------------------------------------------------------
-- 4.6 Business functions (atomic receipt numbering, collection totals)
--     Names/bodies must match scripts/migrations/*.sql.
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

revoke execute on function public.next_receipt_no() from public;
grant  execute on function public.next_receipt_no() to service_role;
revoke execute on function public.recompute_collection_total(bigint) from public;
grant  execute on function public.recompute_collection_total(bigint) to service_role;

-- ---------------------------------------------------------------------------
-- 4.7 Seed data
-- ---------------------------------------------------------------------------

insert into public.categories (name, type) values
  ('Tuition Fee',      'fee'),
  ('Miscellaneous Fee','fee'),
  ('Laboratory Fee',   'fee'),
  ('Athletic Fee',     'fee'),
  ('School Supplies',  'expense'),
  ('Events',           'expense'),
  ('Utilities',        'expense'),
  ('Transportation',   'expense'),
  ('Salaries',         'expense'),
  ('Canteen Sales',    'igp'),
  ('Sari-sari Store',  'igp'),
  ('Printing Services','igp'),
  ('Donations',        'income'),
  ('Rentals',          'income'),
  ('Interest',         'income')
on conflict (name, type) do nothing;

insert into public.system_settings (key, value, description) values
  ('academic_year', '"2026-2027"', 'Active academic year'),
  ('semester',      '"1st Semester"', 'Active semester'),
  ('school_name',   '"SSLG College"', 'School / organization name'),
  ('school_address','""', 'Official address printed on receipts and reports'),
  ('treasurer_name','""', 'Treasurer name printed on reports'),
  ('or_series_start','"000001"', 'Next official receipt number')
on conflict (key) do nothing;
