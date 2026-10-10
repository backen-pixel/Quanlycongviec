# Kiến trúc mục tiêu — Trợ lý hướng dẫn

> Thiết kế cần đạt tới, rút ra từ việc rà soát một bản tích hợp CopilotKit thử nghiệm.
> Tài liệu này trả lời *vì sao*; các bước thi công ở
> [copilotkit-integration.md](./copilotkit-integration.md).
> Ngày lập: 2026-08-05
>
> ## ⚠️ Phần "vì sao" vẫn đúng — phần "phạm vi" thì KHÔNG
>
> Hệ thống đã dựng xong và đi xa hơn tài liệu này. Khác biệt quan trọng nhất:
>
> **§11 ("Ranh giới không vượt qua") nói *không cho trợ lý đọc dữ liệu CRM thật*.
> Ranh giới đó ĐÃ ĐƯỢC VƯỢT, có chủ ý.** Tool `bao_cao_van_hanh` đọc số liệu vận hành qua
> 22 tool báo cáo tổng hợp. Điều kiện §11 đặt ra ("phải thiết kế lại phân quyền từ đầu") đã
> làm đủ: 4 chốt an toàn trong code, không có tool đọc bản ghi, phạm vi công ty bị ép sau
> khi model sinh tham số, audit từng lần gọi. Chi tiết ở §5 tài liệu hiện trạng.
>
> Ngoài ra: §10.3 (embedding) và §10.4 (telemetry drift) **chưa làm**; phần lưu lịch sử chat
> ở §10 **đã bỏ hẳn** vì gây `RUN_ERROR`.
>
> 👉 **Hiện trạng thật: [guide-assistant-current.md](./guide-assistant-current.md).**
>
> ⚠️ **Giữ ba file docs này lại trước khi tải lại source** — chúng chưa được commit.

---

## 1. Bốn mục tiêu

Cột bên phải là những gì bản thử nghiệm đã vấp phải — lý do tồn tại của thiết kế này.

| # | Mục tiêu | Bản thử nghiệm đã sai ở đâu |
|---|---|---|
| 1 | **Gói gọn, dễ bảo trì** | Code rải ở `components/`, `data/`, `lib/`, `routes/` theo quy ước thư mục |
| 2 | **Tương thích khi codebase đổi** | Không có cơ chế nào phát hiện kiến thức đã mục |
| 3 | **Nắm được bản đồ hệ thống** | Chép tay, phủ 58/191 route; `structure` chi tiết chỉ 2/58 |
| 4 | **Tối ưu prompt thừa** | Nhét cả 58 màn hình vào **mỗi** lượt hỏi (~5.800 token) |

---

## 2. Nguyên tắc kiến trúc

### 2.1 Ba tầng, tách bạch theo tuổi thọ

```
┌─ Tầng 3 — VẬN CHUYỂN (thay thế được) ───────────────────────┐
│  CopilotKit runtime · OpenAIAdapter · CopilotPopup           │
│  Đổi thư viện chỉ đụng 2 file.                               │
└──────────────────────────────────────────────────────────────┘
┌─ Tầng 2 — CẦU NỐI (mỏng, ổn định) ──────────────────────────┐
│  Ngữ cảnh : màn hình đang xem + DOM scan + MỤC LỤC module    │
│  Action   : tra_cuu_he_thong (backend)                       │
│             dieu_huong / chi_cho_toi_nut (client)            │
└──────────────────────────────────────────────────────────────┘
┌─ Tầng 1 — KIẾN THỨC (tài sản, sống lâu nhất) ───────────────┐
│  chunk JSON trong git · embedding · bộ tìm kiếm              │
│  Sinh từ App.jsx + Sidebar.jsx + crawler DOM                 │
└──────────────────────────────────────────────────────────────┘
```

**Ý nghĩa**: kiến thức sống lâu hơn nhà cung cấp. Nếu bỏ CopilotKit, tầng 1 còn nguyên
vẹn và cắm được vào bất kỳ khung chat nào khác.

