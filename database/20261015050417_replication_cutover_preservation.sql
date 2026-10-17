-- Preparation only, on each reviewed project. No triggers are attached here.
-- The separate owner-only runner arms a small explicit table scope.
BEGIN;
CREATE SCHEMA vpt_cutover_20261015 AUTHORIZATION CURRENT_USER;
REVOKE ALL ON SCHEMA vpt_cutover_20261015 FROM PUBLIC,anon,authenticated,service_role,authenticator;
CREATE TABLE vpt_cutover_20261015.runs (
  id uuid PRIMARY KEY,
  operation text NOT NULL CHECK(operation='current_state_cutover_v1'),
  site text NOT NULL CHECK(site IN ('primary','backup')),
  definition jsonb NOT NULL,
  definition_sha256 text NOT NULL CHECK(definition_sha256 ~ '^[a-f0-9]{64}$'),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE vpt_cutover_20261015.registrations (
  run_id uuid NOT NULL REFERENCES vpt_cutover_20261015.runs(id),
  table_name text PRIMARY KEY CHECK(table_name IN ('crm_leads','project_substage_status','users','departments','trash_items')),
  table_oid oid NOT NULL UNIQUE,
  pk_columns text[] NOT NULL CHECK(pk_columns=ARRAY['id']::text[]),
  catalog_sha256 text NOT NULL CHECK(catalog_sha256 ~ '^[a-f0-9]{64}$')
);
CREATE TABLE vpt_cutover_20261015.events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  run_id uuid NOT NULL REFERENCES vpt_cutover_20261015.runs(id),
  table_name text NOT NULL,
  operation text NOT NULL CHECK(operation IN ('INSERT','UPDATE','DELETE')),
  transaction_id bigint NOT NULL,
  observed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  old_key jsonb,
  new_key jsonb,
  old_context jsonb,
  new_context jsonb,
  old_digest text,
  new_digest text,
  touched_columns text[] NOT NULL
);
CREATE INDEX events_run_id_idx ON vpt_cutover_20261015.events(run_id,id);
CREATE TABLE vpt_cutover_20261015.artifacts (
  run_id uuid NOT NULL REFERENCES vpt_cutover_20261015.runs(id),
  capture_id uuid NOT NULL,
  phase text NOT NULL CHECK(phase IN ('baseline','closing')),
  site text NOT NULL CHECK(site IN ('primary','backup')),
  stream text NOT NULL,
  part integer NOT NULL CHECK(part>=0),
  row_count integer NOT NULL CHECK(row_count>=0),
  algorithm text NOT NULL CHECK(algorithm='aes-256-gcm/hkdf-sha256/cutover_v1'),
  key_label text NOT NULL,
  salt bytea NOT NULL CHECK(octet_length(salt)=32),
  nonce bytea NOT NULL CHECK(octet_length(nonce)=12),
  auth_tag bytea NOT NULL CHECK(octet_length(auth_tag)=16),
  ciphertext bytea NOT NULL CHECK(octet_length(ciphertext)>0),
  ciphertext_sha256 text NOT NULL CHECK(ciphertext_sha256 ~ '^[a-f0-9]{64}$'),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(run_id,capture_id,phase,site,stream,part)
);
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['runs','registrations','events','artifacts'] LOOP
    EXECUTE format('ALTER TABLE vpt_cutover_20261015.%I ENABLE ROW LEVEL SECURITY',t);
    EXECUTE format('ALTER TABLE vpt_cutover_20261015.%I FORCE ROW LEVEL SECURITY',t);
    EXECUTE format('REVOKE ALL ON vpt_cutover_20261015.%I FROM PUBLIC,anon,authenticated,service_role,authenticator',t);
    EXECUTE format('CREATE POLICY owner_only ON vpt_cutover_20261015.%I TO %I USING(true) WITH CHECK(true)',t,current_user);
  END LOOP;
