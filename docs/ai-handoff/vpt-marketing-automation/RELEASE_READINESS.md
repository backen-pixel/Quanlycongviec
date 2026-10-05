# Hồ sơ chuẩn bị nghiệm thu Facebook → CRM → AI → khảo sát

**Delta mới sau catalog:** [guard Backup](BACKUP_PRIVILEGE_GUARD_20261005.md) ngăn grant tự động và clone legacy, giữ job lỗi quyền. Unit18/18 cục bộ; đang chờ CI/review đúng mã mới. PASS ứng viên fd3babeb bên dưới là nền lịch sử, không phải kết luận cho delta này. Chưa sửa ACL/schema của DB thật.

Ngày cập nhật: 05/10/2026. **Rủi ro HIGH; HOLD phát hành.** Hồ sơ này gom điều kiện và bằng chứng, không phải quyết định mở quyền, chạy migration hoặc tiêu ngân sách. Nguồn chuẩn là repo; các mục cũ trong CURRENT/README giữ giá trị lịch sử theo phiên bản.

**Trạng thái mới nhất khoảng 14:19:** đã ghép main `3375ef71` vào PR25 `fd3babeb`; 3 workflow SUCCESS, Marketing 10/10 job, Node18/22 mỗi 1.521 PASS, intake PostgreSQL 507 PASS và restore cô lập 11 PASS. Tree ứng viên bằng tree CI; reviewer độc lập PASS phạm vi đã rà. Backend live `3375ef71`, frontend `ad88a162`; ứng viên chưa live. [Hồ sơ tích hợp và phiếu mở tuyến đầu](RELEASE_INTEGRATION_20261005.md) ghi bản kiểm, phạm vi, cách dừng và điều kiện còn thiếu.

**Cập nhật sau đăng nhập Supabase:** đã đọc cả DB, xác nhận Admin VPT/company/tenant/hai vùng active và mapping Page legacy khớp. Còn binding form mới/quyền dịch vụ/UAT; registry chưa có account đã tìm. [Phiếu DB hiện hành](DB_CATALOG_20261005.md) xác nhận Backup thiếu cấu trúc thật và quyền bảy bảng/RLS quá rộng. Có Physical backup Primary, chưa restore và không gồm Storage. Render workspace, đăng nhập và tích hợp main đã khép. Snapshot trước đó ghi failover Bật, queue1.011 lúc14:23, không phải số queue hiện tại. Các checkpoint và số CI phía dưới giữ lịch sử.

Cập nhật tích hợp: PR22 runtime `542c4ee5` đã ghép PR19 `f5efde61` chứa main `ca8810c5`; xem [bằng chứng và giới hạn](MAIN_INTEGRATION_20261005.md). Giữ 250.000đ/khách hợp lệ và Finance UNKNOWN trong các màn Page/bài viết mới. Ba workflow đúng head SUCCESS; Node18/22 mỗi bản1.491 PASS, intake PostgreSQL507/restore11 và build PASS. Reviewer độc lập xác minh đúng tree/blob/log và PASS checkpoint kỹ thuật. Các số CI phía dưới là lịch sử, không chứng nhận bản triển khai thật.

Founder đã cho phép **chỉ đọc CRM** để kiểm Admin VPT, công ty/khu vực, người khảo sát và giờ bận/trống. Ngày 05/10 đã truy cập phiên Chrome có sẵn: hồ sơ Admin Vạn Phú Thành thuộc đúng công ty VPT, hiển thị vai trò crm/Admin; đã ghi ID ứng viên và các vùng từ UI. Lịch CRM mở được nhưng hiển thị 500 sự kiện, chưa chứng minh toàn bộ lịch bận hoặc giờ trống. [Bằng chứng và giới hạn kiểm tra chỉ đọc](CRM_READONLY_VERIFICATION_20261005.md). Lượt catalog sau đó đã khép tenant/active/phân công vùng và mapping legacy; còn quyền dịch vụ/binding form, người khảo sát và lịch đầy đủ. Không còn vướng đăng nhập CRM/Supabase. Không xin lại cùng phạm vi đọc hoặc xác nhận workspace Render đã có. Không sửa khách/lịch/cấu hình từ quyền này. Migration 647/648 và 649 mới có tiền tố trùng nhưng khác tệp: ledger thực phải dùng đường dẫn đầy đủ/blob/thứ tự, không dùng tiền tố để bỏ qua; manifest 50 SQL lịch sử chưa là kế hoạch migration đầy đủ cho main mới.