### 2.2 Sáu quyết định nền

| # | Quyết định | Lý do |
|---|---|---|
| **D1** | Module đặt tên theo **miền** (`features/guide/`), không theo vendor | Lưu lịch sử chat buộc phải dùng `useCopilotChatInternal` — API nội bộ, nên khả năng phải đổi thư viện là có thật. Folder tên `copilotkit/` sẽ nói dối. |
| **D2** | Kiến thức nằm ở **backend**, model **tra khi cần** | Không lộ bản đồ hệ thống ra client; lọc được theo quyền; prompt gọn |
| **D3** | **Sinh** thay vì **chép** mọi thứ suy ra được từ source | Cắt ~60% bề mặt có thể mục trước khi bàn tới cơ chế phát hiện |
| **D4** | Kiến thức lưu trong **git**, không trong DB | PR đổi route thì diff kiến thức hiện ngay trong cùng PR. DB mục im lặng. |
| **D5** | Chunk theo **"việc cần làm"**, không theo route | Một vector cho cả trang là trung bình cộng ngữ nghĩa → nhoè. CRMDashboard 11k dòng nhồi 1 vector là vô dụng. |
| **D6** | Sai thì **báo to**, không đoán bừa | Trợ lý nói sai một cách tự tin còn hại hơn nói "mình chưa rõ" |

---

## 3. Cây thư mục mục tiêu

```
frontend/src/features/guide/          ← toàn bộ UI trợ lý
├── index.js                          ← cửa ra vào duy nhất
├── AppGuideCopilot.jsx               ← launcher nhẹ (bundle chính)
├── AppGuideCopilotPanel.jsx          ← tầng 3 + tầng 2 (lazy chunk)
├── appGuideCopilot.css
├── data/
│   ├── guideContent.js               ← 6 bài hướng dẫn (dùng chung với GuidePage)
│   └── screenRegistry.js             ← 191 path, SINH TỰ ĐỘNG phần khung
└── lib/
    ├── pageStructureScanner.js       ← quét DOM (4 lớp lọc PII)
    ├── uiSpotlight.js                ← vòng sáng chỉ nút
    └── guideChatStorage.js

backend/src/routes/guide/             ← theo pattern routes/crm/ sẵn có
├── index.js                          ← composition root
└── copilotkit.js                     ← runtime + đăng ký backend action
                                        (không có chatHistory.js ở v1 — xem §10)

backend/src/helpers/guideKnowledge.js ← nạp + cache + tìm kiếm (pattern aiBotSkillLibrary)

backend/data/guide-knowledge/         ← TÀI SẢN, nằm trong git
├── screens.json                      ← sinh tự động
├── tasks.json                        ← chunk "việc cần làm"
├── business-rules.json               ← luật nghiệp vụ (viết tay)
└── embeddings.bin                    ← sinh tự động, ~2MB

scripts/guide/                        ← theo pattern scripts/knowledge/ sẵn có
├── generate-registry.js              ← đọc App.jsx + Sidebar.jsx → khung
├── crawl-structure.mjs               ← Playwright quét 191 màn hình
├── build-embeddings.js               ← chunk đổi → embed lại
└── check-drift.js                    ← CỔNG CHẶN BUILD
```

### Ba điểm neo — không thể xoá, chỉ thu nhỏ

| File | Còn lại | Vì sao không bỏ được |
|---|---|---|
| `backend/src/server.js` | 1 dòng | Điểm mount route |
| `frontend/src/App.jsx` | 2 dòng | Render component + class `app-shell` (panel thu hẹp nội dung) |
| `frontend/vite.config.js` | 12 dòng | Tách chunk + chặn preload. **Đừng trừu tượng hoá** — thêm indirection cho 12 dòng config không đáng, chỉ cần comment trỏ về module. |

---

## 4. Ngân sách prompt

