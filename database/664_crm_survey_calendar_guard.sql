-- Cutover prerequisite for transactional survey booking. Empty by default.
-- No application role can enroll staff or create a write permit. Enrollment
-- requires a separately reviewed release; do not enable before old writers
-- have an atomic replacement and customer-confirmed booking is implemented.
BEGIN;
CREATE SCHEMA IF NOT EXISTS crm_survey_control;
REVOKE ALL ON SCHEMA crm_survey_control FROM PUBLIC,anon,authenticated,service_role;
CREATE TABLE IF NOT EXISTS crm_survey_control.crm_survey_calendar_staff (
 staff_id uuid PRIMARY KEY,
 company_id uuid NOT NULL,
 enrolled_by uuid NOT NULL,
 release_reference text NOT NULL CHECK (length(btrim(release_reference)) BETWEEN 20 AND 2000),
 enrolled_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
-- No cascading FK: deleting a business row must never silently unenroll staff.
CREATE TABLE IF NOT EXISTS crm_survey_control.crm_survey_calendar_permits (
 transaction_id bigint NOT NULL,
 backend_pid integer NOT NULL,
 event_id uuid NOT NULL,
 PRIMARY KEY(transaction_id,backend_pid,event_id)
);
ALTER TABLE crm_survey_control.crm_survey_calendar_staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_survey_control.crm_survey_calendar_permits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON crm_survey_control.crm_survey_calendar_staff,crm_survey_control.crm_survey_calendar_permits FROM PUBLIC,anon,authenticated,service_role;

-- One gate covers both calendar tables and enrollment, including writes from
-- old routes, custom modules, maintenance helpers and FK cascade actions.
-- Reads remain concurrent. Global serialization is deliberately conservative;
-- release performance testing is required before enrolling real staff.
CREATE OR REPLACE FUNCTION crm_survey_control.crm_survey_calendar_gate()
RETURNS trigger LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 IF current_setting('transaction_isolation') <> 'read committed' THEN
  RAISE EXCEPTION 'calendar mutation requires read committed' USING ERRCODE='0A000';
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('crm-survey-calendar-write-gate-v1',0));
 IF TG_OP='TRUNCATE' AND EXISTS(SELECT 1 FROM crm_survey_control.crm_survey_calendar_staff) THEN
  RAISE EXCEPTION 'controlled calendar transition required' USING ERRCODE='42501';
 END IF;
 RETURN NULL;
END $$;

CREATE OR REPLACE FUNCTION crm_survey_control.crm_survey_calendar_guard()
RETURNS trigger LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE before_row jsonb;after_row jsonb;event_ids uuid[];people uuid[];v_event_id uuid;protected boolean;
BEGIN
 -- Row triggers also take the gate: FK actions may enter without the original
 -- calendar statement trigger. The lock is transaction-scoped and reentrant.
 IF current_setting('transaction_isolation') <> 'read committed' THEN
  RAISE EXCEPTION 'calendar mutation requires read committed' USING ERRCODE='0A000';
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('crm-survey-calendar-write-gate-v1',0));
 IF TG_OP<>'INSERT' THEN before_row:=to_jsonb(OLD);END IF;
 IF TG_OP<>'DELETE' THEN after_row:=to_jsonb(NEW);END IF;
 IF TG_TABLE_NAME='crm_events' THEN
  event_ids:=ARRAY[(before_row->>'id')::uuid,(after_row->>'id')::uuid];
  people:=ARRAY[(before_row->>'created_by')::uuid,(before_row->>'assignee_id')::uuid,
                (after_row->>'created_by')::uuid,(after_row->>'assignee_id')::uuid];
 ELSE
  event_ids:=ARRAY[(before_row->>'event_id')::uuid,(after_row->>'event_id')::uuid];
  people:=ARRAY[(before_row->>'user_id')::uuid,(after_row->>'user_id')::uuid];
 END IF;
 -- Include old AND new identity even when changing event_id/user_id, declining
 -- an invitation or cancelling an event. Removing a busy relation in one
 -- transaction and restoring it in another must not expose a booking gap.
 SELECT EXISTS(
  SELECT 1 FROM crm_survey_control.crm_survey_calendar_staff s WHERE s.staff_id=ANY(people)
   OR EXISTS(SELECT 1 FROM public.crm_events e WHERE e.id=ANY(event_ids)
             AND (e.created_by=s.staff_id OR e.assignee_id=s.staff_id))
   OR EXISTS(SELECT 1 FROM public.crm_event_participants p WHERE p.event_id=ANY(event_ids) AND p.user_id=s.staff_id)
 ) INTO protected;
 IF protected THEN
  FOR v_event_id IN SELECT DISTINCT x FROM unnest(event_ids) x WHERE x IS NOT NULL LOOP
   IF NOT EXISTS(SELECT 1 FROM crm_survey_control.crm_survey_calendar_permits p
    WHERE p.transaction_id=txid_current() AND p.backend_pid=pg_backend_pid() AND p.event_id=v_event_id) THEN
    RAISE EXCEPTION 'controlled calendar transition required' USING ERRCODE='42501';
   END IF;
  END LOOP;
  -- A participant without an event must not orphan an enrolled person's work.
  IF TG_TABLE_NAME='crm_event_participants' AND TG_OP<>'DELETE' AND after_row->>'event_id' IS NULL THEN
   RAISE EXCEPTION 'controlled calendar transition required' USING ERRCODE='42501';
  END IF;
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD;ELSE RETURN NEW;END IF;
END $$;

