-- 264_knowledge_crm_guide_extra_features.sql
-- Bổ sung 7 bài HD + 7 bài tập cho khoá "Hướng dẫn CRM — Lead & Deal"
-- Dashboard CRM, Sự kiện, Nhóm chat, Đang hoạt động, Bảng tin, Ghi âm, CRM Mobile
-- Di chuyển bài thi cuối từ HD 12 → HD 19
-- Idempotent: ON CONFLICT DO UPDATE

BEGIN;

-- Cập nhật mô tả danh mục
UPDATE knowledge_categories SET
  name = 'Hướng dẫn CRM — Toàn bộ phần mềm',
  description = 'Hướng dẫn thao tác trên phần mềm CRM: Lead, Deal, Dashboard, Sự kiện, Chat, Bảng tin, Ghi âm, Mobile. Dành cho nhân viên mới cần làm được ngay trên hệ thống.',
  deadline_duration_days = 21,
  deadline_note = 'Hoàn thành hướng dẫn CRM trong 21 ngày'
WHERE id = 'd2000003-0000-0000-0000-000000000001';

-- ══════════════════════════════════════════════════════════════════════════
-- PHẦN C — CÁC CHỨC NĂNG CRM KHÁC
-- ══════════════════════════════════════════════════════════════════════════

-- HD 13: Dashboard CRM
INSERT INTO knowledge_lessons (id, category_id, title, summary, content_md, cover_image_url, duration_minutes, tags, is_required, sort_order, is_published, published_at)
VALUES (
  'b2000003-0000-0000-0000-000000000013',
  'd2000003-0000-0000-0000-000000000001',
  'HD 13: Dashboard CRM — Tổng quan pipeline',
  'Tab Lead/Deal, KPI, Kanban, bộ lọc nâng cao, tạo Lead/Deal nhanh.',
  $md$# HD 13 — Dashboard CRM

## 1. Đường dẫn

**Menu trái** → **CRM** → **Tổng quan** → **Dashboard CRM**

Hoặc truy cập trực tiếp: `/crm/dashboard`

## 2. Giao diện chính

| Khu vực | Chức năng |
|---|---|
| **Tab Lead / Deal** | Chuyển đổi giữa pipeline Lead và Deal (pill ở đầu trang) |
| **Nút + Thêm Lead / + Thêm Deal** | Tạo cơ hội mới nhanh không cần vào Bảng riêng |
| **Ô Tìm nhanh** | Tìm theo tên, SĐT, mã Lead/Deal |
| **Bộ lọc nâng cao** | Công ty, khu vực, NV phụ trách, giai đoạn, nguồn, thời gian, SĐT |
| **Thẻ KPI** | Tổng, Đang xử lý, Doanh thu, Điểm KPI tháng (khác nhau giữa Lead và Deal) |
| **Chế độ xem** | Kanban / Danh sách / Planner / Deadline / Bình luận / Lịch |
| **Banner cảnh báo** | Lead/Deal quá hạn SLA (màu đỏ) |

## 3. Thao tác thường dùng

### Xem pipeline nhanh
1. Vào Dashboard → chọn tab **Lead** hoặc **Deal**
2. Bật chế độ **Kanban** → kéo thả thẻ giữa các cột giai đoạn
3. Click thẻ → mở chi tiết Lead/Deal

### Lọc theo nhân viên
1. Bấm **Bộ lọc** → chọn **Nhân viên phụ trách**
2. Chọn tên → áp dụng → chỉ thấy Lead/Deal của người đó

### Tạo Lead/Deal nhanh
1. Bấm **+ Thêm Lead** (hoặc **+ Thêm Deal**)
2. Điền form tối thiểu → **Lưu**
3. Thẻ mới xuất hiện ở cột đầu tiên Kanban

## 4. Chế độ xem đặc biệt

| Chế độ | Dùng khi |
|---|---|
| **Deadline** | Nhóm theo mốc hạn — ưu tiên xử lý trễ SLA |
| **Bình luận** | Xem Lead/Deal có hoạt động mới nhất |
| **Planner** | Lên kế hoạch tuần/tháng theo lịch |
| **Danh sách** | Xuất/xem dạng bảng, sắp xếp cột |

## 5. Thực hành

1. Vào Dashboard CRM
2. Chuyển tab Lead → Deal → quan sát KPI thay đổi
3. Bật Kanban → kéo 1 thẻ sang cột kế tiếp
4. Thử bộ lọc "Lead của tôi"
$md$,
  'https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=1200&q=80',
  8, ARRAY['huong-dan','dashboard','crm'], true, 13, true, now()
) ON CONFLICT (id) DO UPDATE SET title=EXCLUDED.title, content_md=EXCLUDED.content_md, is_published=true, updated_at=now();

-- HD 14: Sự kiện
INSERT INTO knowledge_lessons (id, category_id, title, summary, content_md, duration_minutes, tags, is_required, sort_order, is_published, published_at)
VALUES (
  'b2000003-0000-0000-0000-000000000014',
  'd2000003-0000-0000-0000-000000000001',
  'HD 14: Sự kiện — Lịch & RSVP nội bộ',
  'Tạo sự kiện, xem lịch tháng, phản hồi tham gia, bình luận.',
  $md$# HD 14 — Sự kiện

## 1. Đường dẫn

**Menu trái** → **CRM** → **Tổng quan** → **Sự kiện**

Hoặc: `/crm/events`

## 2. Giao diện chính

| Khu vực | Chức năng |
|---|---|
| **Tab Lịch / Feed / Loại** | Chuyển giữa lịch tháng, danh sách feed, cấu hình loại sự kiện |
| **Nút Tạo sự kiện** | Mở form tạo sự kiện mới |
| **Link Tổng quan** | Biểu đồ/thống kê sự kiện theo khối |
| **Lọc khối** | Kinh doanh / Sản xuất / Vận chuyển / Chung (admin) |
| **Bộ lọc** | Tìm kiếm, loại, trạng thái, NV, khu vực, khoảng ngày |
| **Lịch tháng** | Xem sự kiện theo ngày, click ngày để xem chi tiết |

## 3. Tạo sự kiện

1. Bấm **Tạo sự kiện**
2. Điền: **Tiêu đề**, **Loại** (họp, training, sự kiện chung…), **Ngày/giờ bắt đầu & kết thúc**
3. Chọn **Khối** (Kinh doanh / SX / VC / Chung)
4. Chọn **Người tham gia** (toàn công ty / NV cụ thể / phòng ban)
5. Thêm **Mô tả** + **Địa điểm** (nếu offline) hoặc **Link họp online**
6. Bấm **Lưu** → sự kiện hiện trên lịch

## 4. Phản hồi RSVP

Trên từng sự kiện:
- **Tham gia** — xác nhận sẽ đến
- **Từ chối** — không tham gia (ghi lý do nếu cần)
- **Bình luận** — trao đổi trước/sau sự kiện

## 5. Quản lý sự kiện (người tạo)

- **Sửa** — cập nhật thông tin
- **Hủy** — hủy sự kiện, thông báo người tham gia
- **Xóa** — xóa vĩnh viễn (chỉ người tạo/admin)

## 6. Thực hành

1. Vào Sự kiện → xem lịch tháng hiện tại
2. Tạo 1 sự kiện test (loại "Họp nội bộ", ngày mai)
3. Phản hồi RSVP trên 1 sự kiện có sẵn
$md$,
  7, ARRAY['huong-dan','su-kien','crm'], true, 14, true, now()
) ON CONFLICT (id) DO UPDATE SET title=EXCLUDED.title, content_md=EXCLUDED.content_md, is_published=true, updated_at=now();

