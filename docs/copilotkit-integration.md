# Hướng dẫn tích hợp Trợ lý hướng dẫn (CopilotKit) từ đầu

> ## ⛔ TÀI LIỆU ĐÃ LỖI THỜI — ĐỪNG LÀM THEO
>
> Đây là **kế hoạch thi công**, viết TRƯỚC khi dựng. Hệ thống thật đã khác ở nhiều chỗ, và
> làm theo tài liệu này sẽ **tái hiện lại bug đã sửa**. Cụ thể:
>
> - **§5 dạy đúng cái pattern đã hỏng.** `new CopilotRuntime({ actions: [...] })` với
>   `handler` **không còn chạy handler** ở 1.66 — phải dùng `BuiltInAgent` + `defineTool`.
> - **§5 nói 5 bẫy; thực tế 8** (thiếu `maxSteps`, thiếu `BuiltInAgent`, thiếu tool result).
> - **Không có** Claude, tool báo cáo, đọc màn hình, xem ảnh, đếm token, hiển thị suy luận,
>   hay phân quyền theo công ty — toàn bộ phần đó dựng sau tài liệu này.
> - **§7 "lịch sử chat"** đã bị **bỏ hẳn**: đọc `messages` bằng hook thứ hai gây `RUN_ERROR`.
>
> 👉 **Hiện trạng thật nằm ở [guide-assistant-current.md](./guide-assistant-current.md).**
>
> Giữ file này lại vì nó ghi đúng *thứ tự thi công* và *lý do* của các quyết định nền —
> hữu ích khi dựng lại từ đầu, miễn là đối chiếu với tài liệu hiện trạng.
>
> ⚠️ **Giữ ba file docs này lại trước khi tải lại source** — chúng chưa được commit.

---

## 0. Đọc trước khi gõ dòng code đầu tiên

Bản dựng này khác bản thử nghiệm trước ở ba điểm cốt lõi. Làm đúng ngay từ đầu sẽ tiết
kiệm khoảng 3 ngày sửa lại:

| | Cách làm sai (bản cũ) | Cách làm đúng |
|---|---|---|
| **Kiến thức** | Nằm ở frontend, đẩy hết vào prompt mỗi lượt (~5.800 token) | Nằm ở backend, model **tra khi cần** (~2.200 token) |
| **Vị trí file** | Rải theo `components/` `data/` `lib/` | Gom trong `features/guide/` |
| **Bản đồ màn hình** | Chép tay 58/191 route → mục dần | **Sinh tự động** từ `App.jsx` + `Sidebar.jsx` |

**Phạm vi tính năng**: CHỈ hướng dẫn + điều hướng. Không có action ghi dữ liệu. Không
cho trợ lý đọc dữ liệu CRM thật (xem §11 tài liệu kiến trúc).

**Bỏ qua ở v1**: lưu lịch sử chat vào DB. Dùng localStorage (bước 6.3). Bản cũ đã viết
5 endpoint + 2 bảng + RLS nhưng không bao giờ nối vào frontend — code chết ngay từ đầu.
Phần *khôi phục* lịch sử lên UI cũng là tuỳ chọn, xem §7.

---

## 1. Cài đặt & biến môi trường

```bash
cd backend && npm i @copilotkit/runtime openai rxjs
```

```bash
cd frontend && npm i @copilotkit/react-core @copilotkit/react-ui
```

`rxjs` là peer dependency của `@copilotkit/runtime`, không cài sẽ lỗi lúc chạy.

`backend/.env`:

```
OPENAI_API_KEY=sk-...
COPILOTKIT_MODEL=gpt-4o-mini
COPILOTKIT_TELEMETRY_DISABLED=true
```

---

## 2. Cây thư mục sẽ tạo

