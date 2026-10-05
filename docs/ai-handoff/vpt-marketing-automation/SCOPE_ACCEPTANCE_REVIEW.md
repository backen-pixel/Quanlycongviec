# Kiểm chứng xác nhận phạm vi CPQL

Ngày 03/10/2026. Runtime `960086c9bad47db6cb794072f2bbbfd1dcc22448`, tree `a579545dbf296ee104f16a44df06af5ae695ef3a`, PR22 draft. [Hợp đồng và hoàn tác](SCOPE_ACCEPTANCE.md). Full goal ACTIVE.

## Bằng chứng đúng phiên bản

- [Automation37120410381](https://github.com/backen-pixel/Quanlycongviec/actions/runs/37120410381): cả 10 job SUCCESS.
- [Census PostgreSQL111195252499](https://github.com/backen-pixel/Quanlycongviec/actions/runs/37120410381/job/111195252499): 88 PASS / 0 FAIL / 0 SKIP, gồm 10 ca scope acceptance mới; HTTP 1/0/0.
- [Node22 111195252577](https://github.com/backen-pixel/Quanlycongviec/actions/runs/37120410381/job/111195252577): 808/0/0; Node18 SUCCESS.
- [Full frontend111195252527](https://github.com/backen-pixel/Quanlycongviec/actions/runs/37120410381/job/111195252527): 10.323 modules, 35,93 giây, SUCCESS.
- [Report37120410373](https://github.com/backen-pixel/Quanlycongviec/actions/runs/37120410373) và [Messenger37120410378](https://github.com/backen-pixel/Quanlycongviec/actions/runs/37120410378) SUCCESS.
- CI checkout `f5effa03ceadd2c7ce945b9edb5795de0d96f423`; Git API xác nhận parents runtime960086c + base `e16c885ae7c2305645be02a1227bf378cb59137f`, cùng tree runtime. Không lấy kết quả của candidate lỗi làm bằng chứng bản cuối.

Local 24 ca mới / 63 ca mới và liên quan PASS. Reviewer độc lập `/root/architecture_v11_review` tự chạy 24/24, đối chiếu bốn blob SQL/backend/UI với GitHub, đọc CI và kết luận **PASS** đúng runtime960086c. Không còn finding chặn trong increment này.

## Phát hiện đã sửa

1. Proof có cùng mã ad nhưng sai adset/campaign vẫn qua phép đo: giữ metadata delivery và từ chối mâu thuẫn, thêm regression.
2. Quyền công ty đổi true→NULL trong lúc chờ khóa có thể lọt GET/replay: kiểm lại quyền nghiêm ngặt sau helper lấy khóa; PostgreSQL kiểm cả GET, prepare-replay và record-replay.
3. Khi báo cáo nguồn lỗi, panel thu hồi biến mất: mount panel theo kỳ đã xác minh từ danh sách, độc lập kết quả báo cáo, vẫn tách người/công ty/kỳ.
4. Người xác nhận chưa nhìn thấy đúng tệp đang chốt: hiện Page/form, tham chiếu, giờ xuất, receipt, hash bytes/tập mã và trạng thái rỗng từ chính snapshot acceptance.

Candidate `c659e8da13c7b0b3d58b015daadd5f960d56b121` có lỗi cú pháp CASE trong SQL677, bị PostgreSQL CI chặn trước khi chạy các case. Đã sửa ngoặc trong runtime960086c; migration677 được áp dụng hai lần thành công trong bộ PostgreSQL cuối.

## Kiểm thử PostgreSQL mới

- Quyền table/RPC riêng; browser broad grant không vượt guard; sai công ty bị từ chối.
- Collector thật với Meta giả → whole-account spend/delivery → registry → parser CSV thật → source export → qualification → accepted scope: **1 triệu / 4 = 250.000 đồng**, gồm tài khoản chi 500.000 đồng không tạo khách. Artifact thực lưu riêng, response chỉ metadata.
- Hai lần gửi cùng yêu cầu đồng thời chỉ ghi một lần; sửa nội dung hoặc bytes bị từ chối.
- ACCEPT cạnh tranh REVOKE: chỉ một lệnh thắng expected revision; retry ACCEPT cũ sau REVOKE vẫn là lịch sử.
- Chất lượng khách đổi: current thành CHANGED_SOURCE, số cũ không ghi thành bản mới.
- Receipt tới trong lúc append: rollback cả acceptance và artifact.
- Nguồn lỗi: ẩn kết quả hiện hành, vẫn cho người đủ quyền thu hồi.
- Quyền người xác nhận bị thu hồi: không đọc/replay; người có quyền khác thấy STALE_AUTHORITY.
- Report private vẫn từ chối sai target, quyền chi, phạm vi, phép chia, thời điểm và kỳ đo.
- Công ty đổi quyền trong lúc request chờ khóa: ba đường đọc/replay đều từ chối.

## Giao diện thực với API giả

Đã kiểm qua công cụ trình duyệt được hỗ trợ, `127.0.0.1:5188`, component `ScopeAcceptance` và màn hình cha `MarketingLeadTrial` từ đúng runtime960086c. Fixture có CSP `connect-src 'none'`; không đăng nhập hoặc gọi CRM/Meta thật. CSS fixture chỉ phục vụ bố cục kiểm thử; full frontend build là bằng chứng riêng cho bản ứng dụng.

- Không tự chọn đích hoặc xác nhận; phải chọn đủ bốn hàng quảng cáo (gồm hai ad zero-spend) và ba nội dung xác nhận.
- Xem đúng Page/form/thời điểm xuất và đầy đủ mã biên nhận, hash tệp/tập khách ngay trước ghi.
- Chọn tệp 55 byte → gửi → giả lập đã lưu nhưng mất phản hồi: số hiện hành ẩn, giữ cùng yêu cầu.
- Tải lại: giữ pending metadata, không giữ file bytes; retry bị khóa tới khi chọn lại đúng tệp. Tệp khác bị từ chối; đúng tệp mở retry.
- Gửi lại trả biên nhận **lịch sử**, không gọi đó là current. Tải lại mới hiện kết quả 1 triệu/4/250k trong phạm vi đã xác nhận.
- Dữ liệu đổi: trạng thái cần đối chiếu lại, không còn khối kết quả hiện hành.
- Trong màn hình cha, danh sách kỳ trả thành công nhưng report503 và scope SOURCE_UNAVAILABLE: panel vẫn hiện lý do/nút thu hồi; thu hồi thành công và reload cho REVOKED.
- Đổi người khi GET chậm: không giữ pending của người cũ; phản hồi cũ không ghi đè trạng thái của component mới. API lỗi: chỉ hiện lỗi, không dùng số cũ.
- Quan sát bố cục/kết quả trên trình duyệt; đã đóng tab và dừng server thử sau kiểm tra.

Đây là kiểm tra do bên triển khai thực hiện. Reviewer độc lập không coi browser/UAT của bên triển khai là nghiệm thu vận hành độc lập.

## Giới hạn và bước tiếp

Kết quả `QUALIFIED_SCOPE_CPQL` dựa trên provenance người vận hành xác nhận và dữ liệu server đối soát. Chưa chứng minh toàn bộ Meta hoặc đa kênh, chưa dữ liệu thật đạt 250k, không cấp quyền chi. Các entrypoint chưa nối vẫn chặn chấp nhận phạm vi; không được bỏ chúng để làm đẹp số. Còn quy thuộc khảo sát/chờ xử lý theo nhóm quảng cáo, thiết lập vận hành AI/lịch/ngoại lệ, kênh tiếp theo và UAT/Founder release.

Không merge, migration thật, cấp quyền AI, gửi khách, đổi quảng cáo/ngân sách hoặc kích hoạt đợt thử. Giữ hạn mức 100 triệu một lần/30 ngày. Hoàn tác bằng tắt flag và giữ bằng chứng; không xóa lịch sử hoặc mở lại quyền không an toàn.
