# Runbook rollback và backup — Business OS baseline 01

## Nguyên tắc

1. Rollback code không đồng nghĩa rollback dữ liệu.
2. Không chạy down migration trên staging có dữ liệu thật.
3. Không xóa event, task, chứng từ, project change hoặc audit đã sinh trong UAT.
4. Ưu tiên tắt entry point/feature flag mới và quay UI/API về đường legacy.
5. Restore database chỉ dùng khi có hỏng dữ liệu, phải thử ở môi trường tách biệt trước.

## Rollback code/UI

Mốc chuẩn:

```bash
git rev-list -n 1 business-os-vnext-staging-baseline-01
git switch -c rollback/business-os-baseline-01 business-os-vnext-staging-baseline-01
```

Trong triển khai staging, redeploy commit của tag thay vì `git reset --hard`. Nếu chỉ một lát cắt lỗi:

- tắt gateway/feature flag Business OS của company pilot;
- dùng lại route legacy đã giữ trong ADR, ví dụ `/management/production-overview/:id`;
- giữ nguyên schema additive và dữ liệu/audit đã phát sinh;
- tạo migration forward-fix mới nếu contract database sai.

## Backup trước UAT

1. Chạy `cd backend && npm run db:audit:business-os`.
2. Xác nhận `all_applied=true`.
3. Xác nhận `backup.verified=true` và `latest_completed_backup_at` sau `2026-08-26T10:21:23.977Z`.
4. Ghi backup id/thời gian vào biên bản UAT.
5. Nếu chưa có backup đủ mới, dừng UAT hoặc tạo logical dump ngoài Git bằng credential database được quản trị cấp.
6. Không lưu dump, key, token hoặc dữ liệu khách hàng trong repository.

PITR đang tắt nên không được hứa phục hồi đến từng phút. Baseline chỉ xem backup là đạt khi có recovery point hoàn tất và được định danh rõ.

## Khi có lỗi UAT

| Loại lỗi | Hành động đầu tiên | Dữ liệu |
|---|---|---|
| UI/route trắng hoặc lỗi render | Tắt entry point mới, quay route legacy, redeploy tag baseline | Không đổi DB |
| Business rule/gate sai | Khóa thao tác ghi của lát cắt, ghi blocker, sửa backend và test lại | Giữ audit; forward-fix |
| Migration thiếu object | Dừng UAT, chạy audit, bổ sung migration mới | Không sửa file migration đã chạy |
| Ghi nhầm nhưng dữ liệu còn nhất quán | Reconcile bằng API/script được review và lưu audit | Không restore toàn DB |
| Hỏng/corrupt dữ liệu diện rộng | Đóng băng ghi, định danh recovery point, restore sang project tách biệt, đối soát rồi mới quyết định cutover | Cần phê duyệt quản trị |

## Kiểm chứng restore

Sau khi restore vào môi trường tách biệt:

1. chạy audit migration;
2. so sánh count và khóa ngoại của `companies`, `users`, `crm_leads`, `projects`, `business_os_process_instances`, `business_os_process_events`, `business_os_customer_service_cases`, `project_incidents`;
3. chạy `npm run test:business-os`, `npm run test:tenant` và live smoke trên target restore;
4. mở ngẫu nhiên tối thiểu một hồ sơ ở mỗi lộ trình UAT;
5. chỉ thay target staging sau khi người chịu trách nhiệm dữ liệu ký xác nhận.
