# Biên bản hồi quy — Business OS baseline 02

- Ngày chốt: `2026-08-28`
- Feature cut: `bc7881a9`
- Branch: `codex/business-os-deal-survey-design`
- Database staging: `atcfpgxkgbszglrelfgr`
- Kết luận phạm vi Business OS: `PASS`
- Trạng thái kỹ thuật/UAT: `READY_FOR_USER_UAT`

## Bằng chứng đã đạt

| Hạng mục | Kết quả | Bằng chứng |
|---|---|---|
| Business OS unit/contract | `PASS 37/37` | `cd backend && npm run test:business-os` |
| Tenant isolation | `PASS` | `cd backend && npm run test:tenant` |
| CRM split + authenticated parity | `PASS 100/100` | Backend Node độc lập trên cổng test; JWT tạm chỉ tồn tại trong memory và đã bị xóa |
| Business OS live smoke | `PASS` | Overview 200 hồ sơ; Qualification/Survey/Design/Design Review v1 có đủ 3 task template mỗi stage |
| Frontend production build | `PASS` | 10.289 module; exit code `0`; cảnh báo chunk đã biết, không có lỗi compile |
| Browser smoke | `PASS` | Trung tâm, Công việc, Sales, Vận hành, Mua hàng, Tài chính, Khách hàng, Báo cáo tải dữ liệu thật; không màn trắng hoặc console error |
| Migration staging | `PASS 17/17` | Audit `473`, `567`–`582` lúc `2026-08-27T01:01:30.141Z` |
| Blueprint isolation contract | `PASS` | Override công ty A/B độc lập; nâng version giữ override; `null` xóa override có kiểm soát |

Sau migration 581, Báo cáo đọc 71 Project, 15 Project cần chú ý và đã có đủ nguồn để công bố lợi nhuận dự báo khoảng 5,9 tỷ đồng tại thời điểm smoke. Đây là ảnh chụp staging, không phải cam kết số liệu kế toán cuối kỳ.

## Ổn định CRM parity

Hai lần chạy đầu trên backend dev bị watcher reset kết nối. Lần chốt dùng tiến trình Node độc lập không watcher, giữ cùng code/database và đạt liền mạch nhóm A `50/50` cùng nhóm B `50/50`. Tiến trình test đã dừng và JWT tạm đã bị xóa sau khi hoàn tất.

## Cổng recovery

- Schema freeze: `2026-08-27T01:01:30.141Z`.
- Backup đã xác minh: `2026-08-27T22:13:42.536Z`, id `1499151552`.
- Backup mới hơn freeze; audit lúc `2026-08-28T12:21:06.927Z` trả `uat_gate.status="READY"`.
- PITR vẫn tắt; rollback/restore phải theo runbook và dùng môi trường tách biệt.

## Giới hạn kiểm tra

- Platform Admin UI chưa browser-smoke bằng tài khoản `platform_admin`; tài khoản pilot hiện tại bị điều hướng về Dashboard đúng theo quyền. Logic Blueprint được phủ bằng unit/contract và schema audit, còn thao tác preview/apply công ty thứ hai nằm trong checklist UAT 02.
- Không tạo Blueprint installation cho công ty thứ hai trong lúc hồi quy tự động.
- Không deploy production và không sửa dữ liệu giao dịch để làm đẹp kết quả test.
