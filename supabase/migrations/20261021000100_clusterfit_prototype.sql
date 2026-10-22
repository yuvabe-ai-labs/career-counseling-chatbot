-- Clusterfit plug-in (docs/clusterfit-prototype-plan.md §18.3): the Pathfinder career-cluster flow.
--
-- Creates a separate `clusterfit` schema with 6 tables and nothing else. No core table is altered.
-- References out: auth.users (on delete cascade, so user deletion and wipes keep working) and
-- assessment.journey_sessions (on delete set null). Questions and the answer key are versioned
-- TypeScript in packages/clusterfit/src/content; answers are stored raw so a key fix or new weights
-- only need a re-score. Removal: packages/clusterfit/sql/down.sql.

create schema if not exists clusterfit;

-- 1. One attempt by one student
create table if not exists clusterfit.sessions (
  id                 uuid primary key,
  user_id            uuid not null references auth.users (id) on delete cascade,
  journey_session_id uuid references assessment.journey_sessions (id) on delete set null,
  content_version    text not null,
  grade_path         text check (grade_path in ('9_10', '11_12')),
  status             text not null default 'in_progress'
                     check (status in ('in_progress', 'scored', 'abandoned')),
  live_tokens_issued smallint not null default 0,
  coverage_checks    smallint not null default 0,
  attempt_number     smallint not null default 1,
  idempotency_key    uuid unique,
  started_at         timestamptz not null default now(),
  last_answered_at   timestamptz,
  scored_at          timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index if not exists sessions_user_started_idx on clusterfit.sessions (user_id, started_at desc);
comment on table clusterfit.sessions is 'One clusterfit attempt; grade_path comes from the confirmed class';

-- 2a. Part A + E raw chat captures, exactly as extracted; never edited
create table if not exists clusterfit.situation_captures (
  id                   uuid primary key,
  session_id           uuid not null references clusterfit.sessions (id) on delete cascade,
  source               text not null check (source in ('live', 'form')),
  field_schema_version text not null,
  raw_fields_json      jsonb not null check (jsonb_typeof(raw_fields_json) = 'object'),
  derived_json         jsonb not null default '{}',
  transcript_text      text,
  wellbeing_flag       boolean not null default false,
  idempotency_key      uuid unique,
  captured_at          timestamptz not null default now()
);
create index if not exists situation_captures_session_idx on clusterfit.situation_captures (session_id, captured_at desc);
comment on table clusterfit.situation_captures is 'Append-only chat captures; raw_fields_json keeps unknown keys';

-- 2b. Current Part A + E view (class, values, other fields) after the chat and confirm card
create table if not exists clusterfit.situations (
  session_id        uuid primary key references clusterfit.sessions (id) on delete cascade,
  latest_capture_id uuid references clusterfit.situation_captures (id) on delete set null,
  canonical_json    jsonb not null,
  canonical_version text not null,
  mapper_version    text,
  missing_fields    text[] not null default '{}',
  unmapped_fields   text[] not null default '{}',
  student_edited    boolean not null default false,
  updated_at        timestamptz not null default now()
);
comment on table clusterfit.situations is 'Current canonical Part A + E view per session';

-- 3. Part B/C/D answers, stored raw (reversing and marking happen at scoring time)
create table if not exists clusterfit.responses (
  id              uuid primary key,
  session_id      uuid not null references clusterfit.sessions (id) on delete cascade,
  part            char(1) not null check (part in ('B', 'C', 'D')),
  item_key        text not null,
  value           smallint,
  option_key      char(1) check (option_key in ('A', 'B', 'C', 'D')),
  latency_ms      integer,
  idempotency_key uuid unique,
  answered_at     timestamptz not null,
  received_at     timestamptz not null default now(),
  unique (session_id, item_key),
  check (
    (part = 'B' and value between 0 and 2 and option_key is null) or
    (part = 'D' and value between 0 and 3 and option_key is null) or
    (part = 'C' and value is null)
  )
);
comment on table clusterfit.responses is 'Part B (0–2), C (option letter, null = skipped), D (0–3 as ticked)';

-- 4. Part E top 3 (unscored), from the chat or the confirm card
create table if not exists clusterfit.values_rankings (
  session_id   uuid primary key references clusterfit.sessions (id) on delete cascade,
  ranking_json jsonb,
  updated_at   timestamptz not null default now()
);
comment on table clusterfit.values_rankings is 'Part E: up to 3 of the 9 value cards with ranks';

-- 5. Scoring output: versioned and re-scorable
create table if not exists clusterfit.results (
  id              uuid primary key,
  session_id      uuid not null references clusterfit.sessions (id) on delete cascade,
  user_id         uuid not null,
  content_version text not null,
  scoring_version text not null,
  input_hash      text not null,
  result_json     jsonb not null,
  is_current      boolean not null default true,
  created_at      timestamptz not null default now(),
  unique (session_id, input_hash)
);
create unique index if not exists results_current_idx on clusterfit.results (session_id) where is_current;
comment on table clusterfit.results is 'ClusterfitResult per scoring run; a re-score adds a row and flips is_current';
