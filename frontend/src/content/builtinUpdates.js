/**
 * Cập nhật tích hợp sẵn — hiển thị trên /updates (bổ sung release notes từ DB).
 * Cập nhật file này khi ship tính năng lớn.
 *
 * companyIds (tuỳ chọn): chỉ hiện cho user thuộc các company_id này.
 * Không có / mảng rỗng = hiện cho mọi người.
 */
export const NEXTGO_COMPANY_ID = '87479a83-1145-43b7-b090-3e40812cb5a9';

export const BUILTIN_UPDATES = [
  {
    id: '2026-08-huong-dan-ban-giao-sx-crm-vc',
    version: '2.5.0',
    category: 'guide',
    publishedAt: '2026-08-05T02:00:00.000Z',
    title: '🚚 Hướng dẫn — Bàn giao SX → CRM → VC/LĐ (form bình luận)',
    content: `## Mục đích

Khi xưởng **hoàn thành sản xuất**, cần báo Sale CRM chọn công ty Vận chuyển/Lắp đặt và ngày giao–lắp. Hệ thống tạo **form bàn giao** trên tab Bình luận của deal; sau khi Sale chọn công ty thì đơn vào module **VC/LĐ**. Đủ 2 bên (Xưởng + VC/LĐ) xác nhận thì khóa lịch (3 sự kiện).

Luồng: **Xưởng SX** gửi yêu cầu → **CRM Sale** điền form → **VC/LĐ** xác nhận & kéo Kanban.


## Tổng quan các bên

| Bên | Việc phải làm |
| --- | --- |
| **Xưởng SX** | Kéo thẻ vào cột badge **→VC** (VD HCB: «ĐƠN HÀNG ĐÃ CHUẨN BỊ XONG») hoặc bấm **Bàn giao VC** |
| **Sale CRM** | Mở deal → tab **Bình luận** → chọn công ty VC/LĐ + ngày nhận hàng (+ lắp/địa chỉ) → **Chọn & bàn giao** |
| **VC/LĐ** | Xác nhận trên thẻ bàn giao (CRM) → nhận thẻ trên Kanban VC → kéo theo pipeline |
| **Xưởng (xác nhận)** | Người cấu hình xác nhận SX bấm trên thẻ; đủ 2 bên mới khóa lịch |


## Bước 1 — Xưởng SX: gửi yêu cầu bàn giao

1. Vào module **Xưởng SX** → Kanban, lọc xưởng **HCB** (+ phân loại **Tủ bếp** nếu cần).
2. Tìm cột **ĐƠN HÀNG ĐÃ CHUẨN BỊ XONG** (badge **→VC**).
3. Khi đơn sẵn sàng: **kéo thẻ** vào cột đó, hoặc bấm **Chuyển cột nhanh** / **Bàn giao VC**.
4. Hệ thống đăng thẻ «Bàn giao Vận chuyển / Lắp đặt» lên deal CRM — **chưa** bàn giao thật sang module VC.

![Kanban SX HCB — cột ĐƠN HÀNG ĐÃ CHUẨN BỊ XONG](/release-notes/vc-hd-01-sx-cot-ban-giao.png)

Cách khác: trên thẻ bấm **Chuyển cột nhanh** → chọn **ĐƠN HÀNG ĐÃ CHUẨN BỊ XONG**.

![Menu chuyển cột nhanh — chọn cột chuẩn bị xong](/release-notes/vc-hd-01b-sx-chuyen-cot-nhanh.png)


## Bước 2 — CRM Sale: điền form bàn giao

1. Mở **deal CRM** liên kết dự án (thông báo hoặc badge SX trên deal).
2. Mở tab **💬 Bình luận**.
3. Tìm thẻ cam **Bàn giao Vận chuyển / Lắp đặt**.
4. Chỉ **Sale phụ trách deal** thấy form đầy đủ. Điền:
   - **Công ty VC/LĐ** (bắt buộc)
   - **Ngày nhận hàng** (bắt buộc) — mở lịch chọn ngày
   - Ngày lắp đặt / địa chỉ (tuỳ chọn, thường tự điền)
   - Ghi chú
5. Bấm **Chọn & bàn giao** → bàn giao thật: dự án gắn công ty VC, badge VC trên deal, thẻ xuất hiện Kanban VC.

![Form Sale CRM — chọn công ty & ngày](/release-notes/vc-hd-02b-crm-form-sale-dien.png)

Nếu không phải Sale phụ trách, thẻ chỉ hiện thông báo (không có form chọn công ty):

![Thẻ bàn giao — chỉ Sale phụ trách được chọn](/release-notes/vc-hd-02-crm-form-ban-giao.png)


## Bước 3 — Xác nhận 2 bên (khóa lịch)

Sau khi Sale chọn công ty:

- **Xưởng**: thường **Đã xác nhận** (mặc định khi Sale tạo bàn giao).
- **VC/LĐ**: người được cấu hình xác nhận bấm **xác nhận** trên thẻ.
- Đủ 2 bên → hệ thống tạo **3 sự kiện lịch**: Giao hàng xưởng · VC tới nơi LĐ · Lắp đặt.
- Deal CRM có badge **🚚 VẬN CHUYỂN** (VD: Chờ vận chuyển).

![CRM — chờ VC/LĐ xác nhận](/release-notes/vc-hd-03-crm-cho-xac-nhan.png)


## Bước 4 — Module VC/LĐ: nhận đơn & kéo pipeline

1. Vào module **Vận chuyển** → chọn đúng **công ty VC/LĐ** đã bàn giao.
2. Thẻ mới nằm cột tiếp nhận (VD: **Chờ xác nhận**), giữ mã dự án **TB-…**.
3. NV VC/LĐ xác nhận trên form CRM (bước 3) rồi kéo thẻ theo pipeline: kiểm tra → vận chuyển → giao → lắp đặt.

![Kanban VC — cột Chờ xác nhận](/release-notes/vc-hd-04-vc-kanban-cho-xac-nhan.png)


## Checklist nhanh

**Xưởng SX**
- [ ] Đơn đã đủ hàng / đóng gói
- [ ] Kéo vào cột **→VC** hoặc bấm **Bàn giao VC**
- [ ] Không cần chọn công ty VC tại bước này

**Sale CRM**
- [ ] Mở deal → tab Bình luận → thẻ bàn giao
- [ ] Chọn công ty VC/LĐ + ngày nhận hàng
- [ ] Bấm **Chọn & bàn giao**
- [ ] Theo dõi xác nhận VC/LĐ / sửa ngày nếu chưa khóa lịch

**VC/LĐ**
- [ ] Xác nhận trên thẻ bàn giao (CRM)
- [ ] Kiểm tra thẻ trên Kanban VC đúng công ty
- [ ] Kéo cột theo tiến độ giao–lắp

**Admin**
- [ ] Pipeline SX: bật cờ bàn giao VC trên đúng cột (\`is_handover_to_logistics\`)
- [ ] Cấu hình người xác nhận giao hàng SX / VC trong cài đặt bàn giao`,
  },
  {
    id: '2026-07-huong-dan-gop-lead',
    version: '2.4.7',
    category: 'guide',
    publishedAt: '2026-07-22T04:30:00.000Z',
    title: 'Hướng dẫn — Gộp Lead thủ công trên Kanban',
    content: `## Khi nào cần gộp Lead?

Khi cùng một khách bị tạo **nhiều lead** (Facebook, Zalo, nhập tay trùng…), dữ liệu bị tách: nhiệm vụ, tài liệu, báo giá nằm rải. **Gộp thủ công** giúp bạn tự chọn các thẻ trên Kanban, giữ lại một bản ghi chính và gom dữ liệu từ các bản thừa.


## Bước 1 — Vào Kanban Lead

1. Mở **CRM → Pipeline** (hoặc Dashboard CRM).
2. Chọn tab **Leads**.
3. Đảm bảo đang ở chế độ xem **Kanban**.

![Kanban tab Leads](/guides/gop-lead/01-kanban-tab-leads.png)


## Bước 2 — Tìm ô chọn trên thẻ

Rê chuột lên thẻ Lead → góc **phải trên** hiện ô chọn (icon vuông).

Bấm ô này để chọn thẻ cần gộp.

![Ô chọn trên thẻ Lead](/guides/gop-lead/02-o-chon-tren-the.png)


## Bước 3 — Chọn ít nhất 2 thẻ

1. Tích chọn **thẻ thứ nhất**.
2. Tích chọn **thẻ thứ hai** (hoặc nhiều hơn).
3. Thẻ được chọn có **viền vàng**.
4. Thanh vàng hiện phía trên cột: **Đã chọn N lead**.

![Đã chọn 2 lead — thanh vàng](/guides/gop-lead/03-chon-2-the-thanh-vang.png)


## Bước 4 — Bấm Gộp đã chọn

Trên thanh vàng, bấm nút cam **Gộp đã chọn** để mở popup.

![Nút Gộp đã chọn](/guides/gop-lead/04-nut-gop-da-chon.png)


## Bước 5 — Chọn bản ghi giữ lại

Trong popup **Gộp Lead đã chọn**:

- Mỗi thẻ hiện **mã lead**, tiêu đề, khách hàng, số tài liệu.
- Bấm **ô tròn (radio)** bên trái thẻ bạn muốn **giữ lại**.
- Thẻ được chọn sẽ có viền vàng nổi bật.

![Chọn bản ghi giữ lại](/guides/gop-lead/05-modal-chon-ban-giu.png)


## Bước 6 — Chọn cách gộp dữ liệu

Mục **Dữ liệu & tài liệu**:

- **Gộp từ cả hai bản ghi** (khuyến nghị): gom khách hàng, tài liệu, nhiệm vụ, hoạt động, báo giá, đơn hàng, hóa đơn, Facebook… sang bản giữ.
- **Chỉ giữ bản được chọn:** không chuyển dữ liệu từ bản kia — dữ liệu bản bị loại có thể mất (dùng thận trọng).

![Chọn cách gộp dữ liệu](/guides/gop-lead/06-modal-du-lieu.png)


## Bước 7 — Tiêu đề và xác nhận

Mục **Tiêu đề sau khi gộp**:

- Giữ tiêu đề của bản ghi được chọn giữ, hoặc
- Dùng tiêu đề từ bản kia, hoặc
- Nhập tiêu đề tùy chỉnh.

Cuối cùng bấm **Xác nhận gộp**.

![Tiêu đề và nút Xác nhận gộp](/guides/gop-lead/07-modal-tieu-de-xac-nhan.png)

Cùng thao tác cũng dùng được trên tab **Deals**.


## Sau khi gộp — kiểm tra gì?

- Trên Kanban chỉ còn **một** thẻ (bản giữ lại).
- Mở chi tiết lead → kiểm tra **tài liệu**, **nhiệm vụ**, **báo giá** đã gom đủ.
- Lead thừa không còn trong danh sách.


## Cảnh báo

- Gộp **không hoàn tác** dễ dàng — chọn đúng bản giữ lại trước khi xác nhận.
- Không gộp hai lead của **hai khách khác nhau** trừ khi chắc chắn là cùng người.
- Tùy chọn **Chỉ giữ bản được chọn** có thể xóa dữ liệu của thẻ bị loại.`,
  },
  {
    id: '2026-07-crm-core-overview',
    version: '2.4.6',
    category: 'feature',
    publishedAt: '2026-07-21T09:30:00.000Z',
    title: 'CRM Core — Tổng quan cải tiến (modular + bảo mật nhiệm vụ)',
    content: `## CRM Core đã cải thiện gì?

Bản này củng cố **nền tảng CRM** (API backend) sau khi tách monolith thành các module. Giao diện Kanban / Lead / Deal giữ nguyên; thay đổi chủ yếu ở độ ổn định và quyền truy cập.

### 1. Kiến trúc module rõ ràng
- CRM tách theo nhóm chức năng: dashboard, pipeline, lead/deal, nhiệm vụ, báo cáo, tài liệu thương mại, taxonomy…
- Thứ tự mount đúng: route tĩnh (\`/leads/picker\`, quét trùng…) **không bị** \`/leads/:id\` nuốt.
- Giữ đủ endpoint cũ (224 từ trước khi tách) và các tính năng mới có chủ ý (allowlist SX, đặt lịch VC, chuyển khu vực, gán lại SX…).

### 2. Đồng bộ schema an toàn hơn
- Cờ tương thích DB (join VC pipeline, màu loại lead…) dùng **một object dùng chung** giữa mọi module.
- Tránh tình trạng module A biết thiếu cột/FK nhưng module B vẫn query join → lỗi 500 rải rác.

### 3. Bảo mật nhiệm vụ Lead/Deal
- Trước: chỉ cần đăng nhập + biết UUID là có thể gọi API nhiệm vụ.
- Sau: chỉ xem/sửa nhiệm vụ khi là người phụ trách, thành viên / được chia sẻ, được gán task, hoặc công ty SX được giao (executor) / chủ dự án.
- NV sản xuất và đối tác được giao việc **vẫn vào được** tab Nhiệm vụ đúng phạm vi.

### 4. Kiểm chứng route có bằng chứng
- Baseline so sánh lấy từ Git (trước khi tách CRM).
- Manifest route tạo lại bằng script (\`crm:route-inventory\`) — không chỉnh tay để “ép” số liệu.
- Hiện tại: **230** endpoint runtime, **0** thiếu so với baseline, **0** thêm ngoài danh sách cho phép.

### Ai cần lưu ý?
- **NVKD / Admin CRM:** dùng CRM như cũ; nếu báo 403 ở tab Nhiệm vụ → kiểm tra phụ trách / thành viên deal.
- **NV SX:** vẫn xem nhiệm vụ trên deal khi được giao hoặc thuộc dự án / công ty thực hiện.
- **Kỹ thuật:** Quality Gate độc lập trước khi bổ sung bộ test mutation/upload/realtime.`,
  },
  {
    id: '2026-07-crm-deal-chuyen-san-xuat-nextgo',
    version: '2.4.3',
    category: 'guide',
    publishedAt: '2026-07-21T07:00:00.000Z',
    companyIds: [NEXTGO_COMPANY_ID],
    title: '🏭 Hướng dẫn — Chuyển Deal CRM sang Sản xuất (NextGo)',
    content: `## Tổng quan luồng CRM → Xưởng bao bì NextGo

Deal thắng trên CRM → chọn xưởng **NextGo** + phân loại bao bì → dự án vào cột **Chờ vào xưởng** → up file thiết kế (Tài liệu) → trao đổi qua tab Bình luận → CRM xác nhận → xưởng chuyển cột tiếp theo.

Mẫu minh họa: Công Ty TNHH Bao Bì NextGo · Deal **DEAL-2026-853** → dự án **TB-2026-447** · phân loại **Hộp cứng**.


## Bước 1 — CRM: Chuyển deal sang cột Thắng

Vào CRM → Dashboard → tab **Deals**, lọc Công ty **NextGo**.

Trên thẻ deal cần chuyển, bấm **Chuyển cột nhanh** (hoặc kéo thả) sang cột **Thắng**.

Ngay sau đó, popup **Chuyển công ty SX** hiện ra (bắt buộc):

- Công ty Sản xuất: chọn **NextGo** (xưởng bao bì)
- Phân loại: Túi giấy / Hộp cứng / Hộp mềm / Hộp carton bồi in offset / Hộp carton / Thùng carton — ★ = gợi ý theo loại CRM
- Tích xác nhận → **Xác nhận chuyển** → đếm 5 giây → tạo mã dự án **TB-…**

![Deal trước khi chuyển sang cột Thắng](/guides/nextgo-sx/00-crm-deal-truoc-khi-chuyen.png)

![Popup chọn công ty SX NextGo và phân loại bao bì](/guides/nextgo-sx/01-chon-cong-ty-san-xuat.png)

![Deal đã ở cột Thắng — badge SX Chờ vào xưởng](/guides/nextgo-sx/01b-deal-da-o-cot-thang.png)

**Lưu ý:** Deal chưa có dự án **không kéo thẳng** sang cột sau Thắng (Thiết kế chi tiết, Sản xuất, Giao hàng…).


## Bước 2 — Xưởng: Dự án ở cột Chờ vào xưởng

Chuyển sang module **Xưởng SX** → Deal vào xưởng (\`/sx/dashboard\`).

Đặt bộ lọc khớp bước 1:

- Xưởng: **NextGo**
- Phân loại: **Hộp cứng** (hoặc Tất cả)
- Có thể tìm mã **TB-2026-447** hoặc tên khách

Pipeline NextGo: Chờ vào xưởng → Tiếp nhận đơn → Thiết kế chi tiết → Chuẩn bị NVL → Sản xuất → QC nội bộ → Đóng gói & xuất kho → Giao hàng → Hoàn thành.

![Kanban xưởng NextGo — cột Chờ vào xưởng](/guides/nextgo-sx/02-deal-o-cot-cho-vao-xuong.png)


## Bước 3 — Tài liệu và bình luận

### 3a. Tab Tài liệu

Mở dự án → tab **📋 Tài liệu** → **Upload file xưởng** (PDF, AI, CDR, JPG…). Bật **Chia sẻ CRM** nếu NVKD cần xem trên deal.

![Tab Tài liệu — Upload file xưởng](/guides/nextgo-sx/04-tab-tai-lieu.png)

### 3b. Tab Bình luận (CRM ↔ SX)

Tab **💬 Bình luận** → gõ nội dung, @ nhắc người phụ trách → đính kèm file hoặc Ctrl+V → **Đăng**. Phía CRM mở deal → tab Bình luận để phản hồi.

![Chi tiết dự án SX — tab Bình luận](/guides/nextgo-sx/06-binh-luan-sx.png)


## Ai làm gì?

**NVKD / Admin CRM**
- Chuyển deal sang Thắng, chọn NextGo + phân loại bao bì
- Kiểm tra file thiết kế và phản hồi trên Bình luận

**Nhân viên Sản xuất**
- Nhận thẻ ở cột Chờ vào xưởng / Tiếp nhận đơn
- Up file tab Tài liệu; đính kèm trong Bình luận khi cần trao đổi nhanh

**Admin**
- Cấu hình phân loại & bộ nhiệm vụ tại Pipeline xưởng (\`/sx/pipeline-settings\`, \`/sx/task-templates\`)`,
  },
  {
    id: '2026-07-crm-revert-deal-to-lead',
    version: '2.4.3',
    category: 'guide',
    publishedAt: '2026-07-20T06:40:00.000Z',
    title: '↩️ Hướng dẫn — Chuyển Deal về Lead',
    content: `## Khi nào dùng?

Khi Deal **chưa đủ điều kiện bán** (sai loại, cần nuôi lại, hoặc muốn trả về pipeline Lead), dùng **Trả về Lead**.

**Lưu ý:**
- Deal **đã có dự án SX** cần tích xác nhận **gỡ liên kết dự án** (chỉ admin công ty/khu vực).
- Phải chọn **người phụ trách Lead mới**.
- Phải nhập **lý do** trả Deal về Lead.


## Bước 1 — Mở chi tiết Deal

1. Vào **CRM → Pipeline** (tab Deal).
2. Bấm thẻ Deal cần trả về.
3. Trên header chi tiết, tìm nút vàng **Trả về Lead**.

![Header Deal — nút Trả về Lead](/release-notes/hd-deal-header.png)


## Bước 2 — Điền form và xác nhận

1. Bấm **Trả về Lead**.
2. Chọn **Người phụ trách Lead mới** (bắt buộc).
3. Nếu Deal có dự án SX: tích **gỡ liên kết dự án**.
4. Nhập **lý do** trả về Lead (bắt buộc).
5. Bấm **↩️ Trả về Lead**.

![Popup Trả về Lead](/release-notes/hd-revert-lead-modal.png)


## Kiểm tra sau khi chuyển

- Badge đổi thành **LEAD**.
- Bản ghi xuất hiện lại trên Kanban **Lead**.
- Banner / tab Thông tin hiện **lý do trả về Lead**.
- Lịch sử / tài liệu vẫn giữ nguyên.


## Lỗi hay gặp

| Hiện tượng | Cách xử lý |
|---|---|
| Không thấy nút Trả về Lead | Đang mở Lead (không phải Deal) |
| Báo có dự án SX | Tích gỡ liên kết hoặc nhờ admin |
| Không chọn được NV | Chọn công ty/khu vực trước |
`,
  },
  {
    id: '2026-07-drive-upload-file-image',
    version: '2.4.5',
    category: 'guide',
    publishedAt: '2026-07-20T07:05:00.000Z',
    title: '☁️ Hướng dẫn — Up file / hình bằng Drive trong chi tiết Deal',
    content: `## Mục tiêu

Up **file PDF, Excel, DWG…** và **hình ảnh** lên **Google Drive gắn với Deal** ngay trên **chi tiết Deal** (tab **☁️ Drive**). File lưu trong thư mục Deal trên Drive — đồng nghiệp mở Deal là thấy.


## Bước 1 — Mở Deal và vào tab Drive

1. CRM → Pipeline (tab Deal) → mở thẻ Deal.
2. Ở vùng giữa, bấm tab **☁️ Drive**.
3. Thấy thanh nút: **Thư mục** · **Tải lên từ máy** · **Doc** · **Sheet** · **Liên kết file Drive**.


## Bước 2 — Tải file / hình từ máy lên Drive

1. Bấm **Tải lên từ máy** (nút xanh).
2. Chọn một hoặc nhiều file từ máy (PDF, JPG, PNG, Excel, DWG…).
3. Chờ tải lên xong.
4. File hiện trong danh sách **File từ Drive** của Deal (cùng thư mục Deal trên Google Drive).

![Tab Drive — Tải lên từ máy trên Deal](/release-notes/hd-deal-drive-upload.png)


## Cách khác (tuỳ chọn)

- **Liên kết file Drive** — gắn file đã có trên Google Drive vào Deal (không up lại từ máy).
- **Doc / Sheet** — tạo Google Doc hoặc Sheet mới trong thư mục Deal.
- **Thư mục** — tạo thư mục con để sắp xếp bản vẽ / hợp đồng.


## Kiểm tra sau khi up

- Tab **☁️ Drive** tăng số file (badge trên tab).
- Breadcrumb thư mục dạng: *Drive của tôi → … → Deal → DEAL-…*
- Mở lại Deal / refresh vẫn thấy file.


## Lỗi hay gặp

| Hiện tượng | Cách xử lý |
|---|---|
| Không thấy tab Drive | Đang ở tab Tài liệu / Công việc — bấm **☁️ Drive** |
| Không bấm được Tải lên từ máy | Chưa kết nối Drive / hết quyền — nhờ admin |
| Upload mãi không xong | File quá lớn / mất mạng — thử lại hoặc nén ảnh |
| Đồng nghiệp không thấy file | Họ mở đúng Deal → tab Drive; kiểm tra quyền Drive |
`,
  },
  {
    id: '2026-07-crm-transfer-assignee-region',
    version: '2.4.3',
    category: 'guide',
    publishedAt: '2026-07-20T06:42:00.000Z',
    title: '👤 Hướng dẫn — Chuyển nhân viên khác khu vực',
    content: `## Vì sao phải chọn khu vực trước?

Lead/Deal có **khu vực** (\`region_id\`). NV chỉ thuộc khu vực được phân.  
Nếu giao NV khu vực khác mà **không đổi khu vực Lead**, Kanban / quyền sẽ lệch (vd. VPT HCM ↔ Q2 ↔ Cần Thơ).


## Bước 1 — Mở popup chuyển

Trên chi tiết Lead/Deal:
- Header: nút **Chuyển người phụ trách**, hoặc
- Panel **Thông tin** → nút **Chuyển người phụ trách**.

![Nút Chuyển người phụ trách trên header](/release-notes/hd-deal-header.png)


## Bước 2 — Chọn khu vực rồi chọn NV

1. Chọn **Khu vực** (cùng công ty).
2. Chọn **Chuyển cho nhân viên** — chỉ hiện NV thuộc khu vực đó.
3. Bấm **Xác nhận**.

![Popup: khu vực + nhân viên](/release-notes/hd-transfer-assignee-modal.png)


## Hệ thống làm gì?

- **Cùng khu vực:** chỉ đổi người phụ trách.
- **Khác khu vực:** cập nhật \`region_id\` + remap **pipeline/stage** (công ty tách pipeline theo khu vực).


## Checklist

- [ ] Đã chọn đúng khu vực đích
- [ ] NV thuộc khu vực đó (picker không trống)
- [ ] Sau khi lưu: panel Thông tin hiện đúng khu vực + phụ trách mới
`,
  },
  {
    id: '2026-07-leave-schedule-guide',
    version: '2.4.1',
    category: 'guide',
    publishedAt: '2026-07-09T04:45:00.000Z',
    title: '📅 Hướng dẫn — Ghi nhận Lịch nghỉ (loại nghỉ, buổi & ghi chú)',
    content: `## Vì sao cần ghi trên Lịch nghỉ?

Khi bạn nghỉ phép, làm online hay công tác, hệ thống dùng **Lịch nghỉ** để:
- Đồng nghiệp / quản lý biết ai nghỉ ngày nào, buổi nào.
- **KPI thời gian** (A1/A2/A4) bỏ qua khoảng bạn nghỉ — công bằng hơn.
- Lịch tháng có **màu chú thích** — nhìn một phát biết loại nghỉ.

**Menu:** CRM → **Lịch nghỉ** (\`/crm/leaves\`). Danh sách chi tiết: **Danh sách nghỉ**.


## Bước 1 — Mở lịch & xem chú thích màu

Trên lịch tháng, mỗi ô ngày hiển thị tên NV + **loại nghỉ · buổi**. Cột phải có bảng **Chú thích**:

| Màu | Ý nghĩa |
|---|---|
| 🟣 Tím | **Nghỉ phép** — nghỉ nguyên ngày |
| 🩷 Hồng | **Nửa ngày** — nghỉ 1 buổi (sáng hoặc chiều), loại khác «Làm online» |
| 🟢 Xanh lá | **Làm online** — làm việc từ xa (cả ngày hoặc nửa ngày) |
| 🟠 Cam | **Ngày lễ** — lễ, Tết |
| ⚪ Xám | **Hôm nay** — ngày hiện tại |

![Lịch tháng & chú thích màu](/release-notes/leave-lich-thang-chu-thich.png)


## Bước 2 — Tạo đơn nghỉ

1. Bấm **Tạo đơn nghỉ** (sidebar phải hoặc nút tím).
2. Chọn **Nhân viên** (quản lý chọn NV; NV thường tạo cho chính mình).
3. Chọn **Nghỉ từ ngày** → **Đến ngày** (cùng ngày nếu chỉ nghỉ 1 ngày).
4. Chọn **Loại nghỉ** và **Buổi** (xem bảng dưới).
5. **Ghi chú** (tùy chọn): lý do cụ thể — hệ thống **tự ghép** loại nghỉ + buổi vào cột Ghi chú khi xem lịch / danh sách.

![Form tạo đơn — Loại nghỉ & Buổi](/release-notes/leave-tao-don-loai-buoi.png)


## Loại nghỉ (dropdown «Loại nghỉ»)

| Giá trị | Khi nào dùng |
|---|---|
| **Phép có lương** | Nghỉ phép năm, nghỉ có lương theo quy định công ty |
| **Phép không lương** | Nghỉ không hưởng lương |
| **Nghỉ ốm** | Nghỉ ốm, có giấy tờ (nếu công ty yêu cầu) |
| **Công tác** | Đi công tác, họp ngoài — không coi là nghỉ phép thường |
| **Làm online** | Làm từ xa: họp online, WFH buổi sáng/chiều — hiển thị **xanh lá** trên lịch |
| **Khác** | Trường hợp đặc biệt — ghi rõ trong **Ghi chú** |


## Buổi nghỉ (dropdown «Buổi»)

| Giá trị | Ý nghĩa |
|---|---|
| **Cả ngày** | Nghỉ / làm online trọn ngày làm việc |
| **Sáng** | Chỉ buổi sáng (VD: làm online sáng, chiều vào văn phòng) |
| **Chiều** | Chỉ buổi chiều |

**Ví dụ:** *Làm online · Buổi sáng* + ghi chú «Họp online sáng, chiều vào văn phòng» → trên lịch hiện ô **xanh lá**, cột Ghi chú: \`Làm online · Buổi sáng — Họp online sáng…\`.


## Ghi chú hiển thị thế nào?

- Cột **Ghi chú** (lịch & **Danh sách nghỉ**) luôn có dạng: **Loại nghỉ · Buổi — lý do** (nếu bạn nhập).
- Hover / bấm ô trên lịch tháng cũng thấy đủ loại + buổi + lý do.
- **Ghi chú trong form là tùy chọn** — không nhập vẫn lưu được; khi xem vẫn thấy loại + buổi.

**Xuất Excel:** nút **Xuất Excel** trên lịch — cột Ghi chú đã gồm loại + buổi.


## Quyền & mẹo

- **Nhân viên:** tạo đơn cho mình; trạng thái có thể *Chờ duyệt* tùy công ty.
- **Quản lý / Admin:** chọn NV, tạo đơn **Đã duyệt** ngay; lọc theo công ty, khu vực, phòng ban.
- Sửa / xóa: bấm ô trên lịch hoặc menu **Tùy chọn** ở bảng «Đơn nghỉ gần đây».
- **Mẹo:** nghỉ nửa ngày nhưng **không** phải làm online → chọn loại phép + buổi **Sáng/Chiều** → lịch hiện **hồng** (Nửa ngày).`,
  },
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
