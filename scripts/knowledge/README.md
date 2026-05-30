# Knowledge seed generator

Sinh lại nội dung bài học / bài tập module **Kiến thức**:

```bash
node scripts/knowledge/build-seeds.js
```

**Output:** `database/259_*.sql`, `262_*.sql`, `263_*.sql`, stub `264_*.sql`

**Sửa nội dung:** chỉnh file trong `scripts/knowledge/courses/`, rồi chạy lại script.

**Thứ tự migration gợi ý:** 217 → 219 → 221 → 257 → 258 → 260 → 261 → **272** (xoá seed cũ 218) → 259 → 262 → 263
