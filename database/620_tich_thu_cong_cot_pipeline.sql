-- 620: Cột pipeline sản xuất có thể yêu cầu TÍCH TAY mới coi là hoàn thành.
--
-- Mặc định một cột đã đi qua sẽ tự hiện dấu ✓ (suy từ vị trí thẻ, không ghi xuống
-- project_substage_status). Với các khâu cần người xác nhận thật — kính là ví dụ:
-- đặt, cắt, sơn, nhận về xưởng — suy đoán đó báo xong trong khi chưa ai kiểm.
--
-- Bật cờ này thì cột chỉ hiện ✓ khi có dòng project_substage_status = 'xong',
-- hoặc khi mọi nhiệm vụ con trong cột đã hoàn thành (bằng chứng thật, không phải vị trí).

ALTER TABLE production_pipeline_stages
  ADD COLUMN IF NOT EXISTS tich_thu_cong BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN production_pipeline_stages.tich_thu_cong IS
  'TRUE = cột không tự tích khi thẻ đi qua; phải tích tay hoặc hoàn thành hết nhiệm vụ con.';

-- 5 cột kính của loại xưởng "Tủ bếp" — Công ty Hucabi (18c2563f-3495-498d-8199-23200c9f420e)
UPDATE production_pipeline_stages
   SET tich_thu_cong = TRUE
 WHERE id IN (
   '7edeee86-6aae-410c-96b0-f3a2225379ea',  -- Sản xuất kiểm tra chéo đặt kính
   '4effd9c0-7bd1-4cd9-8307-6344fd6a7ff6',  -- Đặt kính
   '19c001f2-8577-4a1c-a79c-5b2692142a08',  -- CẮT KÍNH
   '4720fddb-c9a9-4ec5-ac7b-20f2f0f5a4e6',  -- Sơn kính
   '16af5412-879d-43b2-9321-737180557123'   -- KÍNH CÓ MẶT TẠI XƯỞNG
 );
