# 🎬 DEMO GUIDE - Test Hệ Sinh Thái Đơn Giản Hóa

## 🚀 CÁCH CHẠY DEMO

### **Bước 1: Start Servers**

**Terminal 1 - Backend:**
```bash
cd /home/ubuntu/.openclaw/workspace/employee-workflow/backend
npm run dev
```

**Terminal 2 - Frontend:**
```bash
cd /home/ubuntu/.openclaw/workspace/employee-workflow/frontend
npm run dev
```

✅ **Đợi đến khi thấy:**
- Backend: `Server running on port 3000`
- Frontend: `Local: http://localhost:5173/`

---

### **Bước 2: Login**

1. Mở trình duyệt: **http://localhost:5173/**
2. Login với tài khoản admin:
   ```
   Email: admin@tubep.vn
   Password: admin123
   ```

---

### **Bước 3: Test Wizard (Setup lần đầu)**

#### **Scenario 1: Tạo cấu trúc công ty từ đầu**

1. **Vào trang Hệ Sinh Thái:**
   - Click sidebar → "Cấu Trúc Công Ty"
   - Hoặc: `http://localhost:5173/ecosystem`

2. **Nếu chưa có unit → Wizard tự động hiện:**
   ```
   ┌───────────────────────────────────┐
   │ 🏢 THIẾT LẬP CẤU TRÚC CÔNG TY     │
   │ Progress: ■□□□ 25%               │
   │ BƯỚC 1/4: Tạo Khối               │
   └───────────────────────────────────┘
   ```

3. **Điền Step 1 - Khối:**
   ```
   Tên Khối: Khối Miền Nam
   Mô tả: Quản lý các công ty phía Nam
   
   [+ Thêm Khối] (nếu muốn nhiều khối)
   
   [Tiếp tục ▶]
   ```

4. **Điền Step 2 - Công ty:**
   ```
   Thuộc Khối: Khối Miền Nam
   Tên Công ty: Công ty Tủ Bếp A
   Loại hình: ○ Tủ bếp
   
   [+ Thêm Công ty] (nếu muốn nhiều công ty)
   
   [◀ Quay lại]  [Tiếp tục ▶]
   ```

5. **Chọn Step 3 - Phòng ban:**
   ```
   ☑ 📞 Tư vấn (Sales)
   ☑ 🎨 Thiết kế (Design)
   ☑ 🏭 Sản xuất (Production)
   ☑ 🔧 Lắp đặt (Installation)
   ☐ 💬 Chăm sóc KH
   ☐ 💰 Kế toán
   
   [◀ Quay lại]  [Tiếp tục ▶]
   ```

6. **Step 4 - Xác nhận:**
   ```
   📊 Tổng kết:
   1 Khối | 1 Công ty | 4 Phòng ban
   
   [◀ Quay lại]  [✓ Hoàn tất]
   ```

7. **Bấm "Hoàn tất":**
   - Loading spinner hiện
   - Tạo tất cả units
   - Redirect về trang chính
   - Thấy List View với cấu trúc vừa tạo

**✅ Expected Result:**
```
📦 Khối Miền Nam
 └─ 🏢 Công ty Tủ Bếp A
     ├─ 👔 Tư vấn (Sales)
     ├─ 🎨 Thiết kế (Design)
     ├─ 🏭 Sản xuất (Production)
     └─ 🔧 Lắp đặt (Installation)
```

---

### **Bước 4: Test List View**

#### **Scenario 2: Điều hướng trong List**

1. **Expand/Collapse:**
   - Click **▼** trước "Khối Miền Nam" → Thu gọn
   - Click **▶** → Mở rộng lại
   - Click **▼** trước "Công ty Tủ Bếp A" → Thu gọn

2. **Xem chi tiết:**
   - Click vào tên **"Công ty Tủ Bếp A"**
   - Modal detail hiện ra
   - Thấy thông tin: Name, Description, Members, etc.
   - Đóng modal (X)

3. **Thêm đơn vị con (Admin only):**
   - Hover vào "Công ty Tủ Bếp A"
   - Bấm nút **"+"** (Plus)
   - Modal "Tạo đơn vị con" hiện
   - Điền form → Lưu
   - Đơn vị mới xuất hiện dưới Công ty A

**✅ Expected:**
- Expand/collapse smooth
- Click name → modal
- Admin thấy nút "+" và "Edit"

---

### **Bước 5: Test Search**

#### **Scenario 3: Tìm kiếm đơn vị**

1. **Tìm theo tên:**
   ```
   [🔍 Tìm theo tên đơn vị...]
   
   Gõ: "Tư vấn"
   ```

2. **Kết quả:**
   - Chỉ hiện "Tư vấn (Sales)"
   - Text "Tư vấn" được highlight (màu vàng)
   - Header: "1 đơn vị (đã lọc)"

3. **Clear search:**
   - Bấm nút **X** trong input
   - Hoặc: Bấm "Xóa tất cả"
   - List trở về đầy đủ

**✅ Expected:**
- Real-time search
- Highlight matching text
- Clear button works

---

### **Bước 6: Test Filter**

#### **Scenario 4: Lọc theo cấp**

1. **Filter dropdown:**
   ```
   [Tất cả cấp ▼]
   
   Chọn: "🏢 Chỉ Công ty"
   ```

2. **Kết quả:**
   - Chỉ hiện "Công ty Tủ Bếp A"
   - Không thấy Khối và Phòng ban
   - Header: "1 đơn vị (đã lọc)"
   - Badge: "🏢 Công ty" [X]