```
scripts/guide/
├── generate-registry.js              Bước 3
└── check-drift.js                    Bước 9

backend/
├── data/guide-knowledge/
│   ├── screens.json                  Bước 3 — sinh tự động
│   ├── guides.json                   Bước 6 — sinh từ GUIDES
│   ├── tasks.json                    Bước 10 — crawler
│   └── business-rules.json           viết tay, bổ sung dần
├── src/helpers/guideKnowledge.js     Bước 4
└── src/routes/guide/
    ├── index.js                      Bước 5
    └── copilotkit.js                 Bước 5

frontend/src/features/guide/
├── index.js                          Bước 8
├── AppGuideCopilot.jsx               Bước 7
├── AppGuideCopilotPanel.jsx          Bước 7
├── appGuideCopilot.css               Bước 8
├── data/
│   ├── screenRegistry.js             Bước 3 (sinh) — CHỈ path/label/menu
│   └── guideContent.js               Bước 6 — tách từ GuidePage.jsx
└── lib/
    ├── pageStructureScanner.js       Bước 6
    ├── uiSpotlight.js                Bước 6
    └── guideChatStorage.js           Bước 6
```

Hai script còn lại (`crawl-structure.mjs`, `build-embeddings.js`) thuộc phần nâng cao §10.

---

## 3. Sinh bản đồ màn hình

**Làm bước này TRƯỚC TIÊN.** Mọi thứ phía sau dựa vào nó, và đây là thứ quyết định trợ
lý có "biết hết hệ thống" hay không.

`scripts/guide/generate-registry.js` đọc và trích xuất:

| Nguồn | Trích ra |
|---|---|
| `frontend/src/App.jsx` | `<Route path="...">` → toàn bộ ~191 path |
| `frontend/src/App.jsx` | Wrapper `RequireCrmElevated` / `RequireExecutive` / … → trường `admin`, `can_quyen` |
| `frontend/src/components/Sidebar.jsx` | Nhãn + cấp bậc → trường `menu` ("CRM → Bán hàng → Báo giá") |
| `features/guide/data/guideContent.js` | Mảng `GUIDES` → `guides.json` (file này tạo ở bước 6.4) |

⚠️ Nguồn thứ tư chưa tồn tại ở bước 3. Cho generator **bỏ qua êm** khi thiếu file, rồi
chạy lại `npm run guide:sync` sau bước 6.4 để sinh nốt `guides.json`.

Xuất ra **hai** file:

1. `frontend/src/features/guide/data/screenRegistry.js` — **chỉ** `path`, `label`, `menu`.
   Client dùng cho `matchScreen()` (mô tả trang đang xem + validate điều hướng).
   **Không** chứa `summary`/`keywords` → không phình bundle, không lộ mô tả hệ thống.
2. `backend/data/guide-knowledge/screens.json` — bản đầy đủ cho tra cứu.

⚠️ **Hai file phải phủ CÙNG tập path.** Nếu backend biết 191 mà client chỉ validate được
58 thì model chỉ đúng đường mà app từ chối điều hướng. Đây là bug tốn nhiều thời gian
nhất ở bản trước.

Hai trường máy không suy ra được — `summary` và `keywords` — phải viết tay vào
`screens.json`:

```json
{ "path": "/crm/quotations/new",
  "label": "Tạo báo giá mới",
  "menu": "CRM → Bán hàng → Báo giá → Thêm mới",
  "summary": "Lập báo giá cho khách, thêm sản phẩm, xuất PDF",
  "keywords": ["báo giá", "bao gia", "quotation", "giá", "PDF"] }
```

`keywords` **nên có cả dạng không dấu** — nhân viên gõ nhanh thường bỏ dấu.

Thêm script vào `backend/package.json`:

```json
"guide:sync": "node ../scripts/guide/generate-registry.js"
```

---

## 4. Backend — bộ tra cứu kiến thức

`backend/src/helpers/guideKnowledge.js`. Theo đúng pattern `helpers/aiBotSkillLibrary.js`
sẵn có: đọc JSON lúc boot, cache ở module level.

