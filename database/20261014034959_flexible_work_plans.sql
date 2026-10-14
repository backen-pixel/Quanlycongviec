-- Opt-in Work Unified production plans; legacy tasks/pipelines remain unchanged.
-- Browser roles have no direct access. Backend validates tenant, project and actor.
create table public.work_plan_instances (
  project_id uuid primary key references public.projects(id) on delete restrict,
  company_id uuid not null,
  revision integer not null check (revision > 0),
  document jsonb not null check (jsonb_typeof(document) = 'object'),
  updated_at timestamptz not null default now()
);
create table public.work_plan_versions (
  project_id uuid not null references public.work_plan_instances(project_id) on delete restrict,
  revision integer not null,
  document jsonb not null,
  created_at timestamptz not null default now(),
  primary key(project_id, revision)
);
create table public.work_plan_template_versions (
  template_id uuid not null,
  version integer not null check (version > 0),
  company_id uuid not null,
  document jsonb not null,
  created_at timestamptz not null default now(),
  primary key(template_id, version)
);
create index work_plan_templates_company on public.work_plan_template_versions(company_id, created_at desc);
create table public.work_plan_commands (
  command_id uuid primary key,
  aggregate_id uuid not null,
  company_id uuid not null,
  actor_id uuid not null,
  kind text not null check (kind in ('plan','template')),
  request_hash text not null,
  revision integer not null,
  result jsonb not null,
  created_at timestamptz not null default now()
);
alter table public.work_plan_instances enable row level security;
alter table public.work_plan_versions enable row level security;
alter table public.work_plan_template_versions enable row level security;
alter table public.work_plan_commands enable row level security;
revoke all on public.work_plan_instances, public.work_plan_versions, public.work_plan_template_versions, public.work_plan_commands from public, anon, authenticated;
grant select on public.work_plan_instances, public.work_plan_versions, public.work_plan_template_versions, public.work_plan_commands to service_role;
grant insert, update on public.work_plan_instances to service_role;
grant insert on public.work_plan_versions, public.work_plan_template_versions, public.work_plan_commands to service_role;

create or replace function public.work_plan_commit(
  p_kind text, p_id uuid, p_company uuid, p_actor uuid, p_expected integer,
  p_command uuid, p_hash text, p_document jsonb
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare existing public.work_plan_commands%rowtype; actual integer; owner_company uuid; result jsonb;
begin
  if p_kind not in ('plan','template') or p_expected < 0 or p_document is null
    or p_company is null or p_actor is null or p_command is null or p_hash is null then
    raise exception 'Invalid command';
  end if;
  -- Lock command first, aggregate second: replay and concurrent creation are atomic.
  perform pg_advisory_xact_lock(hashtextextended(p_command::text, 0));
  select * into existing from public.work_plan_commands where command_id = p_command;
  if found then
    if existing.request_hash <> p_hash or existing.actor_id <> p_actor or existing.company_id <> p_company
      or existing.aggregate_id <> p_id or existing.kind <> p_kind then
      raise exception 'Idempotency key reused' using errcode = 'P0002';
    end if;
    return existing.result;
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_kind || ':' || p_id::text, 1));
  if p_kind = 'plan' then
    select revision, company_id into actual, owner_company from public.work_plan_instances where project_id = p_id;
  else
    select version, company_id into actual, owner_company from public.work_plan_template_versions
      where template_id = p_id order by version desc limit 1;
  end if;
  if owner_company is not null and owner_company <> p_company then raise exception 'Company denied' using errcode = '42501'; end if;
  if coalesce(actual,0) <> p_expected then raise exception 'Revision conflict' using errcode = '40001'; end if;
  actual := p_expected + 1;
  result := jsonb_build_object('revision', actual, 'document', p_document);
  if p_kind = 'plan' then
    insert into public.work_plan_instances(project_id,company_id,revision,document) values(p_id,p_company,actual,p_document)
      on conflict(project_id) do update set revision = excluded.revision, document = excluded.document, updated_at = now();
    insert into public.work_plan_versions(project_id,revision,document) values(p_id,actual,p_document);
  else
    insert into public.work_plan_template_versions(template_id,version,company_id,document) values(p_id,actual,p_company,p_document);
  end if;
  insert into public.work_plan_commands(command_id,aggregate_id,company_id,actor_id,kind,request_hash,revision,result)
    values(p_command,p_id,p_company,p_actor,p_kind,p_hash,actual,result);
  return result;
end;
$$;
revoke all on function public.work_plan_commit(text,uuid,uuid,uuid,integer,uuid,text,jsonb) from public, anon, authenticated;
grant execute on function public.work_plan_commit(text,uuid,uuid,uuid,integer,uuid,text,jsonb) to service_role;
comment on table public.work_plan_instances is 'Canonical execution for explicitly opted-in Work Unified production plans; never mirrored into CRM tasks.';
