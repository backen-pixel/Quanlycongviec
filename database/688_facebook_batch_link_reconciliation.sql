-- Operator records an observed link after STOP and approved maintenance.
-- This is NOT proof that the interrupted creator committed all its effects.
-- The contact claim remains permanent; no replay, CRM repair, or hold release.
BEGIN;
SET LOCAL lock_timeout='3s';
ALTER TABLE crm_batch_control.items DROP CONSTRAINT IF EXISTS items_state_check;
ALTER TABLE crm_batch_control.items ADD CONSTRAINT items_state_check
 CHECK(state IN('PENDING','RUNNING','LINKED','SKIPPED','UNKNOWN','CANCELLED','RECONCILED_LINKED'));
DROP INDEX IF EXISTS crm_batch_control.crm_batch_contact_claim;
CREATE UNIQUE INDEX crm_batch_contact_claim ON crm_batch_control.items(contact_id)
 WHERE state IN('PENDING','RUNNING','UNKNOWN','RECONCILED_LINKED');

CREATE TABLE IF NOT EXISTS crm_batch_control.link_reconciliations(
 command_id uuid PRIMARY KEY,request_id uuid NOT NULL,contact_id uuid NOT NULL,
 command jsonb NOT NULL,snapshot jsonb NOT NULL,snapshot_hash text NOT NULL,
 before_item jsonb NOT NULL,after_item jsonb NOT NULL,operator_name text NOT NULL,
 recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),UNIQUE(request_id,contact_id),
 FOREIGN KEY(request_id,contact_id) REFERENCES crm_batch_control.items(request_id,contact_id)
);
ALTER TABLE crm_batch_control.link_reconciliations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON crm_batch_control.link_reconciliations FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION crm_batch_control.guard_link_review()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF NEW.state='COMPLETED' AND EXISTS(SELECT 1 FROM crm_batch_control.items
  WHERE request_id=NEW.request_id AND state='RECONCILED_LINKED') THEN
  RAISE EXCEPTION 'link review does not complete business effects' USING ERRCODE='40001';END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS crm_batch_link_review ON crm_batch_control.runs;
CREATE TRIGGER crm_batch_link_review BEFORE UPDATE OF state ON crm_batch_control.runs
 FOR EACH ROW EXECUTE FUNCTION crm_batch_control.guard_link_review();
REVOKE ALL ON FUNCTION crm_batch_control.guard_link_review() FROM PUBLIC,anon,authenticated,service_role;

-- Complete row hashes detect changed inputs without exporting names, phones,
-- message bodies, or Page credentials into the preview/audit. No row limits.
CREATE OR REPLACE FUNCTION crm_batch_control.link_snapshot(p_request uuid,p_contact uuid)
RETURNS jsonb LANGUAGE plpgsql SET search_path=pg_catalog SET lock_timeout='3s' AS $$
DECLARE h jsonb;m jsonb;r crm_batch_control.runs%ROWTYPE;i crm_batch_control.items%ROWTYPE;
 c jsonb;l jsonb;customer jsonb;p jsonb;company jsonb;tenant jsonb;messages jsonb;s jsonb;
 problems jsonb:='[]';observed jsonb;inverse_count bigint;duplicate_count bigint;