-- HD 15: Nhóm chat
INSERT INTO knowledge_lessons (id, category_id, title, summary, content_md, duration_minutes, tags, is_required, sort_order, is_published, published_at)
VALUES (
  'b2000003-0000-0000-0000-000000000015',
  'd2000003-0000-0000-0000-000000000001',
  'HD 15: Nhóm chat — Tin nhắn nội bộ',
  'Chat 1-1, nhóm chat, ghim hội thoại, quản lý thành viên, bong bóng chat nổi.',
  $md$# HD 15 — Nhóm chat (Messenger Hub)

## 1. Đường dẫn

**Menu trái** → **CRM** → **Tổng quan** → **Nhóm chat**

Hoặc: `/crm/messenger`

> Ngoài ra, **bong bóng chat nổi** ở góc màn hình có thể mở từ bất kỳ trang nào trong app.

## 2. Giao diện 3 cột

| Cột | Chức năng |
|---|---|
| **Trái — Danh sách hội thoại** | Tất cả chat 1-1 và nhóm; tab Tất cả / Ưu tiên (ghim) |
| **Giữa — Khung chat** | Tin nhắn, gửi text/ảnh/file, emoji |
| **Phải — Panel thông tin** | Media / File / Link / Thành viên (thu/mở) |

## 3. Chat 1-1

1. Ô **Tìm nhân viên** ở cột trái
2. Gõ tên → chọn người → mở chat trực tiếp
3. Gõ tin nhắn → Enter hoặc nút Gửi
4. Đính kèm: bấm icon 📎 → chọn ảnh/file

## 4. Tạo nhóm chat

1. Bấm **Tạo nhóm chat**
2. Đặt **Tên nhóm** (vd: "Sale Q.7 — Tháng 5")
3. Chọn **Công ty** (nếu có nhiều công ty)
4. Thêm **Thành viên** từ danh sách NV
5. Bấm **Tạo** → nhóm xuất hiện trong danh sách

## 5. Quản lý nhóm (admin nhóm)

Vào panel phải → tab **Thành viên**:
- **Thêm NV** vào nhóm
- **Xóa NV** khỏi nhóm
- **Đổi vai trò** (admin nhóm / thành viên)

## 6. Ghim hội thoại quan trọng

- Bấm icon 📌 trên hội thoại → chuyển sang tab **Ưu tiên**
- Dùng cho nhóm sale, nhóm xưởng cần theo dõi thường xuyên

## 7. Chấm online/offline

- Chấm **xanh** = đang hoạt động (ping trong ~2 phút)
- Chấm **xám** = offline
- Hiển thị trên danh sách hội thoại và panel thành viên

## 8. Thực hành

1. Vào Nhóm chat
2. Tìm 1 đồng nghiệp → gửi tin nhắn test
3. Tạo nhóm chat test (hoặc tham gia nhóm có sẵn)
4. Thử ghim 1 hội thoại → kiểm tra tab Ưu tiên
$md$,
  8, ARRAY['huong-dan','chat','messenger'], true, 15, true, now()
) ON CONFLICT (id) DO UPDATE SET title=EXCLUDED.title, content_md=EXCLUDED.content_md, is_published=true, updated_at=now();

-- HD 16: Đang hoạt động
INSERT INTO knowledge_lessons (id, category_id, title, summary, content_md, duration_minutes, tags, is_required, sort_order, is_published, published_at)
VALUES (
  'b2000003-0000-0000-0000-000000000016',
  'd2000003-0000-0000-0000-000000000001',
  'HD 16: Đang hoạt động — Giám sát online & bản đồ',
  'Xem ai đang online, bản đồ vị trí NV, lịch sử đăng nhập, nhắn tin nhanh.',
  $md$# HD 16 — Đang hoạt động

## 1. Đường dẫn

**Menu trái** → **CRM** → **Tổng quan** → **Đang hoạt động**

Hoặc: `/crm/activity`

## 2. Giao diện chính

| Khu vực | Chức năng |
|---|---|
| **Badge thống kê** | "X đang hoạt động / Y nhân viên" — tự refresh ~30 giây |
| **Nút Làm mới** | Cập nhật danh sách ngay lập tức |
| **Bộ lọc** | Công ty, phòng ban, tìm tên/email |
| **Tab** | Đang hoạt động / Tất cả / Offline / Lịch sử đăng nhập |
| **Bản đồ** | Vị trí NV trên bản đồ (tab Bản đồ / Danh sách điểm / Chưa có vị trí) |

## 3. Tab Đang hoạt động

Danh sách NV đang mở app (ping trong ~2 phút):
- **Avatar** + **chấm xanh** = online
- **Thiết bị**: Web / Android / iOS
- **IP** + **địa chỉ** (nếu có)
- Nút **Nhắn tin** → mở chat trực tiếp với người đó

## 4. Bản đồ vị trí

1. Chuyển sang tab **Bản đồ**
2. Lọc: **Tất cả NV** hoặc **Chỉ online**
3. Click điểm trên bản đồ → xem thông tin NV
4. Tab **Chưa có vị trí** → NV chưa bật GPS/location

> Vị trí chỉ hiển thị khi NV dùng app mobile và cho phép truy cập vị trí.

## 5. Tab Lịch sử đăng nhập

- Xem phiên **đăng nhập / đăng xuất** của NV
- Lọc theo thời gian, NV, thiết bị
- Dùng để tra cứu khi cần (vd: NV báo không đăng nhập được)

## 6. Thực hành

1. Vào Đang hoạt động → xem badge "X đang hoạt động"
2. Tìm tên mình trong danh sách → xác nhận chấm xanh
3. Thử nút **Nhắn tin** với 1 NV đang online
4. Xem tab Lịch sử đăng nhập → tìm phiên đăng nhập gần nhất của bạn
$md$,
  6, ARRAY['huong-dan','hoat-dong','online'], true, 16, true, now()
) ON CONFLICT (id) DO UPDATE SET title=EXCLUDED.title, content_md=EXCLUDED.content_md, is_published=true, updated_at=now();

