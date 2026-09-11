# HCB · Tủ bếp — Nhóm deadline pipeline & kế hoạch từ ngày lắp

Tài liệu khớp pipeline 588 (2026-09-11): gán `deadline_group` và tính ngược từ ngày lắp.

- Ngày soạn: 2026-08-12
- Công ty: **HCB** (Công ty Hucabi)
- Phân loại: **Tủ bếp**
- Cột DB: `production_pipeline_stages.deadline_group` (migration `523_production_pipeline_deadline_group.sql`)
- Giá trị hợp lệ: `planning` | `cabinet` | `finishing` | `packing` | `NULL`

---

## 1. Quy tắc kế hoạch (tính từ ngày lắp — ngày lịch)

Tính **ngược** từ ngày lắp đặt:

| # | Công đoạn | Số ngày | Ghi chú |
|---|-----------|---------|---------|
| 1 | Giao hàng | **1** | Ngay trước ngày lắp (board VC/LĐ) |
| 2 | Hoàn thiện | **2** | Trước giao hàng. **Ngày hoàn thiện SX** = cuối đoạn này (= lắp − 2) |
| 3 | Gia công | **2** | Trước hoàn thiện (vật tư, kính, sơn, thùng, alu, cánh) |
| 4 | Kế hoạch SX | **Phần còn lại** | Từ **ngày tiếp nhận xưởng** → hết ngày trước gia công (cột Tiếp nhận / Kế hoạch / Duyệt) |

### Công thức (lắp = D)

| Công đoạn | Khoảng ngày |
|-----------|-------------|
| Giao hàng | `D−1` |
| Hoàn thiện | `D−3` → `D−2` |
| Gia công | `D−5` → `D−4` |
| Kế hoạch SX | `tiếp nhận` → `D−6` |

Code tham chiếu: `frontend/src/lib/sxWorkshopSchedule.js` → `buildSxInstallBackPlan()`, `SX_DEADLINE_GROUPS`.

Setup UI: **Cài đặt pipeline SX** → mỗi cột chọn **Nhóm deadline** (hoặc tick nhiều cột → **Gán nhóm DL**).

---

## 2. Ví dụ số (lắp 19/8, tiếp nhận 10/8)

| Công đoạn | `deadline_group` | Khoảng ngày | Hạn cuối công đoạn |
|-----------|------------------|-------------|--------------------|
| Kế hoạch SX | `planning` | **10 → 13/8** (4 ngày) | 13/8 |
| Gia công | `cabinet` | **14 → 15/8** | 15/8 |
| Hoàn thiện | `finishing` | **16 → 17/8** | **17/8** (= `production_finish_date`) |
| Giao hàng | `packing` | **18/8** | 18/8 |
| Lắp đặt | — (mốc) | **19/8** | ngày lắp (`install_date` / occurrence, fallback `delivery_date`) |

Khi thẻ ở cột thuộc nhóm X → deadline công đoạn nên hiểu là **hạn cuối** của nhóm X ở bảng trên.

---

## 3. Cột Kanban — HCB Tủ bếp (từ 2026-09-11)

Board **Tủ bếp** chỉ tới Hoàn thiện. Giao hàng / lắp đặt ở **VC/LĐ**. Công nợ là phân loại **Công nợ** (chip Kanban SX riêng).

### `planning` — Kế hoạch SX (Tiếp nhận → Duyệt)

| # | Tên cột |
|---|---|
| 1 | Tiếp nhận |
| 2 | Kế hoạch |
| 3 | Duyệt |

### `cabinet` — Gia công (6 việc trên thẻ)

| # | Tên cột | Việc |
|---|---|---|
| 4 | Gia công | Chuẩn bị vật tư, Đặt kính, Sơn, Thùng, Alu, Cánh |

### `finishing` — Hoàn thiện

| # | Tên cột |
|---|---|
| 5 | Hoàn thiện | Bàn giao VC/LĐ (`is_handover_to_logistics`) |

### `packing` — Giao hàng (board VC, không còn cột SX)

Giao hàng 1 ngày trước lắp; lắp đặt là mốc.

### Công nợ (phân loại khác)

CÔNG NỢ ĐÃ TÍNH → ĐANG ĐỐI CHIẾU → ĐÃ CHỐT → ĐÃ THANH TOÁN. `deadline_group` = NULL.