BEGIN
 IF current_setting('transaction_isolation')<>'read committed' THEN RAISE EXCEPTION 'read committed required' USING ERRCODE='0A000';END IF;
 IF p_request IS NULL OR p_contact IS NULL THEN RAISE EXCEPTION 'invalid reconciliation scope' USING ERRCODE='22023';END IF;
 SELECT to_jsonb(x) INTO h FROM crm_legacy_hold.state x WHERE singleton FOR SHARE;
 IF h->>'active' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'active maintenance required' USING ERRCODE='55000';END IF;
 m:=crm_legacy_hold.checked_manifest();
 SELECT * INTO r FROM crm_batch_control.runs WHERE request_id=p_request FOR SHARE;
 SELECT * INTO i FROM crm_batch_control.items WHERE request_id=p_request AND contact_id=p_contact FOR SHARE;
 IF r.request_id IS NULL OR i.contact_id IS NULL THEN RAISE EXCEPTION 'reconciliation item unavailable' USING ERRCODE='22023';END IF;
 SELECT to_jsonb(x) INTO s FROM crm_batch_control.stops x WHERE request_id=p_request;
 IF s IS NULL OR r.state<>'REVIEW' OR i.state<>'UNKNOWN'
  OR EXISTS(SELECT 1 FROM crm_batch_control.items WHERE request_id=p_request AND state IN('PENDING','RUNNING')) THEN
  problems:=problems||jsonb_build_array('DURABLE_STOP_REQUIRED');END IF;
 SELECT to_jsonb(x) INTO company FROM public.companies x WHERE id=r.company_id FOR SHARE;
 IF company->>'tenant_id' IS NOT NULL THEN
  SELECT to_jsonb(x) INTO tenant FROM public.tenants x WHERE id=(company->>'tenant_id')::uuid FOR SHARE;
 END IF;
 IF company->>'is_active' IS DISTINCT FROM 'true'
  OR (company->>'tenant_id' IS NOT NULL AND tenant->>'is_active' IS DISTINCT FROM 'true') THEN
  problems:=problems||jsonb_build_array('COMPANY_UNAVAILABLE');END IF;
 SELECT to_jsonb(x) INTO c FROM public.facebook_contacts x WHERE id=p_contact;
 SELECT to_jsonb(x) INTO p FROM public.facebook_pages x WHERE page_id=c->>'page_id';
 SELECT to_jsonb(x) INTO l FROM public.crm_leads x WHERE id=(c->>'lead_id')::uuid;
 SELECT to_jsonb(x) INTO customer FROM public.customers x WHERE id=(c->>'customer_id')::uuid;
 IF c IS NULL OR p IS NULL OR p->>'default_company_id' IS DISTINCT FROM r.company_id::text
  OR p->>'is_active' IS DISTINCT FROM 'true' OR coalesce(nullif(p->>'default_module_key',''),'crm')<>'crm' THEN
  problems:=problems||jsonb_build_array('PAGE_SCOPE_CONFLICT');END IF;
 IF l IS NULL OR customer IS NULL OR l->>'company_id' IS DISTINCT FROM r.company_id::text
  OR customer->>'company_id' IS DISTINCT FROM r.company_id::text
  OR l->>'customer_id' IS DISTINCT FROM c->>'customer_id'
  OR l->>'type' IS DISTINCT FROM (CASE WHEN p->>'default_target_type'='deal' THEN 'deal' ELSE 'lead' END)
  OR (l->>'facebook_contact_id' IS NOT NULL AND l->>'facebook_contact_id' IS DISTINCT FROM p_contact::text) THEN
  problems:=problems||jsonb_build_array('LINK_SCOPE_CONFLICT');END IF;
 SELECT count(*) INTO inverse_count FROM public.crm_leads x
  WHERE to_jsonb(x)->>'facebook_contact_id'=p_contact::text AND x.id::text IS DISTINCT FROM c->>'lead_id';
 SELECT count(*) INTO duplicate_count FROM public.facebook_contacts x
  WHERE x.page_id=c->>'page_id' AND x.psid=c->>'psid' AND x.id<>p_contact;
 IF inverse_count>0 OR duplicate_count>0 THEN problems:=problems||jsonb_build_array('AMBIGUOUS_CONTACT');END IF;
 SELECT jsonb_build_object('count',count(*),'unlinked',count(*) FILTER(WHERE x.lead_id IS NULL),
  'conflicting',count(*) FILTER(WHERE x.lead_id IS NOT NULL AND x.lead_id::text IS DISTINCT FROM c->>'lead_id'),
  'hash',encode(sha256(convert_to(coalesce(string_agg(x.id::text||':'||encode(sha256(convert_to(to_jsonb(x)::text,'UTF8')),'hex'),'|' ORDER BY x.id),''),'UTF8')),'hex'))
 INTO messages FROM public.facebook_messages x WHERE x.contact_id=p_contact;
 IF (messages->>'unlinked')::bigint>0 OR (messages->>'conflicting')::bigint>0 THEN
  problems:=problems||jsonb_build_array('MESSAGE_LINK_INCOMPLETE');END IF;
 observed:=jsonb_build_object('requestId',r.request_id,'contactId',p_contact,'companyId',r.company_id,
  'run',to_jsonb(r)-'token_hash','item',to_jsonb(i),'stopHash',encode(sha256(convert_to(s::text,'UTF8')),'hex'),
  'hold',h,'manifestHash',encode(sha256(convert_to(m::text,'UTF8')),'hex'),
  'companyHash',encode(sha256(convert_to(company::text,'UTF8')),'hex'),'tenantHash',encode(sha256(convert_to(tenant::text,'UTF8')),'hex'),
  'pageId',c->>'page_id','pageHash',encode(sha256(convert_to(p::text,'UTF8')),'hex'),
  'contactHash',encode(sha256(convert_to(c::text,'UTF8')),'hex'),
  'leadId',c->>'lead_id','leadHash',encode(sha256(convert_to(l::text,'UTF8')),'hex'),
  'customerId',c->>'customer_id','customerHash',encode(sha256(convert_to(customer::text,'UTF8')),'hex'),
  'messages',messages,'inverseConflicts',inverse_count,'duplicateContacts',duplicate_count,'issues',problems);
 RETURN jsonb_build_object('policy','FACEBOOK_BATCH_LINK_RECONCILIATION_V1','snapshot',observed,
  'snapshotHash',encode(sha256(convert_to(observed::text,'UTF8')),'hex'),'linkCanBeConfirmed',jsonb_array_length(problems)=0,
  'claimWillBeRetained',true,'businessReconciled',false,'processesDrained',false);
