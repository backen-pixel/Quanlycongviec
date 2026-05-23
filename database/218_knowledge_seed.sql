-- 218_knowledge_seed.sql
-- Dữ liệu mẫu module Kiến thức: 4 danh mục, 8 bài học, đủ 3 loại bài tập.
-- Idempotent: dùng UUID cố định + ON CONFLICT DO NOTHING.

BEGIN;

-- ─── DANH MỤC ──────────────────────────────────────────────────────────────
INSERT INTO knowledge_categories (id, name, slug, icon, description, sort_order, is_active) VALUES
  ('a0000001-0000-0000-0000-000000000001', '🚀 Khởi đầu',     'khoi-dau',  '🚀', 'Làm quen hệ thống và các thao tác cơ bản.', 1, true),
  ('a0000001-0000-0000-0000-000000000002', '💼 CRM cơ bản',    'crm-co-ban','💼', 'Lead, Deal, Báo giá, Quản lý khách hàng.', 2, true),
  ('a0000001-0000-0000-0000-000000000003', '📊 KPI & Báo cáo', 'kpi-bao-cao','📊', 'Hiểu KPI, đọc dashboard và báo cáo.',     3, true),
  ('a0000001-0000-0000-0000-000000000004', '🏭 Sản xuất',      'san-xuat',  '🏭', 'Pipeline xưởng, bàn giao CRM → SX.',       4, true)
ON CONFLICT (id) DO NOTHING;

-- ─── BÀI HỌC ───────────────────────────────────────────────────────────────
-- 1. Khởi đầu — Làm quen giao diện
INSERT INTO knowledge_lessons (id, category_id, title, summary, content_md, video_url, video_type, duration_minutes, sort_order, is_published, published_at) VALUES
('b0000001-0000-0000-0000-000000000001',
 'a0000001-0000-0000-0000-000000000001',
 'Làm quen giao diện hệ thống',
 'Tổng quan sidebar, app switcher và các module chính.',
 E'# Tổng quan giao diện\n\nKhi đăng nhập thành công, bạn sẽ thấy 3 vùng chính:\n\n## 1. Sidebar bên trái\n\nChứa toàn bộ menu chức năng, chia theo nhóm:\n- **Tổng quan**: Dashboard, Việc của tôi\n- **Không gian làm việc**: Dự án, Khách hàng, Sản phẩm\n- **Hệ thống**: Cơ cấu công ty, Nhân viên\n- **Cài đặt**: Phân quyền, Quy trình\n\n## 2. App Switcher (icon lưới)\n\nGóc trên cùng bên trái có icon `⊞` để chuyển nhanh giữa các module:\n- 📋 Công việc — Quản lý dự án & nhiệm vụ\n- 💼 CRM — Quản lý khách hàng & bán hàng\n- 🏭 Xưởng SX — Quản lý sản xuất\n- 🚚 Vận chuyển & Lắp đặt\n- 🎓 Kiến thức\n\n## 3. Khu vực nội dung\n\nHiển thị trang đang xem. Mỗi trang có thanh tiêu đề + nút thao tác chính ở góc phải.\n\n---\n\n> **Mẹo**: Bấm vào icon **Pin** trên app switcher để ghim module hay dùng — lần sau đăng nhập sẽ vào thẳng module đó.',
 NULL, NULL, 5, 1, true, now()),

('b0000001-0000-0000-0000-000000000002',
 'a0000001-0000-0000-0000-000000000001',
 'Đổi mật khẩu và bảo mật tài khoản',
 'Hướng dẫn đổi mật khẩu, quản lý thiết bị đăng nhập.',
 E'# Bảo mật tài khoản\n\n## Đổi mật khẩu\n\n1. Vào **Cài đặt → Đổi mật khẩu**\n2. Nhập **mật khẩu hiện tại**\n3. Nhập mật khẩu mới (tối thiểu 8 ký tự)\n4. Xác nhận lại và bấm **Lưu**\n\n## Quy tắc mật khẩu mạnh\n\n- Ít nhất **8 ký tự**\n- Có **chữ hoa**, **chữ thường**, **số**\n- Không trùng tên đăng nhập\n- Đổi định kỳ **3 tháng/lần**\n\n## Quản lý thiết bị\n\nVào **Cài đặt → Thiết bị đăng nhập** để xem danh sách thiết bị đang dùng tài khoản của bạn.\n\nNếu thấy thiết bị lạ → bấm **Đăng xuất** ngay lập tức và đổi mật khẩu.\n\n---\n\n**Cảnh báo**: Không bao giờ chia sẻ mật khẩu qua chat, email hay tin nhắn.',
 NULL, NULL, 3, 2, true, now()),