| Thành phần | Đẩy hết (bản thử nghiệm) | Tra khi cần (thiết kế này) |
|---|---|---|
| Bản đồ màn hình | ~4.000 (58 màn hình đầy đủ) | ~400 (10 module + ~40 nhóm chức năng) |
| Màn hình đang xem | ~80 | ~80 |
| DOM scan | ~300 | ~300 |
| INSTRUCTIONS | ~1.400 | ~1.400 |
| **Tổng mỗi lượt** | **~5.800** | **~2.200** |
| Kiến thức tra được | 58 màn hình | ~1.000 chunk |

**Cơ chế**: prompt chỉ chứa **mục lục**. Model không cần biết chi tiết — nó cần biết
*cái gì tồn tại* để biết *khi nào phải đi tra*.

Giảm 60% prompt, kiến thức tăng 15 lần.

---

## 5. Ba luồng dữ liệu

### 5.1 Chiều vào — lúc build (kiến thức được sinh ra)

```
App.jsx (191 route) ─┐
Sidebar.jsx (menu)   ├─► generate-registry.js ─► screens.json (khung)
Require* (quyền)    ─┘                              │
                                                     ▼
Playwright crawler ────────────────────────► tasks.json (tab/nút thật)
(gọi scanPageStructure sẵn có)                       │
                                                     ▼
Người viết tay ────────────────────────────► business-rules.json
(summary, keywords, luật nghiệp vụ)                  │
                                                     ▼
                              build-embeddings.js ─► embeddings.bin
                              (hash chunk → chỉ embed cái đổi)
```

### 5.2 Chiều ra — lúc chạy (kiến thức được dùng)

```
User ở /crm/dashboard hỏi "đổi cái ảnh phía sau màn hình kiểu gì"
   │
   ▼  prompt gửi lên ~2.200 token (mục lục, KHÔNG có chi tiết)
   ▼  model nhận ra câu hỏi ngoài màn hình hiện tại → gọi action
   │
   ▼  BACKEND: embed câu hỏi (~150ms) → cosine 1.000 vector (~5ms)
   ▼           → lọc theo req.user.role → top 5
   │
   ▼  { viec: "Đổi hình nền", path: "/settings/theme",
   │     menu: "Cài đặt → Giao diện", nut: "Chọn ảnh nền" }
   │
   ▼  model trả lời + mời dẫn đi → chi_cho_toi_nut → navigate + spotlight
```

### 5.3 Chiều phản hồi — từ production (kiến thức tự vá)

```
highlightByLabel thất bại  ─┐
matchScreen() trả null      ├─► user_activity_log ─► danh sách việc cần vá
model nói "chưa có thông tin"┘                        (dựa trên câu hỏi THẬT)
```

Vòng thứ ba là thứ khiến hệ thống tự bảo trì. Action `chi_cho_toi_nut` vốn đã trả
`{ thanh_cong: false, reason }` khi không tìm thấy nhãn — **đừng vứt giá trị đó đi**,
ghi lại là có ngay danh sách việc cần vá.

---

## 6. Chống drift — bốn lớp

### Lớp 1 — Sinh, đừng chép (phòng ngừa)

`path`, quyền (`RequireCrmElevated`…), đường đi menu (Sidebar.jsx) đều suy ra được
từ source. Người chỉ viết `summary`, `keywords`, điều kiện nghiệp vụ.

### Lớp 2 — Cổng chặn lúc build (phát hiện sớm) ← giá trị cao nhất

`build:frontend` **đã** chạy `node ../scripts/knowledge/sync-screenshots-deploy.js`
trước khi vite build. Chèn thêm `check-drift.js` vào chuỗi đó: route mới mà thiếu mô tả
→ **exit 1** kèm danh sách tiếng Việt. Deploy Render fail ngay, không cần CI.

Biến "trợ lý sai dần theo thời gian" thành "build hỏng, sửa ngay".

### Lớp 3 — Crawler chạy diff, không ghi đè

