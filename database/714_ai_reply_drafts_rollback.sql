BEGIN;
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';
DROP FUNCTION IF EXISTS public.ai_reply_draft_command_v1(text,uuid,uuid,text,uuid,uuid,integer,jsonb);
DROP FUNCTION IF EXISTS public.ai_reply_draft_usage_v1(uuid,uuid,date);
DO $$
BEGIN
  IF to_regclass('public.ai_reply_draft_events') IS NOT NULL THEN
    ALTER TABLE public.ai_reply_draft_events ENABLE ROW LEVEL SECURITY;
    REVOKE ALL ON public.ai_reply_draft_events FROM PUBLIC, anon, authenticated;
    REVOKE ALL ON public.ai_reply_draft_events FROM service_role;
    IF EXISTS (SELECT 1 FROM public.ai_reply_draft_events LIMIT 1) THEN
      RAISE NOTICE 'Keeping nonempty public.ai_reply_draft_events';
    ELSE
      BEGIN
        DROP TABLE public.ai_reply_draft_events;
      EXCEPTION WHEN dependent_objects_still_exist THEN
        RAISE NOTICE 'Keeping public.ai_reply_draft_events because dependent objects remain';
      END;
    END IF;
  END IF;
END $$;
COMMIT;
