-- LOCAL PREPARATION ONLY. Creates no public trigger and changes no business rows.
-- Capacity, complete manifest and independent source review are production gates.
BEGIN;
CREATE SCHEMA vpt_cutover_v2_20261015 AUTHORIZATION CURRENT_USER;
REVOKE ALL ON SCHEMA vpt_cutover_v2_20261015 FROM PUBLIC,anon,authenticated,service_role,authenticator;

CREATE TABLE vpt_cutover_v2_20261015.runs (
  id uuid PRIMARY KEY,
  site text NOT NULL CHECK(site IN ('primary','backup')),
  project_ref text NOT NULL CHECK(project_ref IN ('kdxypztstbeovyedmvem','atcfpgxkgbszglrelfgr')),
  manifest_sha256 text NOT NULL CHECK(manifest_sha256 ~ '^[a-f0-9]{64}$'),
  manifest jsonb NOT NULL,
  owner_oid oid NOT NULL DEFAULT current_user::regrole::oid,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK((site='primary' AND project_ref='kdxypztstbeovyedmvem') OR (site='backup' AND project_ref='atcfpgxkgbszglrelfgr'))
);
CREATE TABLE vpt_cutover_v2_20261015.registrations (
  table_oid oid PRIMARY KEY,
  table_name text NOT NULL UNIQUE,
  run_id uuid NOT NULL REFERENCES vpt_cutover_v2_20261015.runs,
  key_columns text[] NOT NULL,
  key_types text[] NOT NULL,
  mode text NOT NULL CHECK(mode IN ('pk_digest','row_multiset','v1_external')),
  catalog_sha256 text NOT NULL CHECK(catalog_sha256 ~ '^[a-f0-9]{64}$'),
  CHECK(cardinality(key_columns)=cardinality(key_types)),
  CHECK((mode='row_multiset')=(cardinality(key_columns)=0))
);
CREATE TABLE vpt_cutover_v2_20261015.control (
  singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
  run_id uuid NOT NULL REFERENCES vpt_cutover_v2_20261015.runs,
  active boolean NOT NULL DEFAULT false,
  epoch uuid NOT NULL,
  deadline timestamptz,
  changed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK(NOT active OR deadline IS NOT NULL)
);
CREATE TABLE vpt_cutover_v2_20261015.fence_audit (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  run_id uuid NOT NULL REFERENCES vpt_cutover_v2_20261015.runs,
  epoch uuid NOT NULL,
  action text NOT NULL CHECK(action IN ('initialize','activate','release','permit')),
  reason text NOT NULL CHECK(reason IN ('closing_capture','bounded_parent_repair','operator_recovery')),
  actor oid NOT NULL,
  transaction_id bigint NOT NULL,
  observed_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE UNIQUE INDEX fence_epoch_transition_once ON vpt_cutover_v2_20261015.fence_audit(run_id,epoch) WHERE action IN ('initialize','activate','release');
CREATE TABLE vpt_cutover_v2_20261015.permits (
  run_id uuid NOT NULL REFERENCES vpt_cutover_v2_20261015.runs,
  epoch uuid NOT NULL,
  actor oid NOT NULL,
  backend_pid integer NOT NULL,
  transaction_id bigint NOT NULL,
  table_oids oid[] NOT NULL CHECK(cardinality(table_oids)>0),
  operations text[] NOT NULL CHECK(cardinality(operations)>0 AND operations<@ARRAY['INSERT','UPDATE','DELETE']::text[]),
  expires_at timestamptz NOT NULL,
  PRIMARY KEY(run_id,epoch,actor,backend_pid,transaction_id)
);
CREATE TABLE vpt_cutover_v2_20261015.events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  run_id uuid NOT NULL REFERENCES vpt_cutover_v2_20261015.runs,
  table_name text NOT NULL,
  mode text NOT NULL CHECK(mode IN ('pk_digest','row_multiset')),
  operation text NOT NULL CHECK(operation IN ('INSERT','UPDATE','DELETE')),
  transaction_id bigint NOT NULL,
  observed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  old_key_digest text,
  new_key_digest text,
  old_row_digest text,
  new_row_digest text
);
CREATE INDEX events_run_id_idx ON vpt_cutover_v2_20261015.events(run_id,id);
CREATE TABLE vpt_cutover_v2_20261015.receipts (
  capture_id uuid NOT NULL,
  kind text NOT NULL CHECK(kind IN ('reserved','committed')),
  run_id uuid NOT NULL REFERENCES vpt_cutover_v2_20261015.runs,
  phase text NOT NULL CHECK(phase IN ('baseline','closing')),
  descriptor_sha256 text NOT NULL CHECK(descriptor_sha256 ~ '^[a-f0-9]{64}$'),
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(capture_id,kind)
);
CREATE TABLE vpt_cutover_v2_20261015.artifacts (
  capture_id uuid NOT NULL,
  receipt_kind text NOT NULL DEFAULT 'reserved' CHECK(receipt_kind='reserved'),
  stream text NOT NULL CHECK(length(stream) BETWEEN 1 AND 256),
  part integer NOT NULL CHECK(part>=0),
  rows integer NOT NULL CHECK(rows>=0),
  key_id uuid NOT NULL,
  algorithm text NOT NULL CHECK(algorithm='aes-256-gcm/hkdf-sha256/cutover_v2'),
  salt bytea NOT NULL CHECK(octet_length(salt)=32),
  nonce bytea NOT NULL CHECK(octet_length(nonce)=12),
  tag bytea NOT NULL CHECK(octet_length(tag)=16),
  ciphertext bytea NOT NULL CHECK(octet_length(ciphertext) BETWEEN 1 AND 8388608),
  ciphertext_sha256 text NOT NULL CHECK(ciphertext_sha256 ~ '^[a-f0-9]{64}$'),
  PRIMARY KEY(capture_id,stream,part),
  FOREIGN KEY(capture_id,receipt_kind) REFERENCES vpt_cutover_v2_20261015.receipts(capture_id,kind)
);

