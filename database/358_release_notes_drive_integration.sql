-- Thông báo «Có gì mới» — Google Drive tích hợp (đồng bộ builtinUpdates.js 2026-06-drive-module-chat-share)
-- Popup đăng nhập lấy bản published mới nhất từ bảng release_notes.

INSERT INTO release_notes (version, title, content, category, is_published, is_pinned, published_at, created_by)
SELECT
  '2.3.0',
  '☁️ Google Drive tích hợp — lưu trữ theo module, chia sẻ qua chat & nhắc file lớn',
  E'## Google Drive theo module (CRM / SX / VC)\n\n- Menu sidebar có nút **Drive CRM**, **Drive SX**, **Drive VC** — mỗi module chỉ hiện đúng thư mục công ty thuộc module đó.\n- Dropdown **"Tất cả module"** trên trang Drive cho phép lọc nhanh.\n- Folder tổ chức phẳng theo cấu trúc: **Module → Công ty → Khu vực → Loại → Phòng ban → Nhân viên → Kind → Mã deal**.\n\n## Tab ☁️ Drive trên Lead / Deal / Dự án\n\n- Tab **☁️ Drive (N)** hiển thị số file đã gắn — gắn file Drive vào từng entity riêng biệt.\n- Nút **Tải lên từ máy** → upload thẳng vào đúng thư mục entity trên Google Drive.\n- Nút **Liên kết file Drive** → chọn file đã có sẵn trong Drive.\n- Tạo **Google Doc / Sheet** gắn thẳng vào deal — mở preview với toolbar chỉnh sửa đầy đủ.\n\n## Chia sẻ file Drive qua Chat\n\n- Ô chat (Lead chat & Messenger) có nút ☁️ **HardDrive** — chọn file từ Drive → gửi dưới dạng thẻ file.\n- Thẻ file hiển thị: icon loại file (PDF/Doc/Sheet), tên rút gọn, dung lượng, nút 👁 Xem trước + ⬇️ Tải.\n- **DriveFilePicker** mở qua portal (không bị kẹp trong khung chat), dạng danh sách mặc định, modal rộng.\n\n## Nhắc nhở gửi file lớn qua Drive\n\n- Đính kèm file **≥ 10 MB** trực tiếp trong chat → popup nhắc **"File dung lượng lớn — nên gửi qua Drive"**.\n  - Nút **Chọn trên Drive** → mở picker Drive luôn.\n  - Nút **Vẫn gửi từ máy** → tiếp tục upload bình thường.\n- Dòng gợi ý hiển thị dưới ô chat: *"File từ 10 MB nên gửi qua Google Drive (☁️). Giới hạn đính kèm trực tiếp: 50 MB/file."*\n- Ngưỡng nhắc cấu hình qua biến môi trường `VITE_CHAT_DRIVE_REMIND_MB` (mặc định 10 MB).\n\n## Xem trước & chỉnh sửa Doc/Sheet\n\n- Preview Google Doc / Sheet hiển thị **toolbar chỉnh sửa đầy đủ** (đã bỏ tham số `rm=minimal`).\n- Nút **"Chỉnh sửa (tab mới)"** mở Google Docs/Sheets trên tab riêng.\n- Modal preview cao hơn (96vh) để đủ diện tích làm việc.\n\n## Cài đặt kỹ thuật (admin)\n\nChạy các migration Supabase theo thứ tự:\n- `database/354_drive_module_and_category.sql` — thêm cột `module` & `category_tag` vào `drive_roots`\n- `database/355_drive_acl_region.sql` — thêm cột `region_id` vào bảng `drive_acl`\n- `database/356_drive_roots_module_meta.sql` — thêm cột meta `ecosystem_module_key`, `company_id`, `region_id` vào `drive_roots`\n\nSau khi chạy migration, vào **Quản trị → Drive → Roots** để gán module cho từng root folder.',
  'feature',
  true,
  true,
  '2026-06-16T06:00:00+00',
  (SELECT id FROM users WHERE role = 'admin' AND is_active IS NOT FALSE ORDER BY created_at LIMIT 1)
WHERE NOT EXISTS (
  SELECT 1 FROM release_notes WHERE version = '2.3.0' AND title LIKE '%Google Drive tích hợp%'
);
