# Quản lý Nhiệm vụ theo Khối (Division Projects Overview)

## Tính năng mới
**Ngày:** 2026-03-11  
**Tính năng:** Hiển thị tất cả dự án và nhiệm vụ của một Khối theo cấu trúc rõ ràng, giúp quản lý dễ dàng theo dõi tiến độ.

---

## 1. Backend API - `/api/divisions.js`

### Endpoints mới:

#### 1.1 `GET /api/divisions/:divisionId/projects-overview`
**Mục đích:** Lấy tất cả dự án + nhiệm vụ của Khối  
**Query params:**
- `status` (optional): Lọc theo trạng thái dự án (`planning`, `in-progress`, `done`, `cancelled`)
- `search` (optional): Tìm kiếm theo tên dự án, mã dự án, khách hàng, công ty

**Response:**
```json
{
  "projects": [
    {
      "assignment_id": 123,
      "project": { "id": 1, "name": "Dự án A", "code": "DA001", "status": "in-progress", ... },
      "division": { "id": 2, "name": "Khối Thi công", ... },
      "company": { "id": 5, "name": "Công ty Thi công Hà Nội", ... },
      "template_set": { "id": 10, "name": "Quy trình thi công chuẩn" },
      "assigned_at": "2026-03-01T...",
      "tasks": [
        { "id": 50, "title": "Khảo sát hiện trường", "status": "done", ... },
        { "id": 51, "title": "Lắp đặt tủ bếp", "status": "in-progress", ... }
      ],
      "stats": {
        "total": 15,
        "completed": 8,
        "in_progress": 5,
        "pending": 2,
        "overdue": 1,
        "completion_rate": 53
      }
    }
  ]
}
```

#### 1.2 `GET /api/divisions/:divisionId/task-summary`
**Mục đích:** Tổng hợp thống kê nhiệm vụ của Khối

**Response:**
```json
{
  "total": 120,
  "by_status": {
    "pending": 20,
    "in-progress": 50,
    "done": 50
  },
  "by_priority": {
    "low": 30,
    "medium": 60,
    "high": 20,
    "urgent": 10
  },
  "overdue": 5
}
```

#### 1.3 `GET /api/divisions/:divisionId/active-projects`
**Mục đích:** Danh sách dự án đang hoạt động (simplified, không có tasks chi tiết)

**Response:**
```json
{
  "projects": [
    {
      "project_id": 1,
      "project_name": "Dự án Tủ bếp Gia đình Nguyễn",
      "project_code": "DA001",
      "project_status": "in-progress",
      "customer_name": "Ông Nguyễn Văn A",
      "company_name": "Công ty Thi công Hà Nội"
    }
  ]
}
```

---

## 2. Frontend - `DivisionProjectsPage.jsx`

### Route:
`/divisions/:divisionId/projects`

### Tính năng UI:

#### 2.1 Header
- **Tiêu đề:** "Quản lý Nhiệm vụ - Khối {Tên Khối}"
- **Nút quay lại** → `/ecosystem`
- **Nút làm mới** (refresh icon)

#### 2.2 Summary Cards (4 thẻ thống kê)
1. **Tổng nhiệm vụ** (màu tím) - Tổng số tasks của tất cả dự án
2. **Hoàn thành** (màu xanh lá) - Số task `status = done`
3. **Đang làm** (màu xanh dương) - Số task `status = in-progress`
4. **Quá hạn** (màu đỏ) - Số task quá `due_date` mà chưa `done`

#### 2.3 Filters
- **Search box:** Tìm kiếm dự án, công ty, khách hàng
- **Dropdown trạng thái:** Lọc dự án theo trạng thái

#### 2.4 Danh sách Dự án (Expandable Cards)
**Mỗi card hiển thị:**
- Tên dự án + mã dự án + badge trạng thái
- Tên công ty + khách hàng + SĐT
- **Thống kê ngắn gọn:**
  - Tổng nhiệm vụ
  - Hoàn thành
  - Đang làm
  - Quá hạn (nếu có)
- **Progress bar** với % hoàn thành
- **Click vào card** → mở rộng hiển thị danh sách tasks

**Tasks detail (khi expand):**
- Tiêu đề task
- Badge: Trạng thái + Độ ưu tiên
- Giai đoạn
- Người được giao
- Ngày hạn chót (highlight đỏ nếu quá hạn)
- Nút "Xem chi tiết →" (link đến trang dự án)

#### 2.5 Empty State
Nếu không có dự án nào:
- Icon Building2
- Text: "Không có dự án nào"

---

## 3. Integration với DivisionDashboard

### Thay đổi trong `DivisionDashboard.jsx`:
- Import icon `ListChecks` từ `lucide-react`
- Thêm **Quick Action Button** dưới KPI Cards:
  ```jsx
  <Link to={`/divisions/${divisionId}/projects`}>
    <ListChecks /> Xem tất cả Dự án & Nhiệm vụ theo Khối
  </Link>
  ```

---