-- HD 17: Bảng tin nội bộ
INSERT INTO knowledge_lessons (id, category_id, title, summary, content_md, duration_minutes, tags, is_required, sort_order, is_published, published_at)
VALUES (
  'b2000003-0000-0000-0000-000000000017',
  'd2000003-0000-0000-0000-000000000001',
  'HD 17: Bảng tin nội bộ — Mạng xã hội công ty',
  'Đăng bài, ảnh/video, cảm xúc, bình luận, hẹn giờ đăng, phạm vi xem.',
  $md$# HD 17 — Bảng tin nội bộ

## 1. Đường dẫn

**Menu trái** → **CRM** → **Tổng quan** → **Bảng tin nội bộ**

Hoặc: `/social`

## 2. Giao diện chính

| Khu vực | Chức năng |
|---|---|
| **Thanh soạn** | "Bạn đang nghĩ gì thế?" + icon video/ảnh |
| **Tìm thành viên** | Tìm NV → mở trang cá nhân |
| **Feed bài viết** | Danh sách bài theo thời gian, có cảm xúc + bình luận |
| **Lọc công ty** | Admin hệ thống lọc theo công ty |

## 3. Đăng bài mới

1. Click ô **"Bạn đang nghĩ gì thế?"**
2. Viết **nội dung** bài
3. Đính kèm (tùy chọn):
   - **Ảnh** — tối đa 12 file
   - **Video** — link YouTube/Vimeo
   - **File** — tài liệu đính kèm
4. Chọn **Phạm vi**:
   - **Cả công ty** — mọi người thấy
   - **NV được chọn** — chỉ người được tag
   - **Công ty được chọn** — chỉ công ty cụ thể
5. Chọn thời điểm:
   - **Đăng ngay**
   - **Hẹn giờ** — chọn ngày/giờ tự động đăng
6. Bấm **Đăng**

## 4. Tương tác trên bài viết

- **7 cảm xúc** (Like, Love, Haha, Wow, Sad, Angry, Care) — bấm icon cảm xúc
- **Bình luận** — gõ comment, có thread trả lời
- **Gallery** — xem ảnh/video full màn hình

## 5. Quản lý bài của mình

Menu **⋯** trên bài viết:
- **Sửa** — chỉnh nội dung/ảnh
- **Sao chép liên kết** — chia sẻ URL bài
- **Ẩn với tôi** — không thấy bài này nữa
- **Xóa** — xóa bài (chỉ người đăng/admin)

## 6. Trang cá nhân

- Vào `/social/u/:userId` hoặc click avatar NV
- Xem bài đã đăng, chứng nhận khoá học, thông tin cá nhân

## 7. Thực hành

1. Vào Bảng tin nội bộ
2. Đăng 1 bài test (nội dung ngắn, phạm vi cả công ty)
3. Thả cảm xúc + bình luận trên 1 bài có sẵn
4. Vào trang cá nhân của mình → xem bài vừa đăng
$md$,
  7, ARRAY['huong-dan','bang-tin','social'], true, 17, true, now()
) ON CONFLICT (id) DO UPDATE SET title=EXCLUDED.title, content_md=EXCLUDED.content_md, is_published=true, updated_at=now();

-- HD 18: Cuộc gọi & ghi âm
INSERT INTO knowledge_lessons (id, category_id, title, summary, content_md, duration_minutes, tags, is_required, sort_order, is_published, published_at)
VALUES (
  'b2000003-0000-0000-0000-000000000018',
  'd2000003-0000-0000-0000-000000000001',
  'HD 18: Cuộc gọi & ghi âm — Quản lý recording',
  'Upload/ghi âm web, quét SĐT, gắn Lead/Deal, tạo CRM từ cuộc gọi.',
  $md$# HD 18 — Cuộc gọi & ghi âm

## 1. Đường dẫn

**Menu trái** → **CRM** → **Tổng quan** → **Cuộc gọi & ghi âm**

Hoặc: `/tools/voice-recordings`

## 2. Giao diện chính

| Khu vực | Chức năng |
|---|---|
| **Khối Upload/Ghi** | Chọn file audio / Ghi từ micro web / Dừng & tải lên |
| **Tuỳ chọn upload** | SĐT, hướng gọi (đến/đi), thời gian, ghi chú, ID cuộc gọi |
| **Nút Quét SĐT** | Tự động nhận diện SĐT từ tên file ghi âm |
| **Nút Quét ghép CRM** | Tự động ghép SĐT với KH/Lead/Deal trong hệ thống |
| **Tab danh sách** | Tất cả / Chưa gắn Lead-Deal / Đã gắn |
| **Lọc** | SĐT, theo NV (admin) |

## 3. Upload ghi âm từ web

1. Bấm **Chọn file** → chọn file audio (.mp3, .wav, .m4a…)
2. Điền **SĐT** khách hàng (nếu biết)
3. Chọn **Hướng gọi**: Đến (KH gọi vào) / Đi (mình gọi ra)
4. Thêm **Ghi chú** (tùy chọn)
5. Bấm **Tải lên**

## 4. Ghi âm trực tiếp từ web

1. Bấm **Ghi từ micro**
2. Cho phép trình duyệt truy cập micro
3. Nói chuyện → bấm **Dừng & tải lên**
4. Điền SĐT + ghi chú → Lưu

## 5. Gắn ghi âm với CRM

### Tự động
- Bấm **Quét ghép CRM** → hệ thống tìm SĐT trong file tên/metadata → ghép với KH/Lead/Deal

### Thủ công
1. Trên bản ghi chưa gắn → bấm **Gắn KH/Lead**
2. Modal mở → tìm KH theo SĐT/tên
3. Chọn **Lead** hoặc **Deal** liên kết → **Lưu**

## 6. Tạo CRM mới từ ghi âm

Khi ghi âm có SĐT nhưng chưa có Lead/Deal:
1. Bấm **Tạo CRM từ SĐT**
2. Hệ thống tạo Lead mới với SĐT đó
3. Ghi âm tự động gắn vào Lead vừa tạo

## 7. Nghe lại & quản lý

- Bấm icon **▶** trên bản ghi → nghe audio trong trình duyệt
- **Xóa** — xóa bản ghi (chỉ người upload/admin)

## 8. Đồng bộ từ Mobile

Ghi âm từ app CRM Mobile tự động upload lên server khi có mạng.
Xem tại tab **Tất cả** — lọc theo thiết bị (Android/iOS).

## 9. Thực hành

1. Vào Cuộc gọi & ghi âm
2. Xem tab **Chưa gắn** — có bao nhiêu bản ghi chưa ghép CRM?
3. Thử nghe 1 bản ghi đã gắn Lead/Deal
4. Nếu có file audio test → upload thử + điền SĐT
$md$,
  8, ARRAY['huong-dan','ghi-am','cuoc-goi'], true, 18, true, now()
) ON CONFLICT (id) DO UPDATE SET title=EXCLUDED.title, content_md=EXCLUDED.content_md, is_published=true, updated_at=now();