Trước mỗi release: crawl lại, **so** với chunk hiện có, xuất báo cáo
*"nhãn 'Thêm Page' không còn ở /crm/facebook, thấy 'Kết nối Page'"*. Người duyệt rồi
mới ghi. Ghi đè tự động thì một lần đổi UI hỏng sẽ âm thầm nuốt luôn phần viết tay.

### Lớp 4 — Hạ độ tin cậy theo thời gian

Chunk có `kiem_chung_luc`. Quá 90 ngày chưa crawl lại → kết quả tra cứu kèm cờ, và
INSTRUCTIONS bảo model nói *"mình nhớ là ở đây, nhưng giao diện có thể đã đổi"*.

### Bảng blast radius

| Thay đổi | Hậu quả | Bắt bằng |
|---|---|---|
| Thêm/xoá/đổi route | `matchScreen()` null, hoặc dẫn tới trang chết | Lớp 2 |
| Đổi nhãn nút/tab | Spotlight thất bại (có fallback, hỏng mềm) | Lớp 3 + phản hồi |
| **Đổi đường đi menu** | **Chỉ sai đường, giọng rất tự tin** | Lớp 1 (sinh từ Sidebar) |
| Thêm guard quyền | Dẫn user tới trang họ không vào được | Lớp 1 |
| Đổi luật nghiệp vụ | Giải thích sai luật | ❌ Chỉ người |
| Đổi DOM (`<main>`, `role=tab`) | Scanner rỗng → trợ lý mù | Smoke test |
| Nâng CopilotKit | `useCopilotChatInternal` biến mất | Lúc build/chạy |

Hàng nguy hiểm nhất là **menu**: hỏng im lặng mà trợ lý vẫn trả lời trôi chảy.

---

## 7. Quy trình khi thêm / xoá tính năng

### Thêm màn hình mới

1. Thêm `<Route>` vào `App.jsx` như bình thường
2. Chạy `npm run guide:sync` → sinh khung, báo *"thiếu summary + keywords cho /crm/xyz"*
3. Điền 3 trường: `summary`, `keywords`, `task` chính
4. Build pass

**Quên bước 3 → build fail** kèm tên route thiếu. Không có đường lọt.

### Xoá màn hình

1. Xoá `<Route>`
2. `check-drift.js` báo chunk mồ côi trỏ tới path không tồn tại
3. Xoá chunk → chạy lại `build-embeddings.js` (chỉ đụng chunk đổi)

Không bao giờ còn chunk mồ côi dẫn người dùng tới trang 404.

### Đổi thư viện chat

Chỉ đụng `AppGuideCopilotPanel.jsx` + `routes/guide/copilotkit.js`. Tầng 1 (kiến thức,
scanner, spotlight, embedding) giữ nguyên 100%.

---

## 8. Lộ trình

Dựng mới trên source sạch → **không có giai đoạn chuyển đổi**. Làm thẳng theo kiến trúc
này ngay từ đầu. Các bước thi công chi tiết: [copilotkit-integration.md](./copilotkit-integration.md).

| Bước | Việc | Công | Đạt được |
|------|------|------|----------|
| 1 | Cài package + biến môi trường | 15p | — |
| 2 | `generate-registry.js` → sinh 191 path (client + backend) | 0,5 ngày | **Mục tiêu 3** phần khung |
| 3 | `guideKnowledge.js` — tra cứu keyword | 3h | — |
| 4 | `routes/guide/copilotkit.js` — runtime + backend action | 3h | **Mục tiêu 4** |
| 5 | 3 lib frontend (scanner, spotlight, storage) | 0,5 ngày | — |
| 6 | Panel + launcher + CSS + 3 điểm neo | 0,5 ngày | **Mục tiêu 1** |
| 7 | `check-drift.js` vào chuỗi build | 2h | **Mục tiêu 2** |
| — | **v1 chạy được** | **~2,5 ngày** | |
| 8 | Crawler + chunk theo việc | 1,5 ngày | **Mục tiêu 3** đầy đủ |
| 9 | Embedding (thay ruột `searchKnowledge`, chữ ký không đổi) | 0,5 ngày | Hiểu câu hỏi vòng vo |
| 10 | Telemetry drift vào `user_activity_log` | 3h | Vòng tự vá |

