/**
 * Cập nhật tích hợp sẵn — hiển thị trên /updates (bổ sung release notes từ DB).
 * Cập nhật file này khi ship tính năng lớn.
 */
export const BUILTIN_UPDATES = [
  {
    id: '2026-05-messenger-presence-kpi',
    version: '1.7.0',
    category: 'feature',
    publishedAt: '2026-05-19T00:00:00.000Z',
    title: 'Messenger, trạng thái online, KPI chuyển Deal & trang Đang hoạt động',
    content: `## Messenger & chat
- **Tạo nhóm theo công ty**: chọn công ty → *Chọn tất cả NV* / *Thêm vào danh sách* khi tạo nhóm (menu Nhóm chat).
- **Tin nhắn đến**: bong bóng chat (dock) tự mở đúng hội thoại + toast; thông báo trình duyệt khi tab ẩn.
- **Trạng thái online**: chấm xanh / xám trên dock, tìm nhân viên, chat 1-1 (ping ~60 giây; coi offline sau ~2 phút không hoạt động).

## Trang mới
- Menu CRM → **Đang hoạt động** (\`/crm/activity\`): xem ai đang online, lọc công ty/phòng ban; **Nhắn tin** mở bong bóng chat với người đó.

## KPI Sales Admin
- **B6 — Tỷ lệ Lead chuyển Deal** trên dashboard KPI Sales Admin.
- Khi **Chuyển sang Deal** thành công: **+3 điểm** sổ cái KPI (mỗi lead một lần; chỉnh trong rule \`lead_converted\`).

## Cài đặt kỹ thuật (admin)
- Chạy migration Supabase (nếu chưa có):
  - \`database/67_user_activity_and_messenger_pins.sql\` — ping / online
  - \`database/186_kpi_lead_converted_event.sql\` — điểm & KPI B6 chuyển Deal`,
  },
  {
    id: '2026-05-social-feed',
    version: '1.6.0',
    category: 'feature',
    publishedAt: '2026-05-16T00:00:00.000Z',
    title: 'Bảng tin nội bộ — đăng bài, lịch hẹn, phạm vi & quản lý bài',
    content: `## Bảng tin nội bộ
- Menu **Bảng tin nội bộ** trên sidebar — chia sẻ tin, ảnh, video và file trong phạm vi công ty.
- Soạn bài kiểu Facebook: modal tạo/sửa, đính kèm tối đa 12 tệp (ảnh, video, PDF, Office…), upload lớn qua stream.

## Video & media
- URL video trực tiếp (.mp4, .webm…) hoặc **YouTube / Vimeo** (nhúng iframe, xem toàn màn hình).
- Gallery ảnh/video trong bài; lightbox xem phóng to.

## Tương tác
- Thích bài với **7 cảm xúc** (👍 ❤️ 🤗 😆 😮 😢 😠), xem danh sách người đã thả.
- Bình luận **có thread trả lời** và cảm xúc trên từng bình luận.

## Quản lý bài viết
- Menu **⋯** góc phải mỗi bài: **Sửa**, **Sao chép liên kết**, **Ẩn khỏi bảng tin của tôi**, **Ẩn / hiện lại với công ty** (tác giả & quản lý), **Xóa**.
- Chỉnh sửa nội dung, link, URL ảnh/video và file đính kèm sau khi đăng.

## Lịch đăng & ai được xem
- **Đăng ngay** hoặc **hẹn giờ** (chọn ngày giờ — bài chỉ hiện khi tới lịch; tác giả vẫn thấy bài đang chờ).
- **Cả công ty** hoặc **chỉ nhân viên được chọn** (tìm và chọn từ danh sách nhân viên công ty).
- Badge trên bài: *Lên lịch*, *Chỉ người được chọn*, *Đã ẩn khỏi công ty*.

## Kỹ thuật
- Cần chạy migration \`180_internal_social_schedule_visibility_hide_share.sql\` trên database để dùng lọc lịch đăng, ẩn bài và phạm vi người xem.`,
  },
];