```js
const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname, '..', '..', 'data', 'guide-knowledge');
let cache = null;

/**
 * Bỏ dấu tiếng Việt để "bao gia" khớp được "báo giá".
 *
 * ⚠️ Dải dấu thanh viết bằng new RegExp + chuỗi escape, KHÔNG viết regex literal.
 * Nếu gõ thẳng dải ký tự dấu vào regex literal thì trong source sẽ là các combining
 * mark vô hình — editor, clipboard và git rất dễ làm hỏng chúng, và hỏng rồi thì
 * nhìn mắt thường không phát hiện được.
 */
const COMBINING = new RegExp('[\\u0300-\\u036f]', 'g');

function fold(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(COMBINING, '')
    .replace(/[đĐ]/g, 'd')   // đ, Đ — không nằm trong dải dấu thanh
    .toLowerCase()
    .trim();
}

function load() {
  if (cache) return cache;
  const chunks = [];
  for (const f of ['screens.json', 'tasks.json', 'business-rules.json']) {
    try {
      const raw = JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8'));
      chunks.push(...(Array.isArray(raw) ? raw : []));
    } catch { /* file chưa có → bỏ qua */ }
  }
  cache = chunks;
  return cache;
}

/** Điểm khớp thô cho v1: keywords nặng ký nhất, summary nhẹ nhất. */
function scoreOf(chunk, q) {
  const hit = (text, weight) => (text && fold(text).includes(q) ? weight : 0);
  return hit((chunk.keywords || []).join(' '), 5)
       + hit(chunk.viec, 4)
       + hit(chunk.label, 3)
       + hit(chunk.summary, 1);
}

/**
 * @param {string} query   câu hỏi của người dùng
 * @param {{isAdmin: boolean}} opts  quyền lấy từ JWT, KHÔNG từ client
 */
function searchKnowledge(query, { isAdmin = false } = {}) {
  const q = fold(query);
  if (!q) return [];

  return load()
    .filter((c) => isAdmin || !c.can_quan_tri)          // lọc quyền TRƯỚC khi xếp hạng
    .map((c) => ({ c, score: scoreOf(c, q) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map((x) => x.c);
}

module.exports = { searchKnowledge };
```

§10.3 sẽ thay ruột `scoreOf()` bằng cosine similarity — **giữ nguyên chữ ký
`searchKnowledge()`** thì không phải sửa gì phía trên.

---

## 5. Backend — route CopilotKit

`backend/src/routes/guide/copilotkit.js`. **Năm cái bẫy, đều đã trả giá để biết:**

```js
// BẪY 1: thiếu dòng này thì @copilotkit/runtime ném lỗi decorator lúc require.
require('reflect-metadata');

const { Router } = require('express');
const { CopilotRuntime, OpenAIAdapter, copilotRuntimeNodeExpressEndpoint } = require('@copilotkit/runtime');
const OpenAI = require('openai');
const { auth } = require('../../middleware/auth');
const { isAdminLike } = require('../../helpers/adminRole');
const { searchKnowledge } = require('../../helpers/guideKnowledge');

const r = Router();
const ENDPOINT = '/api/copilotkit';
const MODEL = process.env.COPILOTKIT_MODEL || process.env.OPENAI_MODEL || 'gpt-4o-mini';

// BẪY 2: client OpenAI đắt → cache. Runtime rẻ → dựng MỖI REQUEST.
// Không được cache cả handler như bản cũ: action cần req.user để lọc quyền,
// mà handler dựng một lần thì vĩnh viễn không thấy user nào.
let openaiClient = null;
function getOpenAI() {
  if (!openaiClient) openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return openaiClient;
}

function buildHandler(user) {
  const runtime = new CopilotRuntime({
    actions: () => [{
      name: 'tra_cuu_he_thong',
      description:
        'Tra cứu màn hình / thao tác / quy tắc trong hệ thống theo câu hỏi tiếng Việt. '
        + 'Gọi khi người dùng hỏi về tính năng KHÔNG nằm trên màn hình đang xem.',
      parameters: [{
        name: 'cau_hoi', type: 'string', required: true,
        description: 'Nguyên văn điều người dùng muốn làm, ví dụ "đổi ảnh nền màn hình".',
      }],
      // BẪY 3: quyền lấy từ JWT đã verify. TUYỆT ĐỐI không lấy từ ctx.properties —
      // trường đó do frontend gửi lên, người dùng sửa được.
      handler: async ({ cau_hoi }) => searchKnowledge(cau_hoi, { isAdmin: isAdminLike(user) }),
    }],
  });

  return copilotRuntimeNodeExpressEndpoint({
    runtime,
    serviceAdapter: new OpenAIAdapter({ openai: getOpenAI(), model: MODEL }),
    endpoint: ENDPOINT,
  });
}

r.use(auth);   // trợ lý mô tả cấu trúc nội bộ → không mở công khai

r.use('/', (req, res, next) => {
  if (!process.env.OPENAI_API_KEY) {
    return res.status(503).json({
      error: 'Trợ lý hướng dẫn chưa sẵn sàng',
      hint: 'Server chưa cấu hình OPENAI_API_KEY. Liên hệ quản trị viên.',
    });
  }

  // BẪY 4: Express cắt mount path → req.url còn "/", trong khi runtime so khớp với
  // `endpoint` = "/api/copilotkit" nên trả 404. Trả lại URL đầy đủ.
  req.url = req.originalUrl;

  // BẪY 5: handler là async. try/catch đồng bộ KHÔNG bắt được promise reject —
  // lỗi rơi ra ngoài thành 500 body rỗng, rất khó chẩn đoán. Phải bắt cả hai.
  let out;
  try {
    out = buildHandler(req.user)(req, res);
  } catch (e) { return failed(e, res, next); }
  return Promise.resolve(out).catch((e) => failed(e, res, next));
});

function failed(e, res, next) {
  console.error('[guide] handler error:', e?.stack || e?.message || e);
  if (res.headersSent) return undefined;
  if (process.env.NODE_ENV === 'production') return next(e);
  return res.status(500).json({ error: 'guide_handler_failed', message: String(e?.message || e) });
}

module.exports = r;
```

