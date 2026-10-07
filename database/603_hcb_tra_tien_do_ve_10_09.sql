-- 603: HCB — trả tiến độ SX về đúng vị trí NGÀY 10/09/2026, BỎ QUA dự án người đã kéo tay.
--
-- CHUA CHAY. Chỉ chạy sau khi bảng _restore_hcb_sx_10_09 đã có dữ liệu lấy từ bản
-- Point-in-Time Recovery về mốc TRƯỚC 2026-09-11 02:46 UTC (09:46 giờ VN).
--
-- ============================ VÌ SAO PHẢI KHỚP THEO TÊN CỘT ============================
-- Migration 588 đã DELETE 7 cột của board Tủ bếp; 599/600/601 dựng lại chúng nên các cột
-- mang ID MỚI. Vì vậy `sx_kanban_column_id` đọc từ bản PITR là ID CŨ, không còn tồn tại.
-- Bắt buộc khớp lại theo TÊN cột trong phạm vi đúng công ty + đúng loại xưởng của dự án.
--
-- ============================ QUY TẮC BẢO VỆ ============================
-- Không đụng vào dự án có sx_pipeline_stage_entered_at >= 2026-09-10 — đó là dấu hiệu
-- người thật đã thao tác qua ứng dụng (route PATCH /production/projects/:id/stage luôn
-- ghi lại mốc này; 588, 599 và 602 đều KHÔNG ghi). Tại thời điểm soạn: 49 dự án.
--
-- Sao lưu đã có sẵn: _bak_20260912_hcb_projects (509 dòng, chụp trước khi chạy file này).

DO $$
DECLARE
  v_hcb UUID;
  v_thieu INT := 0;
  v_bo_qua INT := 0;
  v_doi INT := 0;
  v_khong_khop INT := 0;
BEGIN
  SELECT id INTO v_hcb FROM companies WHERE name ILIKE '%Hucabi%' LIMIT 1;
  IF v_hcb IS NULL THEN
    RAISE EXCEPTION '603: khong tim thay cong ty Hucabi.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM _restore_hcb_sx_10_09) THEN
    RAISE EXCEPTION '603: bang _restore_hcb_sx_10_09 con trong — chua nap du lieu ngay 10/09.';
  END IF;

  -- Đối chiếu trước khi ghi: tên cột nào không khớp được sang cột hiện tại?
  SELECT count(*) INTO v_khong_khop
  FROM _restore_hcb_sx_10_09 r
  JOIN projects p ON p.code = r.project_code AND p.company_id = v_hcb
  WHERE NOT EXISTS (
    SELECT 1 FROM production_pipeline_stages s
    WHERE s.company_id = v_hcb
      AND s.workshop_type_id IS NOT DISTINCT FROM p.workshop_type_id
      AND lower(trim(s.name)) = lower(trim(r.ten_cot_ngay_10_09))
  );
  IF v_khong_khop > 0 THEN
    RAISE EXCEPTION '603: % dong khong khop duoc ten cot — dung lai, khong ghi gi. Chay truy van doi chieu o cuoi file de xem chi tiet.', v_khong_khop;
  END IF;

  SELECT count(*) INTO v_thieu
  FROM _restore_hcb_sx_10_09 r
  WHERE NOT EXISTS (SELECT 1 FROM projects p WHERE p.code = r.project_code AND p.company_id = v_hcb);

  SELECT count(*) INTO v_bo_qua
  FROM _restore_hcb_sx_10_09 r
  JOIN projects p ON p.code = r.project_code AND p.company_id = v_hcb
  WHERE p.sx_pipeline_stage_entered_at >= TIMESTAMPTZ '2026-09-10 00:00:00+07';

  WITH dich AS (
    SELECT p.id AS project_id,
           (SELECT s.id FROM production_pipeline_stages s
             WHERE s.company_id = v_hcb
               AND s.workshop_type_id IS NOT DISTINCT FROM p.workshop_type_id
               AND lower(trim(s.name)) = lower(trim(r.ten_cot_ngay_10_09))
             ORDER BY s.order_index LIMIT 1) AS cot_dich
    FROM _restore_hcb_sx_10_09 r
    JOIN projects p ON p.code = r.project_code AND p.company_id = v_hcb
    WHERE p.sx_pipeline_stage_entered_at IS NULL
       OR p.sx_pipeline_stage_entered_at < TIMESTAMPTZ '2026-09-10 00:00:00+07'
  )
  UPDATE projects p
     SET sx_kanban_column_id = d.cot_dich,
         updated_at = NOW()
    FROM dich d
   WHERE p.id = d.project_id
     AND d.cot_dich IS NOT NULL
     AND p.sx_kanban_column_id IS DISTINCT FROM d.cot_dich;
  GET DIAGNOSTICS v_doi = ROW_COUNT;

  RAISE NOTICE '603 xong: doi % du an | bo qua % du an nguoi da keo | % ma du an trong file khong con ton tai.',
    v_doi, v_bo_qua, v_thieu;
END $$;

-- ---------------------------------------------------------------------------
-- ĐỐI CHIẾU SAU KHI CHẠY
-- ---------------------------------------------------------------------------
-- select p.code, s.name as cot_hien_tai, r.ten_cot_ngay_10_09,
--        (p.sx_pipeline_stage_entered_at >= timestamptz '2026-09-10 00:00:00+07') as nguoi_da_keo
--   from _restore_hcb_sx_10_09 r
--   join projects p on p.code = r.project_code
--   left join production_pipeline_stages s on s.id = p.sx_kanban_column_id
--  where p.company_id = (select id from companies where name ilike '%Hucabi%')
--  order by nguoi_da_keo desc, p.code;
--
-- ---------------------------------------------------------------------------
-- HOÀN TÁC
-- ---------------------------------------------------------------------------
-- update projects p set sx_kanban_column_id = b.sx_kanban_column_id, updated_at = now()
--   from _bak_20260912_hcb_projects b
--  where b.id = p.id and p.sx_kanban_column_id is distinct from b.sx_kanban_column_id;
