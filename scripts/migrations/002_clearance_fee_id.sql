-- 002 — key clearance fee items by fee_id, not label.
-- Matching by fee name breaks when two fees share a name or a fee is
-- renamed: the checklist silently stops tracking the fee.

alter table public.clearance_items
  add column if not exists fee_id bigint references public.fees(id) on delete set null;

create index if not exists idx_clearance_items_fee on public.clearance_items (fee_id);

-- Backfill: match existing fee items to fees by label (name).
update public.clearance_items ci
set fee_id = f.id
from public.fees f
where ci.kind = 'fee'
  and ci.fee_id is null
  and f.deleted_at is null
  and ci.label = f.name
  and not exists (
    select 1 from public.clearance_items ci2
    where ci2.clearance_id = ci.clearance_id
      and ci2.kind = 'fee'
      and ci2.fee_id = f.id
  );
