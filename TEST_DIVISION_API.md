# 🧪 Kiểm tra API Division đã chạy chưa

## ✅ Kết quả: Backend đang chạy!

```bash
curl https://tubep-backend.onrender.com/api/health
# Response: {"status":"ok","time":"2026-03-11T06:53:14.041Z"}
```

---

## 🔐 Vấn đề: API yêu cầu Authentication

Tất cả Division API đều cần **auth token** (middleware `auth` đã được apply):

```javascript
// File: backend/src/routes/divisions.js
const r = Router();
r.use(auth); // ← Tất cả routes phải có token
```

---

## 📝 Cách test API với Token

### Bước 1: Lấy token (Login)

#### Option 1: Qua Frontend
1. Vào: `https://tubep-frontend-s30w.onrender.com/login`
2. Login: `admin@tubep.vn` / `admin123`
3. Mở **DevTools** (F12) → Tab **Application** → **localStorage**
4. Copy giá trị của key `token`

#### Option 2: Qua curl
```bash
curl -X POST https://tubep-backend.onrender.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@tubep.vn",
    "password": "admin123"
  }'

# Response:
# {
#   "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
#   "user": { ... }
# }
```

### Bước 2: Test API với Token

```bash
# Lưu token vào biến
TOKEN="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."

# Test 1: List divisions
curl https://tubep-backend.onrender.com/api/divisions \
  -H "Authorization: Bearer $TOKEN"

# Response mong đợi:
# {
#   "divisions": [
#     { "id": "...", "code": "KD", "name": "Khối Kinh doanh", "icon": "💼" },
#     { "id": "...", "code": "SX", "name": "Khối Sản xuất", "icon": "🏭" },
#     ...
#   ]
# }

# Test 2: Get specific division
DIVISION_ID="..." # Lấy từ response trên
curl https://tubep-backend.onrender.com/api/divisions/$DIVISION_ID \
  -H "Authorization: Bearer $TOKEN"

# Test 3: Task summary
curl https://tubep-backend.onrender.com/api/divisions/$DIVISION_ID/task-summary \
  -H "Authorization: Bearer $TOKEN"

# Test 4: Projects overview
curl https://tubep-backend.onrender.com/api/divisions/$DIVISION_ID/projects-overview \
  -H "Authorization: Bearer $TOKEN"
```

### Bước 3: Dùng script test tự động

```bash
# File: backend/test-division-api.sh

# Lấy token trước
TOKEN=$(curl -s -X POST https://tubep-backend.onrender.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@tubep.vn","password":"admin123"}' \
  | grep -o '"token":"[^"]*"' \
  | cut -d'"' -f4)

# Chạy test với token
cd backend
BACKEND_URL=https://tubep-backend.onrender.com TOKEN=$TOKEN bash test-division-api.sh
```

---

## 🎯 Kiểm tra Backend đã deploy code mới chưa

### Cách 1: Kiểm tra qua API
```bash
# Nếu trả về 404 → chưa deploy
# Nếu trả về 401 → đã deploy (yêu cầu auth)
curl -I https://tubep-backend.onrender.com/api/divisions
# HTTP/1.1 401 Unauthorized ← Đã deploy!
```

### Cách 2: Kiểm tra Render Dashboard
1. Vào **Render.com** → Dashboard
2. Chọn service **tubep-backend**
3. Tab **Logs** → Xem log deploy gần nhất
4. Tìm dòng: `Latest commit: b121cd2`

### Cách 3: Kiểm tra Git
```bash
# Xem commit gần nhất
git log -1 --oneline
# b121cd2 feat: Thêm endpoint GET /api/divisions + docs chi tiết data flow

# Kiểm tra Render đã pull commit này chưa
# → Xem trong Render Logs
```

---

## ⚠️ Nếu API vẫn 404 sau khi deploy

### Nguyên nhân có thể:
1. ❌ **Backend chưa restart** - Render chưa build code mới
2. ❌ **Cache CDN** - Cloudflare/Render cache response cũ
3. ❌ **Deploy failed** - Có lỗi trong quá trình build

