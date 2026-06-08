# Xưởng SX (sx-mobile)

App mobile độc lập cho **Xưởng sản xuất**, dùng chung backend với hệ thống (đăng nhập bằng tài khoản hiện có). Dữ liệu thật lấy từ các API `/api/production/*`.

## Tính năng

- **Đăng nhập** bằng tài khoản hệ thống (`/api/auth/login`).
- **Kanban điều hướng từng cột**: hiển thị 1 cột tại một thời điểm, nút `‹ ›` để chuyển cột, dot indicator cho biết đang ở cột nào / tổng số cột.
- **Chuyển cột trực tiếp trên card**: mỗi card có khu vực "Chuyển cột" với nút `←` cột trước và `→` cột tiếp (ẩn/hiện theo vị trí), có toast xác nhận. Nếu backend chặn (còn nhiệm vụ chưa xong) sẽ hiện toast lỗi và hoàn tác.
- **Danh sách dự án**: tìm kiếm theo mã/tên/khách/SĐT.
- **Planner** (placeholder) và **Tôi** (hồ sơ + đăng xuất).
- Bottom navigation chuẩn mobile, touch target ≥ 44px, stats pill cuộn ngang.

## API sử dụng (dữ liệu thật)

- `GET /api/production/dashboard` → `{ kpis, pipeline (cột Kanban), projects }`
- `GET /api/production/pipeline-stages` (fallback danh sách cột)
- `PATCH /api/production/projects/:id/stage` → chuyển dự án sang cột Kanban khác
  - body: `{ production_pipeline_stage_id, current_sx_pipeline_stage_id }` hoặc `{ move_to_intake: true }`

## Cấu hình

Tạo file `.env` (đã có sẵn mẫu `.env.example`):

```
EXPO_PUBLIC_API_URL=https://tubep-backend.onrender.com
```

## Chạy & build

```bash
npm install
npm run start          # chạy Expo dev
npm run android        # build/chạy trên thiết bị Android
npm run prebuild:android
```

> Lưu ý: thư mục `android/` được sinh tự động qua `expo prebuild` và không commit (xem `.gitignore`).
