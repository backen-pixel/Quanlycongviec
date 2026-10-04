-- Explicit operator-only rebind after a verified logical restore changes OIDs.
-- Never releases maintenance, grants runtime rights or settles external effects.
BEGIN;
CREATE TABLE IF NOT EXISTS crm_legacy_hold.restore_events(
 request_id uuid PRIMARY KEY,command jsonb NOT NULL,before_state jsonb NOT NULL,after_state jsonb NOT NULL,
 source_manifest jsonb NOT NULL,target_manifest jsonb NOT NULL,operator_name text NOT NULL,
 recorded_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE crm_legacy_hold.restore_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON crm_legacy_hold.restore_events FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION crm_legacy_hold.restore_plan()
RETURNS jsonb LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE source_m jsonb;target_m jsonb;s jsonb;
BEGIN
 IF EXISTS(SELECT relation_name FROM crm_legacy_hold.relations() EXCEPT SELECT relation_name FROM crm_legacy_hold.manifest)
  OR EXISTS(SELECT relation_name FROM crm_legacy_hold.manifest EXCEPT SELECT relation_name FROM crm_legacy_hold.relations())
  OR EXISTS(SELECT 1 FROM crm_legacy_hold.relations() r WHERE NOT EXISTS(
   SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
   WHERE c.oid=r.relation_oid AND c.relkind='r' AND NOT c.relispartition
    AND NOT EXISTS(SELECT 1 FROM pg_inherits WHERE inhrelid=c.oid OR inhparent=c.oid)
    AND t.tgname='a_crm_legacy_write_hold' AND t.tgenabled='A' AND NOT t.tgisinternal
    AND t.tgfoid='crm_legacy_hold.guard()'::regprocedure AND t.tgtype=62 AND t.tgnargs=0 AND t.tgqual IS NULL)) THEN
  RAISE EXCEPTION 'restored maintenance graph or guards changed' USING ERRCODE='55000';END IF;
 SELECT jsonb_agg(jsonb_build_object('relation',relation_name,'oid',relation_oid) ORDER BY relation_name)
  INTO source_m FROM crm_legacy_hold.manifest;
 SELECT jsonb_agg(jsonb_build_object('relation',r.relation_name,'oid',r.relation_oid,'trigger',pg_get_triggerdef(t.oid)) ORDER BY r.relation_name)
  INTO target_m FROM crm_legacy_hold.relations() r JOIN pg_trigger t ON t.tgrelid=r.relation_oid AND t.tgname='a_crm_legacy_write_hold';
 SELECT to_jsonb(x) INTO s FROM crm_legacy_hold.state x WHERE singleton;
 IF s IS NULL OR source_m IS NULL OR target_m IS NULL THEN RAISE EXCEPTION 'restored maintenance unavailable' USING ERRCODE='55000';END IF;
 RETURN jsonb_build_object('policy','CRM_LEGACY_HOLD_RESTORE_V1','state',s,'sourceManifest',source_m,'targetManifest',target_m,
  'sourceHash',encode(sha256(convert_to(source_m::text,'UTF8')),'hex'),
  'targetHash',encode(sha256(convert_to(target_m::text,'UTF8')),'hex'),
  'needsRebind',EXISTS(SELECT 1 FROM crm_legacy_hold.relations() r JOIN crm_legacy_hold.manifest m USING(relation_name) WHERE r.relation_oid<>m.relation_oid),
  'processesDrained',false,'mayResume',false);
END $$;

CREATE OR REPLACE FUNCTION crm_legacy_hold.rebind_restored_manifest(p_request uuid,p_revision bigint,
 p_source_hash text,p_target_hash text,p_backup_reference text,p_release_reference text)
RETURNS jsonb LANGUAGE plpgsql SET search_path=pg_catalog SET lock_timeout='3s' AS $$
DECLARE r record;plan jsonb;before_s jsonb;after_s jsonb;cmd jsonb;prior crm_legacy_hold.restore_events%ROWTYPE;
BEGIN
 IF current_setting('transaction_isolation')<>'read committed' THEN RAISE EXCEPTION 'read committed required' USING ERRCODE='0A000';END IF;
 IF p_request IS NULL OR p_revision IS NULL OR p_revision<0
  OR (p_source_hash~'^[a-f0-9]{64}$') IS NOT TRUE OR (p_target_hash~'^[a-f0-9]{64}$') IS NOT TRUE
  OR coalesce(length(btrim(p_backup_reference)),0) NOT BETWEEN 20 AND 2000
  OR coalesce(length(btrim(p_release_reference)),0) NOT BETWEEN 20 AND 2000 THEN
  RAISE EXCEPTION 'invalid restore command' USING ERRCODE='22023';END IF;
 -- Same order as set_hold: validate graph, lock its tables, then state.
 PERFORM crm_legacy_hold.restore_plan();
 FOR r IN SELECT * FROM crm_legacy_hold.relations() ORDER BY relation_name LOOP
  EXECUTE format('LOCK TABLE %s IN SHARE ROW EXCLUSIVE MODE',r.relation_name);
 END LOOP;
 SELECT to_jsonb(x) INTO before_s FROM crm_legacy_hold.state x WHERE singleton FOR UPDATE;
 plan:=crm_legacy_hold.restore_plan();
 cmd:=jsonb_build_object('revision',p_revision,'sourceHash',p_source_hash,'targetHash',p_target_hash,
  'backupReference',p_backup_reference,'releaseReference',p_release_reference);
 SELECT * INTO prior FROM crm_legacy_hold.restore_events WHERE request_id=p_request;
 IF FOUND THEN
  IF prior.command<>cmd THEN RAISE EXCEPTION 'restore request reused' USING ERRCODE='23505';END IF;
  RETURN jsonb_build_object('recordedState',prior.after_state,'currentState',before_s,'replayed',true,'mayResume',false);
 END IF;
 IF plan->>'sourceHash'<>p_source_hash OR plan->>'targetHash'<>p_target_hash
  OR (before_s->>'revision')::bigint<>p_revision THEN RAISE EXCEPTION 'restore snapshot changed' USING ERRCODE='40001';END IF;
 IF (plan->>'needsRebind')::boolean IS NOT TRUE THEN RAISE EXCEPTION 'no restored OID change' USING ERRCODE='22023';END IF;
 -- Replace only the verified physical binding, atomically; old mappings stay in
 -- restore audit and all historical hold events. Hold always ends up active.
 DELETE FROM crm_legacy_hold.manifest;
 INSERT INTO crm_legacy_hold.manifest SELECT * FROM crm_legacy_hold.relations();
 UPDATE crm_legacy_hold.state SET active=true,revision=revision+1,request_id=p_request WHERE singleton RETURNING to_jsonb(state) INTO after_s;
 PERFORM crm_legacy_hold.checked_manifest();
 INSERT INTO crm_legacy_hold.restore_events VALUES(p_request,cmd,before_s,after_s,plan->'sourceManifest',plan->'targetManifest',session_user,clock_timestamp());
 RETURN jsonb_build_object('recordedState',after_s,'currentState',after_s,'replayed',false,'mayResume',false);
END $$;
REVOKE ALL ON FUNCTION crm_legacy_hold.restore_plan(),crm_legacy_hold.rebind_restored_manifest(uuid,bigint,text,text,text,text)
 FROM PUBLIC,anon,authenticated,service_role;
COMMIT;
