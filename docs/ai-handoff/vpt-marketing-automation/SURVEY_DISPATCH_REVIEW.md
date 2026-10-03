# Review gửi đề xuất khảo sát — 03/10/2026

**PASS trong phạm vi increment; phát hành HOLD; toàn bộ mục tiêu vẫn ACTIVE.** Reviewer độc lập `/root/architecture_v11_review` đọc mã, tự chạy47 kiểm thử cục bộ và đọc log CI đúng phiên bản. Không có finding chặn còn mở trong phạm vi gửi đề xuất/ACK/echo/recovery đã rà.

## Phiên bản được kiểm tra

- Runtime `f82380f35031663786da8a0abc4b9c080f26b650`, tree `02e76a435d15bcdfabbdaa795fcdd57c5eba251d`.
- CI checkout merge `bff750e59356f7981510da7f25a979300beab80b`: cha runtime trên và base `e16c885ae7c2305645be02a1227bf378cb59137f`. Đây là checkout kiểm thử, chưa merge PR vào nhánh vận hành.
- SQL667 blob `51cd76575530b2a163503d6c8bd0eaeb38479332`; PG cases `78ddcfe7a1eedf16b4d3f7b0a0224d372f37e0e2`.
- Worker blob `331fe5c6ab89cb3f046bab551a071b2e77718147`; parser `c8f36747e4cd44df8c04bebd07ab2d0b79332b59`; route `3dc1ec92926928b42e780b762d0704535c39040a`.
- Root kiểm từng blob trước cập nhật ref. Reviewer xác minh riêng SQL/PG trên GitHub với bản local. Bản đóng hồ sơ sau runtime chỉ thay tài liệu.

## Bằng chứng thực thi

[Automation run37092857662](https://github.com/backen-pixel/Quanlycongviec/actions/runs/37092857662): cả10 job SUCCESS.

| Phạm vi | Kết quả | Job |
|---|---|---|
| PostgreSQL16 intake/care/calendar/dispatch |158 PASS,0 FAIL,0 SKIP;21 case dispatch mới|[111116688520](https://github.com/backen-pixel/Quanlycongviec/actions/runs/37092857662/job/111116688520)|
| Node22 domain/regression |593 PASS,0 FAIL,0 SKIP|[111116688507](https://github.com/backen-pixel/Quanlycongviec/actions/runs/37092857662/job/111116688507)|
| Frontend đầy đủ |10.307 module;35,41 giây;SUCCESS|[111116688356](https://github.com/backen-pixel/Quanlycongviec/actions/runs/37092857662/job/111116688356)|
| Kiểm thử cục bộ worker/care/webhook |47 PASS,0 FAIL,0 SKIP;root và reviewer chạy riêng|Node trực tiếp, không PostgreSQL local|

[Report regression37092857681](https://github.com/backen-pixel/Quanlycongviec/actions/runs/37092857681) và [Messenger regression37092857666](https://github.com/backen-pixel/Quanlycongviec/actions/runs/37092857666) SUCCESS. Không đổi giao diện nên không bổ sung browser acceptance trong increment này.

Positive path thực thi worker → POST giả chứa đúng payload → raw webhook ký bằng secret thử → receiver thật → PostgreSQL → lịch/handoff. Fixture không gán SENT cho positive path. Kiểm cả ACK/echo/click đến khác thứ tự, tranh claim, mất phản hồi claim/ACK, restart/crash, timeout không resend, whole-batch STOP, trạng thái tiếp quản giữ nguyên, sai app/body/metadata, conflict MID/replay, cửa sổ inbound24h, proposal/source hết hiệu lực, quyền bị thu hồi, ACK tranh recovery, credential xoay, sai công ty và broad grants. Đề xuất mới không vượt UNCERTAIN; conflict sau BOOKED không xóa lịch hay ghi đè MID ban đầu.

## Finding đã đóng

- Review trước publish phát hiện lỗi escape khi sinh phần override SQL; đã tái dựng nguyên văn bằng callback replacement, giữ delimiter/regex.
- Deadline có thể ngắn hơn5 giây: worker dùng đúng khoảng sendBefore−authorizedAt cho monotonic, thêm regression300ms với clock skew500ms và delay500ms.
- Token đọc trước claim có thể bị thay: đối chiếu SHA256 với Page hiện hành đang khóa và enrollment, thêm PG case token xoay.
- CI đầu tại `b543eaa2` thất bại: record/alias `a` trùng trong recovery (42702), fixture truyền JS array thành PG array thay JSONB (22P02). Follow-up đổi alias và serialize array; lần chạy cuối phía trên đạt. Không dùng run thất bại làm bằng chứng PASS.

## Giới hạn và cổng tiếp theo

Provider được giả lập; không có gửi/nhận Meta thật, xác minh quyền tài khoản hay UAT. Enrollment rỗng, cờ mặc định tắt. `credential_evidence` cần dẫn chứng token thuộc đúng Page/app tại release; dòng văn bản này không tự chứng minh provider association. Không có model/API OpenAI, DB thật, quảng cáo, quyền AI mới hoặc trial activation.

Commit claim là điểm cấp quyền; HTTP đã bắt đầu không thể bị rút lại khi STOP đến sau. Booking vẫn kiểm quyền/STOP hiện hành. Chưa có UI giải quyết UNCERTAIN/CONFLICT, ACK người khảo sát, thông báo đặt lịch, hủy/đổi lịch hoặc chuyển writer cũ. Dữ liệu sản phẩm/lịch, nguồn/chi tiêu đủ phạm vi, backup/restore, nghiệm thu và phê duyệt Founder còn bắt buộc. Chưa có CPQL thực tế chứng minh250.000đ.

Rollback và điều kiện bật được ghi trong [contract](SURVEY_DISPATCH.md): ngừng gửi mới, giữ lịch/attempt/receipt/audit, không đặt lại QUEUED, không mở lại đường cũ không kiểm soát.
