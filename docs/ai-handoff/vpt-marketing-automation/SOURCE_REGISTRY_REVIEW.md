# Source Registry — kiểm chứng ngày03/10/2026

## Phiên bản và phạm vi

Runtime9363535a0ee28fb78ad8ebddd5b4bb314c2b1b33, tree4bc46dc5f1470cc661ff70897b742a7335b264a0. CI mergeca1e35a0c6438d310cdd4841842a579660219d38 có hai parent runtime này và basee16c885ae7c2305645be02a1227bf378cb59137f; Git API xác nhận tree giống hệt candidate. PR22 vẫn draft, chưa merge.

Source registry ghi phạm vi cần đo có phiên bản, quyền hiện hành, audit và retry chính xác. Nó chưa chứng minh tập khách provider đầy đủ; CURRENT chỉ nói danh mục còn khớp cấu hình. Không nâng CPQL đầy đủ hoặc mở chi. Full goal ACTIVE.

## Bằng chứng kiểm thử

- Local129 unit/domain/UI-state PASS khi tích hợp;24 ca sourceRegistry mới được reviewer chạy độc lập PASS. Sau sửa UI, root chạy lại24/24 PASS.
- Runtime CI [37105837930](https://github.com/backen-pixel/Quanlycongviec/actions/runs/37105837930): cả10 job SUCCESS, gồm spend-postgres đã hoàn tất khởi tạo và kiểm thử. Không còn job đang chạy của runtime này.
- Census PostgreSQL111154053416:41 PASS/0 FAIL/0 SKIP, gồm11 ca source registry, áp dụng SQL671 hai lần. Kiểm quyền trực tiếp/broad public grant, công ty/tenant/role, all accounts/known forms, concurrent revisions/exact replay, multi-account forms, unresolved history, revoked credentials, roster/date change, binding insertion khi đợi khóa, Page move và cùng snapshot.
- Hai barrier concurrency quan sát state=active và wait_event_type=Lock hoặc wait_event=PgSleep; không nhận nhầm phiên idle/ClientRead.
- Node22 job111154053420:697 PASS/0 FAIL/0 SKIP; Node18 SUCCESS.
- Frontend111154053390:10.314 modules/31,35giây SUCCESS.
- [Report37105837943](https://github.com/backen-pixel/Quanlycongviec/actions/runs/37105837943) và [Messenger37105837923](https://github.com/backen-pixel/Quanlycongviec/actions/runs/37105837923):SUCCESS.
- [Browser của implementer](SOURCE_REGISTRY_BROWSER.md): component thật/ReactStrictMode/API giả, lưu/nguồn mới/cấu hình đổi/lỗi nguồn/sai actor/mất phản hồi/reload/đổi người/exact retry và heldPOST-close. Không phải layout toàn ứng dụng, Meta/UAT thật hay browser độc lập của reviewer.

## Review độc lập và lỗi đã sửa

Reviewer /root/architecture_v11_review đọc SQL/service/route/report/UI/tests/contract, chạy tests và đối chiếu commit/log. Finding delimiter dollar-quote được sửa trước candidate đầu; alias k/v/x trong PLpgSQL được phát hiện độc lập và xác nhận bằng PG42702 tại36048b5. Candidate đó9/10job PASS nhưng census10 ca mới phụ thuộc lỗi, không phải PASS toàn gói.

50a0e14 đóng lỗi SQL và đạt41/697/fullbuild;2d53b5 thêm barrier test chặt hơn và xóa summary khi GET lỗi, cả10job PASS. Reviewer tiếp phát hiện đóng editor khi POST chờ giữ summary cũ. Runtime9363535a xóa summary sau persist pending và trước HTTP, reviewer đã xác nhận đóng P2; browser root thử held-response/close/retry đạt. Reviewer độc lập kết luận **PASS trong phạm vi Source Registry** tại9363535a, tự đối chiếu UI blob và cả10job/log; không còn finding chặn. PASS này không chứng nhận toàn mục tiêu.

Blob mốc: SQL671 d8cc23963bdd5baa7685e2c7f0e7e5eb90efda2c; service d8626274f8bc71c1c1a97486c7f57efbf46d2ce1; UI1bdcaf26cbf9c8ec557db7f64f50183edf541a87; PGcasesdd379be63c4b7f714e30685d53022617c41a50a6.

## Hoàn tác và nghĩa vụ còn lại

Xem [hợp đồng](SOURCE_REGISTRY.md). Tắt flag mới/đường UI/API để ngừng xác nhận mới; giữ registry/events và bằng chứng. Không migration thật, enrollment, phát hành, đổi quyền AI, gửi khách hoặc thay quảng cáo trong đợt xây dựng này.

Tiếp theo cần provider witness hoặc bản xuất thực cóID/phạm vi để đối soát hai chiều; bản chốt kỳ với fingerprint/invalidation, các điểm nhận ngoài LeadAds, lịch/chờ xử lý trên dashboard, nội dung/nhân sự/quyền runtime VPT thật và UAT/Founderrelease. Giữ các nghĩa vụ proposal/ngoại lệ, hủy/đổi lịch, legacy calendar writers, hiệu năng/khôi phục và mở các kênh sau tuyến đầu trong mục tiêu đầy đủ.