### ⚠️ Bẫy thứ sáu — nằm ở `server.js`, không phải file này

**KHÔNG được bypass `express.json()`** cho đường dẫn này.

Runtime dựng lại Request theo hai nhánh: stream chưa đọc → đọc thẳng; stream đã đọc →
dựng từ `req.body`. Hàm `isStreamConsumed()` coi là "đã đọc" khi `req.complete = true`,
mà với request nhỏ Node thường nhận trọn body **trước khi** handler chạy. Khi đó nếu
`req.body` là `undefined`, runtime gửi body RỖNG và trả 400 *"Invalid JSON payload"*.

Lỗi này **ngắt quãng** — đo được hỏng 1/8 request. Rất tốn thời gian truy nếu không biết trước.

### Mount

`backend/src/routes/guide/index.js`:

```js
const { Router } = require('express');
const r = Router();
r.use('/', require('./copilotkit'));
module.exports = r;
```

`server.js` — thêm cạnh các route khác:

```js
try { app.use('/api/copilotkit', require('./routes/guide')); } catch (e) { console.warn('⚠️ Guide route failed to load:', e.message); }
```

⚠️ Giữ URL ngoài đúng `/api/copilotkit` để khớp hằng `ENDPOINT`. Lệch một ký tự là 404.

---

## 6. Frontend — bốn file nền

Cả bốn file này **không phụ thuộc CopilotKit**, viết trước và test riêng được.

### 6.1 `lib/pageStructureScanner.js` — quét DOM

Kết quả **gửi lên OpenAI mỗi lượt hỏi** → chỉ trích khung giao diện, tuyệt đối không lấy
dữ liệu khách. **Bốn lớp phòng vệ, không được bớt lớp nào:**

1. **Chỉ quét trong `<main>`** — lớp quan trọng nhất. Widget nổi (MessengerDock,
   PinnedProjectsWidget) nằm NGOÀI `<main>`. Đo thực tế trên `/crm/facebook`: quét cả
   `document` cho 38 mục, lẫn cả tên nhân viên và nội dung tin nhắn. Quét trong `<main>`
   cho 11 mục, sạch hoàn toàn.
2. **Whitelist theo vai trò phần tử**: chỉ `<button>`, `[role=tab]`, `<label>`,
   `[placeholder]`. **Không lấy `<h1>`/`<h2>`** — trên trang chi tiết, tiêu đề chính là
   tên khách hàng.
3. **Lọc pattern PII**: `\d{5,}` (SĐT), `@` (email), `·` (app nối "tên·SĐT"),
   `\d+[.,]\d{3}` (tiền), `LEAD-\d+|DEAL-\d+`.
4. **Giới hạn**: nhãn 2–40 ký tự, tối đa 60 mục mỗi nhóm.

