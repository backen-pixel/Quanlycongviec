# Marketing VPT — tích hợp main ngày 05/10/2026

## Phạm vi và nguồn

Gói này tiếp tục công việc đã được giao, giải quyết xung đột với main và giữ các chức năng Marketing mới. Không mở thêm phase, đổi mục tiêu hay phát hành.

- PR22 trước tích hợp: `10ed7b73adb4d5f7accab11e4f2c3e9029d869c8`.
- Parent PR19 tích hợp: `f5efde61f3ddf016fab4db1a555c26229e3c533c`, tree `8da79a2cf672a66f84726956e2b94fd23ac6b295`.
- Main đã ghép trong parent: `ca8810c57d2078087a7d0afdd95776fba6e84cc3`.
- [Bằng chứng PR19](../PR19_MAIN_INTEGRATION_20261005.md) ghi các sửa quyền và lỗi nguồn. Các thay đổi CRM/Sản xuất của main được giữ nguyên.

## Kết quả

Giữ giao diện Page/bài viết/quảng cáo, báo cáo nhúng Facebook và cách đọc CRM theo lô của main; đồng thời giữ chống trùng, loại phản hồi cũ và kiểm quyền CRM/dự án từ PR19. Bốn route mới đều trả `revenue:null`, `roas:null`, `revenue_status:UNKNOWN`, `eligible_for_budget_optimization:false`. Giá trị Deal đã đánh dấu chốt nằm ở `closed_estimated_value` và được ghi rõ là ước tính trên giao diện.

Giữ mục tiêu **250.000đ/khách quảng cáo hợp lệ duy nhất**, phần chi tiêu đầy đủ, kỳ đo và tư vấn/khảo sát. Nhãn ấm/nóng không thay xác minh khách hợp lệ. Dữ liệu chưa đủ không được kết luận đạt mục tiêu hoặc dùng để tự tăng ngân sách. Các handler Facebook hiện hữu được giữ; bộ 18 câu đã duyệt và dữ liệu lựa chọn Admin VPT/lịch CRM không đổi.

## Bằng chứng trước xuất bản

- Node 24.19.0 trên Windows, 11 nhóm không cần PostgreSQL từ workflow: **1.488 ca, 1.486 PASS, 0 FAIL, 2 SKIP**. Hai ca tín hiệu tiến trình không chạy trên Windows; cần CI Linux xác minh. Đây là tổng toàn bộ các lệnh đã chạy, không cộng riêng các nhóm kiểm lại.
- Nhóm báo cáo/UI/thao tác: **128/128 PASS**, nằm trong tổng trên.
- Vite build toàn frontend PASS. Còn cảnh báo bundle lớn và module vừa import tĩnh/vừa import động; không có lỗi build.
- Reviewer độc lập `architecture_v11_review` đọc bản ghép và tự chạy **140/140 PASS**: báo cáo, vòng đời thao tác, report adapter và spend integration. Không còn finding chặn trong phạm vi bảo toàn PR22. Kết luận là PASS tích hợp cục bộ; không thay review quyền vận hành, UAT hoặc phát hành.
- Trình duyệt được hỗ trợ: component React thật cùng ba panel Marketing, API/auth giả, CSP chặn kết nối ra ngoài. Đã chọn công ty A, xem thẻ Page/bài viết, xác minh nhãn ước tính và cảnh báo dữ liệu thiếu; giả lỗi CRM xóa số cũ, hồi phục rồi bật chế độ nhúng. Panel vận hành/chi tiêu/kỳ đo còn đủ; không có lỗi console trong lượt quan sát. Chưa kiểm trang Facebook/auth hoàn chỉnh với hệ thống thật.
- CI và PostgreSQL phải xác minh đúng commit sau xuất bản. Bằng chứng PostgreSQL 507/restore 11 ở các mục lịch sử không tự áp dụng cho cây tích hợp mới.

Các Git blob runtime được reviewer đối chiếu:

| Tệp | Git blob |
|---|---|
| backend/src/routes/adAnalytics.js | `52b04fa8982c7a14a1e9a9e2468bd3155db2ec09` |
| frontend/src/pages/AdAnalyticsPage.jsx | `ab6b9bc96d5f7b7d3ee126f3efc222b7a9c87b23` |
| frontend/src/pages/FacebookPage.jsx | `ff5cf0ac7b9afdf7fd1ee97a554d96ea0c00a845` |
| backend/src/helpers/adInsights.js | `c905b71a781e5235e0596bc9a316bde19819dc44` |