## 4. Cách sử dụng

### Workflow người dùng:
1. Vào **Hệ sinh thái** (`/ecosystem`)
2. Click vào một **Khối** → mở `DivisionDashboard`
3. Click nút **"Xem tất cả Dự án & Nhiệm vụ theo Khối"** → mở `DivisionProjectsPage`
4. Xem tổng quan:
   - 4 thẻ thống kế tổng hợp
   - Danh sách tất cả dự án của Khối
5. **Tìm kiếm** hoặc **lọc** theo trạng thái
6. **Click vào dự án** để xem chi tiết tasks
7. **Click "Xem chi tiết →"** ở task để nhảy vào trang dự án đầy đủ

---

## 5. Lợi ích

✅ **Quản lý tập trung:** Nhìn tổng quan tất cả dự án + nhiệm vụ của Khối trong 1 màn hình  
✅ **Theo dõi tiến độ:** Stats rõ ràng (hoàn thành, đang làm, quá hạn)  
✅ **Tìm kiếm nhanh:** Filter + search theo dự án, công ty, khách hàng  
✅ **Expandable UI:** Click để xem chi tiết tasks, không bị overwhelm  
✅ **Navigation dễ dàng:** Nhảy nhanh đến trang dự án để xử lý task  

---

## 6. Database Tables sử dụng

- `project_company_assignments` - Gán dự án cho Khối/Công ty
- `ecosystem_units` - Thông tin Khối, Công ty
- `company_template_sets` - Bộ mẫu nhiệm vụ
- `projects` - Thông tin dự án
- `tasks` - Danh sách nhiệm vụ

---

## 7. Deploy

### Backend:
Không cần SQL migration mới. Route `/api/divisions` đã được khai báo sẵn trong `server.js`.

### Frontend:
- File mới: `src/pages/DivisionProjectsPage.jsx`
- Sửa: `src/App.jsx` (thêm route)
- Sửa: `src/pages/DivisionDashboard.jsx` (thêm nút Quick Action)

### Build & Deploy:
```bash
cd frontend
npm run build
# Deploy dist/ folder lên Render
```

---

## 8. Screenshots / Mockups

### Giao diện (mô tả):
```
┌─────────────────────────────────────────────────────┐
│ ← Quay lại Hệ sinh thái          [Làm mới 🔄]      │
│                                                     │
│ Quản lý Nhiệm vụ - Khối Thi công                  │
│ Theo dõi tất cả dự án và nhiệm vụ...               │
├─────────────────────────────────────────────────────┤
│ ┌───────┐ ┌───────┐ ┌───────┐ ┌───────┐           │
│ │  120  │ │  50   │ │  40   │ │   5   │           │
│ │ Tổng  │ │ Xong  │ │ Đang  │ │ Quá   │           │
│ │  NV   │ │       │ │ làm   │ │ hạn   │           │
│ └───────┘ └───────┘ └───────┘ └───────┘           │
├─────────────────────────────────────────────────────┤
│ [🔍 Tìm kiếm...]  [Trạng thái: Tất cả ▼]          │
├─────────────────────────────────────────────────────┤
│ ┌─ Dự án Tủ bếp Gia đình Nguyễn #DA001 ──────────┐ │
│ │ 🏢 Công ty Thi công HN  👤 Ông Nguyễn Văn A    │ │
│ │ 15 NV │ 8 Xong │ 5 Đang │ 1 Quá hạn            │ │
│ │ [████████░░░░░░] 53%                            │ │
│ │ ▼ Tasks (click để mở rộng)                      │ │
│ └──────────────────────────────────────────────────┘ │
│ ┌─ Dự án Tủ bếp Gia đình Trần #DA002 ──────────┐  │
│ │ ...                                             │ │
│ └──────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────┘
```

Khi **expand** một dự án:
```
│ ┌─ Dự án Tủ bếp Gia đình Nguyễn #DA001 ──────────┐ │
│ │ ... (header như trên)                           │ │
│ │ ────────────────────────────────────────────────│ │
│ │ Danh sách nhiệm vụ (15)                        │ │
│ │ ┌─ Khảo sát hiện trường ────────────────────┐  │ │
│ │ │ [Xong] [Cao] Giai đoạn: Consulting         │  │ │
│ │ │ 👤 Nguyễn Văn B  📅 10/03/2026              │  │ │
│ │ │                      [Xem chi tiết →]      │  │ │
│ │ └───────────────────────────────────────────┘  │ │
│ │ ┌─ Lắp đặt tủ bếp ───────────────────────────┐ │ │
│ │ │ [Đang làm] [Khẩn cấp] Giai đoạn: Install   │ │ │
│ │ │ 👤 Trần Văn C  📅 15/03/2026 (Quá hạn!)    │ │ │
│ │ │                      [Xem chi tiết →]      │ │ │
│ │ └───────────────────────────────────────────┘  │ │
│ └──────────────────────────────────────────────────┘ │
```

---

**End of Documentation**