-- 2. CRM cơ bản
('b0000001-0000-0000-0000-000000000003',
 'a0000001-0000-0000-0000-000000000002',
 'Tạo Lead mới trong CRM',
 'Cách tiếp nhận khách hàng tiềm năng và lưu vào CRM.',
 E'# Tạo Lead mới\n\n**Lead** là khách hàng tiềm năng — người đã liên hệ nhưng chưa cam kết mua.\n\n## Các bước tạo Lead\n\n1. Vào **CRM → Dashboard**\n2. Bấm nút **+ Thêm Lead** (góc trên phải)\n3. Điền thông tin:\n   - **Tiêu đề**: vd "Tủ bếp chữ L - Anh Minh"\n   - **Khách hàng**: chọn KH có sẵn hoặc tạo mới\n   - **Giá trị ước tính**: 150.000.000\n   - **Nguồn**: Zalo / Facebook / Website / Giới thiệu\n   - **Mức ưu tiên**: Cao / Trung bình / Thấp\n4. Bấm **Lưu**\n\nLead mới sẽ xuất hiện ở cột đầu tiên trên Kanban.\n\n## Các giai đoạn Lead\n\n```\nMới → Liên hệ → Khảo sát → Đề xuất → Chuyển Deal\n```\n\nDi chuyển Lead bằng cách **kéo thả** card trên Kanban, hoặc bấm vào pipeline trong trang chi tiết.\n\n## Ghi hoạt động\n\nTrong trang chi tiết Lead, vào tab **Hoạt động** để ghi lại:\n- Cuộc gọi (kết quả, thời lượng)\n- Gặp mặt khảo sát\n- Email, Zalo trao đổi\n\nMỗi hoạt động giúp đồng đội nắm được tình hình khi cần tiếp nhận.',
 NULL, NULL, 8, 1, true, now()),

('b0000001-0000-0000-0000-000000000004',
 'a0000001-0000-0000-0000-000000000002',
 'Chuyển Lead → Deal',
 'Khi nào và bằng cách nào chuyển Lead thành Deal chính thức.',
 E'# Chuyển Lead → Deal\n\n## Khi nào nên chuyển?\n\nChuyển Lead thành Deal khi khách hàng:\n- Đã có **nhu cầu rõ ràng**\n- Sẵn sàng **báo giá chi tiết**\n- Đã có **số đo / bản vẽ** cơ bản\n\n## Các bước\n\n1. Mở chi tiết Lead\n2. Bấm nút **⚡ Chuyển Deal** (xanh lá, góc trên phải)\n3. Hệ thống kiểm tra: KH phải có **tên** + **số điện thoại**\n4. Bấm **🚀 Chuyển sang Deal** → Xác nhận\n\n## Kết quả sau chuyển\n\n- Lead biến thành Deal (badge **🎯 DEAL**)\n- Chuyển sang **pipeline Deal**\n- **Giữ lại** tất cả tài liệu, hoạt động, lịch sử\n\n## Pipeline Deal\n\n```\nTư vấn → Thiết kế → Báo giá → Hợp đồng → Thắng ✅ / Thua ❌\n```\n\nKhi chuyển giai đoạn → hệ thống **tự tạo công việc** phù hợp.\n\n> **Cảnh báo**: Chuyển đổi là **một chiều** — không quay lại Lead được. Hãy chắc chắn KH thực sự sẵn sàng.',
 NULL, NULL, 6, 2, true, now()),