-- HD 19: CRM Mobile
INSERT INTO knowledge_lessons (id, category_id, title, summary, content_md, duration_minutes, tags, is_required, sort_order, is_published, published_at)
VALUES (
  'b2000003-0000-0000-0000-000000000019',
  'd2000003-0000-0000-0000-000000000001',
  'HD 19: CRM Mobile — Ứng dụng di động',
  'Tab CRM, Ghi âm, Thông báo, Menu: Sự kiện, Chat, Bảng tin, Bán hàng.',
  $md$# HD 19 — CRM Mobile

## 1. Cài đặt & đăng nhập

- Tải app **CRM Mobile** (Android/iOS) từ link nội bộ công ty
- Đăng nhập bằng **tài khoản CRM** (cùng email/mật khẩu web)
- Cho phép **thông báo** và **vị trí** (nếu công ty yêu cầu)

## 2. Thanh tab chính (dưới cùng)

| Tab | Chức năng |
|---|---|
| **CRM** | Danh sách Lead, mở chi tiết Lead |
| **Ghi âm** | Ghi âm cuộc gọi, danh sách ghi âm local & đã upload |
| **Thông báo** | Nhận thông báo Lead mới, nhiệm vụ, sự kiện, chat |
| **Menu** | Các tính năng phụ (xem bên dưới) |

## 3. Tab CRM — Lead trên mobile

1. Mở tab **CRM** → danh sách Lead được giao
2. **Tìm kiếm** theo tên, SĐT
3. **Tap Lead** → mở chi tiết:
   - Xem thông tin KH, giai đoạn, người phụ trách
   - Gọi điện trực tiếp (nút Gọi)
   - Xem/cập nhật nhiệm vụ
   - Ghi chú hoạt động

## 4. Tab Ghi âm

### Ghi âm cuộc gọi
1. Mở tab **Ghi âm**
2. Bấm **Ghi âm** → app tự ghi khi có cuộc gọi (Android)
3. Sau cuộc gọi → file lưu local
4. Khi có **WiFi/4G** → tự upload lên server CRM

### Xem ghi âm
- **Local** — chưa upload (chờ mạng)
- **Đã upload** — đã có trên server, xem tại web hoặc app

## 5. Tab Thông báo

- Lead mới được giao
- Nhiệm vụ sắp đến hạn / quá hạn
- Tin nhắn chat mới
- Sự kiện sắp diễn ra
- Tap thông báo → mở thẳng màn hình liên quan

## 6. Tab Menu — Tính năng phụ

Từ **Menu** (tab cuối), truy cập:

| Mục | Chức năng |
|---|---|
| **Dashboard CRM** | Tổng quan pipeline (webview) |
| **Sự kiện** | Lịch sự kiện nội bộ |
| **Bảng tin** | Mạng xã hội nội bộ |
| **Chat nhóm** | Messenger Hub |
| **Bán hàng** | Báo giá, đơn hàng, hợp đồng |
| **Khách hàng** | Danh sách Customer |
| **Sản phẩm** | Catalog sản phẩm |
| **Facebook inbox** | Tin nhắn Fanpage |
| **Cấu hình pipeline** | Xem cấu hình giai đoạn |
| **Tài khoản** | Đổi mật khẩu, đăng xuất |

## 7. Chat nổi (Floating Chat Bubble)

- Trên Android: bong bóng chat nổi trên mọi app
- Tap bong bóng → mở chat nhanh không cần vào Menu
- Bật/tắt trong **Cài đặt** app

## 8. Đồng bộ & offline

- Dữ liệu Lead cache local — xem được khi mất mạng ngắn
- Ghi âm lưu local → upload khi có mạng
- Thông báo push qua Firebase (cần bật notification)

## 9. Thực hành

1. Mở app CRM Mobile → đăng nhập
2. Vào tab CRM → tìm 1 Lead → mở chi tiết
3. Vào tab Menu → mở **Sự kiện** hoặc **Bảng tin**
4. Kiểm tra tab **Thông báo** — có thông báo mới không?
$md$,
  10, ARRAY['huong-dan','mobile','app'], true, 19, true, now()
) ON CONFLICT (id) DO UPDATE SET title=EXCLUDED.title, content_md=EXCLUDED.content_md, is_published=true, updated_at=now();

-- Di chuyển bài thi cuối HD 12 → HD 20
UPDATE knowledge_lessons SET
  title = 'HD 20 🏆: Bài kiểm tra thao tác CRM toàn bộ phần mềm',
  summary = 'Bài thi tổng hợp HD 1–19: Lead, Deal, Dashboard, Sự kiện, Chat, Bảng tin, Ghi âm, Mobile.',
  content_md = $md$# HD 20 🏆 — Bài kiểm tra thao tác CRM toàn bộ phần mềm

- **25 câu** tình huống thực tế — HD 1–19
- **Đạt 90%**
- **30 phút**, tối đa 2 lần
- Không tra cứu tài liệu trong khi làm bài

Ôn lại toàn bộ HD 1–19 trước khi làm bài.
$md$,
  sort_order = 20
WHERE id = 'b2000003-0000-0000-0000-000000000012';

COMMIT;

-- ══════════════════════════════════════════════════════════════════════════
-- BÀI TẬP PHẦN C
-- ══════════════════════════════════════════════════════════════════════════
BEGIN;

