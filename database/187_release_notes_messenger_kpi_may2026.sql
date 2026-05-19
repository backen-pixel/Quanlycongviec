-- Thông báo «Có gì mới» — đồng bộ với frontend/src/content/builtinUpdates.js (2026-05-messenger-presence-kpi)
-- Popup đăng nhập lấy bản published mới nhất từ bảng release_notes.

INSERT INTO release_notes (version, title, content, category, is_published, is_pinned, published_at, created_by)
SELECT
  '1.7.0',
  'Messenger, trạng thái online, KPI chuyển Deal & trang Đang hoạt động',
  E'## Messenger & chat\n- **Tạo nhóm theo công ty**: chọn công ty → *Chọn tất cả NV* / *Thêm vào danh sách* khi tạo nhóm (menu Nhóm chat).\n- **Tin nhắn đến**: bong bóng chat (dock) tự mở đúng hội thoại + toast; thông báo trình duyệt khi tab ẩn.\n- **Trạng thái online**: chấm xanh / xám trên dock, tìm nhân viên, chat 1-1 (ping ~60 giây; coi offline sau ~2 phút không hoạt động).\n\n## Trang mới\n- Menu CRM → **Đang hoạt động** (`/crm/activity`): xem ai đang online, lọc công ty/phòng ban; **Nhắn tin** mở bong bóng chat với người đó.\n\n## KPI Sales Admin\n- **B6 — Tỷ lệ Lead chuyển Deal** trên dashboard KPI Sales Admin.\n- Khi **Chuyển sang Deal** thành công: **+3 điểm** sổ cái KPI (mỗi lead một lần; chỉnh trong rule `lead_converted`).\n\n## Cài đặt kỹ thuật (admin)\n- Chạy migration Supabase (nếu chưa có):\n  - `database/67_user_activity_and_messenger_pins.sql` — ping / online\n  - `database/186_kpi_lead_converted_event.sql` — điểm & KPI B6 chuyển Deal',
  'feature',
  true,
  true,
  NOW(),
  (SELECT id FROM users WHERE role = 'admin' AND is_active IS NOT FALSE ORDER BY created_at LIMIT 1)
WHERE NOT EXISTS (
  SELECT 1 FROM release_notes WHERE version = '1.7.0' AND title LIKE '%Messenger, trạng thái online%'
);