CREATE FUNCTION vpt_cutover_v2_20261015.immutable_evidence() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN RAISE EXCEPTION USING ERRCODE='55000',MESSAGE='CUTOVER_V2_IMMUTABLE_EVIDENCE'; END $$;

CREATE FUNCTION vpt_cutover_v2_20261015.capture_digest() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog SET timezone='UTC' AS $$
DECLARE r vpt_cutover_v2_20261015.registrations%ROWTYPE; o jsonb; n jsonb; ok jsonb; nk jsonb;
BEGIN
  SELECT * INTO STRICT r FROM vpt_cutover_v2_20261015.registrations
    WHERE table_oid=TG_RELID AND table_name=TG_TABLE_NAME AND TG_TABLE_SCHEMA='public';
  IF r.mode='v1_external' OR TG_OP NOT IN ('INSERT','UPDATE','DELETE') THEN
    RAISE EXCEPTION USING ERRCODE='55000',MESSAGE='CUTOVER_V2_CAPTURE_MODE';
  END IF;
  IF TG_OP<>'INSERT' THEN o:=to_jsonb(OLD); END IF;
  IF TG_OP<>'DELETE' THEN n:=to_jsonb(NEW); END IF;
  IF r.mode='pk_digest' THEN
    IF (o IS NOT NULL AND EXISTS(SELECT 1 FROM unnest(r.key_columns) k WHERE NOT o ? k OR o->k='null'::jsonb))
      OR (n IS NOT NULL AND EXISTS(SELECT 1 FROM unnest(r.key_columns) k WHERE NOT n ? k OR n->k='null'::jsonb)) THEN
      RAISE EXCEPTION USING ERRCODE='55000',MESSAGE='CUTOVER_V2_IDENTITY_CHANGED';
    END IF;
    IF o IS NOT NULL THEN SELECT jsonb_object_agg(k,o->k) INTO ok FROM unnest(r.key_columns) k; END IF;
    IF n IS NOT NULL THEN SELECT jsonb_object_agg(k,n->k) INTO nk FROM unnest(r.key_columns) k; END IF;
  END IF;
  INSERT INTO vpt_cutover_v2_20261015.events(run_id,table_name,mode,operation,transaction_id,old_key_digest,new_key_digest,old_row_digest,new_row_digest)
    VALUES(r.run_id,r.table_name,r.mode,TG_OP,txid_current(),
      CASE WHEN ok IS NOT NULL THEN encode(sha256(convert_to(jsonb_build_array('public',r.table_name,r.key_columns,r.key_types,ok)::text,'UTF8')),'hex') END,
      CASE WHEN nk IS NOT NULL THEN encode(sha256(convert_to(jsonb_build_array('public',r.table_name,r.key_columns,r.key_types,nk)::text,'UTF8')),'hex') END,
      CASE WHEN o IS NOT NULL THEN encode(sha256(convert_to(o::text,'UTF8')),'hex') END,
      CASE WHEN n IS NOT NULL THEN encode(sha256(convert_to(n::text,'UTF8')),'hex') END);
  RETURN NULL;
END $$;