-- Ex 13 Quiz HD13 Dashboard
INSERT INTO knowledge_exercises (id, lesson_id, title, instructions, type, questions, passing_score, max_attempts, sort_order)
VALUES (
  'c2000003-0000-0000-0000-000000000013', 'b2000003-0000-0000-0000-000000000013',
  'Quiz: Dashboard CRM — Pipeline & KPI',
  '7 câu về Dashboard CRM, chế độ xem và thao tác pipeline.',
  'quiz',
  $j${"items":[
    {"id":"q1","question":"Đường dẫn vào Dashboard CRM?","type":"single","options":[
       "Menu CRM → Tổng quan → Dashboard CRM",
       "Menu Kế toán → Hoá đơn",
       "Menu Sản xuất → Dự án",
       "Không có Dashboard"
     ],"correct":[0]},
    {"id":"q2","question":"Tab Lead/Deal trên Dashboard dùng để?","type":"single","options":[
       "Chuyển đổi giữa pipeline Lead và Deal trên cùng 1 màn hình",
       "Xoá Lead hoặc Deal",
       "In báo cáo",
       "Chat nội bộ"
     ],"correct":[0]},
    {"id":"q3","question":"Chế độ xem nào có trên Dashboard? (chọn nhiều)","type":"multiple","options":[
       "Kanban","Danh sách","Deadline","Bình luận","Bản đồ vệ tinh 3D"
     ],"correct":[0,1,2,3]},
    {"id":"q4","question":"Banner cảnh báo màu đỏ trên Dashboard báo hiệu?","type":"single","options":[
       "Lead/Deal quá hạn SLA cần xử lý gấp",
       "Hệ thống đang bảo trì",
       "Có tin nhắn mới",
       "NV nghỉ phép"
     ],"correct":[0]},
    {"id":"q5","question":"Tạo Lead nhanh từ Dashboard?","type":"single","options":[
       "Bấm + Thêm Lead → điền form → Lưu → thẻ xuất hiện Kanban",
       "Phải vào Bảng Lead riêng",
       "Không thể tạo từ Dashboard",
       "Gọi admin"
     ],"correct":[0]},
    {"id":"q6","question":"Bộ lọc nâng cao trên Dashboard lọc được theo? (chọn nhiều)","type":"multiple","options":[
       "Công ty","Khu vực","NV phụ trách","Giai đoạn pipeline","Màu theme"
     ],"correct":[0,1,2,3]},
    {"id":"q7","question":"Chế độ Deadline trên Dashboard giúp?","type":"single","options":[
       "Nhóm Lead/Deal theo mốc hạn — ưu tiên xử lý trễ SLA",
       "In hoá đơn","Chat","Xoá quá hạn tự động"
     ],"correct":[0]}
  ]}$j$::jsonb, 80, 2, 1
) ON CONFLICT (id) DO UPDATE SET title=EXCLUDED.title, instructions=EXCLUDED.instructions, questions=EXCLUDED.questions, passing_score=EXCLUDED.passing_score, max_attempts=EXCLUDED.max_attempts, updated_at=now();

-- Ex 14 Quiz HD14 Sự kiện
INSERT INTO knowledge_exercises (id, lesson_id, title, instructions, type, questions, passing_score, max_attempts, sort_order)
VALUES (
  'c2000003-0000-0000-0000-000000000014', 'b2000003-0000-0000-0000-000000000014',
  'Quiz: Sự kiện — Lịch & RSVP',
  '6 câu về tạo sự kiện, RSVP và quản lý.',
  'quiz',
  $j${"items":[
    {"id":"q1","question":"Đường dẫn vào Sự kiện?","type":"single","options":[
       "CRM → Tổng quan → Sự kiện","CRM → Lead","Sản xuất","Không có"
     ],"correct":[0]},
    {"id":"q2","question":"Tạo sự kiện cần điền tối thiểu? (chọn nhiều)","type":"multiple","options":[
       "Tiêu đề","Loại sự kiện","Ngày/giờ bắt đầu","Mã số thuế KH"
     ],"correct":[0,1,2]},
    {"id":"q3","question":"RSVP trên sự kiện gồm?","type":"single","options":[
       "Tham gia / Từ chối (+ ghi lý do nếu cần)",
       "Chỉ Like","Chỉ bình luận","Không có RSVP"
     ],"correct":[0]},
    {"id":"q4","question":"Lọc khối sự kiện (admin) gồm? (chọn nhiều)","type":"multiple","options":[
       "Kinh doanh","Sản xuất","Vận chuyển","Chung"
     ],"correct":[0,1,2,3]},
    {"id":"q5","question":"Người tạo sự kiện có thể? (chọn nhiều)","type":"multiple","options":[
       "Sửa thông tin","Hủy sự kiện","Xóa vĩnh viễn","Tự động ký HĐ cho KH"
     ],"correct":[0,1,2]},
    {"id":"q6","question":"Xem sự kiện trên lịch tháng — click ngày sẽ?","type":"single","options":[
       "Xem chi tiết sự kiện trong ngày đó",
       "Tạo Lead mới","Xoá sự kiện","Không làm gì"
     ],"correct":[0]}
  ]}$j$::jsonb, 80, 2, 1
) ON CONFLICT (id) DO UPDATE SET title=EXCLUDED.title, instructions=EXCLUDED.instructions, questions=EXCLUDED.questions, passing_score=EXCLUDED.passing_score, max_attempts=EXCLUDED.max_attempts, updated_at=now();

