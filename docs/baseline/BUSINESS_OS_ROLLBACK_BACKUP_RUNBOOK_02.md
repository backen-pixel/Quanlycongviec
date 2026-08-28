# Runbook rollback và backup — Business OS baseline 02

## Nguyên tắc

1. Rollback code không đồng nghĩa rollback dữ liệu.
2. Không sửa hoặc chạy down migration `473`, `567`–`582` trên staging có dữ liệu thật.
3. Không xóa event, task, chứng từ, Project change, Blueprint installation hoặc audit đã sinh trong UAT.
4. Ưu tiên tắt entry point/feature flag mới và quay UI/API về đường legacy.
5. Restore chỉ thực hiện ở môi trường tách biệt trước; cutover cần người chịu trách nhiệm dữ liệu phê duyệt.

## Rollback code/UI

Sau khi tag baseline 02 được công bố:

```bash
git rev-list -n 1 business-os-vnext-staging-baseline-02
git switch -c rollback/business-os-baseline-02 business-os-vnext-staging-baseline-02
```

Tag baseline 01 vẫn được giữ làm mốc lịch sử. Không dùng `git reset --hard` cho quy trình triển khai.

Rollback theo lát cắt:

- tắt gateway Business OS của company pilot hoặc quay về route legacy;
- giữ schema additive và toàn bộ chứng từ/audit;
- khóa API ghi của lát cắt bị lỗi;
- sửa bằng migration forward-fix mới nếu contract database sai;
- không xóa PO, hóa đơn, thanh toán hay Blueprint installation để “làm sạch”.

## Backup trước UAT

1. Chạy `cd backend && npm run db:gate:business-os-uat`.
2. Xác nhận `all_applied=true`, đủ `17/17`, `uat_gate.status="READY"`.
3. Backup phải `COMPLETED` sau `2026-08-27T01:01:30.141Z`; ghi id/thời gian vào checklist.
4. Nếu chưa đạt, dừng UAT hoặc tạo logical dump đã mã hóa, lưu ngoài Git và test restore.
5. Không lưu dump, database credential, JWT hoặc dữ liệu khách trong repository.

PITR hiện tắt. Không hứa phục hồi đến từng phút; recovery point phải được định danh cụ thể.

## Khi có lỗi UAT

| Loại lỗi | Hành động đầu tiên | Dữ liệu |
|---|---|---|
| UI/route trắng | Quay route legacy hoặc redeploy tag | Không đổi DB |
| Business rule/gate sai | Khóa thao tác ghi, lưu blocker và evidence | Giữ audit; forward-fix |
| Sai tenant/company scope | Dừng toàn bộ lát cắt liên quan và audit truy cập | Không tiếp tục UAT |
| Migration thiếu object | Dừng UAT, chạy audit, thêm migration mới | Không sửa file đã chạy |
| Chứng từ sai nhưng DB nhất quán | Reconcile qua API/script được review | Không restore toàn DB |
| Hỏng dữ liệu diện rộng | Đóng băng ghi, restore sang project tách biệt, đối soát | Cần phê duyệt quản trị |

## Kiểm chứng restore

Sau khi restore vào môi trường tách biệt:

1. audit đủ 17 capability;
2. đối chiếu count/khóa ngoại của tenant, company, Lead, Project, process/event, PO, supplier bill/payment, invoice/payment, expense, Project change và Blueprint installation;
3. chạy Business OS regression, tenant isolation, CRM parity và live smoke;
4. mở ít nhất một hồ sơ của mỗi kịch bản UAT 02;
5. chỉ thay target staging sau khi người chịu trách nhiệm dữ liệu xác nhận.
