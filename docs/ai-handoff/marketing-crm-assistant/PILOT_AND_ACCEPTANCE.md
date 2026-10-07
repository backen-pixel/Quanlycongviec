# Phân công triển khai và điều kiện nghiệm thu
Gói MCRM-D0 v1, 02/10/2026. Kế hoạch dưới đây phục vụ giao việc; chưa mở tất cả các bước implementation.

## Gói đã được giao và bàn giao
Mục tiêu: khảo sát và chuẩn bị thử nghiệm trợ lý Marketing–CRM.
Phạm vi: mã/tài liệu; 4 hợp đồng công cụ đề xuất; mẫu báo cáo; 1 bộ dữ liệu minh họa; 26 kịch bản runtime cần thực thi sau này; backlog và đầu vào.
Base mã: main `0db11ce1adb0fb89fc87529036e495a62d58fce7`.
Nguồn: [SOURCE_MAP](SOURCE_MAP.md), [manifest](source-manifest.json), PR #19/#20 theo SHA.
Điều chưa chắc: [target manifest](target-manifest.json).
Tiêu chí gói khảo sát: nguồn truy được, ví dụ đối soát khớp, phân vai rõ, quyền/unknown/gate không bị suy thành đã đạt, review riêng theo gói. Xem [VALIDATION](VALIDATION.md).

## Công việc tiếp theo và khối lượng cụ thể
| Mã | Owner | Đầu ra | Phụ thuộc/gate |
|---|---|---|---|
| MCRM-01 | Codex + Sales Admin | Một manifest môi trường/phạm vi; một policy care/ack/SLA có phiên bản; bộ mẫu được phép | Sales Admin và môi trường chưa xác định. Không truy cập lại cấu hình bị chặn bằng đường khác. |
| MCRM-02 | Codex | Dịch vụ đọc intake→Lead, phân trang và coverage; tách event với unique Lead | Kiểm quyền liên quan; đối soát Lead Ads ACK/recovery. Không lấy báo cáo attribution thay sổ intake. |
| MCRM-03 | Codex | Dịch vụ care evidence không tác động seen_by; phân loại owner/ack/care/task | Policy nghiệp vụ; xác minh lại route/helper ở base mới, object/region/field quyền đầy đủ. |
| MCRM-04 | Codex | Adapter 4 công cụ với schema đóng; report snapshot và định nghĩa chỉ số | MCRM-02/03, sources chỉ đọc; Ads/knowledge chưa đạt phải tắt riêng hoặc trả UNKNOWN. |
| MCRM-05 | Codex | Một Agent, gọi thủ công, quản lý phiên/kết quả/lỗi/hạn mức | Credential lựa chọn hợp lệ + Agents API access + môi trường thử; đánh giá dữ liệu giả trước. |
| MCRM-06 | Codex | Một vùng giao diện React xem report/nguồn/ngoại lệ/bản nháp | Contract ổn định; xử lý đổi công ty, lỗi và dữ liệu cũ. |
| MCRM-07 | Reviewer riêng + Codex | Ma trận runtime có kết quả, source SHA, log giảm dữ liệu nhạy cảm, cách hoàn tác | Thực thi lớp test phù hợp; DB/quyền/đồng thời dùng PostgreSQL cô lập. |
| MCRM-08 | Sales Admin + Founder | UAT đúng phiên bản, đo chất lượng/thời gian/chi phí, quyết định mở phạm vi | Gate liên quan đạt; không coi PASS giả lập là nghiệm thu thật. |

Đây là 8 đầu việc, không phải 8 ngày. Đường phụ thuộc: 01→02/03→04→05/06→07→08. Chuẩn bị fixture/giao diện giả có thể song song; mở API thật và dữ liệu thật theo gate tương ứng. Chưa đủ thông tin để cam kết số ngày hoặc tổng chi phí; MCRM-01 chốt khối lượng sửa và môi trường rồi owner dự toán theo các file/case đã xác minh.

