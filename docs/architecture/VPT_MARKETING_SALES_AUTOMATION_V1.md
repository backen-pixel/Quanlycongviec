# VPT Marketing–Sales tự động hóa — V1

**Founder đã duyệt kế hoạch và giao triển khai ngày 02/10/2026.** Đây là nguồn kế hoạch chung trong repo; không phải chứng nhận hệ thống đã phát hành. Thay phương án ngân sách A/B 14/21 triệu và phương án thuê thường xuyên đội quảng cáo/nội dung. Quyết định nền Business AI OS V1.1 tại PR #20 giữ nguyên.

## Mục tiêu và cách đo

- Toàn bộ sản phẩm VPT, khách mua để sử dụng; Facebook, website, Google, TikTok, ChatGPT Ads, Zalo OA + Ads. Chuẩn bị đủ sáu kênh trước mở rộng; không buộc mọi kênh tiêu tiền đồng thời.
- Trial một lần: **tối đa 100.000.000 VND trong 30 ngày**, gồm Facebook đang chạy. Không tự gia hạn hoặc cộng thêm 100 triệu mỗi tháng. Chiến dịch thật vẫn theo trạng thái hiện hữu tới khi có gói chuyển đổi/phát hành cụ thể.
- HCM 80 triệu, Cần Thơ 20 triệu. Khởi điểm Google 35, Facebook 30, TikTok 20, Zalo 10, ChatGPT 5 triệu; mỗi kênh chia 80/20. Website/OA là điểm nhận/chăm khách.
- Chỉ tiêu chính: tiền quảng cáo / doanh thu quy kết quảng cáo **được kế toán ghi nhận, chưa VAT, sau giảm/hủy/điều chỉnh** <=7%. Tiền đã thu, giá trị đơn và giá trị deal ước tính là ba số riêng.
- 100 triệu chi đủ cần 1.428.571.429 VND doanh thu đủ điều kiện. Tủ bếp Founder ước 80–150 triệu/đơn, 1–3 tháng chốt; tương đương khoảng 10–18 đơn nếu giá trị đó là doanh thu đủ điều kiện. Không áp giá trị tủ bếp cho phụ kiện/sản phẩm khác.
- 300 khách hợp lệ là chỉ tiêu phụ; không chi thêm để đạt số lượng. Khách phải khác nhau, nhu cầu phù hợp, trong vùng phục vụ, liên hệ dùng được, có bằng chứng nguồn trả phí; nhãn ấm/nóng AI không tự chứng minh khách hợp lệ.
- Theo nhóm khách của đợt chi: kiểm mốc 30/60/90 ngày sau tiếp nhận; khoảng ngày120 từ mở thử mới đủ90 ngày theo dõi cả nhóm. Đơn chưa ghi nhận tiếp tục theo dõi. Không lấy doanh thu khách cũ làm đẹp kết quả; không đòi doanh thu đủ trong30 ngày chi.
- Toàn bộ spend thuộc trial được tính, kể cả ads zero-Lead. Mỗi Order/posted line đếm một lần. Quy tắc nguồn V1: FIRST_VERIFIED_PAID_LEAD_V1; điểm chạm khác được lưu, không cộng trùng. Nguồn không rõ không tự gán paid.
- AI/công cụ/nội dung/thời gian con người báo cáo riêng với chi phí trên khảo sát/đơn; chưa có ngân sách công cụ hoặc giá dịch vụ được duyệt. 7% là mục tiêu hiệu quả, không phải bảo đảm kết quả.

## Phân vai và quyền

Founder giữ tài khoản, ngân sách, quy tắc, nhà cung cấp và quyết định phát hành. Một người nội bộ kiêm nhiệm cùng dự phòng nhận ngoại lệ. Không mặc định thuê agency/đội nội dung thường xuyên; thuê theo việc cụ thể nếu thiếu năng lực/tài sản.

AI tạo/kiểm/đăng nội dung trong bộ quy tắc và dữ liệu được duyệt; chuẩn bị/chạy/thử mẫu quảng cáo trong gói đã duyệt; tư vấn, sàng lọc, chăm khách và hẹn khảo sát. Người thật khảo sát, xác nhận báo giá cuối, thương lượng, chốt đơn. Không cấp AI quyền phát hành báo giá cuối, giảm giá, hợp đồng hoặc chốt đơn ở V1. Founder duyệt policy một lần thay vì từng việc thông thường; thay phạm vi/policy vẫn cần quyết định mới.

Codex khảo sát, xây, kiểm thử và đóng gói. Claude Code hỗ trợ khi được giao. Reviewer độc lập rà code/quyền/bằng chứng. Factory khác runtime Agent; không gọi tài khoản thật từ kiểm thử.

## Tuyến triển khai

Nội dung → quảng cáo → Lead → tư vấn → khảo sát → người chốt đơn → doanh thu → tối ưu. Giữ Express/React/Supabase/Render, CRM canonical, Domain giữ luật và Application Service điều phối. AI chỉ qua tool/service có quyền, không ghi DB trực tiếp. Workflow phải bền vững trước khi điều phối tác động.

