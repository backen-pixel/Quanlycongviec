/**
 * Cập nhật tích hợp sẵn — hiển thị trên /updates (bổ sung release notes từ DB).
 * Cập nhật file này khi ship tính năng lớn.
 */
export const BUILTIN_UPDATES = [
  {
    id: '2026-07-crm-deal-chuyen-san-xuat',
    version: '2.4.0',
    category: 'guide',
    publishedAt: '2026-07-07T03:30:00.000Z',
    title: '🏭 Hướng dẫn — Chuyển Deal CRM sang Sản xuất (mẫu Phúc Đạt)',
    content: `## Tổng quan luồng CRM → Xưởng

Deal thắng trên CRM → chọn xưởng sản xuất → dự án xuất hiện cột Tiếp nhận → up bản vẽ (Tài liệu) → trao đổi file qua tab Bình luận giữa CRM và xưởng → CRM xác nhận → xưởng chuyển cột tiếp theo.

Mẫu minh họa: Công ty Nhôm Kính Phúc Đạt · Deal DEAL-2026-440 → dự án TB-2026-337 · phân loại Cửa.


## Bước 1 — CRM: Chuyển deal sang cột Thắng

Vào CRM → Dashboard → tab Deals, lọc Công ty Nhôm Kính Phúc Đạt.

Trên thẻ deal cần chuyển, bấm Chuyển cột nhanh (hoặc kéo thả) sang cột Đã ký hợp đồng. — đây là cột Thắng của Phúc Đạt.

Ngay sau đó, popup Chuyển Deal sang Sản xuất hiện ra (bắt buộc):

- Công ty Sản xuất: chọn xưởng thực hiện (Phúc Đạt tự SX → chọn Công ty Nhôm Kính Phúc Đạt)
- Phân loại sản xuất: Tủ bếp / Cửa / Cánh kính… — quyết định pipeline Kanban xưởng
- Bấm Tiếp tục → hệ thống tạo mã dự án TB-… và liên kết với deal

![Deal trước khi chuyển sang cột Thắng](/release-notes/sx-crm-deal-truoc-chuyen-thang.png)

![Popup chọn công ty Sản xuất và phân loại](/release-notes/sx-crm-chon-cong-ty-san-xuat.png)

![Deal đã ở cột Đã ký hợp đồng (Thắng)](/release-notes/sx-crm-deal-cot-thang.png)


## Bước 2 — Xưởng: Dự án ở cột Tiếp nhận

Chuyển sang module Xưởng SX → Deal vào xưởng.

Đặt bộ lọc khớp bước 1:

- Xưởng: Công ty Nhôm Kính Phúc Đạt
- Phân loại: Cửa
- Có thể tìm mã TB-2026-337 hoặc tên khách

Thẻ dự án nằm ở cột Tiếp nhận, có badge CRM và nhãn MỚI. Bấm tiêu đề thẻ để mở chi tiết dự án.

![Kanban xưởng — cột Tiếp nhận](/release-notes/sx-kanban-tiep-nhan.png)


## Bước 3 — Xưởng: Tài liệu, bình luận và trao đổi bản vẽ

### 3a. Lưu bản vẽ chính thức — tab Tài liệu

Trong chi tiết dự án, mở tab Tài liệu → bấm Upload file xưởng → chọn PDF, DWG, JPG…

Nếu cần NVKD xem trên deal CRM: sau khi up, bấm Chia sẻ CRM trên file đó.

File chỉ dùng nội bộ xưởng thì up bình thường, không bật chia sẻ CRM.

![Tab Tài liệu — Upload file xưởng](/release-notes/sx-tab-tai-lieu-upload.png)

### 3b. Bình luận nhanh trên Kanban (chỉ text)

Dùng khi chỉ cần nhắc CRM đã up file ở tab Tài liệu — không đính kèm file được.

![Bình luận nhanh — đợi CRM xác nhận](/release-notes/sx-binh-luan-doi-crm.png)

### 3c. CRM xác nhận

NVKD mở deal DEAL-2026-440 → xem tab Tài liệu → phản hồi OK hoặc yêu cầu chỉnh.

Sau khi CRM đồng ý, xưởng Chuyển cột nhanh sang cột kế tiếp.


## Bước 4 — Trao đổi bản vẽ qua tab Bình luận (CRM ↔ Sản xuất)

Đây là cách khuyến nghị để hai bên bàn giao và chỉnh sửa nhanh: gửi file bản vẽ (PDF, DWG, JPG…) trực tiếp trong luồng bình luận — CRM và xưởng cùng thấy một chỗ.

Phía Sản xuất — gửi bản vẽ kèm bình luận:

1. Từ Kanban, bấm tiêu đề thẻ TB-2026-337 → mở chi tiết dự án
2. Ở cột phải, bấm tab 💬 Bình luận trên thanh tab (Công việc · Tài liệu · Bình luận…)
3. Gõ nội dung ngắn, dùng @ để nhắc NVKD (VD: @Vũ Pd)
4. Bấm biểu tượng đính kèm (kẹp giấy) bên ô soạn → chọn file bản vẽ PDF/DWG/JPG
5. Hoặc dán trực tiếp ảnh/PDF vào ô soạn (Ctrl+V) → bấm Đăng

![Chi tiết dự án SX — tab Bình luận trên thanh tab, đính kèm bản vẽ](/release-notes/sx-binh-luan-dinh-kem-ban-ve.png)

Phía CRM — xem và phản hồi:

1. Mở deal DEAL-2026-440 (link CRM deal trên dự án xưởng hoặc từ Kanban CRM)
2. Ở cột phải, bấm tab 💬 Bình luận trên thanh tab
3. Xem file đính kèm dưới bình luận xưởng — bấm để xem/tải
4. Trả lời hoặc đính kèm bản chỉnh sửa trong cùng luồng → báo xưởng chuyển cột

![Chi tiết deal CRM — tab Bình luận trên thanh tab, xem file từ xưởng](/release-notes/sx-crm-xem-binh-luan-ban-ve.png)

Ghi nhớ:
- Tab Tài liệu: lưu bản vẽ chính thức, có thể Chia sẻ CRM
- Tab Bình luận + đính kèm: trao đổi nhanh, hỏi–đáp, gửi bản phác thảo giữa CRM và xưởng
- Bình luận nhanh trên Kanban chỉ gửi text — cần file thì vào tab Bình luận chi tiết dự án


## Ai làm gì?

NVKD / Admin CRM
- Chuyển deal sang cột Thắng, chọn xưởng và phân loại
- Kiểm tra bản vẽ (Tài liệu + file đính kèm bình luận)
- Phản hồi xác nhận hoặc yêu cầu chỉnh sửa

Nhân viên Sản xuất
- Nhận thẻ ở cột Tiếp nhận
- Up bản vẽ tab Tài liệu, bật Chia sẻ CRM nếu cần
- Đính kèm file bản vẽ trong tab Bình luận để trao đổi với CRM (@ nhắc NVKD)

Admin
- Cấu hình phân loại xưởng tại Pipeline xưởng nếu thiếu tùy chọn (Tủ bếp, Cửa…)`,
  },
  {
    id: '2026-06-drive-module-chat-share',
    version: '2.3.0',
    category: 'feature',
    publishedAt: '2026-06-16T06:00:00.000Z',
    title: '☁️ Google Drive tích hợp — lưu trữ theo module, chia sẻ qua chat & nhắc file lớn',
    content: `## Google Drive theo module (CRM / SX / VC)

- Menu sidebar có nút **Drive CRM**, **Drive SX**, **Drive VC** — mỗi module chỉ hiện đúng thư mục công ty thuộc module đó.
- Dropdown **"Tất cả module"** trên trang Drive cho phép lọc nhanh.
- Folder tổ chức phẳng theo cấu trúc: **Module → Công ty → Khu vực → Loại → Phòng ban → Nhân viên → Kind → Mã deal**.

![Trang Drive — cây thư mục, lọc module & danh sách file](/release-notes/drive-trang-chu.png)

## Tab ☁️ Drive trên Lead / Deal / Dự án

- Tab **☁️ Drive (N)** hiển thị số file đã gắn — gắn file Drive vào từng entity riêng biệt.
- Nút **Tải lên từ máy** → upload thẳng vào đúng thư mục entity trên Google Drive.
- Nút **Liên kết file Drive** → chọn file đã có sẵn trong Drive.
- Tạo **Google Doc / Sheet** gắn thẳng vào deal — mở preview với toolbar chỉnh sửa đầy đủ.

![Tab Drive trên chi tiết Lead/Deal — upload, liên kết & tạo Doc/Sheet](/release-notes/drive-tab-lead-deal.png)

## Chia sẻ file Drive qua Chat

- Ô chat (Lead chat & Messenger) có nút ☁️ **HardDrive** — chọn file từ Drive → gửi dưới dạng thẻ file.
- Thẻ file hiển thị: icon loại file (PDF/Doc/Sheet), tên rút gọn, dung lượng, nút 👁 Xem trước + ⬇️ Tải.
- **DriveFilePicker** mở qua portal (không bị kẹp trong khung chat), dạng danh sách mặc định, modal rộng.

## Nhắc nhở gửi file lớn qua Drive

- Đính kèm file **≥ 10 MB** trực tiếp trong chat → popup nhắc **"File dung lượng lớn — nên gửi qua Drive"**.
  - Nút **Chọn trên Drive** → mở picker Drive luôn.
  - Nút **Vẫn gửi từ máy** → tiếp tục upload bình thường.
- Dòng gợi ý hiển thị dưới ô chat: *"File từ 10 MB nên gửi qua Google Drive (☁️). Giới hạn đính kèm trực tiếp: 50 MB/file."*
- Ngưỡng nhắc cấu hình qua biến môi trường \`VITE_CHAT_DRIVE_REMIND_MB\` (mặc định 10 MB).

## Xem trước & chỉnh sửa Doc/Sheet

- Preview Google Doc / Sheet hiển thị **toolbar chỉnh sửa đầy đủ** (đã bỏ tham số \`rm=minimal\`).
- Nút **"Chỉnh sửa (tab mới)"** mở Google Docs/Sheets trên tab riêng.
- Modal preview cao hơn (96vh) để đủ diện tích làm việc.

## Cài đặt kỹ thuật (admin)

Chạy các migration Supabase theo thứ tự:
- \`database/354_drive_module_and_category.sql\` — thêm cột \`module\` & \`category_tag\` vào \`drive_roots\`
- \`database/355_drive_acl_region.sql\` — thêm cột \`region_id\` vào bảng \`drive_acl\`
- \`database/356_drive_roots_module_meta.sql\` — thêm cột meta \`ecosystem_module_key\`, \`company_id\`, \`region_id\` vào \`drive_roots\`

Sau khi chạy migration, vào **Quản trị → Drive → Roots** để gán module cho từng root folder.`,
  },
  {
    id: '2026-06-crm-assignments-pipeline-notify',
    version: '2.2.0',
    category: 'feature',
    publishedAt: '2026-06-05T12:00:00.000Z',
    title: 'Giao việc CRM — gán NV từ Lead/Deal, đồng bộ pipeline & thông báo tab Giao việc',
    content: `## Gán nhân viên từ Lead / Deal
- Tab **Nhiệm vụ**: gán **một hoặc nhiều NV**; badge **Giao việc CRM** mở thẳng trang Giao việc.
- Tab **Thành viên**: tạo nhiệm vụ CRM cho NV đang tham gia lead/deal.
- Form sửa nhiệm vụ: ẩn **Chặn chuyển giai đoạn** với NV thường (chỉ admin cấu hình mẫu).

![Gán một hoặc nhiều nhân viên — đồng bộ sang Giao việc CRM](/release-notes/crm-assign-nv.png)

## Đồng bộ Pipeline ↔ Giao việc CRM
- Gán NV trên nhiệm vụ pipeline tự tạo/cập nhật thẻ trên **Giao việc CRM**.
- Trên Giao việc: **ghi chú**, nút **Đang làm** / **Hoàn thành**, kéo cột Kanban — đồng bộ ngược pipeline.
- **Planner / Deadline**: giao diện **cá nhân**, tự **Thêm cột cá nhân** để nhóm việc theo ý.

![Planner — cột cá nhân, thêm cột theo từng người](/release-notes/crm-assignments-planner.png)

## Thông báo
- NV được giao nhận TB **«Bạn vừa được giao nhiệm vụ CRM»**.
- Nút chuông → tab **Giao việc** (badge riêng); bấm TB mở đúng nhiệm vụ.

![Tab Giao việc trong Trung tâm thông báo](/release-notes/crm-notification-giao-viec.png)`,
  },
  {
    id: '2026-05-unified-work-tasks',
    version: '2.1.0',
    category: 'feature',
    publishedAt: '2026-05-29T12:00:00.000Z',
    title: 'Tổng hợp nhiệm vụ — xem & thao tác mọi NV từ module Công việc',
    content: `## Tổng hợp nhiệm vụ (mới)

Menu **Công việc → Tổng hợp nhiệm vụ** (\`/work/unified\`) — đầu mối xem mọi nhiệm vụ từ:
- **CRM** (Lead/Deal)
- **Sản xuất** & **Vận chuyển**
- **Giao việc CRM** (Kanban độc lập)

### 3 tab chính
1. **Theo dự án** — chọn dự án → 4 nhóm NV + tiến độ X/Y hoàn thành.
2. **Tất cả NV** — bảng gom mọi nguồn, lọc loại NV, trạng thái, tìm kiếm.
3. **Lịch sử ghi nhận** — timeline thống nhất ai làm gì, lúc nào.

### CRUD từ Công việc
- Tạo, sửa, đổi trạng thái, bình luận — ghi đúng về module gốc (không nhân bản dữ liệu).
- Nút **Mở trong module gốc** — deep-link về Lead, dự án SX/VC, Giao việc CRM.

### Lịch sử thống nhất
- Mọi thay đổi quan trọng (tạo, trạng thái, gán NV, deadline, hoàn thành, bình luận) được ghi vào \`unified_task_history\`.
- Widget nhỏ **Lịch sử nhiệm vụ** trên trang chi tiết Lead, Sản xuất, Vận chuyển.`,
  },
  {
    id: '2026-05-knowledge-deal-crm-courses',
    version: '2.0.0',
    category: 'feature',
    publishedAt: '2026-05-29T08:00:00.000Z',
    title: 'Thư viện kiến thức — 2 khoá mới (Deal & CRM toàn phần mềm), bài tập nâng cấp & UX bài học',
    content: `## Khoá học mới

### 💼 Deal — Cơ hội bán hàng (13 bài + bài thi Deal Master)
- 13 bài học chuyên sâu về vòng đời Deal: Lead → Báo giá → Đàm phán → Ký HĐ → Thắng/Thua → Bàn giao SX → Điểm Deal.
- Áp dụng tình huống ngành **tủ bếp / cửa nhôm**, giọng nghiêm túc.
- **Bài thi tổng kết Deal Master**: 20 câu tình huống / đạt **90%** / **30 phút** / tối đa 2 lần.
- Pipeline 6 giai đoạn được khẳng định là **mẫu tượng trưng** — công ty có thể cấu hình pipeline riêng.
- Deadline khoá: **30 ngày** (tương đối từ ngày bắt đầu).

### 🖥️ Hướng dẫn CRM — Toàn bộ phần mềm (20 bài + bài thi tổng)
- 12 bài Lead/Deal trên phần mềm (menu, nút, tab, gate, tạo dự án…).
- **7 bài chức năng mới bổ sung**: Dashboard CRM, Sự kiện, Nhóm chat, Đang hoạt động, Bảng tin nội bộ, Cuộc gọi & ghi âm, CRM Mobile.
- **Bài thi tổng kết CRM Operator**: 25 câu / đạt **90%** / **30 phút**.
- Deadline khoá: **21 ngày**.

## Bài tập nâng cấp toàn diện
- Câu hỏi đổi sang **tình huống thực tế** (case study), nhiều câu chọn nhiều, đáp án nhiễu hợp lý.
- Điểm đạt nâng từ 70% → **80%**, giới hạn **2 lần làm**.
- Checklist chuyển thành **cam kết tuân thủ** (tick 100% các điều khoản KPI / quy trình).

## UX bài học & bài tập
- **Câu chọn nhiều** hiển thị rõ ràng:
  - Badge xanh lá *"Câu này chọn nhiều đáp án"* trên đầu câu hỏi.
  - Hint đếm số đáp án đã chọn (real-time).
  - Checkbox màu xanh lá, sidebar có dấu \`+\` đánh dấu.
  - Trang kết quả có pill *Chọn nhiều / Chọn 1* trên mỗi câu.
- **Bài học có video** mặc định mở tab **Video** (không còn mặc định Văn bản).
- Khoá bài tuần tự: xong bài + pass bài tập mới mở bài kế tiếp; nút **Học bài tiếp theo**.

## Deadline & lịch sử học tập
- Khoá có **deadline cố định** hoặc **tương đối từ ngày bắt đầu**, banner đếm ngược trên trang khoá.
- **Lịch sử thay đổi deadline** — admin xem ai đổi gì khi nào.
- Học viên có **timeline** học (bài bắt đầu / hoàn thành / bài tập nộp) với nhãn **Đúng hạn / Trễ**.

## Chứng nhận & profile
- Khi pass tất cả bài tập + bài thi tổng → tự cấp **chứng nhận** với mã định danh và **huy chương** riêng (admin upload từng khoá).
- Chứng nhận hiển thị trên **trang Profile mạng nội bộ** của học viên.`,
  },
  {
    id: '2026-05-crm-assignments',
    version: '1.9.0',
    category: 'feature',
    publishedAt: '2026-05-19T12:00:00.000Z',
    title: 'Giao việc CRM — giao việc độc lập, file yêu cầu/nộp, bình luận & nhắc hạn',
    content: `## Trang mới: Giao việc CRM
- Menu sidebar **Giao việc CRM** (\`/crm/assignments\`) — **tách khỏi** module Công việc chung và task gắn Lead/Deal.
- **4 chế độ xem**: Kanban (tự quản lý cột), Danh sách, Planner (theo nhân viên), Deadline.
- **Lọc theo công ty** (admin chọn công ty; nhân viên chỉ thấy việc công ty mình).
- Giao **nhiều NV** cùng lúc: lọc theo công ty → khu vực → phòng ban → chọn NV / chọn tất cả.

## File yêu cầu & nộp bài
- **File yêu cầu** (người giao): gallery ảnh / video / link với mũi tên trái–phải; thêm **file** hoặc **URL**; PDF/Office chỉ nút **Tải file về**.
- **Nộp công việc** (NV được giao): danh sách file đã nộp + nút nộp thêm; tải/xóa file của mình.
- Upload tên file tiếng Việt được chuẩn hóa cho Storage (tránh lỗi Invalid key).

## Ghi chú & thông báo
- **Bình luận có trả lời** (thread lồng nhau).
- Badge sidebar + **Notification Center**: bình luận mới, sắp đến hạn, quá hạn.
- Cron nhắc deadline mỗi 30 phút.

## Cài đặt kỹ thuật (admin)
- Chạy migration Supabase (theo thứ tự):
  - \`database/191_crm_assignments.sql\`
  - \`database/192_crm_assignment_assignees.sql\`
  - \`database/193_crm_assignment_comments.sql\`
  - \`database/194_crm_assignment_files.sql\`
  - \`database/195_crm_assignment_comments_parent_id.sql\`
- Restart backend sau khi chạy migration.`,
  },
  {
    id: '2026-05-crm-pipeline-orphan-unlock',
    version: '1.8.0',
    category: 'feature',
    publishedAt: '2026-05-19T05:00:00.000Z',
    title: 'CRM Pipeline: giữ bộ lọc, mở khóa Kanban, cột «Chưa có giai đoạn» & gộp cột Thắng trùng',
    content: `## Bộ lọc Pipeline & Khách hàng được nhớ
- Bộ lọc Kanban CRM (công ty, khu vực, NV, nguồn, giai đoạn, phân loại, SĐT, tìm kiếm…) **giữ nguyên khi sang trang khác** (Khách hàng, KPI…) và khi mở lại trình duyệt.
- Trang **Khách hàng** cũng nhớ ô tìm kiếm gần nhất.
- Khi quay lại Pipeline, panel «Bộ lọc» tự bung nếu có filter đang áp dụng.

## Kanban Deal — mở khóa toàn bộ
- Có thể **kéo deal sang bất kỳ cột nào**, kể cả **Sản xuất / Vận chuyển / Hoàn thành** (trước đây bị khóa).
- Stepper trong chi tiết Deal cũng cho đổi lại các giai đoạn trước Thắng (Báo giá, Đàm phán…).
- Badge nhỏ **SX / VC** vẫn tự sync từ module Xưởng / Vận chuyển; \`stage_id\` chính trên CRM do người dùng tự quyết.

## Cột «🗂️ Chưa có giai đoạn» (Kanban Deal)
- Thêm checkbox **«Hiện deal chưa có giai đoạn»** trong bộ lọc — bật để hiện cột ảo ở cuối Kanban.
- Gom các deal: stage rỗng / cột bị xoá / có project nhưng thiếu badge SX & VC.
- Kéo deal từ cột này về cột thường **không bị chặn bất kỳ điều kiện nào** — dùng để chữa dữ liệu lệch.

## Pipeline Stepper — dấu tick đúng lịch sử
- Các giai đoạn **đã đi qua** (Báo giá, Khảo sát…) được tick dựa trên **lịch sử thật** (\`crm_lead_stage_history\`) thay vì chỉ theo \`order_index\`.
- Deal đang ở Thắng không còn tick nhầm các cột sau Thắng.

## Sửa lỗi cấu hình «2 cột Thắng» trên pipeline
- Migration **\`188_dedupe_deal_won_stages.sql\`**: tự động gộp các cột tên *Thắng* trùng nhau trên cùng pipeline → chỉ giữ một cột chính, các deal liên quan được chuyển sang đúng cột, cột dư đổi tên *«… (trùng — đã gộp)»* và tắt.
- Migration **\`189_repair_pipeline_crm_target_after_dedupe.sql\`**: đồng bộ lại các tham chiếu \`pipeline_crm_target\` sau khi gộp.

## Placeholder badge «⏳ Chờ vào xưởng»
- Deal đã Thắng có project nhưng SX/VC chưa cấp giai đoạn xưởng → hiển thị badge mờ *«Chờ vào xưởng»* để tránh cảm giác «mất tag».

## Cài đặt kỹ thuật (admin)
- Chạy migration Supabase mới:
  - \`database/188_dedupe_deal_won_stages.sql\`
  - \`database/189_repair_pipeline_crm_target_after_dedupe.sql\`
- Sau khi chạy, mở **Cài đặt → Pipeline** kiểm tra: mỗi pipeline chỉ còn **1 cột Thắng** active.`,
  },
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
