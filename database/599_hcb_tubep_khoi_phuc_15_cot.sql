-- 599: HCB · Tủ bếp — KHÔI PHỤC 15 cột SX mà migration 588 (và 525) đã gộp/xóa.
-- ĐÃ CHẠY TRÊN PRODUCTION ngày 2026-09-11 bởi Claude, theo yêu cầu trực tiếp của anh B.A.
-- File này lưu lại nguyên văn để đối chiếu; chạy lại là idempotent (không đổi gì thêm).
--
-- Bối cảnh: 588 đổi tên 5 cột, DELETE 7 cột, và đẩy 3 cột công nợ sang board "Công nợ"
-- mới tạo, kéo theo 215 dự án. Các dòng bị DELETE không còn ở cả DB chính lẫn QLCV_Backup,
-- nên tên/icon/màu/thứ tự được dựng lại từ board Tủ bếp của Bếp Vạn Phú Thành (bản sinh đôi,
-- order_index 1001–1020) cộng danh sách tên nằm trong chính 588 và 525.
--
-- Sao lưu trước khi chạy (còn trong DB):
--   _bak_20260911_hcb_stages    22 dòng
--   _bak_20260911_hcb_types      4 dòng
--   _bak_20260911_hcb_projects 506 dòng
--
-- Kết quả đã kiểm chứng sau khi chạy:
--   board Tủ bếp                    = 15 cột (thứ tự 1..15)
--   dự án đổi sx_kanban_column_id   = 0
--   dự án đổi workshop_type_id      = 215 (đúng chủ đích: Công nợ → Tủ bếp)
--   tổng dự án HCB                  = 506 trước / 506 sau
--   dự án trỏ tới cột không tồn tại = 0
--   board Cánh kính + Cửa           = 11 cột, không đổi
--   công ty khác                    = không đụng tới
--
-- CHỦ ĐÍCH GIỮ NGUYÊN (không phải sót):
--   - is_handover_to_logistics vẫn nằm ở cột 8 "KT KCS SẢN PHẨM, TÍNH CN" (78 dự án),
--     không dời xuống cột 11 — giữ đúng hành vi bàn giao VC-LĐ hiện tại.
--   - bucket_slug 'hcb_tb_gia_cong' vẫn ở cột 4 "Ban thành phẩm".
--   - Board "Công nợ" giữ lại 3 cột còn dùng: CÔNG NỢ ĐÃ CHỐT, Đợi thanh toán (5 dự án),
--     Nợ quá hạn.
--
-- KHÔNG khôi phục được: dự án nào từng đứng ở cột nào trước 588. 588 đã dồn hết vào
-- Ban thành phẩm / KT KCS và không ghi vị trí cũ ở đâu (activity_logs trống,
-- stage_transitions không có). Muốn lấy lại phải dùng Point-in-Time Recovery của Supabase
-- về mốc trước 2026-09-11 02:46 UTC.

-- ============ PHẦN 1: trả tên 5 cột + dựng lại 7 cột đã bị DELETE ============
DO $$
DECLARE
  v_hcb UUID; v_tubep UUID; r RECORD; v_doi INT := 0; v_them INT := 0;
BEGIN
  SELECT id INTO v_hcb FROM companies WHERE name = 'Cong ty Hucabi' LIMIT 1;
  IF v_hcb IS NULL THEN
    SELECT id INTO v_hcb FROM companies WHERE name ILIKE '%Hucabi%' LIMIT 1;
  END IF;
  SELECT id INTO v_tubep FROM workshop_project_types
    WHERE company_id = v_hcb AND lower(trim(name)) = 'tu bep' LIMIT 1;
  IF v_hcb IS NULL OR v_tubep IS NULL THEN
    RAISE EXCEPTION '599: khong tim thay HCB hoac board Tu bep - dung, khong sua gi.';
  END IF;

  FOR r IN SELECT * FROM (VALUES
      ('tiep nhan',  'Tiep nhan don hang ve SX',    'A', '#6366F1', 1),
      ('ke hoach',   'Thiet ke & lap ke hoach NVL', 'B', '#8B5CF6', 2),
      ('duyet',      'San xuat kiem tra cheo',      'C', '#0EA5E9', 3),
      ('gia cong',   'Ban thanh pham',              'D', '#06B6D4', 4),
      ('hoan thien', 'KT KCS SAN PHAM, TINH CN',    'E', '#14B8A6', 8)
    ) AS x(ten_cu, ten_goc, icon, color, thu_tu)
  LOOP
    UPDATE production_pipeline_stages
       SET name = r.ten_goc, icon = r.icon, color = r.color, order_index = r.thu_tu
     WHERE company_id = v_hcb AND workshop_type_id = v_tubep
       AND lower(trim(name)) = r.ten_cu;
    IF FOUND THEN v_doi := v_doi + 1; END IF;
  END LOOP;

  FOR r IN SELECT * FROM (VALUES
      ('DANG SX THUNG',             'F', '#84CC16',  5, 'cabinet'),
      ('HT NHOM NGUYEN TAM',        'G', '#22C55E',  6, 'cabinet'),
      ('HT NHOM LA GHEP NHO',       'H', '#EAB308',  7, 'cabinet'),
      ('DON HANG DA CHUAN BI XONG', 'I', '#3B82F6',  9, 'finishing'),
      ('DON HANG NGAY MAI GIAO',    'J', '#FB923C', 10, 'finishing'),
      ('DON HANG DA GIAO',          'K', '#10B981', 11, 'finishing'),
      ('Thu tien',                  'L', '#16A34A', 14, NULL)
    ) AS x(ten, icon, color, thu_tu, nhom_deadline)
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM production_pipeline_stages
       WHERE company_id = v_hcb AND workshop_type_id = v_tubep
         AND lower(trim(name)) = lower(trim(r.ten))
    ) THEN
      INSERT INTO production_pipeline_stages (
        name, icon, color, order_index, is_active, company_id, workshop_type_id,
        crm_sync_type, deadline_group, is_handover_to_logistics, bucket_slug
      ) VALUES (
        r.ten, r.icon, r.color, r.thu_tu, true, v_hcb, v_tubep,
        'production', r.nhom_deadline, false, NULL
      );
      v_them := v_them + 1;
    END IF;
  END LOOP;

  RAISE NOTICE '599 phan 1: tra ten % cot, dung lai % cot.', v_doi, v_them;
