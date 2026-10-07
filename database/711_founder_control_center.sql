-- Founder Control Center: candidate only, never apply to production in this task.
-- Requires tenants/companies/users/external_api_keys/audit_log. No scheduler or intake writer.
BEGIN;
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='30s';
CREATE TABLE IF NOT EXISTS public.founder_objectives (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  company_id uuid NOT NULL REFERENCES public.companies(id),
  owner_id uuid NOT NULL REFERENCES public.users(id),
  title text NOT NULL CHECK(length(btrim(title)) BETWEEN 1 AND 200),
  metric text NOT NULL CHECK(metric IN ('QUALIFIED_PAID_LEADS','FIRST_RESPONSE_SLA')),
  target numeric NOT NULL CHECK(target BETWEEN 0 AND 1000000000),
  CHECK((metric='FIRST_RESPONSE_SLA' AND target<=100) OR (metric='QUALIFIED_PAID_LEADS' AND target=trunc(target))),
  window_start timestamptz NOT NULL, window_end timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'DRAFT' CHECK(status IN ('DRAFT','APPROVED','REJECTED')),
  version integer NOT NULL DEFAULT 1 CHECK(version>0),
  created_by uuid NOT NULL REFERENCES public.users(id),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK(window_end>window_start AND window_end-window_start<=interval '31 days'),
  UNIQUE(tenant_id,company_id,id)
);
CREATE TABLE IF NOT EXISTS public.founder_proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL, company_id uuid NOT NULL,
  objective_id uuid NOT NULL,
  action text NOT NULL CHECK(action='OBJECTIVE_REVIEW'),
  version integer NOT NULL DEFAULT 1 CHECK(version>0),
  payload jsonb NOT NULL CHECK(jsonb_typeof(payload)='object'),
  digest text NOT NULL CHECK(digest ~ '^[a-f0-9]{64}$'),
  state text NOT NULL DEFAULT 'PENDING' CHECK(state IN ('PENDING','DECIDED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(tenant_id,company_id,objective_id) REFERENCES public.founder_objectives(tenant_id,company_id,id),
  UNIQUE(tenant_id,company_id,id)
);
CREATE TABLE IF NOT EXISTS public.founder_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL, company_id uuid NOT NULL, proposal_id uuid NOT NULL UNIQUE,
  proposal_version integer NOT NULL, proposal_digest text NOT NULL,
  decision text NOT NULL CHECK(decision IN ('APPROVE','REJECT')),
  reason text NOT NULL CHECK(length(btrim(reason)) BETWEEN 1 AND 500),
  actor_id uuid NOT NULL REFERENCES public.users(id), key_id uuid NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(tenant_id,company_id,proposal_id) REFERENCES public.founder_proposals(tenant_id,company_id,id)
);
CREATE TABLE IF NOT EXISTS public.founder_command_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, company_id uuid NOT NULL,
  request_id text NOT NULL CHECK(length(request_id) BETWEEN 8 AND 100),
  actor_id uuid NOT NULL, key_id uuid NOT NULL, command text NOT NULL, payload jsonb NOT NULL,
  result jsonb NOT NULL, recorded_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(company_id,request_id)
);
ALTER TABLE public.founder_objectives ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.founder_proposals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.founder_decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.founder_command_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.founder_objectives,public.founder_proposals,public.founder_decisions,public.founder_command_receipts FROM PUBLIC,anon,authenticated,service_role;
-- Only the guarded security-definer command may write these records.
GRANT SELECT ON public.founder_objectives,public.founder_proposals,public.founder_decisions,public.founder_command_receipts TO service_role;
CREATE INDEX IF NOT EXISTS founder_objectives_scope ON public.founder_objectives(tenant_id,company_id,created_at);
CREATE INDEX IF NOT EXISTS founder_proposals_scope ON public.founder_proposals(tenant_id,company_id,created_at);
CREATE INDEX IF NOT EXISTS founder_decisions_scope ON public.founder_decisions(tenant_id,company_id,recorded_at);