3. **Combined search + filter:**
   ```
   Search: "Công ty"
   Filter: "🏢 Chỉ Công ty"
   ```
   - Kết quả: Công ty có chữ "Công ty"
   - 2 badges hiện
   - Bấm "Xóa tất cả" → Clear cả 2

**✅ Expected:**
- Filter works correctly
- Badges show active filters
- Can clear individual or all

---

### **Bước 7: Test View Toggle**

#### **Scenario 5: Chuyển đổi chế độ xem**

1. **Chọn Diagram View:**
   ```
   [📋 Danh sách] [🌳 Sơ đồ] ← Bấm Sơ đồ
   ```

2. **Kết quả:**
   - Hiện org chart tree (sơ đồ cây)
   - Có zoom controls (góc trên)
   - Kéo để di chuyển
   - Ctrl+Scroll để zoom

3. **Zoom controls:**
   - Bấm **[➖]** → Zoom out
   - Bấm **[➕]** → Zoom in
   - Bấm **[⤢]** → Reset về 85%
   - Indicator hiện: "85%"

4. **Switch back to List:**
   ```
   [📋 Danh sách] ← Bấm
   ```
   - Trở về List view
   - Search/filter vẫn giữ nguyên

**✅ Expected:**
- Toggle switches views
- Diagram has zoom controls
- List has search/filter

---

### **Bước 8: Test Help Panel**

#### **Scenario 6: Xem hướng dẫn**

1. **Mở Help:**
   ```
   [❓ Hướng dẫn] ← Bấm
   ```

2. **Kết quả:**
   - Panel hiện dưới header
   - 4 cards:
     - 📋 Chế độ Danh sách
     - 🌳 Chế độ Sơ đồ
     - 📋 Cấu trúc
     - ⚡ Thao tác nhanh
   - Mỗi card có bullets giải thích

3. **Đóng Help:**
   - Bấm **X** (góc trên phải panel)
   - Panel biến mất

**✅ Expected:**
- Help opens/closes smoothly
- Content is helpful
- Cards readable

---

## 🧪 KIỂM TRA DATABASE

### **Xác nhận units đã tạo:**

```sql
-- Connect to Supabase
psql <your_supabase_connection_string>

-- Check ecosystem units
SELECT 
  id, 
  name, 
  level_id,
  parent_id,
  is_active,
  created_at
FROM ecosystem_units
WHERE is_active = true
ORDER BY created_at DESC
LIMIT 20;
```

**Expected:**
- Thấy 6 units (1 Khối + 1 Công ty + 4 Phòng ban)
- Hierarchy đúng (parent_id links)
- All `is_active = true`

---

## 🎯 TEST CASES CHECKLIST

Đánh dấu sau khi test:

### Wizard
- [ ] Step 1: Tạo Khối
- [ ] Step 2: Tạo Công ty
- [ ] Step 3: Chọn Phòng ban
- [ ] Step 4: Xác nhận
- [ ] Progress bar updates
- [ ] Help button works
- [ ] Back/Next navigation
- [ ] Creates units correctly

### List View
- [ ] Expand/collapse works
- [ ] Click name opens modal
- [ ] Admin sees actions
- [ ] Indentation correct
- [ ] Icons show correctly

### Search
- [ ] Real-time search works
- [ ] Highlight matching text
- [ ] Clear button works
- [ ] Empty state shows
- [ ] Result count correct

### Filter
- [ ] Dropdown options correct
- [ ] Filter by level works
- [ ] Active badge shows
- [ ] Clear filter works
- [ ] Combined search+filter works

### View Toggle
- [ ] Toggle switches views
- [ ] List view has search
- [ ] Diagram has zoom
- [ ] State persists in session

### Help Panel
- [ ] Opens/closes
- [ ] 4 cards show
- [ ] Content helpful
- [ ] X button works

---

## 🐛 BUG REPORT (if any)

**Template:**
```
Bug: [Short description]
Steps to reproduce:
1. ...
2. ...
Expected: ...
Actual: ...
Screenshot: [if applicable]
```

---

## 📊 PERFORMANCE CHECK

**Load times:**
- [ ] Initial page load: < 2s
- [ ] Search response: < 100ms
- [ ] Filter response: < 100ms
- [ ] Wizard submit: < 1s
- [ ] Modal open: < 200ms

**Network:**
- [ ] API calls reasonable
- [ ] No unnecessary requests
- [ ] Bundle size acceptable (943KB)

---

## ✅ DEMO COMPLETED

**Date:** ___________  
**Tested by:** ___________  
**Result:** [ ] PASS  [ ] FAIL  [ ] PARTIAL  

**Notes:**
_______________________________________
_______________________________________
_______________________________________

**Screenshots/Videos:**
_______________________________________

---

## 🚀 NEXT STEPS AFTER DEMO

If demo passes:
1. ✅ Mark as tested in TEST_ECOSYSTEM_SIMPLIFIED.md
2. ✅ Update documentation if needed
3. ✅ Prepare for production deployment
4. ✅ Train users (share ECOSYSTEM_SIMPLIFIED_GUIDE.md)

If issues found:
1. 🐛 Log bugs in this file
2. 🔧 Fix issues
3. 🧪 Re-test
4. ✅ Mark as resolved

---

**Demo Guide Version:** 1.0  
**Last Updated:** 2026-03-05  
**Maintained by:** OpenClaw AI Assistant
