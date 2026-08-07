-- 0005_audit_log.sql
-- audit_log + ai_actions.

create type actor_kind        as enum ('user', 'system', 'ai_agent');
create type ai_action_status  as enum ('proposed', 'approved', 'applied', 'rejected', 'rolled_back');

create table public.ai_actions (
  id                      uuid primary key default gen_random_uuid(),
  agent_code              text not null,
  proposed_by_run_id      uuid,
  target_table            text not null,
  target_id               uuid not null,
  proposal                jsonb not null,
  rationale               text not null,
  rollback_metadata       jsonb not null default '{}'::jsonb,
  status                  ai_action_status not null default 'proposed',
  approved_by_user_id     uuid references public.users(id),
  applied_at              timestamptz,
  created_at              timestamptz not null default now()
);

create index idx_ai_actions_status on public.ai_actions (status, created_at desc);

create table public.audit_log (
  id              uuid primary key default gen_random_uuid(),
  actor_user_id   uuid references public.users(id),
  actor_kind      actor_kind not null,
  action          text not null,
  target_table    text not null,
  target_id       uuid not null,
  before          jsonb,
  after           jsonb,
  ip              inet,
  user_agent      text,
  created_at      timestamptz not null default now()
);

create index idx_audit_log_target on public.audit_log (target_table, target_id, created_at desc);
create index idx_audit_log_time_brin on public.audit_log using brin (created_at);

-- RLS
alter table public.ai_actions enable row level security;
alter table public.audit_log  enable row level security;

create policy "ai_actions admin read"
  on public.ai_actions for select using (public.is_admin_or_staff());

-- ai_actions writes via service_role (AI service inserts proposals);
-- admin approves/rejects via app code which uses service_role.

create policy "audit_log admin read"
  on public.audit_log for select using (public.is_admin());

-- audit_log writes are service_role only.
