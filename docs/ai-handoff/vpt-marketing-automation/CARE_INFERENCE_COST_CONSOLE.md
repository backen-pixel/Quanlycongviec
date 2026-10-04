# Theo dõi mức sử dụng và hàng chờ chi phí AI

Ngày04/10/2026. SQL696/API/tab **Chi phí AI** nối [biên nhận SQL691](CARE_OPENAI_INFERENCE.md) vào màn hình điều hành. Mục tiêu là biết phần đã ghi nhận và phần còn thiếu trước khi đối soát; đây chưa phải sổ hóa đơn hoặc công cụ giải phóng UNKNOWN.

## Phạm vi và số liệu

- Đọc toàn bộ lịch sử policy chăm khách của công ty, gồm actor người và Agent; giữ policy tắt, hết hạn và chưa dùng. Không bao gồm công cụ AI khác hoặc chi quảng cáo của đợt thử. Tổng không cộng số liệu từ các trang client.
- Tổng lượt đã cấp, reservedVnd, AUTHORIZED/UNKNOWN/USAGE_RECORDED/NOT_SENT và token có biên nhận. NOT_SENT vẫn giữ reservation như SQL691. Token không tự đổi thành tiền, reservation không phải hóa đơn; actualCostVnd luônNULL. Không nhận thiếu dữ liệu làm chi phí0.
- Tổng và từng trang policy/receipt lấy từ cùng một SQL statement snapshot. Đổi trang đọc mới và thay trang cũ. Cursor được kiểm đúng company/policy; không trộn cursor giữa phạm vi.
- Hàng chờ `queue=unresolved` lọc AUTHORIZED/UNKNOWN tại server; tổng vẫn tính toàn policy. Có mã lượt để đối chiếu log/bằng chứng. Đọc hàng chờ, đóng lượt runtime hoặc hết hạn không xác nhận miễn phí, hoàn ngân sách hoặc mở thêm lượt gọi.
- Không trả credential/hash, payload/context, capability, approval_reference hoặc responseId. Không chứa transcript khách. Kiểm toàn bộ binding company/actor của receipt-policy; sai liên kết trả lỗi thay vì âm thầm loại chi phí.

## Quyền và UI

RPC `crm_care_inference_costs` service-only, kiểm `advisor_authorize` bằng người đăng nhập hiện hành. GET dưới `/facebook/customer-care/inference/costs`, Primary và `VPT_CARE_COST_ADMIN=1` mới hoạt động; cờ mặc định tắt. Cờ đọc độc lập với quyền gọi model hoặc gửi tin. Không seed enrollment, ghi bảng, đổi grant hoặc release.

UI kiểm scope, conservation của trạng thái/token, cursor và số nguyên an toàn. Lỗi nguồn/quyền ẩn số cũ; actualCost vẫn chưa xác định. Tab, actor hoặc company đổi thì bỏ panel và phản hồi muộn. Chỉ có GET, không có lệnh sửa receipt/cấp hạn mức/unblock. Hạn mức active chưa khẳng định đủ quyền hoặc đủ tiền để thực thi.

## Kiểm chứng đang thực hiện

- Local toàn bộ workflow **1.401PASS/0FAIL/5SKIP**. Tám unit mới kiểm API off/default/auth/exactscope/Primary, schema UI, known-token≠invoice, trạng thái, unresolvedfilter và pagination.
- Chín ca PostgreSQL mới đã viết: quyền/secret; AUTHORIZED→UNKNOWN; usage/NOT_SENT/inactive; phân trang policy và receipt; queue sau nhiều receipt hoàn tất; integrityfail; observed company revocation; MVCC đồng nhất totals/rows; actual API→SQL và đóng runtime vẫn giữ UNKNOWN. Chờ CI để xác nhận thực thi. Fixture pagination dùng owner tạo lịch sử với context_hash riêng, không bỏ UNIQUE; đây là kiểm projection, không phải bằng chứng admission được vượt quota.
- Browser hỗ trợ localhost5196, actualWorkspace/ReactStrictMode/APIgiả, CSP connect-src none: tổng3lượt/reserved6000/token150/2unresolved/actualunknown; chi tiết3receipt rồi lọc còn2nhưng tổngkhôngđổi; lỗi403ẩn sốcũ; companyA→B→A với delayedREAD không hiện lại chi tiếtcũ; côngtykhôngpolicy cócounts0nhưng actualcost vẫnunknown. Browser do bên triển khai thực hiện, không provider/UAT thật.
- Reviewer phát hiện CASE cần ngoặc và fixture UNIQUE; đã sửa. Đã thêm bộ lọc hàng chờ tại server theo review. Kết luận checkpoint còn chờ publishedCI/build/PG cuối.

## Phần còn lại và hoàn tác

Đối soát thực tế cần nguồn account/model/hóađơn được phép, cách gắn bằng chứng với mã lượt, xử lý UNKNOWN/mấtACK và lưu audit kết luận. Chưa có công cụ xác nhận chi phí thực hoặc mở lại policy từ kết luận này; không sửa tay receipt thành NOT_SENT để mở khóa. Kiểm chất lượng AI, cấu hình người nhận/lịch, inventory/chuyển luồng, UAT và Founder release vẫn còn. Fullgoal ACTIVE, chưa đo được250k/khách thật.

Hoàn tác: tắt cờ đọc hoặc bỏ tab/router mới; giữ policy/receipt/usage và các khóa admission hiện có. Không cần drop bảng, xóa reservation hoặc lùi hàm691. SQL696 chỉ thêm reader, chưa áp DB thật.
