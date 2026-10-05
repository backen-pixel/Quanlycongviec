# Kiểm chứng đối soát bản xuất nguồn

Ngày 03/10/2026. Runtime `920e66bc7cfe94e518ae4a02bb677cd135cda79a`, tree `dbb986a3597d1b11cb25abe70bf1f0e43aaa6c46`; PR22 draft. SQL674/API/UI thực hiện đối soát tập mã nguồn; không chứng nhận provider completeness, full CPQL hoặc phát hành.

Reviewer độc lập `/root/architecture_v11_review` kết luận PASS cho toàn increment ở runtime trên, không còn finding chặn. Reviewer tự chạy local24/24, đọc CI và đối chiếu blob UI/state/PG với GitHub. Browser do tác giả thực hiện được giữ riêng, không tính là bằng chứng độc lập.

## Bằng chứng đúng phiên bản

- Local24 parser/service/UI-state PASS/0FAIL/0SKIP.
- [Automation37112179618](https://github.com/backen-pixel/Quanlycongviec/actions/runs/37112179618): cả10job SUCCESS.
- [Census PostgreSQL111172074851](https://github.com/backen-pixel/Quanlycongviec/actions/runs/37112179618/job/111172074851):60PASS/0FAIL/0SKIP, gồm10ca mới về export. Cùng job kiểm Express5.2.1 thật: JSON limit2MiB nhận CSV1MiB, thêm1byte bị service từ chối trước RPC;1PASS/0FAIL/0SKIP.
- [Node22 111172074887](https://github.com/backen-pixel/Quanlycongviec/actions/runs/37112179618/job/111172074887):745PASS/0FAIL/0SKIP; Node18 SUCCESS.
- [Frontend111172074765](https://github.com/backen-pixel/Quanlycongviec/actions/runs/37112179618/job/111172074765):10.318modules,28.97s, SUCCESS.
- [Report37112179600](https://github.com/backen-pixel/Quanlycongviec/actions/runs/37112179600) và [Messenger37112179556](https://github.com/backen-pixel/Quanlycongviec/actions/runs/37112179556) SUCCESS.
- Checkout merge `1ced58499b20ad255f6555cde077afec5608af0d` có parent runtime trên và base `e16c885ae7c2305645be02a1227bf378cb59137f`; GitHub Git API xác nhận tree trùng candidate `dbb986a3597d1b11cb25abe70bf1f0e43aaa6c46`.

Candidate trước36793fbc đạt cả10job (run37111201226), PG59/0/0, Node22 743/0/0, build10.318modules. Review trước publish đã sửa dollar delimiter SQL, tên biến stamp xung đột, ID có timestamp vượt cutoff, thiếu invalidation receipt đến muộn và giới hạn file/base64. Follow-up920e66bc bổ sung nhãn receipt lịch sử, reset trạng thái đọc file khi reload, kiểm retry UI, HTTP boundary và barrier PG sau comparison trước append. Không bỏ ca kiểm thử cũ.

## Hành vi được chứng minh trong PostgreSQL cô lập

Migration674 áp dụng hai lần cùng chuỗi source/registry/witness. Dữ liệu giả tạo company/tenant/trial/Page/form riêng và chạy census qua wrapper thật. Đã kiểm: direct roles và broad grant bị từ chối; cùng snapshot registry+witness+measured digest; biên đầu kỳ tính, cutoff loại riêng; cùng số lượng nhưng khác ID; form/time conflict kể cả thời gian hoàn toàn ngoài kỳ; duplicate và conflict qua cutoff; file rỗng và tập rỗng không nâng thành providerzero; concurrent exact replay, sai nội dung/người/request bị từ chối; actor bị thu hồi; cấu hình đổi; receipt mới ở form cũ làm trạng thái stale; receipt đến sau comparison trước append khiến giao dịch evidence rollback.

Raw file hash do service tính từ bytes; SQL chỉ nhận rows ID/form/time đã loại cột liên hệ. PostgreSQL trực tiếp kiểm lại schema, timestamp, scope, digest/version và quyền. Test SQL trực tiếp dùng hash giả có nhãn synthetic, không thay kiểm bytes của service/HTTP.

## Trình duyệt của tác giả

Đã dùng công cụ trình duyệt được hỗ trợ ở loopback127.0.0.1:4189, component SourceExport thật theo runtime trên, API giả và tệp CSV giả. CSP connect-src none; không đọc Meta/CRM hoặc tệp người dùng thật. Fixture ở `work/vpt-survey-execution/export-browser/` ngoài repo; CSS giản lược, chưa nghiệm thu toàn trang production.

1. Chọn tệp qua file chooser, khai Page674/form675, cột ID/time/form, thời điểm xuất và phạm vi. Nút ghi chỉ mở khi đủ thông tin/tệp/xác nhận.
2. Provider giả lưu rồi mất phản hồi: summary cũ ẩn, yêu cầu giữ để xác nhận lại; metadata/hash giữ qua reload, file phải được chọn lại.
3. Chuyển context giả sang stale rồi reload: hiện receipt lịch sử kèm cảnh báo cần đối soát lại và yêu cầu đang chờ, chưa thể retry nếu thiếu tệp.
4. Chọn lại đúng file, retry: trả cùng kết quả2mã khớp và cùng thời điểm15:00 ngày02/10; có nhãn rõ là biên nhận lịch sử, chưa xác nhận hiện hành.
5. GET tiếp theo vẫn báo phạm vi/dữ liệu/quyền đã đổi; replay không làm mới trạng thái. Unit và PG riêng kiểm exact-request/idempotency và không thêm evidence.
6. Cho GET lỗi sau lần thành công: số/danh sách/biên nhận cũ bị ẩn, chỉ còn thông báo nguồn không đọc được.

Đã đóng tab và dừng server sau kiểm tra. Browser do tác giả thực hiện, không phải reviewer độc lập; không chứng minh file Meta thật đúng định dạng hoặc đủ bộ lọc.

## Phạm vi còn lại

[Hợp đồng/hoàn tác](SOURCE_EXPORT.md). Invalidation hiện bảo thủ: toàn bộ receipt/source công ty gồm trạng thái kỹ thuật và ngoài kỳ; cần fingerprint dữ liệu nghiệp vụ liên quan trước bản chốt cuối. MATCHED chỉ nói tập đã xuất khớp tập đã quét. Không suy formzero từ file rỗng hoặc form bị bỏ qua; nguồn chưa hỗ trợ vẫn thiếu.

Cần tiếp tục provenance/phạm vi thực, các điểm nhận khác, spend và bản chốt declared scope bất biến gắn identity/qualification/attribution/asOf, rồi UI ngoại lệ vận hành, UAT và Founder release. Chưa đạt mục tiêu250.000đ/khách bằng dữ liệu thật. Full goal ACTIVE; không migration thật, chi tiền, gửi khách hoặc phát hành.