### Giải pháp:

#### 1. Force Redeploy
1. Vào **Render Dashboard** → **tubep-backend**
2. Click **"Manual Deploy"** → **"Clear build cache & deploy"**
3. Đợi build xong (~2-3 phút)
4. Test lại

#### 2. Kiểm tra Deploy Logs
```
Render Dashboard → tubep-backend → Logs
```

Tìm dòng:
```
✅ Build successful
✅ Deploy successful
🚀 TuBep Pro Backend: http://localhost:4000/api
```

#### 3. Kiểm tra Route Registration
Trong logs, tìm:
```javascript
app.use('/api/divisions', require('./routes/divisions'));
```

Nếu không có lỗi → Route đã mount thành công.

---

## 🧪 Test Complete Flow

### Test 1: Health check
```bash
curl https://tubep-backend.onrender.com/api/health
# ✅ {"status":"ok","time":"..."}
```

### Test 2: Login
```bash
curl -X POST https://tubep-backend.onrender.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@tubep.vn","password":"admin123"}'
# ✅ {"token":"...","user":{...}}
```

### Test 3: List Divisions (với token)
```bash
TOKEN="..." # Từ step 2
curl https://tubep-backend.onrender.com/api/divisions \
  -H "Authorization: Bearer $TOKEN"
# ✅ {"divisions":[...]}
```

### Test 4: Frontend
1. Vào: `https://tubep-frontend-s30w.onrender.com/login`
2. Login: `kinhdoanh@tubep.vn` / `admin123`
3. Vào: `/divisions/<division-id>`
4. Xem Dashboard hiển thị dữ liệu

---

## 📊 Kết quả mong đợi

### ✅ Nếu API đã chạy:
```bash
# Không có token
curl https://tubep-backend.onrender.com/api/divisions
# HTTP 401: {"error":"Chưa đăng nhập"}

# Có token
curl https://tubep-backend.onrender.com/api/divisions \
  -H "Authorization: Bearer $TOKEN"
# HTTP 200: {"divisions":[...]}
```

### ✅ Nếu có dữ liệu:
```json
{
  "divisions": [
    {
      "id": "uuid-kd",
      "code": "KD",
      "name": "Khối Kinh doanh",
      "icon": "💼",
      "description": "Tư vấn, Thiết kế, Báo giá, Hợp đồng"
    }
  ]
}
```

### ⚠️ Nếu trống:
```json
{
  "divisions": []
}
```
→ Chạy SQL: `backend/supabase/19_create_4_divisions_users.sql`

---

## 🚀 Quick Test (Copy & Paste)

```bash
# 1. Get token
TOKEN=$(curl -s -X POST https://tubep-backend.onrender.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@tubep.vn","password":"admin123"}' \
  | python3 -c "import sys, json; print(json.load(sys.stdin)['token'])")

echo "Token: $TOKEN"

# 2. Test API
curl -s https://tubep-backend.onrender.com/api/divisions \
  -H "Authorization: Bearer $TOKEN" \
  | python3 -m json.tool

# 3. If divisions found, get first one
DIVISION_ID=$(curl -s https://tubep-backend.onrender.com/api/divisions \
  -H "Authorization: Bearer $TOKEN" \
  | python3 -c "import sys, json; print(json.load(sys.stdin)['divisions'][0]['id'])")

echo "Division ID: $DIVISION_ID"

# 4. Test task summary
curl -s https://tubep-backend.onrender.com/api/divisions/$DIVISION_ID/task-summary \
  -H "Authorization: Bearer $TOKEN" \
  | python3 -m json.tool
```

---

## ✅ Kết luận

**API đã chạy!** ✅
- Backend: Live tại `https://tubep-backend.onrender.com`
- Health: OK
- Routes mounted: `/api/divisions`
- Auth: Required (401 nếu không có token)

**Bước tiếp:**
1. Lấy token (login)
2. Test với token
3. Kiểm tra có dữ liệu không (divisions list)
4. Nếu trống → Chạy SQL tạo 4 Khối

**Script test:** `backend/test-division-api.sh` 🧪