Thêm `stripBadge()` bỏ số badge dính đuôi ("Cài đặt11" → "Cài đặt"), chỉ cắt khi số dính
liền chữ để không phá "Top 10" hay "Quý 4".

Trả về `{ tabs, buttons, fields, ghi_chu }`.

### 6.2 `lib/uiSpotlight.js` — vòng sáng chỉ nút

Tìm element theo **nhãn hiển thị**, không theo CSS selector — model không thể biết
selector, mà hard-code selector cho 191 route sẽ hỏng ngay lần đổi giao diện đầu tiên.

- Khớp chính xác trước; khớp chứa thì chọn nhãn **ngắn nhất** (tránh bắt trúng khối cha)
- `waitForLabel()` poll 150ms, tối đa 4 giây — trang vừa navigate chưa render xong
- Auto-clear **45 giây**, không phải 10s: người dùng còn đang đọc câu trả lời rồi mới
  nhìn lên màn hình. Đã đo thấy 10s tắt trước khi họ kịp thấy.
- Overlay bám theo scroll/resize, tự tắt khi click đúng nút
- Phạm vi tìm giới hạn trong `<main>`, giống scanner

### 6.3 `lib/guideChatStorage.js` — lưu lịch sử

- Key **kèm userId**: `tubep_guide_chat_v1:<userId>`. Máy dùng chung ở xưởng/showroom mà
  lưu chung khoá thì người sau đọc được nội dung người trước hỏi.
- `pruneOtherUsers(userId)` — xoá dữ liệu tài khoản khác khi trợ lý khởi động
- ⚠️ `saveChatHistory()` **không xoá khoá khi mảng rỗng**. Lúc mở panel, effect khôi phục
  và effect lưu cùng chạy; effect lưu thấy `messages` vẫn rỗng và ghi đè mất dữ liệu vừa
  đọc. Muốn xoá thì gọi `clearChatHistory()` tường minh.
- Giới hạn 60 tin nhắn / 200KB

### 6.4 `data/guideContent.js` — nội dung hướng dẫn từng bước

Source sạch có sẵn `pages/GuidePage.jsx` với mảng `GUIDES` (6 bài, mỗi bài 4–6 bước)
viết thẳng trong file. Tách mảng đó ra `features/guide/data/guideContent.js`, rồi
`GuidePage.jsx` import ngược lại:

```js
import { GUIDES } from '../features/guide/data/guideContent';
```

Logic hiển thị của GuidePage giữ nguyên, file giảm ~207 dòng.

**Vì sao phải tách**: `generate-registry.js` đọc file dữ liệu thuần này để sinh
`guides.json` cho backend. Một nguồn sự thật duy nhất — người viết nội dung vẫn sửa ở
`guideContent.js`, kiến thức backend tự dẫn xuất theo (nguyên tắc D3: sinh, đừng chép).

Mỗi bước thành một chunk tra cứu được:

```json
{ "viec": "Tạo báo giá — bước 3: Thêm sản phẩm vào báo giá",
  "chu_de": "crm-quotation", "thu_tu": 3,
  "path": "/crm/quotations/new",
  "noi_dung": "...", "luu_y": "...",
  "keywords": ["báo giá", "bao gia", "thêm sản phẩm"] }
```

⚠️ **Không tạo action `tra_cuu_cac_buoc` riêng ở client.** Bản thử nghiệm có action đó
vì kiến thức nằm ở frontend. Ở kiến trúc này các bước đã nằm trong `guides.json`, model
lấy qua `tra_cuu_he_thong` như mọi kiến thức khác — một cửa tra cứu duy nhất.

---

## 7. Frontend — panel trợ lý

### Tách hai file — bắt buộc

Thư viện CopilotKit nặng ~3,5MB (951KB gzip) và widget hiện trên **mọi** trang. Import
thẳng thì mọi người dùng tải 951KB dù không bao giờ mở trợ lý.

- `AppGuideCopilot.jsx` (~47 dòng) — chỉ vẽ nút ✨, import tĩnh vào `App.jsx`. Chưa đăng
  nhập thì `return null`.
- `AppGuideCopilotPanel.jsx` — toàn bộ CopilotKit, `lazy()` load khi bấm nút. Đóng panel
  → unmount hoàn toàn.

