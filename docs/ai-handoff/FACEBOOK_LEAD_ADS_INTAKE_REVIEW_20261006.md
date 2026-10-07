# Review độc lập — Facebook Lead Ads tiếp nhận vào CRM

Ngày review: 06/10/2026. PR: [#29](https://github.com/backen-pixel/Quanlycongviec/pull/29).

Reviewer: Agent `marketing_release_review`, phiên riêng với các agent viết domain/service, handler, SQL và kiểm thử. Reviewer đọc nguồn, chạy kiểm thử Node trong phiên review và tự đọc kết quả/log CI qua kết nối GitHub chỉ đọc. Reviewer không sửa mã, không gọi DB thật, không thay cấu hình Meta/Render và không tạo GitHub approval. Biên bản này là review kỹ thuật độc lập của Agent, không thay quyết định Founder hoặc phê duyệt của GitHub maintainer.

## Kết luận và phiên bản

**PASS mã và kiểm thử trong phạm vi cô lập, mặc định tắt/paused. Production HOLD.** Không còn finding chặn mã trong phạm vi được rà tại phiên bản dưới đây. PASS không có nghĩa tuyến nhận khách thật đã được nghiệm thu hoặc có thể bật toàn endpoint.

- Source head: `a5bcabf3b5d680166cd1223650f3bd85f8acd3b8`.
- Base main: `1f879ea85dfff23629fef79c8d15f2eaf540328e`.
- CI checkout: merge ref `64ac2d06ce9eedfb07e5495f17e4cbcee31da89f`, có hai parent là base và source head trên.
- Reviewer đối chiếu Git tree của source head và CI merge: cùng `7d0293e1951dad8ef9086ce1584f83967c42f019`. Vì vậy kết quả CI bên dưới gắn đúng cây đã rà.

## Phạm vi và bằng chứng

Đã rà domain/service `facebookLeadAdsIntake.js`, claim lane/context của `facebookPageInbox.js`, kết nối trong route `facebook.js`, SQL702, các kiểm thử liên quan, workflow `facebook-page-inbox.yml` và [hồ sơ phạm vi](FACEBOOK_LEAD_ADS_INTAKE_20261006.md). Đây là phần tiếp nối [review H1](FACEBOOK_PAGE_INBOX_H1_REVIEW_20261006.md), không mở lại toàn bộ PR22/25 hoặc gói C/H2.

Reviewer tự đọc trạng thái ba job và log của [CI run 37393352657](https://github.com/backen-pixel/Quanlycongviec/actions/runs/37393352657); cả ba completed/success:

| Bằng chứng | Kết quả xác nhận |
|---|---|
| [Node 18 — job 112043385423](https://github.com/backen-pixel/Quanlycongviec/actions/runs/37393352657/job/112043385423) | 194 kiểm thử, 194 PASS, 0 FAIL, 0 SKIP; syntax checks đạt |
| [Node 22 — job 112043385408](https://github.com/backen-pixel/Quanlycongviec/actions/runs/37393352657/job/112043385408) | 194 kiểm thử, 194 PASS, 0 FAIL, 0 SKIP; syntax checks đạt |
| [PostgreSQL17 — job 112043385270](https://github.com/backen-pixel/Quanlycongviec/actions/runs/37393352657/job/112043385270) | H1 SQL701: 15/15 PASS, gồm logical dump/restore của fixture inbox; SQL702: 29/29 PASS |

PostgreSQL dùng schema CRM giả có khai báo rõ và các migration thật trong harness, gồm trigger 145/392, cài 39 rồi bỏ bằng 227, cùng 700/701/702. Không phải chạy toàn bộ lịch sử migration hoặc bản sao DB production. Node có tình huống nối receiver có chữ ký → worker → route thực → service thực với storage/provider giả; không có lời gọi Meta thật.

## Các kiểm soát được xác nhận

- Binding Page/form được cấu hình rõ; không seed đăng ký hoặc tự bật. Backend không dùng tên hiển thị của Admin để suy danh tính. Transaction kiểm lại công ty/tenant, người nhận cùng công ty còn hoạt động và vai Admin/Sales Admin, cùng pipeline/stage/source/region hiện hành.
- Provider Lead/form/Page và ad ID khi có được đối chiếu trước ghi; retry dùng snapshot của receipt đã lưu. Lease, binding version và quyền hiện hành vẫn được kiểm khi replay.
- Customer, contact, Lead, bản ghi form, attribution, thông báo nội bộ và receipt được ghi trong một transaction. Kiểm thử có lỗi giữa chừng, xử lý đồng thời, mất phản hồi sau commit, lease hết hạn khi chờ khóa và thu hồi quyền. Replay không tự sửa hồ sơ cũ hoặc gửi thêm thông báo khi bằng chứng bàn giao bị mất/sai người nhận.
- Leadgen là khóa chống trùng; số điện thoại không dùng để gộp khách giữa công ty. Hồ sơ cùng công ty đã có số hoặc dữ liệu cũ chưa có receipt được giữ để đối soát. `FBLEAD-<uuid>` không đưa giá trị mới vào bộ phân tích mã `LEAD-%` cũ.
- SQL702 từ chối khi có namespace/bảng của gói C; không cần SQL682 cho lane mới. Generic H1 giữ guard cũ. Không đồng thời thay đổi C khi worker này hoạt động.
- Trigger CRM được giữ để kiểm tenant và ghi lịch sử. Search path đặt `pg_catalog,public,pg_temp`; từ chối khi các vai ứng dụng/browser có CREATE trong public. Bộ PG kiểm temp shadowing, quyền schema không an toàn và trigger sinh task cũ còn hoạt động.
- Lead Ads lấy hồ sơ đến hạn, không để một lead đang backoff chặn các lead độc lập khác. Vẫn chỉ một lease hoạt động trên mỗi Page. Messenger và sự kiện khác được giữ lại; lane này không nhận trách nhiệm xử lý chúng.

Finding chặn cuối đã được sửa và rà lại: biến PL/pgSQL `phone` trùng tên cột trong điều kiện tìm Customer. Commit source cuối dùng `v_phone`; các ca tạo mới và đồng thời đã qua PostgreSQL CI. Không cần thay SQL700 hoặc vô hiệu trigger CRM để đạt kết quả này.

## Giới hạn và điều kiện trước kích hoạt

1. **Receiver H1 đổi toàn endpoint.** Hoàn tất Lead Ads chưa hoàn tất projection Messenger. Cần phương án chuyển đổi có kiểm chứng để nhắn tin/sự kiện ngoài lane không bị giữ vô thời hạn hoặc mất xử lý; xác nhận queue cũ, writer cũ/mới và đường rollback theo đúng phiên bản triển khai.
2. **Cấu hình thật chưa được biên bản này nghiệm thu.** Cần bằng chứng Page/form VPT, binding đúng ID công ty/tenant/Admin VPT/taxonomy, quyền và phiên bản Graph, Primary-only/single writer, ACL/schema/trigger thực tế. Không lấy fixture thay cho các kiểm tra này.
3. **Restore có giới hạn rõ.** 15 ca H1 chứng minh logical restore fixture inbox SQL701. Chưa có bằng chứng restore toàn tập Customer/Lead/contact/attribution/notification/receipt SQL702; càng không chứng minh khôi phục production. Gói phát hành phải có bằng chứng khôi phục phù hợp và đối soát liên kết sau khôi phục.
4. **Kết quả nghiệp vụ chưa được suy rộng.** Receipt chứng minh tạo hồ sơ và một thông báo trong ứng dụng; không chứng minh Admin đã đọc/gọi, khách trong vùng phục vụ, khách hợp lệ, lịch khảo sát hoặc doanh thu. Attribution còn `paid_status=UNVERIFIED`; không dùng số receipt làm mẫu số khách hợp lệ cho mục tiêu 250.000 đồng/Lead.
5. **Ngoài phạm vi:** task tự sinh, tin/email/push gửi ra ngoài, AI tư vấn, lịch khảo sát, backfill hồ sơ thật, chỉnh quảng cáo/ngân sách, gói C/H2 và phát hành production. Biên bản không cấp quyền mở những phần này.

Giữ `VPT_FB_LEAD_ADS_INTAKE` tắt, binding chưa kích hoạt và worker paused cho tới khi các điều kiện chuyển đổi/target được kiểm chứng trong gói phát hành. Dừng hoặc rollback ưu tiên pause worker, giữ nguyên inbox/receipt và dữ liệu đã phát sinh; không xóa giao dịch hoặc bật đồng thời hai đường ghi. Bước tiếp theo phù hợp là chuẩn bị và kiểm chứng gói cutover/target cụ thể, giữ nguyên các lựa chọn Founder đã chốt.