CREATE FUNCTION vpt_cutover_v2_20261015.initialize_control_audit() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
  INSERT INTO vpt_cutover_v2_20261015.fence_audit(run_id,epoch,action,reason,actor,transaction_id)
    VALUES(NEW.run_id,NEW.epoch,'initialize','operator_recovery',session_user::regrole::oid,txid_current());
  RETURN NULL;
END $$;
CREATE TRIGGER initialize_control_audit AFTER INSERT ON vpt_cutover_v2_20261015.control FOR EACH ROW EXECUTE FUNCTION vpt_cutover_v2_20261015.initialize_control_audit();
ALTER TABLE vpt_cutover_v2_20261015.control ENABLE ALWAYS TRIGGER initialize_control_audit;

CREATE FUNCTION vpt_cutover_v2_20261015.write_fence() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog SET timezone='UTC' AS $$
DECLARE c vpt_cutover_v2_20261015.control%ROWTYPE; r vpt_cutover_v2_20261015.registrations%ROWTYPE;
  owner_id oid; permitted boolean;
BEGIN
  SELECT * INTO STRICT r FROM vpt_cutover_v2_20261015.registrations
    WHERE table_oid=TG_RELID AND table_name=TG_TABLE_NAME AND TG_TABLE_SCHEMA='public';
  -- Every write takes this lock, even while open. Activation drains old writers;
  -- old repeatable-read snapshots cannot silently observe a stale open state.
  SELECT * INTO STRICT c FROM vpt_cutover_v2_20261015.control WHERE singleton FOR SHARE;
  IF c.run_id<>r.run_id THEN RAISE EXCEPTION USING ERRCODE='55000',MESSAGE='CUTOVER_V2_CONTROL_MISMATCH'; END IF;
  IF TG_OP='TRUNCATE' THEN RAISE EXCEPTION USING ERRCODE='55000',MESSAGE='CUTOVER_V2_TRUNCATE_HELD'; END IF;
  IF NOT c.active THEN RETURN NULL; END IF;
  SELECT owner_oid INTO STRICT owner_id FROM vpt_cutover_v2_20261015.runs WHERE id=c.run_id;
  SELECT EXISTS(SELECT 1 FROM vpt_cutover_v2_20261015.permits p
    WHERE p.run_id=c.run_id AND p.epoch=c.epoch AND p.actor=session_user::regrole::oid
      AND p.actor=owner_id AND p.backend_pid=pg_backend_pid() AND p.transaction_id=txid_current()
      AND TG_RELID=ANY(p.table_oids) AND TG_OP=ANY(p.operations) AND clock_timestamp()<p.expires_at)
    INTO permitted;
  IF permitted THEN RETURN NULL; END IF;
  RAISE EXCEPTION USING ERRCODE='55000',MESSAGE=CASE WHEN clock_timestamp()>c.deadline THEN 'CUTOVER_V2_FENCE_EXPIRED_MANUAL_RECOVERY' ELSE 'CUTOVER_V2_WRITE_FENCED' END;
END $$;

-- Explicit operator transaction permit; never an automatic postgres/GUC bypass.
CREATE FUNCTION vpt_cutover_v2_20261015.mint_permit(p_run uuid,p_epoch uuid,p_tables oid[],p_ops text[],p_reason text) RETURNS void
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog SET timezone='UTC' AS $$
DECLARE c vpt_cutover_v2_20261015.control%ROWTYPE; owner_id oid;
BEGIN
  SELECT owner_oid INTO STRICT owner_id FROM vpt_cutover_v2_20261015.runs WHERE id=p_run;
  IF session_user::regrole::oid<>owner_id OR current_user::regrole::oid<>owner_id THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='CUTOVER_V2_OPERATOR_REQUIRED';
  END IF;
  SELECT * INTO STRICT c FROM vpt_cutover_v2_20261015.control WHERE singleton FOR SHARE;
  IF p_run IS NULL OR p_epoch IS NULL OR p_reason IS NULL OR NOT c.active OR c.run_id<>p_run OR c.epoch<>p_epoch OR p_reason NOT IN ('closing_capture','bounded_parent_repair','operator_recovery')
    OR cardinality(p_tables) IS NULL OR cardinality(p_tables)=0 OR cardinality(p_ops) IS NULL OR cardinality(p_ops)=0
    OR NOT p_ops<@ARRAY['INSERT','UPDATE','DELETE']::text[]
    OR EXISTS(SELECT 1 FROM unnest(p_tables) t WHERE NOT EXISTS(SELECT 1 FROM vpt_cutover_v2_20261015.registrations r WHERE r.run_id=p_run AND r.table_oid=t)) THEN
    RAISE EXCEPTION USING ERRCODE='55000',MESSAGE='CUTOVER_V2_PERMIT_SCOPE';
  END IF;
  INSERT INTO vpt_cutover_v2_20261015.permits VALUES(p_run,p_epoch,owner_id,pg_backend_pid(),txid_current(),p_tables,p_ops,clock_timestamp()+interval '5 minutes');
  INSERT INTO vpt_cutover_v2_20261015.fence_audit(run_id,epoch,action,reason,actor,transaction_id)
    VALUES(p_run,p_epoch,'permit',p_reason,owner_id,txid_current());
