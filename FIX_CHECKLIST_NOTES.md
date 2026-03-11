# 🔧 Fix: Checklist Notes lưu sai dữ liệu

## ❌ Vấn đề:

Khi lưu checklist, trường `notes` bị lưu JSON thay vì text thuần:

```
❌ SAI:
notes = {"assignee_id":"934c6eb9-3367-427b-9b8f-88bb23d393a5"}

✅ ĐÚNG:
notes = "Ghi chú thực tế của user"
assignee_id = "934c6eb9-3367-427b-9b8f-88bb23d393a5" (cột riêng)
```

---

## ✅ Giải pháp:

### 1. Migration SQL - Tách assignee_id ra cột riêng

**File:** `backend/supabase/32_checklist_assignee_column.sql`

**Chức năng:**
```sql
-- 1. Thêm cột assignee_id
ALTER TABLE task_checklists ADD COLUMN assignee_id UUID REFERENCES users(id);

-- 2. Migrate data cũ: Extract assignee_id từ notes JSON
UPDATE task_checklists
SET assignee_id = (notes::jsonb->>'assignee_id')::uuid
WHERE notes IS NOT NULL AND notes ~ '^\{.*\}$';

-- 3. Clean notes: Xóa JSON, chỉ giữ text
UPDATE task_checklists
SET notes = COALESCE(notes::jsonb->>'text', NULL)
WHERE notes IS NOT NULL AND notes ~ '^\{.*\}$';
```

**Kết quả:**
```
TRƯỚC migration:
id | title                  | notes                                    | assignee_id
---|------------------------|------------------------------------------|------------
1  | Khảo sát hiện trạng    | {"assignee_id":"abc-123"}                | NULL

SAU migration:
id | title                  | notes                                    | assignee_id
---|------------------------|------------------------------------------|------------
1  | Khảo sát hiện trạng    | NULL (chưa có ghi chú)                   | abc-123
```

---

### 2. Frontend Fix

#### **TaskCreateModal.jsx**
```javascript
// TRƯỚC (SAI):
checklists: checklists.map(c => ({
  title: c.title,
  notes: c.assignee_id ? JSON.stringify({ assignee_id: c.assignee_id }) : null
}))

// SAU (ĐÚNG):
checklists: checklists.map(c => ({
  title: c.title,
  assignee_id: c.assignee_id || null,
  notes: null  // Notes sẽ nhập sau
}))
```

#### **ProjectDetail.jsx**

**Parse notes (backward compatible):**
```javascript
// Ưu tiên dùng assignee_id từ cột (sau migration)
// Fallback: Parse từ notes JSON (data cũ)
const checklistAssigneeId = c.assignee_id || parseNotes(c.notes).assignee_id;
```

**Lưu notes:**
```javascript
// TRƯỚC (SAI):
const newNotes = JSON.stringify({ text: notesText, assignee_id: userId });
await api.put(`/tasks/checklists/${id}`, { notes: newNotes });

// SAU (ĐÚNG):
await api.put(`/tasks/checklists/${id}`, { notes: notesText.trim() || null });
```

**Lưu assignee:**
```javascript
// Lưu vào cột riêng
await api.put(`/tasks/checklists/${id}`, { assignee_id: userId || null });
```

---

## 📋 Bước Deploy

### Bước 1: Chạy Migration (BẠN CẦN LÀM)
1. Vào **Supabase SQL Editor**
2. Copy file: `backend/supabase/32_checklist_assignee_column.sql`
3. **Paste và Run**

**Kiểm tra migration thành công:**
```sql
-- Xem cột mới
SELECT column_name FROM information_schema.columns 
WHERE table_name = 'task_checklists' AND column_name = 'assignee_id';

-- Xem data đã migrate
SELECT id, title, notes, assignee_id 
FROM task_checklists 
WHERE assignee_id IS NOT NULL OR notes IS NOT NULL
LIMIT 10;
```

### Bước 2: Deploy Frontend
- Code đã push lên GitHub
- Render sẽ auto-deploy (~5 phút)

### Bước 3: Test
1. **Tạo task mới với checklist**
   - Chọn assignee cho checklist item
   - Tạo task

