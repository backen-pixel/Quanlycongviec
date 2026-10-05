# Hạ tầng instance NextGo (chưa provision trong repo)

Làm **song song** dump. Không trỏ webhook FB/Zalo cho đến CUTOVER.

## Checklist

1. Tạo Supabase project mới (primary; backup nếu đang dùng failover).
2. Áp schema: chạy lần lượt `database/*.sql` trên project trống — **không** dump data Tủ Bếp.
3. Tạo service Render mới, Redis nếu Socket.IO >1 instance.
4. Domain (vd. `app.nextgo.vn`) + JWT secret **riêng**.
5. Env đích:
   - `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` trên Render NextGo
   - Local import: `NEXTGO_SUPABASE_URL` + `NEXTGO_SUPABASE_SERVICE_ROLE_KEY` (khác URL nguồn)
   - Copy `FACEBOOK_*` / token page vào dump hoặc env — **chưa** đổi callback URL
6. Seed tenant: import tự tạo slug `nextgo` + `tenant_features`, hoặc chạy [`database/597_nextgo_instance_empty_tenant.sql`](../../../database/597_nextgo_instance_empty_tenant.sql) **chỉ trên DB trống**.
7. Một admin hệ thống NextGo (không bắt buộc dùng chung `admin@tubep.vn`).

## Cấm

- Không chạy 597 / import `--apply` trên Supabase Tủ Bếp.
- Không chạy `clone-nextgo-to-tenant.js` trên production như đường cắt.
