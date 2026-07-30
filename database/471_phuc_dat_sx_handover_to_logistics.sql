-- Phúc Đạt: cột SX «Chờ giao hàng» bật trigger bàn giao VC
-- → kéo thẻ vào cột này gửi thông báo Sale CRM tạo sự kiện VC/LĐ.
UPDATE production_pipeline_stages
SET is_handover_to_logistics = true
WHERE id = 'a759ca33-8fd1-4910-bc4e-f5a8cd47a9d2'
  AND company_id = '29677f68-967e-4256-92fd-492bb580e888'
  AND COALESCE(is_handover_to_logistics, false) = false;