END $$;

CREATE OR REPLACE FUNCTION crm_batch_control.confirm_link(p_command uuid,p_request uuid,p_contact uuid,
 p_revision bigint,p_manifest_hash text,p_snapshot_hash text,p_release_reference text,p_drain_reference text,p_review_reference text)
RETURNS jsonb LANGUAGE plpgsql SET search_path=pg_catalog SET lock_timeout='3s' AS $$
DECLARE cmd jsonb;prior crm_batch_control.link_reconciliations%ROWTYPE;v jsonb;before_item jsonb;after_item jsonb;
BEGIN
 IF current_setting('transaction_isolation')<>'read committed' THEN RAISE EXCEPTION 'read committed required' USING ERRCODE='0A000';END IF;
 IF p_command IS NULL OR p_request IS NULL OR p_contact IS NULL OR p_revision IS NULL OR p_revision<1
  OR (p_manifest_hash~'^[a-f0-9]{64}$') IS NOT TRUE OR (p_snapshot_hash~'^[a-f0-9]{64}$') IS NOT TRUE
  OR coalesce(length(btrim(p_release_reference)),0) NOT BETWEEN 20 AND 2000
  OR coalesce(length(btrim(p_drain_reference)),0) NOT BETWEEN 20 AND 2000
  OR coalesce(length(btrim(p_review_reference)),0) NOT BETWEEN 20 AND 2000 THEN
  RAISE EXCEPTION 'invalid link reconciliation' USING ERRCODE='22023';END IF;
 cmd:=jsonb_build_object('requestId',p_request,'contactId',p_contact,'revision',p_revision,'manifestHash',p_manifest_hash,
  'snapshotHash',p_snapshot_hash,'releaseReference',p_release_reference,'drainReference',p_drain_reference,'reviewReference',p_review_reference);
 PERFORM pg_advisory_xact_lock(hashtextextended('fb-batch-reconcile:'||p_command::text,0));
 SELECT * INTO prior FROM crm_batch_control.link_reconciliations WHERE command_id=p_command;
 IF FOUND THEN
  IF prior.command<>cmd THEN RAISE EXCEPTION 'reconciliation request reused' USING ERRCODE='23505';END IF;
  RETURN jsonb_build_object('commandId',p_command,'recordedItem',prior.after_item,
   'currentRun',crm_batch_control.view_run(p_request),'replayed',true,'claimRetained',true,'businessReconciled',false,'processesDrained',false);
 END IF;
 -- Lock hold through commit, then serialize with all journal mutations. Snapshot
 -- below rechecks the graph after those waits, not before obtaining these locks.
 PERFORM 1 FROM crm_legacy_hold.state WHERE singleton FOR SHARE;
 PERFORM 1 FROM crm_batch_control.runs WHERE request_id=p_request FOR UPDATE;
 v:=crm_batch_control.link_snapshot(p_request,p_contact);
 IF (v#>>'{snapshot,hold,revision}')::bigint<>p_revision OR v#>>'{snapshot,manifestHash}'<>p_manifest_hash
  OR v->>'snapshotHash'<>p_snapshot_hash OR v->>'linkCanBeConfirmed' IS DISTINCT FROM 'true' THEN
  RAISE EXCEPTION 'reconciliation evidence changed or incomplete' USING ERRCODE='40001';END IF;
 before_item:=v#>'{snapshot,item}';
 UPDATE crm_batch_control.items SET state='RECONCILED_LINKED',result=jsonb_build_object('status','linked',
  'contact_id',p_contact,'lead_id',v#>>'{snapshot,leadId}') WHERE request_id=p_request AND contact_id=p_contact RETURNING to_jsonb(items) INTO after_item;
 UPDATE crm_batch_control.runs SET token_hash=md5(gen_random_uuid()::text),state='REVIEW',updated_at=clock_timestamp() WHERE request_id=p_request;
 INSERT INTO crm_batch_control.link_reconciliations(command_id,request_id,contact_id,command,snapshot,snapshot_hash,before_item,after_item,operator_name)
 VALUES(p_command,p_request,p_contact,cmd,v->'snapshot',p_snapshot_hash,before_item,after_item,session_user);
 RETURN jsonb_build_object('commandId',p_command,'recordedItem',after_item,'currentRun',crm_batch_control.view_run(p_request),
  'replayed',false,'claimRetained',true,'businessReconciled',false,'processesDrained',false);
END $$;

CREATE OR REPLACE FUNCTION crm_batch_control.view_run(p_request uuid)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT jsonb_build_object('policy','FACEBOOK_BATCH_JOURNAL_V1','requestId',r.request_id,'companyId',r.company_id,'actorId',r.actor_id,
  'state',r.state,'createdAt',r.created_at,'updatedAt',r.updated_at,'items',
  (SELECT jsonb_agg(jsonb_build_object('contactId',i.contact_id,'state',i.state,'result',i.result)||
   CASE WHEN i.state='RECONCILED_LINKED' AND a.command_id IS NOT NULL THEN jsonb_build_object('reconciliation',jsonb_build_object(
    'policy','FACEBOOK_BATCH_LINK_RECONCILIATION_V1','commandId',a.command_id,'recordedAt',a.recorded_at,
    'linkVerified',true,'claimRetained',true,'businessReconciled',false,'processesDrained',false)) ELSE '{}'::jsonb END ORDER BY i.ordinal)
   FROM crm_batch_control.items i LEFT JOIN crm_batch_control.link_reconciliations a USING(request_id,contact_id)
   WHERE i.request_id=r.request_id)) FROM crm_batch_control.runs r WHERE r.request_id=p_request
$$;

-- Historical reconciled IDs need the same current authorization as ordinary
-- LINKED results, even if the Contact has since been remapped or cleared.
CREATE OR REPLACE FUNCTION crm_batch_control.authorize_history(p_request uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE r crm_batch_control.runs%ROWTYPE;a public.users%ROWTYPE;i record;l public.crm_leads%ROWTYPE;p public.facebook_pages%ROWTYPE;wide boolean;role_name text;
BEGIN
 SELECT * INTO r FROM crm_batch_control.runs WHERE request_id=p_request;
 SELECT * INTO a FROM public.users WHERE id=r.actor_id FOR SHARE;
 role_name:=lower(btrim(coalesce(a.role::text,'')));
 wide:=role_name IN('admin','ecosystem_admin') OR(a.company_id IS NOT NULL AND role_name IN('sales_admin','crm_production_admin'));
 FOR i IN SELECT contact_id,result FROM crm_batch_control.items WHERE request_id=p_request AND state IN('LINKED','RECONCILED_LINKED') LOOP
  SELECT * INTO l FROM public.crm_leads WHERE id::text=i.result->>'lead_id' FOR SHARE;
  SELECT p0.* INTO p FROM public.facebook_contacts f JOIN public.facebook_pages p0 ON p0.page_id=f.page_id WHERE f.id=i.contact_id FOR SHARE OF f,p0;
  IF l.id IS NULL OR l.company_id IS DISTINCT FROM r.company_id OR (NOT wide AND (l.region_id IS DISTINCT FROM p.default_region_id
   OR(role_name<>'region_admin' AND l.assigned_to IS DISTINCT FROM a.id AND l.lead_owner_id IS DISTINCT FROM a.id))) THEN
   RAISE EXCEPTION 'batch historical target denied' USING ERRCODE='42501';END IF;
 END LOOP;
END $$;
REVOKE ALL ON FUNCTION crm_batch_control.link_snapshot(uuid,uuid),crm_batch_control.confirm_link(uuid,uuid,uuid,bigint,text,text,text,text,text),
 crm_batch_control.view_run(uuid),crm_batch_control.authorize_history(uuid) FROM PUBLIC,anon,authenticated,service_role;
COMMIT;