### Ngữ cảnh gửi lên — chỉ 4, và phải GỌN

Đây là điểm khác biệt lớn nhất so với bản cũ. **Không** gửi cả bản đồ màn hình.

| # | Ngữ cảnh | Token |
|---|---|---|
| 1 | Màn hình đang xem — `matchScreen(pathname)` | ~80 |
| 2 | Cấu trúc giao diện — `scanPageStructure()`, quét lại mỗi 4s | ~300 |
| 3 | Thông tin user — tên, vai trò, có phải admin | ~30 |
| 4 | **Mục lục module** — ~10 module + ~40 nhóm chức năng | ~400 |

Ngữ cảnh 4 chỉ để model biết *cái gì tồn tại*, từ đó biết *khi nào cần gọi
`tra_cuu_he_thong`*. Chi tiết nằm ở backend.

Ngữ cảnh 2 phải quét **định kỳ**, không chỉ khi đổi route: người dùng chuyển tab trong
cùng một trang mà URL không đổi.

### Action phía client — chỉ 2

| Action | Việc |
|---|---|
| `dieu_huong_toi_trang` | Mở trang. Bắt buộc `startsWith('/')`, chặn `//` và `://`, và **phải khớp `matchScreen()`** |
| `chi_cho_toi_nut` | Điều hướng + `highlightByLabel()`. Không thấy → trả danh sách đang hiển thị để model chọn lại |

Action `tra_cuu_he_thong` nằm ở **backend** (bước 5), không khai báo ở đây.

### Provider

```jsx
<CopilotKit
  runtimeUrl={`${resolveApiOrigin()}/api/copilotkit`}
  headers={{ Authorization: `Bearer ${token}` }}
  showDevConsole={!import.meta.env.PROD}
  enableInspector={!import.meta.env.PROD}
>
```

⚠️ `showDevConsole` và `enableInspector` là **hai prop khác nhau**. Prop đầu là nút
Help/Debug trên header; prop sau là bảng inspector đầy đủ (AG-UI Events, Frontend Tools,
Context, Threads). Không truyền thì mặc định bật theo `isLocalhost()` — truyền tường minh
để production chắc chắn tắt.

### Lịch sử chat — tách rõ "lưu" và "khôi phục"

Hai việc này có độ rủi ro rất khác nhau, đừng gộp làm một:

| | Trạng thái | Làm ở v1? |
|---|---|---|
| **Lưu** vào localStorage | Chạy tốt, không đụng API nội bộ | ✅ Có (bước 6.3) |
| **Khôi phục** lên UI CopilotKit | Không ổn định, phải dùng API nội bộ | ⚠️ Tuỳ chọn |

Phần khôi phục cần `useCopilotChatInternal()` — bản 1.64 đã bỏ `messages`/`setMessages`
khỏi `useCopilotChat` công khai, còn `useCopilotMessagesContext` **luôn trả mảng rỗng**.

Hai bẫy nếu vẫn làm phần khôi phục:

1. CopilotKit khởi tạo thread **sau** khi mount và ghi đè messages về rỗng. Gọi
   `setMessages` một lần đều bị xoá → phải gọi **lặp** (500ms × 20), dừng khi thấy có nội dung.
2. **Không dùng cờ `if (đã chạy) return`** ở đầu effect. App bật `<StrictMode>`, effect
   chạy 2 lần; lần đầu tạo interval rồi bị cleanup dọn, lần hai bị cờ chặn → không
   interval nào tồn tại, khôi phục im lặng thất bại.

Cơ chế này vốn mong manh — nó "giành" state với vòng đời nội bộ của thư viện. Nếu v1 bỏ
phần khôi phục thì lịch sử vẫn được lưu đủ, chỉ là mở lại panel sẽ thấy khung chat trống.
Đổi lại: không phụ thuộc API nội bộ, nâng version CopilotKit không vỡ.

### System prompt

Viết bằng tiếng Việt, xưng "mình" / gọi "bạn". Các quy tắc bắt buộc:

- **Chỉ dùng thông tin trong ngữ cảnh + kết quả tra cứu.** Không bịa tên màn hình/nút/path.
  Không tìm thấy thì nói thật và gợi ý mở `/guide`.
