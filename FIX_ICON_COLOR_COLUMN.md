# 🔧 Fix: column ecosystem_units.icon does not exist

## ❌ Lỗi:
```
GET /api/divisions
Status: 500 Internal Server Error
Error: column ecosystem_units.icon does not exist
```

---

## ✅ Đã fix!

### 1. Migration SQL mới
**File:** `backend/supabase/31_add_icon_color_ecosystem.sql`

**Chức năng:**
- Thêm 2 cột: `icon` (VARCHAR) và `color` (VARCHAR) vào `ecosystem_units`
- Update 4 Khối với icon/color mặc định:
  - **KD** → 💼 (xanh dương #3B82F6)
  - **SX** → 🏭 (cam #F59E0B)
  - **VC** → 🚛 (xanh lá #10B981)
  - **LD** → 🔧 (đỏ #EF4444)

### 2. Backend API đã sửa
**File:** `backend/src/routes/divisions.js`

**Thay đổi:**
```javascript
// SELECT thêm icon, color
.select('id, name, short_name, code, description, logo_url, icon, color, order_index')
```

---

## 📋 Bước Deploy

### Bước 1: Chạy Migration trong Supabase
1. Vào **Supabase SQL Editor**
2. Copy nội dung file: `backend/supabase/31_add_icon_color_ecosystem.sql`
3. Paste và **Run**

**Kết quả mong đợi:**
```sql
-- Verify query sẽ hiển thị:
code | name                  | icon | color
-----|----------------------|------|----------
KD   | Khối Kinh doanh      | 💼   | #3B82F6
SX   | Khối Sản xuất        | 🏭   | #F59E0B
VC   | Khối Vận chuyển      | 🚛   | #10B981
LD   | Khối Lắp đặt & CSKH  | 🔧   | #EF4444
```

### Bước 2: Deploy Backend
Backend đã được push lên GitHub. Render sẽ tự động deploy.

**Hoặc Manual Deploy:**
1. Vào **Render Dashboard** → **tubep-backend**
2. Click **"Manual Deploy"** → **"Clear build cache & deploy"**
3. Đợi build xong (~2-3 phút)

### Bước 3: Test API
```bash
# Lấy token
TOKEN=$(curl -s -X POST https://tubep-backend.onrender.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@tubep.vn","password":"admin123"}' \
  | grep -o '"token":"[^"]*"' | cut -d'"' -f4)

# Test API
curl https://tubep-backend.onrender.com/api/divisions \
  -H "Authorization: Bearer $TOKEN"
```

**Response mong đợi:**
```json
{
  "divisions": [
    {
      "id": "uuid-kd",
      "code": "KD",
      "name": "Khối Kinh doanh",
      "icon": "💼",
      "color": "#3B82F6",
      "description": "Tư vấn, Thiết kế, Báo giá, Hợp đồng"
    },
    ...
  ]
}
```

---

## 🧪 Kiểm tra Migration đã chạy chưa

### Cách 1: Query trực tiếp
```sql
-- Trong Supabase SQL Editor
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'ecosystem_units' 
  AND column_name IN ('icon', 'color');
```

**Kết quả mong đợi:**
```
column_name | data_type
------------|-------------
icon        | character varying
color       | character varying
```

### Cách 2: Select dữ liệu
```sql
SELECT code, name, icon, color 
FROM ecosystem_units 
WHERE level_id = (SELECT id FROM ecosystem_levels WHERE slug = 'division')
ORDER BY code;
```

**Nếu thành công:** Sẽ hiển thị 4 Khối với icon/color  
**Nếu lỗi:** `column "icon" does not exist` → Migration chưa chạy

---

## ⚠️ Troubleshooting

### Lỗi: API vẫn 500 sau khi migration
**Nguyên nhân:** Backend chưa restart hoặc cache

**Giải pháp:**
1. Vào Render → **tubep-backend** → **Manual Deploy**
2. Hoặc đợi Render auto-deploy (~5 phút)
3. Hard refresh frontend (Ctrl+Shift+R)

### Lỗi: Migration failed
**Nguyên nhân:** Syntax error hoặc quyền

**Giải pháp:**
1. Kiểm tra lỗi trong Supabase SQL Editor
2. Chạy từng câu lệnh một:
   ```sql
   -- 1. Thêm cột
   ALTER TABLE ecosystem_units ADD COLUMN icon VARCHAR(20);
   ALTER TABLE ecosystem_units ADD COLUMN color VARCHAR(20);
   
   -- 2. Update dữ liệu
   UPDATE ecosystem_units SET icon = '💼', color = '#3B82F6' WHERE code = 'KD';
   UPDATE ecosystem_units SET icon = '🏭', color = '#F59E0B' WHERE code = 'SX';
   UPDATE ecosystem_units SET icon = '🚛', color = '#10B981' WHERE code = 'VC';
   UPDATE ecosystem_units SET icon = '🔧', color = '#EF4444' WHERE code = 'LD';
   
   -- 3. Verify
   SELECT code, icon, color FROM ecosystem_units WHERE code IN ('KD','SX','VC','LD');
   ```

### Lỗi: Divisions list trống
**Nguyên nhân:** Chưa tạo 4 Khối

**Giải pháp:** Chạy migration `19_create_4_divisions_users.sql` trước

---

## 📊 Timeline Fix

1. ✅ **Phát hiện lỗi:** `icon` column không tồn tại
2. ✅ **Tạo migration:** `31_add_icon_color_ecosystem.sql`
3. ✅ **Sửa API:** Thêm icon/color vào SELECT
4. ✅ **Commit & Push:** Code đã lên GitHub
5. ⏳ **Bạn cần làm:** Chạy migration trong Supabase
6. ⏳ **Render auto-deploy:** Backend sẽ tự update (~5 phút)
7. ✅ **Test:** API sẽ trả về icon/color

---

## ✅ Kết luận

**Fix hoàn tất!** Chỉ cần:

1. **Chạy migration SQL** trong Supabase → Thêm cột icon/color
2. **Đợi backend deploy** → API sẽ query được icon/color
3. **Test lại** → Dashboard hiển thị icon/color đúng

**File SQL:** `backend/supabase/31_add_icon_color_ecosystem.sql` 📄

**Next step:** Chạy migration trong Supabase ngay! 🚀
