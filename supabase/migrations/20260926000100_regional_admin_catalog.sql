-- Regional admin catalog management.
--
-- 1. knowledge.aid_schemes.aid_kind splits the "Aid Schemes" and "Scholarships" admin views over
--    the one table. Existing rows are backfilled by name keyword; admins can correct a row from
--    the edit form afterwards.
-- 2. operations.admin_idempotency_keys makes every retryable admin create/bulk-publish safe to
--    replay (AGENTS.md: "Every retryable write accepts an idempotency key").
--
-- The 'regional_admin' staff role needs no schema change: operations.staff_role_assignments.role
-- is free text and its scope ({"state":"Tamil Nadu"}) lives in the existing scope_json column.

alter table knowledge.aid_schemes
  add column if not exists aid_kind text not null default 'aid';

alter table knowledge.aid_schemes
  drop constraint if exists aid_schemes_aid_kind_check;
alter table knowledge.aid_schemes
  add constraint aid_schemes_aid_kind_check check (aid_kind in ('aid', 'scholarship'));

update knowledge.aid_schemes
set aid_kind = 'scholarship'
where aid_kind = 'aid'
  and name ~* '(scholarship|fellowship|stipend)';

comment on column knowledge.aid_schemes.aid_kind is 'aid | scholarship — which regional-admin screen lists the scheme';

create table if not exists operations.admin_idempotency_keys (
  idempotency_key uuid primary key,
  admin_user_id uuid not null,
  operation text not null,
  response_json jsonb not null,
  created_at timestamptz not null default now()
);

comment on table operations.admin_idempotency_keys is 'Replay cache for regional-admin create/bulk-publish requests';