Bản sửa kiểm soát Agent nằm ở [PR25](https://github.com/backen-pixel/Quanlycongviec/pull/25), source runtime `add71daf`, hồ sơ `a270f7be`, xếp sau PR22. [Phạm vi và các chức năng legacy còn khóa](../agent-guardrails-20261005/README.md) phải nằm trong gói kiểm tương thích trước phát hành. Đã xác định commit live trong phiếu Render; ứng viên chưa nằm trong lịch sử đó, việc đọc UI thật không chứng minh ứng viên đã được triển khai hoặc nghiệm thu.

Delta sau bản kiểm kê 1b7c00f: [outcome SEND riêng](SURVEY_OUTCOMES.md) tại e2afcfea đã PASS kiểm thử và review độc lập để tạm ngừng gửi và giữ recovery. Manifest vẫn ghim 50 SQL của source cũ và ghi bằng chứng runtime delta riêng; không có SQL mới. PostgreSQL507/0/0, restore11/0/0 và Node18/22 mỗi1.417/0/0 không thay nghiệm thu môi trường/config thực hoặc quyền phát hành.

## Việc tiếp theo cho Founder

Mục 4 của goal đang thực hiện xác định nghiệm thu tuyến đầu rồi mở tiếp Google và các kênh còn lại theo quyền thực tế. Gói hiện tại đưa tuyến Facebook tới nghiệm thu; việc chuẩn bị kênh khác vẫn có thể tiếp tục, không đổi phạm vi sáu kênh hoặc phân bổ trong [kế hoạch chuẩn](../../architecture/VPT_MARKETING_SALES_AUTOMATION_V1.md). Codex khép cấu hình, kiểm tra chuyển luồng và chuẩn bị gói phát hành; reviewer độc lập kiểm lại đúng bản; Founder quyết định phạm vi và thời điểm mở thử sau khi có đủ bằng chứng.

[Bộ 18 câu tư vấn VPT và 18 ca nghiệm thu](VPT_CARE_CONTENT_DRAFT.md): Founder đã duyệt nguyên văn Q01–Q15/A01–A03 ngày 04/10/2026, nguồn ee641db9, quyết định `VPT-CARE-CONTENT-V1-FOUNDER-WORDING-APPROVAL`. Câu chữ giữ nguyên. Chưa nhập/phê duyệt thư viện runtime, chưa gửi hoặc chạy model; bindings/hạn/publisher còn thiếu.

Ba nhóm đầu vào còn chờ xác nhận:

1. **Đầu mối nhận khách: Admin Vạn Phú Thành; nguồn lịch khảo sát: CRM**, theo hai quyết định ngày 05/10 trong [sổ quyết định](../DECISIONS.md). DB đã xác nhận đúng user/company/tenant active, phân công hai vùng và mapping Page legacy. Còn quyền dịch vụ/binding form/UAT. Người trực tiếp khảo sát, người thay thế tại TP.HCM/Cần Thơ, giờ trống, độ đủ lịch bận CRM và đầu mối ngoại lệ trong khung 08–20h còn cần xác định. Xác nhận nơi quản lý lịch không tự chứng minh CRM_COMPLETE/ALL_BUSY_IN_CRM; không tạo roster đã chứng nhận từ câu trả lời này.
2. Câu chữ bộ 18 câu V1 đã duyệt. Còn phiên bản dữ liệu sản phẩm, giá/chính sách, phạm vi phục vụ, người duyệt thư viện/hạn hiệu lực và phạm vi gửi nội dung hội thoại sang nhà cung cấp AI.
3. Tài khoản AI/key riêng theo cấu hình, model chính xác, hạn mức AI riêng, thời gian hiệu lực; phạm vi tài khoản quảng cáo/Page/công ty và ngày bắt đầu kỳ đo.

Không cần chờ kết nối kế toán để chuẩn bị tuyến Lead. **250.000đ/khách quảng cáo hợp lệ duy nhất là mục tiêu tạm thời**, chưa phải kết quả đã đạt. Khách phải không trùng, thuộc sản phẩm/vùng phục vụ, có liên hệ dùng được và bằng chứng nguồn. Tổng chi gồm cả tài khoản không sinh khách; thiếu nguồn hoặc chi không rõ thì chưa kết luận đạt. 300 khách ở mức mục tiêu tương ứng 75 triệu; trần thử vẫn 100 triệu/30 ngày một lần, TP.HCM 80 triệu/Cần Thơ 20 triệu, không buộc chi hết. Đây là tổng ngân sách đợt đa kênh, tính cả Facebook đang chạy, không phải hạn mức riêng Facebook. Giữ phân bổ khởi điểm trong kế hoạch chuẩn; hồ sơ này không chuyển tiền giữa kênh. 7% doanh thu đánh giá sau bằng doanh thu đủ điều kiện.

## Phiên bản và phạm vi

- Bản nguồn được kiểm kê: `1b7c00f867191c295ce9a570ba57d2b80e0e8574`, tree `f71ce24d936cc88ad89a1b69902392ca48d0d63b`.
- Bản kiểm hành trình: `77893383101667c651b41fde000b03bbdcfd2958`, tree `31f723f9c9f0d226f52d05cbd6b0566757fe53b2`.
- [PR22](https://github.com/backen-pixel/Quanlycongviec/pull/22) draft/open, chưa merge, 425 file thay đổi so với base tại thời điểm kiểm kê. Base là `e16c885ae7c2305645be02a1227bf378cb59137f` của [PR19](https://github.com/backen-pixel/Quanlycongviec/pull/19), cũng chưa merge.
- PR19 có base `0db11ce1adb0fb89fc87529036e495a62d58fce7`. Chưa xác minh bản đang chạy thật. Không coi PR22 đã được kiểm trên production/main hiện tại.
- [Manifest](RELEASE_CANDIDATE_MANIFEST.json) ghim 50 file SQL mới 648–697 cùng Git blob SHA. Đây là **kiểm kê chênh lệch**, không phải trình chạy migration hoặc xác nhận thứ tự/prerequisite tương thích DB thật. Không có SQL cũ bị sửa/xóa trong chênh lệch được kiểm.
- Khi thay base, mã hoặc cấu hình, phải ghi bản ứng viên mới và kiểm phần bị ảnh hưởng. Không chuyển trạng thái kiểm thử fixture thành UAT.

## Bốn kết quả cần đạt

| Yêu cầu | Bằng chứng đã có | Phần chưa đạt trước vận hành |
|---|---|---|
| Khách và tiền quảng cáo | Signed intake, CRM transaction, identity/quality, routing, census, spend đầy đủ trong phạm vi fixture; tiền tài khoản không Lead vẫn được tính | Đủ inventory tài khoản/Page/form thật, mapping công ty/khu vực/người nhận, chống trùng các nguồn thật, đối soát đường cũ và chứng nhận phạm vi đo |
| AI tư vấn và bàn giao | Cùng khách qua adapter ANSWER/SURVEY, nguồn đã duyệt, quyền riêng, khách xác nhận trước booking, handoff ACK; STOP/takeover được kiểm | Nội dung thật, model/chất lượng thật, quyền/tài khoản/hạn mức, roster/lịch; quy trình người xử lý ngoại lệ và receipt chưa rõ |
| Dashboard | Cohort/cost API và bộ kiểm frontend; lịch, chờ bàn giao, lỗi nguồn không thành 0; tách reservation/token khỏi tiền thực chi AI | Nghiệm thu dữ liệu vận hành, độ đủ/đúng nguồn và thời gian cập nhật; không kết luận CPQL từ dữ liệu thiếu |
| Nghiệm thu và phát hành | Kiểm thử cô lập, review độc lập từng checkpoint, diễn tập restore fixture | Kiểm DB/môi trường/backup thật trong phạm vi được phép, chuyển luồng mọi instance, UAT đúng ứng viên, quyết định Founder |

[AI_CUSTOMER_JOURNEY.md](AI_CUSTOMER_JOURNEY.md) ghi rõ: liên kết danh tính/xác minh khách vẫn có bước người vận hành; HTTP Meta/mô hình giả lập. Kiểm này dùng dịch vụ/SQL/API và validator frontend, không phải đăng nhập và thao tác mọi route bằng người dùng thật. CPQL toàn kỳ trong ca hành trình còn NULL vì chưa chứng nhận toàn bộ nguồn; không dùng tổng 250.000đ giả để tuyên bố đạt mục tiêu.

[Automation37202121312](https://github.com/backen-pixel/Quanlycongviec/actions/runs/37202121312): 10 job SUCCESS; intake PostgreSQL 504/0/0, restore 11/0/0; Node18/22 mỗi bản 1.412/0/0; build SUCCESS. Review độc lập PASS đúng published blobs/log/tree. [Report](https://github.com/backen-pixel/Quanlycongviec/actions/runs/37202121318) và [Messenger](https://github.com/backen-pixel/Quanlycongviec/actions/runs/37202121320) SUCCESS. Bản đóng hồ sơ 1b7c00f cũng có [10 job SUCCESS](https://github.com/backen-pixel/Quanlycongviec/actions/runs/37202456267), [report SUCCESS](https://github.com/backen-pixel/Quanlycongviec/actions/runs/37202456273) và [Messenger SUCCESS](https://github.com/backen-pixel/Quanlycongviec/actions/runs/37202456278), đã đọc trạng thái cuối.

## Phiếu cấu hình cần khép

Mỗi dòng cần giá trị cụ thể, nguồn kiểm chứng, người chịu trách nhiệm, thời điểm/phiên bản và quyết định áp dụng. Không lưu secret vào phiếu hoặc repo.

| Nhóm | Nội dung phải điền | Trạng thái |
|---|---|---|
| Phạm vi kinh doanh | Company UUID, Page/form/account, sản phẩm, địa bàn, quy tắc định tuyến, loại khách hợp lệ | Chưa đối chiếu vận hành |
| Đo lường | Toàn bộ nguồn chi, cả account không Lead; múi giờ/kỳ đo; phương pháp chứng nhận đủ nguồn | Chưa chứng nhận |
| Con người và lịch | User UUID, vai trò từng vùng, người thay thế, lịch trống, đầu mối ngoại lệ | Admin VPT/company/tenant/phân công hai vùng đã kiểm active; nguồn lịch CRM đã chốt. Còn người/giờ khảo sát, độ đủ lịch bận, người thay thế và ngoại lệ |
| Thư viện tư vấn | Version/nguồn/phê duyệt/hiệu lực của thông tin và câu được dùng | Founder đã duyệt câu chữ V1; còn mapping, dữ liệu/chính sách, publisher và hạn hiệu lực; chưa APPROVE runtime |
| AI | Danh tính Agent, grant, inference/send/survey policy; key riêng không dán vào tài liệu; model snapshot chính xác, hạn mức/kỳ và căn cứ tiền thực chi | Chưa cấp quyền |
| Hạ tầng | Bản đang chạy, cấu hình từng replica/worker/cron, Primary duy nhất nhận ghi, quyền/RLS, migration ledger, backup và restore trên môi trường phù hợp | CI PASS; live/instance/active Primary đã đọc, failover Bật tại snapshot. Catalog/ledger trong phạm vi đã đọc, phát hiện chênh Backup và quyền rộng; chưa khép sửa grant/sync, mọi writer và restore PostgreSQL17/Storage. Xem phiếu DB_CATALOG/Render |
| Chuyển luồng | Mọi writer cũ, memory/DB queue, UNKNOWN/claim/HTTP còn dở, sự kiện đến trong bảo trì và đối soát sau chuyển | Chưa diễn tập theo môi trường đích |
| Mở thử | Ứng viên/nhóm khách/công ty/Page, thời gian, giới hạn, người theo dõi/dừng, kết quả UAT và quyết định Founder | Chưa duyệt phát hành |

[INVENTORY.md](INVENTORY.md) chứa quan sát tài khoản ngày 02/10; phải ghi là lịch sử, không suy ra quyền hoặc khả năng chạy hiện tại. Google, TikTok, ChatGPT Ads, Zalo và website vẫn phải nghiệm thu riêng. Gói này không chứng nhận tự động đăng nội dung, tự chạy/chuyển ngân sách đa kênh hoặc hợp nhất vật lý toàn bộ hồ sơ CRM đã hoàn tất.

## Nghiệm thu ứng viên và thứ tự mở

1. **Chuẩn bị an toàn:** chốt phiếu cấu hình, phiên bản và danh sách điều kiện còn thiếu; hoàn thiện kịch bản/dữ liệu giả. Không gọi tài khoản thật hoặc thay DB thật trong bước này.
2. **Đối chiếu môi trường:** sau khi phạm vi truy cập tương ứng được cho phép, kiểm bản triển khai, quyền, schema/prerequisite, backup/restore, tài khoản và đường nhận sự kiện. Lập kế hoạch migration cụ thể cho đúng schema; fixture PASS không thay việc này.
3. **Diễn tập ứng viên:** kiểm trong môi trường được duyệt với tài khoản thử/dữ liệu thử được tách rõ; ghi build/config hash, actor/company, request/event/receipt ID và thời điểm, không đưa secret/PII vào repo.
4. **Review và trình Founder:** chỉ trình mở thử khi mọi điều kiện liên quan đã PASS; hồ sơ phải ghi phần nào mở, phần nào còn tắt, giới hạn, người nhận ngoại lệ và cách dừng. Duyệt hướng đi/ngân sách trước đây không tự thay quyết định phát hành này.
5. **Thử có giới hạn:** chỉ sau quyết định phát hành cụ thể, mở tuyến Facebook theo phạm vi được duyệt; theo dõi chi/khách/người nhận/ngoại lệ. Mở Google và các kênh khác sau nghiệm thu riêng; không nhân hạn mức 100 triệu thành ngân sách lặp.

Bộ ca phải lưu kết quả theo đúng ứng viên:

- Một khách mới đi từ nguồn quảng cáo tới đúng CRM/người nhận, AI tư vấn có nguồn, khách xác nhận lịch trống, nhân viên nhận đủ hồ sơ; dashboard truy được cùng hồ sơ.
- Khách trùng/sự kiện lặp, hai worker đồng thời, mất ACK/khởi động lại, account không Lead, nguồn chi lỗi/thiếu và nguồn ngoài phạm vi.
- Sai công ty/quyền, thu hồi grant hoặc nguồn sau tạo draft, sửa dữ liệu sau duyệt; khách yêu cầu người hoặc ngừng liên hệ trong khi đang gọi/gửi.
- Hai khách chọn cùng lịch, proposal đã gửi được click trong thời gian dừng, booking/receipt chưa rõ, người khảo sát chưa ACK.
- Chi phí AI có UNKNOWN/usage nhưng chưa hóa đơn; không hoàn reservation, gọi lại hoặc tính bằng 0 để bỏ qua.
- Bảo trì/restore giữ khách, lịch, tệp, lịch sử/audit, claim và các sự kiện đến muộn; đối soát ngoại tác ở nhà cung cấp trước mở lại.
- Hiển thị đầy đủ spend, số khách duy nhất đủ điều kiện, CPQL hoặc lý do chưa tính được, lịch khảo sát và chờ bàn giao. Không gọi đơn đặt hàng là doanh thu ghi nhận.

## Dừng và khôi phục: ý nghĩa thực tế của các điều khiển

Đây là runbook thiết kế, chưa được thực thi trên hệ thống thật. Không có một thao tác “tắt tất cả” đã chứng minh giữ mọi sự kiện. Phải phân biệt ngừng tạo lượt, ngừng gửi, tiếp nhận xác nhận và thu hồi quyền.

| Mục đích | Điều khiển đã đối chiếu mã | Giới hạn phải giữ |
|---|---|---|
| Ngừng AI tạo lượt mới | `VPT_CARE_RUNTIME=0` | Không ngăn answer worker gửi DRAFT đã có |
| Ngừng gửi câu trả lời mới | `VPT_CARE_RUNTIME_SEND=0` | Giữ `VPT_CARE_RUNTIME_ECHO=1`, company/Page và `VPT_FB_CARE_PAGES` để nhận echo/recovery; request đã phát đi vẫn cần đối soát |
| Ngừng gửi đề xuất khảo sát mới | `VPT_SURVEY_DISPATCH=0` | Với confirmations còn bật, recovery/reconcile vẫn chạy; khách có thể xác nhận proposal đã gửi và tạo booking |
| Giữ bằng chứng khách xác nhận | Không dùng `VPT_SURVEY_CONFIRMATIONS=0` làm cách tạm dừng giữ dữ liệu | Tắt flag bỏ parsing quick reply trong khi care message có thể vẫn được ACK; không hứa replay tự khôi phục bằng chứng |
| Ngừng gửi outcome lịch mới, giữ đối soát | `VPT_SURVEY_OUTCOMES_SEND=0`, giữ `VPT_SURVEY_OUTCOMES=1`, confirmations và Page | SEND phải tường minh bằng 1 mới mở gửi. OUTCOMES=0 vẫn tắt recovery; không hoàn claim, gửi lại UNKNOWN hoặc hủy HTTP đã đi. Binary cũ không hiểu SEND nên không được coi rollback code cũ là vẫn pause |
| Tạm dừng worker intake | `VPT_FB_LEAD_INTAKE_WORKER_PAUSED=1`, giữ enrollment Page | Không tự ngừng mọi ingress hoặc tác vụ đã bắt đầu; phải kiểm durable receive. Rút Page khỏi allowlist có thể mở lại đường legacy |
| Chờ worker | `VPT_WORKER_SHUTDOWN=1` cùng kế hoạch stop/join | Báo cáo chỉ REGISTERED_WORKERS_THIS_PROCESS; không chứng minh mọi replica/cron/HTTP Meta/OpenAI đã dừng |
| Hold DB bảo trì | SQL687, operator-only, trạng thái singleton | Phạm vi **mọi công ty trong tập bảng và FK descendants toàn DB**, không riêng Page/công ty; cả khi inactive vẫn yêu cầu READ COMMITTED |

Nguồn: [careAnswerDispatch](../../../backend/src/modules/marketingAutomation/careAnswerDispatch.js), [surveyDispatch](../../../backend/src/modules/marketingAutomation/facebookSurveyDispatch.js), [surveyOutcomes](../../../backend/src/modules/marketingAutomation/facebookSurveyOutcomes.js), [customerCare](../../../backend/src/modules/marketingAutomation/facebookCustomerCare.js), [workerShutdown](../../../backend/src/helpers/workerShutdown.js), [SQL687](../../../database/687_crm_legacy_write_hold.sql).

Worker schedule được tạo lúc module khởi động trong [facebook.js](../../../backend/src/routes/facebook.js); thay cấu hình phải ghim phiên bản/config và restart có kiểm soát từng replica, không giả định hot toggle. Không gỡ Page chăm khách: có thể mất receipt/redaction và gỡ chặn sender cũ. Không coi thu hồi policy/grant là pause có thể đảo tự động: proposal Agent có thể mất quyền vĩnh viễn; click có thể thành BLOCKED terminal theo SQL695/666.

Nếu phải bảo trì: xác định và bảo toàn ingress/receipt trước; ngừng admission theo kế hoạch, áp hold đã được duyệt và có xác nhận phạm vi ảnh hưởng, chờ/kiểm mọi writer, đối soát memory/DB queue và ngoại tác; sau đó mới chuyển phiên bản và cân nhắc mở lại bằng quyết định cụ thể. Hold không tự giữ mọi private receipt/queue, không tự hủy HTTP và không giải quyết UNKNOWN. Giữ nguyên claim/audit; timeout, lease hết hạn hoặc process exit không chứng minh nhà cung cấp chưa thực hiện.

[LEGACY_WRITE_HOLD.md](LEGACY_WRITE_HOLD.md), [LEGACY_RUNTIME_DRAIN.md](LEGACY_RUNTIME_DRAIN.md) và [RESTORE_REHEARSAL.md](RESTORE_REHEARSAL.md) là nguồn chi tiết. SQL697 áp dụng rebind manifest OID mới sẽ giữ/bật hold, không mở hệ thống. Replay đúng yêu cầu cũ chỉ trả trạng thái đã ghi/hiện tại; nếu hold đã được release sau đó thì replay không tự bật lại. Operator phải kiểm trạng thái hiện tại trước hành động. Không hoàn tác bằng xóa giao dịch, bỏ guard, mở lại đường ghi cũ không an toàn hoặc phát lại UNKNOWN. Nếu không bảo toàn được inbound/receipt, dừng việc chuyển luồng để hoàn thiện phương án.

## Kiểm chứng và hoàn tác hồ sơ

Thay đổi này chỉ thêm hồ sơ/manifest và liên kết trạng thái. JSON, 50 path/blob tại source SHA, 14 liên kết nội bộ và diff chỉ gồm tài liệu đã kiểm PASS. Reviewer độc lập đối chiếu lại inventory, source/test tree, PR/base, trạng thái 3 workflow và 10 job; kết luận **PASS phạm vi hồ sơ/manifest**, không còn finding chặn. Không chạy lại runtime cho delta tài liệu. Không thay mã runtime, migration, quyền hoặc cấu hình đang chạy. Hoàn tác hồ sơ bằng một commit sửa/revert các file tài liệu, giữ lịch sử và bằng chứng trước đó. PASS hồ sơ không đồng nghĩa duyệt release.

**Kết luận:** đủ bằng chứng kỹ thuật để tiếp tục chuẩn bị nghiệm thu; chưa đủ để merge/deploy hoặc công bố đã đạt 250.000đ/khách. Goal đầy đủ vẫn ACTIVE.