Migration: `database/588_hcb_tubep_kanban_to_hoan_thien.sql`.

---

## 4. Checklist thực hiện sau

- [ ] Mở **Cài đặt pipeline SX** → công ty **HCB** → phân loại **Tủ bếp**
- [ ] Gán từng cột theo bảng mục 3 (hoặc tick hàng loạt → **Gán nhóm DL**)
- [ ] (Tuỳ chọn) Bật **DL bắt buộc** (`requires_deadline`) cho cột “cửa” cuối mỗi nhóm nếu muốn ép nhập hạn khi kéo thẻ
- [ ] Kiểm tra 1 dự án có `delivery_date` + `sx_reception_date`: panel chi tiết SX hiện đúng lịch kế hoạch
- [ ] Xác nhận với xưởng HCB: cột **Đang SX thùng** thuộc `cabinet` (không phải `planning`) là đúng thực tế

### SQL gán hàng loạt (khi đã chốt — chạy trên Supabase)

```sql
-- Chỉ chạy sau khi đã rà lại tên cột trên DB thật.
-- Thay :hcb_id / :tubep_type_id bằng UUID thật (hoặc JOIN theo short_name / name).

UPDATE production_pipeline_stages p
SET deadline_group = v.grp
FROM (
  VALUES
    ('Tiếp nhận đơn hàng về SX', 'planning'),
    ('Thiết kế & lập kế hoạch NVL', 'planning'),
    ('Sản xuất kiểm tra chéo đặt kính', 'planning'),
    ('CHUẨN BỊ VẬT TƯ, CẮT KÍNH', 'planning'),
    ('ĐANG CẮT CÁNH,', 'planning'),
    ('KẾ HOẠCH SX THÙNG HỢP KIM', 'planning'),
    ('KẾ HOẠCH SX THÙNG LÁ GHÉP', 'planning'),
    ('ĐANG SX THÙNG HỢP KIM + 100 X 16', 'cabinet'),
    ('ĐANG SX THÙNG LÁ GHÉP NHỎ', 'cabinet'),
    ('ĐỘI SƠN', 'finishing'),
    ('HT NHÔM NGUYÊN TẤM', 'finishing'),
    ('HT NHÔM LÁ GHÉP NHỎ', 'finishing'),
    ('KT KCS SẢN PHẨM, TÍNH CN', 'finishing'),
    ('ĐƠN HÀNG ĐÃ CHUẨN BỊ XONG', 'packing'),
    ('ĐƠN HÀNG NGÀY MAI GIAO', 'packing')
) AS v(col_name, grp)
JOIN companies c ON c.id = p.company_id
JOIN workshop_project_types wt ON wt.id = p.workshop_type_id
WHERE (c.short_name ILIKE 'HCB' OR c.name ILIKE '%hucabi%')
  AND wt.name ILIKE 'Tủ bếp'
  AND lower(trim(p.name)) = lower(trim(v.col_name));
```

Trước khi UPDATE, chạy SELECT kiểm tra khớp tên:

```sql
SELECT p.name, p.order_index, p.deadline_group
FROM production_pipeline_stages p
JOIN companies c ON c.id = p.company_id
JOIN workshop_project_types wt ON wt.id = p.workshop_type_id
WHERE (c.short_name ILIKE 'HCB' OR c.name ILIKE '%hucabi%')
  AND wt.name ILIKE 'Tủ bếp'
ORDER BY p.order_index;
```

---

## 5. Việc chưa làm (ghi chú kỹ thuật)

- Kanban / modal deadline **chưa** tự điền hạn theo nhóm từ `buildSxInstallBackPlan` khi kéo thẻ.
- Phân loại **Cánh kính** HCB không đổi trong đợt 588.

---

## 6. File / code liên quan

| Mục | Đường dẫn |
|-----|-----------|
| Migration cột | `database/523_production_pipeline_deadline_group.sql` |
| Runner | `backend/scripts/run-migration-523.js` |
| Helper kế hoạch + nhóm | `frontend/src/lib/sxWorkshopSchedule.js` |
| Setup pipeline UI | `frontend/src/pages/ProductionPipelineSettingsPage.jsx` |
| API create/update cột | `backend/src/routes/production.js` (`deadline_group` trong `parseProductionStageKpiBody`) |
| Panel lịch trên dự án SX | `frontend/src/pages/ProductionDetail.jsx` (`WorkshopInfoPanel`) |
