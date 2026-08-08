-- 498: Chuẩn hóa pipeline VC/LĐ thành 6 giai đoạn
-- 1. Tiếp nhận · 2. Đang giao · 3. Đã giao · 4. Lắp đặt · 5. Nghiệm thu - bàn giao · 6. Hoàn thiện
-- Idempotent.

BEGIN;

-- ── Global (company_id IS NULL) — cập nhật theo tên hiện có ─────────────────
UPDATE logistics_pipeline_stages
SET name = 'Tiếp nhận', icon = '📦', color = '#f97316', order_index = 1,
    is_active = true, bucket_slug = 'delivery_pending',
    crm_sync_type = NULL, is_handover_to_install = false
WHERE company_id IS NULL AND name IN ('Chờ vận chuyển', 'Tiếp nhận');

UPDATE logistics_pipeline_stages
SET name = 'Đang giao', icon = '🚚', color = '#ea580c', order_index = 2,
    is_active = true, bucket_slug = 'delivery',
    crm_sync_type = 'delivery', is_handover_to_install = false
WHERE company_id IS NULL AND name IN ('Đang vận chuyển', 'Đang giao');

INSERT INTO logistics_pipeline_stages (
  name, color, icon, order_index, is_active, bucket_slug, crm_sync_type, company_id, is_handover_to_install
)
SELECT 'Đã giao', '#c2410c', '📬', 3, true, 'delivered', 'delivery', NULL, false
WHERE NOT EXISTS (
  SELECT 1 FROM logistics_pipeline_stages
  WHERE company_id IS NULL AND name = 'Đã giao'
);

UPDATE logistics_pipeline_stages
SET name = 'Lắp đặt', icon = '🔧', color = '#d97706', order_index = 4,
    is_active = true, bucket_slug = 'installation',
    crm_sync_type = 'installation', is_handover_to_install = false
WHERE company_id IS NULL AND name IN ('Đang lắp đặt', 'Lắp đặt');

UPDATE logistics_pipeline_stages
SET name = 'Nghiệm thu - bàn giao', icon = '📋', color = '#0d9488', order_index = 5,
    is_active = true, bucket_slug = 'acceptance',
    crm_sync_type = 'customer_care', is_handover_to_install = false
WHERE company_id IS NULL AND name IN ('Bảo hành & CSKH', 'Bảo hành', 'Nghiệm thu - bàn giao', 'Nghiệm thu');

UPDATE logistics_pipeline_stages
SET name = 'Hoàn thiện', icon = '✅', color = '#16a34a', order_index = 6,
    is_active = true, bucket_slug = 'completed',
    crm_sync_type = NULL, is_handover_to_install = false
WHERE company_id IS NULL AND name IN ('Hoàn thành', 'Hoàn thiện');

UPDATE logistics_pipeline_stages
SET is_active = false
WHERE company_id IS NULL
  AND name NOT IN (
    'Tiếp nhận', 'Đang giao', 'Đã giao', 'Lắp đặt', 'Nghiệm thu - bàn giao', 'Hoàn thiện'
  );

-- ── Phúc Đạt ────────────────────────────────────────────────────────────────
DO $$
DECLARE
  cid uuid := '29677f68-967e-4256-92fd-492bb580e888';
  id_tiep uuid;
  id_dang uuid;
  id_da uuid;
  id_lap uuid;
  id_nghiem uuid;
  id_hoan uuid;