- **Luôn nêu đường đi trên MENU** — người mới quen nhìn menu hơn gõ URL.
- **Luồng 3 nhịp**: (1) trả lời ngắn tính năng nằm đâu → (2) hỏi "bạn có muốn mình dẫn
  tới đó không?" rồi **DỪNG** → (3) chỉ khi người dùng đồng ý mới gọi `chi_cho_toi_nut`.
  **Ngoại lệ**: nếu ngay câu đầu họ đã nói "dẫn mình đi luôn" thì bỏ nhịp 2.
- **Thao tác trong tab chưa mở**: làm sáng TÊN TAB trước, mỗi lần một bước.
- **Khi `chi_cho_toi_nut` báo không thấy**: nó trả kèm danh sách đang hiển thị → phải
  **gọi lại ngay trong cùng lượt** với nhãn có trong danh sách. Không nói suông "bạn bấm
  vào X" — người dùng cần thấy vùng phát sáng. Không lặp lại đúng nhãn vừa thất bại.
- **Không trả lời câu hỏi về dữ liệu** (tên khách, SĐT, giá trị deal). Dữ liệu đó không
  được gửi cho model.
- **Không thao tác hộ.**

⚠️ Nội dung `labels.initial` render bằng markdown: **xuống dòng đơn bị gộp** thành một
đoạn liền. Phải dùng `\n\n` và danh sách `- `.

---

## 8. Cắm vào app — ba điểm neo

### `App.jsx` (2 dòng)

```jsx
import { AppGuideCopilot } from './features/guide';
```

```jsx
<div className="app-shell flex h-screen ...">   {/* thêm class app-shell */}
  ...
  {!crmOnly && <PinnedProjectsWidget />}
  <AppGuideCopilot />
</div>
```

Class `app-shell` là mốc để CSS thu hẹp nội dung khi panel mở.

### `appGuideCopilot.css`

| Selector | Việc | Vì sao |
|---|---|---|
| `.copilotKitButton { display: none }` | Ẩn nút mặc định | Không ẩn thì **hai nút chồng nhau** ở góc phải dưới |
| `.copilotKitWindow` | Full height, dán mép phải, z-index **60** | Mặc định là hộp nổi bo góc, phí diện tích |
| `body.app-guide-panel-open .app-shell` | `padding-right` (≥1024px) | Panel `fixed` che mất nút đang highlight → vòng sáng vô nghĩa |
| `.app-guide-spotlight` | z-index **55**, `pointer-events: none` | Dưới panel, trên nội dung; vẫn bấm được nút bên dưới |
| `body.app-guide-hide-inspector cpk-web-inspector` | Ẩn ở production | `showDevConsole={false}` **không** tắt được nó, và nó kèm banner tiếp thị |

Thứ tự z-index: nội dung < spotlight (55) < panel (60).

### `vite.config.js` (12 dòng)

```js
build: {
  modulePreload: {
    // Vite chèn <link modulepreload> cho mọi vendor chunk vào index.html → trình duyệt
    // tải 950KB ngay ở trang login dù chưa mở trợ lý.
    resolveDependencies: (_f, deps) => deps.filter((d) => !d.includes('vendor-copilotkit')),
  },
  rollupOptions: {
    output: {
      manualChunks(id) {
        // Không tách thì Rollup gộp chung với chunk mermaid (~2,5MB) vì cùng
        // phụ thuộc react-markdown.
        if (id.includes('@copilotkit') || id.includes('@ag-ui')) return 'vendor-copilotkit';
      },
    },
  },
}
```

**Đừng trừu tượng hoá 12 dòng này** vào module — thêm indirection không đáng, chỉ cần
comment trỏ về `features/guide/`.

---

## 9. Cổng chặn drift

`scripts/guide/check-drift.js` — so `App.jsx` với `screens.json`, thiếu route nào thì
**exit 1** kèm danh sách tiếng Việt.

Chèn vào chuỗi build sẵn có trong `backend/package.json`:

```json
"build:frontend": "node ../scripts/guide/check-drift.js && node ../scripts/knowledge/sync-screenshots-deploy.js && cd ../frontend && npm ci --prefer-offline --no-audit && npm run build"
```

Deploy Render fail ngay khi có route mới chưa mô tả. Không cần CI.