-- Ex 15 Quiz HD15 Nhóm chat
INSERT INTO knowledge_exercises (id, lesson_id, title, instructions, type, questions, passing_score, max_attempts, sort_order)
VALUES (
  'c2000003-0000-0000-0000-000000000015', 'b2000003-0000-0000-0000-000000000015',
  'Quiz: Nhóm chat — Messenger Hub',
  '7 câu về chat 1-1, nhóm, ghim và quản lý thành viên.',
  'quiz',
  $j${"items":[
    {"id":"q1","question":"Đường dẫn vào Nhóm chat?","type":"single","options":[
       "CRM → Tổng quan → Nhóm chat","CRM → Lead","Kế toán","Không có"
     ],"correct":[0]},
    {"id":"q2","question":"Giao diện Messenger Hub có mấy cột?","type":"single","options":[
       "3 cột: danh sách hội thoại | khung chat | panel thông tin",
       "1 cột","2 cột","4 cột"
     ],"correct":[0]},
    {"id":"q3","question":"Tạo nhóm chat cần? (chọn nhiều)","type":"multiple","options":[
       "Đặt tên nhóm","Chọn thành viên","Chọn công ty (nếu nhiều công ty)","Mã Lead"
     ],"correct":[0,1,2]},
    {"id":"q4","question":"Ghim hội thoại quan trọng?","type":"single","options":[
       "Bấm icon ghim → chuyển sang tab Ưu tiên",
       "Xoá hội thoại","Chuyển sang Lead","Không có chức năng ghim"
     ],"correct":[0]},
    {"id":"q5","question":"Chấm xanh trên danh sách chat nghĩa là?","type":"single","options":[
       "NV đang hoạt động (ping trong ~2 phút)",
       "NV nghỉ phép","Có tin nhắn mới","Lỗi hệ thống"
     ],"correct":[0]},
    {"id":"q6","question":"Admin nhóm có thể? (chọn nhiều)","type":"multiple","options":[
       "Thêm NV vào nhóm","Xóa NV khỏi nhóm","Đổi vai trò thành viên","Xoá toàn bộ Lead"
     ],"correct":[0,1,2]},
    {"id":"q7","question":"Bong bóng chat nổi (MessengerDock) có thể mở từ?","type":"single","options":[
       "Bất kỳ trang nào trong app — không chỉ trang Nhóm chat",
       "Chỉ trang Nhóm chat","Chỉ Dashboard","Không có"
     ],"correct":[0]}
  ]}$j$::jsonb, 80, 2, 1
) ON CONFLICT (id) DO UPDATE SET title=EXCLUDED.title, instructions=EXCLUDED.instructions, questions=EXCLUDED.questions, passing_score=EXCLUDED.passing_score, max_attempts=EXCLUDED.max_attempts, updated_at=now();

-- Ex 16 Quiz HD16 Đang hoạt động
INSERT INTO knowledge_exercises (id, lesson_id, title, instructions, type, questions, passing_score, max_attempts, sort_order)
VALUES (
  'c2000003-0000-0000-0000-000000000016', 'b2000003-0000-0000-0000-000000000016',
  'Quiz: Đang hoạt động — Online & bản đồ',
  '6 câu về giám sát online, bản đồ vị trí và lịch sử đăng nhập.',
  'quiz',
  $j${"items":[
    {"id":"q1","question":"Đường dẫn vào Đang hoạt động?","type":"single","options":[
       "CRM → Tổng quan → Đang hoạt động","CRM → Lead","Sản xuất","Không có"
     ],"correct":[0]},
    {"id":"q2","question":"NV được coi 'đang hoạt động' khi?","type":"single","options":[
       "Có ping trong khoảng ~2 phút gần nhất",
       "Đăng nhập trong ngày","Có Lead mới","Mở email"
     ],"correct":[0]},
    {"id":"q3","question":"Tab trên trang Đang hoạt động? (chọn nhiều)","type":"multiple","options":[
       "Đang hoạt động","Tất cả","Offline","Lịch sử đăng nhập"
     ],"correct":[0,1,2,3]},
    {"id":"q4","question":"Bản đồ vị trí NV hiển thị khi?","type":"single","options":[
       "NV dùng app mobile và cho phép truy cập vị trí",
       "Luôn hiển thị mọi NV","Chỉ admin","Không bao giờ"
     ],"correct":[0]},
    {"id":"q5","question":"Nút Nhắn tin trên danh sách NV đang online?","type":"single","options":[
       "Mở chat trực tiếp với người đó (MessengerDock)",
       "Gọi điện","Tạo Lead","Xoá tài khoản"
     ],"correct":[0]},
    {"id":"q6","question":"Tab Lịch sử đăng nhập dùng để?","type":"single","options":[
       "Tra cứu phiên đăng nhập/đăng xuất của NV theo thời gian",
       "Tạo Lead","In hoá đơn","Chat nhóm"
     ],"correct":[0]}
  ]}$j$::jsonb, 80, 2, 1
) ON CONFLICT (id) DO UPDATE SET title=EXCLUDED.title, instructions=EXCLUDED.instructions, questions=EXCLUDED.questions, passing_score=EXCLUDED.passing_score, max_attempts=EXCLUDED.max_attempts, updated_at=now();

-- Ex 17 Quiz HD17 Bảng tin
INSERT INTO knowledge_exercises (id, lesson_id, title, instructions, type, questions, passing_score, max_attempts, sort_order)
VALUES (
  'c2000003-0000-0000-0000-000000000017', 'b2000003-0000-0000-0000-000000000017',
  'Quiz: Bảng tin nội bộ — Đăng bài & tương tác',
  '7 câu về đăng bài, phạm vi, cảm xúc và quản lý bài viết.',
  'quiz',
  $j${"items":[
    {"id":"q1","question":"Đường dẫn vào Bảng tin nội bộ?","type":"single","options":[
       "CRM → Tổng quan → Bảng tin nội bộ","CRM → Lead","Kế toán","Không có"
     ],"correct":[0]},
    {"id":"q2","question":"Đăng bài có thể đính kèm? (chọn nhiều)","type":"multiple","options":[
       "Ảnh (tối đa 12)","Video YouTube/Vimeo","File tài liệu","Mã Lead"
     ],"correct":[0,1,2]},
    {"id":"q3","question":"Phạm vi bài viết có thể là? (chọn nhiều)","type":"multiple","options":[
       "Cả công ty","NV được chọn","Công ty được chọn","Chỉ admin"
     ],"correct":[0,1,2]},
    {"id":"q4","question":"Hẹn giờ đăng bài cho phép?","type":"single","options":[
       "Chọn ngày/giờ tự động đăng trong tương lai",
       "Chỉ đăng ngay","Không có hẹn giờ","Admin đăng thay"
     ],"correct":[0]},
    {"id":"q5","question":"Tương tác trên bài viết gồm? (chọn nhiều)","type":"multiple","options":[
       "7 cảm xúc (Like, Love, Haha…)","Bình luận có thread","Gallery ảnh/video","Kéo thẻ Kanban"
     ],"correct":[0,1,2]},
    {"id":"q6","question":"Menu ⋯ trên bài của mình có thể? (chọn nhiều)","type":"multiple","options":[
       "Sửa","Sao chép liên kết","Ẩn với tôi","Xóa","Tạo Lead"
     ],"correct":[0,1,2,3]},
    {"id":"q7","question":"Trang cá nhân NV truy cập qua?","type":"single","options":[
       "/social/u/:userId hoặc click avatar NV",
       "CRM → Lead","Tab Kế toán","Không có trang cá nhân"
     ],"correct":[0]}
  ]}$j$::jsonb, 80, 2, 1
) ON CONFLICT (id) DO UPDATE SET title=EXCLUDED.title, instructions=EXCLUDED.instructions, questions=EXCLUDED.questions, passing_score=EXCLUDED.passing_score, max_attempts=EXCLUDED.max_attempts, updated_at=now();