END $$;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA vpt_cutover_20261015 FROM PUBLIC,anon,authenticated,service_role,authenticator;
CREATE FUNCTION vpt_cutover_20261015.capture_identity_change() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog SET timezone='UTC' AS $$
DECLARE r vpt_cutover_20261015.registrations%ROWTYPE; old_row jsonb; new_row jsonb;
  old_pk jsonb; new_pk jsonb; old_ctx jsonb; new_ctx jsonb; changed text[];
BEGIN
  SELECT * INTO STRICT r FROM vpt_cutover_20261015.registrations
    WHERE table_oid=TG_RELID AND table_name=TG_TABLE_NAME AND TG_TABLE_SCHEMA='public';
  IF TG_OP='TRUNCATE' THEN RAISE EXCEPTION USING ERRCODE='55000',MESSAGE='CUTOVER_TRUNCATE_HELD'; END IF;
  IF TG_OP<>'INSERT' THEN old_row:=to_jsonb(OLD); END IF;
  IF TG_OP<>'DELETE' THEN new_row:=to_jsonb(NEW); END IF;
  IF old_row IS NOT NULL THEN
    SELECT jsonb_object_agg(k,old_row->k) INTO old_pk FROM unnest(r.pk_columns) k;
    old_ctx:=jsonb_strip_nulls(jsonb_build_object('id',old_row->'id',
      'company_id',CASE WHEN old_row->>'company_id' ~* '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$' THEN old_row->'company_id' END,
      'code_sha256',CASE WHEN old_row->'code' IS NOT NULL AND old_row->'code'<>'null'::jsonb THEN encode(sha256(convert_to((old_row->'code')::text,'UTF8')),'hex') END,
      'type',CASE WHEN old_row->>'type' IN ('lead','deal') THEN old_row->'type' END));
  END IF;
  IF new_row IS NOT NULL THEN
    SELECT jsonb_object_agg(k,new_row->k) INTO new_pk FROM unnest(r.pk_columns) k;
    new_ctx:=jsonb_strip_nulls(jsonb_build_object('id',new_row->'id',
      'company_id',CASE WHEN new_row->>'company_id' ~* '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$' THEN new_row->'company_id' END,
      'code_sha256',CASE WHEN new_row->'code' IS NOT NULL AND new_row->'code'<>'null'::jsonb THEN encode(sha256(convert_to((new_row->'code')::text,'UTF8')),'hex') END,
      'type',CASE WHEN new_row->>'type' IN ('lead','deal') THEN new_row->'type' END));
  END IF;
  SELECT coalesce(array_agg(k ORDER BY k),ARRAY[]::text[]) INTO changed
    FROM (SELECT jsonb_object_keys(coalesce(old_row,'{}'::jsonb)||coalesce(new_row,'{}'::jsonb)) k) keys
    WHERE old_row->k IS DISTINCT FROM new_row->k;
  INSERT INTO vpt_cutover_20261015.events(run_id,table_name,operation,transaction_id,old_key,new_key,old_context,new_context,old_digest,new_digest,touched_columns)
    VALUES(r.run_id,TG_TABLE_NAME,TG_OP,txid_current(),old_pk,new_pk,old_ctx,new_ctx,
      CASE WHEN old_row IS NOT NULL THEN encode(sha256(convert_to(old_row::text,'UTF8')),'hex') END,
      CASE WHEN new_row IS NOT NULL THEN encode(sha256(convert_to(new_row::text,'UTF8')),'hex') END,changed);
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION vpt_cutover_20261015.capture_identity_change() FROM PUBLIC,anon,authenticated,service_role,authenticator;
COMMENT ON TABLE vpt_cutover_20261015.events IS
  'Final-state/tombstone identity journal, not complete row history or original RAM intents. No credential/contact payload. No pruning or max-ID commit-order cursor.';
COMMENT ON TABLE vpt_cutover_20261015.artifacts IS
  'Owner-only authenticated encrypted raw-JSON baseline/closing exports. Retain exact private key version; key_label alone is not key escrow. No replay or business data restoration.';
COMMIT;
