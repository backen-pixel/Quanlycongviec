# Đồng bộ NextGo — 2026-09-09 19:00 (UTC+7)

## Dump vs nguồn: 100%

Export mới `backend/uploads/_nextgo_instance_export/` (gitignore).  
`node scripts/verify-nextgo-completeness.js` — mọi bảng kiểm khớp.

| Bảng | Nguồn = dump |
|---|---|
| customers | 366 |
| crm_leads | 739 |
| projects | 32 |
| crm_tasks | 8325 |
| tasks | 904 |
| crm_lead_comments | 2414 |
| crm_task_attachments | 385 |
| crm_assignments | 328 |
| crm_daily_reports | 140 |
| departments | 10 |
| users công ty / dump | 8 / 12 |
| facebook_pages / contacts / messages | 1 / 2057 / 16050 (đủ inbox) |
| facebook comments / lead ads / image sets / canned | 0 / 0 / 0 / 0 (nguồn cũng 0) |
| workshop types / cột SX / pipeline CRM | 6 / 9 / 1 |

So với dump 09:49 UTC: +3 KH, +6 deal, +75 việc CRM, +11 comment, +2 file, +6 assignment, +7 contact, +53 tin FB.

## Đã đưa HST `nextgo` vào dùng (cùng app, 19:15)

Không có Supabase project riêng — dùng tenant `nextgo` trên qlycv.

- Admin cao nhất: `quantri.hst@nextgo.vn` (mật khẩu không ghi repo)
- 6 NV login email cũ; bản cũ `+oldhst` tắt, không xóa
- Fanpage gắn công ty HST mới; 316 contact remap lead/KH theo map clone
- Webhook Meta **không đổi URL** (cùng Render)
- Deal mới trên HST là bản clone (625 lead lúc clone; công ty cũ vẫn giữ bản đầy đủ hơn)
