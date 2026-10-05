-- Operator-only, database-wide maintenance for the legacy CRM writer graph.
-- Installed INACTIVE. This does not drain processes, cancel HTTP, or resolve UNKNOWN.
BEGIN;
SET LOCAL lock_timeout='3s';
CREATE SCHEMA IF NOT EXISTS crm_legacy_hold;
REVOKE ALL ON SCHEMA crm_legacy_hold FROM PUBLIC,anon,authenticated,service_role;
CREATE TABLE IF NOT EXISTS crm_legacy_hold.state(
 singleton boolean PRIMARY KEY CHECK(singleton),active boolean NOT NULL DEFAULT false,
 revision bigint NOT NULL DEFAULT 0 CHECK(revision>=0),request_id uuid
);
INSERT INTO crm_legacy_hold.state(singleton) VALUES(true) ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS crm_legacy_hold.manifest(
 relation_name text PRIMARY KEY,relation_oid oid NOT NULL UNIQUE
);
CREATE TABLE IF NOT EXISTS crm_legacy_hold.events(
 request_id uuid PRIMARY KEY,command jsonb NOT NULL,before_state jsonb NOT NULL,after_state jsonb NOT NULL,
 manifest jsonb NOT NULL,manifest_hash text NOT NULL,operator_name text NOT NULL,
 recorded_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE crm_legacy_hold.state ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_legacy_hold.manifest ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_legacy_hold.events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ALL TABLES IN SCHEMA crm_legacy_hold FROM PUBLIC,anon,authenticated,service_role;

-- These are observed legacy writes, including task assignment/artifact helpers.
-- Include FK descendants, even outside public, so cascades cannot change children
-- without the same hold. Missing roots or unsupported partitioning fail installation.
CREATE OR REPLACE FUNCTION crm_legacy_hold.relations()
RETURNS TABLE(relation_name text,relation_oid oid) LANGUAGE sql SET search_path=pg_catalog AS $$
 WITH RECURSIVE graph(id) AS (
  SELECT name::regclass::oid FROM unnest(ARRAY[
   'public.customers','public.crm_leads','public.facebook_contacts','public.facebook_messages',
   'public.facebook_comments','public.facebook_lead_ads','public.facebook_pages','public.crm_sources',
   'public.lead_attribution','public.crm_tasks','public.crm_task_assignees','public.notifications',
   'public.crm_assignment_columns','public.crm_assignments','public.crm_assignment_assignees',
   'public.crm_assignment_files','public.crm_task_attachments','public.customer_interactions'
  ])name
  UNION SELECT c.conrelid FROM pg_constraint c JOIN graph g ON c.confrelid=g.id WHERE c.contype='f'
 ) SELECT format('%I.%I',n.nspname,c.relname),c.oid FROM graph g JOIN pg_class c ON c.oid=g.id
 JOIN pg_namespace n ON n.oid=c.relnamespace ORDER BY 1
$$;

CREATE OR REPLACE FUNCTION crm_legacy_hold.guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE held boolean;
BEGIN
 -- A repeatable snapshot could miss a hold committed while waiting for a table.
 IF current_setting('transaction_isolation')<>'read committed' THEN
  RAISE EXCEPTION 'legacy maintenance requires read committed' USING ERRCODE='0A000';END IF;
 SELECT active INTO held FROM crm_legacy_hold.state WHERE singleton;
 IF held IS NULL THEN RAISE EXCEPTION 'legacy maintenance unavailable' USING ERRCODE='42501';END IF;
 IF held THEN RAISE EXCEPTION 'CRM_LEGACY_WRITE_HOLD' USING ERRCODE='55000';END IF;
 RETURN NULL;
END $$;

DO $$ DECLARE r record; BEGIN
 FOR r IN SELECT * FROM crm_legacy_hold.relations() LOOP
  IF (SELECT relkind FROM pg_class WHERE oid=r.relation_oid)<>'r'
   OR EXISTS(SELECT 1 FROM pg_inherits WHERE inhrelid=r.relation_oid OR inhparent=r.relation_oid) THEN
   RAISE EXCEPTION 'unsupported maintenance relation %',r.relation_name;END IF;
  -- Idempotent application must not reset an existing hold, audit, or manifest.
  IF EXISTS(SELECT 1 FROM crm_legacy_hold.manifest WHERE relation_name=r.relation_name AND relation_oid<>r.relation_oid) THEN
   RAISE EXCEPTION 'maintenance relation replaced';END IF;
  EXECUTE format('LOCK TABLE %s IN SHARE ROW EXCLUSIVE MODE',r.relation_name);
  EXECUTE format('DROP TRIGGER IF EXISTS a_crm_legacy_write_hold ON %s',r.relation_name);
  EXECUTE format('CREATE TRIGGER a_crm_legacy_write_hold BEFORE INSERT OR UPDATE OR DELETE OR TRUNCATE ON %s FOR EACH STATEMENT EXECUTE FUNCTION crm_legacy_hold.guard()',r.relation_name);
  EXECUTE format('ALTER TABLE %s ENABLE ALWAYS TRIGGER a_crm_legacy_write_hold',r.relation_name);
  INSERT INTO crm_legacy_hold.manifest VALUES(r.relation_name,r.relation_oid) ON CONFLICT DO NOTHING;
 END LOOP;
END $$;

CREATE OR REPLACE FUNCTION crm_legacy_hold.checked_manifest()
RETURNS jsonb LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE m jsonb;
BEGIN
 IF EXISTS(SELECT * FROM crm_legacy_hold.relations() EXCEPT SELECT * FROM crm_legacy_hold.manifest)
  OR EXISTS(SELECT * FROM crm_legacy_hold.manifest EXCEPT SELECT * FROM crm_legacy_hold.relations())
  OR EXISTS(SELECT 1 FROM crm_legacy_hold.manifest m WHERE NOT EXISTS(
   SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
   WHERE t.tgrelid=m.relation_oid AND c.relkind='r' AND NOT c.relispartition
    AND t.tgname='a_crm_legacy_write_hold' AND t.tgenabled='A' AND NOT t.tgisinternal
    AND t.tgfoid='crm_legacy_hold.guard()'::regprocedure AND t.tgtype=62 AND t.tgnargs=0 AND t.tgqual IS NULL)) THEN
   RAISE EXCEPTION 'legacy maintenance manifest changed' USING ERRCODE='55000';END IF;
 SELECT jsonb_agg(jsonb_build_object('relation',m.relation_name,'oid',m.relation_oid,
  'trigger',pg_get_triggerdef(t.oid)) ORDER BY m.relation_name) INTO m
 FROM crm_legacy_hold.manifest m JOIN pg_trigger t ON t.tgrelid=m.relation_oid AND t.tgname='a_crm_legacy_write_hold';
 RETURN m;
END $$;

CREATE OR REPLACE FUNCTION crm_legacy_hold.inspect()
RETURNS jsonb LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE m jsonb;s jsonb;
BEGIN
 m:=crm_legacy_hold.checked_manifest();SELECT to_jsonb(x) INTO s FROM crm_legacy_hold.state x WHERE singleton;
 IF s IS NULL THEN RAISE EXCEPTION 'legacy maintenance unavailable' USING ERRCODE='55000';END IF;
 RETURN jsonb_build_object('policy','CRM_LEGACY_WRITE_HOLD_V1','state',s,'manifest',m,
  'manifestHash',encode(sha256(convert_to(m::text,'UTF8')),'hex'),'processesDrained',false);
END $$;

-- No service/browser grant. Invoke only as the trusted DB operator during an
-- approved maintenance window. References are attestations, not machine proof
-- of process shutdown. Disabling still requires independent operational evidence.
CREATE OR REPLACE FUNCTION crm_legacy_hold.set_hold(p_request uuid,p_revision bigint,p_active boolean,
 p_manifest_hash text,p_release_reference text,p_drain_reference text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SET search_path=pg_catalog SET lock_timeout='3s' AS $$
DECLARE r record;m jsonb;digest text;cmd jsonb;before_state jsonb;after_state jsonb;prior crm_legacy_hold.events%ROWTYPE;
BEGIN
 IF current_setting('transaction_isolation')<>'read committed' THEN RAISE EXCEPTION 'read committed required' USING ERRCODE='0A000';END IF;
 IF p_request IS NULL OR p_revision IS NULL OR p_revision<0 OR p_active IS NULL
  OR (p_manifest_hash~'^[a-f0-9]{64}$') IS NOT TRUE
  OR coalesce(length(btrim(p_release_reference)),0) NOT BETWEEN 20 AND 2000
  OR (p_active AND p_drain_reference IS NOT NULL)
  OR (NOT p_active AND coalesce(length(btrim(p_drain_reference)),0) NOT BETWEEN 20 AND 2000) THEN
  RAISE EXCEPTION 'invalid maintenance command' USING ERRCODE='22023';END IF;
 -- DML acquires relation locks before triggers. Take table locks first, in a
 -- stable order; never take state/advisory locks before waiting for DML to drain.
 PERFORM crm_legacy_hold.checked_manifest();
 FOR r IN SELECT * FROM crm_legacy_hold.manifest ORDER BY relation_name LOOP
  EXECUTE format('LOCK TABLE %s IN SHARE ROW EXCLUSIVE MODE',r.relation_name);
 END LOOP;
 m:=crm_legacy_hold.checked_manifest();digest:=encode(sha256(convert_to(m::text,'UTF8')),'hex');
 IF digest<>p_manifest_hash THEN RAISE EXCEPTION 'maintenance manifest conflict' USING ERRCODE='40001';END IF;
 SELECT to_jsonb(x) INTO before_state FROM crm_legacy_hold.state x WHERE singleton FOR UPDATE;
 IF before_state IS NULL THEN RAISE EXCEPTION 'maintenance state unavailable' USING ERRCODE='55000';END IF;
 cmd:=jsonb_build_object('revision',p_revision,'active',p_active,'manifestHash',p_manifest_hash,
  'releaseReference',p_release_reference,'drainReference',p_drain_reference);
 SELECT * INTO prior FROM crm_legacy_hold.events WHERE request_id=p_request;
 IF FOUND THEN
  IF prior.command<>cmd THEN RAISE EXCEPTION 'maintenance request reused' USING ERRCODE='23505';END IF;
  RETURN jsonb_build_object('recordedState',prior.after_state,'currentState',before_state,'replayed',true);
 END IF;
 IF (before_state->>'revision')::bigint<>p_revision OR (before_state->>'active')::boolean=p_active THEN
  RAISE EXCEPTION 'maintenance revision conflict' USING ERRCODE='40001';END IF;
 UPDATE crm_legacy_hold.state SET active=p_active,revision=revision+1,request_id=p_request WHERE singleton RETURNING to_jsonb(state) INTO after_state;
 INSERT INTO crm_legacy_hold.events VALUES(p_request,cmd,before_state,after_state,m,digest,session_user,clock_timestamp());
 RETURN jsonb_build_object('recordedState',after_state,'currentState',after_state,'replayed',false);
END $$;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA crm_legacy_hold FROM PUBLIC,anon,authenticated,service_role;
COMMIT;
