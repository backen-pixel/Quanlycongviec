# Cùng kỳ đo cho tiền quảng cáo và khách

2026-10-03; base b66ce94. Risk HIGH: sai kỳ đo hoặc bỏ receipt có thể làm sai quyết định quảng cáo. Đây là phần nền cho measurement close, chưa phải nghiệm thu CPQL hoặc mở đợt chi. Toàn bộ mục tiêu Marketing–Sales vẫn ACTIVE.

## Hành vi

- SQL670 bổ sung `marketing_measurement.census_observations`, schema riêng không cấp quyền trực tiếp cho browser hoặc service role. Chỉ hàm census đã kiểm lease, Page, người thực hiện và phạm vi mới ghi metadata provider; không lưu thông tin liên hệ trong bảng này.
- Lượt kiểm kê mới chốt tại nửa đêm Việt Nam gần nhất đã qua, tối đa hết ngày cuối của kỳ 30 ngày. Chưa có ngày hoàn tất thì từ chối tạo lượt; không diễn giải thành không có khách hoặc chi tiêu bằng 0. Mã yêu cầu cũ trả lại đúng lượt đã tạo, không đổi mốc qua ngày mới.
- Mọi timestamp đã đọc từ provider được giữ, gồm ngoài kỳ. Chỉ dữ liệu trong kỳ được khôi phục vào hàng chờ CRM. Bằng chứng ngoài kỳ không tạo Lead hay tự hoàn tất receipt; khi webhook tới muộn, snapshot mới liên kết lại metadata đã có. Xung đột ID/form/time/Graph version và timestamp tương lai làm thất bại cả chunk.
- Commit giữ thứ tự khóa run → task, kiểm lại lease/scope cuối giao dịch; observation, receipt và cursor cùng hoàn tác khi lỗi. Các mốc lịch sử không backfill bằng suy luận. Cấu trúc snapshot v2 giữ observation của các receipt thuộc đúng công ty trong cùng snapshot SQL với toàn bộ report; vượt giới hạn thì không báo đủ dữ liệu.
- Báo cáo dùng một kỳ `[sinceAt, untilExclusive)` cho khách và tiền. Nếu census hiện hành có mốc ngày hoàn tất, dùng đúng mốc cố định của lượt đó, kể cả lúc đọc sang ngày mới. Lượt cũ chốt giữa ngày hiện cảnh báo cần kiểm kê lại. Ngày chi tiêu đang diễn ra không được cộng vào kỳ này; chi phí từ tài khoản không có Lead vẫn được cộng đủ.
- Snapshot chi tiêu phải được lấy sau mốc đóng kỳ và còn mới theo chính sách hiện tại. Số liệu lấy trước khi ngày kết thúc không chứng minh đủ tiền của cả ngày. Kết luận chất lượng khách được đọc theo hồ sơ hiện tại, có `qualificationAsOf` riêng; không giả vờ đó là chất lượng đã biết ngay tại cutoff.
- Receipt chưa xử lý chỉ được phân loại ngoài kỳ khi có timestamp provider đúng định danh từ lượt SCANNED hiện hành, hoặc source proof đã xác minh khớp receipt DONE. Scope đổi/lượt lỗi/chưa xong/mâu thuẫn bằng chứng thì tiếp tục giữ ngoại lệ. Không dùng ngày webhook đến để loại hồ sơ. Dashboard hiển thị kỳ đối chiếu và số lượt đã chứng minh ngoài kỳ.

## Bằng chứng và giới hạn

Kiểm thử mới bao phủ biên 17:00 UTC, ngày đầu/ngày cuối, census cũ, đọc sang ngày mới, xác minh chất lượng muộn, chi phí lấy quá sớm, receipt tới muộn, scope đổi, nguồn mâu thuẫn và bảo vệ dữ liệu quan sát. PostgreSQL chạy SQL670 hai lần trong môi trường cô lập, cùng các tình huống quyền, khóa, phân trang, replay và rollback của SQL656/657. Kết quả đúng commit được ghi ở hồ sơ review sau khi CI và reviewer hoàn tất.

**Chưa đủ điều kiện công bố CPQL:** cần registry kiểm kê account/Page/form/nơi nhận khách có nguồn chứng thực; bằng chứng provider về quyền/retention và phạm vi đầy đủ; đối soát nguồn cũ; sau đó đóng kỳ có phiên bản và đường positive tính CPQL. Chưa có kiểm thử Meta thật. Không được chỉ đổi `INCOMPLETE` thành `COMPLETE` để mở chỉ số. Phần chưa nối website/Messenger/kênh khác phải giữ rõ, không gộp thành toàn bộ kết quả quảng cáo.

Tiếp theo nối bằng chứng phạm vi với mốc đo này, kiểm đường đủ bằng chứng (ví dụ 1 triệu/4 khách duy nhất = 250.000 đồng), và đưa lịch/khách chờ lên dashboard. Sau đó UAT và gói Founder phát hành. Mục tiêu 7% chưa được đánh giá; tài chính không chặn bước chuẩn bị đo Lead.

## Phát hành và hoàn tác

Mặc định các cờ report/census/intake vẫn tắt; không có DB thật, kết nối Meta, mở quyền hay thay đổi quảng cáo trong increment này. Phát hành cần kiểm schema/migration, quyền và khối lượng thực tế, backup/restore, UAT và Founder quyết định. Tắt report/census để ngừng đường mới; giữ observation, audit và CRM đã tiếp nhận. Không xóa giao dịch, không khôi phục số tiền của ngày chưa hoàn tất thành số đã chốt.