-- Ex 18 Quiz HD18 Ghi âm
INSERT INTO knowledge_exercises (id, lesson_id, title, instructions, type, questions, passing_score, max_attempts, sort_order)
VALUES (
  'c2000003-0000-0000-0000-000000000018', 'b2000003-0000-0000-0000-000000000018',
  'Quiz: Cuộc gọi & ghi âm — Upload & ghép CRM',
  '7 câu về upload, ghi âm web, quét SĐT và gắn Lead/Deal.',
  'quiz',
  $j${"items":[
    {"id":"q1","question":"Đường dẫn vào Cuộc gọi & ghi âm?","type":"single","options":[
       "CRM → Tổng quan → Cuộc gọi & ghi âm","CRM → Lead","Sản xuất","Không có"
     ],"correct":[0]},
    {"id":"q2","question":"Upload ghi âm từ web cần? (chọn nhiều)","type":"multiple","options":[
       "Chọn file audio","Điền SĐT (nếu biết)","Chọn hướng gọi (đến/đi)","Mã Deal bắt buộc"
     ],"correct":[0,1,2]},
    {"id":"q3","question":"Nút Quét ghép CRM làm gì?","type":"single","options":[
       "Tự động tìm SĐT trong file → ghép với KH/Lead/Deal trong hệ thống",
       "Xoá file","In báo cáo","Tạo nhóm chat"
     ],"correct":[0]},
    {"id":"q4","question":"Ghi âm chưa gắn Lead/Deal — gắn thủ công?","type":"single","options":[
       "Bấm Gắn KH/Lead → tìm KH → chọn Lead/Deal → Lưu",
       "Không thể gắn thủ công","Tự gắn sau 24h","Gọi admin"
     ],"correct":[0]},
    {"id":"q5","question":"Tạo CRM mới từ ghi âm có SĐT chưa có Lead?","type":"single","options":[
       "Bấm Tạo CRM từ SĐT → hệ thống tạo Lead mới + gắn ghi âm",
       "Không thể","Phải tạo thủ công trên Bảng Lead","Xoá ghi âm"
     ],"correct":[0]},
    {"id":"q6","question":"Tab danh sách ghi âm gồm? (chọn nhiều)","type":"multiple","options":[
       "Tất cả","Chưa gắn Lead/Deal","Đã gắn","Đã xoá"
     ],"correct":[0,1,2]},
    {"id":"q7","question":"Ghi âm từ app CRM Mobile?","type":"single","options":[
       "Tự upload lên server khi có mạng — xem được trên web và app",
       "Chỉ lưu trên điện thoại","Không đồng bộ","Phải copy thủ công"
     ],"correct":[0]}
  ]}$j$::jsonb, 80, 2, 1
) ON CONFLICT (id) DO UPDATE SET title=EXCLUDED.title, instructions=EXCLUDED.instructions, questions=EXCLUDED.questions, passing_score=EXCLUDED.passing_score, max_attempts=EXCLUDED.max_attempts, updated_at=now();

-- Ex 19 Quiz HD19 CRM Mobile
INSERT INTO knowledge_exercises (id, lesson_id, title, instructions, type, questions, passing_score, max_attempts, sort_order)
VALUES (
  'c2000003-0000-0000-0000-000000000019', 'b2000003-0000-0000-0000-000000000019',
  'Quiz: CRM Mobile — App di động',
  '7 câu về tab CRM, Ghi âm, Thông báo, Menu trên mobile.',
  'quiz',
  $j${"items":[
    {"id":"q1","question":"4 tab chính dưới cùng app CRM Mobile? (chọn nhiều)","type":"multiple","options":[
       "CRM","Ghi âm","Thông báo","Menu","Kế toán"
     ],"correct":[0,1,2,3]},
    {"id":"q2","question":"Tab CRM trên mobile cho phép?","type":"single","options":[
       "Xem danh sách Lead, mở chi tiết, gọi điện, ghi chú",
       "Chỉ xem không sửa","Chỉ admin","Không có tab CRM"
     ],"correct":[0]},
    {"id":"q3","question":"Ghi âm cuộc gọi trên Android app?","type":"single","options":[
       "App tự ghi khi có cuộc gọi → lưu local → upload khi có mạng",
       "Phải ghi thủ công trên web","Không ghi được","Chỉ ghi video"
     ],"correct":[0]},
    {"id":"q4","question":"Tab Menu trên mobile truy cập được? (chọn nhiều)","type":"multiple","options":[
       "Sự kiện","Bảng tin","Chat nhóm","Bán hàng (BG/đơn/HĐ)","Pipeline Lead"
     ],"correct":[0,1,2,3]},
    {"id":"q5","question":"Tab Thông báo trên mobile nhận? (chọn nhiều)","type":"multiple","options":[
       "Lead mới được giao","Nhiệm vụ sắp/trễ hạn","Tin nhắn chat","Sự kiện sắp diễn ra"
     ],"correct":[0,1,2,3]},
    {"id":"q6","question":"Floating Chat Bubble trên Android?","type":"single","options":[
       "Bong bóng chat nổi trên mọi app — tap mở chat nhanh",
       "Chỉ trong app CRM","Không có","Chỉ iOS"
     ],"correct":[0]},
    {"id":"q7","question":"Dữ liệu Lead trên mobile khi mất mạng ngắn?","type":"single","options":[
       "Cache local — vẫn xem được Lead đã tải",
       "Mất hết","Chỉ admin xem","App crash"
     ],"correct":[0]}
  ]}$j$::jsonb, 80, 2, 1
) ON CONFLICT (id) DO UPDATE SET title=EXCLUDED.title, instructions=EXCLUDED.instructions, questions=EXCLUDED.questions, passing_score=EXCLUDED.passing_score, max_attempts=EXCLUDED.max_attempts, updated_at=now();

