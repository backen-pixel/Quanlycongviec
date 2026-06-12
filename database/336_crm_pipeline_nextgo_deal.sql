-- 336: Pipeline CRM Deal cho **Công Ty TNHH Bao Bì NextGo**
-- Cột Kanban Deal theo quy trình nội bộ NextGo.
-- Idempotent: marker [crm-pipeline-nextgo-deal] trên pipeline.

DO $$
DECLARE
  v_company_id UUID;
  v_pipeline_id UUID;
  v_common_pipeline UUID := '00000000-0000-0000-0000-000000000001';
  v_name CONSTANT TEXT := 'CRM — NextGo';
BEGIN
  IF to_regclass('public.crm_pipelines') IS NULL THEN
    RAISE EXCEPTION '336: Thiếu bảng crm_pipelines.';
  END IF;

  SELECT c.id INTO v_company_id
  FROM companies c
  WHERE c.name ILIKE '%NextGo%'
     OR c.short_name ILIKE '%NextGo%'
  ORDER BY c.name
  LIMIT 1;

  IF v_company_id IS NULL THEN
    RAISE EXCEPTION '336: Không tìm thấy công ty NextGo trong `companies`.';
  END IF;

  SELECT p.id INTO v_pipeline_id
  FROM crm_pipelines p
  WHERE p.company_id = v_company_id
    AND COALESCE(p.description, '') LIKE '%[crm-pipeline-nextgo-deal]%'
  LIMIT 1;

  IF v_pipeline_id IS NOT NULL THEN
    RAISE NOTICE '336: Pipeline NextGo đã tồn tại (id=%), bỏ qua.', v_pipeline_id;
    RETURN;
  END IF;

  -- Bỏ default cũ (nếu có) trước khi gán pipeline mới
  UPDATE crm_pipelines
  SET is_default = false
  WHERE company_id = v_company_id AND is_default = true;

  INSERT INTO crm_pipelines (name, company_id, description, is_default, is_active)
  VALUES (
    v_name,
    v_company_id,
    'Pipeline Lead + Deal — NextGo [crm-pipeline-nextgo-deal]',
    true,
    true
  )
  RETURNING id INTO v_pipeline_id;

  -- Lead: copy từ Pipeline Chung
  INSERT INTO crm_pipeline_stages (
    name, color, icon, order_index, pipeline_type, pipeline_id,
    is_won, is_lost, is_active, send_zalo_on_enter, sync_role
  )
  SELECT
    s.name, s.color, s.icon, s.order_index, s.pipeline_type, v_pipeline_id,
    s.is_won, s.is_lost, COALESCE(s.is_active, true),
    COALESCE(s.send_zalo_on_enter, false), s.sync_role
  FROM crm_pipeline_stages s
  WHERE s.pipeline_id = v_common_pipeline
    AND s.pipeline_type = 'lead';

  -- Deal: quy trình NextGo
  INSERT INTO crm_pipeline_stages (
    name, color, icon, order_index, pipeline_type, pipeline_id,
    is_won, is_lost, is_active, send_zalo_on_enter, sync_role,
    canonical_slug, counts_as_completed_revenue
  )
  VALUES
    ('Tiếp nhận', '#64748B', '📥', 1, 'deal', v_pipeline_id, false, false, true, false, NULL, 'lead_new', false),
    ('Tư vấn', '#3B82F6', '💬', 2, 'deal', v_pipeline_id, false, false, true, false, NULL, NULL, false),
    ('Thiết kế mẫu', '#8B5CF6', '🎨', 3, 'deal', v_pipeline_id, false, false, true, false, NULL, 'designing', false),
    ('Báo giá', '#F59E0B', '💰', 4, 'deal', v_pipeline_id, false, false, true, false, NULL, 'quoted', false),
    ('Khả năng chốt', '#F97316', '🔥', 5, 'deal', v_pipeline_id, false, false, true, false, NULL, 'negotiating', false),
    ('Đặt cọc - lên họp đồng', '#84CC16', '💵', 6, 'deal', v_pipeline_id, false, false, true, false, NULL, 'waiting_deposit', false),
    ('Thắng', '#10B981', '🎉', 7, 'deal', v_pipeline_id, true, false, true, false, NULL, 'contract_signed', false),
    ('Thiết kế chi tiết', '#6366F1', '📐', 8, 'deal', v_pipeline_id, false, false, true, false, NULL, 'designing', false),
    ('Sản xuất', '#EA580C', '🏭', 9, 'deal', v_pipeline_id, false, false, true, false, 'sx_production', 'producing', false),
    ('Giao hàng', '#06B6D4', '🚚', 10, 'deal', v_pipeline_id, false, false, true, false, NULL, 'installing', false),
    ('Hoàn thành', '#059669', '✅', 11, 'deal', v_pipeline_id, false, false, true, false, NULL, 'completed', true);

  RAISE NOTICE '336: Đã tạo pipeline % id=% cho company_id=%', v_name, v_pipeline_id, v_company_id;
END $$;