('b0000001-0000-0000-0000-000000000005',
 'a0000001-0000-0000-0000-000000000002',
 'Tạo Báo giá chuyên nghiệp',
 'Lập báo giá, tìm sản phẩm, xuất PDF gửi khách.',
 E'# Tạo Báo giá\n\n## Hai cách mở form báo giá\n\n**Cách 1 — Từ Lead/Deal**: trong trang chi tiết → bấm **📄 Báo giá** → form tự điền thông tin KH.\n\n**Cách 2 — Trực tiếp**: menu **CRM → Báo giá** → bấm **+ Tạo báo giá**.\n\n## Thêm sản phẩm vào báo giá\n\n1. Bấm **+ Thêm sản phẩm**\n2. Tìm sản phẩm theo tên hoặc mã\n3. Điều chỉnh: số lượng, đơn giá, chiết khấu\n4. Hệ thống tự tính: Thành tiền, Tổng, VAT\n\n## Các trường quan trọng\n\n- **Hiệu lực đến**: ngày hết hạn báo giá\n- **Điều khoản thanh toán**: vd "50% trước, 50% khi giao hàng"\n- **Ghi chú nội bộ**: chỉ team nội bộ thấy\n- **Ghi chú gửi KH**: in trên PDF\n\n## Xuất PDF\n\nBấm **📄 Xuất PDF** → file tải về có:\n- Logo công ty\n- Thông tin KH\n- Bảng sản phẩm chi tiết\n- Tổng tiền + VAT\n- Điều khoản, chữ ký\n\nGửi file PDF qua email/Zalo cho khách.',
 NULL, NULL, 10, 3, true, now()),

-- 3. KPI & Báo cáo
('b0000001-0000-0000-0000-000000000006',
 'a0000001-0000-0000-0000-000000000003',
 'Hiểu về KPI Sales',
 'KPI là gì, các chỉ số chính và cách hệ thống tính điểm.',
 E'# KPI Sales\n\n## KPI là gì?\n\n**KPI** (Key Performance Indicator) — chỉ số đo lường hiệu quả công việc.\n\nVới sales, KPI giúp:\n- Đo được **năng suất** của từng nhân viên\n- So sánh **công bằng** giữa team\n- Tự động tính **thưởng/phạt**\n\n## Các nhóm KPI chính\n\n### Nhóm A — Số liệu khách hàng\n- Số Lead mới/tháng\n- Số cuộc gọi/ngày\n- Tỉ lệ Lead → Deal\n\n### Nhóm B — Số liệu doanh số\n- Doanh số chốt deal (VND)\n- Số đơn hàng hoàn thành\n- Trung bình giá trị/deal\n\n### Nhóm C — Chất lượng\n- Điểm hài lòng KH\n- Tỉ lệ deal bị hủy\n- Thời gian phản hồi\n\n## Hệ thống tính điểm\n\nMỗi KPI có **trọng số** (tổng = 100%).\n\nĐiểm cuối tháng = Σ (điểm KPI × trọng số)\n\nVD: Doanh số 80% × trọng số 40% = 32 điểm\n\n## Xem KPI cá nhân\n\nVào **CRM → KPI → Scorecard tháng** để xem:\n- Bảng điểm chi tiết\n- So sánh với tháng trước\n- Mục tiêu vs thực tế',
 NULL, NULL, 12, 1, true, now()),

('b0000001-0000-0000-0000-000000000007',
 'a0000001-0000-0000-0000-000000000003',
 'Đọc Dashboard CRM',
 'Các widget trên dashboard và ý nghĩa của từng chỉ số.',
 E'# Dashboard CRM\n\n## Vùng KPI tổng quan (trên cùng)\n\n4 thẻ lớn:\n- **🆕 Lead mới**: số Lead trong khoảng thời gian\n- **🎯 Deal đang chạy**: deal chưa đóng\n- **💰 Doanh số dự kiến**: tổng giá trị deal đang mở\n- **✅ Tỉ lệ chốt**: % deal chuyển sang trạng thái Thắng\n\n## Kanban board (giữa)\n\nHiển thị tất cả Lead/Deal theo cột pipeline.\n\n**Thao tác**:\n- Kéo thả card sang cột khác → đổi giai đoạn\n- Bấm vào card → mở chi tiết\n- Bộ lọc bên trái: theo nhân viên, nguồn, ưu tiên\n\n## Hoạt động gần đây (dưới)\n\n- Liệt kê 20 hoạt động mới nhất\n- Bao gồm: tạo Lead, chuyển giai đoạn, ghi chú, gọi điện\n- Click vào để mở Lead/Deal liên quan\n\n## Bộ lọc thời gian\n\nGóc trên phải có dropdown:\n- Hôm nay / Tuần này / Tháng này / Quý / Năm\n- Tùy chỉnh khoảng thời gian',
 NULL, NULL, 7, 2, true, now()),

