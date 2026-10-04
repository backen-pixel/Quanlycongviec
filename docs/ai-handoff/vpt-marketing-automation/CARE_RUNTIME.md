# Runtime tư vấn và bàn giao người xử lý

Ngày 04/10/2026. Tiếp nối [adapter mô hình](CARE_OPENAI_INFERENCE.md). Phạm vi hiện tại: worker tự lấy hội thoại trong phạm vi đã được cấp, tạo đề xuất có nguồn và đưa ngoại lệ vào hàng chờ người xử lý. Không có quyền gửi tin, báo giá cuối cùng, chốt đơn hoặc đặt lịch từ suy luận của mô hình.

## Danh tính và luật dùng chung

SQL692 tách private core đọc thread/target/transcript, nguồn đã duyệt, context, BEGIN/FINISH và inference permit. Các public facade dành cho người vẫn kiểm quyền như trước; không nới marketing_fb_intake_admin. Core không được cấp EXECUTE cho PUBLIC/anon/authenticated/service_role.

SQL693 có runtime_principals và runtime_grants private, mặc định rỗng. Principal là AGENT có ID riêng, không trùng users. Grant xác định công ty/Page, người ủy quyền, inference policy, kỳ hiệu lực và tham chiếu phê duyệt. Người cấp phải còn quyền hiện hành trong công ty/tenant; worker thực thi bằng Agent ID, không dùng ID người cấp làm actor. Không cấp quyền đọc/ghi DB trực tiếp, quyền thư viện/publisher hoặc quyền công cụ nghiệp vụ khác cho Agent.

Nội dung principal/grant bất biến ngoài active; mỗi UPDATE xoay authorization_id, kể cả tắt rồi bật lại. Lượt cũ giữ snapshot/hash, worker ID và principal/grant; thay quyền làm claim/finish cũ mất hiệu lực. Kiểm hạn thời gian sau chờ khóa; dispatchBefore đã lưu và trả về không vượt hạn grant/policy/advisor. Cài migration không enrollment, chọn key/model, grant hoặc mở flags.

## Luồng xử lý

Worker careRuntime vào registry dừng/chờ hiện có. Mặc định tắt. Cấu hình server cần VPT_CARE_RUNTIME, VPT_CARE_RUNTIME_OPENAI, principal/company/grant/Page và inference policy UUID cụ thể, cùng dedicated key của adapter. Key, model và hạn mức phải khớp policy private đã duyệt; không dùng bot key. Các cờ human advisor không thay quyền runtime.

CANDIDATES chỉ trả tối đa 10 ID hội thoại WAITING của Page đã cấp. BEGIN khóa run trước thread nếu request đã tồn tại; lượt mới giữ dấu theo inbound message, không tự gọi lại sau mất ACK hoặc khởi động lại. Worker dùng cùng prepare/decode/timeout với advisor. Runtime inference gọi facade riêng, vẫn giữ reservation/usage SQL691. Provider chỉ nhận bí danh và nội dung cần thiết, không ID Agent/CRM hoặc quyền hệ thống.

ANSWER tạo DRAFT chứa nguyên văn câu trả lời đã duyệt và nhu cầu có trích dẫn, vẫn chưa xác minh nhu cầu. HANDOFF hoặc lỗi mô hình với ngữ cảnh còn hợp lệ chuyển HUMAN_REQUESTED, giữ người nhận từ CRM và SLA giờ làm việc. Mất routing/nguồn, hội thoại vượt giới hạn hoặc mapping CRM sai được ghi ngoại lệ metadata sau khi đã kiểm thread/Page/grant của chính công ty; không đọc/trả thông tin công ty khác. Ngoại lệ không giữ mãi các vị trí đầu và làm bỏ sót hội thoại hợp lệ.

Khách OPT_OUT hoặc người TAKEOVER làm kết quả đang chạy stale, không ghi đè quyền tiếp quản và không phát sinh câu trả lời. Nguồn bị thu hồi không được thay bằng câu trả lời tự suy diễn. Grant hết hạn/ABA có thể để RUNNING cần đối soát; không dùng TTL để tự gọi model lần nữa.

## Quan sát và đóng ngoại lệ

API dưới customer-care, qua đăng nhập và VPT_CARE_RUNTIME_ADMIN riêng:
- GET runtime/turns: lịch sử công ty, tối đa20 mỗi trang, không context/capability.
- GET runtime/turn: xem run theo quyền hiện tại; ẩn đề xuất khi nguồn hoặc authority không còn phù hợp.
- POST runtime/turn/close: người quản trị đóng một run với command ID, runtime request ID và lý do. Đóng lặp giữ kết quả; đổi nội dung cùng command bị từ chối.

