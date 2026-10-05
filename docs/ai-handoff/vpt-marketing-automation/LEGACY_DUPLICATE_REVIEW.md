# Rà khách trùng Facebook qua danh tính CRM

## Phạm vi 04/10/2026

Runtime đã kiểm 4df16601f0596e0242f85b517036d98e40d8afd4, tree f550a0ca7bfa886b7d87bd10ce24bbaf73066871, thuộc PR22 chưa phát hành. Thay đường Facebook tự suy đoán/gộp/xóa bằng đọc danh sách cần xác minh từ dịch vụ CRM hiện có. Phạm vi toàn công ty gồm Lead, Deal và lịch sử liên kết; không chỉ danh sách contact Facebook đang lọc. Không tự coi trùng tên, đuôi số điện thoại hoặc Customer chung là cùng một người.

## Hợp đồng

- GET/POST /api/facebook/duplicate-review chỉ đọc, nhận duy nhất company_id UUID; actor từ phiên đã xác thực. Primary phải đúng trước/sau RPC; cờ VPT_CRM_IDENTITY_REVIEW phải bật. RPC crm_identity_review_snapshot kiểm quyền quản lý công ty hiện hành, tenant và actor.
- SQL685 yêu cầu company.is_active đúng TRUE. NULL/false chặn cả snapshot, lệnh mới và replay sau chờ khóa. Không mở quyền schema/bảng hoặc thêm quyền Business Agent.
- POST /dedup-leads cũ trả409 IDENTITY_REVIEW_REQUIRED trước mọi đọc/ghi DB, không phát sự kiện hoặc báo đã gộp. GET /scan-duplicates-debug trở thành alias của reader có phạm vi. Hai caller tự động chuyển sang POST reader; lỗi giữ UNAVAILABLE và số lượng null, không báo0.
- Dùng projectReview chuẩn: số điện thoại/email chính xác sau chuẩn hóa chỉ là đề xuất. LINK/DISTINCT/RECONFIRM cần bằng chứng và lệnh CRM hiện có; giữ hồ sơ, nguồn và lịch sử. Endpoint mới không ghi quyết định này.
- Giới hạn5000 thành viên,10000 cặp; thiếu/truncated/sai công ty/lỗi nguồn không có kết quả. Output không chứa số điện thoại/email thô. Kết quả đọc không chứng minh khách trả phí hợp lệ hoặc cho phép tăng ngân sách.
- UI Rà khách trùng được key theo actor/role/company/tenant/region của trang. Đổi phạm vi hoặc lỗi đọc bỏ kết quả cũ. Chỉ thành viên còn khả dụng có link tới /crm/leads/:id?tab=quality; LeadDetail tiếp nhận tab và dùng card xác minh hiện có. Hiện20 nhóm, mở thêm theo yêu cầu; lịch sử không khả dụng không có link.

## Kiểm chứng

- Local toàn bộ3 nhóm Node trong workflow:1198 PASS,0fail/skip (843+26+329). Delta35 ca; reviewer tự chạy77/77 gồm25backend+10UI-state+42identity.
- Identity PostgreSQL35/0/0, đủ8ca mới27–34: actual reader Lead/Deal, GET/POST rights, DISTINCT không mất hồ sơ, company NULL/false và true→NULL sau Lock cho snapshot/new/replay. Runner identity và3runner tích hợp nạp SQL685 hai lần; intake323/0/0.
- Reviewer độc lập PASS checkpoint reader/SQL685/UI tại runtime4df166, tự đối chiếu published blobs và đọc CI. Không chứng nhận cutover/phát hành/toàn bộ writer hoặc kết quả kinh doanh.
- Browser qua công cụ được hỗ trợ: actual FacebookDuplicateReview, actual LeadIdentityReviewCard, actual URL-effect trích từ LeadDetail, React StrictMode và API giả trên127.0.0.1:5196. CSP connect-src none; không CRM/Meta/đăng nhập thật. Đọc hiện2 hồ sơ/1cặp/3nhóm; hồ sơ lịch sử không link; link mở tabquality và card hiệncặp cầnxácminh. Lỗi nguồn xóa số cũ; phản hồi A trước vòng A→B→A không hiện lại. Dữ liệu rỗng chỉ hiện0 khi response đầyđủ hợp lệ.26nhóm hiện20 rồi mở thêm6,25linkhiệnhành; không POST. Tab/server đã đóng. Đây không phải UAT toàn ứng dụng hoặc kiểm thao tác ghi trên browser.

## CI đúng phiên bản

[Automation37175254103](https://github.com/backen-pixel/Quanlycongviec/actions/runs/37175254103):10/10SUCCESS. Identity job111356431332=35/0/0; intake111356431333=323/0/0; Node22 job111356431295=843+26+329/0/0; frontend111356431286SUCCESS. [Report37175254075](https://github.com/backen-pixel/Quanlycongviec/actions/runs/37175254075) và [Messenger37175254073](https://github.com/backen-pixel/Quanlycongviec/actions/runs/37175254073)SUCCESS.

Log checkout CImerge dcfd6ef37afc1a89e4b47cb75fa08ce563783675 đối chiếu Git API đúng tree runtime f550a0ca7bfa886b7d87bd10ce24bbaf73066871, parents basee16c885ae7c2305645be02a1227bf378cb59137f + runtime4df16601f0596e0242f85b517036d98e40d8afd4. Bản đóng hồ sơ chỉ sửa4file tài liệu, không đổi runtime/tests.

## Phát hành và hoàn tác

Phải kiểm CI đúng phiên bản, cấu hình cùng phiên bản UI/server và áp SQL685 theo gói DB được Founder duyệt trước khi mở reader. Cờ tắt làm reader503; endpoint xóa cũ vẫn409. Nếu cần dừng, tắt reader và giữ dữ liệu; không rollback sang xóa tự động hoặc hạ company guard. Không có dữ liệu nghiệp vụ cần xóa/hoàn tác từ reader.

Full goal ACTIVE. Còn chuyển/khóa các writer cũ và đối soát batch UNKNOWN, bảo toàn lịch sử của physical merge nếu được giao, cấu hình AI/lịch/người nhận/phạm vi đo, UAT và Founder release. Chưa thay DB thật, dùng model, chi ngân sách hoặc phát hành; chưa chứng minh250k thực tế. Không coi việc bỏ tự xóa là quyết định Founder cho phép gộp vật lý.
