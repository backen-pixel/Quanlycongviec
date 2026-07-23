# Hướng dẫn thao tác nhanh (CRM)

Ảnh minh họa chụp bằng Chrome DevTools (tháng 7/2026).  
Bản đầy đủ có trên app: **Cập nhật** (\`/updates\`) — lọc mục *Hướng dẫn*.

**PDF gửi nhân viên** (thư mục \`pdf/\`):
1. \`pdf/01-chuyen-deal-ve-lead.pdf\`
2. \`pdf/02-up-file-hinh-bang-drive-chi-tiet-deal.pdf\`
3. \`pdf/03-chuyen-nhan-vien-khu-vuc.pdf\`
4. \`pdf/04-gop-lead-thu-cong.pdf\`

Tạo lại: \`node frontend/scripts/export-guide-pdfs.mjs\`

| # | Chủ đề | File ảnh | Link trong app |
|---|--------|----------|----------------|
| 1 | Chuyển Deal về Lead | `../release-notes/hd-deal-header.png`, `hd-revert-lead-modal.png` | id \`2026-07-crm-revert-deal-to-lead\` |
| 2 | Up file/hình bằng Drive trong Deal | `../release-notes/hd-deal-drive-upload.png` | id \`2026-07-drive-upload-file-image\` |
| 3 | Chuyển NV khác khu vực | `hd-deal-header.png`, `hd-transfer-assignee-modal.png` | id \`2026-07-crm-transfer-assignee-region\` |
| 4 | Gộp Lead thủ công (Kanban) | `gop-lead/01` … `07` | id \`2026-07-huong-dan-gop-lead\` |

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