Close chỉ đóng RUNNING và chuyển WAITING về human queue; giữ terminal draft, HUMAN_ACTIVE hoặc OPTED_OUT đã có. Không refund, sửa usage receipt, xóa inbound marker hoặc tự retry. FINISH muộn bị từ chối. Close không thu hồi một permit đã claim: HTTP có thể đã bắt đầu hoặc bắt đầu trong cửa sổ tối đa5giây còn hiệu lực, nên đóng không chứng minh không có phí provider. Chưa có màn hình thao tác runtime riêng; API là đầu vào cho phần đó.

## Kiểm chứng và phần còn thiếu

Local 1.369 PASS/5 skip; CI Node18/22 mỗi bản 1.374 PASS/0 fail/0 skip, gồm13 ca runtime/console mới và các ca native/Express chỉ chạy trên CI. Fixture lifecycle kiểm worker mới nằm trong registry và chịu stop/drain. PostgreSQL 448 PASS/0 fail/0 skip, gồm26ca runtime: worker→SQL→Responses giả→usage→DRAFT/HANDOFF, quyền/ABA, concurrency, mất ACK/restart, deadline, 10 mapping lỗi trước khách hợp lệ, operator close và chờ khóa quan sát được ở cả hai thứ tự CLOSE–FINISH/CLAIM.

Mã runtime `05d657e670bab692cf7d13782515a2b0e85ef1f5`; bản kiểm cuối `65b8c7b6d36de9e820a134e868191c55e81993c9`, tree `9d1250e07a7557787f3a1f87d7d0f46e032bbe83`. [Automation37191768019](https://github.com/backen-pixel/Quanlycongviec/actions/runs/37191768019): cả10job SUCCESS; intake111405286254, Node18/22 jobs111405286229/111405286239, build111405286312 (10.335 modules,38,11s). [Report37191768012](https://github.com/backen-pixel/Quanlycongviec/actions/runs/37191768012) và [Messenger37191768025](https://github.com/backen-pixel/Quanlycongviec/actions/runs/37191768025) SUCCESS. CI merge `22463284b671fe307dad5f9b8c106ffbe955b033` có cùng tree và parents `e16c885ae7c2305645be02a1227bf378cb59137f` + bản kiểm cuối.

CI đầu `05d657e` HOLD (373 PASS/49 FAIL): harness thiếu bảng của SQL690 trước SQL692,26ca runtime chưa chạy. Bản65b8c7b sửa thứ tự690→691→692, tái áp facade692 sau kiểm idempotence của migration cũ; fixture starvation tạo liên kết hợp lệ qua service rồi đổi company của Lead, giữ nguyên guard. Kết quả448/0/0 mới thay thế bằng chứng lỗi này.

Reviewer độc lập đã đối chiếu published blobs/log/tree và kết luận **PASS checkpoint trên65b8c7b**. Hai P2 trong mã (expiry sau chờ khóa và starvation do mapping lỗi) đã sửa và có regression PostgreSQL đạt; hai lỗi fixture nói trên cũng đã khép. Các phát hiện cú pháp delimiter đã sửa trước CI. Kết luận chỉ áp dụng SQL692–693, worker, API đọc/đóng và provider giả; chưa chứng nhận model thật, gửi khách, UI runtime, đặt lịch tự động, UAT hoặc phát hành. Chưa gọi AI/Meta/CRM thật.

Còn gửi câu trả lời qua quyền riêng và đối soát echo, tự đề xuất lịch từ lịch trống có xác nhận, UI ngoại lệ runtime, đánh giá chất lượng mô hình/dữ liệu thực tế, đối soát chi phí/UNKNOWN, cấu hình người nhận/lịch và nghiệm thu toàn tuyến. Full goal ACTIVE; không coi worker tạo draft là hoàn tất AI Sales.

## Hoàn tác

Tắt VPT_CARE_RUNTIME để chặn tick mới, dừng registry và chờ công việc đã nhận. Giữ quyền đọc/đóng của operator để đối soát. Không drop run/turn/usage, xóa marker hoặc mở lại đường gọi cũ. Thu hồi grant theo gói vận hành làm lượt cũ mất quyền; usage đã phát sinh vẫn lưu bằng capability riêng của receipt. Không tự chuyển sang Backup hoặc grant khác.