## Xác minh commit đã xuất bản

Ứng viên runtime đã xuất bản: `542c4ee5e11e15d87f78bccbdb809409a55cab86`, tree `bc23ed0ae82df18b6ea15f37574d5437384f6655`, hai parent đúng như phần nguồn. CI chạy merge `a7c84af7a1436991f8d6bc2520535c56003f7afe`, có cùng tree.

- [Automation 37255873901](https://github.com/backen-pixel/Quanlycongviec/actions/runs/37255873901): cả 10 job SUCCESS. Node 18/22 mỗi bản **1.491 PASS, 0 FAIL, 0 SKIP**; bao gồm 3 ca Express HTTP và hai ca process signal mà Windows bỏ qua.
- PostgreSQL intake **507 PASS**, restore **11 PASS**; full frontend build **10.339 modules**, thành công.
- [Report 37255873900](https://github.com/backen-pixel/Quanlycongviec/actions/runs/37255873900): **128 PASS**; [Messenger 37255873905](https://github.com/backen-pixel/Quanlycongviec/actions/runs/37255873905): SUCCESS.
- Reviewer độc lập `architecture_v11_review` đã tự xác minh published tree/parents, bốn blob, CI merge cùng tree, ba workflow và các log trên; kết luận **PASS checkpoint tích hợp kỹ thuật**. Đây là agent review trong phiên riêng, không phải GitHub human approval.

Reviewer `pr19_independent_review` cũng kết luận PASS local integration PR19 `f5efde61`: kiểm đúng HEAD/bốn blob và không còn finding mở về quyền dự án, quyền chi tiết Lead, phạm vi công ty hoặc lỗi thao tác bất đồng bộ. Reviewer đã tái hiện lỗi trước sửa và rà source/tests sau sửa; lần tự chạy lại 127 ca bị spawn EPERM, chưa hoàn tất. 127 ca/build/UI/CI của PR19 là bằng chứng root, không ghi thành thực thi độc lập của reviewer này.

Các câu CI/PostgreSQL còn chờ ở phần trước mô tả thời điểm trước xuất bản; phần này khép chúng cho đúng runtime `542c4ee5`. Thay đổi sau checkpoint chỉ để lưu bằng chứng phải được phân biệt với thay đổi runtime. Không nâng kết quả kiểm thử cô lập thành nghiệm thu môi trường thật.

## Cổng vận hành và hoàn tác

**HOLD phát hành.** Founder đã cho phép chỉ đọc CRM để đối chiếu Admin VPT, công ty/khu vực, người khảo sát và giờ bận/trống. Tab CRM còn ở đăng nhập; chưa xác minh các giá trị thật. Không cần xin lại cùng quyền đọc. Render còn chờ xác nhận workspace; phiên bản/config đang chạy chưa được xác minh.

Các tiền tố migration 647/648 có nhiều tệp khác nhau. Không đổi tên hoặc sửa migration đã chạy. Trước DB thật phải kiểm ledger theo môi trường, đường dẫn đầy đủ, blob, kết quả và thứ tự; không đánh dấu đã chạy chỉ bằng số tiền tố. Gói tích hợp này không chạy migration hay thay manifest 50 SQL lịch sử; manifest đó vẫn chỉ là kiểm kê source đã ghi, không phải danh sách phát hành đầy đủ của main mới.

Tiếp tục theo [RELEASE_READINESS](RELEASE_READINESS.md): khép mapping, người khảo sát/giờ bận, nội dung runtime, quyền/hạn mức AI, nguồn chi, môi trường và chuyển luồng; nghiệm thu đúng phiên bản rồi trình gói phát hành cụ thể. Chưa gửi khách, đặt lịch, thay cấu hình thật, chạy quảng cáo hoặc merge main.

Chưa phát hành: sửa/revert commit tích hợp trên nhánh review theo parent PR22 phù hợp, giữ lịch sử và các sửa quyền; không hoàn tác bằng xóa giao dịch hoặc nới quyền. Nếu đã triển khai phải lập gói khôi phục riêng theo trạng thái thực tế.
