# Tắt NextGo trên hệ Tủ Bếp — sau 14–90 ngày ổn định

**Bước 1 đã làm 2026-09-15:** `is_active=false` trên HST mặc định
(primary + backup). Các bước còn lại chưa làm.

1. Giữ `is_active=false`; không `DELETE` 90 ngày. **Đã xong 15/09.**
2. Ẩn khỏi [`crmCompanyFilter.js`](../../../frontend/src/lib/crmCompanyFilter.js) (Metalla/NextGo đang được ưu tiên).
3. Không seed thêm 338–457 trên prod cũ.
4. Parser Excel / COST hộp cứng **giữ trong repo** (instance NextGo vẫn cần).
5. Hardcode inbox `luonggiayen@gmail.com` trên instance Tủ Bếp: dọn khi chắc không rollback.
6. Gỡ page token trên app Facebook cũ nếu còn subscribe URL Tủ Bếp.
7. Tenant clone `e37fac98…` / company `842cff41…` trên DB cũ: xóa sau khi xác nhận không còn ai dùng.
