-- Read-only selectors/history for the response editor. No new privileges/enrollment.
BEGIN;
CREATE OR REPLACE FUNCTION public.crm_care_library_choices(p_actor uuid,p_company uuid,p_kind text,p_search text DEFAULT '',p_after uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE rows jsonb;items jsonb;more boolean;last_id uuid;
BEGIN
 PERFORM public.marketing_fb_intake_admin(p_actor,p_company);
 IF (p_kind IN ('product','region')) IS NOT TRUE OR p_search IS NULL OR length(p_search)>100 THEN RAISE EXCEPTION 'invalid selector' USING ERRCODE='22023';END IF;
 -- Shared/global products are not implicitly approved for this company.
 IF p_kind='product' THEN
  IF p_after IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.products p WHERE p.id=p_after AND p.company_id=p_company AND p.status='active'
   AND strpos(lower(coalesce(to_jsonb(p)->>'name','')||' '||coalesce(to_jsonb(p)->>'code','')),lower(p_search))>0)
   THEN RAISE EXCEPTION 'selector cursor changed' USING ERRCODE='40001';END IF;
  SELECT coalesce(jsonb_agg(x ORDER BY x->>'id'),'[]') INTO rows FROM (
   SELECT jsonb_build_object('id',p.id,'name',coalesce(nullif(to_jsonb(p)->>'name',''),'Chưa đặt tên'),'code',coalesce(to_jsonb(p)->>'code','')) x
   FROM public.products p WHERE p.company_id=p_company AND p.status='active' AND (p_after IS NULL OR p.id>p_after)
    AND strpos(lower(coalesce(to_jsonb(p)->>'name','')||' '||coalesce(to_jsonb(p)->>'code','')),lower(p_search))>0 ORDER BY p.id LIMIT 51
  ) q;
 ELSE
  IF p_after IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.company_regions r WHERE r.id=p_after AND r.company_id=p_company AND r.is_active IS TRUE
   AND strpos(lower(coalesce(to_jsonb(r)->>'name','')),lower(p_search))>0)
   THEN RAISE EXCEPTION 'selector cursor changed' USING ERRCODE='40001';END IF;
  SELECT coalesce(jsonb_agg(x ORDER BY x->>'id'),'[]') INTO rows FROM (
   SELECT jsonb_build_object('id',r.id,'name',coalesce(nullif(to_jsonb(r)->>'name',''),'Chưa đặt tên'),'code','') x
   FROM public.company_regions r WHERE r.company_id=p_company AND r.is_active IS TRUE AND (p_after IS NULL OR r.id>p_after)
    AND strpos(lower(coalesce(to_jsonb(r)->>'name','')),lower(p_search))>0 ORDER BY r.id LIMIT 51
  ) q;
 END IF;
 more:=jsonb_array_length(rows)>50;
 SELECT coalesce(jsonb_agg(value ORDER BY ordinality),'[]') INTO items FROM jsonb_array_elements(rows) WITH ORDINALITY WHERE ordinality<=50;
 IF more THEN last_id:=(items->49->>'id')::uuid;END IF;
 RETURN jsonb_build_object('companyId',p_company,'kind',p_kind,'search',p_search,'items',items,'nextAfter',last_id);
END $$;

CREATE OR REPLACE FUNCTION public.crm_care_library_history(p_actor uuid,p_company uuid,p_entry uuid,p_version text,p_before uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE view jsonb;cursor public.crm_care_library_events%ROWTYPE;rows jsonb;items jsonb;last_id uuid;
BEGIN
 view:=public.crm_care_library_read(p_actor,p_company,p_entry);
 IF p_version IS DISTINCT FROM view->>'version' THEN RAISE EXCEPTION 'entry changed' USING ERRCODE='40001';END IF;
 IF p_before IS NOT NULL THEN
  SELECT * INTO cursor FROM public.crm_care_library_events WHERE request_id=p_before AND company_id=p_company AND entry_id=p_entry;
  IF NOT FOUND THEN RAISE EXCEPTION 'history cursor denied' USING ERRCODE='42501';END IF;
 END IF;
 SELECT coalesce(jsonb_agg(x ORDER BY at DESC,rid DESC),'[]') INTO rows FROM (
  SELECT e.recorded_at at,e.request_id rid,jsonb_build_object('requestId',e.request_id,'action',e.command->'action',
   'recordedAt',e.recorded_at,'actorName',coalesce(nullif(to_jsonb(u)->>'full_name',''),'Người dùng trong hệ thống'),
   'reason',e.command->'reason','revision',e.result->'entry'->'revision','state',e.result->'entry'->'state',
   'document',e.result->'entry'->'document') x
  FROM public.crm_care_library_events e LEFT JOIN public.users u ON u.id=e.actor_id
  WHERE e.company_id=p_company AND e.entry_id=p_entry AND (p_before IS NULL OR (e.recorded_at,e.request_id)<(cursor.recorded_at,cursor.request_id))
  ORDER BY e.recorded_at DESC,e.request_id DESC LIMIT 51
 ) q;
 SELECT coalesce(jsonb_agg(value ORDER BY ordinality),'[]') INTO items FROM jsonb_array_elements(rows) WITH ORDINALITY WHERE ordinality<=50;
 IF jsonb_array_length(rows)>50 THEN last_id:=(items->49->>'requestId')::uuid;END IF;
 RETURN jsonb_build_object('companyId',p_company,'entryId',p_entry,'version',p_version,'historical',true,'items',items,'nextBefore',last_id);
END $$;
REVOKE ALL ON FUNCTION public.crm_care_library_choices(uuid,uuid,text,text,uuid),public.crm_care_library_history(uuid,uuid,uuid,text,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.crm_care_library_choices(uuid,uuid,text,text,uuid),public.crm_care_library_history(uuid,uuid,uuid,text,uuid) TO service_role;
COMMIT;
