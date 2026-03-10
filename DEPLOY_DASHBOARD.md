# Dashboard API 404 Fix & Deploy Guide

## Vấn đề
```
Request URL: https://tubep-backend.onrender.com/api/dashboard
Status: 404 Not Found
```

## Nguyên nhân
Backend trên Render chưa có file `src/routes/dashboard.js` hoặc chưa restart sau khi push code mới.

## Giải pháp

### 1. Kiểm tra Git
```bash
cd /home/ubuntu/.openclaw/workspace/employee-workflow
git status
git log --oneline -3
# Đảm bảo commit 0effaea đã push
```

### 2. Trigger Render Deploy
Render auto-deploy khi có push mới lên `main` branch.

**Manual deploy:**
1. Vào https://dashboard.render.com
2. Chọn service **tubep-backend**
3. Click **"Manual Deploy"** → **"Deploy latest commit"**
4. Đợi ~3-5 phút để build + deploy

### 3. Kiểm tra Logs
```bash
# Trên Render dashboard
Logs → View latest logs

# Tìm dòng:
"🔌 Dashboard routes loaded: /api/dashboard"
```

### 4. Test API
```bash
# Test từ browser hoặc curl
curl https://tubep-backend.onrender.com/api/dashboard/overview

# Expected response:
{
  "projects": { "total": 156, ... },
  "tasks": { ... },
  "customers": { ... },
  "revenue": { ... }
}
```

---

## Routes Mới

### Backend: `/api/dashboard/*`
```
GET /api/dashboard/overview       # KPIs tổng quan
GET /api/dashboard/workload       # Phân bổ công việc theo Khối (NEW)
GET /api/dashboard/timeline       # Time-series (6 tháng)
GET /api/dashboard/team           # Top performers
GET /api/dashboard/alerts         # Cảnh báo
GET /api/dashboard/customers      # VIP insights
GET /api/dashboard/activity       # Activity feed
```

### Frontend Changes
- **OLD**: `/api/dashboard/pipeline` → hiển thị quy trình sản xuất (8 stages)
- **NEW**: `/api/dashboard/workload` → hiển thị phân bổ công việc theo Khối
  - Click vào Khối → mở rộng chi tiết công ty
  - Hiển thị số công việc mỗi công ty

---

## Workload Widget Design

### Collapse (Default)
```
┌───────────────────────────────────────────────┐
│ 📊 Phân Bổ Công Việc Theo Khối                │
├───────────────────────────────────────────────┤
│ ▶ 🔵 Khối Sản xuất (3 công ty)    120 việc   │
│   ▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▱▱▱▱▱                       │
│                                                │
│ ▶ 🟢 Khối Kinh doanh (2 công ty)   85 việc    │
│   ▰▰▰▰▰▰▰▰▰▰▱▱▱▱▱▱▱▱▱▱                       │
│                                                │
│ ▶ 🟡 Khối Hỗ trợ (1 công ty)       45 việc    │
│   ▰▰▰▰▰▰▱▱▱▱▱▱▱▱▱▱▱▱▱▱                       │
└───────────────────────────────────────────────┘
```

### Expanded (Click vào Khối)
```
┌───────────────────────────────────────────────┐
│ ▼ 🔵 Khối Sản xuất (3 công ty)    120 việc   │
│   ▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▱▱▱▱▱                       │
│                                                │
│   │ CHI TIẾT CÔNG TY:                         │
│   │ Công ty A        ▰▰▰▰▰▰▰▰▱▱  60           │
│   │ Công ty B        ▰▰▰▰▰▱▱▱▱▱  40           │
│   │ Công ty C        ▰▰▱▱▱▱▱▱▱▱  20           │
└───────────────────────────────────────────────┘
```

---

## Deploy Checklist

### Backend (Render)
- ✅ Push code to GitHub main
- ✅ Render auto-deploy (hoặc manual deploy)
- ✅ Check logs: `dashboard routes loaded`
- ✅ Test API: `curl .../api/dashboard/overview`

### Frontend (Render)
- ✅ Build local: `npm run build`
- ✅ Push to GitHub main
- ✅ Render auto-deploy static site
- ✅ Test: Mở https://tubep-frontend-s30w.onrender.com

### Environment Variables (Render)
```
SUPABASE_URL=https://kdxypztstbeovyedmvem.supabase.co
SUPABASE_KEY=xxx
JWT_SECRET=xxx
CORS_ORIGINS=https://tubep-frontend-s30w.onrender.com
```

---

## Troubleshooting

### 404 vẫn còn sau deploy
```bash
# 1. Check file tồn tại trong repo
git ls-files | grep dashboard.js
# Expect: backend/src/routes/dashboard.js

# 2. Check Render build logs
# Tìm "Error" hoặc "Failed to load module"

# 3. Force rebuild
# Render dashboard → Clear build cache → Manual deploy
```

### API trả về empty data
```bash
# Kiểm tra Supabase connection
# Vào Render logs, tìm "Supabase error"

# Check ecosystem_units table có dữ liệu
# Vào Supabase dashboard → Table Editor → ecosystem_units
```

### CORS error
```bash
# Đảm bảo CORS_ORIGINS trong backend env bao gồm frontend URL
CORS_ORIGINS=https://tubep-frontend-s30w.onrender.com,http://localhost:5173
```

---

## Git Workflow

```bash
# Local development
cd employee-workflow
git pull origin main
# ... make changes ...
npm run build  # test build
git add -A
git commit -m "fix: dashboard API"
git push origin main

# Render sẽ tự động deploy trong 3-5 phút
```

---

## Next Steps
1. Push code to GitHub
2. Wait for Render deploy
3. Test dashboard: https://tubep-frontend-s30w.onrender.com
4. Verify workload widget hiển thị đúng
5. Click vào Khối → xem chi tiết công ty
