-- P1 registry rollback: remove only empty P1 tables, child first; preserve evidence.
BEGIN;
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';
DROP FUNCTION IF EXISTS public.p1_trial_command_v1(text,uuid,uuid,text,uuid,integer,jsonb);
DO $$
DECLARE table_name text; has_rows boolean;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['p1_trial_config_events','p1_trial_scopes','p1_trials'] LOOP
    IF to_regclass('public.' || table_name) IS NULL THEN CONTINUE; END IF;
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC, anon, authenticated, service_role', table_name);
    EXECUTE format('SELECT EXISTS (SELECT 1 FROM public.%I LIMIT 1)', table_name) INTO has_rows;
    IF has_rows THEN
      RAISE NOTICE 'Keeping nonempty table public.%', table_name;
    ELSE
      BEGIN
        EXECUTE format('DROP TABLE public.%I', table_name);
      EXCEPTION WHEN dependent_objects_still_exist THEN
        RAISE NOTICE 'Keeping public.% because dependent objects remain', table_name;
      END;
    END IF;
  END LOOP;
END $$;
COMMIT;
