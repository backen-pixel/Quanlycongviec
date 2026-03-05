# 🚀 CHẠY MIGRATION - 3 BƯỚC ĐơN GIẢN

## BƯỚC 1: Copy migration SQL

**File**: `backend/migrations/19_permission_system.sql`  
**Size**: 361 dòng  
**Nội dung**: 👇 Copy toàn bộ từ dòng sau đây đến hết file 👇

---

## BƯỚC 2: Paste vào Supabase

1. Mở **Supabase Dashboard**: https://supabase.com/dashboard/project/kdxypztstbeovyedmvem
2. Click **SQL Editor** (menu bên trái)
3. Click **"+ New query"** 
4. **Paste** toàn bộ SQL từ Bước 1
5. Click **"Run"** (hoặc nhấn Ctrl+Enter)
6. Đợi ~5 giây

---

## BƯỚC 3: Kiểm tra kết quả

### ✅ Thành công nếu thấy:
```
Success. No rows returned
```

### ✅ Verify bằng query này:
```sql
SELECT role, COUNT(*) as count 
FROM role_permissions 
GROUP BY role 
ORDER BY count DESC;
```

**Click "Run"** → Phải thấy:
```
   role    | count 
-----------+-------
 admin     |    39
 manager   |    28
 sales     |    14
 accountant|    10
 employee  |     8
 production|     8
 designer  |     7
 installer |     7
```

---

## ❓ Nếu có lỗi:

### Lỗi: "relation already exists"
→ **OK!** Bảng đã tồn tại, migration đã chạy rồi

### Lỗi: "duplicate key value"
→ **OK!** Seed data đã có rồi

### Lỗi: "table does not exist: users"
→ **FAIL!** Database sai hoặc schema sai

---

## ✅ SAU KHI CHẠY XONG:

**Cho tôi biết kết quả**:
- [ ] Migration chạy thành công? (Success message)
- [ ] Có 141 rows trong role_permissions? (Chạy verify query)
- [ ] 8 roles có đúng số permissions? (admin=39, manager=28...)

**Nếu tất cả OK** → Tôi tiếp tục Phase 3! 🎉

---

**Copy migration từ đây** 👇