**Quy trình thêm màn hình mới**: thêm `<Route>` → `npm run guide:sync` → điền `summary`
+ `keywords` → build pass. Quên bước điền thì build fail kèm tên route.

---

## 10. Nâng cao — làm sau khi v1 chạy ổn

### 10.1 Crawler quét cấu trúc thật

`scripts/guide/crawl-structure.mjs` (Playwright): đăng nhập → duyệt 191 route → ở mỗi
route bấm lần lượt từng tab → gọi `scanPageStructure()` → dump JSON.

Cho ra `structure` cho **toàn bộ** màn hình, và thấy được cả **tab chưa mở** — thứ DOM
scan lúc runtime không lấy được.

⚠️ Chạy **diff**, không ghi đè. Xuất báo cáo *"nhãn 'Thêm Page' không còn ở /crm/facebook,
thấy 'Kết nối Page'"* để người duyệt. Ghi đè tự động thì một lần đổi UI hỏng sẽ âm thầm
nuốt luôn phần viết tay.

### 10.2 Chunk theo "việc cần làm"

Đừng embed nguyên route thành một vector — một vector là trung bình cộng ngữ nghĩa của
mọi thứ trang đó làm, trang càng nhiều chức năng càng nhoè.

```json
{ "viec": "Chuyển deal sang Sản xuất",
  "path": "/crm/dashboard", "menu": "CRM → Kanban", "tab": "Kanban",
  "nut": "Chuyển SX",
  "dieu_kien": "chỉ hiện ở stage bật show_sx_transfer",
  "tu_khoa": ["chuyển sx", "đẩy sang sản xuất", "lên đơn sản xuất"] }
```

191 route × ~5 việc ≈ 1.000 chunk.

### 10.3 Embedding

`text-embedding-3-small` với `dimensions: 512` → 1.000 vector = **2MB**, nạp thẳng vào
RAM lúc boot. Cosine qua 1.000 vector mất **dưới 5ms**.

**Không cần vector DB.** pgvector chỉ đáng bật khi vượt ~100k vector.

Hash từng chunk, chỉ embed lại chunk có hash đổi. Chi phí lần đầu ~$0,002.

Đổi ruột `scoreOf()` sang lai vector + keyword — keyword thắng ở thuật ngữ chính xác
("Kanban", "SLA"), vector thắng ở diễn đạt vòng vo ("cái ảnh phía sau màn hình").

### 10.4 Telemetry drift

Ghi vào `user_activity_log` sẵn có:

- `highlightByLabel` thất bại → **nhãn nút đã đổi**, biết chính xác màn hình nào
- `matchScreen()` trả null → **route mới chưa mô tả**
- Model nói "chưa có thông tin" → **lỗ hổng kiến thức có thật**, đúng câu người dùng hỏi

Action `chi_cho_toi_nut` đã trả `{ thanh_cong: false, reason }` — chỉ cần ghi lại. Đây là
nguồn chính xác nhất để biết nên viết chunk gì tiếp theo.

---

## 11. Nghiệm thu v1

- [ ] Chưa đăng nhập → không thấy nút ✨
- [ ] Trang login **không** tải chunk `vendor-copilotkit` (kiểm tra tab Network)
- [ ] Bấm ✨ → panel mở, nội dung app thu hẹp lại chứ không bị che
- [ ] Hỏi "trang này là gì?" → mô tả đúng màn hình đang xem
- [ ] Hỏi về tính năng ở module khác → model **gọi `tra_cuu_he_thong`** (xem inspector),
      không tự bịa
- [ ] Đồng ý "dẫn mình đi" → điều hướng đúng + vòng sáng xuất hiện, giữ 45s
- [ ] Hỏi "khách hàng nào đang ở stage X" → **từ chối**, nói chỉ hỗ trợ hướng dẫn
- [ ] Tài khoản không phải admin → kết quả tra cứu **không** chứa màn hình admin
- [ ] Gửi 20 tin liên tiếp → không có request nào trả 400 *"Invalid JSON payload"*
- [ ] Build production → không thấy `cpk-web-inspector` và banner tiếp thị
- [ ] Thêm một `<Route>` mới rồi build → **build fail** kèm tên route thiếu mô tả
