-- Gom cột Công nợ HCB trùng tên sau 589.
CREATE OR REPLACE FUNCTION _hcb_589b_merge(p_keep UUID, p_olds UUID[])
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF p_keep IS NULL OR coalesce(array_length(p_olds, 1), 0) = 0 THEN RETURN; END IF;
  UPDATE projects SET sx_kanban_column_id = p_keep, updated_at = NOW() WHERE sx_kanban_column_id = ANY (p_olds);
  UPDATE crm_leads SET sx_pipeline_stage_id = p_keep, updated_at = NOW() WHERE sx_pipeline_stage_id = ANY (p_olds);
  UPDATE crm_tasks SET production_pipeline_stage_id = p_keep, updated_at = NOW() WHERE production_pipeline_stage_id = ANY (p_olds);
  UPDATE tasks SET production_stage_id = p_keep WHERE production_stage_id = ANY (p_olds);
  DELETE FROM production_pipeline_stages WHERE id = ANY (p_olds);
END;
$$;

DO $$
DECLARE
  v_hcb UUID;
  v_cn UUID;
  v_keep UUID;
  v_old UUID[];
BEGIN
  SELECT id INTO v_hcb FROM companies WHERE short_name ILIKE 'HCB' OR name ILIKE '%Hucabi%' LIMIT 1;
  SELECT id INTO v_cn FROM workshop_project_types WHERE company_id = v_hcb AND lower(trim(name)) = 'công nợ';
  IF v_hcb IS NULL OR v_cn IS NULL THEN RETURN; END IF;

  SELECT id INTO v_keep FROM production_pipeline_stages
  WHERE company_id = v_hcb AND workshop_type_id = v_cn AND lower(trim(name)) = 'đợi thanh toán'
  ORDER BY (SELECT COUNT(*) FROM projects p WHERE p.sx_kanban_column_id = production_pipeline_stages.id) DESC, order_index
  LIMIT 1;
  SELECT COALESCE(array_agg(id), ARRAY[]::uuid[]) INTO v_old FROM production_pipeline_stages
  WHERE company_id = v_hcb AND workshop_type_id = v_cn AND lower(trim(name)) = 'đợi thanh toán' AND id <> v_keep;
  PERFORM _hcb_589b_merge(v_keep, v_old);
  IF v_keep IS NOT NULL THEN
    UPDATE production_pipeline_stages SET name = 'Đợi thanh toán', is_active = true, order_index = 5 WHERE id = v_keep;
  END IF;

  SELECT id INTO v_keep FROM production_pipeline_stages
  WHERE company_id = v_hcb AND workshop_type_id = v_cn AND lower(name) LIKE '%nợ quá hạn%'
  ORDER BY order_index LIMIT 1;
  SELECT COALESCE(array_agg(id), ARRAY[]::uuid[]) INTO v_old FROM production_pipeline_stages
  WHERE company_id = v_hcb AND workshop_type_id = v_cn AND lower(name) LIKE '%nợ quá hạn%' AND id <> v_keep;
  PERFORM _hcb_589b_merge(v_keep, v_old);
  IF v_keep IS NOT NULL THEN
    UPDATE production_pipeline_stages SET name = 'Nợ quá hạn', is_active = true, order_index = 6 WHERE id = v_keep;
  END IF;

  SELECT COALESCE(array_agg(id), ARRAY[]::uuid[]) INTO v_old FROM production_pipeline_stages
  WHERE company_id = v_hcb AND workshop_type_id = v_cn AND lower(trim(name)) = 'thu tiền';
  IF coalesce(array_length(v_old, 1), 0) > 0 THEN
    UPDATE projects SET sx_kanban_column_id = (
      SELECT id FROM production_pipeline_stages WHERE company_id = v_hcb AND workshop_type_id = v_cn AND lower(name) LIKE '%đã tính%' LIMIT 1
    ) WHERE sx_kanban_column_id = ANY (v_old);
    DELETE FROM production_pipeline_stages WHERE id = ANY (v_old);
  END IF;
END $$;

DROP FUNCTION IF EXISTS _hcb_589b_merge(UUID, UUID[]);