-- Ex 20 FINAL EXAM (cập nhật từ Ex 12 cũ — mở rộng 25 câu)
INSERT INTO knowledge_exercises (id, lesson_id, title, instructions, type, questions, passing_score, max_attempts, time_limit_minutes, sort_order)
VALUES (
  'c2000003-0000-0000-0000-000000000012', 'b2000003-0000-0000-0000-000000000012',
  '🏆 Bài thi thao tác CRM toàn bộ phần mềm',
  '25 câu tình huống tổng hợp HD 1–19. Đạt 90%. 30 phút. Tối đa 2 lần.',
  'quiz',
  $j${"items":[
    {"id":"q1","question":"Vào Bảng Lead?","type":"single","options":["CRM → Bảng Lead","Sản xuất","Kế toán","Không có"],"correct":[0]},
    {"id":"q2","question":"Tạo Lead, bước BẮT BUỘC trước Lưu?","type":"single","options":["Quét trùng SĐT","Xoá CRM","Đổi pass","Tắt app"],"correct":[0]},
    {"id":"q3","question":"Hoàn thành NV Lead đúng KPI?","type":"single","options":["Ghi chú + file nếu yêu cầu","Chỉ tick","Không log","Xoá Lead"],"correct":[0]},
    {"id":"q4","question":"Chuyển Lead→Deal? (chọn nhiều)","type":"multiple","options":["Kéo Kanban Chuyển Deal","Nút header","Tự khi tạo","Email"],"correct":[0,1]},
    {"id":"q5","question":"Sau chuyển Deal, Lead còn trên Bảng Lead?","type":"single","options":["Không","Có","Chỉ admin","2 bản"],"correct":[0]},
    {"id":"q6","question":"Vào Bảng Deal?","type":"single","options":["CRM → Bảng Deal","Lead only","Không có","Tab KPI"],"correct":[0]},
    {"id":"q7","question":"Kéo Deal Thắng?","type":"single","options":["Modal tạo dự án","Tự xoá","Chuyển Lead","Khoá"],"correct":[0]},
    {"id":"q8","question":"Upload HĐ Deal?","type":"single","options":["Tab Tài liệu — loại Hợp đồng","Chat only","Không upload","Header"],"correct":[0]},
    {"id":"q9","question":"Gate chặn kéo Deal?","type":"single","options":["Thiếu file hoặc NV bắt buộc chưa xong","Màu thẻ","Ngày lẻ","Wifi"],"correct":[0]},
    {"id":"q10","question":"Dashboard CRM — chế độ xem? (chọn nhiều)","type":"multiple","options":["Kanban","Danh sách","Deadline","Bình luận","Bản đồ 3D"],"correct":[0,1,2,3]},
    {"id":"q11","question":"Tạo sự kiện cần? (chọn nhiều)","type":"multiple","options":["Tiêu đề","Loại","Ngày/giờ","Mã Lead"],"correct":[0,1,2]},
    {"id":"q12","question":"Messenger Hub có mấy cột?","type":"single","options":["3 cột","1 cột","2 cột","4 cột"],"correct":[0]},
    {"id":"q13","question":"NV 'đang hoạt động' khi?","type":"single","options":["Ping trong ~2 phút","Đăng nhập trong ngày","Có Lead","Mở email"],"correct":[0]},
    {"id":"q14","question":"Đăng bài Bảng tin — phạm vi? (chọn nhiều)","type":"multiple","options":["Cả công ty","NV được chọn","Công ty được chọn","Chỉ admin"],"correct":[0,1,2]},
    {"id":"q15","question":"Ghi âm chưa gắn CRM — gắn thủ công?","type":"single","options":["Gắn KH/Lead → chọn Lead/Deal","Không thể","Tự gắn","Gọi admin"],"correct":[0]},
    {"id":"q16","question":"App Mobile — tab chính? (chọn nhiều)","type":"multiple","options":["CRM","Ghi âm","Thông báo","Menu","Kế toán"],"correct":[0,1,2,3]},
    {"id":"q17","question":"Ghi âm Android tự upload khi?","type":"single","options":["Có mạng WiFi/4G","Ngay lập tức","Không upload","Chỉ admin"],"correct":[0]},
    {"id":"q18","question":"Deal Thua cần?","type":"single","options":["Lý do + ghi chú","Xoá vĩnh viễn","Ẩn","Lead auto"],"correct":[0]},
    {"id":"q19","question":"Giảm giá vượt mức tự duyệt?","type":"single","options":["Tab Phê duyệt → chờ duyệt","Hứa KH trước","Tự duyệt","Không cần"],"correct":[0]},
    {"id":"q20","question":"Bàn giao SX?","type":"single","options":["Nút xác nhận + ngày công trình/SX","Tự xoá Deal","Chỉ admin","Không có"],"correct":[0]},
    {"id":"q21","question":"Bong bóng chat nổi mở từ?","type":"single","options":["Mọi trang trong app","Chỉ Nhóm chat","Chỉ Dashboard","Không có"],"correct":[0]},
    {"id":"q22","question":"Pipeline 6 giai đoạn trong khoá?","type":"single","options":["Mẫu/tượng trưng — công ty cấu hình riêng","Bắt buộc 6 cột","NV tự đặt","Không liên quan"],"correct":[0]},
    {"id":"q23","question":"Hoàn tác chuyển Deal→Lead?","type":"single","options":["Không có — quyết định một chiều","Có 1 click","Cuối tuần","Admin F5"],"correct":[0]},
    {"id":"q24","question":"Tab Điểm Deal?","type":"single","options":["Chấm chéo + sao KH","Chỉ chat","Xoá Deal","In HĐ"],"correct":[0]},
    {"id":"q25","question":"Để nhận chứng nhận khoá CRM?","type":"single","options":["Pass bài thi + pass TẤT CẢ bài tập","Chỉ pass bài thi","Chỉ hoàn thành bài học","Admin cấp thủ công"],"correct":[0]}
  ]}$j$::jsonb,
  90, 2, 30, 1
) ON CONFLICT (id) DO UPDATE SET
  title=EXCLUDED.title, instructions=EXCLUDED.instructions, questions=EXCLUDED.questions,
  passing_score=EXCLUDED.passing_score, max_attempts=EXCLUDED.max_attempts,
  time_limit_minutes=EXCLUDED.time_limit_minutes, updated_at=now();

COMMIT;

-- Kiểm tra:
-- SELECT sort_order, title FROM knowledge_lessons WHERE category_id='d2000003-0000-0000-0000-000000000001' ORDER BY sort_order;
-- SELECT COUNT(*) FROM knowledge_exercises WHERE lesson_id IN (SELECT id FROM knowledge_lessons WHERE category_id='d2000003-0000-0000-0000-000000000001');
