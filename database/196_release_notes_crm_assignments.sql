-- Thông báo «Có gì mới» — đồng bộ với frontend/src/content/builtinUpdates.js (2026-05-crm-assignments)
-- Popup đăng nhập lấy bản published mới nhất từ bảng release_notes.

INSERT INTO release_notes (version, title, content, category, is_published, is_pinned, published_at, created_by)
SELECT
  '1.9.0',
  'Giao việc CRM — giao việc độc lập, file yêu cầu/nộp, bình luận & nhắc hạn',
  E'## Trang mới: Giao việc CRM\n- Menu sidebar **Giao việc CRM** (`/crm/assignments`) — **tách khỏi** module Công việc chung và task gắn Lead/Deal.\n- **4 chế độ xem**: Kanban (tự quản lý cột), Danh sách, Planner (theo nhân viên), Deadline.\n- **Lọc theo công ty** (admin chọn công ty; nhân viên chỉ thấy việc công ty mình).\n- Giao **nhiều NV** cùng lúc: lọc theo công ty → khu vực → phòng ban → chọn NV / chọn tất cả.\n\n## File yêu cầu & nộp bài\n- **File yêu cầu** (người giao): gallery ảnh / video / link với mũi tên trái–phải; thêm **file** hoặc **URL**; PDF/Office chỉ nút **Tải file về**.\n- **Nộp công việc** (NV được giao): danh sách file đã nộp + nút nộp thêm; tải/xóa file của mình.\n- Upload tên file tiếng Việt được chuẩn hóa cho Storage (tránh lỗi Invalid key).\n\n## Ghi chú & thông báo\n- **Bình luận có trả lời** (thread lồng nhau).\n- Badge sidebar + **Notification Center**: bình luận mới, sắp đến hạn, quá hạn.\n- Cron nhắc deadline mỗi 30 phút.\n\n## Cài đặt kỹ thuật (admin)\n- Chạy migration Supabase (theo thứ tự):\n  - `database/191_crm_assignments.sql`\n  - `database/192_crm_assignment_assignees.sql`\n  - `database/193_crm_assignment_comments.sql`\n  - `database/194_crm_assignment_files.sql`\n  - `database/195_crm_assignment_comments_parent_id.sql`\n- Restart backend sau khi chạy migration.',
  'feature',
  true,
  true,
  NOW(),
  (SELECT id FROM users WHERE role = 'admin' AND is_active IS NOT FALSE ORDER BY created_at LIMIT 1)
WHERE NOT EXISTS (
  SELECT 1 FROM release_notes WHERE version = '1.9.0' AND title LIKE '%Giao việc CRM%'
);