END $$;

-- ============ PHẦN 2: kéo 3 cột công nợ + 215 dự án về board Tủ bếp ============
DO $$
DECLARE
  v_hcb UUID; v_tubep UUID; v_congno UUID;
  r RECORD; v_ids UUID[]; v_moved INT := 0; v_cols INT := 0;
BEGIN
  SELECT id INTO v_hcb FROM companies WHERE name ILIKE '%Hucabi%' LIMIT 1;
  SELECT id INTO v_tubep  FROM workshop_project_types
    WHERE company_id = v_hcb AND lower(trim(name)) = 'tu bep' LIMIT 1;
  SELECT id INTO v_congno FROM workshop_project_types
    WHERE company_id = v_hcb AND lower(trim(name)) = 'cong no' LIMIT 1;
  IF v_hcb IS NULL OR v_tubep IS NULL OR v_congno IS NULL THEN
    RAISE EXCEPTION '599: thieu HCB / Tu bep / Cong no - dung, khong sua gi.';
  END IF;

  SELECT coalesce(array_agg(id), ARRAY[]::uuid[]) INTO v_ids
  FROM production_pipeline_stages
  WHERE company_id = v_hcb AND workshop_type_id = v_congno
    AND lower(trim(name)) IN ('cong no da tinh','cong no dang doi chieu','cong no da thanh toan');

  IF coalesce(array_length(v_ids,1),0) = 0 THEN
    RAISE NOTICE '599 phan 2: khong con cot nao de chuyen - da chay roi.';
    RETURN;
  END IF;

  UPDATE projects p
     SET workshop_type_id = v_tubep, updated_at = NOW()
   WHERE p.company_id = v_hcb
     AND p.workshop_type_id = v_congno
     AND p.sx_kanban_column_id = ANY (v_ids);
  GET DIAGNOSTICS v_moved = ROW_COUNT;

  FOR r IN SELECT * FROM (VALUES
      ('cong no da tinh',        'CHOT CONG NO',                'M', '#64748B', 12),
      ('cong no dang doi chieu', 'KIEM TRA CONG NO',            'N', '#475569', 13),
      ('cong no da thanh toan',  'CHUYEN TAC VU PHONG KE TOAN', 'O', '#1E40AF', 15)
    ) AS x(ten_cu, ten_goc, icon, color, thu_tu)
  LOOP
    UPDATE production_pipeline_stages
       SET workshop_type_id = v_tubep, name = r.ten_goc,
           icon = r.icon, color = r.color, order_index = r.thu_tu
     WHERE company_id = v_hcb AND workshop_type_id = v_congno
       AND lower(trim(name)) = r.ten_cu;
    IF FOUND THEN v_cols := v_cols + 1; END IF;
  END LOOP;

  RAISE NOTICE '599 phan 2: chuyen % cot, % du an ve board Tu bep.', v_cols, v_moved;
END $$;

-- ============ HOÀN TÁC (nếu cần) ============
-- Bản đã chạy trên production dùng tên tiếng Việt có dấu; file này lược dấu ở phần
-- so khớp để tránh lệch mã hóa khi chạy lại. Muốn về đúng trạng thái ngay trước khi
-- khôi phục, phục hồi từ ba bảng _bak_20260911_hcb_*:
--
--   update projects p set workshop_type_id = b.workshop_type_id,
--                         sx_kanban_column_id = b.sx_kanban_column_id
--     from _bak_20260911_hcb_projects b where b.id = p.id;
--   delete from production_pipeline_stages s
--     where s.company_id = (select id from companies where name ilike '%Hucabi%')
--       and s.id not in (select id from _bak_20260911_hcb_stages);
--   update production_pipeline_stages s
--      set name = b.name, icon = b.icon, color = b.color,
--          order_index = b.order_index, workshop_type_id = b.workshop_type_id
--     from _bak_20260911_hcb_stages b where b.id = s.id;