REVOKE ALL ON FUNCTION crm_survey_control.crm_survey_calendar_gate(),crm_survey_control.crm_survey_calendar_guard() FROM PUBLIC,anon,authenticated,service_role;

DROP TRIGGER IF EXISTS crm_survey_calendar_gate ON public.crm_events;
CREATE TRIGGER crm_survey_calendar_gate BEFORE INSERT OR UPDATE OR DELETE OR TRUNCATE ON public.crm_events
 FOR EACH STATEMENT EXECUTE FUNCTION crm_survey_control.crm_survey_calendar_gate();
DROP TRIGGER IF EXISTS crm_survey_calendar_guard ON public.crm_events;
CREATE TRIGGER crm_survey_calendar_guard BEFORE INSERT OR UPDATE OR DELETE ON public.crm_events
 FOR EACH ROW EXECUTE FUNCTION crm_survey_control.crm_survey_calendar_guard();
DROP TRIGGER IF EXISTS crm_survey_calendar_gate ON public.crm_event_participants;
CREATE TRIGGER crm_survey_calendar_gate BEFORE INSERT OR UPDATE OR DELETE OR TRUNCATE ON public.crm_event_participants
 FOR EACH STATEMENT EXECUTE FUNCTION crm_survey_control.crm_survey_calendar_gate();
DROP TRIGGER IF EXISTS crm_survey_calendar_guard ON public.crm_event_participants;
CREATE TRIGGER crm_survey_calendar_guard BEFORE INSERT OR UPDATE OR DELETE ON public.crm_event_participants
 FOR EACH ROW EXECUTE FUNCTION crm_survey_control.crm_survey_calendar_guard();
DROP TRIGGER IF EXISTS crm_survey_calendar_gate ON crm_survey_control.crm_survey_calendar_staff;
CREATE TRIGGER crm_survey_calendar_gate BEFORE INSERT OR UPDATE OR DELETE OR TRUNCATE ON crm_survey_control.crm_survey_calendar_staff
 FOR EACH STATEMENT EXECUTE FUNCTION crm_survey_control.crm_survey_calendar_gate();
ALTER TABLE public.crm_events ENABLE ALWAYS TRIGGER crm_survey_calendar_gate;
ALTER TABLE public.crm_events ENABLE ALWAYS TRIGGER crm_survey_calendar_guard;
ALTER TABLE public.crm_event_participants ENABLE ALWAYS TRIGGER crm_survey_calendar_gate;
ALTER TABLE public.crm_event_participants ENABLE ALWAYS TRIGGER crm_survey_calendar_guard;
ALTER TABLE crm_survey_control.crm_survey_calendar_staff ENABLE ALWAYS TRIGGER crm_survey_calendar_gate;

-- Called inside each future booking transaction, never a cached startup check.
-- Backup tooling can explicitly disable USER triggers; such a database is not
-- eligible for survey writes until its controls and data are reconciled.
CREATE OR REPLACE FUNCTION crm_survey_control.assert_ready()
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE role_name text;object_name text;
BEGIN
 LOCK TABLE public.crm_events,public.crm_event_participants,crm_survey_control.crm_survey_calendar_staff IN ROW EXCLUSIVE MODE;
 IF current_setting('transaction_isolation') <> 'read committed' THEN
  RAISE EXCEPTION 'calendar mutation requires read committed' USING ERRCODE='0A000';
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('crm-survey-calendar-write-gate-v1',0));
 IF (SELECT count(*) FROM pg_trigger t WHERE NOT t.tgisinternal AND t.tgenabled='A' AND (
   (t.tgrelid IN ('public.crm_events'::regclass,'public.crm_event_participants'::regclass)
     AND t.tgname IN ('crm_survey_calendar_gate','crm_survey_calendar_guard'))
   OR (t.tgrelid='crm_survey_control.crm_survey_calendar_staff'::regclass AND t.tgname='crm_survey_calendar_gate'))
  )<>5 THEN RAISE EXCEPTION 'calendar controls unavailable' USING ERRCODE='42501';END IF;
 FOREACH role_name IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
  IF has_schema_privilege(role_name,'crm_survey_control','USAGE') OR has_schema_privilege(role_name,'crm_survey_control','CREATE') THEN
   RAISE EXCEPTION 'calendar controls unavailable' USING ERRCODE='42501';END IF;
  FOREACH object_name IN ARRAY ARRAY['crm_survey_control.crm_survey_calendar_staff','crm_survey_control.crm_survey_calendar_permits'] LOOP
   IF has_table_privilege(role_name,object_name,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') THEN
    RAISE EXCEPTION 'calendar controls unavailable' USING ERRCODE='42501';END IF;
  END LOOP;
 END LOOP;
END $$;
REVOKE ALL ON FUNCTION crm_survey_control.assert_ready() FROM PUBLIC,anon,authenticated,service_role;
COMMIT;
