# Kiểm kê NextGo nguồn (2026-09-09)

Đo trên Supabase production (QLCV-system). Không ghi DB.

## Công ty

| id | Tên | tenant | is_active | Ghi chú |
|---|---|---|---|---|
| `87479a83-1145-43b7-b090-3e40812cb5a9` | Công Ty TNHH Bao Bì NextGo | `7d42e731-…` slug `default` | true | **Nguồn cắt** |
| `842cff41-0f8b-4cee-b7ec-d78ce27e7308` | cùng tên | `e37fac98-…` slug `nextgo` | true | Clone cùng DB (625 lead / 26 project / 8 user alias) — **không dùng để cắt** |

## Số liệu nguồn

| Hạng mục | Số |
|---|---|
| User `company_id` NextGo | 8 (cả 8 active) + 4 user tham chiếu ngoài (dump = 12) |
| `user_companies` | 4 |
| Khách hàng | 363 |
| crm_leads | 733–734 (export 733; chủ yếu deal) |
| Dự án SX | 32 |
| crm_tasks | 8259 |
| tasks SX | 904 |
| crm_lead_comments | 2405 |
| crm_task_attachments | 383 |
| lead_members | 73 |
| crm_assignments | 322 |
| crm_daily_reports | 140 |
| crm_events | 22 |
| Pipeline CRM / cột | 1 / 27 |
| Loại lead / loại xưởng | 6 / 6 |
| Mẫu việc xưởng | 8 |
| Đội xưởng | 2 |
| Cột SX / VC | 9 / 0 |
| Báo giá / đơn / HĐ / PO | 0 / 0 / 0 / 0 |
| Drive roots | 4 |
| Facebook pages | 1 (`1102202982968909` — NextGo túi/hộp giấy) |
| facebook_contacts / messages | 2049 / 15997 |
| Zalo OA / contact | 0 / 0 |
| file_attachments (lead/project id) | 0 (file nằm `crm_task_attachments` + Drive) |
| Lead ↔ project xuyên công ty | **0** |
| Lead loại → SX NextGo (link) | 6 |
| CRM visible production | 1 (tự thấy mình) |

## User NextGo (email, không mật khẩu)

- bienanhphap@nextgo.vn — Biện Anh Pháp — admin
- haihien@nextgo.vn — Hải Hiền — production_admin
- luonggiayen@gmail.com — Lương Gia Yến — sales_admin
- maithanhtruyen12@gmail.com — Mai Thanh Truyền — admin
- Ngoctrinh@nextgo.vn — Ngọc Trinh — sales_admin
- tranthingochan@nextgo.vn — Trần Thị Ngọc Hân — admin
- saletest.ui@nextgo.vn / sanxuattest.ui@nextgo.vn — tài khoản test UI

## User ngoài công ty bị tham chiếu (2)

`admin@tubep.vn` (Admin Hệ Thống) và `tudonghoa1@vanphuthanh.net` (Nam).  
Export copy kèm `is_active=false` trên dump user bổ sung. Không biến họ thành admin vận hành instance mới trừ khi anh chỉ định.

## Org

Công ty gắn `division_unit_id` = Khối Kinh Doanh (shared HST mặc định). Có 2 unit subsidiary «Công Ty TNHH Bao Bì NextGo» (KD + SX).  
Export đi kèm tổ tiên unit (group + khối). Import gán lại `tenant_id` tenant `nextgo` trên đích.

## Ước freeze

Dump + so số: ~1–2 giờ. Cửa sổ cắt (delta + webhook): **2–4 giờ** cuối tuần. Inbox FB không dual-run.
