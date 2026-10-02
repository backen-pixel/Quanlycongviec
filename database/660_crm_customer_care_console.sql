-- Scoped operator queue and full transcript pagination; no sending/delegation.
BEGIN;
CREATE OR REPLACE FUNCTION public.crm_care_queue(p_actor uuid,p_company uuid,p_mode text,p_after uuid DEFAULT NULL,p_after_version text DEFAULT NULL,p_queue_version text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE cursor_row public.crm_care_threads%ROWTYPE;cursor_time timestamptz;items jsonb;counts jsonb;more boolean;unavailable bigint;queue_version text;
BEGIN
 PERFORM public.marketing_fb_intake_admin(p_actor,p_company);
 IF (p_mode IN ('WAITING','HUMAN_REQUESTED','HUMAN_ACTIVE','OPTED_OUT')) IS NOT TRUE
  OR (p_after IS NULL) IS DISTINCT FROM (p_after_version IS NULL) OR (p_after IS NULL) IS DISTINCT FROM (p_queue_version IS NULL) THEN RAISE EXCEPTION 'invalid care queue request' USING ERRCODE='22023';END IF;
 IF p_after IS NOT NULL THEN
  SELECT * INTO cursor_row FROM public.crm_care_threads WHERE id=p_after AND company_id=p_company AND mode=p_mode FOR SHARE;
  IF NOT FOUND OR md5(to_jsonb(cursor_row)::text) IS DISTINCT FROM p_after_version THEN RAISE EXCEPTION 'care queue changed' USING ERRCODE='40001';END IF;
  cursor_time:=CASE WHEN p_mode='HUMAN_REQUESTED' THEN coalesce(cursor_row.human_deadline,cursor_row.created_at) ELSE cursor_row.created_at END;
 END IF;
 -- One statement snapshot for counts, membership/order token and selected rows.
 -- The token invalidates paging when any thread moves across the boundary,
 -- including a new urgent request that the old boundary row alone cannot detect.
 WITH scoped AS MATERIALIZED (
  SELECT t.*,coalesce(p.is_active=true AND p.default_company_id=p_company,false) scope_available
  FROM public.crm_care_threads t LEFT JOIN public.facebook_pages p ON p.page_id=t.page_id WHERE t.company_id=p_company
 ), picked AS (
  SELECT t.id,t.mode,t.reason,t.page_id,t.human_deadline,t.last_message_at,t.created_at,md5((to_jsonb(t)-'scope_available')::text) version,
   t.scope_available,
   CASE WHEN p_mode='HUMAN_REQUESTED' THEN coalesce(t.human_deadline,t.created_at) ELSE t.created_at END queue_at
  FROM scoped t WHERE t.mode=p_mode
   AND (p_after IS NULL OR (CASE WHEN p_mode='HUMAN_REQUESTED' THEN coalesce(t.human_deadline,t.created_at) ELSE t.created_at END,t.id)>(cursor_time,p_after))
  ORDER BY queue_at,t.id LIMIT 51)
 SELECT (SELECT coalesce(jsonb_object_agg(mode,n),'{}'::jsonb) FROM(SELECT mode,count(*) n FROM scoped GROUP BY mode)x),
  (SELECT count(*) FROM scoped WHERE NOT scope_available),
  (SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.queue_at,x.id),'[]'::jsonb) FROM picked x),
  (SELECT md5(coalesce(string_agg(id::text||':'||mode||':'||coalesce(human_deadline::text,'')||':'||created_at::text||':'||scope_available::text,',' ORDER BY id),'')) FROM scoped)
 INTO counts,unavailable,items,queue_version;
 IF p_after IS NOT NULL AND queue_version IS DISTINCT FROM p_queue_version THEN RAISE EXCEPTION 'care queue membership changed' USING ERRCODE='40001';END IF;
 more:=jsonb_array_length(items)>50;IF more THEN items:=items-50;END IF;
 RETURN jsonb_build_object('companyId',p_company,'mode',p_mode,'counts',counts,'unavailableCount',unavailable,'items',items,
  'nextCursor',CASE WHEN more THEN jsonb_build_object('id',items->49->>'id','version',items->49->>'version','queueVersion',queue_version) ELSE NULL END,
  'observedAt',clock_timestamp(),'aiMaySend',false);
END $$;

CREATE OR REPLACE FUNCTION public.crm_care_history(p_actor uuid,p_company uuid,p_thread uuid,p_before uuid,p_version text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE view jsonb;cursor_time timestamptz;messages jsonb;more boolean;
BEGIN
 -- Same fresh company/Page/CRM authority and thread lock as detail/control.
 view:=public.crm_care_read(p_actor,p_company,p_thread);
 IF view->>'version' IS DISTINCT FROM p_version THEN RAISE EXCEPTION 'care transcript changed' USING ERRCODE='40001';END IF;
 SELECT sent_at INTO cursor_time FROM public.crm_care_messages WHERE id=p_before AND thread_id=p_thread;
 IF NOT FOUND THEN RAISE EXCEPTION 'invalid care history cursor' USING ERRCODE='22023';END IF;
 SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.sent_at DESC,x.id DESC),'[]'::jsonb) INTO messages FROM(
  SELECT id,direction,content,attachments,sent_at,intent FROM public.crm_care_messages
  WHERE thread_id=p_thread AND (sent_at,id)<(cursor_time,p_before) ORDER BY sent_at DESC,id DESC LIMIT 51)x;
 more:=jsonb_array_length(messages)>50;IF more THEN messages:=messages-50;END IF;
 SELECT coalesce(jsonb_agg(value ORDER BY value->>'sent_at',value->>'id'),'[]'::jsonb) INTO messages FROM jsonb_array_elements(messages);
 RETURN jsonb_build_object('companyId',p_company,'threadId',p_thread,'version',view->>'version','messages',messages,
  'nextBefore',CASE WHEN more THEN messages->0->>'id' ELSE NULL END,'messageCount',view->'messageCount','aiMaySend',false);
END $$;
REVOKE ALL ON FUNCTION public.crm_care_queue(uuid,uuid,text,uuid,text,text),public.crm_care_history(uuid,uuid,uuid,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.crm_care_queue(uuid,uuid,text,uuid,text,text),public.crm_care_history(uuid,uuid,uuid,uuid,text) TO service_role;
COMMIT;
