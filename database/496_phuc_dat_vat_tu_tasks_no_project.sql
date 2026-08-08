-- 496: Phúc Đạt — backfill 4 nhiệm vụ «Chuẩn bị vật tư» cho deal
-- chưa có dự án SX (và deal còn thiếu sau 495), khi đang ở giai đoạn
-- từ Đã ký HĐ / Thắng / Sản xuất trở đi (không gồm Thua).

BEGIN;

DO $$
DECLARE
  v_phuc_dat UUID;
  v_stage_id UUID;
  v_next_order INT;
  n_tasks INT := 0;
  r_item RECORD;
BEGIN
  SELECT id INTO v_phuc_dat
  FROM companies
  WHERE id = '29677f68-967e-4256-92fd-492bb580e888'
     OR name ILIKE '%Phúc Đạt%' OR short_name ILIKE '%Phúc Đạt%'
     OR name ILIKE '%Phuc Dat%' OR short_name ILIKE '%Phuc Dat%'
  ORDER BY CASE WHEN id = '29677f68-967e-4256-92fd-492bb580e888' THEN 0 ELSE 1 END
  LIMIT 1;

  IF v_phuc_dat IS NULL THEN
    RAISE NOTICE '496: Không tìm thấy công ty Phúc Đạt — bỏ qua.';
    RETURN;
  END IF;

  SELECT id INTO v_stage_id
  FROM production_pipeline_stages
  WHERE company_id = v_phuc_dat
    AND is_active = true
    AND lower(trim(name)) = lower('Chuẩn bị vật tư')
  ORDER BY order_index
  LIMIT 1;

  FOR r_item IN
    SELECT * FROM (VALUES
      ('Đặt kính ốp'),
      ('Đặt phụ kiện'),
      ('Mô tả công trình'),
      ('Báo giá mét cho xưởng')
    ) AS x(title)
  LOOP
    INSERT INTO crm_tasks (
      lead_id,
      title,
      description,
      status,
      priority,
      stage_slug,
      production_pipeline_stage_id,
      order_index,
      checklist,
      shared_to_project,
      allowed_share_modules,
      created_by,
      created_at,
      updated_at
    )
    SELECT
      l.id,
      r_item.title,
      'Nhiệm vụ sản xuất — chuẩn bị vật tư (Phúc Đạt)',
      'pending',
      'medium',
      'sx_vat_tu',
      v_stage_id,
      COALESCE((
        SELECT MAX(t2.order_index) FROM crm_tasks t2
        WHERE t2.lead_id = l.id AND t2.stage_slug = 'sx_vat_tu'
      ), 0) + 1,
      '[]'::jsonb,
      true,
      '["production"]'::jsonb,
      COALESCE(l.assigned_to, l.created_by, l.lead_owner_id),
      NOW(),
      NOW()
    FROM crm_leads l
    LEFT JOIN crm_pipeline_stages s ON s.id = l.stage_id
    WHERE l.type = 'deal'
      AND l.company_id = v_phuc_dat
      AND COALESCE(s.is_lost, false) = false
      AND (
        -- Đã có dự án (bất kể company của project — bổ sung deal miss sau 495)
        l.project_id IS NOT NULL
        -- Chưa có dự án nhưng đã vào mục SX / sau thắng
        OR COALESCE(s.is_won, false) = true
        OR lower(trim(COALESCE(s.name, ''))) IN (
          lower('Sản xuất.'),
          lower('Sản xuất'),
          lower('Vận chuyển/lắp đặt.'),
          lower('Vận chuyển/lắp đặt'),
          lower('Hoá đơn.'),
          lower('Hóa đơn.'),
          lower('Hoá đơn'),
          lower('Hóa đơn'),
          lower('Hoàn thành.'),
          lower('Hoàn thành'),
          lower('Đã ký hợp đồng.'),
          lower('Đã ký hợp đồng'),
          lower('Thắng')
        )
        OR lower(trim(COALESCE(s.name, ''))) LIKE '%sản xuất%'
        OR lower(trim(COALESCE(s.name, ''))) LIKE '%van chuyen%'
        OR lower(trim(COALESCE(s.name, ''))) LIKE '%vận chuyển%'
        OR lower(trim(COALESCE(s.name, ''))) LIKE '%hoàn thành%'
        OR lower(trim(COALESCE(s.name, ''))) LIKE '%hoá đơn%'
        OR lower(trim(COALESCE(s.name, ''))) LIKE '%hóa đơn%'
      )
      AND NOT EXISTS (
        SELECT 1 FROM crm_tasks t
        WHERE t.lead_id = l.id
          AND t.stage_slug LIKE 'sx_%'
          AND lower(trim(t.title)) = lower(trim(r_item.title))
      );

    GET DIAGNOSTICS v_next_order = ROW_COUNT;
    n_tasks := n_tasks + v_next_order;
  END LOOP;

  RAISE NOTICE '496: Phúc Đạt=% stage=% | task deal backfill (kể cả chưa có dự án)=%',
    v_phuc_dat, v_stage_id, n_tasks;
END $$;

COMMIT;
