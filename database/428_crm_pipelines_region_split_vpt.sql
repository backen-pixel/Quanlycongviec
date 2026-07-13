-- 428: Tách CRM pipeline theo khu vực cho Bếp Vạn Phú Thành (VPT)
--
-- VPT hiện có 3 khu vực (company_regions: HCM / Q2 / CT) nhưng chỉ dùng CHUNG
-- 1 pipeline CRM. Migration này:
--   1) Thêm cột crm_pipelines.region_id (khóa ngoại chính thức khu vực ↔ pipeline).
--   2) Gán pipeline hiện tại cho khu vực TP.HCM (giữ nguyên id, leads/deals HCM
--      không đổi pipeline_id/stage_id).
--   3) Clone pipeline (stages + crm_task_templates/items) cho khu vực Q2 và
--      Cần Thơ từ pipeline hiện tại.
--   4) Chuyển toàn bộ lead/deal của Q2 và Cần Thơ sang pipeline khu vực tương
--      ứng, remap stage_id sang stage mới tương đương (map theo id stage gốc).
--
-- Idempotent: nếu pipeline hiện tại của VPT đã có region_id thì bỏ qua toàn bộ
-- (marker: pipeline hiện tại có region_id NOT NULL).
--
-- ⚠️ YÊU CẦU: DB đã chạy migration 21_crm_pipelines.sql và 131_crm_company_regions.sql.

DO $$
DECLARE
  vpt_id UUID;
  old_pipeline_id UUID;
  hcm_region_id UUID;
  q2_region_id UUID;
  ct_region_id UUID;
  q2_pipeline_id UUID;
  ct_pipeline_id UUID;
  src_stage RECORD;
  new_stage_id UUID;
  src_tpl RECORD;
  new_tpl_id UUID;
  n_stages_q2 INT := 0;
  n_stages_ct INT := 0;
  n_tpl_q2 INT := 0;
  n_tpl_ct INT := 0;
  n_leads_q2 INT := 0;
  n_leads_ct INT := 0;
