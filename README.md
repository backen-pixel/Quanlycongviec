# TuBep Pro — Quản Lý Công Việc Nhân Viên

Hệ thống quản lý công việc cho doanh nghiệp nội thất tủ bếp.

## Kiến trúc
- **Backend**: Express.js + Supabase + Socket.IO (Realtime)
- **Frontend**: React + Vite + Tailwind CSS v4
- **Database**: Supabase (PostgreSQL)

## Chạy local

### Backend
```bash
cd backend
npm install
npm run dev    # http://localhost:4000
```

### Frontend
```bash
cd frontend
npm install
npm run dev    # http://localhost:5173
```

## Deploy Render
- Backend: Web Service → `cd backend && npm install && npm start`
- Frontend: Static Site → `cd frontend && npm install && npm run build` → `dist`

## Tài khoản demo
- Email: `admin@tubep.vn`
- Password: `admin123`
