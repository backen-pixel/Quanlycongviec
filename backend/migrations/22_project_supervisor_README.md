# Migration 22: Project Supervisor

## Mục đích
Thêm vai trò "Người giám sát" cho dự án - người có thể theo dõi và giám sát toàn bộ tiến độ dự án.

## Thay đổi
- Thêm field `supervisor_id` vào bảng `projects`
- Type: UUID (foreign key → users.id)
- Cho phép NULL (dự án có thể không có người giám sát)

## Cách chạy migration

### Cách 1: Supabase Dashboard (Khuyến nghị)
1. Mở Supabase Dashboard: https://supabase.com/dashboard/project/kdxypztstbeovyedmvem
2. Vào **SQL Editor**
3. Copy nội dung file `22_project_supervisor.sql`
4. Paste vào editor và chạy (Run)

### Cách 2: psql
```bash
psql -h <host> -U postgres -d postgres -f backend/migrations/22_project_supervisor.sql
```

## Sau khi chạy migration

### Frontend sẽ hiển thị:
```
[Chi tiết dự án]
  TB-001 — Tủ bếp cao cấp
  🏢 Công ty Nội Thất ABC
  👁️ Giám sát: Lê Quản Lý  ← MỚI
```

### Hộp nhân sự hiện ra:
```
Nhân sự dự án ▼
  Tư vấn (2 người)
    👤 Nguyễn Văn A (3 nhiệm vụ)
       ● Khảo sát hiện trường
       ● Lập bản vẽ sơ bộ
       ● Tư vấn vật liệu
```
Hiển thị chi tiết tasks của từng người!

## TODO (Tính năng tương lai)
- [ ] Thêm UI để chọn người giám sát khi tạo/sửa dự án
- [ ] Hiển thị supervisor trong project list
- [ ] Permission: Supervisor có thể xem nhưng không sửa?