### Vì sao thứ tự này

- **Bước 2 trước hết**: mọi thứ phía sau dựa vào bản đồ màn hình. Sinh tự động ngay từ
  đầu thì không bao giờ rơi vào cảnh chép tay 58/191 rồi mục dần.
- **Bước 4 dùng keyword search**: kiến trúc "tra khi cần" chạy được và kiểm chứng được
  ngay, chưa cần embedding. Bước 9 chỉ thay ruột, không sửa gì phía trên.
- **Bước 7 trước bước 8**: có cổng chặn rồi mới bơm kiến thức, để kiến thức mới sinh ra
  đã nằm dưới sự giám sát.
- **Bước 8–10 làm sau khi v1 chạy ổn**: v1 đã đạt 3/4 mục tiêu, phần còn lại là chiều sâu
  kiến thức chứ không phải kiến trúc.

---

## 9. Ba cái bẫy phải xử lý ở bước 4

**1. Đừng cache handler toàn cục**

Cách viết trực giác là dựng handler một lần rồi tái sử dụng cho mọi request. Làm vậy thì
backend action **vĩnh viễn không thấy `req.user`** — mất luôn khả năng lọc theo quyền.
Phải dựng `CopilotRuntime` **theo từng request** (rẻ), chỉ cache client OpenAI (đắt).

⚠️ **Đừng lấy user từ `ctx.properties`** — trường đó do frontend gửi lên, không tin được.
`ActionsConfiguration` chấp nhận dạng hàm `(ctx) => Action[]`, nhưng nguồn quyền phải là
JWT đã verify.

**2. `matchScreen()` chặn nhầm**

Nếu backend biết 191 màn hình mà registry client chỉ có một phần, model sẽ chỉ đúng
đường mà app từ chối điều hướng. Bước 2 phải sinh **cùng một tập path** cho cả hai phía.

**3. URL ngoài phải khớp tuyệt đối với hằng `ENDPOINT`**

CopilotKit runtime so khớp `req.url` với `endpoint` được cấu hình. Nếu đổi URL công khai
(ví dụ gom thành `/api/guide/copilotkit`) thì phải sửa **đồng thời** hằng `ENDPOINT` trong
route và `runtimeUrl` ở panel — lệch một ký tự là 404.

An toàn nhất: giữ URL ngoài đúng `/api/copilotkit`, chỉ gom file bên trong `routes/guide/`.

---

## 10. Lưu lịch sử chat — không làm ở v1

Bản thử nghiệm trước đã viết 5 endpoint + 2 bảng + RLS + trigger cho việc lưu lịch sử vào
DB, nhưng **không file nào ở frontend gọi tới** — code chết ngay từ đầu.

Nguyên nhân gốc: cơ chế khôi phục lịch sử lên UI vốn không ổn định. CopilotKit khởi tạo
thread **sau** khi mount và ghi đè `messages` về rỗng, nên phải dùng vòng lặp
`setInterval` giành `setMessages` — mà `useCopilotChatInternal` lại là API nội bộ, sẽ vỡ
khi nâng version.

**Quyết định**: v1 dùng localStorage thuần (`guideChatStorage.js`). Chỉ nối DB khi đã
giải quyết được việc khôi phục lên UI, hoặc khi tự dựng chat UI thay `CopilotPopup`.

---

## 11. Ranh giới không vượt qua

**Không cho trợ lý gọi API đọc dữ liệu CRM thật.**

Nó phá vỡ toàn bộ thiết kế chống PII (4 lớp lọc trong `pageStructureScanner`), kéo theo
bài toán RBAC cho từng endpoint, và biến một tính năng read-only an toàn thành bề mặt
tấn công.

Nếu thật sự cần trợ lý trả lời câu hỏi về dữ liệu — đó là **dự án khác**, phải thiết kế
lại phân quyền từ đầu.
