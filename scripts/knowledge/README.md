# Knowledge seed generator

Sinh lại nội dung bài học / bài tập module **Kiến thức** theo khung **5 trụ**:

1. **Tư tưởng** — Vì sao?
2. **Tư duy** — Cách nghĩ / phân biệt
3. **Nguồn lực** — Màn hình, công cụ, dữ liệu
4. **Vận hành** — Làm từng bước (+ Mẹo mentor)
5. **Báo cáo & Sửa chữa** — Tự kiểm, lỗi hay gặp, KPI

```bash
node scripts/knowledge/build-seeds.js
```

**Output:** `database/259_*.sql` (Lead), `262_*.sql` (Deal), `263_*.sql` (Hướng dẫn CRM), stub `264_*.sql`

**Sửa nội dung:** chỉnh `scripts/knowledge/courses/*-data.js` hoặc `lead.js` / `deal.js` / `guide.js`, rồi chạy lại script.

**Bài tập:** ~12–15 câu/bài (thi tổng kết ~20 câu), phân bổ 5 trụ + checklist/essay khi cần.

## Ảnh minh họa (screenshot CRM)

**Quy ước:** `uploads/knowledge-screenshots/{course}-{NN}.png`  
- `course`: `lead` | `deal` | `guide`  
- `NN`: `01`–`13` (12 bài + thi tổng kết)  
- **39 ảnh** = 3 khoá × 13 bài — gắn **ảnh bìa**, **inline trong bài**, **gallery đính kèm**

```bash
node scripts/knowledge/capture-screenshots.js          # kiểm tra 39/39
node scripts/knowledge/build-seeds.js                # nhúng ảnh vào SQL
# DB: 259 → 262 → 263
```

Chụp lại: `--print-mcp` (MCP Chrome) hoặc `--puppeteer` (cần env email/pass).

**Thứ tự migration gợi ý:** 217 → … → 261 → **272** → **277** (cập nhật seed 5 trụ) hoặc chạy lại 259 → 262 → 263