BEGIN
  -- Clear bucket_slug trùng trước khi gán bộ 6 (unique company_id + bucket_slug)
  UPDATE logistics_pipeline_stages
  SET bucket_slug = NULL
  WHERE company_id = cid
    AND bucket_slug IS NOT NULL
    AND bucket_slug IN (
      'delivery_pending', 'delivery', 'delivered',
      'installation', 'install_in_progress', 'install_acceptance',
      'acceptance', 'completed', 'install_completed'
    );

  SELECT id INTO id_tiep FROM logistics_pipeline_stages
  WHERE company_id = cid AND (name IN ('Chờ xác nhận', 'Tiếp nhận') OR order_index = 1)
  ORDER BY CASE WHEN name IN ('Chờ xác nhận', 'Tiếp nhận') THEN 0 ELSE 1 END, order_index
  LIMIT 1;

  IF id_tiep IS NULL THEN
    INSERT INTO logistics_pipeline_stages (
      name, color, icon, order_index, is_active, bucket_slug, crm_sync_type, company_id, is_handover_to_install
    ) VALUES ('Tiếp nhận', '#f97316', '📦', 1, true, 'delivery_pending', NULL, cid, false)
    RETURNING id INTO id_tiep;
  ELSE
    UPDATE logistics_pipeline_stages SET
      name = 'Tiếp nhận', icon = '📦', color = '#f97316', order_index = 1,
      is_active = true, bucket_slug = 'delivery_pending',
      crm_sync_type = NULL, is_handover_to_install = false
    WHERE id = id_tiep;
  END IF;

  SELECT id INTO id_dang FROM logistics_pipeline_stages
  WHERE company_id = cid AND name IN ('Đang vận chuyển', 'Đang giao')
  ORDER BY order_index LIMIT 1;

  IF id_dang IS NULL THEN
    INSERT INTO logistics_pipeline_stages (
      name, color, icon, order_index, is_active, bucket_slug, crm_sync_type, company_id, is_handover_to_install
    ) VALUES ('Đang giao', '#ea580c', '🚚', 2, true, 'delivery', 'delivery', cid, false)
    RETURNING id INTO id_dang;
  ELSE
    UPDATE logistics_pipeline_stages SET
      name = 'Đang giao', icon = '🚚', color = '#ea580c', order_index = 2,
      is_active = true, bucket_slug = 'delivery',
      crm_sync_type = 'delivery', is_handover_to_install = false
    WHERE id = id_dang;
  END IF;

  SELECT id INTO id_da FROM logistics_pipeline_stages
  WHERE company_id = cid AND name IN ('Giao hàng', 'Đã giao')
  ORDER BY order_index LIMIT 1;

  IF id_da IS NULL THEN
    INSERT INTO logistics_pipeline_stages (
      name, color, icon, order_index, is_active, bucket_slug, crm_sync_type, company_id, is_handover_to_install
    ) VALUES ('Đã giao', '#c2410c', '📬', 3, true, 'delivered', 'delivery', cid, false)
    RETURNING id INTO id_da;
  ELSE
    UPDATE logistics_pipeline_stages SET
      name = 'Đã giao', icon = '📬', color = '#c2410c', order_index = 3,
      is_active = true, bucket_slug = 'delivered',
      crm_sync_type = 'delivery', is_handover_to_install = false
    WHERE id = id_da;
  END IF;

  SELECT id INTO id_lap FROM logistics_pipeline_stages
  WHERE company_id = cid
    AND name IN ('Đang lắp đặt', 'Lắp đặt')
  ORDER BY CASE WHEN is_active THEN 0 ELSE 1 END, order_index
  LIMIT 1;

  IF id_lap IS NULL THEN
    INSERT INTO logistics_pipeline_stages (
      name, color, icon, order_index, is_active, bucket_slug, crm_sync_type, company_id, is_handover_to_install
    ) VALUES ('Lắp đặt', '#d97706', '🔧', 4, true, 'installation', 'installation', cid, false)
    RETURNING id INTO id_lap;
  ELSE
    UPDATE logistics_pipeline_stages SET
      name = 'Lắp đặt', icon = '🔧', color = '#d97706', order_index = 4,
      is_active = true, bucket_slug = 'installation',
      crm_sync_type = 'installation', is_handover_to_install = false
    WHERE id = id_lap;
  END IF;

  SELECT id INTO id_nghiem FROM logistics_pipeline_stages
  WHERE company_id = cid
    AND name IN ('Nghiệm thu', 'Nghiệm thu - bàn giao', 'Hoàn thành và bàn giao')
  ORDER BY CASE WHEN name LIKE 'Nghiệm thu%' THEN 0 ELSE 1 END, order_index
  LIMIT 1;

  IF id_nghiem IS NULL THEN
    INSERT INTO logistics_pipeline_stages (
      name, color, icon, order_index, is_active, bucket_slug, crm_sync_type, company_id, is_handover_to_install
    ) VALUES ('Nghiệm thu - bàn giao', '#0d9488', '📋', 5, true, 'acceptance', 'customer_care', cid, false)
    RETURNING id INTO id_nghiem;
  ELSE
    UPDATE logistics_pipeline_stages SET
      name = 'Nghiệm thu - bàn giao', icon = '📋', color = '#0d9488', order_index = 5,
      is_active = true, bucket_slug = 'acceptance',
      crm_sync_type = 'customer_care', is_handover_to_install = false
    WHERE id = id_nghiem;
  END IF;

  SELECT id INTO id_hoan FROM logistics_pipeline_stages
  WHERE company_id = cid
    AND name IN ('Hoàn thành', 'Hoàn thiện')
  ORDER BY order_index
  LIMIT 1;

  IF id_hoan IS NULL THEN
    INSERT INTO logistics_pipeline_stages (
      name, color, icon, order_index, is_active, bucket_slug, crm_sync_type, company_id, is_handover_to_install
    ) VALUES ('Hoàn thiện', '#16a34a', '✅', 6, true, 'completed', NULL, cid, false)
    RETURNING id INTO id_hoan;
  ELSE
    UPDATE logistics_pipeline_stages SET
      name = 'Hoàn thiện', icon = '✅', color = '#16a34a', order_index = 6,
      is_active = true, bucket_slug = 'completed',
      crm_sync_type = NULL, is_handover_to_install = false
    WHERE id = id_hoan;
  END IF;

  UPDATE logistics_pipeline_stages
  SET is_active = false
  WHERE company_id = cid
    AND id NOT IN (id_tiep, id_dang, id_da, id_lap, id_nghiem, id_hoan);

  UPDATE projects p SET vc_kanban_column_id = id_tiep
  WHERE p.vc_kanban_column_id IN (
    SELECT id FROM logistics_pipeline_stages
    WHERE company_id = cid AND id NOT IN (id_tiep, id_dang, id_da, id_lap, id_nghiem, id_hoan)
      AND (name ILIKE '%chờ%' OR name ILIKE '%xác nhận%' OR name ILIKE '%kiểm tra trước%')
  );

  UPDATE projects p SET vc_kanban_column_id = id_dang
  WHERE p.vc_kanban_column_id IN (
    SELECT id FROM logistics_pipeline_stages
    WHERE company_id = cid AND id NOT IN (id_tiep, id_dang, id_da, id_lap, id_nghiem, id_hoan)
      AND (name ILIKE '%vận chuyển%' OR name ILIKE '%có vấn đề%' OR name ILIKE '%có lỗi%')
  );

  UPDATE projects p SET vc_kanban_column_id = id_da
  WHERE p.vc_kanban_column_id IN (
    SELECT id FROM logistics_pipeline_stages
    WHERE company_id = cid AND id NOT IN (id_tiep, id_dang, id_da, id_lap, id_nghiem, id_hoan)
      AND (name ILIKE '%giao hàng%' OR name ILIKE '%nhận hàng%')
  );

  UPDATE projects p SET vc_kanban_column_id = id_lap
  WHERE p.vc_kanban_column_id IN (
    SELECT id FROM logistics_pipeline_stages
    WHERE company_id = cid AND id NOT IN (id_tiep, id_dang, id_da, id_lap, id_nghiem, id_hoan)
      AND (name ILIKE '%lắp%' OR COALESCE(bucket_slug, '') ILIKE '%install%')
  );

  UPDATE projects p SET vc_kanban_column_id = id_nghiem
  WHERE p.vc_kanban_column_id IN (
    SELECT id FROM logistics_pipeline_stages
    WHERE company_id = cid AND id NOT IN (id_tiep, id_dang, id_da, id_lap, id_nghiem, id_hoan)
      AND (name ILIKE '%nghiệm%' OR name ILIKE '%bàn giao%')
  );

  UPDATE projects p SET vc_kanban_column_id = id_hoan
  WHERE p.vc_kanban_column_id IN (
    SELECT id FROM logistics_pipeline_stages
    WHERE company_id = cid AND id NOT IN (id_tiep, id_dang, id_da, id_lap, id_nghiem, id_hoan)
      AND (name ILIKE '%hoàn thành%' OR name ILIKE '%hoàn thiện%' OR COALESCE(bucket_slug, '') ILIKE '%complet%')
  );

  UPDATE projects p SET vc_kanban_column_id = id_tiep
  WHERE p.vc_kanban_column_id IN (
    SELECT id FROM logistics_pipeline_stages
    WHERE company_id = cid AND id NOT IN (id_tiep, id_dang, id_da, id_lap, id_nghiem, id_hoan)
  );
END $$;

COMMIT;
