# NextGo — tách instance QLCV

Cùng codebase, Supabase + Render + domain riêng.  
Dump đã verify 100% với nguồn — xem [`SYNC-STATUS.md`](./SYNC-STATUS.md).  
Nạp đích khi có `NEXTGO_SUPABASE_*`. **Không xóa dữ liệu hệ cũ.** Freeze/webhook chỉ khi anh yêu cầu rõ.

| Việc | Làm ngay | Chờ lệnh |
|---|---|---|
| Kiểm kê + dump | Có | |
| Script export / import / storage | Có | |
| Tạo project Supabase / Render / DNS | Checklist sẵn | Anh provision |
| Đồng bộ dump + verify 100% | [`SYNC-STATUS.md`](./SYNC-STATUS.md) | |
| Import `--apply` vào DB đích | | Khi có `NEXTGO_SUPABASE_*` |
| Freeze + webhook FB | | `NEXTGO_CUTOVER=YES` |

Nguồn vận hành: `87479a83-1145-43b7-b090-3e40812cb5a9` (tenant `default`).  
**Không** dùng bản clone cùng DB (`842cff41…`, tenant slug `nextgo`) — thiếu FB/file, UUID khác, user alias.

- [INVENTORY](./INVENTORY.md)
- [EXTRACT-PACK](./EXTRACT-PACK.md)
- [INFRA](./INFRA.md)
- [UAT](./UAT.md)
- [CUTOVER](./CUTOVER.md) — chưa chạy
- [DECOMMISSION](./DECOMMISSION.md) — sau 14–90 ngày
