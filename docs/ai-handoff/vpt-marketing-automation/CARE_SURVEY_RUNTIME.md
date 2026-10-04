# Đề xuất khảo sát bằng danh tính AI riêng

Ngày 04/10/2026. Tiếp nối [gửi tư vấn](CARE_ANSWER_DELIVERY.md). SQL695 nối worker tư vấn với lịch CRM, gửi đề xuất, bằng chứng khách xác nhận và bàn giao. Chưa enrollment, quyền thật, provider thật hoặc phát hành. Full goal ACTIVE.

## Luật và quyền

AI chỉ chọn SURVEY khi có lời yêu cầu và địa điểm trích nguyên văn từ inbound. Không được truyền nhân sự, giờ, option, giá hoặc boolean đồng ý. Những trích dẫn vẫn là nhu cầu chưa xác minh; hệ thống gửi lại địa điểm cùng lịch để khách xác nhận. Hệ thống chọn giờ sớm nhất còn trống trong cửa sổ policy; không tuyên bố đã khớp mọi mong muốn về giờ của khách. Khách có thể không xác nhận và trao đổi lại.

Runtime policy riêng xác định Agent/grant/công ty/Page, vùng, nhân sự, kỳ hiệu lực, thời gian báo trước, khoảng tìm lịch và tổng số đề xuất. Policy mặc định inactive; sửa active xoay authorization ID, các trường quyền khác bất biến. BEGIN chỉ mở lựa chọn SURVEY khi cờ riêng và policy hợp lệ; không dùng quyền gọi model để suy ra quyền khảo sát. Không có API để AI tự thêm policy. Quyền transport/ingress/outcome theo Page vẫn phải được cấp riêng.

FINISH kiểm lại nguồn và hội thoại, lấy giờ trống hiện hành dưới calendar gate; không đặt chỗ. Một request chỉ tạo một proposal. Hạn mức tính cả proposal đã hết hạn hoặc không được khách xác nhận. Thiếu lịch, vùng/nhân sự không phù hợp, địa điểm quá ngắn, tệp chưa hiểu hoặc đã có khảo sát chuyển hàng chờ người xử lý.

Proposal và audit lưu đúng Agent; grantor chỉ là nguồn ủy quyền. Nhân sự khảo sát là người thật, crm_events.created_by giữ NULL như đường human hiện có. Core dùng chung giữ luật lịch, buffer, nguồn và quyền sở hữu dữ liệu; facade human giữ các kiểm soát hiện hành của SQL679.

## Gửi, xác nhận và bàn giao

Dispatch và booking kiểm lại authority snapshot; thu hồi rồi bật lại không làm proposal cũ hợp lệ. Lease gửi còn bị giới hạn bởi grant/policy. Token xác nhận chỉ xuất hiện trong payload gửi một lần qua transport, không trả trong API đề xuất. Chỉ signed inbound đúng Page/PSID/proposal/token mới có thể đặt lịch; click trước ACK chờ đối soát. Khách STOP trong cùng batch thắng việc xác nhận. Hai khách cùng chọn một giờ chỉ một người đặt được.

Booking tạo lịch, người tham gia, bằng chứng và handoff cùng giao dịch. Thông báo kết quả dùng sự kiện thực tế, không tự nói nhân sự đã nhận hồ sơ. Người khảo sát có quyền đọc hội thoại và xác nhận nhận bàn giao. Signed confirmation đã vào ingress không được coi là câu hỏi mới để gọi lại model.

Khóa authority dùng FOR SHARE; quota advisory chỉ nằm trên đường proposer trước run/thread. Booking/receipt không cần khóa quota hoặc policy độc quyền. Calendar vẫn theo thread → calendar gate → proposal. Kiểm lại hạn sau chờ và ghi; không retry POST hoặc tự mở lại lượt chưa rõ kết quả.

## Bật/tắt và kiểm chứng

`VPT_CARE_RUNTIME_SURVEY=1` và `VPT_CARE_RUNTIME_SURVEY_POLICY` chọn đường BEGIN riêng. Mặc định tắt. Hoàn tác: ngừng tạo đề xuất, vô hiệu policy để chặn gửi/booking mới, giữ signed receipts, đối soát và quyền đọc handoff đã đặt. Không xóa lịch/bằng chứng hoặc tự gửi lại UNCERTAIN. Một HTTP đã được cấp trong lease hoặc đã bắt đầu không thể được hứa là đã hủy.

Runtime `e91381af5e68c4074eca600ad0487d0f14df3162`, tree `ce06e8d29de6d348fb5c680f73928c280759f13d`. [Automation37195694346](https://github.com/backen-pixel/Quanlycongviec/actions/runs/37195694346) cả10job SUCCESS; PostgreSQL111416967405 đạt489PASS/0fail/0skip, gồm20ca survey mới. Node18/22 jobs111416967433/111416967442 mỗi bản1.388/0/0; build111416967228 đạt10.335modules/39,21s. [Report37195694282](https://github.com/backen-pixel/Quanlycongviec/actions/runs/37195694282) và [Messenger37195694283](https://github.com/backen-pixel/Quanlycongviec/actions/runs/37195694283) SUCCESS.

CI merge `8149a194f9778b9595b91f4f13c7beef7068a4ac` khớp tree và parents `e16c885ae7c2305645be02a1227bf378cb59137f` + runtime. Reviewer độc lập tự đối chiếu published blobs/log/tree, xác nhận20ca mới và PASS checkpoint đúng bản cuối; không còn finding chặn trong phạm vi đã rà. Local1.383PASS/0fail/5skip; CI chạy thêm native/Express. Bộ PG kiểm worker → proposal → signed click/ACK → booking → outcome → handoff, quyền/ABA/STOP, cạnh tranh slot, quota, mất claim, hết hạn sau chờ, hai lock orders có observer và hồi quy human.

Review diff đã phát hiện và sửa: facade human phải giữ toàn bộ guard679, gồm safe replay và delivery barrier; nhánh không có lịch/hết quota dùng block label tường minh khi ghi reason. Unit độc lập35/35PASS; kết luận PostgreSQL cuối ở trên mới là bằng chứng nghiệm thu.

CI d629fe1 và f767b9c mỗi bản477PASS/10FAIL (9ca con+parent); bản đầu lỗi qualifier, bản sau các ca mới nhận NO_CONFIRMED_OPTION. Không dùng các bản này làm PASS. Review xác định lịch ngoài policy bị đếm vào giới hạn200 trước lọc. Bản sửa tiếp lọc nhân sự ngay trong inventory/roster loop; prepare chỉ nhìn staff được cấp, recheck proposal/dispatch/book nhìn staff đã chọn. Human API giữ phạm vi và giới hạn cũ. Thêm ca hơn200 options ngoài policy vẫn book đúng và hơn200 trong policy phải trả SURVEY_RANGE_TOO_BROAD, không dùng danh sách một phần.

Còn chất lượng model thật, lịch/người nhận và quyền thật, UI runtime/ngoại lệ, đối soát chuyển luồng, UAT và Founder release. Không suy kết quả kinh doanh từ dữ liệu giả.