BEGIN
  IF to_regclass('public.crm_pipelines') IS NULL THEN
    RAISE EXCEPTION '428: Không có bảng public.crm_pipelines trên DB này (database=%).', current_database();
  END IF;
  IF to_regclass('public.company_regions') IS NULL THEN
    RAISE EXCEPTION '428: Không có bảng public.company_regions trên DB này — chạy migration 131 trước.';
  END IF;

  -- 0) Thêm cột region_id (idempotent, an toàn chạy lại nhiều lần)
  ALTER TABLE crm_pipelines
    ADD COLUMN IF NOT EXISTS region_id UUID REFERENCES company_regions(id) ON DELETE SET NULL;
  CREATE INDEX IF NOT EXISTS idx_crm_pipelines_region ON crm_pipelines(region_id);
  COMMENT ON COLUMN crm_pipelines.region_id IS 'Khu vực CRM (company_regions) mà pipeline này phục vụ; NULL = dùng chung cho mọi khu vực của công ty';

  SELECT id INTO vpt_id FROM companies
  WHERE name ILIKE '%Vạn Phú Thành%' OR name ILIKE '%Van Phu Thanh%'
  ORDER BY name LIMIT 1;
  IF vpt_id IS NULL THEN
    RAISE EXCEPTION '428: Không tìm thấy công ty Bếp Vạn Phú Thành.';
  END IF;

  SELECT id INTO hcm_region_id FROM company_regions WHERE company_id = vpt_id AND code = 'HCM' LIMIT 1;
  SELECT id INTO q2_region_id FROM company_regions WHERE company_id = vpt_id AND code = 'Q2' LIMIT 1;
  SELECT id INTO ct_region_id FROM company_regions WHERE company_id = vpt_id AND code = 'CT' LIMIT 1;

  IF hcm_region_id IS NULL OR q2_region_id IS NULL OR ct_region_id IS NULL THEN
    RAISE EXCEPTION '428: Thiếu khu vực HCM/Q2/CT cho VPT (hcm=%, q2=%, ct=%).', hcm_region_id, q2_region_id, ct_region_id;
  END IF;

  SELECT p.id INTO old_pipeline_id
  FROM crm_pipelines p
  WHERE p.company_id = vpt_id AND p.is_active = true
  ORDER BY p.is_default DESC, p.created_at NULLS LAST, p.name
  LIMIT 1;
  IF old_pipeline_id IS NULL THEN
    RAISE EXCEPTION '428: VPT chưa có pipeline CRM active.';
  END IF;

  IF EXISTS (SELECT 1 FROM crm_pipelines WHERE id = old_pipeline_id AND region_id IS NOT NULL) THEN
    RAISE NOTICE '428: Pipeline VPT (%) đã có region_id — bỏ qua (đã chạy trước đó).', old_pipeline_id;
    RETURN;
  END IF;

  -- 1) Pipeline hiện tại → khu vực TP.HCM (không đổi id, không đổi leads/deals HCM)
  UPDATE crm_pipelines
  SET region_id = hcm_region_id, is_default = true, updated_at = now()
  WHERE id = old_pipeline_id;

  CREATE TEMP TABLE _stage_map_q2 (old_stage_id UUID PRIMARY KEY, new_stage_id UUID NOT NULL) ON COMMIT DROP;
  CREATE TEMP TABLE _stage_map_ct (old_stage_id UUID PRIMARY KEY, new_stage_id UUID NOT NULL) ON COMMIT DROP;

  -- ═══════════════════════════════════════════════════════════════════════
  -- 2) Clone pipeline + stages cho khu vực Q2
  -- ═══════════════════════════════════════════════════════════════════════
  INSERT INTO crm_pipelines (name, company_id, description, is_default, is_active, region_id)
  VALUES (
    'CRM — Bếp Vạn Phú Thành (Q2)',
    vpt_id,
    'Pipeline khu vực Q2, tách từ pipeline chung [crm-region-split-vpt]',
    false,
    true,
    q2_region_id
  )
  RETURNING id INTO q2_pipeline_id;

  FOR src_stage IN
    SELECT * FROM crm_pipeline_stages WHERE pipeline_id = old_pipeline_id ORDER BY pipeline_type, order_index
  LOOP
    INSERT INTO crm_pipeline_stages (
      pipeline_id, pipeline_type, name, color, icon, order_index,
      is_active, is_won, is_lost,
      send_zalo_on_enter, create_event_on_enter, sync_role,
      default_probability, description, sla_days,
      canonical_slug, deal_report_bucket,
      counts_as_won_revenue, counts_as_completed_revenue,
      requires_deadline, show_deadline_box,
      deadline_default_days, deadline_default_hours,
      counts_as_expected_revenue, allow_revert_to_lead, show_sx_transfer,
      apply_default_assignee_on_enter, default_assignee_user_id
    )
    VALUES (
      q2_pipeline_id, src_stage.pipeline_type, src_stage.name, src_stage.color, src_stage.icon, src_stage.order_index,
      COALESCE(src_stage.is_active, true), COALESCE(src_stage.is_won, false), COALESCE(src_stage.is_lost, false),
      COALESCE(src_stage.send_zalo_on_enter, false), COALESCE(src_stage.create_event_on_enter, false), src_stage.sync_role,
      src_stage.default_probability, src_stage.description, src_stage.sla_days,
      src_stage.canonical_slug, src_stage.deal_report_bucket,
      COALESCE(src_stage.counts_as_won_revenue, false), COALESCE(src_stage.counts_as_completed_revenue, false),
      COALESCE(src_stage.requires_deadline, false), COALESCE(src_stage.show_deadline_box, false),
      src_stage.deadline_default_days, src_stage.deadline_default_hours,
      COALESCE(src_stage.counts_as_expected_revenue, false), COALESCE(src_stage.allow_revert_to_lead, false), COALESCE(src_stage.show_sx_transfer, false),
      COALESCE(src_stage.apply_default_assignee_on_enter, false), src_stage.default_assignee_user_id
    )
    RETURNING id INTO new_stage_id;

    INSERT INTO _stage_map_q2 (old_stage_id, new_stage_id) VALUES (src_stage.id, new_stage_id);
    n_stages_q2 := n_stages_q2 + 1;
  END LOOP;

  -- Clone task templates + items gắn với các stage trên (cùng công ty → không cần remap company/user)
  FOR src_tpl IN
    SELECT t.* FROM crm_task_templates t
    WHERE t.pipeline_stage_id IN (SELECT old_stage_id FROM _stage_map_q2)
      AND COALESCE(t.is_active, true) = true
    ORDER BY t.order_index, t.name
  LOOP
    SELECT m.new_stage_id INTO new_stage_id FROM _stage_map_q2 m WHERE m.old_stage_id = src_tpl.pipeline_stage_id;

    INSERT INTO crm_task_templates (
      name, stage_slug, description, is_active, is_default, order_index, pipeline_type, pipeline_stage_id
    )
    VALUES (
      src_tpl.name, src_tpl.stage_slug,
      CASE
        WHEN src_tpl.description IS NULL OR trim(src_tpl.description) = '' THEN '[crm-region-split-vpt]'
        ELSE trim(src_tpl.description) || E'\n[crm-region-split-vpt]'
      END,
      COALESCE(src_tpl.is_active, true), COALESCE(src_tpl.is_default, false), src_tpl.order_index,
      COALESCE(src_tpl.pipeline_type, 'both'), new_stage_id
    )
    RETURNING id INTO new_tpl_id;

    INSERT INTO crm_task_template_items (
      template_id, title, description, priority, deadline_days, order_index, checklist,
      default_allowed_companies, default_allowed_departments,
      completion_requires_file_or_note, completion_requires_customer_note,
      completion_requires_customer_contact, blocks_stage_advance, show_excel_quotation_upload,
      requires_quick_verdict, required_evidence_file_types,
      executor_company_id, default_assignee_id, default_assignee_ids,
      default_shared_to_project, default_allowed_share_modules
    )
    SELECT
      new_tpl_id, i.title, i.description, COALESCE(i.priority, 'medium'), COALESCE(i.deadline_days, 0), i.order_index,
      COALESCE(i.checklist, '[]'::jsonb),
      i.default_allowed_companies, i.default_allowed_departments,
      COALESCE(i.completion_requires_file_or_note, false), COALESCE(i.completion_requires_customer_note, false),
      COALESCE(i.completion_requires_customer_contact, false), COALESCE(i.blocks_stage_advance, false), COALESCE(i.show_excel_quotation_upload, false),
      COALESCE(i.requires_quick_verdict, false), i.required_evidence_file_types,
      i.executor_company_id, i.default_assignee_id, i.default_assignee_ids,
      COALESCE(i.default_shared_to_project, false), i.default_allowed_share_modules
    FROM crm_task_template_items i WHERE i.template_id = src_tpl.id ORDER BY i.order_index;

    n_tpl_q2 := n_tpl_q2 + 1;
  END LOOP;

  -- Chuyển lead/deal khu vực Q2 sang pipeline mới (remap stage_id theo map, rồi đổi pipeline_id)
  UPDATE crm_leads l
  SET stage_id = m.new_stage_id
  FROM _stage_map_q2 m
  WHERE l.company_id = vpt_id AND l.region_id = q2_region_id AND l.stage_id = m.old_stage_id;

  UPDATE crm_leads
  SET pipeline_id = q2_pipeline_id, updated_at = now()
  WHERE company_id = vpt_id AND region_id = q2_region_id
    AND pipeline_id IS DISTINCT FROM q2_pipeline_id;
  GET DIAGNOSTICS n_leads_q2 = ROW_COUNT;

  -- ═══════════════════════════════════════════════════════════════════════
  -- 3) Clone pipeline + stages cho khu vực Cần Thơ
  -- ═══════════════════════════════════════════════════════════════════════
  INSERT INTO crm_pipelines (name, company_id, description, is_default, is_active, region_id)
  VALUES (
    'CRM — Bếp Vạn Phú Thành (Cần Thơ)',
    vpt_id,
    'Pipeline khu vực Cần Thơ, tách từ pipeline chung [crm-region-split-vpt]',
    false,
    true,
    ct_region_id
  )
  RETURNING id INTO ct_pipeline_id;

  FOR src_stage IN
    SELECT * FROM crm_pipeline_stages WHERE pipeline_id = old_pipeline_id ORDER BY pipeline_type, order_index
  LOOP
    INSERT INTO crm_pipeline_stages (
      pipeline_id, pipeline_type, name, color, icon, order_index,
      is_active, is_won, is_lost,
      send_zalo_on_enter, create_event_on_enter, sync_role,
      default_probability, description, sla_days,
      canonical_slug, deal_report_bucket,
      counts_as_won_revenue, counts_as_completed_revenue,
      requires_deadline, show_deadline_box,
      deadline_default_days, deadline_default_hours,
      counts_as_expected_revenue, allow_revert_to_lead, show_sx_transfer,
      apply_default_assignee_on_enter, default_assignee_user_id
    )
    VALUES (
      ct_pipeline_id, src_stage.pipeline_type, src_stage.name, src_stage.color, src_stage.icon, src_stage.order_index,
      COALESCE(src_stage.is_active, true), COALESCE(src_stage.is_won, false), COALESCE(src_stage.is_lost, false),
      COALESCE(src_stage.send_zalo_on_enter, false), COALESCE(src_stage.create_event_on_enter, false), src_stage.sync_role,
      src_stage.default_probability, src_stage.description, src_stage.sla_days,
      src_stage.canonical_slug, src_stage.deal_report_bucket,
      COALESCE(src_stage.counts_as_won_revenue, false), COALESCE(src_stage.counts_as_completed_revenue, false),
      COALESCE(src_stage.requires_deadline, false), COALESCE(src_stage.show_deadline_box, false),
      src_stage.deadline_default_days, src_stage.deadline_default_hours,
      COALESCE(src_stage.counts_as_expected_revenue, false), COALESCE(src_stage.allow_revert_to_lead, false), COALESCE(src_stage.show_sx_transfer, false),
      COALESCE(src_stage.apply_default_assignee_on_enter, false), src_stage.default_assignee_user_id
    )
    RETURNING id INTO new_stage_id;

    INSERT INTO _stage_map_ct (old_stage_id, new_stage_id) VALUES (src_stage.id, new_stage_id);
    n_stages_ct := n_stages_ct + 1;
  END LOOP;

  FOR src_tpl IN
    SELECT t.* FROM crm_task_templates t
    WHERE t.pipeline_stage_id IN (SELECT old_stage_id FROM _stage_map_ct)
      AND COALESCE(t.is_active, true) = true
    ORDER BY t.order_index, t.name
  LOOP
    SELECT m.new_stage_id INTO new_stage_id FROM _stage_map_ct m WHERE m.old_stage_id = src_tpl.pipeline_stage_id;

    INSERT INTO crm_task_templates (
      name, stage_slug, description, is_active, is_default, order_index, pipeline_type, pipeline_stage_id
    )
    VALUES (
      src_tpl.name, src_tpl.stage_slug,
      CASE
        WHEN src_tpl.description IS NULL OR trim(src_tpl.description) = '' THEN '[crm-region-split-vpt]'
        ELSE trim(src_tpl.description) || E'\n[crm-region-split-vpt]'
      END,
      COALESCE(src_tpl.is_active, true), COALESCE(src_tpl.is_default, false), src_tpl.order_index,
      COALESCE(src_tpl.pipeline_type, 'both'), new_stage_id
    )
    RETURNING id INTO new_tpl_id;

    INSERT INTO crm_task_template_items (
      template_id, title, description, priority, deadline_days, order_index, checklist,
      default_allowed_companies, default_allowed_departments,
      completion_requires_file_or_note, completion_requires_customer_note,
      completion_requires_customer_contact, blocks_stage_advance, show_excel_quotation_upload,
      requires_quick_verdict, required_evidence_file_types,
      executor_company_id, default_assignee_id, default_assignee_ids,
      default_shared_to_project, default_allowed_share_modules
    )
    SELECT
      new_tpl_id, i.title, i.description, COALESCE(i.priority, 'medium'), COALESCE(i.deadline_days, 0), i.order_index,
      COALESCE(i.checklist, '[]'::jsonb),
      i.default_allowed_companies, i.default_allowed_departments,
      COALESCE(i.completion_requires_file_or_note, false), COALESCE(i.completion_requires_customer_note, false),
      COALESCE(i.completion_requires_customer_contact, false), COALESCE(i.blocks_stage_advance, false), COALESCE(i.show_excel_quotation_upload, false),
      COALESCE(i.requires_quick_verdict, false), i.required_evidence_file_types,
      i.executor_company_id, i.default_assignee_id, i.default_assignee_ids,
      COALESCE(i.default_shared_to_project, false), i.default_allowed_share_modules
    FROM crm_task_template_items i WHERE i.template_id = src_tpl.id ORDER BY i.order_index;

    n_tpl_ct := n_tpl_ct + 1;
  END LOOP;

  UPDATE crm_leads l
  SET stage_id = m.new_stage_id
  FROM _stage_map_ct m
  WHERE l.company_id = vpt_id AND l.region_id = ct_region_id AND l.stage_id = m.old_stage_id;

  UPDATE crm_leads
  SET pipeline_id = ct_pipeline_id, updated_at = now()
  WHERE company_id = vpt_id AND region_id = ct_region_id
    AND pipeline_id IS DISTINCT FROM ct_pipeline_id;
  GET DIAGNOSTICS n_leads_ct = ROW_COUNT;

  RAISE NOTICE '428: VPT HCM pipeline=% (region=%)', old_pipeline_id, hcm_region_id;
  RAISE NOTICE '428: Q2 pipeline=% | stages=% | templates=% | leads/deals chuyển=%', q2_pipeline_id, n_stages_q2, n_tpl_q2, n_leads_q2;
  RAISE NOTICE '428: Cần Thơ pipeline=% | stages=% | templates=% | leads/deals chuyển=%', ct_pipeline_id, n_stages_ct, n_tpl_ct, n_leads_ct;
END $$;