-- 4. Sản xuất
('b0000001-0000-0000-0000-000000000008',
 'a0000001-0000-0000-0000-000000000004',
 'Bàn giao Deal → Sản xuất',
 'Quy trình chuyển deal đã thắng sang xưởng để bắt đầu sản xuất.',
 E'# Bàn giao Deal → Xưởng\n\n## Khi nào bàn giao?\n\nKhi Deal đã:\n- Trạng thái **Thắng** ✅\n- Hợp đồng đã ký\n- Khách đã đặt cọc\n\n## Bước 1: Kiểm tra hồ sơ\n\nDeal phải có đủ:\n- ✅ Bản vẽ kỹ thuật (2D/3D)\n- ✅ Bảng vật tư (BOM)\n- ✅ Lịch giao hàng đã thống nhất\n- ✅ Ghi chú đặc biệt (nếu có)\n\n## Bước 2: Bấm "Bàn giao SX"\n\nTrong chi tiết Deal → nút **🏭 Bàn giao SX** (cam, góc trên).\n\nForm bàn giao yêu cầu:\n- **Ngày khởi công dự kiến**\n- **Ngày hoàn thành dự kiến**\n- **Đội phụ trách**: chọn từ danh sách team xưởng\n- **Mức ưu tiên**: Cao / Bình thường / Thấp\n\n## Bước 3: Theo dõi\n\nDeal sau bàn giao xuất hiện trong:\n- **Xưởng SX → Dashboard** (kanban riêng)\n- **CRM → Deal**: vẫn còn, nhưng trạng thái "Đã bàn giao SX"\n\nMọi cập nhật bên SX (tiến độ, ảnh) sẽ **đồng bộ về CRM** để sales theo dõi và báo khách.\n\n## Khi nào hoàn tất?\n\nDeal được đánh dấu **Hoàn thành** khi:\n- SX báo cáo xong\n- VC giao hàng + lắp đặt xong\n- Sales xác nhận với KH',
 NULL, NULL, 9, 1, true, now())
ON CONFLICT (id) DO NOTHING;

-- ─── BÀI TẬP ───────────────────────────────────────────────────────────────
-- Quiz 4 câu cho bài "Tạo Lead mới"
INSERT INTO knowledge_exercises (id, lesson_id, title, instructions, type, questions, passing_score, sort_order) VALUES
('c0000001-0000-0000-0000-000000000001',
 'b0000001-0000-0000-0000-000000000003',
 'Kiểm tra: Tạo Lead',
 'Trả lời 4 câu hỏi trắc nghiệm để kiểm tra hiểu biết về cách tạo Lead.',
 'quiz',
 '{
   "items": [
     {
       "id": "q1",
       "question": "Lead trong CRM là gì?",
       "type": "single",
       "options": [
         "Khách hàng đã chốt mua",
         "Khách hàng tiềm năng — đã liên hệ nhưng chưa cam kết",
         "Sản phẩm mới ra mắt",
         "Nhân viên kinh doanh"
       ],
       "correct": [1]
     },
     {
       "id": "q2",
       "question": "Làm thế nào để di chuyển Lead giữa các cột Kanban?",
       "type": "single",
       "options": [
         "Xóa rồi tạo lại ở cột mới",
         "Chỉ admin mới di chuyển được",
         "Kéo thả card hoặc bấm vào pipeline trong chi tiết",
         "Gửi email yêu cầu IT"
       ],
       "correct": [2]
     },
     {
       "id": "q3",
       "question": "Những thông tin nào BẮT BUỘC khi tạo Lead? (chọn nhiều)",
       "type": "multiple",
       "options": [
         "Tiêu đề Lead",
         "Khách hàng",
         "Mã số thuế",
         "Nguồn Lead"
       ],
       "correct": [0, 1]
     },
     {
       "id": "q4",
       "question": "Ghi hoạt động (cuộc gọi, gặp mặt) trong CRM giúp ích gì?",
       "type": "single",
       "options": [
         "Không có ích, chỉ tốn thời gian",
         "Để admin giám sát",
         "Đồng đội nắm tình hình khi tiếp nhận và có lịch sử KH rõ ràng",
         "Tự động báo giá"
       ],
       "correct": [2]
     }
   ]
 }'::jsonb,
 70, 1),

