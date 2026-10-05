# Kiểm chứng bản lưu kết quả đo
Ngày03/10/2026. Runtime ad841ffb88f62ebd1c8c006f4d7c95f47021e201, tree7739ca56f8cbfe08a620bfc06d5f11b47db35db5; PR22 draft.

Reviewer độc lập /root/architecture_v11_review kết luận PASS cho increment này, không còn finding chặn. Reviewer phát hiện regex UUID sai ở backend/UI trước publish; đã sửa cả hai và kiểm bằng UUID chuẩn. Reviewer tự chạy unit, đọc CI, đối chiếu bốn blob SQL/service/PGcases/UI với bản remote. Browser bên dưới do tác giả thực hiện, không tính là nghiệm chứng độc lập.

## CI và phiên bản
- [Automation37114984970](https://github.com/backen-pixel/Quanlycongviec/actions/runs/37114984970):10/10job SUCCESS.
- [Census PostgreSQL111179942956](https://github.com/backen-pixel/Quanlycongviec/actions/runs/37114984970/job/111179942956):71PASS/0FAIL/0SKIP, gồm11ca snapshot mới; HTTP source-export1/0/0 vẫn đạt.
- [Node22 111179943034](https://github.com/backen-pixel/Quanlycongviec/actions/runs/37114984970/job/111179943034):757PASS/0FAIL/0SKIP; Node18 SUCCESS.
- [Build111179943054](https://github.com/backen-pixel/Quanlycongviec/actions/runs/37114984970/job/111179943054):10.320modules,26.77s,SUCCESS.
- [Report37114984969](https://github.com/backen-pixel/Quanlycongviec/actions/runs/37114984969) và [Messenger37114985368](https://github.com/backen-pixel/Quanlycongviec/actions/runs/37114985368) SUCCESS.
- CI checkout merge9652e8c0d67afd9a8012f2e8d5a18bdd9cf6f67b; Git API xác nhận parents runtimead841ff + basee16c885ae7c2305645be02a1227bf378cb59137f, tree giống runtime.

Runtime có12unit mới. Follow-up chỉ test/hồ sơ bổ sung3ca obligation: missing Page/form, NO_LEAD_SOURCE không chứng nhận0, MATCHED/EMPTY/DUPLICATE/conflict/stale giữ nghĩa riêng, website/Messenger/unresolved form không bị bỏ qua. Local15/15PASS. Reviewer đã kiểm3ca và nhắc tên ca Messenger chưa có fixture; tác giả bổ sung đúng entry/assertion Messenger và chạy lại15PASS. Follow-up không đổi runtime/SQL/UI; CI của commit follow-up cần xem trên PR.

## PostgreSQL thật trong môi trường cô lập
Migration675 áp dụng hai lần. Positive case nối census/intake/quality/spend thật với nguồn giả:1.000.000/4=250.000, giữ cả tài khoản có chi không tạo khách. Bản lưu vẫn SAVED_OBSERVED_INCOMPLETE và target NOT_EVALUATED.

Đã kiểm quyền trực tiếp và grant rộng, sai công ty, request đồng thời, retry cũ trước tính lại, quality chuyển REJECTED, account/spend thay đổi, source/quality helpers cùng MVCC, receipt tới sau initial compare trước append khiến toàn giao dịch rollback, lease/retry không làm stale, receipt được census chứng minh ngoài kỳ không làm stale khi đổi trạng thái xử lý, capture quá60giây, thay dependencies/completeness bị từ chối và actor bị thu hồi.

Kiểm MVCC dùng pg_sleep trong quality helper trong khi account thứ hai bị tắt ở kết nối khác: bản đang đọc giữ cả tiền và export dependency trước thay đổi; lần đọc sau đổi version. Test barrier BEFORE INSERT chờ advisory lock để receipt mới commit trước append; không có hàng snapshot được lưu. Không dùng memory mock để thay bằng chứng DB.

## Giao diện do tác giả kiểm
Component MeasurementSnapshot thật, API và dữ liệu giả tại127.0.0.1:4189; CSP connect-src none, CSS giản lược. Fixture ở work/vpt-survey-execution/measurement-browser ngoài repo. Không đăng nhập, Meta/CRM thật hoặc giao dịch thật.

1. Hiện1triệu/4khách/250k với cảnh báo chưa đủ nguồn. Danh sách thiếu chỉ rõ act_1/act_2.
2. Máy chủ giả lưu rồi mất phản hồi: số cũ ẩn, giữ pending request.
3. Đổi số giả thành3khách, reload: pending khôi phục; preview333.333đ và history250.000đ tách rõ, có cảnh báo dữ liệu đã đổi.
4. Retry trả bản lịch sử4khách/250k cùng thời điểm cũ; không báo nó là số hiện tại.
5. GET nguồn lỗi sau thành công: toàn summary/receipt cũ ẩn.
6. Giữ GET của ngườiA, đổi sangB và đọc dữ liệuB; trả phản hồiA muộn không ghi đè.
Đã đóng tab, dừng server sau kiểm thử. Không là full-page UAT hoặc kiểm tài khoản thật.

## Giới hạn và bước tiếp
[Hợp đồng/hoàn tác](MEASUREMENT_SNAPSHOT.md). Fingerprint675 bỏ lease/retry và receipt đã chứng minh ngoài kỳ; identity/source/qualification còn bảo thủ để giữ phát hiện khách cũ/trùng. Lịch sử chứa projection số và evidence IDs/digests, không sao chép liên hệ hoặc raw inventory. Digest không tái dựng dữ liệu cá nhân đã đổi.

Bản lưu giúp đối chiếu quyết định theo thời điểm; chưa có hợp đồng chấp nhận provenance/phạm vi thực của mọi account/entrypoint, chưa full measurement close hoặc CPQL toàn đợt. Cần hoàn thiện đủ nguồn, các kênh/ngoại lệ vận hành, UAT và Founder release theo mục tiêu chung. Không merge, migration thật, gửi khách, mở AI rights, chi tiền hoặc bật đợt thử. Full goal ACTIVE.