2. **Kiểm tra database:**
   ```sql
   SELECT id, title, notes, assignee_id 
   FROM task_checklists 
   WHERE task_id = '<task-id-vừa-tạo>';
   ```

   **Mong đợi:**
   ```
   id | title            | notes | assignee_id
   ---|------------------|-------|------------
   1  | Khảo sát         | NULL  | abc-123
   ```

3. **Thêm ghi chú:**
   - Vào ProjectDetail → Click checklist item
   - Nhập ghi chú: "Đã chụp ảnh hiện trạng"
   - Save

4. **Kiểm tra lại:**
   ```sql
   SELECT notes FROM task_checklists WHERE id = 1;
   → "Đã chụp ảnh hiện trạng"  (TEXT thuần, không có JSON)
   ```

---

## 🔍 Backward Compatibility

Code mới vẫn **tương thích với data cũ**:

```javascript
// Parse notes: Hỗ trợ cả 2 format
const parseNotes = (raw) => {
  if (!raw) return { text: '', assignee_id: null };
  try {
    const p = JSON.parse(raw);  // Nếu là JSON (data cũ)
    return { text: p.text || raw, assignee_id: p.assignee_id || null };
  } catch {
    return { text: raw, assignee_id: null };  // Nếu là text thuần (data mới)
  }
};

// Ưu tiên cột mới, fallback là JSON cũ
const assigneeId = c.assignee_id || parseNotes(c.notes).assignee_id;
```

**Nghĩa là:**
- ✅ Data cũ (notes = JSON) → Vẫn đọc được assignee_id
- ✅ Sau migration → Dùng cột `assignee_id` riêng
- ✅ Data mới → notes chỉ chứa text

---

## 🧪 Test Cases

### Test 1: Data cũ (trước migration)
```sql
-- Giả sử chưa chạy migration
SELECT * FROM task_checklists WHERE id = 1;
→ notes = '{"assignee_id":"abc-123","text":"Ghi chú"}'
→ assignee_id = NULL

Frontend sẽ:
→ parseNotes(notes) = { text: "Ghi chú", assignee_id: "abc-123" }
→ Hiển thị: assignee_id = "abc-123" ✅
```

### Test 2: Sau migration
```sql
SELECT * FROM task_checklists WHERE id = 1;
→ notes = "Ghi chú"
→ assignee_id = "abc-123"

Frontend sẽ:
→ c.assignee_id = "abc-123" (ưu tiên cột này) ✅
→ parseNotes(notes) = { text: "Ghi chú", assignee_id: null }
→ Hiển thị: assignee_id = "abc-123" ✅
```

### Test 3: Tạo mới (sau deploy frontend)
```sql
-- User tạo checklist mới
INSERT ... → notes = NULL, assignee_id = "abc-123"

-- User nhập ghi chú
UPDATE ... → notes = "Đã hoàn thành", assignee_id = "abc-123"
✅ Không có JSON trong notes
```

---

## ⚠️ Lưu ý

### Nếu không chạy migration:
- ❌ Frontend sẽ lưu `assignee_id` vào cột riêng → DB reject (cột chưa tồn tại)
- ⚠️ **BẮT BUỘC chạy migration trước khi deploy frontend**

### Nếu chỉ chạy migration, không deploy frontend:
- ✅ Database sẵn sàng
- ⚠️ Frontend cũ vẫn lưu JSON vào notes (data bị lỗi lại)
- 💡 **Nên deploy cả 2 cùng lúc**

### Nếu deploy frontend trước, migration sau:
- ❌ API error: `column "assignee_id" does not exist`
- 💡 **Chạy migration TRƯỚC**

---

## ✅ Kết luận

**Thứ tự đúng:**
1. ✅ Chạy migration SQL (thêm cột + migrate data)
2. ✅ Deploy frontend (dùng cột mới)
3. ✅ Test tạo checklist mới

**Kết quả:**
- ✅ `notes` chỉ chứa text ghi chú
- ✅ `assignee_id` là cột riêng (FK users)
- ✅ Attachments vẫn hoạt động bình thường (JSONB riêng)
- ✅ Backward compatible với data cũ

**File migration:** `backend/supabase/32_checklist_assignee_column.sql`

---

**Next step:** Chạy migration trong Supabase SQL Editor! 🚀
