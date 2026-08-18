# Hướng dẫn thao tác nhanh (CRM)

Ảnh minh họa chụp bằng Chrome DevTools (tháng 7/2026).  
Bản đầy đủ có trên app: **Cập nhật** (\`/updates\`) — lọc mục *Hướng dẫn*.

**PDF gửi nhân viên** (thư mục \`pdf/\`):
1. \`pdf/01-chuyen-deal-ve-lead.pdf\`
2. \`pdf/02-up-file-hinh-bang-drive-chi-tiet-deal.pdf\`
3. \`pdf/03-chuyen-nhan-vien-khu-vuc.pdf\`
4. \`pdf/04-gop-lead-thu-cong.pdf\`
5. \`pdf/05-metalla-tao-nhan-vien-phan-quyen.pdf\`
6. \`pdf/06-ke-hoach-sx-va-vc-ld.pdf\`

Tạo lại: \`node frontend/scripts/export-guide-pdfs.mjs\`

| # | Chủ đề | File ảnh | Link trong app |
|---|--------|----------|----------------|
| 1 | Chuyển Deal về Lead | `../release-notes/hd-deal-header.png`, `hd-revert-lead-modal.png` | id \`2026-07-crm-revert-deal-to-lead\` |
| 2 | Up file/hình bằng Drive trong Deal | `../release-notes/hd-deal-drive-upload.png` | id \`2026-07-drive-upload-file-image\` |
| 3 | Chuyển NV khác khu vực | `hd-deal-header.png`, `hd-transfer-assignee-modal.png` | id \`2026-07-crm-transfer-assignee-region\` |
| 4 | Gộp Lead thủ công (Kanban) | `gop-lead/01` … `07` | id \`2026-07-huong-dan-gop-lead\` |
| 5 | Tạo NV + phân quyền Metalla | `metalla-tao-nv/01` … `06` | — |
| 6 | Kế hoạch SX & VC/LĐ (cột lắp đặt tạm) | `sx-vc-ld-ke-hoach/01` … `09` | — |

## Tóm tắt thao tác

### 1. Chuyển Deal → Lead
Mở Deal → **Trả về Lead** → chọn người phụ trách Lead mới → xác nhận.

### 2. Up file / hình bằng Drive trong chi tiết Deal
Mở Deal → tab **☁️ Drive** → **Tải lên từ máy** (PDF/JPG/Excel/DWG…).
Có thể **Liên kết file Drive** nếu file đã có trên Google Drive.

### 3. Chuyển NV khu vực khác
**Chuyển người phụ trách** → chọn **khu vực** trước → chọn **nhân viên** thuộc khu vực đó → Xác nhận.

### 4. Gộp Lead thủ công
Kanban Lead → chọn ≥2 thẻ → **Gộp đã chọn** → chọn bản giữ lại + cách gộp → **Xác nhận gộp**.

### 5. Tạo nhân viên & phân quyền (Metalla)
**Nhân viên** → lọc **Công Ty Metalla** → **Thêm NV** → điền thông tin + phòng ban/khu vực → **Tạo NV** → menu ⋯ → **Phân quyền** → gán vai trò phạm vi **Công Ty Metalla**.

### 6. Kế hoạch SX & VC/LĐ
Admin bật cột **LĐ tạm** ở `/vc/pipeline-settings` → Sale mở Deal → **Kế hoạch SX & VC/LĐ**
(xưởng + ngày lắp + ngày lấy hàng + công ty VC/LĐ + ghi chú) → dự án hiện ở cột tạm (badge **TẠM**) trên bảng Lắp đặt,
NV phụ trách VC/LĐ nhận thông báo «Kế hoạch lắp đặt sắp tới» + sự kiện *(dự kiến)* trên tab Lịch →
xưởng kéo vào cột bàn giao → Sale xác nhận thẻ **Bàn giao Lắp đặt** (không tạo dự án mới) → thẻ sang cột tiếp nhận.
