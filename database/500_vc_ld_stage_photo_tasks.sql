-- 500: Cập nhật nhiệm vụ VC/LĐ theo cột Tiếp nhận / Đã giao / Nghiệm thu - bàn giao
-- Phúc Đạt (29677f68-967e-4256-92fd-492bb580e888)
-- Idempotent.

BEGIN;

DO $$
DECLARE
  cid uuid := '29677f68-967e-4256-92fd-492bb580e888';
  id_tiep uuid;
  id_da uuid;
  id_nghiem uuid;
  tpl_tiep uuid;
  tpl_da uuid;
  tpl_nghiem uuid;
BEGIN
  SELECT id INTO id_tiep FROM logistics_pipeline_stages
  WHERE company_id = cid AND is_active AND name = 'Tiếp nhận'
  ORDER BY order_index LIMIT 1;

  SELECT id INTO id_da FROM logistics_pipeline_stages
  WHERE company_id = cid AND is_active AND name = 'Đã giao'
  ORDER BY order_index LIMIT 1;

  SELECT id INTO id_nghiem FROM logistics_pipeline_stages
  WHERE company_id = cid AND is_active AND name = 'Nghiệm thu - bàn giao'
  ORDER BY order_index LIMIT 1;

  IF id_tiep IS NULL OR id_da IS NULL OR id_nghiem IS NULL THEN
    RAISE EXCEPTION 'Thiếu cột Tiếp nhận / Đã giao / Nghiệm thu - bàn giao cho Phúc Đạt';
  END IF;

  -- Chỉnh bucket cột (tránh Nghiệm thu bị đánh dấu installation)
  UPDATE logistics_pipeline_stages
  SET bucket_slug = NULL
  WHERE company_id = cid
    AND bucket_slug IN ('installation', 'acceptance')
    AND name NOT IN ('Lắp đặt', 'Nghiệm thu - bàn giao');

  UPDATE logistics_pipeline_stages
  SET bucket_slug = 'acceptance', crm_sync_type = 'customer_care', is_handover_to_install = false
  WHERE id = id_nghiem;

  UPDATE logistics_pipeline_stages
  SET bucket_slug = NULL
  WHERE company_id = cid AND bucket_slug = 'installation' AND id <> (
    SELECT id FROM logistics_pipeline_stages
    WHERE company_id = cid AND is_active AND name = 'Lắp đặt'
    ORDER BY order_index LIMIT 1
  );

  UPDATE logistics_pipeline_stages
  SET bucket_slug = 'installation', crm_sync_type = 'installation', is_handover_to_install = false
  WHERE company_id = cid AND is_active AND name = 'Lắp đặt';

  UPDATE logistics_pipeline_stages
  SET is_active = false
  WHERE company_id = cid AND name = 'Có vấn đề';

  -- ── Tiếp nhận: Chụp hình nhận hàng tại xưởng ─────────────────────────────
  SELECT id INTO tpl_tiep FROM workshop_task_templates
  WHERE workshop_area = 'logistics' AND company_id = cid AND logistics_stage_id = id_tiep
  ORDER BY is_active DESC, is_default DESC LIMIT 1;

  IF tpl_tiep IS NULL THEN
    INSERT INTO workshop_task_templates (
      name, workshop_area, description, company_id, is_active, is_default, order_index, logistics_stage_id
    ) VALUES (
      'VC/LĐ — Tiếp nhận', 'logistics',
      'Nhiệm vụ khi dự án vào cột Tiếp nhận.',
      cid, true, true, 1, id_tiep
    ) RETURNING id INTO tpl_tiep;
  ELSE
    UPDATE workshop_task_templates
    SET name = 'VC/LĐ — Tiếp nhận', is_active = true, is_default = true, order_index = 1,
        description = 'Nhiệm vụ khi dự án vào cột Tiếp nhận.'
    WHERE id = tpl_tiep;
  END IF;

  DELETE FROM workshop_task_template_items WHERE template_id = tpl_tiep;
  INSERT INTO workshop_task_template_items (
    template_id, title, description, priority, deadline_days, order_index, checklist,
    blocks_stage_advance, completion_requires_file_or_note, required_evidence_file_types
  ) VALUES (
    tpl_tiep,
    'Chụp hình nhận hàng tại xưởng',
    'Chụp ảnh hàng nhận tại xưởng trước khi xuất giao.',
    'high', 0, 1,
    '[{"text":"Chụp ảnh tổng thể kiện hàng tại xưởng"},{"text":"Chụp ảnh nhãn / mã dự án trên kiện"},{"text":"Đối chiếu số kiện với packing list"}]'::jsonb,
    true, true, '["image"]'::jsonb
  );

  -- ── Đã giao: Chụp hình nhận hàng tại công trình ──────────────────────────
  SELECT id INTO tpl_da FROM workshop_task_templates
  WHERE workshop_area = 'logistics' AND company_id = cid AND logistics_stage_id = id_da
  ORDER BY is_active DESC LIMIT 1;

  IF tpl_da IS NULL THEN
    INSERT INTO workshop_task_templates (
      name, workshop_area, description, company_id, is_active, is_default, order_index, logistics_stage_id
    ) VALUES (
      'VC/LĐ — Đã giao', 'logistics',
      'Nhiệm vụ khi dự án vào cột Đã giao.',
      cid, true, false, 3, id_da
    ) RETURNING id INTO tpl_da;
  ELSE
    UPDATE workshop_task_templates
    SET name = 'VC/LĐ — Đã giao', is_active = true, order_index = 3,
        description = 'Nhiệm vụ khi dự án vào cột Đã giao.'
    WHERE id = tpl_da;
  END IF;

  DELETE FROM workshop_task_template_items WHERE template_id = tpl_da;
  INSERT INTO workshop_task_template_items (
    template_id, title, description, priority, deadline_days, order_index, checklist,
    blocks_stage_advance, completion_requires_file_or_note, required_evidence_file_types
  ) VALUES (
    tpl_da,
    'Chụp hình nhận hàng tại công trình',
    'Chụp ảnh hàng đã nhận tại công trình.',
    'high', 0, 1,
    '[{"text":"Chụp ảnh tổng thể kiện tại công trình"},{"text":"Chụp ảnh vị trí tập kết"},{"text":"Ghi nhận thiếu / hư hỏng (nếu có)"}]'::jsonb,
    true, true, '["image"]'::jsonb
  );

  -- ── Nghiệm thu - bàn giao ────────────────────────────────────────────────
  SELECT id INTO tpl_nghiem FROM workshop_task_templates
  WHERE workshop_area = 'logistics' AND company_id = cid AND logistics_stage_id = id_nghiem
  ORDER BY is_active DESC LIMIT 1;

  IF tpl_nghiem IS NULL THEN
    INSERT INTO workshop_task_templates (
      name, workshop_area, description, company_id, is_active, is_default, order_index, logistics_stage_id
    ) VALUES (
      'VC/LĐ — Nghiệm thu - bàn giao', 'logistics',
      'Nhiệm vụ khi dự án vào cột Nghiệm thu - bàn giao.',
      cid, true, false, 5, id_nghiem
    ) RETURNING id INTO tpl_nghiem;
  ELSE
    UPDATE workshop_task_templates
    SET name = 'VC/LĐ — Nghiệm thu - bàn giao', is_active = true, order_index = 5,
        description = 'Nhiệm vụ khi dự án vào cột Nghiệm thu - bàn giao.'
    WHERE id = tpl_nghiem;
  END IF;

  DELETE FROM workshop_task_template_items WHERE template_id = tpl_nghiem;
  INSERT INTO workshop_task_template_items (
    template_id, title, description, priority, deadline_days, order_index, checklist,
    blocks_stage_advance, completion_requires_file_or_note, required_evidence_file_types
  ) VALUES
  (
    tpl_nghiem,
    'Nghiệm thu công trình',
    'Nghiệm thu công trình với khách trước khi bàn giao.',
    'high', 0, 1,
    '[{"text":"Khách kiểm tra hạng mục lắp đặt"},{"text":"Ghi nhận tồn đọng / hẹn xử lý (nếu có)"},{"text":"Ký biên bản nghiệm thu"}]'::jsonb,
    true, false, '[]'::jsonb
  ),
  (
    tpl_nghiem,
    'Chụp hình bàn giao công trình',
    'Chụp ảnh công trình sau khi nghiệm thu / bàn giao.',
    'high', 0, 2,
    '[{"text":"Chụp ảnh tổng thể công trình hoàn thiện"},{"text":"Chụp ảnh các góc / khu vực chính"},{"text":"Lưu ảnh kèm biên bản bàn giao"}]'::jsonb,
    true, true, '["image"]'::jsonb
  );

  -- Tắt template gắn cột ẩn / thừa (không thuộc 6 cột active)
  UPDATE workshop_task_templates t
  SET is_active = false, is_default = false
  WHERE t.workshop_area = 'logistics'
    AND t.company_id = cid
    AND t.logistics_stage_id IS NOT NULL
    AND t.logistics_stage_id NOT IN (
      SELECT id FROM logistics_pipeline_stages
      WHERE company_id = cid AND is_active
    );
END $$;

COMMIT;
