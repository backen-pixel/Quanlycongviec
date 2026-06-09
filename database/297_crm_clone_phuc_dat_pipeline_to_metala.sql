-- 297: Clone pipeline CRM + bộ nhiệm vụ mẫu từ **Phúc Đạt** sang **Metala**
--
-- Sao chép:
--   • crm_pipelines (mặc định cho Metala)
--   • crm_pipeline_stages (21 cột Lead + Deal)
--   • crm_task_templates + crm_task_template_items (gắn pipeline_stage_id mới)
--
-- Idempotent: marker [crm-clone-metala-from-pd] trên pipeline đích.
--
-- ⚠️ YÊU CẦU: DB đã chạy migration CRM (ít nhất database/21_crm_pipelines.sql).
-- Nếu lỗi «Thiếu bảng crm_pipelines» → đang ở Supabase project/branch sai,
-- hoặc local chưa migrate. Cách khác (khuyến nghị):
--   cd backend && node scripts/clone-crm-pipeline-phuc-dat-to-metala.js

DO $$
DECLARE
  phuc_id UUID;
  metala_id UUID;
  src_pipeline_id UUID;
  new_pipeline_id UUID;
  src_stage RECORD;
  new_stage_id UUID;
  src_tpl RECORD;
  new_tpl_id UUID;
  n_stages INT := 0;
  n_tpl INT := 0;
  n_items INT := 0;
