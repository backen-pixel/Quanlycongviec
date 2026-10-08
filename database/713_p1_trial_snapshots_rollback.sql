-- Keep nonempty evidence, including when rolling back application code.
BEGIN;
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';
DROP FUNCTION IF EXISTS public.p1_trial_snapshot_put_v1(uuid,uuid,timestamptz,jsonb,jsonb,text);
DO $$
BEGIN
  IF to_regclass('public.p1_trial_snapshots') IS NOT NULL THEN
    ALTER TABLE public.p1_trial_snapshots ENABLE ROW LEVEL SECURITY;
    REVOKE ALL ON public.p1_trial_snapshots FROM PUBLIC, anon, authenticated, service_role;
    IF EXISTS (SELECT 1 FROM public.p1_trial_snapshots LIMIT 1) THEN
      RAISE NOTICE 'Keeping nonempty table public.p1_trial_snapshots';
    ELSE
      BEGIN
        DROP TABLE public.p1_trial_snapshots;
      EXCEPTION WHEN dependent_objects_still_exist THEN
        RAISE NOTICE 'Keeping public.p1_trial_snapshots because dependent objects remain';
      END;
    END IF;
  END IF;
END $$;
COMMIT;