Claude Code hỗ trợ 01 nếu được giao và đã xác minh môi trường; không là dependency bắt buộc để Codex khảo sát. Reviewer đọc đầy đủ yêu cầu/mã/bằng chứng và làm ở phiên riêng; người viết không tự chứng nhận phần mình.

## Các gate tách biệt
| Gate | Điều kiện | Trạng thái tại gói này |
|---|---|---|
| G0 — hồ sơ khảo sát | Nguồn/link, fixture, phân công và review tài liệu đạt | Xem VALIDATION |
| G1 — công cụ chỉ đọc | Quyền actor/tenant/company/object/region đúng, dữ liệu không lộ, không ghi seen_by hoặc nghiệp vụ, UNKNOWN đúng | NOT_RUN |
| G2 — thử Agent dữ liệu giả | Access/cost limit, session/error handling và eval có bằng chứng; không tool ghi | NOT_RUN |
| G3 — dữ liệu thật | Môi trường/phạm vi/người nhận/policy xác nhận; intake Lead Ads được nghiệm thu; kiểm DB/quyền liên quan đạt | HOLD |
| G4 — sử dụng/phát hành | Gói đúng phiên bản, UAT, theo dõi và phương án tắt; Founder quyết định | HOLD |

Phạm vi Lead Ads được chọn theo quảng cáo biểu mẫu đã trao đổi. Messenger có gate riêng, không suy PASS chéo. Lỗi nguồn Ads phụ có thể để UNKNOWN trong pilot chăm sóc; lỗi nguồn intake/CRM bắt buộc không được cho phép kết luận “tất cả đã xử lý”.

## Bộ tình huống
[acceptance-cases.json](acceptance-cases.json) là nguồn 26 kịch bản. **Tất cả là NOT_RUN** ở gói khảo sát. Kiểm tính nhất quán fixture không phải chạy 26 kịch bản này.

Nhóm cần ưu tiên: sai công ty/thu hồi quyền (M01–04); read không ghi (M05); trùng/thiếu/owner/bằng chứng (M06–12); nguồn lỗi/phân trang/thời gian/cohort/UI (M13–19); lỗi Lead Ads/đồng thời (M20–21); Agent bị dẫn dắt/tool lỗi/tri thức/quyền ghi/chất lượng (M22–26).

## Đo hiệu quả
Sales Admin lập bộ đối chứng có kết luận và nguồn đã kiểm, lấy cùng phạm vi trước/sau trợ lý. Ghi:
- Số kết luận đúng/sai/chưa đủ bằng chứng và số lần phải sửa.
- Mọi kết luận có nguồn; không có lộ chéo công ty hoặc thao tác ngoài quyền.
- Thời gian chuẩn bị báo cáo và xử lý ngoại lệ của người vận hành.
- Model/tools/container usage quan sát được và chi phí mỗi báo cáo; không điền 0 khi chưa đo.
- Ngưỡng độ mới, thời gian phản hồi, ngân sách và mức tiết kiệm mục tiêu do Founder/owner chốt trước nghiệm thu. Khi chưa có baseline thì INCONCLUSIVE.

## Tắt và hoàn tác
Gói này chỉ thêm tài liệu và fixture; hoàn tác bằng revert commit tài liệu, giữ lịch sử.
Khi triển khai: cờ mặc định tắt theo công ty, vô hiệu hóa adapter/đăng ký Agent để dừng; không xóa Lead, task, bằng chứng/audit hoặc sửa trạng thái đã chăm sóc. Giữ bot và luồng hiện có theo phạm vi chuyển đổi đã kiểm. Cấp quyền ghi, lịch chạy và tối ưu quảng cáo tự động là gói riêng.

## Hướng dẫn nghiệm thu của Sales Admin
Chọn hồ sơ mẫu đã được phép → đối chiếu nguồn intake/Lead/owner/hoạt động → ghi chênh lệch theo mã hồ sơ → xác nhận điều kiện đã đạt hoặc lý do HOLD. Không gửi PII trong repo. Founder nhận bản kết quả có phiên bản và giới hạn cụ thể để quyết định.