BEGIN
  IF to_regclass('public.crm_pipelines') IS NULL THEN
    RAISE EXCEPTION
      '297: Không có bảng public.crm_pipelines trên DB này (database=%). '
      'Chạy migration 21_crm_pipelines.sql trước, hoặc mở đúng Supabase project chính. '
      'Hoặc: cd backend && node scripts/clone-crm-pipeline-phuc-dat-to-metala.js',
      current_database();
  END IF;

  SELECT id INTO phuc_id FROM companies
  WHERE name ILIKE '%Phúc Đạt%' OR name ILIKE '%Phuc Dat%'
     OR (name ILIKE '%Phúc%' AND name ILIKE '%Đạt%')
  ORDER BY name LIMIT 1;

  SELECT id INTO metala_id FROM companies
  WHERE name ILIKE '%Metala%' OR short_name ILIKE '%Metala%'
  ORDER BY name LIMIT 1;

  IF phuc_id IS NULL THEN
    RAISE EXCEPTION '297: Không tìm thấy công ty Phúc Đạt.';
  END IF;
  IF metala_id IS NULL THEN
    RAISE EXCEPTION '297: Không tìm thấy công ty Metala.';
  END IF;

  SELECT p.id INTO src_pipeline_id
  FROM crm_pipelines p
  WHERE p.company_id = phuc_id AND p.is_active = true
  ORDER BY p.is_default DESC, p.created_at NULLS LAST, p.name
  LIMIT 1;

  IF src_pipeline_id IS NULL THEN
    RAISE EXCEPTION '297: Phúc Đạt chưa có pipeline CRM active.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM crm_pipelines
    WHERE company_id = metala_id
      AND COALESCE(description, '') LIKE '%[crm-clone-metala-from-pd]%'
  ) THEN
    RAISE NOTICE '297: Metala đã có pipeline clone (marker [crm-clone-metala-from-pd]) — bỏ qua.';
    RETURN;
  END IF;

  CREATE TEMP TABLE _stage_clone_map (
    old_stage_id UUID PRIMARY KEY,
    new_stage_id UUID NOT NULL
  ) ON COMMIT DROP;

  INSERT INTO crm_pipelines (name, company_id, description, is_default, is_active)
  VALUES (
    'CRM Pipeline',
    metala_id,
    'Pipeline CRM clone từ Phúc Đạt [crm-clone-metala-from-pd]',
    true,
    true
  )
  RETURNING id INTO new_pipeline_id;

  FOR src_stage IN
    SELECT *
    FROM crm_pipeline_stages
    WHERE pipeline_id = src_pipeline_id
    ORDER BY pipeline_type, order_index
  LOOP
    INSERT INTO crm_pipeline_stages (
      pipeline_id, pipeline_type, name, color, icon, order_index,
      is_active, is_won, is_lost,
      send_zalo_on_enter, create_event_on_enter, sync_role,
      default_probability, description, sla_days,
      canonical_slug, deal_report_bucket,
      counts_as_won_revenue, counts_as_completed_revenue,
      requires_deadline, show_deadline_box,
      deadline_default_days, deadline_default_hours
    )
    VALUES (
      new_pipeline_id,
      src_stage.pipeline_type,
      src_stage.name,
      src_stage.color,
      src_stage.icon,
      src_stage.order_index,
      COALESCE(src_stage.is_active, true),
      COALESCE(src_stage.is_won, false),
      COALESCE(src_stage.is_lost, false),
      COALESCE(src_stage.send_zalo_on_enter, false),
      COALESCE(src_stage.create_event_on_enter, false),
      src_stage.sync_role,
      src_stage.default_probability,
      src_stage.description,
      src_stage.sla_days,
      src_stage.canonical_slug,
      src_stage.deal_report_bucket,
      COALESCE(src_stage.counts_as_won_revenue, false),
      COALESCE(src_stage.counts_as_completed_revenue, false),
      COALESCE(src_stage.requires_deadline, false),
      COALESCE(src_stage.show_deadline_box, false),
      src_stage.deadline_default_days,
      src_stage.deadline_default_hours
    )
    RETURNING id INTO new_stage_id;

    INSERT INTO _stage_clone_map (old_stage_id, new_stage_id)
    VALUES (src_stage.id, new_stage_id);

    n_stages := n_stages + 1;
  END LOOP;

  FOR src_tpl IN
    SELECT t.*
    FROM crm_task_templates t
    WHERE t.pipeline_stage_id IN (SELECT old_stage_id FROM _stage_clone_map)
      AND COALESCE(t.is_active, true) = true
    ORDER BY t.order_index, t.name
  LOOP
    SELECT m.new_stage_id INTO new_stage_id
    FROM _stage_clone_map m
    WHERE m.old_stage_id = src_tpl.pipeline_stage_id;

    INSERT INTO crm_task_templates (
      name, stage_slug, description, is_active, is_default, order_index, pipeline_type, pipeline_stage_id
    )
    VALUES (
      src_tpl.name,
      src_tpl.stage_slug,
      CASE
        WHEN src_tpl.description IS NULL OR trim(src_tpl.description) = ''
          THEN '[crm-clone-metala-from-pd]'
        ELSE trim(src_tpl.description) || E'\n[crm-clone-metala-from-pd]'
      END,
      COALESCE(src_tpl.is_active, true),
      false,
      src_tpl.order_index,
      COALESCE(src_tpl.pipeline_type, 'both'),
      new_stage_id
    )
    RETURNING id INTO new_tpl_id;

    INSERT INTO crm_task_template_items (
      template_id, title, description, priority, deadline_days, order_index, checklist,
      default_allowed_companies, default_allowed_departments,
      completion_requires_file_or_note, completion_requires_customer_note,
      completion_requires_customer_contact, blocks_stage_advance, show_excel_quotation_upload
    )
    SELECT
      new_tpl_id,
      i.title,
      i.description,
      COALESCE(i.priority, 'medium'),
      COALESCE(i.deadline_days, 0),
      i.order_index,
      COALESCE(i.checklist, '[]'::jsonb),
      jsonb_build_array(metala_id::text),
      i.default_allowed_departments,
      COALESCE(i.completion_requires_file_or_note, false),
      COALESCE(i.completion_requires_customer_note, false),
      COALESCE(i.completion_requires_customer_contact, false),
      COALESCE(i.blocks_stage_advance, false),
      COALESCE(i.show_excel_quotation_upload, false)
    FROM crm_task_template_items i
    WHERE i.template_id = src_tpl.id
    ORDER BY i.order_index;

    GET DIAGNOSTICS n_items = ROW_COUNT;
    n_tpl := n_tpl + 1;
  END LOOP;

  RAISE NOTICE '297: Metala pipeline=% | stages=% | templates=%',
    new_pipeline_id, n_stages, n_tpl;
END $$;