-- Quiz cho bài "Chuyển Lead → Deal"
('c0000001-0000-0000-0000-000000000002',
 'b0000001-0000-0000-0000-000000000004',
 'Kiểm tra: Chuyển Lead → Deal',
 NULL,
 'quiz',
 '{
   "items": [
     {
       "id": "q1",
       "question": "Khi nào nên chuyển Lead thành Deal?",
       "type": "single",
       "options": [
         "Ngay khi tạo Lead",
         "Khi KH chưa trả lời cuộc gọi",
         "Khi KH có nhu cầu rõ ràng và sẵn sàng báo giá chi tiết",
         "Chỉ admin quyết định"
       ],
       "correct": [2]
     },
     {
       "id": "q2",
       "question": "Sau khi chuyển Lead → Deal, dữ liệu cũ thì sao?",
       "type": "single",
       "options": [
         "Bị xóa hết",
         "Vẫn được giữ lại: tài liệu, hoạt động, lịch sử",
         "Phải nhập tay lại",
         "Chỉ giữ tên KH"
       ],
       "correct": [1]
     },
     {
       "id": "q3",
       "question": "Có thể chuyển Deal trở lại thành Lead không?",
       "type": "single",
       "options": [
         "Có, bất cứ lúc nào",
         "Có, nhưng phải admin duyệt",
         "Không — chuyển đổi là một chiều",
         "Chỉ trong 24 giờ"
       ],
       "correct": [2]
     }
   ]
 }'::jsonb,
 70, 1),

-- Checklist cho bài "Tạo Báo giá"
('c0000001-0000-0000-0000-000000000003',
 'b0000001-0000-0000-0000-000000000005',
 'Thực hành: Tạo báo giá mẫu',
 'Hoàn thành các bước sau để thực hành tạo một báo giá hoàn chỉnh.',
 'checklist',
 '{
   "items": [
     { "id": "c1", "text": "Mở form Tạo báo giá từ menu CRM hoặc từ Lead/Deal" },
     { "id": "c2", "text": "Chọn khách hàng và điền thông tin liên hệ" },
     { "id": "c3", "text": "Thêm ít nhất 2 sản phẩm vào báo giá" },
     { "id": "c4", "text": "Nhập số lượng, đơn giá và chiết khấu (nếu có)" },
     { "id": "c5", "text": "Đặt hiệu lực đến (ngày hết hạn báo giá)" },
     { "id": "c6", "text": "Ghi điều khoản thanh toán và ghi chú gửi KH" },
     { "id": "c7", "text": "Xuất PDF và kiểm tra file trước khi gửi" }
   ]
 }'::jsonb,
 80, 1),

-- Essay cho bài KPI
('c0000001-0000-0000-0000-000000000004',
 'b0000001-0000-0000-0000-000000000006',
 'Suy ngẫm về KPI cá nhân',
 'Bài tự luận giúp bạn nhìn lại KPI tháng vừa qua.',
 'essay',
 '{
   "prompt": "Hãy mô tả 1 KPI mà bạn đang yếu nhất và đề xuất 3 hành động cụ thể trong tháng tới để cải thiện chỉ số đó. (tối thiểu 100 từ)"
 }'::jsonb,
 70, 1),

-- Quiz đơn giản cho bài giao diện
('c0000001-0000-0000-0000-000000000005',
 'b0000001-0000-0000-0000-000000000001',
 'Kiểm tra: Giao diện hệ thống',
 NULL,
 'quiz',
 '{
   "items": [
     {
       "id": "q1",
       "question": "App Switcher (icon lưới) dùng để làm gì?",
       "type": "single",
       "options": [
         "Đăng xuất nhanh",
         "Chuyển nhanh giữa các module: Công việc, CRM, SX, VC, Kiến thức",
         "Mở ChatBot",
         "Tải file"
       ],
       "correct": [1]
     },
     {
       "id": "q2",
       "question": "Nút Pin trên app switcher có chức năng gì?",
       "type": "single",
       "options": [
         "Xóa module",
         "Ghim module để lần sau đăng nhập vào thẳng module đó",
         "Khóa màn hình",
         "Lưu ảnh"
       ],
       "correct": [1]
     }
   ]
 }'::jsonb,
 70, 1)
ON CONFLICT (id) DO NOTHING;

COMMIT;
