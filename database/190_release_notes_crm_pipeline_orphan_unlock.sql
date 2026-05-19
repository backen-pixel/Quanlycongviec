-- Thông báo «Có gì mới» — đồng bộ với frontend/src/content/builtinUpdates.js (2026-05-crm-pipeline-orphan-unlock)
-- Popup đăng nhập lấy bản published mới nhất từ bảng release_notes.

INSERT INTO release_notes (version, title, content, category, is_published, is_pinned, published_at, created_by)
SELECT
  '1.8.0',
  'CRM Pipeline: giữ bộ lọc, mở khóa Kanban, cột «Chưa có giai đoạn» & gộp cột Thắng trùng',
  E'## Bộ lọc Pipeline & Khách hàng được nhớ\n- Bộ lọc Kanban CRM (công ty, khu vực, NV, nguồn, giai đoạn, phân loại, SĐT, tìm kiếm…) **giữ nguyên khi sang trang khác** (Khách hàng, KPI…) và khi mở lại trình duyệt.\n- Trang **Khách hàng** cũng nhớ ô tìm kiếm gần nhất.\n- Khi quay lại Pipeline, panel «Bộ lọc» tự bung nếu có filter đang áp dụng.\n\n## Kanban Deal — mở khóa toàn bộ\n- Có thể **kéo deal sang bất kỳ cột nào**, kể cả **Sản xuất / Vận chuyển / Hoàn thành** (trước đây bị khóa).\n- Stepper trong chi tiết Deal cũng cho đổi lại các giai đoạn trước Thắng (Báo giá, Đàm phán…).\n- Badge nhỏ **SX / VC** vẫn tự sync từ module Xưởng / Vận chuyển; `stage_id` chính trên CRM do người dùng tự quyết.\n\n## Cột «🗂️ Chưa có giai đoạn» (Kanban Deal)\n- Thêm checkbox **«Hiện deal chưa có giai đoạn»** trong bộ lọc — bật để hiện cột ảo ở cuối Kanban.\n- Gom các deal: stage rỗng / cột bị xoá / có project nhưng thiếu badge SX & VC.\n- Kéo deal từ cột này về cột thường **không bị chặn bất kỳ điều kiện nào** — dùng để chữa dữ liệu lệch.\n\n## Pipeline Stepper — dấu tick đúng lịch sử\n- Các giai đoạn **đã đi qua** (Báo giá, Khảo sát…) được tick dựa trên **lịch sử thật** (`crm_lead_stage_history`) thay vì chỉ theo `order_index`.\n- Deal đang ở Thắng không còn tick nhầm các cột sau Thắng.\n\n## Sửa lỗi cấu hình «2 cột Thắng» trên pipeline\n- Migration **`188_dedupe_deal_won_stages.sql`**: tự động gộp các cột tên *Thắng* trùng nhau trên cùng pipeline → chỉ giữ một cột chính, các deal liên quan được chuyển sang đúng cột, cột dư đổi tên *«… (trùng — đã gộp)»* và tắt.\n- Migration **`189_repair_pipeline_crm_target_after_dedupe.sql`**: đồng bộ lại các tham chiếu `pipeline_crm_target` sau khi gộp.\n\n## Placeholder badge «⏳ Chờ vào xưởng»\n- Deal đã Thắng có project nhưng SX/VC chưa cấp giai đoạn xưởng → hiển thị badge mờ *«Chờ vào xưởng»* để tránh cảm giác «mất tag».\n\n## Cài đặt kỹ thuật (admin)\n- Chạy migration Supabase mới:\n  - `database/188_dedupe_deal_won_stages.sql`\n  - `database/189_repair_pipeline_crm_target_after_dedupe.sql`\n- Sau khi chạy, mở **Cài đặt → Pipeline** kiểm tra: mỗi pipeline chỉ còn **1 cột Thắng** active.',
  'feature',
  true,
  true,
  NOW(),
  (SELECT id FROM users WHERE role = 'admin' AND is_active IS NOT FALSE ORDER BY created_at LIMIT 1)
WHERE NOT EXISTS (
  SELECT 1 FROM release_notes WHERE version = '1.8.0' AND title LIKE '%CRM Pipeline%'
);
