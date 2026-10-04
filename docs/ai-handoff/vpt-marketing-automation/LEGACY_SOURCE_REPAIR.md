# Khôi phục nhãn nguồn CRM từ bằng chứng gốc

Baseline `25f7b4095383346964010aef457d29f93f7724e7`, phạm vi `/facebook/sync-source-ids`. Rủi ro HIGH: nguồn khách, phạm vi công ty và khóa dữ liệu trong maintenance. Đây là bản chuẩn bị trong PR22; chưa áp dụng SQL683 hoặc thay đổi dữ liệu thật.

## Hành vi

Route cũ quét contact toàn DB, lấy Page đầu tiên rồi ghi đè nguồn Lead. Route mới chỉ nhận một công ty và 1–500 Lead được chọn rõ ràng. Actor lấy từ phiên đã xác thực; PostgreSQL kiểm quyền quản trị intake hiện hành, công ty, tenant và toàn bộ Lead trước trả dữ liệu hoặc ghi. Không dùng quyền gửi trong body.

POST gồm `company_id`, `lead_ids`, `mode: "preview"`. Kết quả xem trước trả `contextVersion` cùng trạng thái từng Lead. Đây là **đề xuất cần người vận hành xác nhận**; source NULL không tự chứng minh dữ liệu bị hỏng. POST áp dụng dùng cùng danh sách, `mode: "apply"`, `requestId` UUID và `contextVersion`. Danh sách được chuẩn hóa, chống lặp. Empty POST cũ bị từ chối; không còn quét toàn hệ thống và không có fallback ghi trực tiếp.

- `UNCHANGED`: giữ mọi source không NULL, kể cả khác nguồn lúc intake.
- `READY`: chỉ đề xuất khôi phục nhãn NULL từ đúng một evidence original SQL652. Đối chiếu Lead, Customer, công ty, receipt DONE và Page/form/leadgen của proof; nguồn lịch sử phải còn hoạt động và thuộc công ty, Page còn đúng phạm vi. Bằng chứng SQL658 `LEGACY_REVIEW_V1` không được coi là nguồn gốc để khôi phục.
- `REVIEW`: thiếu hoặc nhiều evidence, metadata/mapping mâu thuẫn, nhiều Page hoặc nguồn không còn hợp lệ. Không đoán nguồn từ Page default hiện tại hay `lead_attribution` cũ.
- `RESTORED`: kết quả đã ghi và có receipt. Apply giữ nguyên các dòng REVIEW/UNCHANGED trong kết quả; lỗi SQL ở bất kỳ bước nào rollback cả nhóm.

Nguồn CRM chỉ là nhãn phân loại. Khôi phục không sửa `lead_attribution`, `crm_lead_source_evidence`, receipt intake, thời điểm tiếp nhận hoặc quyết định chất lượng. Original ORGANIC/UNKNOWN cũng có thể khôi phục nhãn, nhưng không biến thành paid. Trigger chất lượng hiện có vẫn yêu cầu đánh giá lại khi dữ liệu Lead thay đổi. Không có UI mới hay caller tự động trong increment này.

## Giao dịch, quyền và phục hồi

SQL683 thêm RPC service-role-only và sổ sự kiện riêng không cấp quyền đọc/ghi trực tiếp cho public, anon, authenticated hoặc service_role. Ghi nhãn và receipt nằm cùng giao dịch. Khóa công ty/actor/tenant theo policy intake, sau đó gate connection hiện hành và **khóa ghi toàn bộ bảng liên quan đến graph**, không phải chỉ khóa từng Lead. Các bảng: crm_leads, customers, facebook_contacts, facebook_messages, facebook_comments, facebook_lead_ads, facebook_pages, marketing_fb_lead_receipts, crm_lead_source_evidence, crm_sources. Enrollment được bảo vệ bởi gate chung. Khóa `SHARE ROW EXCLUSIVE NOWAIT` giúp phát hiện cạnh graph đang ghi/chèn; không tiếp tục trên snapshot trước chờ. Chờ gate/quyền tối đa 3 giây. Vì tác động rộng, chỉ dùng maintenance ngắn sau khi đã dừng/chờ writer theo gói phát hành; không chạy định kỳ.

Apply tính lại context sau khóa; thay đổi từ preview trả409. Page đã enrollment, kể cả inactive hoặc qua liên kết gián tiếp, bị chặn. Tranh chấp khóa trả409/BUSY, không tự thử lại và không chuyển sang đường JS. Lỗi DB/mất phản hồi trả503; người vận hành đối chiếu **cùng requestId và nội dung** để xác định kết quả, không tạo yêu cầu mới chỉ vì mất phản hồi.

Replay kiểm quyền hiện hành và toàn bộ Lead còn đúng công ty, sau đó trả receipt bất biến; không ghi lại nếu source đã đổi. `resultKind: RECORDED_OUTCOME` là lịch sử của yêu cầu, không chứng nhận trạng thái nguồn hiện tại. Xem lại bằng preview mới. Cùng UUID khác actor/công ty/nội dung bị từ chối. Không trả tên, điện thoại, nội dung hội thoại hoặc raw proof; kết quả có no-store. Primary được kiểm trước/sau RPC; đổi Primary khi đang gọi khiến kết quả chưa xác định và cần đối chiếu.

## Kiểm chứng và phần chưa khép

Local30 ca mới qua actual route/helper và237 regression =267 PASS, không skip. Bao gồm phạm vi đầu vào, spoof actor, lỗi DB/khóa, Primary, response sai, replay và lọc dữ liệu nhạy cảm. 17 ca PostgreSQL thêm vào intake suite: actual original intake, quyền, nguồn cũ, evidence review/mâu thuẫn, managed graph, sửa đồng thời, quyền thu hồi khi chờ, company active NULL, hai yêu cầu cùng UUID, rollback giữa nhóm, receipt và khôi phục sau rollback. **PG/CI và review cuối chưa có kết luận tại bản ghi này.**

Chưa thử trên DB vận hành, schema thực, hiệu năng bảo trì hoặc người dùng thực. Đây không phải bằng chứng đạt250.000 đồng/khách. Batch đối soát bền vững qua reload, chuyển luồng/dừng writer cũ, bảo toàn lịch sử CRM, cấu hình AI/lịch/người nhận, phạm vi đo và UAT/Founder release còn mở. Full goal ACTIVE.

## Hoàn tác

Ngừng gọi RPC mới, giữ sổ sự kiện và mọi bằng chứng. Không đưa route quét/ghi đè toàn DB trở lại. Nếu cần sửa nhãn đã khôi phục, lập yêu cầu đối soát riêng theo trạng thái và evidence hiện hành; không xóa giao dịch hoặc tự đảo toàn nhóm. Không hạ quyền hoặc sửa migration cũ. Áp dụng DB thật, vận hành và phát hành vẫn cần gói nghiệm thu/khôi phục và quyết định Founder.