CREATE OR REPLACE FUNCTION public.founder_control_command_v1(
 p_key_id uuid,p_actor_id uuid,p_company_id uuid,p_tenant_id uuid,
 p_request_id text,p_command text,p_payload jsonb,p_credential_digest text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
SET lock_timeout='3s' SET statement_timeout='10s' AS $$
DECLARE k public.external_api_keys; a public.users; c public.companies; tenant_row public.tenants; owner_row public.users;
 receipt public.founder_command_receipts; objective public.founder_objectives; proposal public.founder_proposals;
 result jsonb; new_id uuid; proposal_payload jsonb;
BEGIN
 -- SECURITY DEFINER uses session JWT role (PostgREST) or SET ROLE caller, never current_user.
 IF coalesce(nullif(current_setting('role',true),'none'),session_user::text)<>'service_role' THEN
   RAISE EXCEPTION 'PERMISSION_DENIED' USING ERRCODE='42501';
 END IF;
 IF p_request_id IS NULL OR length(p_request_id) NOT BETWEEN 8 AND 100 OR jsonb_typeof(p_payload) IS DISTINCT FROM 'object' THEN
   RAISE EXCEPTION 'INVALID_ARGUMENTS' USING ERRCODE='22023';
 END IF;
 SELECT * INTO k FROM public.external_api_keys WHERE id=p_key_id FOR SHARE;
 SELECT * INTO tenant_row FROM public.tenants WHERE id=p_tenant_id FOR SHARE;
 IF tenant_row.id IS NULL OR tenant_row.is_active IS FALSE THEN
   RAISE EXCEPTION 'TENANT_INACTIVE' USING ERRCODE='42501';
 END IF;
 SELECT * INTO a FROM public.users WHERE id=p_actor_id FOR SHARE;
 SELECT * INTO c FROM public.companies WHERE id=p_company_id FOR SHARE;
 SELECT * INTO owner_row FROM public.users WHERE id=k.created_by FOR SHARE;
 IF k.id IS NULL OR k.active IS NOT TRUE OR p_credential_digest IS NULL
   OR p_credential_digest !~ '^[a-f0-9]{64}$'
   OR p_credential_digest IS DISTINCT FROM encode(sha256(convert_to(k.key,'UTF8')),'hex')
   OR k.default_assigned_to IS DISTINCT FROM a.id
   OR k.region_id IS NOT NULL OR NOT coalesce('founder_write'=ANY(k.mcp_scopes),false)
   OR NOT k.mcp_scopes <@ ARRAY['founder_read','founder_write']::text[]
   OR a.id IS NULL OR a.is_active IS NOT TRUE OR NOT coalesce(a.role IN ('admin','ecosystem_admin'),false)
   OR a.tenant_id IS NULL OR a.tenant_id IS DISTINCT FROM p_tenant_id OR c.tenant_id IS DISTINCT FROM p_tenant_id
   OR owner_row.is_active IS NOT TRUE OR owner_row.tenant_id IS DISTINCT FROM p_tenant_id
   OR NOT coalesce(owner_row.role IN ('admin','ecosystem_admin'),false) OR (owner_row.company_id IS NOT NULL AND owner_row.company_id IS DISTINCT FROM p_company_id)
   OR (a.company_id IS NOT NULL AND a.company_id IS DISTINCT FROM p_company_id)
   OR (k.company_id IS NOT NULL AND k.company_id IS DISTINCT FROM p_company_id)
   OR (k.company_id IS NULL AND coalesce(array_length(k.allowed_company_ids,1),0)>0 AND NOT p_company_id::text=ANY(k.allowed_company_ids::text[])) THEN
   RAISE EXCEPTION 'PERMISSION_DENIED' USING ERRCODE='42501';
 END IF;
 -- Serialize retries even if two sessions race before the first receipt exists.
 PERFORM pg_advisory_xact_lock(hashtextextended(p_company_id::text||':'||p_request_id,0));
 SELECT * INTO receipt FROM public.founder_command_receipts WHERE company_id=p_company_id AND request_id=p_request_id;
 IF FOUND THEN
   IF receipt.actor_id IS DISTINCT FROM p_actor_id OR receipt.key_id IS DISTINCT FROM p_key_id
      OR receipt.command IS DISTINCT FROM p_command OR receipt.payload IS DISTINCT FROM p_payload THEN
     RAISE EXCEPTION 'REQUEST_CONFLICT' USING ERRCODE='23505';
   END IF;
   RETURN receipt.result;
 END IF;
 IF p_command='create_founder_objective' THEN
   IF (SELECT count(*) FROM jsonb_object_keys(p_payload))<>6 OR NOT p_payload ?& ARRAY['owner_id','title','metric','target','window_start','window_end'] THEN
     RAISE EXCEPTION 'INVALID_ARGUMENTS' USING ERRCODE='22023';
   END IF;
   SELECT * INTO owner_row FROM public.users WHERE id=(p_payload->>'owner_id')::uuid FOR SHARE;
   IF owner_row.is_active IS NOT TRUE OR owner_row.company_id IS DISTINCT FROM p_company_id OR owner_row.tenant_id IS DISTINCT FROM p_tenant_id THEN
     RAISE EXCEPTION 'OBJECT_NOT_ACCESSIBLE' USING ERRCODE='42501';
   END IF;
   INSERT INTO public.founder_objectives(tenant_id,company_id,owner_id,title,metric,target,window_start,window_end,created_by)
   VALUES(p_tenant_id,p_company_id,owner_row.id,p_payload->>'title',p_payload->>'metric',(p_payload->>'target')::numeric,
     (p_payload->>'window_start')::timestamptz,(p_payload->>'window_end')::timestamptz,p_actor_id) RETURNING * INTO objective;
   proposal_payload:=jsonb_build_object('objective_id',objective.id,'objective_version',objective.version,'metric',objective.metric,
     'target',objective.target,'owner_id',objective.owner_id,'window_start',objective.window_start,'window_end',objective.window_end);
   INSERT INTO public.founder_proposals(tenant_id,company_id,objective_id,action,payload,digest)
   VALUES(p_tenant_id,p_company_id,objective.id,'OBJECTIVE_REVIEW',proposal_payload,encode(sha256(convert_to(proposal_payload::text,'UTF8')),'hex')) RETURNING * INTO proposal;
   result:=jsonb_build_object('objective_id',objective.id,'proposal_id',proposal.id,'version',proposal.version,'digest',proposal.digest,'status','DRAFT');
 ELSIF p_command='record_founder_decision' THEN
   IF (SELECT count(*) FROM jsonb_object_keys(p_payload))<>5 OR NOT p_payload ?& ARRAY['proposal_id','expected_version','expected_digest','decision','reason'] THEN
     RAISE EXCEPTION 'INVALID_ARGUMENTS' USING ERRCODE='22023';
   END IF;
   SELECT * INTO proposal FROM public.founder_proposals WHERE id=(p_payload->>'proposal_id')::uuid
     AND company_id=p_company_id AND tenant_id=p_tenant_id FOR UPDATE;
   IF NOT FOUND THEN RAISE EXCEPTION 'OBJECT_NOT_ACCESSIBLE' USING ERRCODE='42501'; END IF;
   SELECT * INTO objective FROM public.founder_objectives WHERE id=proposal.objective_id AND company_id=p_company_id AND tenant_id=p_tenant_id FOR UPDATE;
   IF proposal.version IS DISTINCT FROM (p_payload->>'expected_version')::integer OR proposal.digest IS DISTINCT FROM p_payload->>'expected_digest'
      OR proposal.state<>'PENDING' OR objective.version IS DISTINCT FROM (proposal.payload->>'objective_version')::integer THEN
     RAISE EXCEPTION 'PROPOSAL_VERSION_CONFLICT' USING ERRCODE='40001';
   END IF;
   INSERT INTO public.founder_decisions(tenant_id,company_id,proposal_id,proposal_version,proposal_digest,decision,reason,actor_id,key_id)
   VALUES(p_tenant_id,p_company_id,proposal.id,proposal.version,proposal.digest,p_payload->>'decision',p_payload->>'reason',p_actor_id,p_key_id) RETURNING id INTO new_id;
   UPDATE public.founder_proposals SET state='DECIDED' WHERE id=proposal.id;
   UPDATE public.founder_objectives SET status=CASE WHEN p_payload->>'decision'='APPROVE' THEN 'APPROVED' ELSE 'REJECTED' END,
     version=version+1,updated_at=now() WHERE id=objective.id;
   result:=jsonb_build_object('decision_id',new_id,'proposal_id',proposal.id,'proposal_version',proposal.version,'proposal_digest',proposal.digest,'decision',p_payload->>'decision','status','RECORDED');
 ELSE RAISE EXCEPTION 'INVALID_COMMAND' USING ERRCODE='22023'; END IF;
 result:=result||jsonb_build_object('execution','NOT_EXECUTED');
 INSERT INTO public.founder_command_receipts(tenant_id,company_id,request_id,actor_id,key_id,command,payload,result)
 VALUES(p_tenant_id,p_company_id,p_request_id,p_actor_id,p_key_id,p_command,p_payload,result);
 INSERT INTO public.audit_log(user_id,company_id,module,entity_type,entity_id,action,after_data,metadata)
 VALUES(p_actor_id,p_company_id,'governance','founder_control',coalesce(new_id,objective.id),p_command,result,
   jsonb_build_object('request_id',p_request_id,'key_id',p_key_id,'tenant_id',p_tenant_id,'execution','NOT_EXECUTED'));
 RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION public.founder_control_command_v1(uuid,uuid,uuid,uuid,text,text,jsonb,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.founder_control_command_v1(uuid,uuid,uuid,uuid,text,text,jsonb,text) TO service_role;
COMMENT ON FUNCTION public.founder_control_command_v1(uuid,uuid,uuid,uuid,text,text,jsonb,text) IS 'Record objective or version-bound decision and audit atomically. Never executes ads, tasks, messages or jobs.';
COMMIT;