1. **Dữ liệu/quyền:** kiểm kê sáu kênh, quyền thật, library sản phẩm/chính sách/giá/ảnh/bản quyền, lịch khảo sát, nguồn kế toán, người nhận ngoại lệ, dự toán và trần API riêng.
2. **Đo lường:** nối sự kiện chống trùng → Lead → khảo sát → Order/chứng từ → recognized postings và điều chỉnh; audit, scope, độ mới và độ đầy đủ phải rõ.
3. **Nội dung/ads:** mỗi nhóm sản phẩm hai thông điệp, hai mẫu ảnh, một video. Lịch đầu: ba video ngắn, ba bài ảnh, một hướng dẫn/công trình mỗi tuần và chuyển thể theo kênh. Cải thiện website hiện có, landing/form/điện thoại/Zalo và success tracking. Ảnh minh họa không giả công trình thật; không tạo đánh giá/giá/cam kết không nguồn. Phần kênh chưa có công cụ được đưa hàng chờ thao tác, không giả lập thành tự động.
4. **Chăm khách:** AI hỏi sản phẩm/địa bàn/nhu cầu/ngân sách/thời gian, lưu có nguồn; slot khảo sát thực và khách xác nhận trước đặt. Bàn giao có hội thoại/ảnh/tóm tắt/người nhận. Opt-out/human takeover dừng AI; thiếu nguồn chuyển người. Người phản hồi trong15 phút làm việc08–20 hằng ngày, có dự phòng.
5. **Nghiệm thu/thử:** review riêng, isolated PostgreSQL, UAT đúng phiên bản, gói ảnh hưởng/rollback/quyết định phát hành; trial30 ngày rồi theo dõi nhóm khách dài hơn chu kỳ chi.

Gói3/4 song song sau contracts/quyền. Ước6–8 tuần cũ phải rà lại khi xong kiểm kê vì thêm automation và đối soát doanh thu. Không dùng lịch ước lượng làm phê duyệt phát hành.

## Ngân sách và vận hành

- Bảy ngày đầu giữ phân bổ thử, chỉ xử lý lỗi/an toàn ngân sách/thử nội dung. Sau đó tối đa10% mỗi48h cùng đối tượng; nguồn giảm được xác nhận trước khi tăng đích. Có thể đổi kênh trong cùng vùng, không chuyển quỹ80/20.
- Thử chuyển tiền cần ít nhất7 ngày dữ liệu và10 khách hợp lệ khác nhau trong mỗi nhóm so sánh, cùng nhóm sản phẩm. Khi doanh thu chưa đủ kỳ, chất lượng khách/khảo sát chỉ là tín hiệu thử, không chứng minh đạt7%.
- Ưu tiên doanh thu thật khi đủ độ trễ và đối soát; không so khách mới với nhóm đã chăm3 tháng. Không đặt ROAS14,29x ngay trên mọi nền tảng khi chưa đủ dữ liệu.
- Thiếu nguồn/chi tiêu không rõ/quyền hết hạn khóa tăng; intake hỏng tạm dừng phần liên quan. Cap nền tảng, dự phòng độ trễ, toàn bộ exposure và giữ chỗ đồng thời phải được kiểm chứng. Không coi daily budget×days là hard cap.
- Không ép tiêu hết100 triệu; lịch phải thỏa minimum nền tảng. Mốc7/14/30 ngày đánh giá vận hành; kết luận7% dựa số liệu đủ kỳ. Sau trial không tự cấp gói ngân sách mới.

## Giao tiếp và nghiệm thu

Intake: source/event ID, time, product, region, contact, paid evidence. Care: conversation/consent/calendar slot+version/handoff owner. Finance projection: accounting source, immutable posted line+version, signed net exVAT, recognition time, adjustment reference, Order/Lead và source coverage. Commands: actor/company/action/policy version/content hash/idempotency/provider receipt/audit; outcome phân biệt denied/pending/unknown/success.

Test: đúng/sai công ty/quyền và thu hồi; lặp/đồng thời/crash/restart; sai giá/không nguồn/prompt injection; slot trùng, opt-out, người tiếp quản; adjustment và attribution đến muộn; tiền tệ/lỗi/thiếu trang; toàn bộ chi kể cả zero-Lead;7ngày/10khách/10%/48h/80-20/cap/dừng; DB thật cô lập và UAT phiên bản. Dashboard phân biệt deal estimate/order/revenue/cash, chi phí AI/người và trạng thái chưa xác minh.

Theo dõi thực thi và phần chưa đạt tại [hồ sơ triển khai](../ai-handoff/vpt-marketing-automation/README.md). Chỉ dẫn PR #19/#20/#21 là phụ thuộc có trạng thái riêng, không suy đã merge hoặc vận hành.
