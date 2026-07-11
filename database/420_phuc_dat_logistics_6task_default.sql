-- 420: Phúc Đạt VC/LĐ — mặc định bộ 6 việc đơn giản
-- Tắt bộ 13 bước và bộ «Đơn giản» 7 bước.
-- Dùng id để tránh lỗi encoding tên tiếng Việt khi chạy qua API.
-- Chạy sau 418 / 419. Idempotent.

BEGIN;

-- 13 việc «Giao hàng & bàn giao»
UPDATE workshop_task_templates
SET is_default = false, is_active = false, updated_at = now()
WHERE id = 'ea0e6c8f-e21a-457d-af8e-938baec13441';

-- 7 việc «Đơn giản»
UPDATE workshop_task_templates
SET is_default = false, is_active = false, updated_at = now()
WHERE id = '6af0c61a-069a-4cec-aaf6-5490ef63b3cd';

-- 6 việc «Bộ mẫu Vận chuyển & Lắp đặt — Phúc Đạt» → mặc định
UPDATE workshop_task_templates
SET is_default = true,
    is_active = true,
    order_index = 0,
    description = 'Bộ mẫu VC/LĐ Phúc Đạt (6 việc): lịch giao → xuất kho → vận chuyển → lắp → nghiệm thu → bảo hành.',
    updated_at = now()
WHERE id = '41eeafd3-abb6-4ebc-8537-b9d4b27aab67';

COMMIT;
