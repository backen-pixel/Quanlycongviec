-- 604: Kanban gộp cột — thêm production_pipeline_stages.group_key
-- ĐÃ CHẠY TRÊN PRODUCTION 2026-09-12 theo yêu cầu anh B.A.
--
-- group_key = cột lớn (giai đoạn NỐI TIẾP) mà cột nhỏ này thuộc về.
-- NULL = cột tự đứng riêng thành một cột lớn → công ty chưa cấu hình vẫn dùng được bình thường.
-- Cách gom lấy nguyên logic của migration 588 (file đã gộp 15 cột xuống 5).

alter table production_pipeline_stages add column if not exists group_key text;

comment on column production_pipeline_stages.group_key is
  'Cot lon (giai doan noi tiep) ma cot nho nay thuoc ve. NULL = cot dung rieng. Dung cho che do xem Kanban gop.';

DO $$
DECLARE v_hcb UUID; v_tubep UUID; r RECORD; n INT := 0;
BEGIN
  SELECT id INTO v_hcb FROM companies WHERE name ILIKE '%Hucabi%' LIMIT 1;
  SELECT id INTO v_tubep FROM workshop_project_types
    WHERE company_id = v_hcb AND lower(trim(name)) = 'tu bep' LIMIT 1;
  IF v_hcb IS NULL OR v_tubep IS NULL THEN
    RAISE NOTICE '604: khong tim thay HCB / Tu bep — bo qua backfill.';
    RETURN;
  END IF;

  FOR r IN SELECT * FROM (VALUES
      ('tiep nhan don hang ve sx',        'tiep_nhan'),
      ('thiet ke & lap ke hoach nvl',     'ke_hoach'),
      ('san xuat kiem tra cheo dat kinh', 'duyet'),
      ('ban thanh pham',                  'gia_cong'),
      ('dang sx thung',                   'gia_cong'),
      ('ht nhom nguyen tam',              'gia_cong'),
      ('ht nhom la ghep nho',             'gia_cong'),
      ('kt kcs san pham, tinh cn',        'hoan_thien'),
      ('don hang da chuan bi xong',       'hoan_thien'),
      ('don hang ngay mai giao',          'hoan_thien'),
      ('don hang da giao',                'hoan_thien'),
      ('chot cong no',                    'cong_no'),
      ('kiem tra cong no',                'cong_no'),
      ('thu tien',                        'cong_no'),
      ('chuyen tac vu phong ke toan',     'cong_no'),
      ('cong no da chot',                 'cong_no')
    ) AS x(ten, nhom)
  LOOP
    UPDATE production_pipeline_stages
       SET group_key = r.nhom
     WHERE company_id = v_hcb AND workshop_type_id = v_tubep
       AND lower(trim(name)) = r.ten;
    IF FOUND THEN n := n + 1; END IF;
  END LOOP;
  RAISE NOTICE '604: da gan group_key cho % cot.', n;
END $$;

-- Kết quả đã kiểm chứng trên production (board Tu bep):
--   tiep_nhan   1 cot ·   8 du an
--   ke_hoach    1 cot ·   0
--   duyet       1 cot ·   0
--   gia_cong    4 cot ·  19
--   hoan_thien  4 cot ·  89
--   cong_no     5 cot · 215
--
-- HOÀN TÁC:
--   update production_pipeline_stages set group_key = null
--    where company_id = (select id from companies where name ilike '%Hucabi%');
