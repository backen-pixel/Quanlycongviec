-- P1-5 rollback preserves recorded qualification evidence.
BEGIN;
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';
DROP FUNCTION IF EXISTS public.p1_qualification_command_v1(text,uuid,uuid,text,uuid,integer,jsonb);
DROP FUNCTION IF EXISTS public.p1_qualification_state_v1(uuid,uuid);
DO $$
BEGIN
  IF to_regclass('public.p1_qualification_events') IS NOT NULL THEN
    ALTER TABLE public.p1_qualification_events ENABLE ROW LEVEL SECURITY;
    REVOKE ALL ON public.p1_qualification_events FROM PUBLIC, anon, authenticated, service_role;
    IF EXISTS (SELECT 1 FROM public.p1_qualification_events LIMIT 1) THEN
      RAISE NOTICE 'Keeping nonempty table public.p1_qualification_events';
    ELSE
      BEGIN
        DROP TABLE public.p1_qualification_events;
      EXCEPTION WHEN dependent_objects_still_exist THEN
        RAISE NOTICE 'Keeping public.p1_qualification_events because dependent objects remain';
      END;
    END IF;
  END IF;
END $$;
COMMIT;