END $$;

CREATE FUNCTION vpt_cutover_v2_20261015.transition_fence(p_run uuid,p_expected_epoch uuid,p_new_epoch uuid,p_active boolean,p_deadline timestamptz,p_reason text) RETURNS void
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog SET timezone='UTC' AS $$
DECLARE c vpt_cutover_v2_20261015.control%ROWTYPE; owner_id oid;
BEGIN
  SELECT owner_oid INTO STRICT owner_id FROM vpt_cutover_v2_20261015.runs WHERE id=p_run;
  IF session_user::regrole::oid<>owner_id OR current_user::regrole::oid<>owner_id THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='CUTOVER_V2_OPERATOR_REQUIRED';
  END IF;
  SELECT * INTO STRICT c FROM vpt_cutover_v2_20261015.control WHERE singleton FOR UPDATE;
  IF p_run IS NULL OR p_expected_epoch IS NULL OR p_new_epoch IS NULL OR p_reason IS NULL OR c.run_id<>p_run OR c.epoch<>p_expected_epoch OR p_new_epoch=p_expected_epoch OR p_reason NOT IN ('closing_capture','operator_recovery')
    OR p_active IS NULL OR (p_active AND (p_deadline IS NULL OR p_deadline<=clock_timestamp() OR p_deadline>clock_timestamp()+interval '15 minutes')) THEN
    RAISE EXCEPTION USING ERRCODE='55000',MESSAGE='CUTOVER_V2_FENCE_TRANSITION';
  END IF;
  UPDATE vpt_cutover_v2_20261015.control SET active=p_active,epoch=p_new_epoch,deadline=CASE WHEN p_active THEN p_deadline END,changed_at=clock_timestamp() WHERE singleton;
  INSERT INTO vpt_cutover_v2_20261015.fence_audit(run_id,epoch,action,reason,actor,transaction_id)
    VALUES(p_run,p_new_epoch,CASE WHEN p_active THEN 'activate' ELSE 'release' END,p_reason,owner_id,txid_current());
END $$;

DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['runs','registrations','control','fence_audit','permits','events','receipts','artifacts'] LOOP
    EXECUTE format('ALTER TABLE vpt_cutover_v2_20261015.%I ENABLE ROW LEVEL SECURITY',t);
    EXECUTE format('ALTER TABLE vpt_cutover_v2_20261015.%I FORCE ROW LEVEL SECURITY',t);
    EXECUTE format('REVOKE ALL ON vpt_cutover_v2_20261015.%I FROM PUBLIC,anon,authenticated,service_role,authenticator',t);
    EXECUTE format('CREATE POLICY owner_only ON vpt_cutover_v2_20261015.%I TO %I USING(true) WITH CHECK(true)',t,current_user);
  END LOOP;
  FOREACH t IN ARRAY ARRAY['runs','fence_audit','permits','events','receipts','artifacts'] LOOP
    EXECUTE format('CREATE TRIGGER immutable_evidence BEFORE UPDATE OR DELETE OR TRUNCATE ON vpt_cutover_v2_20261015.%I FOR EACH STATEMENT EXECUTE FUNCTION vpt_cutover_v2_20261015.immutable_evidence()',t);
    EXECUTE format('ALTER TABLE vpt_cutover_v2_20261015.%I ENABLE ALWAYS TRIGGER immutable_evidence',t);
  END LOOP;
END $$;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA vpt_cutover_v2_20261015 FROM PUBLIC,anon,authenticated,service_role,authenticator;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA vpt_cutover_v2_20261015 FROM PUBLIC,anon,authenticated,service_role,authenticator;
COMMENT ON TABLE vpt_cutover_v2_20261015.control IS 'Durable fail-closed write fence. Deadlines never reopen it. Explicit owner epoch transition/manual recovery only; application/container lifetime irrelevant.';
COMMENT ON TABLE vpt_cutover_v2_20261015.receipts IS 'Append-only per-site reservations and COMMIT receipts. Artifact absence after a committed receipt is evidence loss, never permission to recapture.';
COMMIT;
