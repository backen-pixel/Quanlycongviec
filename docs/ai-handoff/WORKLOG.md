## 05/10/2026, 23:55 — CI đạt; PR25 chỉ làm bằng chứng tích hợp để tách gói

Source43e50262/treeba7c2778 đã PASS CI PostgreSQL17 legacy/700, restore dữ liệu giả, frontend và review độc lập trong phạm vi kiểm thử. Đã xác minh Meta form1438656288329447 có8 lượt gửi; chưa đối soát đủ danh tính/nguồn vào CRM. Hai DB đã thu quyền bảng trong tập kiểm; sáu bảng Marketing mới còn thiếu, Render live main1f879ea8 và startup failoveron.

Đối chiếu hồ sơ Claude xác nhận **không merge nguyên khối PR22/25**, A tối thiểu đã có trên main; tách H riêng, H1/H2 là điều kiện trước C, chưa mở B/C cho Page nào. H1 chưa được triển khai: hàng đợi Messenger opt-in không bao phủ mọi sự kiện Page trước ACK. 50 SQL là danh mục tham khảo, không phải batch áp DB; migration mới từ701.

[Hồ sơ hiện hành](vpt-marketing-automation/LIVE_RELEASE_20261005.md), [đối chiếu quyết định](vpt-marketing-automation/SPLIT_RELEASE_ALIGNMENT_20261005.md), [manifest](vpt-marketing-automation/LIVE_RELEASE_MANIFEST_20261005.json) và [hàng việc](vpt-marketing-automation/RELEASE_QUEUE.json) giữ rõ điều kiện và việc chưa xong. Chưa có bằng chứng khôi phục bản sao thật, binding/UAT hoặc phát hành tự động hóa. Không sửa phần quyền DB của Claude, không mở AI/send/booking/chi quảng cáo. Các mục dưới giữ lịch sử theo thời điểm.

---

## 2026-10-05 — Tích hợp bản live và kiểm tương thích nền bảo mật 700

Ghép main 1f879ea8 vào f138e2bd trong worktree riêng. Giữ policy đầy đủ của ứng viên, metadata Drive trong helpersBundle của main và hai lịch sử hồ sơ. Tích hợp 44 ca coverage: 1.628 PASS, 0 FAIL, 2 SKIP Windows; 49 tệp đạt ngưỡng 80% dòng/nhánh/hàm. Bổ sung matrix PostgreSQL 17 legacy/700, kiểm ACL trước fixture grant lịch sử, phát hiện drift sau fixture và restore default privileges. CI mới chờ chạy; không dùng kết quả cũ để chứng nhận delta.

Kiểm chỉ đọc qua Supabase connector: quyền bảng hai DB đã đóng, cột/RPC Backup có; sáu bảng Marketing chưa có, account VPT01 không có trong registry, raw Lead Ads Page VPT từ 01/10 chưa có. Render hai dịch vụ live 1f879ea8; startup failover on/auto off. Reviewer riêng nêu thứ tự 700 trước Marketing, dependency binary rộng và replication không bao phủ RPC. Hồ sơ LIVE_RELEASE_20261005.md và RELEASE_QUEUE.json cập nhật những điều kiện còn thiếu. Không sửa 700, DB, cấu hình, quảng cáo, lịch hoặc gửi khách. Hoàn tác phần chuẩn bị bằng revert, giữ bằng chứng và bản bảo mật.

---

## 2026-10-05 — Sửa mã ngăn Backup tự cấp quyền và clone legacy

Trên nền b0955e23, bỏ grant tự động, khóa helper/CLI cũ trước IO và fallback clone ở sync/manual-switch. Giữ job lỗi quyền qua retry12/13, dừng batch, giữ lỗi HTTP cho caller; không xóa queue thật. Reviewer phát hiện starvation ở memory queue; sửa defer xuống cuối và thêm mixed-queue test. 20/20 unit PASS độc lập. Fixture grants lịch sử giữ nguyên negative calendar tests.

Xuất bản f437db54, CImerge28d6327b cùngtree31983f8c. Backup guard37290310025 cả Node18/22:20PASS; Marketing37290310047 cả10jobSUCCESS, Node18/22 mỗi1.521PASS, PostgreSQL17 intake507/restore11PASS. Report37290310275 và Agentguardrails37290310085 SUCCESS. Lần36a6 CI restore FAIL do guard phiên bản16, đã sửa expectedmajor ghim17 và fail-fast prerequisite, kiểm lại trênhead mới. [Hồ sơ tác động và giới hạn](vpt-marketing-automation/BACKUP_PRIVILEGE_GUARD_20261005.md). Chưa DB/deploy; quyền/schema thật chưa sửa và restore thật/UAT chưa PASS.

---

## 2026-10-05 — Supabase catalog, quyền và routing chỉ đọc sau đăng nhập

- Đọc Primary/Backup bằng SQL Editor, BEGIN READ ONLY/SELECT/ROLLBACK; không lấy secret hoặc hồ sơ khách. Lưu [DB_CATALOG](vpt-marketing-automation/DB_CATALOG_20261005.md) và JSON, cập nhật hồ sơ trạng thái/phát hành.
- Xác nhận Backup thiếu cột/FK/index facebook_contact_id, RPC639 và trigger SQL568 trong phạm vi so sánh; quyền rộng trên bảy bảng và RLS permissive; không suy ra khai thác thực tế hoặc toàn DB đã kiểm.
- Xác nhận Admin VPT/company/tenant/hai vùng active, mapping Page legacy; registry không có account đã tìm. Có Physical backup Primary nhưng chưa restore và không gồm Storage. Giữ thiếu form binding/UAT và snapshot queue14:23 riêng.
- Reviewer độc lập rà bằng chứng và các đường clone/grant/sync/replication: HOLD vận hành, đủ để lập gói khắc phục theo thứ tự trong báo cáo. Không thay runtime/SQL, không chạy DB mutation, chuyển DB, restore hoặc phát hành. Không chạy lại toàn bộ test runtime cho delta tài liệu; kiểm JSON/liên kết/diff và review tính nhất quán.

---

## 05/10/2026 — Xuất bản ứng viên, khép CI và mapping Page chỉ đọc

Bổ sung khoảng14:23–14:30: Giám sát CRM đã mở khóa, đọc active Primary/failover Bật/queue1011/error PGRST204 cột facebook_contact_id; lịch sửclone04Oct lỗi out of shared memory ởprepare schema. Đối chiếu clone legacy có DROP CASCADE, nonzero restore bị bỏqua theo chuỗi, rowcounts khôngassert và grant rộng. Không chạyverify/drift/sync/chuyển DB. SupabaseDashboard cầnloginriêng, đãhỏiFounder; thêm DB_READONLY và SQLcatalog READONLY chưachạy. Cậpnhật trạng thái mới, khôngcònchờ mật khẩuCRM; giữHOLDvậnhành.

Push fd3babeb lên PR25, không chạm main. CI merge7774edd9 và source có cùng tree4c8d1cab (đã fetch/đối chiếu). Workflow report37276592963/guardrails37276592953/Marketing37276593013 đều SUCCESS; 10 Marketing jobs. Đọc log Node18/22 mỗi 1.521 PASS/0 FAIL/0 SKIP, intakePG507/0/0 và restore cluster khác11/0/0. Reviewer độc lập kiểm published head, P3 UI, backend/test blobs và scoped PASS.

Đọc CRM Page409741855550833 mapping legacy đúng VPT/HCM/Admin VPT, loại Bếp/stage TIẾP NHẬN; đợi options tải xong, đóng Hủy, không lưu. Nhắc token chỉ dựa ngày cài đặt; không suy hết hạn. Render backend đã live3375ef71/frontendad88a162; source candidate chưa live. Hoàn thiện RELEASE_INTEGRATION cùng bảng điều kiện mở tuyến Lead, cập nhật CURRENT/RELEASE_READINESS và phiếu CRM/Render. Chưa khép DB/password gate, quyền/binding mới/chuyển luồng/UAT thật. Không mutation production, không mở AI/chi ngân sách. Hoàn tác delta tài liệu bằng commit sửa/revert, giữ bằng chứng.

---

## 05/10/2026 — Ghép main3375ef71, chuẩn bị gói Lead đầu tiên

Founder yêu cầu hoàn tất các việc trước chạy thật. Commit checkpoint d5fa89d4 lưu quan sát cũ; ghép main3375ef71 trên nhánh sửa. Một conflict UI giải quyết giữ cả chức năng main và nhãn/bằng chứng. Reviewer tìm scope/false-zero metric mới; sửa company-filter, quyền contact chưa rõ trảUNKNOWN, exactcount chốngcắtnguồn.30ca mới +128cũ=158reportPASS; fullunit1564PASS/0FAIL/2WindowsSKIP; VitebuildPASS. Giữ toàn bộ49filemain trừ ba file báo cáo cần tích hợp; SQLcũkhôngsửa. ChờCI/PG và reviewđúngversion. Trang Giám sátSupabase cókhóa mật khẩu riêng; mờiFounder mởtrực tiếp, khôngbypass. Chưa mainmerge/deploy/config/DB/message. Xem RELEASE_INTEGRATION_20261005.

---

## 05/10/2026 — Xác nhận workspace và kiểm Render chỉ đọc

Dùng workspace tea-d47g0824d50c73856e80 sau Founder xác nhận. Render list services/deploys/events và log khởi động mục tiêu; GitHub compare source: frontend ad88a162/backend899db5ed live, main auto-deploy, backend một instance cấu hình. Chênh từ nền ca8810c5 là10commit/49file; frontend không đổi trong bốn commit chênh backend. Runtimeadd71daf diverged, merge-baseca8810c5. Startup log failover=on/auto=off, chưa chứng minh active target hiện hành; guard tuyến mới yêu cầu failoveroff+Primary. MainSQL649 khác MarketingSQL649, phải lập ledger đầy đủ tên/blob.

Lưu RENDER_READONLY_20261005.md/json, cập nhật CURRENT/DECISIONS/RELEASE_READINESS và liên kết bổ sung phiếu CRM. Không truy xuất secret/giá trị environment, không mutation production. Truy vấn Git object cục bộ thiếu object không hoàn tất do sandbox network; dùng GitHub connector chỉ đọc để so sánh, không tính lỗi đó là bằng chứng mã. JSON/link/diff được kiểm; không chạy runtime test vì chỉ hồ sơ. Không còn blocker workspace; chưa publish tài liệu, phát hành HOLD. Hoàn tác chỉ sửa/revert hồ sơ, giữ lịch sử.

---

## 05/10/2026 — Đối chiếu tài khoản/lịch CRM chỉ đọc

Trong phiên Chrome đã đăng nhập, mở /users, lọc VPT và đọc hồ sơ Admin Vạn Phú Thành: cơ cấu đúng công ty, module crm/Admin. Đọc các option của bộ lọc /crm/events để ghi ID ứng viên người/công ty và HCM/CT/Q2; không suy quyền hoặc vùng từ tên. Lịch tháng 10 hiển thị 500 sự kiện, lưới không có sự kiện gắn dự án; không suy giờ rảnh hoặc đủ dữ liệu. Không lưu nội dung khách/sự kiện hoặc dữ liệu phiên. Render chưa chọn workspace; đã hỏi Founder theo yêu cầu connector, chưa list service/config.

Thêm CRM_READONLY_VERIFICATION_20261005.md, cập nhật RELEASE_READINESS và CURRENT; thay blocker đăng nhập đã lỗi thời bằng các điều kiện tenant/active/quyền/routing/roster/lịch đầy đủ còn mở. Ứng viên PR25 vẫn a270f7be (runtime add71daf), commit production chưa biết; không gọi quan sát UI là UAT. Kiểm diff/liên kết cho delta tài liệu; không chạy lại runtime test. Chưa publish delta hồ sơ, không code/SQL/config/DB/message/booking/deploy. Hoàn tác chỉ sửa/revert tài liệu, giữ lịch sử; phát hành HOLD.

---

## 05/10/2026 — Sửa các điểm kiểm soát Agent đã audit

Theo thứ tự Founder chốt, triển khai registry đọc có kiểm quyền server, MCP bound actor, fail-closed flow gates và callers, bằng chứng trả lời có cấu trúc, context thành công/tombstones và correction ưu tiên. Reviewer độc lập tìm thêm source-error bypass, quyền đổi trước gửi, strict memory và lỗi persistence; đã sửa và bổ sung hồi quy. Bộ tập trung 112 PASS, gồm 48 regression + 64 Care; reviewer chạy riêng 48 PASS. Xem [hồ sơ](agent-guardrails-20261005/README.md), log và fingerprint để gắn đúng mã đã kiểm. Giữ nguồn audit 679cb926 nguyên lịch sử. Không sửa kiến trúc đích, SQL, ECC/hooks, cấu hình thật hay phát hành. Một số chức năng legacy giữ khóa có chủ đích; chưa chứng nhận scheduled sender/menu/MCP Ads. Không rollback bằng cách bật lại đường fail-open.

---

## 05/10/2026 — Ghi đầu mối nhận khách và nguồn lịch CRM

Founder xác nhận “người nhận khách là admin vạn phú thành”, sau đó trả lời “crm” cho nơi quản lý lịch khảo sát. Cập nhật DECISIONS, CURRENT, README và RELEASE_READINESS: đầu mối đã được chọn và nơi quản lý lịch đã xác định; tài khoản/quyền, nhân sự/giờ trống và độ đủ lịch bận vẫn cần đối chiếu. Đọc hợp đồng SURVEY_AVAILABILITY và CARE_SURVEY_RUNTIME để giữ đúng luồng CRM → đề xuất → khách xác nhận; không suy câu trả lời thành chứng nhận CRM_COMPLETE/ALL_BUSY_IN_CRM. Giữ nguyên bộ 18 câu đã duyệt, ngân sách, phạm vi kế hoạch và giới hạn phát hành. Không gán Admin là người khảo sát hoặc người thay thế. Chỉ sửa hồ sơ, không đổi mã/SQL hoặc routing thật. Đối chiếu diff và liên kết; không chạy lại kiểm thử runtime cho thay đổi tài liệu. Nếu cần sửa hồ sơ, dùng commit điều chỉnh có lý do và giữ lịch sử quyết định Founder.

## 04/10/2026 — Ghi quyết định Founder duyệt câu chữ V1

Founder xác nhận “anh duyệt bộ 18 câu hỏi”. Ghi quyết định VPT-CARE-CONTENT-V1-FOUNDER-WORDING-APPROVAL vào DECISIONS và metadata của bộ JSON; ghim nguồn ee641db9 và đủ 18 mã Q01–Q15/A01–A03. Cập nhật bản đọc, CURRENT, README và RELEASE_READINESS để không tiếp tục báo thiếu phê duyệt câu chữ. Giữ toàn bộ câu/điều kiện/giới hạn, các bindings null và sendAllowed/importReady=false; ca chất lượng NOT_RUN. Đây là thay đổi hồ sơ theo quyết định mới, không sửa mã/SQL, không gọi model, ghi DB hoặc cấp quyền. Hoàn tác hồ sơ bằng commit sửa có lý do; không diễn giải revert file là Founder thu hồi quyết định. Còn cấu hình và nghiệm thu vận hành, phát hành HOLD.

## 04/10/2026 — Chuẩn bị nội dung tư vấn có nguồn

Lượt trước PROGRESS: tách outcome SEND/recovery PASS tại e2afcfea, closureb3cb88dc vừa xác minh cả10job/report/MessengerSUCCESS. Lượt này thêm VPT_CARE_CONTENT_DRAFT.md/.json và VPT_CARE_CONTENT_EVAL_CASES.json:18câu ADVICE/QUALIFY,18ca yêu cầu nghiệm thu theo model/domainstage. Đọc websitevanphuthanh.net và kế hoạch chuẩn; nguồn lavabo cũ/danh sách trống, hai detailđá/kính lỗi được ghi rõ, không suy giá/bảo hành/capability. Đối chiếu contract9fields, sender2000ký tự, HANDOFFnộibộ, modelchỉthấyquestion/answer/purpose. Không tạo UUID/quyền/hạn giả hoặc seedAPPROVED. JSON18/18/source8/link7PASS; reviewer độc lập mở5nguồn và PASS hồ sơ cuối. Đã sửa A01 loại yêu cầu chốt/giảm giá, Q14 không hỏi ưu tiên đã có, E11 dừng trước model, E14 text-only. Kiểm parser E11 thực trả REQUEST_HUMAN. Chỉdocs; không runtime/DB/provider/livechange, evalNOT_RUN và Founderdecisionnull. Lượt này PROGRESS vì nội dung cần duyệt đã thành bộ cụ thể. FullgoalACTIVE.

## 04/10/2026 — Tách công tắc gửi outcome khỏi recovery

Đóng kiểm chứng e2afcfea/tree7cdbfd57: automation37203972012 cả10jobSUCCESS; PostgreSQL507/0/0 gồm3ca mới180–182 và restore11/0/0; Node18/22 mỗi1.417/0/0, build10.339modules/37,97s; report37203972039/Messenger37203972002SUCCESS. CImerge7595ad15 đúng tree/parents. Reviewer độc lập xác minh publishedblobs/log và PASS checkpoint. Sửa2P3tài liệu về quyền human/Agent và UI đã có; JSON50blob/21linksPASS. Closure CI của hồ sơ a6b52b04 cũng đã kết thúc10job/report/MessengerSUCCESS. Lượt này PROGRESS vì dừng gửi đã giữ được recovery; full goal ACTIVE, phát hành HOLD.

Lượt trước PROGRESS: hồ sơ/manifest đã review PASS và lưu a6b52b04. Lượt này sửa facebookSurveyOutcomes.sendEnabled để yêu cầu OUTCOMES_SEND=1; OUTCOMES/CONFIRMATIONS giữ recovery. Không đổi DB/quyền hoặc enrollment. Các fixture outcome/journey/surveyRuntime/workerDrain bật SEND rõ; thêm unit pause/missing/restart/ACK/timeout và ba ca PostgreSQL QUEUED/UNCERTAIN/STOP. Cập nhật tài liệu cùng delta; manifest giữ nguồn kiểm kê SQL cũ và chỉ rõ runtime delta cần kiểm lại. Chưa live config/provider/DB/phát hành. Full goal ACTIVE; CI và review cuối chờ.

## 04/10/2026 — Gom hồ sơ nghiệm thu và điều kiện phát hành

Thêm RELEASE_READINESS.md và RELEASE_CANDIDATE_MANIFEST.json, liên kết từ CURRENT/README. Ghim source1b7c00f/tree f71ce24d, test7789338, PR22 draft/unmerged phụ thuộc PR19 open/unmerged; kiểm kê 50 SQL thêm mới648–697 theo Git blob. Chưa xác minh deployed base/schema; inventory không phải migration runner. Closure CI37202456267 cả10jobSUCCESS, report37202456273/Messenger37202456278SUCCESS đã đọc trạng thái cuối.

Đã tiếp nhận review thiết kế runbook: giữ Page/echo/confirmation receipts; runtime0 không chặn draft cũ; dispatch0 vẫn cho proposal cũ book; outcomes0 tắt recovery; SQL687 singleton guard mọi công ty trên graph và bắt READ COMMITTED khi inactive. Ngừng process không chứng minh Meta/OpenAI đã dừng. Chỉ sửa tài liệu; chưa live access, quyền, migration hoặc phát hành. JSON/50blob/14links PASS; reviewer độc lập xác minh cả source/base/PR/CI và PASS hồ sơ cuối, không còn finding chặn trong phạm vi. Đã làm rõ ngân sách chung sáu kênh và SQL697 replay không tự bật lại hold. Không chạy lại runtime cho delta tài liệu. Full goal ACTIVE; phát hành HOLD.

## 04/10/2026 — Bổ sung hành trình AI xuyên suốt

Đóng kiểm chứng 7789338/tree31f723f9: automation37202121312 cả10jobSUCCESS, PostgreSQL504/0/0 và restore11/0/0, Node18/22 mỗi1.412/0/0, frontend10.339modules/36,68s; report37202121318/Messenger37202121320SUCCESS. Mergef23f757b đúng tree/parents. Reviewer độc lập xác minh publishedblobs/log và PASS checkpoint. Hai ca mới chạy trọn nhánh sau khi tách company; không lấy lần lỗi9f7a23c làm PASS. Chỉ test/docs, chưa runtime/SQL/DB/provider thật. Full goal ACTIVE; lượt này PROGRESS vì đã khép bằng chứng điểm nối adapter/AI→lịch→dashboard, còn UAT/cấu hình/phát hành.

Sau CI9f7a23c (intake502/2, journey chưa tới AI do nguồn fixture tích lũy >giới hạnSQL671), tách company/tenant và cấu hình journey riêng. Không xóa nguồn, nới guard hoặc seed kết quả; intake/link/library/qualification vẫn qua dịch vụ. Thêm source_inventory.complete/2accounts/1Page assertion; restore chọn công ty có unresolved receipt để tránh chọn company chỉ có usage thành công. Syntax PASS; PostgreSQL và review bản sửa chờ.

Thêm facebookCustomerCare.journey.cases.js và gọi sau SQL696 trong runtime.cases: hai lượt ANSWER/SURVEY qua actual metered Responses adapter, signed intake/link/qualification, ACK-before-echo barrier, proposal/click/booking/outcome/ACK, cohort+cost API/frontend validation. Kiểm tiền account khôngLead, replay, quyền công ty, STOP/takeover và lỗi spend. Chỉ thêm test/docs, không sửa business code hoặc SQL. Syntax PASS; CI/PG/review cuối chờ. [Bằng chứng/giới hạn/hoàn tác](vpt-marketing-automation/AI_CUSTOMER_JOURNEY.md). Lượt trước PROGRESS (restore rehearsal PASS); closureCI37201135871 cả10jobSUCCESS vừa xác minh. Full goal ACTIVE; chưa model/provider/DB thật.

## 04/10/2026 — Sửa bằng chứng diễn tập khôi phục

Đóng kiểm chứng eb42ff85/tree d8f77540: automation37200820753 cả10jobSUCCESS, intake502/0/0, restore11/0/0 trên124bảng; Node18/22 mỗi1.412/0/0, build10.339modules/28,03s, report37200820778/Messenger37200820720SUCCESS. CImergea7ae00c5 khớp tree/parents. Reviewer độc lập tự đọc publishedblobs/log/tree và PASS checkpoint; SQL697 không đổi. Cập nhật CURRENT/README/RESTORE_REHEARSAL và bước tiếp cho Founder: cấu hình, nguồn/chuyển luồng, UAT rồi gói phát hành. Full goal ACTIVE; chưa DB/model/provider thật hoặc quyền chạy.

CI a6c523c intake502/0/0 nhưng restore2PASS/9FAIL. Harness đã hiểu ACL NULL thành không có quyền; sửa chuẩn hóa về acldefault theo loại/owner, giữ đối chiếu quyền và kiểm negative grant drift. Bổ sung hai sequence synthetic với last_value/is_called khác mặc định và đối chiếu cấu hình để kiểm rõ trạng thái bộ đếm. Log nguồn có sequence; không kết luận kiểm cũ đã so tập rỗng. Không đổi SQL697 hoặc dữ liệu thật. Node syntax PASS; CI/review cuối chờ. [Phạm vi và hoàn tác](vpt-marketing-automation/RESTORE_REHEARSAL.md).

## 04/10/2026 — Transport câu tư vấn theo quyền riêng

Bản kiểm a388433/runtimec822e33 đã đạt: Node18/22 mỗi bản1.385/0/0, intakePostgreSQL469/0/0 gồm21mới; cả10job/build/report/Messenger SUCCESS. Mergea97254a khớp tree5178ac0 và parents base/head. Test câu dài đã sửa đúng actualentry; publisher expiry và recovery lockorder có regression đạt. Reviewer độc lập đã đối chiếu published blobs/log/tree và PASS checkpoint. [Bằng chứng/hoàn tác](vpt-marketing-automation/CARE_ANSWER_DELIVERY.md).

CI7e0670b lỗi ambiguous payload đã sửa; c822e33 khép thêm publisher lease và recovery Page/PSID (regression đạt), còn1subtest/parent lỗi (467/2). Sửa fixture câu dài từ SELECTAPPROVEDbất kỳ sang actualcontextentry0 +SAVE/APPROVE+assert2001 và restore đúng nguồn. Không hạ yêu cầuHELD, chờ CI mới.

Thêm SQL694/send policy/attempt/receipt và careAnswerDispatch; tách nhận echo khỏi booking flag, giữ bằng chứng ACK dù draft stale. Barrier ngăn model dùng transcript thiếu outbound và tránh đua với survey/outcome. Local1.380PASS/5skip;11unit mới,21PG đang chờ; reviewer độc lập đang rà. [Phạm vi/bằng chứng/hoàn tác](vpt-marketing-automation/CARE_ANSWER_DELIVERY.md). Không gửi thật, cấp quyền hoặc phát hành; full goal ACTIVE.

## 04/10/2026 — Runtime draft và handoff theo quyền riêng

Bản kiểm `65b8c7b` đã đạt Node18/22 mỗi bản1.374/0/0, PostgreSQL448/0/0 gồm26runtime; automation37191768019 cả10job SUCCESS, build10.335modules38,11s, report37191768012/Messenger37191768025 SUCCESS. Merge22463284 có tree9d1250e và parents đúng base/head. Không thay runtime business code sau05d657e; reviewer độc lập xác minh published blobs/log/tree và PASS checkpoint. [Bằng chứng/hoàn tác](vpt-marketing-automation/CARE_RUNTIME.md).

Hậu kiểm `05d657e`: PostgreSQL run37191309436 thất bại (373/49), lỗi đầu 42P01 thiếu advisor_cancellations do harness; runtime chưa được thử. Sửa prerequisite SQL690 và khôi phục facade692 sau690/691 trong các nhóm hồi quy. Fixture starvation tạo liên kết qua service trước khi đổi company của Lead, giữ nguyên guard. Reviewer độc lập phát hiện cả hai vấn đề; chờ CI đúng bản sửa.

Thêm SQL692 core dùng chung, SQL693 principal/grant/turn/close; careRuntime/console và provider authority riêng. Không impersonate admin; grant ABA/expiry sau waits được chặn, permit clamp theo grant. Lỗi mapping có metadata handoff để tránh nghẽn đầu hàng chờ. Tạo13unit và26PGcases, cập nhật lifecycle fixture; local1.369PASS/5skip. Reviewer rà mã, hai P2 đã sửa; chờ CI/PG đúng phiên bản. [Hợp đồng/hoàn tác](vpt-marketing-automation/CARE_RUNTIME.md). Không model thật/gửi/phát hành; full goal ACTIVE.

## 04/10/2026 — Adapter Responses và hạn mức gọi AI

Runtime cc5e6a97d319b4e5a40a9e4fe1b1e7bf873b8150/tree f29b53dcb41c74176cb37082b84a8bc144b9af78 thêm SQL691 và adapter Responses mặc định tắt. Node18/22 mỗi bản 1.361/0/0; intake PostgreSQL 422/0/0 với 13 ca mới, cả 10 job/build/report/Messenger SUCCESS. Đã xác minh CI merge890b9b3 đúng tree/parents. Ràng buộc receipt theo state khép P2; ca PostgreSQL xác nhận invalid receipt giữ reservation và khóa claim tiếp. Reviewer độc lập đã xác minh published blobs/log/tree và PASS checkpoint SQL691/adapter. [Bằng chứng/nguồn/hoàn tác](vpt-marketing-automation/CARE_OPENAI_INFERENCE.md). Không quyền runtime mới, gọi provider thật, gửi khách hoặc phát hành. Full goal ACTIVE.

## 04/10/2026 — Khép kiểm chứng màn hình tư vấn

Runtime4b4cdc5/tree3c63e0b: Node18/22=1349/0/0, intakePostgreSQL409/0/0 gồm16ca SQL690; cả10job/build/report/Messenger SUCCESS. CI merge4851adec đúng tree/parents. Reviewer độc lập tự đối chiếu published blobs/log và PASS checkpoint, khép P2 đổi tab; browser API giả do bên triển khai. Không provider/AI thật/quyền gửi/UAT hoặc phát hành. [Bằng chứng/hoàn tác](vpt-marketing-automation/CARE_ADVISOR_CONSOLE.md). Full goal ACTIVE.

## 04/10/2026 — Giao diện và đối soát lượt tư vấn

Thêm SQL690 discovery/cancel, adapter/router, CareAdvisor/state, active-tab invalidation và 16 ca PostgreSQL. Browser actual Workspace/Library/API giả kiểm thu hồi nguồn, pending qua reload/tab, CANCEL ACK riêng và stale response sau đổi actor/company. Local1344PASS/5skip; focused29/29. Reviewer độc lập PASS về mã sau khép P2 tab; chờ PostgreSQL/CI. Chưa provider, DB thật hoặc gửi khách. [Hồ sơ/hoàn tác](vpt-marketing-automation/CARE_ADVISOR_CONSOLE.md).

## 04/10/2026 — Khép kiểm chứng bản nháp tư vấn

Bản kiểm73a7824/runtime56d424f: intakePG393/0/0 gồm22ca mới và observerLock; Node22=1336/0/0, all10jobs/build/report/Messenger SUCCESS. Reviewer độc lập kiểm blob/log và PASS đúng SQL689/Application Service/API dùng inference giả. Hồ sơ được khép; provider/quyền gửi/UI/chất lượng AI/UAT/phát hành còn mở. [Bằng chứng/hoàn tác](vpt-marketing-automation/CARE_ADVISOR_DRAFTS.md).

## 04/10/2026 — Bằng chứng trợ lý tư vấn

Runtime56d424f đã qua automation37185360650: Node22=1336/0/0, intakePG393/0/0 (22mới), cả10job/build/report/Messenger SUCCESS; CI merge tree khớp. Bổ sung observer pg_stat_activity cho ca tranh chấp FINISH/OPT_OUT theo review, không đổi runtime. Review cuối chờ ca tăng cường.

## 04/10/2026 — Trợ lý tư vấn nguồn đã duyệt (đang kiểm chứng)

Thêm SQL689, careAdvisor.js, router và Node/PostgreSQL cases; nối fixture inference với cơ chế thread/library hiện có. Draft giữ nguyên câu trả lời được duyệt, nhu cầu là trích dẫn chưa xác minh. Thêm BEGIN/FINISH/READ/CLOSE/RETRY bền vững; không provider thật hoặc quyền gửi. Local16 PASS; CI PostgreSQL và review cuối còn chờ. Xem [hợp đồng/hoàn tác](vpt-marketing-automation/CARE_ADVISOR_DRAFTS.md).

## 04/10/2026 — Đối soát liên kết Facebook đã qua PostgreSQL và review

SQL688 cho operator đối soát liên kết hiện tại của item UNKNOWN đã durable STOP, dưới đúng hold revision/manifest/snapshot; giữ claim, thu hồi capability và ghi audit nguyên giao dịch. Run vẫn REVIEW; không replay creator hoặc xác nhận toàn bộ tác động đã hoàn tất. Reader/UI giữ đúng giới hạn và quyền lịch sử.

Bản kiểm `d2d6e1c`: PostgreSQL **371/0/0** gồm 23 ca mới, Node22 **1.320/0/0**, cả 10 job/build/report/Messenger SUCCESS. Fixture đầu vi phạm UNIQUE đã sửa theo schema thật và thêm inverse conflict; SQL runtime không đổi. Review độc lập PASS sau đối chiếu blob/log CI. [Phạm vi, bằng chứng và hoàn tác](vpt-marketing-automation/BATCH_LINK_RECONCILIATION.md).

Còn inventory vận hành/tác động ngoài liên kết, UNKNOWN thiếu hoặc mâu thuẫn, cấu hình AI/lịch/người nhận/phạm vi đo, UAT và Founder release. Generic queue không có Facebook handler trong mã đã khảo sát; phải cô lập cả runner/API/consumer khi bảo trì, không chỉ tắt polling. Full goal ACTIVE; chưa DB thật/phát hành hoặc kết quả 250k.

---

## 04/10/2026 — Dừng vòng cũ và tác vụ Facebook đã qua kiểm thử tích hợp

Runtime `4c97626` theo dõi pipeline/master/scan/rescan/AutoTool, leader jobs, batch queue, marketing sync và handler Facebook sau ACK/client disconnect. Chờ ID đã dequeue tới lưu kết quả, không đổi enable nghiệp vụ khi shutdown. Hai finding về child sinh muộn và router con đã sửa. Node 18/22 mỗi bản **1.309 PASS/0 fail/0 skip**, intake PostgreSQL **348/0/0**, cả 10 job/build/report/Messenger SUCCESS. Reviewer độc lập đã đối chiếu blob công bố và log CI, kết luận PASS trong phạm vi này. [Phạm vi và bằng chứng](vpt-marketing-automation/LEGACY_RUNTIME_DRAIN.md).

Bước tiếp: đối soát lượt đang dở và khôi phục queue, kiểm đủ tác vụ/instance khi chuyển luồng; khép AI, người nhận/lịch khảo sát và phạm vi đo; UAT toàn tuyến rồi trình Founder phát hành. Chưa chứng nhận toàn process, xử lý UNKNOWN, chuyển Page hoặc chạy thật. Cờ shutdown vẫn tắt. Full goal ACTIVE; 250.000đ/khách hợp lệ là mục tiêu, chưa có kết quả thực tế.

---

## 04/10/2026 — Dừng/chờ năm worker đã qua review và kiểm thử tiến trình

Runtimef3ea85e nối lifecycle và server adapter mặc định tắt; ngừng nhận lượt mới, chờ kết quả đang gửi/lưu, lỗi đóng mạng không báo thành công giả. Node18/22 mỗi bản1.278/0/0 gồm2ca SIGTERM/SIGINT native Linux; intakePostgreSQL348/0/0, cả10job/build/report/Messenger SUCCESS. Reviewer độc lập đã xác minh published blobs/log CI và kết luận PASS checkpoint. [Phạm vi, bằng chứng và hoàn tác](vpt-marketing-automation/WORKER_DRAIN.md).

Chưa chứng minh legacy/post-ACK/push/tiến trình khác đã dừng. Cờ vẫn tắt; chưa đối soát UNKNOWN, chuyển Page, tắt hold SQL687 hoặc phát hành. Full goal ACTIVE; tiếp tục dừng/chờ đường cũ, khép AI/lịch/người nhận, UAT và Founder release. Chưa dữ liệu thật đạt250k.

---

## 04/10/2026 — Kiểm chứng bảo trì đường ghi legacy

Thêm SQL687/private hold, `facebookLegacyHold.cases.js`, nối journal PG và workflow; cập nhật CURRENT/README cùng [hợp đồng](vpt-marketing-automation/LEGACY_WRITE_HOLD.md). 18 root và FK descendants, guard cả statement/replica, table-lock trước state, audit/revision/hash/request; mặc định inactive. Runtime df51b95, bản kiểm9ecbec4/treefea75d19: PG348/0/0 gồm13 ca mới, Node22=1228/0/0, cả10 job/build/report/Messenger SUCCESS. Cú pháp/diff kiểm local. SET NULL dùng parent riêng sau khi đọc log thấy fixture đầu chỉ tới CASCADE; SQL không đổi. Reviewer bổ sung nhánh assignment/artifact, isolation inactive và DDL freeze; reviewer độc lập đã đối chiếu published blobs/log CI và PASS checkpoint maintenance. Không tác động hệ thống thật; UNKNOWN/claim giữ nguyên và mục tiêu đầy đủ còn ACTIVE.

## 04/10/2026 — Dừng batch có tombstone và audit

SQL686 + journalhelper/route + RecoveryUI/controller; cập nhật workflow, thêm30unit/UI và12PGcases. Runtimee7d35d1/treebe092508: Local/Node22=1228/0/0; PG335/0/0 với12ca mới;10job/build/report/MessengerSUCCESS, CImergecf04899khớp. Reviewer độc lậpPASS checkpoint; browser component thật/API giả kiểm STOP trướcBEGIN/reload vàUNKNOWNgiữclaim. Câu xác nhận sửa theo review để không hứa hủy HTTP đã gửi. [Chi tiết và rollback](vpt-marketing-automation/LEGACY_BATCH_STOP.md). Không DB thật/model/chi/phát hành; fullgoalACTIVE.

## 04/10/2026 — Facebook duplicate review

Thay tự xóa/gộp bằng reader CRM company-scoped; SQL685 strict active; hai pipelinecaller, monitor và UI mới giữ UNKNOWN khi lỗi; deeplinkquality tới card hiện có. Thay đổi helper/reviewService/routes/facebook, components/pages, migrations/runners/workflow và hồ sơ liên quan. Runtime4df166/tree f550a0ca: Local1198/0/0, identityPG35/0/0 (8mới), intake323/0/0,10job/build/report/MessengerSUCCESS; CImerge dcfd6ef đúng tree/base/runtime. Reviewer độc lập PASS checkpoint; browser giảPASS phạm vi đọc/deeplink. Không DB thật/merge/deploy/model/quảng cáo. Chi tiết và rollback: [LEGACY_DUPLICATE_REVIEW](vpt-marketing-automation/LEGACY_DUPLICATE_REVIEW.md).

## 04/10/2026 — Đã kiểm chứng sửa nguồn khách theo bằng chứng

Runtime8f61a18 chỉ khôi phục nhãn nguồn NULL từ original intake cho danh sách/công ty rõ ràng; giữ nguồn đã có, hồ sơ thiếu/mâu thuẫn vào REVIEW. SQL683 ghi nhãn và receipt cùng giao dịch, khóa maintenance có giới hạn chờ. Local267 PASS; PostgreSQL307/0/0 gồm17ca mới; Node22 843+26+267, cả10job/build/report/Messenger SUCCESS. Reviewer độc lập xác minh published blobs/log CI và kết luận PASS phạm vi SQL683/API.

[Hợp đồng, bằng chứng và hoàn tác](vpt-marketing-automation/LEGACY_SOURCE_REPAIR.md). Tiếp theo: đối soát batch bền vững sau reload, dừng/chờ và chuyển writer cũ, bảo toàn lịch sử; khép AI/lịch/người nhận và phạm vi đo rồi UAT/Founder release. Full goal ACTIVE, chưa DB thật, phát hành hoặc kết quả250k. Các mục dưới giữ lịch sử.

---

## 04/10/2026 — Đang nghiệm thu sửa nguồn khách

Thay route đồng bộ nguồn toàn DB bằng preview/apply theo một công ty và danh sách Lead rõ ràng. SQL683 chỉ khôi phục nhãn NULL từ evidence original intake, giữ nguồn đã có, hồ sơ mâu thuẫn cần đối soát. Ghi nhãn và receipt cùng giao dịch; quyền hiện hành và khóa graph maintenance được kiểm trong SQL. Local30 ca mới+237 regression=267 PASS. Đã bổ sung17 ca PostgreSQL; CI và review cuối đang chờ.

[Hợp đồng, khóa dữ liệu và hoàn tác](vpt-marketing-automation/LEGACY_SOURCE_REPAIR.md). Reviewer phát hiện company.is_active NULL trong helper cũ; bản sửa thêm strict TRUE và ca kiểm cả sau chờ khóa/replay. Full goal ACTIVE; chưa dữ liệu thật, phát hành hoặc kết quả250k. Còn chuyển luồng, đối soát bền vững, AI/lịch/người nhận, UAT và Founder release.

---

## 04/10/2026 — Batch tạo khách đã qua PostgreSQL và review

Runtime `c7d2a438d261b204064e6a597350e01e589fc58c` giới hạn đúng danh sách/công ty, kiểm quyền và đầu vào hiện hành, giữ liên kết hội thoại, có đường đối soát các ID lỗi. Local237 PASS; PostgreSQL290/0/0 gồm9 ca mới; Node22 843+26+237 và cả10job/build/report/Messenger SUCCESS. Reviewer độc lập xác minh đúng bản công bố và kết luận PASS phạm vi batch-create.

[Hợp đồng và bằng chứng](vpt-marketing-automation/LEGACY_BATCH_CREATION.md). Browser đã thấy đúng request, lỗi một phần và nút đối soát; thao tác xác nhận tiếp tục chưa chứng minh do công cụ kẹt ở hộp confirm. Source-backfill, đối soát bền vững qua reload, chuỗi ghi nguyên tử/chuyển luồng, AI/lịch/người nhận, UAT và Founder release còn OPEN. Full goal ACTIVE; chưa DB thật, phát hành hoặc kết quả250k thực tế. Các mục dưới giữ lịch sử.

---

## 04/10/2026 — Bản sửa tạo khách hàng loạt đang nghiệm thu

Đã giới hạn batch theo danh sách 1–500 contact và một công ty, kiểm lại quyền/người nhận/đầu vào trước ghi, bỏ broadcast thông tin khách, giữ liên kết hội thoại và bổ sung đối soát trên giao diện khi một phần đã xử lý. Local54 ca mới (43 backend +11 UI) và183 regression =237 PASS. Đã thêm9 ca PostgreSQL cô lập; CI, browser và review cuối chưa có kết luận cho delta này.

[Hợp đồng, bằng chứng và giới hạn](vpt-marketing-automation/LEGACY_BATCH_CREATION.md). Source-backfill còn OPEN; chuỗi HTTP chưa nguyên tử, còn đối soát dữ liệu ghi một phần và chuyển luồng. AI/cấu hình/lịch/người nhận, UAT toàn tuyến và Founder release còn chờ. Full goal ACTIVE; chưa đổi dữ liệu thật, phát hành hoặc chứng minh mục tiêu250k.

---

## 04/10/2026 — Rà batch: cần sửa trước nghiệm thu toàn tuyến

Founder hỏi bước tiếp. Mục tiêu giữ nguyên: Facebook → CRM → khảo sát → dashboard, tạm đo 250.000 đồng/khách trả phí hợp lệ. Không đổi hạn mức hoặc mở kênh từ lần kiểm trạng thái này.

Reviewer độc lập kết luận **HOLD cho hai route batch tại `5356e185871caad7e0473842580ada7f91e5506e`**: thiếu giới hạn công ty/quyền hiện hành, có thể ghi đè nguồn và liên kết hội thoại, ghi số điện thoại trước kiểm phạm vi, broadcast thông tin khách tới mọi kết nối. Giao diện xác nhận danh sách đang xem nhưng không gửi danh sách đó; lỗi đọc/ghi và kết quả liên kết hồ sơ cũ có thể bị báo sai. Đây là kết quả rà mã, chưa có bản sửa hoặc kiểm thử mới. [Finding và tiêu chí khép](vpt-marketing-automation/LEGACY_BATCH_SCOPE_REVIEW.md).

Thứ tự tiếp: sửa hai route và giao diện theo phạm vi đã xác nhận → kiểm thử lỗi/quyền và review độc lập → khép chuyển luồng, bảo toàn lịch sử và cấu hình AI/lịch/người nhận → nghiệm thu trọn tuyến và trình Founder gói phát hành. PASS creator trước đó vẫn chỉ áp dụng phạm vi đã kiểm. Full goal ACTIVE; chưa phát hành, đổi dữ liệu thật hoặc có kết quả 250.000 đồng thực tế.

---

## Hiện hành 04/10/2026 — Phạm vi tạo khách Facebook đã qua review và PostgreSQL

Runtime `925cae0687623dc4654b81f461eb5d88dedece3b` khóa công ty Page hiện hành, Customer/Lead, quyền người nhận và actor; nguồn không bị đổi công ty; cấu hình pipeline lỗi không được tự đổi tuyến; giữ liên kết hội thoại. Local66 mới +117 regression =183 PASS. PostgreSQL281/0/0 gồm10 ca mới; Node22 843+26+183, cả10 job/build/report/Messenger SUCCESS. Reviewer độc lập đối chiếu published blobs và CI, kết luận PASS đúng phạm vi creator. [Bằng chứng, giới hạn và hoàn tác](vpt-marketing-automation/LEGACY_CREATOR_SCOPE.md).

Bước tiếp: source-backfill/caller cũ và dừng/chờ khi chuyển luồng, đối soát hồ sơ ghi một phần; CRM merge/bảo toàn lịch sử và lựa chọn Founder về liên kết/gộp vẫn OPEN. Sau đó khép AI/lịch/người nhận/phạm vi đo, UAT toàn tuyến và Founder release. Full goal ACTIVE, chưa DB/model/provider/chi quảng cáo hoặc phát hành; chưa chứng minh250k thực tế. Các mục dưới là lịch sử.

---

## Hiện hành 04/10/2026 — Đang khép phạm vi tạo khách Facebook

Bản làm việc trên a102450 sửa creator tự động/thủ công: công ty Page hiện hành, Customer/Lead cùng phạm vi, người nhận còn quyền, nguồn không bị đổi công ty, cặp pipeline/stage và giữ liên kết hội thoại. Local 66 ca mới + 117 regression = 183 PASS. Đã bổ sung 10 ca PostgreSQL; CI và review độc lập đang chờ. [Hợp đồng, kiểm thử, giới hạn và hoàn tác](vpt-marketing-automation/LEGACY_CREATOR_SCOPE.md).

Chuỗi HTTP cũ chưa là một giao dịch nguyên tử; CRM merge/bảo toàn lịch sử, cutover, cấu hình AI/lịch/người nhận, nghiệm thu và Founder release vẫn OPEN. Full goal ACTIVE. Chưa dữ liệu thật, quyền AI, chi quảng cáo hoặc phát hành. Các mục dưới là lịch sử.

---

## 04/10/2026 — Sửa caller quét điện thoại và các finding độc lập

Reviewer độc lập khép **PASS phạm vi phone tại5a3acc6** sau tự đọc CI cuối, đối chiếu GitHub/runtime blob và test cohort. Khác CRLF giữa working tree và blob đã chuẩn hóa không đổi nội dung. Các finding CRM merge/company/cutover giữ OPEN.

Khép lượt kiểm tại5a3acc6/tree06d78fa: automation37139914912 cả10job SUCCESS, intake111252015520264/0/0 gồm ca211 và6phonePASS; census88+HTTP1, Node22 843+26+67, Node18/build/report37139914917/Messenger37139914914SUCCESS. CImerge dad7eff66 có đúng tree và parents base+5a3acc6. Review độc lập xác minh lỗi fixture unlinkedProofs do bằng chứng now−1giờ vừa lọt kỳ đóng theo ngàyVN, đồng ý đo delta và giữ quyền/ẩn dữ liệu. [Bằng chứng đúng phiên bản](vpt-marketing-automation/LEGACY_PHONE_REPAIR.md). Các đoạn sau lưu tiến trình; cutover/CRM merge/creator company còn OPEN.

Published runtime119491e/tree00a28ab; review mã PASS và local77/0/0. CI37139607314 cả9job còn lại/report/Messenger PASS, intake111251124860 fail ca211 cũ (unlinkedProofs toàn kỳ3 vs test1) nhưng6ca PG mới257–262PASS. CImerge bd4dee9f có tree đúng runtime/parents. Sửa test cohort lấy baseline rồi kiểm tăng chính xác1 sau đổi công ty Lead; giữ booked/paid2→1 và không lộ title. Runtime không đổi; đang kiểm lại CI và review riêng test. Không coi lần CI fail là nghiệm thu hoàn tất.

Sửa `facebookInboundPhoneReconcile.js`, `facebookLegacyContactWrites.js`, `routes/facebook.js`; thêm `facebookLegacyPhoneRepair.test.js` và6 ca actual helper PostgreSQL trong `careLegacyWrite.cases.js`; workflow đưa các file/test mới vào regression. Không thêm migration.

Đã giới hạn company actor trước tenant-wide membership, đọc Page owner hiện hành, chặn admin HST thiếu tenant; kiểm all IDs trước quality apply, intersection page_id; checked reads/writes và final round chỉ nhận ID của nhóm chọn. Review phát hiện MID khóa chưa lưu và history cap vẫn có thể dẫn tới cleanup: sửa kiểm row đúng contact, trạng thái partial, số tin đã lưu trước lỗi và cửa sổ501/801 chặn kết luận không có số.34 ca mới local PASS. PostgreSQL và review cuối chưa chốt tại thời điểm ghi; [hợp đồng/hoàn tác](vpt-marketing-automation/LEGACY_PHONE_REPAIR.md).

Giữ finding CRM merge quyền/FK và manual/automatic creator company OPEN, không coi gói này hoàn tất cutover. Chưa DB/Meta/model/budget thật, merge hoặc release; full goal ACTIVE. Phiên trước chủ yếu kiểm trạng thái, nay có thay đổi mã và ca hồi quy trực tiếp khép các đường lỗi đã xác minh.

---

## 03/10/2026 — Trả lời bước tiếp và ghi nhận audit mở rộng

Đọc CURRENT/DECISIONS, đối chiếu HEAD `a972c030e5065d3d8d8135d4ee22e59a87c9d160` và 3 file local đang sửa: `backend/src/helpers/facebookInboundPhoneReconcile.js`, `backend/src/helpers/facebookLegacyContactWrites.js`, `backend/src/routes/facebook.js`. Không thay đổi mã thêm trong lần kiểm trạng thái này.

Reviewer độc lập `/root/architecture_v11_review` trả CHANGES_REQUESTED cho cutover: vòng batch/final-round thiếu preflight/phạm vi; phone-quality/date-scan và CRM merge/cleanup thiếu quyền actor; đọc lỗi có thể dẫn tới cleanup; lỗi chuyển FK bị bỏ qua trước xóa nguồn. Finding reconcile đang sửa chưa có review kết luận. Rà tiếp route reconcile và pipeline cho thấy Graph lỗi vẫn có thể đi tiếp sang trích/đối soát; cần ca hồi quy và sửa trước nghiệm thu. Có đường HTTP/timer trong mã không đồng nghĩa đã bật trong vận hành.

Chạy lại `facebookLegacyWriteScope.test.js`, `facebookWebhookRecovery.test.js`, `facebookLeadIntake.integration.test.js`: **43 PASS/0 FAIL/0 SKIP**; cú pháp cả 3 file local và diff check bỏ khác biệt CRLF PASS. Đây là regression hiện có, không chứng nhận delta đối soát điện thoại, PostgreSQL mới, cutover hoặc UAT. CURRENT cập nhật giới hạn và thứ tự tiếp tục. Không tác động DB/Meta thật, gọi model, thay ngân sách, merge hoặc phát hành; full goal ACTIVE.

---

## 03/10/2026 — Kiểm đường ghi cũ; sửa target phát hiện muộn và đọc lỗi

Đã kiểm runtime9cdfe7d/treeaf25883: intake PostgreSQL258/0/0 gồm14ca mới244–257, census88+HTTP1, Node22 843+26+33 PASS, cả10job/build/report/Messenger SUCCESS. CImergea620f9ce có tree bằng runtime, parentsbasee16c885+9cdfe7d. [Bằng chứng đúng phiên bản](vpt-marketing-automation/LEGACY_WRITE_PREFLIGHT_REVIEW.md). Reviewer độc lập đối chiếu4 blob và log CI, PASS phạm vi preflight/SQL682; cutover toàn bộ vẫn HOLD. Các đoạn dưới lưu tiến trình trước kiểm thử.

Tiếp tục: bổ sung14 ca PostgreSQL `careLegacyWrite.cases.js` và runner, gồm ACL, inactive/direct/inverse/shared/source-only/message-only/Customer receipt/comment, request không hợp lệ, graph cycle/limit, enrollment chờ khóa, trigger/isolation, actual helpers và không tạo permit. SQL682 thêm Lead→Page từ comment theo schema42. Chưa chạy CI tại thời điểm ghi mục này; review delta đã giao độc lập. Không tác động DB thật.

Bản làm việc trên HEADa4da197: thêm SQL682 và helpers facebookLegacyWriteScope/facebookLegacyContactWrites; cập nhật facebook.js, cleanup helper, CRM merge/duplicate, cron server và script rescan để kiểm trước mutation. Reviewer yêu cầu P1 target tìm thấy sau phone/PSID/refresh và P2 lịch sử message/Lead Ads Customer; đã sửa mã, review lại đang chờ. Cleanup không còn dùng count lỗi/null như0. Không khẳng định giao dịch nhiều HTTP nguyên tử hoặc cutover hoàn tất.

Thêm26 ca facebookLegacyWriteScope actual helper/function/handler; cập nhật dependency fixture facebookWebhookRecovery, giữ assertion ACK/retry. Cùng intake integration43PASS/0FAIL/0SKIP local; reviewer độc lập tự chạy43/43 PASS và khép hai finding về mã, không còn finding chặn trong delta. Workflow thêm test/trigger. Syntax10 file JS và diff check có tính CRLF PASS. SQL682 chưa chạy PostgreSQL/CI; bản sửa chưa commit, cutover vẫn HOLD. [Hồ sơ](vpt-marketing-automation/LEGACY_WRITE_PREFLIGHT.md). CURRENT cập nhật đúng trạng thái; chưa DB thật/model/provider/budget/release, full goal ACTIVE.

---

## 03/10/2026 — Đã kiểm giao diện đối chiếu và yêu cầu chưa rõ kết quả

Runtime8f42595/tree642d6628: PostgreSQL244/0/0 gồm11ca mới, census88+HTTP1, Node22 843+26 và10job/build/report/Messenger SUCCESS. CImerge01ad39a2 được xác minh tree bằng runtime. Reviewer độc lập PASS SQL681/API/UI sau khép hai P2; browser component thật/API giả xác nhận LINK/CLOSE qua reload và phạm vi người/hội thoại. [Bằng chứng đúng phiên bản](vpt-marketing-automation/CARE_CONNECTION_CONSOLE_REVIEW.md). Chưa UAT/đường ghi cũ/DB thật/phát hành; full goal ACTIVE.

---

## 03/10/2026 — Tiếp tục giao diện đối chiếu và yêu cầu chưa rõ kết quả

Thay đổi trên HEAD1dce6d2: SQL681, careConnections service/routes, CareConnections component/state và tích hợp console; thêm15 unit/API/state ca (26 cùng11 cũ),11 PG ca chưa chạy, cập nhật runner/workflow. Hai P2 review tenantNULL và mapping chưa đầy đủ đã sửa bằng cùng policy tenant và `mappingComplete`; version document SQL680 giữ nguyên. Local26 PASS, kiểm syntax/diff; chưa PostgreSQL681/browser/build hoặc review cuối, chưa commit/DB thật/phát hành.

[CARE_CONNECTION_CONSOLE.md](vpt-marketing-automation/CARE_CONNECTION_CONSOLE.md) lưu hợp đồng, phần còn chờ, hoàn tác và bản đồ đường ghi cũ từ review độc lập. Tiếp theo kiểm PostgreSQL/browser, review đúng phiên bản và khép ứng dụng cũ trước enrollment. Full goal ACTIVE,250k là mục tiêu chưa phải kết quả thực tế.

---

## Hiện hành 03/10/2026 — Đã kiểm điểm nối khách và hành trình khảo sát

Runtime b4e2def nối Lead mới từ intake với hội thoại bằng xác nhận có bằng chứng; bảo vệ đường cũ và liên kết phục hồi. Ca giả đi qua actual API, xác nhận lịch, bàn giao và cohort; tổng chi giữ cả tài khoản không tạo khách. Sửa lỗi timestamp SQL→API khiến giao diện không tạo được đề xuất; yêu cầu đã lưu giữ nguyên khi retry.

Review độc lập PASS phạm vi SQL/API và ca giả. Local42; PostgreSQL intake233/0/0 (11ca mới), census88/0/0+HTTP1/0/0, Node22 843+11 PASS; cả10job/build/report/Messenger SUCCESS. [Bằng chứng](vpt-marketing-automation/CARE_CONNECTION_REVIEW.md), [hợp đồng và phần còn thiếu](vpt-marketing-automation/CARE_CONNECTION_ACCEPTANCE.md).

Full goal ACTIVE. Tiếp theo hoàn thiện giao diện liên kết, chuyển đường gọi ứng dụng cũ và ngoại lệ/khôi phục; cấu hình AI/lịch/người nhận, các điểm nhận/kênh khác, đủ phạm vi đo và UAT/Founder release vẫn còn. Chưa chứng minh đạt250k bằng dữ liệu thật hoặc phát hành. Các mục dưới là lịch sử.

---

## 03/10/2026 — Đang khép điểm nối Messenger với Lead

Rà toàn tuyến phát hiện Lead Ads và hội thoại Messenger chưa có điểm nối danh tính được nghiệm thu; các ca khảo sát trước tạo sẵn liên kết. SQL680/API là bản làm việc chưa commit trên HEAD14e11d5, tắt mặc định, chưa áp DB. Local11 ca adapter PASS; đã sửa khóa quyền người phát hành và khách thiếu số điện thoại theo review. PostgreSQL, giao diện và kiểm xuyên tuyến chưa chạy cho điểm nối mới.

Review runtime HOLD: còn thứ tự khóa của RPC cũ SQL639 và liên kết phục hồi qua facebook_contact_id. Khép hai điểm này, kiểm PostgreSQL rồi kiểm một khách mới từ intake qua lịch khảo sát đến dashboard, giữ đúng Lead ID và đủ chi tiêu. [Hiện trạng, tiêu chí và bước tiếp](vpt-marketing-automation/CARE_CONNECTION_ACCEPTANCE.md). Full goal ACTIVE; chưa dữ liệu thật đạt250k hoặc phát hành. Bằng chứng phần đề xuất lịch bên dưới thuộc phiên bản trước.

---

## Hiện hành 03/10/2026 — Đề xuất lịch đã kiểm chứng

Bản46c680b hoàn thiện màn hình chọn giờ trống, tạo đề xuất và đối chiếu yêu cầu cũ qua tải lại; lịch sử tách đề xuất/gửi/đặt/thông báo. Tin chưa rõ kết quả chặn tạo mới; quyền và liên kết khách được kiểm lại, STOP không tự mở chăm sóc.

Review độc lập PASS; local30, intake PostgreSQL222/0/0, census88/0/0 +HTTP1/0/0, Node22 842/0/0, cả10job/build/report/Messenger SUCCESS. Browser StrictMode/API giả đã kiểm mất phản hồi, reload, STOP, phạm vi, TTL và phản hồi muộn. [Bằng chứng](vpt-marketing-automation/SURVEY_PROPOSAL_CONSOLE_REVIEW.md), [hợp đồng/hoàn tác](vpt-marketing-automation/SURVEY_PROPOSAL_CONSOLE.md).

Full goal ACTIVE. Tiếp theo nghiệm thu xuyên tuyến Facebook→CRM→khảo sát→dashboard, hoàn thiện ngoại lệ gửi/lịch và chuyển đường lịch cũ; cấu hình AI/lịch/người nhận, điểm nhận khác, khôi phục và Founder release còn chờ. Chưa dữ liệu thật đạt250k hoặc phát hành. Các mục dưới là lịch sử.

---

## 03/10/2026 — Đề xuất lịch qua kiểm dữ liệu; sửa bộ quan sát kiểm thử

Runtime963e862 đạt intake PostgreSQL222/0/0 (8ca mới), Node22 842/0/0 và build. Census regression cũ thất bại vì observer trong transaction giữ snapshot pg_stat_activity; thêm pg_stat_clear_snapshot trước mỗi poll và thời hạn5 giây, giữ nguyên điều kiện Lock cùng assertion không ghi. Không đổi runtime hoặc quyền. Browser StrictMode và mất phản hồi/reload/retry đã xác nhận hoạt động; đang hoàn tất CI/review. Full goal ACTIVE, chưa UAT/phát hành.

---

## 03/10/2026 — Màn hình đề xuất lịch đang nghiệm thu

SQL679/API/UI bổ sung tìm giờ trống, tạo đề xuất, lưu yêu cầu để đối chiếu khi mất phản hồi và lịch sử tách gửi/đặt/thông báo kết quả. Chặn đề xuất mới nếu còn tin đang gửi hoặc chưa rõ kết quả; replay phải giữ nguyên yêu cầu và kiểm quyền/phạm vi hiện hành. Giờ lịch sử không thay thế lịch hiện hành ở hồ sơ bàn giao.

Local30 ca liên quan PASS (14 mới). Đã sửa P2 StrictMode từ review và tách fixture QUEUED khỏi lượt drain của ca booking. PostgreSQL/browser/review cuối đang chờ. [Hợp đồng và hoàn tác](vpt-marketing-automation/SURVEY_PROPOSAL_CONSOLE.md). Full goal ACTIVE; còn cấu hình AI/lịch/người nhận, điểm nhận và kênh khác, UAT và Founder release. Chưa phát hành hoặc dữ liệu thật đạt250k.

---

## Hiện hành 03/10/2026 — Xác nhận phạm vi CPQL đã kiểm chứng

Runtime960086c nối bằng chứng đích quảng cáo lịch sử, đúng tệp nguồn, toàn bộ chi tiêu và khách hợp lệ vào kết quả có phạm vi. Phép thử 1 triệu/4 khách =250.000đ giữ cả tài khoản không tạo khách. Có thu hồi, retry lịch sử, kiểm quyền sau chờ khóa và rollback khi nguồn đổi; không mở quyền chi.

Review độc lập PASS. Local24 ca mới/63 ca liên quan; PostgreSQL88/0/0 (10 ca mới), HTTP1/0/0, Node22 808/0/0, cả10job/build/report/Messenger SUCCESS. Browser dữ liệu giả kiểm mất phản hồi→reload→đúng/sai tệp→retry, stale/current, đổi người và thu hồi trong màn hình report lỗi. [Bằng chứng đúng phiên bản](vpt-marketing-automation/SCOPE_ACCEPTANCE_REVIEW.md), [hợp đồng/hoàn tác](vpt-marketing-automation/SCOPE_ACCEPTANCE.md).

Full goal ACTIVE. Còn các điểm nhận chưa nối, quy thuộc khảo sát/chờ xử lý theo nhóm quảng cáo, thiết lập AI/lịch/ngoại lệ và UAT/Founder release. Chưa dữ liệu thật đạt250k, chưa chứng minh toàn bộ Meta/đa kênh, chưa phát hành. Các mục dưới giữ lịch sử.

---

## 03/10/2026 — Xác nhận phạm vi CPQL đang kiểm chứng

SQL677/API/UI nối bằng chứng đích quảng cáo lịch sử, tệp nguồn đã đối soát và toàn bộ chi tiêu với khách hợp lệ; kết quả 250k chỉ áp dụng phạm vi đã xác nhận. Có thu hồi, retry bất biến, kiểm quyền sau chờ khóa và rollback khi nguồn đổi. Không mở quyền chi hoặc kết luận toàn bộ kênh.

Local24 ca mới /63 ca liên quan PASS. Hai P2 từ review (metadata chiến dịch và quyền sau chờ khóa) đã sửa; đang kiểm PostgreSQL/build/browser và review cuối. [Hợp đồng/hoàn tác](vpt-marketing-automation/SCOPE_ACCEPTANCE.md). Full goal ACTIVE; chưa dữ liệu thật/UAT/phát hành. Các mục dưới giữ lịch sử.

---

## Hiện hành 03/10/2026 — Đối soát quảng cáo đã phân phối được kiểm chứng

Runtime02f164b nối collector ad/day và account daily/all_days trước/sau vào cùng giao dịch lưu chi tiêu. Dashboard giữ quảng cáo chi bằng0 có tín hiệu và mã ad có trong nguồn khách nhưng chưa thấy trong delivery. Kỳ collector mới kết thúc hết hôm qua theo giờ Việt Nam; lỗi phân trang hoặc số liệu thay đổi không được công bố thành công.

Review độc lập PASS; local24ca mới/103ca liên quan, PostgreSQL78/0/0 (7ca mới), HTTP1/0/0, Node22 784/0/0 và cả10job/build/report/Messenger SUCCESS. [Bằng chứng đúng phiên bản](vpt-marketing-automation/ACCOUNT_DELIVERY_REVIEW.md), [hợp đồng và hoàn tác](vpt-marketing-automation/ACCOUNT_DELIVERY.md).

Full goal ACTIVE. Bước tiếp: dùng delivery witness + registry + source exports để chấp nhận bằng chứng đích lịch sử/nguồn xuất và trả CPQL có phạm vi ngay trong cùng luồng; không thêm một lớp snapshot. Còn các điểm nhận khác, AI/lịch/ngoại lệ và UAT/Founder release. Chưa full CPQL/đạt250k, chưa tác động Meta/DB thật hoặc phát hành. Các mục dưới giữ lịch sử.

---
## 03/10/2026 — Đối soát phân phối đã qua PostgreSQL; sửa theo review

Candidate97a9a2f đạt cả10job/build và report/Messenger. Review độc lập phát hiện paging sai kiểu có thể bị hiểu nhầm là hết trang; đã từ chối và bổ sung6regression. Worker delivery cũng chốt tới hết hôm qua theo giờ Việt Nam, giữ đúng phạm vi run thay vì bị số hôm nay biến động làm hỏng kỳ đã khép. Thêm PG concurrent spend/witness snapshot.

Local24ca mới,103ca liên quan PASS. Đang kiểm CI/review bản sửa cuối; [hợp đồng và đường tiếp tới acceptance/CPQL](vpt-marketing-automation/ACCOUNT_DELIVERY.md). Full goal ACTIVE, chưa phát hành/Meta thật/đạt250k.

---
## 03/10/2026 — Đối soát quảng cáo đã phân phối đang kiểm chứng

SQL676 nối collector ad/day và account daily/all_days trước/sau vào cùng lần lưu chi tiêu. Dashboard giữ cả quảng cáo chi bằng0 có tín hiệu và mã ad từ hồ sơ khách chưa thấy trong delivery; không dùng creative hiện tại để xác nhận đích lịch sử. Quyền hiện hành, retry bất biến và rollback nguyên giao dịch vẫn bắt buộc.

Local17ca mới và79ca liên quan PASS. PostgreSQL/build/review độc lập đang chạy. [Hợp đồng, giới hạn và bước đi thẳng tới chấp nhận phạm vi/CPQL](vpt-marketing-automation/ACCOUNT_DELIVERY.md). Full goal ACTIVE. Chưa full CPQL/đạt250k, không tác động Meta/DB thật hoặc phát hành. Các mục dưới giữ lịch sử.

---
## Hiện hành03/10/2026 — Bản lưu kết quả đo đã kiểm chứng

Runtimead841ff SQL675/API/UI giữ số tiền/khách, cutoff/asOf, dependencies và nghĩa vụ còn thiếu theo account/Page/form/entrypoint. Lịch sử bất biến, retry không tạo bản mới, dữ liệu đổi được báo riêng; bỏ lease/retry và receipt đã chứng minh ngoài kỳ khỏi fingerprint liên quan. Đây là SAVED_OBSERVED_INCOMPLETE, chưa full measurement close/CPQL hoặc đạt250k.

Review độc lậpPASS. PostgreSQL71/0/0 (11ca mới), HTTP1/0/0, Node22 757/0/0, cả10job/build/report/MessengerSUCCESS. Follow-up test-only bổ sung3ca provenance, local15PASS; runtime giữ nguyên. Browser actualcomponent/APIgiả đã kiểm mất phản hồi, reload, số hiện tại/lịch sử, retry, lỗi nguồn và đổi người khi GETchậm. [Bằng chứng đúng phiên bản](vpt-marketing-automation/MEASUREMENT_SNAPSHOT_REVIEW.md), [hợp đồng/hoàn tác](vpt-marketing-automation/MEASUREMENT_SNAPSHOT.md).

Full goalACTIVE. Còn hợp đồng chấp nhận bằng chứng provenance/phạm vi thực, đủ điểm nhận, đo hoàn chỉnh, ngoại lệ vận hành/AI/lịch và UAT/Founderrelease. Không có tác động thật; mục dưới giữ lịch sử.

---

## 2026-10-03 — Bản lưu kết quả đo đang kiểm chứng

SQL675/API/UI giữ report tính ở server, thời điểm/cutoff, dependencies và danh sách thiếu theo nguồn. Bản lịch sử không tự đổi; retry trả đúng receipt cũ; source fingerprint bỏ lease/retry và receipt đã chứng minh ngoài kỳ. Chưa full measurement close/provenance hoặc CPQL đủ nguồn.

Local12PASS; review đã sửa UUID, smoke độc lậpPASS. Đang chờ PostgreSQL/build/browser và review cuối. [Hợp đồng và giới hạn](vpt-marketing-automation/MEASUREMENT_SNAPSHOT.md). Full goalACTIVE, chưa có tác động thật.

---

## 2026-10-03 — Source export closure

Runtime920e66bc tree dbb986a3; reviewer độc lập PASS local24. Automation37112179618 all10SUCCESS; census111172074851 PG60/0/0 +HTTP1/0/0; Node22 111172074887=745/0/0; build111172074765=10318modules/28.97s. Report37112179600/Messenger37112179556SUCCESS. Merge1ced58499b20ad255f6555cde077afec5608af0d có cùng tree, parentruntime+basee16c885. Browser tác giả kiểm lost-response/reload/stale/retry/sourceerror; tab/server đóng. Hồ sơ SOURCE_EXPORT_REVIEW.md; closure chỉdocs, full goalACTIVE, chưa Meta/UAT/phát hành/CPQLđầyđủ.

## 2026-10-03 — Source export: kiểm biên nhận lịch sử và giới hạn HTTP

Candidate36793fbc cả10jobSUCCESS, censusPG59/0/0, Node22 743/0/0, frontend10.318module. Review backend/SQLPASS. Follow-up: UI ghi rõ biên nhận sau replay là lịch sử, reset đọc tệp khi reload; thêm kiểm Express2mb nhận CSV1MiB và từ chối thêm1byte, thêm barrier PG khi receipt tới sau comparison nhưng trước append. Local24PASS; browser lost-response→reload→stale đang kiểm. Chưa phát hành/đủnguồn/CPQL, full goalACTIVE.

---

## 2026-10-03 — Đối soát bản xuất nguồn đang kiểm chứng

SQL674 nối witness và digest tuple đúng cutoff vào snapshot, thêm so sánh CSV nguồn với tập quét theo ID/time/form, append-only evidence+audit, replay và invalidation khi receipt/source/phạm vi đổi. Server hash bytes, bỏ cột PII trước DB; UI chỉ giữmetadata/hash để retry. Local22 PASS; đang chờ PostgreSQL/browser/review. [Hợp đồng/hoàn tác](vpt-marketing-automation/SOURCE_EXPORT.md). MATCHED không là completeness/CPQL/quyền chi. Full goalACTIVE, chưa live effects.

---

## 2026-10-03 — Operations dashboard closure

Runtime9c317310, treea708cac6; review độc lập PASS local24. Automation37109400042 all10 SUCCESS; intakePG111164221888=208/0/0; Node22 111164221873=721/0/0; frontend111164221891=10316modules/30.12s. Merge3d0e84813352f4c330861e59381cbd9310648612 có cùng tree, parentcandidate+basee16c885. Report37109400035/Messenger37109400033SUCCESS. Tác giả kiểm browser component thật/API giả8tình huống, đóng tab/server. Hồ sơ OPERATIONS_DASHBOARD_REVIEW.md giữ cả failurecandidate551046c và giới hạn CSS giản lược. Docs-only closure, full goalACTIVE, không live effects.

## 2026-10-03 — Operations dashboard: đóng hai phát hiện review

Sửa projection để lịch changed/thiếu end_time là ngoại lệ thay vì gây503; unique waiting bao gồm union CARE+SURVEY, STOP vẫn giữ booking. Ràng buộc booking vào thread cùng lead/scope. Local24 PASS. Candidate551046c PostgreSQL chỉ lỗi3 assertion mới về vị trí trong danh sách50; đổi sang kiểm biến động aggregate, thêm NULL/infinity. Chờ CI/browser/review cuối, không thay production hoặc mở quyền.

## 2026-10-03 — Dashboard tư vấn/khảo sát đang kiểm chứng

SQL673/API/UI thêm số liệu vận hành toàn công ty từ hội thoại Messenger và lịch khách xác nhận qua hệ thống, độc lập kỳ quảng cáo. Snapshot một câu lệnh dùng identity/handoff projection hiện có, che mapping ngoại công ty, tách hội thoại/nhóm CRM/lịch và ngoại lệ. STOP không xóa booking; ACK không phải hoàn tất khảo sát. Không thêm gửi tin/ghi lịch/quyền chi.

Local22 unit/service/UI-state PASS. PostgreSQL/build/browser/review đang chờ; [phạm vi/hoàn tác](vpt-marketing-automation/OPERATIONS_DASHBOARD.md). Full goal ACTIVE, chưa UAT/phát hành/đạt250k.

---

## Hiện hành03/10/2026 — Đã kiểm chứng nhật ký trang Facebook

Runtime d89e34ba thêm SQL672 ghi witness từng trang nguyên giao dịch với receipt/observation/cursor, chuỗi hash/ordinal, giờ lease DB, một Graph version yêu cầu và phát hiện lịch sử thiếu. Summary trong API trạng thái cùng snapshot; không thay UI, không chứng minh Meta đủ/CPQL/quyền chi.

Review độc lập PASS; local29, censusPG50/0/0 (9ca mới), Node22 697/0/0, cả10job/build và report/Messenger SUCCESS. [Bằng chứng đúng phiên bản](vpt-marketing-automation/CENSUS_WITNESS_REVIEW.md), [hợp đồng/hoàn tác](vpt-marketing-automation/CENSUS_WITNESS.md).

Full goal ACTIVE. Tiếp tục đối soát phạm vi/tập ID thực và chốt kỳ có bằng chứng, lịch/chờ xử lý, các nghĩa vụ AI/vận hành/UAT/Founderrelease. Chưa dữ liệu Meta thật hoặc đạt250k, chưa phát hành. Các mục dưới giữ lịch sử từng phiên bản.

---

## 2026-10-03 — Nhật ký trang dữ liệu Facebook đang kiểm chứng

SQL672 thêm bằng chứng từng trang được collector chấp nhận, nguyên giao dịch với receipt/observation/cursor. Có giờ lease từ DB, chuỗi cursor đã băm, metadata whitelist, Graph version chung, ID duy nhất/lần xuất hiện và phát hiện prefix lịch sử thiếu. Summary của status cùng snapshot, không nâng kết luận bao phủ provider hoặc CPQL. [Hợp đồng và giới hạn](vpt-marketing-automation/CENSUS_WITNESS.md).

Đang chờ PostgreSQL cô lập/review độc lập; không migration thật, Meta/CRM, chi tiền hoặc phát hành. Full goal ACTIVE. Kế tiếp đối soát phạm vi/bản xuất và chốt kỳ, lịch/chờ xử lý, nghiệm thu tuyến đầu.

---

## Hiện hành 03/10/2026 — Đã kiểm thử số chi phí/khách tạm tính

Candidatea8b2f9f hiển thị chi toàn tài khoản / khách Lead Ads đã xác minh và đối soát cùng kỳ, có positive1m/4=250k. Số này được ghi tạm tính; chưa khẳng định toàn đợt đạt mục tiêu. Mâu thuẫn nguồn loại nhóm khỏi khách đạt; thiếu dữ liệu hoặc nguồn/quyền đổi ẩn số; không có khách đạt không trả0đ. Cảnh báo bao phủ vẫn giữ riêng. Không migration mới.

Independent review PASS. Local105, Node22 673, censusPG30 (4ca mới), cả10job/fullbuild và report/Messenger SUCCESS. Browser actualcomponents với API giả đã kiểm6trạng thái. [Bằng chứng đúng phiên bản](vpt-marketing-automation/OBSERVED_CPQL_REVIEW.md), [hợp đồng](vpt-marketing-automation/OBSERVED_CPQL.md).

Full goal ACTIVE. Còn registry/provider coverage, measurement close, lịch/chờ xử lý, Meta/UAT/Founderrelease và các nghĩa vụ vận hành đã ghi. Không mở chi hay phát hành;250k chưa phải kết quả kinh doanh thật. Các mục sau giữ lịch sử theo phiên bản.

---

## 2026-10-03 — Chi phí/khách đã đối soát, tạm tính (đang kiểm chứng)

Thêm observedMeasurement từ cùng snapshot: toàn bộ chi tài khoản / khách Lead Ads đã xác minh và đối soát. Có positive1m/4=250k, giữ riêng với CPQL đầy đủ và không kết luận đạt mục tiêu/mở chi. Tách lỗi hồ sơ khỏi cảnh báo bao phủ; mâu thuẫn nguồn không còn được giữ là khách đạt. UI ghi rõ phạm vi và ẩn số thiếu dữ liệu. Không migration mới.

Local105 domain/UI-state tests PASS. PostgreSQL/build/independent review đang chờ. [Hợp đồng, giới hạn và hoàn tác](vpt-marketing-automation/OBSERVED_CPQL.md). Full goal ACTIVE; registry/provider completeness, lịch/chờ xử lý, Meta/UAT và phát hành còn phải hoàn thiện.

---

## Hiện hành 03/10/2026 — Đã kiểm thử mốc đo tiền và khách

Candidate5076b2a dùng cùng kỳ ngày Việt Nam hoàn tất cho chi tiêu và khách; khôi phục khách bị sót vẫn đến lúc bắt đầu quét, kể cả ngày đầu. Giữ metadata ngoài kỳ để đối soát webhook tới muộn, không bỏ mâu thuẫn nguồn. Dashboard tách mốc khôi phục/mốc đo và không hiển thị số0 khi chưa có ngày hoàn tất.

Review độc lập PASS trong phạm vi này. Census PostgreSQL26, trial PostgreSQL13, Node22 643, cả10 job/build và report/Messenger regressions PASS; local143 PASS. Browser bằng API giả đã kiểm kỳ đo, ngày đầu, mâu thuẫn và lỗi nguồn. [Bằng chứng đúng phiên bản](vpt-marketing-automation/MEASUREMENT_PERIOD_REVIEW.md), [hợp đồng](vpt-marketing-automation/MEASUREMENT_PERIOD.md).

Tiếp theo phải hoàn thiện registry phạm vi + provider coverage và close có bằng chứng để tính CPQL, nối lịch/chờ xử lý vào dashboard, rồi UAT và gói phát hành. Chưa chứng minh250.000đ/khách, chưa Meta/CRM thật; full goal ACTIVE. Các mục dưới đây là lịch sử theo phiên bản.

---

## 2026-10-03 — Distinguish receipt review from contradictory evidence

90b1068 passed9/10 jobs: trialPG, build and all new9 census period cases PASS. CensusPG111139822196 failed1 existing concurrent-state case because a REVIEW receipt with matching proof/observation was classified as a timestamp conflict. Source consistency is now checked independently of receipt processing state; REVIEW stays review-required, while true timestamp conflicts remain explicit. Added unit regression and corrected first-day UI wording to avoid claiming a recovery already succeeded. Final revalidation pending.

---

## 2026-10-03 — Preserve same-day customer recovery

Independent review also found that using the measured cutoff for intake delayed missing today's webhooks. SQL670 now preserves the original recovery until_at and separately stores measurement_until_at. Day-one recovery remains available; its report is NO_CLOSED_DAY. Snapshot filters only measured items while all recovery items/observations stay durable. Added first-day census→real intake→CRM with fake provider, exact cutoff, future trial denial and persisted pre-midnight replay tests. Unit24 period cases PASS; final CI/review pending. Full goal remains ACTIVE, no live effects.

---

## 2026-10-03 — Fix hidden outside-period conflicts

Independent reviewer CHANGES_REQUESTED on efcf783: valid DONE source and census observation could disagree outside the period without an issue. Added CONFLICT disposition and explicit report/reconciliation warnings, regression, and UI labels. Trial PG fixture updated for the new closed-day contract; added historical NULL-policy/partial-day PostgreSQL coverage. Local23 period cases PASS, final CI/review pending. Full goal ACTIVE.

---

## 2026-10-03 — Measurement period alignment

Changed SQL670, report period/receipt projections, spend close guard, census fixtures/tests and dashboard period labels. Whole-account spend includes zero-Lead accounts; one cutoff excludes current-day spend and post-cutoff acquisitions together. Durable outside-period metadata reconciles late receipts without mutating intake state or hiding conflicts. Added22 unit and6 isolated PostgreSQL scenarios; existing lease rollback now also asserts observation rollback. Local140 PASS; CI/review pending. See MEASUREMENT_PERIOD.md. No live writes, merge, deploy, model API or campaign actions.

---

## Hiện hành 03/10/2026 — Thông báo kết quả khảo sát đã kiểm thử

Candidate44d80b1 bổ sung outbox nguyên giao dịch với booking/từ chối nghiệp vụ, thông báo kết quả đúng lịch và hàng rào gửi chung với đề xuất. Không lấy receipt BLOCKED làm kết quả “chưa đặt lịch”; không gửi lại sau mất phản hồi. STOP/tiếp quản giữ nguyên, bằng chứng booking/handoff không bị xóa khi lỗi gửi.

Review độc lập PASS; PostgreSQL199 (20 case outcome mới), Node22 618, cả10 job/full build và regression PASS. [Bằng chứng đúng phiên bản](vpt-marketing-automation/SURVEY_OUTCOMES_REVIEW.md), [contract và giới hạn](vpt-marketing-automation/SURVEY_OUTCOMES.md).

Mặc định tắt, chưa Meta/CRM thật/UAT/phát hành. Còn UI đề xuất/ngoại lệ, hủy/đổi và writer lịch cũ, nội dung/nhân sự/lịch thật, nguồn–chi tiêu và CPQL đầy đủ, hiệu năng/khôi phục. Tiếp theo ưu tiên đối soát khách–chi phí và chuẩn bị nghiệm thu Facebook→CRM→dashboard. Chưa chứng minh250.000đ/khách; full goal ACTIVE, không mở đợt chi.

Các mục sau giữ lịch sử theo phiên bản.

---

## 2026-10-03 — Clarify STOP outcome evidence

Follow-up1647479 passed9 jobs and fixed the obsolete-option case. PG111132283592 (CI37098181276) failed only the new STOP assertion: SQL665 retains a rejected confirmation and SQL669 retains its NOT_BOOKED intent; absence of an intent is not the STOP contract. The case now proves no booking, no provider POST, sticky OPTED_OUT and terminal HELD intent. Runtime SQL/worker remain unchanged. Revalidation pending, no live actions.

---

## 2026-10-03 — Outcome PostgreSQL fixture follow-up

Runtime57fb08b CI37097932808 passed9 jobs; Node22 618 and full frontend PASS. PostgreSQL111131579765 failed one subtest because the replacement-proposal fixture reused an obsolete availability option after confirmation changed context. The fixture now obtains the current option. Added same-batch STOP, recipient-membership revocation while waiting and queue-progress cases. Runtime SQL/worker unchanged; final PostgreSQL/review still pending. No live actions.

---

## 2026-10-03 — Customer survey outcomes (in validation)

SQL669 adds atomic BOOKED / canonical NOT_BOOKED intents, default-off outcome dispatch, current booking/authority checks, shared proposal/outcome uncertainty barrier and exact echo/ACK evidence. Ingress technical BLOCKED never negates a booking. Pre-enrollment intents stay HELD; STOP/takeover remain sticky. Local51 worker/parser tests PASS; isolated PostgreSQL and final independent review pending. [Contract, rollback and remaining gates](vpt-marketing-automation/SURVEY_OUTCOMES.md).

No live migration, enrollment, Meta send, model call, ad change or release. Full goal ACTIVE; actual CPQL250k remains unproven. Still need operator exception UI, cancellation/rescheduling, legacy calendar writer transition, full source/spend data and UAT/Founder release.

---

## Hiện hành 03/10/2026 — Bàn giao khảo sát đã kiểm thử

Runtimea35deef4 thêm màn hình CRM cho nhân viên nhận hồ sơ, queue/chỉ số chờ nhận, hội thoại đầy đủ và ACK đúng người nhận hiện hành. Sales owner/admin theo dõi, không ký thay. Receipt/audit nguyên giao dịch; replay sau mất phản hồi kiểm quyền mới; lịch khách xác nhận, staff ACK và trạng thái chăm khách được giữ riêng.

Review độc lập PASS; PostgreSQL179 (21 case handoff mới), Node22 604, cả10 job/full build và regression PASS. Browser với API giả kiểm đủ55 tin, mất phản hồi/reload, đổi scope, manager, STOP và lỗi quyền/nguồn. [Bằng chứng đúng phiên bản](vpt-marketing-automation/SURVEY_HANDOFFS_REVIEW.md), [contract và giới hạn](vpt-marketing-automation/SURVEY_HANDOFFS.md).

Mặc định tắt, chưa Meta/CRM thật hoặc UAT/phát hành. Còn UI đề xuất/ngoại lệ gửi, thông báo khách, hủy/đổi và writer lịch cũ, dữ liệu thật, nguồn/chi tiêu và CPQL đầy đủ, hiệu năng/khôi phục. Chưa chứng minh250.000đ/khách. Full goal ACTIVE; không mở đợt chi.

Các mục sau giữ lịch sử theo phiên bản.

---

## 2026-10-03 — Survey staff handoff (in validation)

SQL668, default-off authenticated APIs and CRM staff UI add scoped queue/detail/history and atomic receipt by the current recipient. Owner/admin monitoring does not allow proxy ACK; booking RSVP and historical booking result remain separate. Exact pending requests survive browser reload. Initial independent review found null-owner authorization and moved-staff name leakage; both fixed with regression cases.

Local adapter7 PASS. Isolated PostgreSQL, UI/browser and final independent review remain pending. [Contract and rollback](vpt-marketing-automation/SURVEY_HANDOFFS.md). No live migration/send/AI call/ad change or release. Full goal ACTIVE; CPQL250k remains a target, not an observed result.

---

## Hiện hành 03/10/2026 — Gửi đề xuất khảo sát đã kiểm thử

Runtimef82380f nối worker gửi payload bất biến → raw webhook có chữ ký → xác nhận → lịch/handoff. Có claim một lần, cửa sổ inbound24h, deadline ngắn/clock skew, binding credential hiện hành, ACK/echo khớp đúng attempt và hồi phục không gửi lại khi chưa rõ kết quả. STOP và trạng thái người tiếp quản giữ nguyên.

Review độc lập PASS; PostgreSQL158 (21 case dispatch mới), Node22 593, cả10 job/full build và regression PASS. [Bằng chứng đúng phiên bản](vpt-marketing-automation/SURVEY_DISPATCH_REVIEW.md), [phạm vi và cổng còn lại](vpt-marketing-automation/SURVEY_DISPATCH.md).

Provider/HMAC thử được giả lập; positive path dùng worker/receiver thật, không còn owner gán SENT. Enrollment rỗng, cờ tắt, chưa Meta thật/UAT/phát hành. Còn UI khảo sát/ngoại lệ, ACK người nhận, thông báo khách, hủy/đổi và writer cũ, dữ liệu thật và đo CPQL đầy đủ. Chưa chứng minh250.000đ/khách. Full goal ACTIVE; không mở đợt chi.

Các mục sau giữ lịch sử theo phiên bản.

---

## 2026-10-03 — Dispatch PostgreSQL follow-up

Initial runtime b543eaa failed isolated PG run37092625896/job111115988767: recovery SQL reused a record variable as table alias (42702); the test adapter passed JS arrays as PostgreSQL arrays instead of JSON (22P02). Fixed alias and JSON transport fixture, with additional uncertainty/supersession and post-booking conflict cases. Other9 jobs passed, Node22 593. PostgreSQL revalidation remains pending; no live changes.

---

## 2026-10-03 — Controlled survey dispatch (in validation)

Base a07760f. SQL667 adds private, empty dispatch enrollment; one-time immutable send authorization; credential binding; exact ACK/echo correlation; no blind resend after unknown delivery. Default-off worker now sends only prepared survey proposals and reconciles confirmation after ACK in a separate transaction. STOP and human takeover remain sticky.

Local47 worker/care/webhook tests PASS. PostgreSQL and independent review pending; first review found and fixed SQL generation escaping, a shortened deadline/clock-skew fence and stale credential binding. See [contract and remaining gates](vpt-marketing-automation/SURVEY_DISPATCH.md). No live send/enrollment/migration, model call, ad change or release. Full goal ACTIVE.

---

## Hiện hành 03/10/2026 — Nhận xác nhận khảo sát đã kiểm thử

Runtime0a97a85 nối raw webhook có kiểm chữ ký → mã quick reply → receipt riêng → giao dịch đặt lịch; toàn bộ STOP/yêu cầu người/echo chưa rõ trong batch được xử lý trước. Có hồi phục khi ACK đến muộn, giữ kết quả cuối khi worker cũ tiếp tục và tránh hồ sơ chưa ACK làm kẹt hàng chờ. Token khảo sát được bỏ trước đường log/hàng chờ cũ.

Review độc lập PASS; PostgreSQL137 (14 case mới), Node22 580, cả10 job/full build và regression PASS. [Bằng chứng đúng phiên bản](vpt-marketing-automation/SURVEY_CONFIRMATION_INGRESS_REVIEW.md), [phạm vi và phần chưa tích hợp](vpt-marketing-automation/SURVEY_CONFIRMATION_INGRESS.md).

Proof gửi tin còn được DB owner mô phỏng; chưa có dispatcher, nhận diện echo của chính ứng dụng hoặc worker chạy reconcile. Enrollment rỗng, cờ mặc định tắt; chưa gửi/nhận Meta thật, UAT hoặc phát hành. Chưa có CPQL thực tế chứng minh250.000 đồng/khách. Full goal ACTIVE.

Các mục sau giữ lịch sử theo phiên bản.

---

## 2026-10-03 — Signed survey confirmation ingress (in validation)

SQL666 and the opt-in webhook adapter preserve quick-reply confirmation evidence from authenticated raw Meta bytes, process all STOP/human/unknown-echo events before booking, and recover confirmations waiting for a late delivery receipt. Private Page enrollment starts empty. New server RPCs enforce the actual service_role even after broad public-function grants; normalized confirmation commands are not exposed through operator/AI HTTP tools.

Local31 PASS; PostgreSQL and final independent review pending. Review fixes include terminal-result compare-and-set and ready-work recovery to avoid starvation; private tokens are removed before legacy logs/queues after both signed receivers run. [Scope and remaining work](vpt-marketing-automation/SURVEY_CONFIRMATION_INGRESS.md). Delivery proof is still seeded by the isolated DB owner: no outbound dispatcher, own-send echo matching, real Meta send, UAT or release. Full goal ACTIVE.

---

## Hiện hành 03/10/2026 — Lõi đề xuất và đặt khảo sát đã kiểm thử

Runtime243440d bổ sung đề xuất bất biến, kiểm xác nhận gắn đúng khách/lịch và giao dịch chung cho event, participant, audit, xác nhận và hàng bàn giao. Review độc lập PASS; PostgreSQL123 (12 case mới), Node22 574, cả10 job/full build và các regression PASS. [Bằng chứng đúng phiên bản](vpt-marketing-automation/SURVEY_PROPOSALS_REVIEW.md), [phạm vi và phần còn thiếu](vpt-marketing-automation/SURVEY_PROPOSALS.md).

Đây là kiểm thử lõi nghiệp vụ với proof do DB owner mô phỏng, chưa phải xác nhận khách thực tế. Chưa có dispatcher/ingress xác nhận, UI khảo sát hoặc ACK bàn giao; không cấp quyền ứng dụng gọi book. Các đường lịch cũ, nguồn dữ liệu thật, sao lưu/khôi phục và UAT vẫn phải hoàn thiện. Mặc định tắt, chưa phát hành/mở đợt chi; chưa có CPQL thực tế chứng minh250.000 đồng/khách. Full goal ACTIVE.

Các mục sau giữ lịch sử theo phiên bản.

---

## 2026-10-03 — Survey proposal/booking domain (in validation)

Initial PostgreSQL CI on c1dd926 (run 37088378492) failed: local variable qualification in book and a foreign-key-invalid fixture; 9 other jobs passed. Follow-up adds an explicit PL/pgSQL block label, a real conflicting Customer fixture, and millisecond-precision causal checks with a regression case. PostgreSQL revalidation remains pending; no release claim.

SQL665 and the default-off proposal API bind immutable customer/staff/time/location proposals to current CRM/source context. Private book validates receipt/delivery and performs event, attendee, confirmation consumption, audit and pending handoff atomically; public operator/AI APIs cannot mint confirmation or call book. Existing travel buffers remain reserved when a later roster reduces buffer.

Local adapter7 PASS; PostgreSQL and independent code review pending. [Contract and remaining integration](vpt-marketing-automation/SURVEY_PROPOSALS.md). Provider delivery/receipt and signed inbound are simulated by the isolated DB owner in tests: transport, echo correlation, survey UI, handoff acknowledgement, legacy writer transition and real UAT remain required. No live migration/send/book or release. Full goal ACTIVE.

---

## Hiện hành 03/10/2026 — Bảo vệ lịch khi chuyển quyền ghi đã kiểm thử

Runtime7576ecf7 và regressiond242e114 bổ sung vùng điều khiển riêng, enrollment rỗng, permit theo giao dịch và trigger bảo vệ lịch khỏi đường ghi cũ. Đã kiểm cả quyền được công cụ backup cấp lại, participant thay đổi trong lúc UPDATE chờ và snapshot cũ. Review độc lập PASS; PostgreSQL111 (11 guard mới), Node22 567, cả10 job/full build và các regression PASS. [Bằng chứng đúng phiên bản](vpt-marketing-automation/SURVEY_CALENDAR_GUARD_REVIEW.md), [phạm vi và cổng phát hành](vpt-marketing-automation/SURVEY_CALENDAR_GUARD.md).

Chưa có lệnh đặt lịch/xác nhận khách/bàn giao nguyên giao dịch; chưa đăng ký nhân sự thật. Trước cutover cần xử lý báo thành công sai của đường cũ, đo tác động tuần tự hóa lịch và kiểm sao lưu/khôi phục vì REST replication bỏ qua RPC. Không phát hành hoặc mở đợt chi. Chưa có CPQL thực tế chứng minh250.000 đồng/khách. Full goal ACTIVE.

---

## Hiện hành 03/10/2026 — Nguồn giờ khảo sát đã kiểm thử

Runtimec0d07e6 bổ sung nguồn lịch theo nhân sự/khu vực, phạm vi lịch được người có quyền xác nhận và phép kiểm tra bận từ toàn bộ lịch CRM/người tham gia. Các giờ đề xuất có phiên bản và hạn ngắn, không phải lịch đã giữ hoặc đặt. Kiểm thử local9, PostgreSQL100 (13 survey mới), Node22 567, cả10 job/full build và các regression PASS. [Bằng chứng đúng phiên bản](vpt-marketing-automation/SURVEY_AVAILABILITY_REVIEW.md), [phạm vi và giới hạn](vpt-marketing-automation/SURVEY_AVAILABILITY.md).

Mặc định tắt, chưa phát hành. Còn phải xác nhận lịch thực tế, giữ chỗ/giao dịch chung với lịch CRM, xác nhận đúng đề xuất từ khách, chặn tranh chấp với đường ghi cũ và bàn giao có bằng chứng. AI tư vấn/gửi tin, đối soát nguồn/chi tiêu đủ phạm vi và UAT còn việc. Chưa có CPQL thực tế chứng minh250.000 đồng/khách. Full goal ACTIVE; không mở đợt chi hoặc quyền AI.

Các mục sau giữ lịch sử theo phiên bản.

---

## Hiện hành 03/10/2026 — Màn hình nội dung tư vấn đã kiểm thử

Runtime979d62d bổ sung biên tập nội dung, duyệt/thu hồi đúng phiên bản, chọn sản phẩm/khu vực, xem trước nguyên văn và lịch sử đầy đủ. Bản nháp được giữ khi đổi tab hoặc phân trang lỗi; yêu cầu mất phản hồi được gửi lại đúng mã qua tải lại trình duyệt. SQL662 thêm bộ chọn và lịch sử theo quyền hiện hành. Review độc lập code/CI PASS; local20, PostgreSQL87 (4 console mới), Node22 558 và cả10 job/full build PASS. [Bằng chứng](vpt-marketing-automation/CARE_LIBRARY_CONSOLE_REVIEW.md), [kiểm tra trình duyệt và giới hạn](vpt-marketing-automation/CARE_LIBRARY_CONSOLE_BROWSER.md). Riêng accept/dismiss của hộp xác nhận gốc chưa kết luận bằng browser automation, giữ lại cho UAT.

Mặc định tắt, chưa phát hành. Nội dung VPT thật, AI sử dụng/gửi tin, lịch khảo sát, đối soát đủ nguồn/chi tiêu và UAT còn phải hoàn thiện. Chưa có CPQL thực tế chứng minh đạt250.000 đồng/khách; trần100 triệu một đợt30 ngày và80/20 giữ nguyên. Không gọi model, đổi DB thật, cấp quyền duyệt hoặc mở đợt chi. Full goal ACTIVE.

Các mục sau giữ lịch sử theo phiên bản.

---

## Hiện hành 02/10/2026 — Thư viện nội dung tư vấn đã kiểm thử

Runtime880f495 thêm lưu nháp, duyệt/thu hồi nội dung, lịch sử và xem trước nguyên văn theo công ty/sản phẩm/khu vực/kênh. Sửa nội dung, đổi quyền người duyệt, thay đổi nguồn hoặc hết hạn làm mất hiệu lực sử dụng. Không cấp sẵn quyền duyệt hoặc nạp dữ liệu sản phẩm thật. Review độc lập PASS; local9, PostgreSQL83 (14 library), Node22 547 và cả10 job/full build PASS. [Bằng chứng đúng phiên bản](vpt-marketing-automation/CARE_LIBRARY_REVIEW.md).

Mặc định tắt; chưa có UI biên tập, AI sử dụng/gửi tin hoặc lịch khảo sát. Phần kết nối OpenAI chờ lựa chọn khóa riêng; không gọi API trả phí. Nguồn/chi tiêu thực tế và UAT vẫn chưa hoàn tất, chưa xác nhận CPQL250.000 đồng/khách. Full goal ACTIVE; không phát hành hoặc mở đợt chi.

Các mục sau giữ lịch sử theo phiên bản.

---

## 2026-10-02 — Approved customer-facing response library (in validation)

Base af19ea5. SQL661 and authenticated library APIs add scoped draft/approve/revoke/history and exact-text operator preview, with current source/audience/expiry checks. Explicit human publisher enrollment is required and is not seeded; changing content or publisher authorization invalidates prior approval. Local9 tests PASS; PostgreSQL and independent review pending. No model calls or API-dependent code: OpenAI credential selection is pending separately. Editing UI, runtime dispatch and calendar/UAT remain unfinished. See [contract](vpt-marketing-automation/CARE_LIBRARY.md). Default-off; no live change. Full goal active.

---

## Hiện hành 02/10/2026 — Màn hình chăm khách đã kiểm thử

Runtime52741b81 nối tab Facebook → Chăm khách với hàng chờ theo hạn phản hồi, người nhận CRM, lịch sử phân trang đầy đủ và thao tác tiếp quản/ngừng liên hệ. Yêu cầu chưa xác nhận được giữ đúng mã khi mất phản hồi, tải lại trang hoặc đổi công ty. Review độc lập PASS; local27, PostgreSQL69 (9 console mới), Node22 538, cả10 job/full build và trình duyệt dữ liệu giả PASS. [Bằng chứng đúng phiên bản](vpt-marketing-automation/FACEBOOK_CARE_CONSOLE_REVIEW.md).

Mặc định tắt, chưa phát hành. AI tư vấn/gửi tin, lịch khảo sát, dữ liệu nguồn/chi tiêu thực tế và nghiệm thu vận hành còn phải hoàn thiện. Số hội thoại không thay số khách hợp lệ không trùng; chưa kết luận đạt250.000 đồng/khách. Full goal ACTIVE, không mở đợt chi.

Các mục phía dưới giữ lịch sử theo phiên bản.

---

## Hiện hành 02/10/2026 — Nền tiếp nhận và tiếp quản chăm khách đã kiểm thử

Bản73fa7c68 bổ sung hộp thư chăm khách bền vững: xác thực tin nguồn, lưu yêu cầu ngừng liên hệ/gặp người, đối chiếu người nhận CRM và tiếp quản có audit. Review độc lập PASS; local64, PostgreSQL60 (16 care mới), Node22 529 và cả10 job/full build PASS. [Bằng chứng đúng phiên bản](vpt-marketing-automation/FACEBOOK_CUSTOMER_CARE_REVIEW.md).

Page được chọn thử chỉ nhận/rà hội thoại; toàn bộ đường gửi Messenger cũ trong ứng dụng bị chặn trên Page đó. Mặc định tắt và chưa bật thật. Chưa có màn hình vận hành care, AI tư vấn/gửi tin, lịch khảo sát hay nghiệm thu thực tế. Mục tiêu250.000 đồng/khách hợp lệ; chưa có kết quả thực tế chứng minh đạt. Full goal ACTIVE; không mở đợt chi hoặc phát hành.

Các mục sau là lịch sử theo phiên bản.

---

## Hiện hành 02/10/2026 — Đối soát khách Facebook cũ đã kiểm thử

Runtime0d41d343 bổ sung cách nối nguồn Facebook đã xác minh vào đúng Lead/Customer cũ qua bản đối soát có thời hạn; giữ nguyên lịch sử và phân công CRM. Bản2d90f5c tăng độ sát của fixture với khóa ngoại dữ liệu cũ. Local82, PostgreSQL44, Node22 506, cả10 job automation/full frontend build và trình duyệt dữ liệu giả PASS; review độc lập runtime PASS. [Bằng chứng đúng phiên bản](vpt-marketing-automation/FACEBOOK_LEGACY_RECONCILIATION_REVIEW.md).

Phạm vi này chỉ xử lý hai liên kết lịch sử đầy đủ, đồng nhất và liên hệ khớp nguồn. Hồ sơ thiếu/mâu thuẫn vẫn cần xử lý; chưa xác nhận đủ nguồn/chi tiêu để kết luận CPQL. AI chăm khách, lịch khảo sát và nghiệm thu thực tế chưa hoàn tất. Full goal ACTIVE; chưa phát hành, mở quyền thật hoặc bắt đầu đợt chi.

Các mục phía dưới giữ lịch sử theo phiên bản.

---

## 2026-10-02 — Facebook legacy source adoption (in validation)

Base8394ed1. Added a default-off review flow for recovered Facebook receipts whose legacy Lead/Customer mappings agree. Server verifies fresh provider contact, prepares an expiring exact-context proposal, then a current admin can attach immutable source evidence to the existing CRM. No CRM/history/identity overwrite or automatic qualification. Version changes, wrong scope, expired evidence and retries are checked transactionally. Partial/conflicting legacy mappings remain exceptions; this does not prove full source coverage or actual CPQL.

Local17 contact/HTTP tests PASS; PostgreSQL, full build, UI and independent review pending. See [contract](vpt-marketing-automation/FACEBOOK_LEGACY_RECONCILIATION.md). No live migration, feature enablement, merge, deployment or ad change. Full goal ACTIVE.

---

## Hiện hành 02/10/2026 — Dashboard đã có đối soát Facebook–CRM

PR22 runtime5ff846 đã nối kết quả kiểm kê nguồn vào kỳ đo: tách lượt gửi đã khớp CRM, đang chờ, cần review, thiếu bằng chứng và lượt gửi CRM biết nhưng chưa quét thấy. Có nút khôi phục với gửi lại cùng yêu cầu khi mất phản hồi; nhãn phân biệt lượt gửi với khách duy nhất. Review độc lập PASS; PostgreSQL17, Node22 489, cả10 job automation/full build và trình duyệt dữ liệu giả PASS. [Bằng chứng đúng phiên bản](vpt-marketing-automation/FACEBOOK_CRM_RECONCILIATION_REVIEW.md).

Chưa phát hành hoặc mở đợt chi. Kết quả chỉ bao phủ lượt gửi đã kiểm kê và hồ sơ tiếp nhận có bằng chứng; còn phải hoàn tất phạm vi nguồn, hồ sơ legacy và cùng kỳ chi tiêu trước khi xác nhận chi phí/khách. AI chăm khách/lịch khảo sát và nghiệm thu thực tế vẫn chưa hoàn tất. Mục tiêu250.000 đồng/khách hợp lệ; trần100 triệu một đợt30 ngày gồmFacebook, TP.HCM/Cần Thơ80/20 giữ nguyên. Mục tiêu toàn hệ thống vẫn IN PROGRESS.

Các mục phía dưới giữ lịch sử theo phiên bản.

---

## 2026-10-02 — Reconciliation review and UI terminology

Runtime808a307 passed independent review, all10 automation jobs, census PostgreSQL17 cases and Node22 489 cases. Synthetic browser checks passed dropped-response same-key retry, refresh persistence, wrong-company replies, pending-write control locking and company switching. Reviewer P3 is addressed: census figures are labeled form submissions, distinct from unique qualified customers. The existing trial save button is also disabled during recovery. Final head CI and review of this UI delta remain to be recorded; no live action.

---

## 2026-10-02 — Connect census results to the trial dashboard (in validation)

Baseline PR22 730c388. Add read-only SQL657 census inventory to the same trial snapshot, compare enumerated IDs in both directions against receipt/source/CRM evidence, and expose recovery status plus scoped same-request retry in the dashboard. Local79 cases PASS (25 new reconciliation cases plus existing25 trial and29 census). Isolated PostgreSQL, whole-app build, synthetic browser and independent review are pending on this increment. No live change or complete CPQL claim; exhaustive provider coverage and other full-goal work remain.

---

## Hiện hành 02/10/2026 — Khôi phục khách Facebook bị sót đã kiểm thử

PR22 runtime `1625f66ee7a5d985fc9c290d460c40cdab12b200` đã bổ sung kiểm kê biểu mẫu/khách Facebook, lưu tiến độ và đưa khách bị sót về cùng đường tiếp nhận CRM. Review độc lập PASS; PostgreSQL census 11 PASS, Node18/22 mỗi bản 464 PASS, cả 10 job automation và full frontend build SUCCESS. [Bằng chứng và giới hạn](vpt-marketing-automation/FACEBOOK_SOURCE_RECONCILIATION_REVIEW.md).

Đây là bước khôi phục nguồn trong bản nháp, chưa phát hành. Còn phải xác minh phạm vi nguồn, xử lý hồ sơ thiếu và đối soát tiền chi/khách của cùng kỳ trước khi kết luận chi phí/khách. Sau đó tiếp tục AI tư vấn, bàn giao và lịch khảo sát. Mục tiêu250.000 đồng/khách hợp lệ; trần100 triệu một đợt30 ngày gồm Facebook, TP.HCM/Cần Thơ80/20 giữ nguyên. Không bắt đầu chi hoặc đổi quyền thật. Mục tiêu toàn hệ thống vẫn IN PROGRESS.

Các mục phía dưới là lịch sử theo phiên bản; kết quả chờ kiểm thử ở000f119 đã được thay bằng bằng chứng1625f66 ở trên.

---

## 2026-10-02 — Correct census race-test barrier

Runtime000f119 passed29 local cases and the first9 PostgreSQL child cases, including missed-notification recovery and lease expiration after locks. The final phantom-Page test placed its barrier inside a STABLE helper, retaining the earlier snapshot; the test now pauses start before the scope statement, which reproduces the intended race. Also separate form and lead capacity checks by task kind. Final CI and independent review pending; no live change.

---

## 2026-10-02 — Durable Facebook source enumeration and recovery

Base775d522. Added default-off provider form/lead enumeration with fixed-host pagination, stored cursors and expiring worker leases, current company/Page/trial authority, atomic receipt recovery and a scoped start/status API. Recovered IDs go through the existing verified CRM intake; no duplicate customer shortcut. Known historical forms are scanned even when absent from the Page edge; each form's Page is checked with Meta before scanning Leads. Metadata-only evidence records expiry/undiscovered forms and never certifies full coverage.

Local29 adapter/worker/HTTP cases PASS. Isolated PostgreSQL concurrency/crash/scope tests and final independent review are pending. See [contract](vpt-marketing-automation/FACEBOOK_SOURCE_RECONCILIATION.md). CPQL remains unavailable until provider-scope completeness and receipt disposition are proven; next work must connect that proof to the positive measurement path, not treat API enumeration as completion. Full Marketing–Sales goal active. No live changes.

---

## 2026-10-02 — Measured cohort and dashboard verified; source reconciliation next

Runtime af14635 (backend1c650): independent review PASS; local25 PASS; CI Node22 435 PASS, PostgreSQL trial13 PASS/0 FAIL/0 SKIP, all9 automation jobs and report/Messenger workflows SUCCESS; full frontend and synthetic browser PASS. Five review findings resolved, including old customer history, cross-company configuration race and loading/save UI race. See [evidence and limits](vpt-marketing-automation/MEASURED_COHORT_REVIEW.md).

Dashboard now reads all registered Facebook account costs and observed qualified/pending/unresolved groups in one consistent snapshot. Provider census/reconciliation and survey source remain missing, so actual CPQL is unavailable. Next is durable provider reconciliation and positive CPQL acceptance, followed by AI care/calendar/full-goal work. No live change; full goal active.

---

## 2026-10-02 — Prevent saving measurement configuration during reload

UI review found that a concurrent report reload could discard a save acknowledgement and leave the form locked. The form and submit handler now reject saves while loading; ambiguous saves still retain the same request and payload. Backend CI at1c6507d: all9 jobs PASS, PostgreSQL trial13 PASS/0 SKIP, Node22 435 PASS, full build PASS. Supported synthetic browser verification and final review follow in MEASURED_COHORT_REVIEW.md. No live change.

---

## 2026-10-02 — Measured cohort and dashboard integration

Base0a106ab. Added versioned30-day measurement configuration and a single-statement database report joining spend, source/receipt, current qualification and identity; added observed-cohort dashboard. Global trial-ID ownership is serialized, old customer history retained, and equal-time acquisition ambiguity stays unresolved. CPQL remains unavailable until provider census/reconciliation is connected; this is explicitly the next dependency, not final success. Local25 tests PASS; isolated PG/build/browser/independent final review pending. See [contract](vpt-marketing-automation/MEASURED_COHORT.md). Default-off; no live change. Full four-part goal active.

---

## 2026-10-02 — Identity review verified; next is the measured cohort

Implementation5d9a093: independent review PASS, local89 PASS; Node18/22 each410 PASS; isolated PostgreSQL identity27 PASS/0 FAIL/0 SKIP; full frontend and all automation/report/Messenger jobs SUCCESS. Follow-up96451de adds only combined-migration intake coverage:650–654 applied twice, intake/recovery31 PASS, all8jobs SUCCESS. Synthetic browser passed scope/source invalidation and ambiguous request retry. See [exact evidence and limits](vpt-marketing-automation/CRM_IDENTITY_OPERATIONS_REVIEW.md). No live changes. Full goal active: trial/source/qualified unique cohort + spend/CPQL, binding/legacy disposition, AI/calendar/dashboard and Founder release acceptance remain unfinished.

---

## 2026-10-02 — Company-wide identity review and exception UI

Base PR22 301db0d. Added exact-contact inventory, explicit DISTINCT/revoke, whole-group reconfirmation, historical detach/restore safeguards and operator review card. All writes remain scoped, versioned, audited and default-off; no CRM deletion or live change. Local89 tests PASS. Isolated PostgreSQL, full build, browser and final review pending. See [contract and release limits](vpt-marketing-automation/CRM_IDENTITY_OPERATIONS.md). Identity completeness is not paid qualification; trial/source/cohort, AI/calendar, dashboard and release acceptance remain unfinished. Full goal active.

---

## 2026-10-02 — Intake console and recovery verified; goal continues

Implementation ad806775: independent review PASS, local65 PASS; CI Node18/22 each368 PASS, isolated PostgreSQL16 intake/console31 PASS/0 FAIL/0 SKIP, all8 automation jobs and report/Messenger jobs SUCCESS. CI merge d80bf3d includes this implementation + base e16c885. Supported synthetic browser passed ambiguous response retry, delayed read/write across company switch, source failure/recovery, pagination and missing scope; no browser JS errors. See [review and limits](vpt-marketing-automation/FACEBOOK_INTAKE_CONSOLE_REVIEW.md). No production change. Default-off recovery/worker safeguards delivered; full goal remains active: canonical cohort and CPQL, binding/legacy reconciliation, AI/calendar, dashboard and release acceptance still unfinished.

---

## 2026-10-02 — Facebook intake operator console (goal continues)

Base PR22 459c8406. Added company-scoped queue/configuration view, cursor pagination and explicitly audited recovery with fresh permissions, optimistic receipt/binding checks, idempotency and tombstone/legacy guards. Additive migration653; recovery separately default-off. Worker pause keeps signed receipt intake and selected-Page legacy exclusion. Local65 tests PASS; PostgreSQL/build/browser and final independent review pending. See [console contract and release limits](vpt-marketing-automation/FACEBOOK_INTAKE_CONSOLE.md). No production writes, merge or deployment. Full four-part goal active; unique paid cohort/CPQL, AI/calendar, further channels and release acceptance unfinished.

---

## 2026-10-02 — Lead Ads intake integration verified; goal continues

Code d6daf4f: independent review PASS after closing P1 missing-scope permission and P2 expired-lease findings. Local41 adapter/webhook tests; CI Node18/22 each344 PASS, isolated PG intake20 scenarios+parent=21 PASS/0 FAIL/0 SKIP with650/651/652 applied. All parent PG, report, Messenger and frontend jobs SUCCESS. CI merge440ccc79 contains d6daf4f + base e16c885. See [independent evidence and limitations](vpt-marketing-automation/FACEBOOK_LEAD_INTAKE_REVIEW.md). No merge/deploy/live change. Reconciliation, complete unique qualified paid cohort, AI/care/calendar/dashboard and release acceptance remain unfinished; full goal active.

---

## 2026-10-02 — Lead Ads durable receipt and CRM source integration

Base PR22 fa39e939. Added opt-in signed Facebook Lead Ads inbox, fenced worker/retry, provider form/ad/account verification and atomic Customer + CRM Lead + immutable source evidence. Current routing and permissions are rechecked; no shared-phone merge or public raw mirror. Admin configuration/status API is default-off. Local 41 adapter/webhook tests PASS; database CI and final independent review still pending at this entry. See [contract and rollout gates](vpt-marketing-automation/FACEBOOK_LEAD_INTAKE.md). Goal remains active: reconciliation, full identity/source/cohort coverage, AI intake/handoff, calendar/dashboard and release acceptance are unfinished. No live changes.

---

## 2026-10-02 — CRM identity increment verified; goal continues

Code e434f4e: independent review PASS, 47 local tests; CI Node 18/22 each 303 PASS, isolated PostgreSQL identity 13 scenarios + parent = 14 PASS/0 FAIL/0 SKIP. Existing PostgreSQL jobs and full frontend build PASS. Reviewer independently checked published code blobs and PG log. CI merge ref 129c257 contains e434f4e + base e16c885. See [evidence and limits](vpt-marketing-automation/CRM_IDENTITY_REVIEW.md). Default-off, backend only; no merge/deploy/live change. Orphan/distinct resolution, UI/provider receipts, complete cohort, AI intake/handoff/calendar, dashboard and release acceptance remain open. This increment does not establish unique paid Lead counts or actual CPQL.

---

## 2026-10-02 — CRM identity relationships (goal continues)

Base PR22 79e012b. Added non-destructive CRM link/unlink API, relationship graph projection and migration651. Identity source generation is separate from qualification; stale/missing/moved members keep the group under review. Auth/replay/graph changes are checked transactionally. Default-off, primary-only, no real data/ad changes. Local47 tests PASS; isolated PostgreSQL/independent review pending at this entry. Backend only: orphan/distinct resolution, UI/provider bindings and complete trial cohort remain unfinished. See [contract and gates](vpt-marketing-automation/CRM_IDENTITY.md). Full four-part goal remains active; this does not prove unique paid Leads or CPQL.

---

## 2026-10-02 — CRM qualification increment verified

Implementation7079b266: independent code review PASS, all three P2 findings closed. Node18/22 combined256 tests PASS; isolated PostgreSQL16 CRM21PASS/0SKIP; full frontend build PASS. Supported browser on real component with synthetic wrapper covered changed Customer context, delayed save across Lead switch, read/write failure and recovery. CI uses PR merge ref369436b containing this head. See [review and limits](vpt-marketing-automation/CRM_QUALIFICATION_REVIEW.md). No real migration, merge/deploy or release. Full goal remains active; canonical identity/paid source/cohort, AI intake/handoff/calendar and dashboard are unfinished.

---

## 2026-10-02 — CRM qualification evidence (goal continues)

Base PR22 ec53daf. Implemented CRM human confirmation/exception panel, authenticated service and append-only migration650. Fresh database authorization, concurrency/idempotency and monotonic invalidation preserve evidence without silently reviving it when source edits are reverted. Default-off, primary-only; no real database/customer/ad changes. Local35 service/router tests pass; exact-head PostgreSQL/build/browser and independent review remain to be verified.

This is not cross-channel dedup, paid attribution, automated qualification or completed CPQL. Full four-part customer/spend, AI handoff, dashboard and acceptance goal remains active; see [scope and remaining gates](vpt-marketing-automation/CRM_QUALIFICATION.md). Human confirmation supports exceptions; it does not replace the approved automation objective. Finance deferred.

---

## 2026-10-02 — Marketing source integration (continuing four-part Founder goal)

Base PR22 38c71c15. Connected opt-in account-level Facebook spend evidence to existing sync, plus scoped read endpoint and a source coverage card. Legacy sync now rejects incomplete pagination/unknown currency/malformed money. Account admin endpoints enforce company ownership and tenant scope. New migration649 persists begin/complete/failure evidence; latest failed/interrupted run cannot fall back to old spend. New path is default-off and refuses failover; no production writes, campaigns or messages changed.

Local221 unit/integration/regression cases PASS. Implementation94528fa passed PostgreSQL16 spend evidence/concurrency (10PASS/0SKIP), whole frontend Vite build and report CI; independent reviewer reran218 tests and passed the code. Supported browser covered source failure, company switch and pending sync. See SPEND_REVIEW.md; closing UI date guard and evidence commit require exact-head CI. Scope remains the full customer+spend, AI intake/handoff, dashboard and acceptance/release objective. Canonical CRM/trial registry, recipient/calendar bindings, AI delivery and live UAT are unfinished. Finance is deferred. Trial start was asked asynchronously; no response assumed.

See [source integration](vpt-marketing-automation/SPEND_INTEGRATION.md). No merge/release. Rollback disables source evidence and preserves its records; do not restore cross-company account access.

---

## 2026-10-02 — VPT Marketing–Sales automation implementation

Founder approved the one-time100m/30-day plan,80/20 geography, interim250k/qualified paid Lead (later <=7% recognized net paid-attributed revenue), AI advice/survey booking and human final quote/close. See [approved plan](../architecture/VPT_MARKETING_SALES_AUTOMATION_V1.md) and [implementation/remaining gates](vpt-marketing-automation/README.md). Supersedes earlier14/21m proposals and permanent agency staffing, not production release.

Implemented candidate: estimated/revenue separation across report/insights/MCP/UI, strict pure domain policy/measurement/care/content controls and disabled durable command components+new migration648. Source is PR19 e16c885; no main merge. Runtime providers/context, atomic budget/slot operations and six-channel UAT remain incomplete; no live automation/ad/DB changes.

Local163 tests pass including25 interim Lead measurement cases. Isolated PostgreSQL CI and independent review must be read on the final published revision; this header alone is not evidence of PASS. Inventory found connected VPT Facebook/Google/GA4 and ChatGPT Ads; ChatGPT brand review pending. Canonical Lead qualification/spend bindings and human owners still need confirmation. Finance deferred by Founder; not a gate for Lead-only trial.

Rollback: stop new components; revert code if needed; keep history, queue/audit and all business records.

---

---

## 2026-10-02 — MCRM-D0 v1: khảo sát và thiết kế thử nghiệm trợ lý Marketing–CRM

- AI thực hiện: Codex; reviewer phiên riêng theo hồ sơ VALIDATION.
- Yêu cầu Founder: thực hiện bước khảo sát/đóng gói đã đề xuất cho trợ lý Marketing–CRM.
- Đã làm: nguồn mã có SHA, phạm vi/owner/gate, 4 tool contract, mẫu báo cáo/fixture, target còn thiếu và 26 case chưa chạy.
- File thay đổi: thư mục `docs/ai-handoff/marketing-crm-assistant/`, liên kết README và mục trạng thái CURRENT/WORKLOG này.
- Kiểm chứng và kết luận review: [VALIDATION](./marketing-crm-assistant/VALIDATION.md); kiểm tài liệu/fixture không thay kiểm ứng dụng.
- Chưa làm: implementation runtime, OpenAI API, DB/Meta/CRM thật, merge/deploy. Không dùng báo cáo giả làm chỉ số vận hành.
- Bước tiếp: chốt target/người nghiệm thu/policy; mở đúng gói implementation sau khảo sát. Hoàn tác gói này bằng revert commit tài liệu.

---


## 2026-10-02 — F-13/F-14: Marketing tự động, đo Lead trước

Founder đã giao triển khai kế hoạch thay phương án A/B/nhân sự cũ, rồi chuyển phép đo trước mắt sang250.000 đồng/khách hợp lệ. Trần một đợt100 triệu/30 ngày và80/20 giữ nguyên;300 khách tương ứng75 triệu, không buộc tiêu hết.7% doanh thu đánh giá sau; không chặn giai đoạn Lead vì chưa nối kế toán.

[PR22](https://github.com/backen-pixel/Quanlycongviec/pull/22) chứa bản sửa báo cáo và nền domain/queue đang tắt, [kế hoạch](https://github.com/backen-pixel/Quanlycongviec/blob/codex/vpt-marketing-automation-20261002/docs/architecture/VPT_MARKETING_SALES_AUTOMATION_V1.md) và [trạng thái triển khai](https://github.com/backen-pixel/Quanlycongviec/blob/codex/vpt-marketing-automation-20261002/docs/ai-handoff/vpt-marketing-automation/README.md). Các adapter dữ liệu thật, atomic budget/slot, tài sản/nội dung và UAT chưa hoàn tất. Không merge/deploy/đổi ads/DB thật. PR20 là hồ sơ kiến trúc; PR19 vẫn là dependency của PR22. Xem validation đúng phiên bản trong PR22, không suy tất cả hệ thống PASS.

F-13/F-14 là quyết định mới, F-12 và nhật ký dưới đây giữ lịch sử theo thời điểm. Các gate kiến trúc/Factory và sources đồng bộ giữ nguyên.

---

## 2026-10-02 — Cập nhật ưu tiên Marketing đa kênh theo Founder

- Thực hiện: Codex. Yêu cầu: ưu tiên tạo khách qua Marketing đa kênh; Founder nêu website/Google/ChatGPT Ads/TikTok/Zalo và giao lập phương án tăng ngân sách.
- Đã làm: F-12, roadmap thu hút → nhận khách → tư vấn → đo chất lượng; gói MK-01…06 và hai phương án media chờ duyệt. Kế thừa ngân sách Facebook đã duyệt; chưa sửa chiến dịch.
- Kiểm tra: nội dung/phạm vi, phép tính ngân sách, liên kết và bảo toàn phần lịch sử; review bổ sung tại MARKETING_PRIORITY_REVIEW_20261002.md. Không dùng PASS tài liệu thay UAT hoặc phê duyệt chi tiền.
- Chưa làm: chạy Ads/CRM/DB/API, tích hợp kênh hoặc merge/deploy. Không cam kết số khách khi chưa có baseline.
- Hoàn tác: revert commit tài liệu, giữ lịch sử. Các quyết định và bằng chứng chặng 0 cũ giữ phạm vi phiên bản riêng.

---

# 2026-10-01 — Chặng 0 / bộ kiến trúc Business AI OS V1.1

Theo kế hoạch Founder yêu cầu triển khai: soạn kiến trúc, roadmap, bản đồ ownership, sổ quyết định và ADR; gắn vào mục lục/AGENTS/CLAUDE. Đã đối chiếu 31 bản nguồn với blob Git, main 0db11ce1adb0fb89fc87529036e495a62d58fce7; phát hiện lõi Order hiện có, task xưởng trong crm_tasks, hỗ trợ đa xưởng/đa đợt, giới hạn flowRuntime và 54 nhóm số SQL trùng.

Hồ sơ: [bằng chứng](ARCHITECTURE_V1_1_EVIDENCE_20261001.md), [lộ trình](../architecture/BUSINESS_AI_OS_V1_1_ROADMAP.md). Gói chỉ sửa tài liệu/hướng dẫn; không code runtime, migration, config, quyền, CI, lịch hoặc quảng cáo. Kiểm tra liên kết/phạm vi/bảo toàn lịch sử và [review độc lập](ARCHITECTURE_V1_1_INDEPENDENT_REVIEW_20261001.md) PASS; không suy test phần mềm từ kiểm tra này. Prefix mới giữ nguyên toàn bộ nội dung lịch sử phía sau.

---


## 2026-10-05 - PR A minimal: lead measurement core
Files: backend/src/modules/marketingAutomation/policy.js, leadMeasurement.js; backend/tests/marketingAutomation.leads.test.js; .github/workflows/marketing-lead-measure-core.yml; CURRENT.md and WORKLOG.md.
Source: PR #22 commit 679cb926. policy.js keeps APPROVED_PLAN, money, instant; removes DAY, deny, evaluateBudgetMove, humanDeadline.
Checks: Node 24.19.0 node --check passed for all three JS files; node --test --test-isolation=none passed 25/25. Plain node --test could not spawn in sandbox (EPERM); Node 18/22 CI is pending.
Runtime: no caller, no real-data report, no DB/API access, migration, deployment, commit, or push.
Rollback: remove the four added code/CI files and these two handoff entries.

## 2026-10-01 - Issue #15: Marketing / Business AI OS M0 candidate

**State: IN PROGRESS.** Feature branch `codex/marketing-bos-m0-20261001`, base `0bc6392286df0b986cdd6dfc59b499916dd6fd31`; implementation commit `33874dd2e3632c0a1127fd76cc7351a663138e9c`.

Added a pure normalized-evidence contract and synthetic tests, ADR-0015, an integration/dependency map, a non-runtime implementation backlog and a read-only PR CI workflow. See `MARKETING_BOS_M0_EVIDENCE_20261001.md` and `../architecture/MARKETING_BOS_INTEGRATION_V1.md`.

Verification: 73/73 synthetic tests on Node 22.16.0 in an isolated container; 73/73 on Node 24.19.0 in a fresh Windows sandbox after fetching this exact GitHub commit. All six new Git blob SHA-256 hashes match the locally tested contents. Helper/test syntax and diff checks pass. These are repeat runs by the same assistant, not independent review; no full application, staging or live E2E tests were run.

No main merge, production deploy, SQL, CRM records, ad budgets/statuses, credentials, permissions, scheduler, agent deletion or existing runtime files were changed. The helper is not registered in an application route/worker. PR #14 remains an independent workstream.

Next: review exact PR head and CI, then M1 target/schema/recipient/source verification and a scoped read adapter. M2 E2E/shadow evidence and M3 authorized release remain NOT STARTED. Preserve existing single-writer ownership and schedules. Rollback only this additive candidate; never delete customer/receipt/evidence data.

Historical entries below are preserved byte-for-byte; this entry does not re-certify their live status.

---


## 2026-10-01 — PR19 delayed-action refresh and authorized local browser verification

PR #19 original head: `1d2520d2286423269adc50104185fe3cbe10bc04`. Founder authorized a local browser using synthetic data and an independent read-only reviewer agent. Real CRM configuration access and source-to-recipient acceptance remain unverified.

Found a remaining P1: a save started under company A can finish after selecting B and invoke the old A loader; its new request ID overwrites B with A's report. Reproduced in real React browser: selected B showed A/11. The candidate uses a mounted latest-loader ref for four action completion paths, clears it on cleanup, and preserves B/22 after delayed completion. Backend business logic, permissions and configuration unchanged by this follow-up.

Validation: verified original source blob hashes; existing suite 41/41 PASS; 12 new lifecycle tests against original = 4 PASS / 8 FAIL; candidate integrated suite = 53/53 PASS. Independent agent reviewed the full functional delta against base 0db11ce1adb0fb89fc87529036e495a62d58fce7, reran 41 existing + 12 new tests successfully and approved the candidate (UI blob `565f8990b3ef599f551398ec0e342239529c7d13`). CI includes the new test on Node 18/22; check the published head before relying on CI.

Supported-browser evidence: actual UI component with mock-only API at loopback and CSP connect-src none; delayed save/filter switch, unavailable CRM/clear old data, recovery and empty state; screenshots at requested 1440/768/375 widths. No page horizontal overflow observed, table scrolls inside its container. Independent agent inspected saved browser evidence, did not rerun browser. Not whole-app build/auth, visual-baseline comparison, comprehensive accessibility or real CRM E2E.

Review detail: PR19_BROWSER_INDEPENDENT_REVIEW_20261001.md. Operational gate stays HOLD pending allowed environment/sample and Facebook → canonical CRM → active Sales Admin/report reconciliation. No main merge, production deploy, message/ad/budget/customer/config changes.

Rollback: revert only the follow-up commit; preserve all data, prior report corrections and historical handoff entries.

---

## 2026-10-01 - PR19 UI review follow-up (not production acceptance)

Found and fixed campaign row-key collisions and stale async responses after filter changes. New snapshot reset and request-generation checks preserve the current selected scope. Existing backend report corrections unchanged. 10 new tests fail 9/10 on the old PR source; combined suite now 41/41 PASS. Actual JSX transform PASS, no warnings. CI expanded to cover both tests; result must be read on new head.

Browser runner attempt was safety-blocked and not retried; no actual browser/mobile/full-build/CRM E2E PASS. Prior CRM configuration access block remains; no alternative access attempted. Same-assistant review, not independent approval. No main merge, deployment, ads/budget or customer/recipient changes. Next gates: authorized browser verification and Facebook -> canonical CRM -> active Sales Admin acceptance. Details: PR19_UI_REVIEW_20261001.md.

---

## 2026-10-01 — Marketing first: report correctness, Issue #18

Founder requested focusing on completion of marketing, not broader AI architecture. Priority remains real source -> valid CRM intake -> active Sales Admin -> accurate reporting. No new agent, scheduler or parallel dashboard in this increment.

Branch: codex/marketing-report-correctness-20261001. Base: bb6f1f26a66905de7701947c0b03c82c41343061. Correct existing ad-analytics read routes: one lead_id per group; distinguish campaigns by ID before manual labels; CRM read failure returns safe UNKNOWN/503 instead of a successful zero. UI clears earlier data on read error and explicitly shows unavailable, not an empty-result conclusion. Existing auth/company and business lifecycle rules unchanged.

Verification: same 31 tests on pinned baseline = 9 PASS / 22 FAIL; candidate = 31 PASS / 0 FAIL (Node 24.19.0). Backend/test syntax and git diff check pass. VM executes actual route handlers with synthetic DB/auth dependencies and the actual UI load callback; not full auth, browser, React render, independent review, whole-app build or live E2E. GitHub CI must be read back on exact published head. JSX parser unavailable in sandbox; no dependency installed.

Files: backend/src/routes/adAnalytics.js; frontend/src/pages/AdAnalyticsPage.jsx; backend/tests/adAnalytics.correctness.test.js; .github/workflows/marketing-report-correctness.yml; handoff/evidence. No main merge, deploy, DB/config change, ad/budget change, or live customer action. A live CRM configuration read was blocked and was not retried through another path. This patch does not complete source/recipient/E2E verification or replace PR #14/#16.

Rollback: revert only this commit; preserve all customer data and prior handoff entries. Next: exact-head review/CI, then authorized release/smoke and source-to-recipient E2E. No live activation is implied by passing synthetic tests.

# Candidate worklog

## 2026-10-05 — Bản vá quyền anon/authenticated, chỉ tạo code

- AI: Codex. Phạm vi theo `BRIEF_SECURITY.md`; không truy cập DB/Supabase, không chạy migration hay smoke, không push.
- File: `database/audit/anon_exposure_audit.sql`, `database/audit/anon_exposure_snapshot.sql`, `database/700_revoke_anon_public_access.sql`, `database/700_revoke_anon_public_access_rollback.sql`, `backend/tests/anon-exposure-smoke.js`, `backend/package.json`, `docs/ops/SECURITY_ANON_REVOKE.md`, `docs/ai-handoff/CURRENT.md`, `docs/ai-handoff/WORKLOG.md`.
- Kiểm tra tĩnh: `node --check backend/tests/anon-exposure-smoke.js`; `git diff --check`; rà RPC/backend và web/mobile bằng `rg`. Chưa xác minh cú pháp SQL bằng PostgreSQL, chưa kiểm tra hiệu quả trên staging. `git add` bị chặn khi tạo `.git/worktrees/Quanlycongviec-secfix/index.lock` ngoài writable root; chưa commit. Hoàn tác code bằng bỏ diff trong worktree; hoàn tác database bằng script rollback dùng snapshot cùng database.

## 2026-09-29 — VPT Messenger durable intake, local candidate only

Issue #7: https://github.com/backen-pixel/Quanlycongviec/issues/7. Base: `413e8f575b5b611b25a50980564d754b7bfcf211`. Founder requested finishing the Messenger A2/B trial. No remote commit, PR, migration, live test or deployment performed by this workstream.

Opt-in Page 409741855550833: persist Messenger event before ACK, retry with DB lease/token; extract referral even without message; exact ad→campaign mapping; reuse existing lead_attribution; delayed Lead linking. Auto/manual/legacy scan share atomic contact→Lead RPC for this Page and CRM Lead type. Unique nullable crm_leads.facebook_contact_id and contact row lock guard retry/concurrent creation. Existing customer/phone reuse also uses the same RPC. Other Pages remain unchanged unless explicitly opted in.

Files: two sanitized runtime schema/index/ACL fixtures; routes/facebook.js, routes/crm/routes/leadLifecycle.js, server.js (legacy scan identity), helpers/facebookAtomicLead.js, helpers/facebookMessengerReceipt.js, migrations639–641, five test files, config example and review notes. Applied migrations are unchanged. 636–638 reserved from the older unmerged package, unavailable locally (Library helper retried twice, HTTP502).

Tests: Node handler VM + helper tests and real isolated PGlite SQL; no application .env, full server import, production DB or message sends. See VPT_MESSENGER_REVIEW_20260929.md for exact commands and gates. Source-backed baseline failed ACK/retry regression tests; candidate passes 40/40 local tests. SQL tests are one PGlite connection, not multi-session PostgreSQL staging.

Runtime schema/FKs/unique indexes are now compared and represented by schema-only test fixtures. Existing attribution ACL is broad with RLS=false; no global ACL is changed. New raw/ref/source/message/phone/PSID data stays only in protected receipts, attribution gets numeric IDs and event keys. Unresolved before activation: multi-session Postgres CI + controlled staging fault/restart tests; deploy SHA/API health; Meta messaging_referrals subscription; real referral→phone→Lead→campaign E2E. Runtime historical 7 ad rows sharing one timestamp do not prove current writer. No automation for budget stop/resume or ad activation in this patch.

Rollback: keep ads paused; drain pending receipts before disabling FB_DURABLE_MESSENGER_PAGE_IDS and reverting backend. Keep evidence and additive identity columns. Never delete historical leads/contacts/attribution to roll back. Notifications/tasks after commit are not guaranteed exactly once; customer creation remains outside Lead transaction and can leave an unused customer during a race. Cross-contact shared Lead retains original first-touch attribution and this contact's pending evidence.


# Nhật ký công việc AI

## 2026-10-05 20:10 — Nút ⋯ xóa bình luận

- Bình luận của Lê Minh Tiển không có chỗ xóa vì nút chỉ hiện khi rê chuột và chỉ với đúng người viết.
- Gắn nút ⋯ trên bong bóng: tác giả Sửa/Xóa, admin chỉ Xóa. Sửa API xóa lead (truyền `req.user`) và cho admin xóa bình luận dự án.
- Đã mở deal LEAD-2026-1389, bấm ⋯ trên bình luận file SKP, menu hiện «Xóa». Chưa xóa dữ liệu thật.

## 2026-10-05 16:00 — NV Metalla không mở được dự án đặt sang xưởng Hucabi

- AI: Cursor. Toại (admin Metalla) mở TB-2026-909 được nhưng TB-2026-964 (Hucabi, đặt từ 909) bị 403.
- Nguyên nhân: `getAccountingClientProjectIdsAtWorkshop` gửi `.in('project_id', 641 UUID)` → PostgREST `Bad Request` (URL > ~25KB) → trả `[]` → mọi dự án Hucabi đều bị từ chối với NV công ty khác.
- Sửa: phân trang dự án + tra deal theo lô bằng `supabaseFetchAll`. Kiểm tra local: 81 dự án khớp, có TB-2026-964.
- Còn tồn: `getVptRelatedProjectIdsAtWorkshop` cùng kiểu lỗi, chưa sửa.
- File: `backend/src/helpers/accountingScope.js`.

## 2026-10-05 15:00 — Menu file Drive không đè thẻ

- AI: Cursor. Menu ⋯ nằm trong thẻ `overflow-hidden` nên Xem trước / Xóa đè lên ảnh và bị cắt.
- Đưa menu ra lớp nổi trên trang, căn theo nút ⋯, lật lên trên nếu sát đáy màn hình.
- File: `DriveFileViews.jsx`.

## 2026-10-05 14:35 — Xóa file Drive có xác nhận và báo thành công

- AI: Cursor. Menu xóa file trên hồ sơ đã hỏi xác nhận nhưng không báo khi xong.
- Giữ hộp xác nhận (kèm tên file) và thêm toast «Đã xóa». Trang Drive báo tương tự khi đưa vào thùng rác hoặc xóa vĩnh viễn.
- File: `DriveAttachments.jsx`, `DrivePage.jsx`.

## 2026-10-05 10:40 — Tải file bình luận sống qua đổi trang

- AI: Cursor. Rời trang làm mất thanh tiến trình trong ô bình luận nên tưởng như tải bị dừng. Request axios không bị hủy khi unmount.
- Gắn tiến trình vào bảng góc dưới phải của Drive: tốc độ và thời gian còn lại. File đính kèm thường và file lớn đều hiện ở đó.
- File: `FileUpload.jsx`, `drive.js`, `oversizedDriveUpload.js`.

## 2026-10-05 10:30 — Thanh tải file trong bình luận

- AI: Cursor. Tiến trình đính kèm nằm trong cột kẹp giấy (~150px) nên tên file và chữ trạng thái bị gãy trong ô nhập.
- Đưa thanh tiến trình ra hàng riêng, full width, phía trên ô soạn. File lớn dừng ở 99% vì server đang đẩy lên Google Drive sau khi trình duyệt gửi xong.
- File: `CommentsPanels.jsx`, `FileUpload.jsx`, `UploadProgressBubble.jsx`, `oversizedDriveUpload.js`, `uploadProgressEta.js`.

## 2026-10-05 09:20 — Hạn HCB bám cột, quá hạn sau 17:30

- AI: Cursor. Đổi ngày lắp HCB vẫn quá hạn vì hạn thẻ lấy nhóm việc còn mở sớm nhất, không phải cột đang đứng.
- Hạn thẻ và bảng nhiệm vụ SX tính lại từ cột Kanban, mốc 17:30. Cùng ngày chỉ quá hạn sau giờ đó.
- File: `sxCardPlanDeadline.js`, `workTasks.js`, `ProjectTasksOverviewPage.jsx`. Đã quét lại hạn thẻ HCB.

## 2026-10-05 08:52 — File trên 50MB lưu Drive, link vào bình luận

- AI: Cursor. File đính kèm lớn hơn 50MB không còn bị chặn: tải lên Google Drive, tạo link xem, gắn vào bình luận lead/dự án. Chat lead cũng đăng bình luận kèm link.
- File: `oversizedDriveUpload.js`, `CommentsPanels.jsx`, `LeadChatTabs.jsx`, `drive.js`, `helpersBundle.js`.

## 2026-10-02 16:51 — Gỡ lọc dashboard Hào, trả về xem đủ dự án xưởng

- AI: Cursor. Đã bỏ phạm vi «chỉ dự án có việc của Hào» trên dashboard SX.
- File: `dealParticipantProduction.js`. Xóa `tests/hao-task-project-scope.js`.
- `hao@metalla.com` thấy lại mọi dự án công ty, theo phân loại đang chọn.

## 2026-10-02 15:15 — Hàng nhiệm vụ hiện tên nhân viên được gán

- AI: Cursor. Dòng nhiệm vụ thu gọn (ví dụ Phôi) chỉ hiện «Chi tiết», không hiện tên người nhận.
- File: `frontend/src/components/CRMTasksTab.jsx`.
- Tên nhân viên hiện luôn trên hàng, không cần mở rộng. Đã xem TB-2026-963: Phôi và Cánh hiện «Thuận».

## 2026-10-02 13:56 — Hiện BC theo tổ chức cho quản trị HST

- AI: Cursor. Sidebar CRM ẩn mục `executiveOnly` với role `ecosystem_admin`.
- File: `adminRole.js`, `Sidebar.jsx`, `RequireRole.jsx`, `helpersBundle.js`.
- Menu và quyền vào trang dùng chung `isCrmExecutive`. API org-overview coi quản trị HST là báo cáo đầy đủ.

## 2026-10-02 11:55 — Bộ lọc Không gian chung giống Giao việc

- AI: Cursor. Tab Không gian chung trước đó chỉ lọc trạng thái và ưu tiên.
- File: `CRMAssignmentsPage.jsx`, `crmAssignments.js`, `sharedWorkspaceInbox.js`.
- Admin chọn công ty, phòng ban hoặc nhân viên thì tải việc của đúng phạm vi đó.

## 2026-10-02 11:50 — Lọc phân loại xưởng trên Giao việc Sản xuất

- AI: Cursor. Giao việc Sản xuất dùng cùng ô phân loại với dashboard xưởng (Chưa phân loại / HCB · Tủ bếp / Cánh kính / Cửa).
- File: `CRMAssignmentsPage.jsx`, `crmAssignments.js`, `sharedWorkspaceInbox.js`.
- Thử `/sx/assignments`: Tủ bếp 11 việc, Cánh kính 0 việc. API list, stats và Không gian chung trả 200. Đã trả bộ lọc về Tủ bếp.

## 2026-10-02 11:10 — Không chép nhiệm vụ mẫu xưởng sang Không gian chung

- AI: Cursor. Lưu hoặc áp bộ mẫu `sx_`/`vc_` từng tạo `crm_assignments`. Nay bỏ qua nhiệm vụ mẫu; phát sinh (`sx_shared`, `customer_request`) vẫn tạo giao việc.
- File: `workshopPipelineTask.js`, `crmTaskAssignmentSync.js`, `crmSequentialAssignment.js`, `sharedWorkspaceInbox.js`, `tests/workshop-template-no-assignment.js`.
- Thử: unit test ok. Gọi sync thật trên «Chốt công nợ» (`sx_pl_6723a412`) — bỏ qua, số giao việc trước/sau = 0. Việc mở kế tiếp của deal là «Thông tin khác hàng», không phải Phôi.

## 2026-10-02 09:55 — Sửa ngày lắp thì hạn thẻ SX chạy theo

- AI: Cursor. Tính lại hạn thẻ bị lỗi vì đọc cột `install_occurrence_dates` không có trên `projects`, nên sửa ngày lắp mà `sx_kanban_deadline_at` đứng yên.
- File: `projectDeliveryDates.js`, `sxCardPlanDeadline.js`, `projects.js`.
- Thử TB-2026-978: ngày lắp 07/10 → 14/10, hạn 03/10 → 08/10, rồi trả dữ liệu cũ.

## 2026-10-01 15:50 — Hướng sửa 4 việc module SX

- AI: Cursor. Đơn phát sinh, khóa giai đoạn khi kéo cột, bàn giao VC vào đúng pipeline, hạn thẻ theo lịch 7 ngày.
- SQL chưa chạy: `database/648_sx_phat_sinh_order.sql`.

## 2026-10-01 14:55 — Sửa dashboard SX vỡ vì filterBusy

- AI: Cursor. `/sx/dashboard` báo Cannot access filterBusy before initialization vì biến được dùng trước khi khai báo.
- File: `ProductionDashboard.jsx`.

## 2026-10-01 14:50 — Tích và kéo nhiệm vụ trên Giao việc SX

- AI: Cursor. Thẻ nhiệm vụ của dự án chỉ hiện vòng tròn, không tích và không kéo được. Nay quản trị tích hoặc kéo để đổi giai đoạn.
- File: `CRMAssignmentsPage.jsx`, `assignmentManageAccess.js`.

## 2026-10-01 14:45 — Mắt tìm Giao việc mở chi tiết đúng module

- AI: Cursor. Nút mắt trong ô tìm luôn nhảy sang deal CRM. Nay theo module đang đứng: SX mở dự án sản xuất, VC mở dự án lắp đặt, CRM vẫn mở deal.
- File: `CRMAssignmentsPage.jsx`.

## 2026-10-01 14:40 — Hạn lịch 7 ngày và tiến độ việc nhỏ trên quản lý nhiệm vụ SX

- AI: Cursor. Cột Quá hạn trống vì không lấy lịch lắp. Hạn thẻ nay theo lịch 7 ngày lùi từ ngày lắp. Tiến độ thẻ cộng nhiệm vụ SX cùng tên đã xong; danh mục chỉ hết khi việc nhỏ bên trong xong.
- File: `projectOverviewDeadline.js`, `workTasks.js`.

## 2026-10-01 14:30 — Quá hạn quản lý nhiệm vụ SX theo hạn của việc

- AI: Cursor. Cột Quá hạn đếm danh mục theo hạn giao hàng và hạn việc xưởng, nên lệch với nhiệm vụ và giao việc. Chỉ còn tính hạn riêng của nhiệm vụ và giao việc. Đã xem trang: Quá hạn 0, Chưa có hạn 807.
- File: `projectOverviewDeadline.js`.

## 2026-10-01 14:08 — Số ghi chú và file trên thẻ Giao việc

- AI: Cursor. Thẻ Kanban có nút ghi chú nhưng không cho biết đã có bao nhiêu file hay ghi chú. Hiện số ngay trên nút khi có.
- File: `CRMAssignmentsPage.jsx`, `crmTaskAssignmentSync.js`.

## 2026-10-01 14:05 — Giao việc SX không lọc thì hiện mọi việc

- AI: Cursor. Trang Giao việc Sản xuất coi quản trị hệ sinh thái như nhân viên thường nên chỉ lấy việc của đúng tài khoản đó và ra 0. Giờ không chọn bộ lọc thì hiện toàn bộ giao việc sản xuất.
- File: `CRMAssignmentsPage.jsx`.

## 2026-10-01 13:55 — Tải nhiệm vụ nhỏ song song khi mở dự án

- AI: Cursor. Cột nhỏ trên chi tiết dự án chờ hết spinner dự án, rồi tải lại dự án, rồi mới lấy nhiệm vụ. Giờ tab Công việc gọi tasks ngay khi có dự án, cùng lúc với lead.
- File: `ProductionDetail.jsx`, `CRMTasksTab.jsx`, `crmTasks.js`, `production.js` (`task-bootstrap`).

## 2026-10-01 13:42 — Ghi chú và file trên thẻ Giao việc

- AI: Cursor. Thẻ Kanban Giao việc của nhiệm vụ xưởng không có chỗ nộp ghi chú và file như chi tiết nhiệm vụ. Thêm nút mở cùng khối ghi chú và đính kèm.
- File: `CRMAssignmentsPage.jsx`, `WorkTaskExtrasPanel.jsx`, `crmAssignments.js`.

## 2026-10-01 13:32 — Thông tin dự án dưới thống kê Giao việc SX

- AI: Cursor. Lọc Giao việc theo dự án chưa cho biết đó là dự án nào ngoài mã trên dải trên. Thêm khối tóm tắt ngay dưới «Số việc theo nhân viên».
- File: `CRMAssignmentsPage.jsx`, `crmAssignments.js`.

## 2026-10-01 13:20 — Giao việc SX theo dự án chỉ tính nhiệm vụ xưởng

- AI: Cursor. Board `/sx/assignments?project_id=` đang gộp cả nhiệm vụ deal CRM. Giữ lọc module sản xuất và chỉ bổ sung nhiệm vụ pipeline `sx_`.
- File: `CRMAssignmentsPage.jsx`, `crmAssignments.js`.

## 2026-10-01 13:15 — Bấm thẻ quản lý NV xưởng vào dự án

- AI: Cursor. Thẻ Kanban `/sx/project-tasks` trước đó mở Giao việc. Bấm thân thẻ hoặc người phụ trách giờ mở chi tiết dự án. Nút Công việc giữ lối vào Giao việc đã lọc dự án.
- File: `ProjectTasksOverviewPage.jsx`.

## 2026-10-01 12:00 — Gỡ Trương Trọng Thành khỏi đội dự án

- AI: Cursor. Bỏ khỏi danh sách tự gắn HCB. Xóa đội SX, thành viên deal, NV mặc định, và các ô phụ trách đang trỏ user này trên primary và backup. Không xóa tài khoản.
- File: `dealParticipantProduction.js`, `database/647_remove_truong_trong_thanh_assignments.sql`.

## 2026-10-01 11:53 — Nút Quá hạn trên thẻ VC/LĐ

- AI: Cursor. Thẻ quá hạn lắp chỉ đổi màu chip. Thêm nút đỏ «Quá hạn» kèm ngày trên thẻ, và chữ «Quá hạn» trên nút đếm ở thanh công cụ.
- File: `LogisticsDashboard.jsx`.

## 2026-10-01 11:48 — Thẻ Kanban VC/LĐ hiện mốc thời gian

- AI: Cursor. Thẻ vận chuyển chỉ có tuổi dự án tương đối, trong khi thẻ sản xuất đã hiện ngày tạo, ngày lắp và hạn xưởng. Thêm cùng các mốc đó lên thẻ VC/LĐ, kèm ngày lấy hàng và tô vàng khi ngày lắp SX lệch ngày lắp CRM/LĐ.
- File: `LogisticsDashboard.jsx`, `logistics.js`.

## 2026-10-01 11:40 — Bảng ngày lắp / ngày lấy hàng trong Sự kiện

- AI: Cursor. Lịch lắp và lấy hàng của deal CRM với dự án sản xuất / lắp đặt nằm rải trên từng màn. Thêm bảng kiểu Excel trong Sự kiện, một dòng một dự án, tô vàng khi ngày lắp SX lệch ngày lắp CRM/LĐ.
- File: `installScheduleSheet.js`, `events.js`, `EventsInstallSchedulePage.jsx`, `EventsFeedPage.jsx`, `App.jsx`.

## 2026-10-01 11:20 — Sửa ngày trong chi tiết thì hạn thẻ Kanban đổi theo

- AI: Cursor. Ngày lắp SX từng ghi `production_deadline` bằng chính ngày lắp, và hạn thẻ không tính lại khi còn `install_date` / lịch nhiều buổi cũ hoặc lý do deadline tay. Giờ sửa một ô ngày lắp cập nhật ô kia, hoàn thiện = lắp − 2, và hạn thẻ theo nhóm cột từ ngày vừa sửa.
- File: `ProductionDetail.jsx`, `projects.js`, `projectDeliveryDates.js`, `sxInstallPlanKanbanDeadline.js`.

## 2026-10-01 11:15 — Gán NV cột lớn cho Tủ bếp và Cánh kính HCB

- AI: Cursor. Gán cùng người với Cửa: Tiếp nhận và Kế hoạch = Sang Thiết Kế VPT 1, Duyệt = Nguyễn Nhật, Gia công = Nguyễn Minh Nhựt, Hoàn thiện và Đóng gói = Hòa Bảo. Phân loại Công nợ không có cột pipeline.

## 2026-10-01 11:10 — Ô phụ trách cột lớn hiện đúng người đã gán

- AI: Cursor. Tủ bếp chưa gán NV trên từng cột; phụ trách chính của phân loại là Sang Thiết Kế (`company_id` null) nên không có trong danh sách NV HCB, ô chọn kẹt «— NV phụ trách —». API giờ trả thêm user đã gán dù khác công ty. Cột chưa có NV riêng thì hiện phụ trách chính của phân loại.
- File: `frontend/src/pages/ProductionPipelineSettingsPage.jsx`, `backend/src/routes/production.js`.

## 2026-10-01 11:00 — Hiện người phụ trách trên cột lớn setup pipeline

- AI: Cursor. Thẻ cột chính hiện tên NV đã gán (`default_staff` của các cột nhỏ). Ô chọn thêm người đó nếu họ không có trong danh sách NV phân loại, nên không còn kẹt ở «— NV phụ trách —».
- File: `frontend/src/pages/ProductionPipelineSettingsPage.jsx`. Đã xem trên HCB / Cửa: Tiếp nhận và Kế hoạch = Sang Thiết Kế VPT 1, Duyệt = Nguyễn Nhật, Gia công = Nguyễn Minh Nhựt, Hoàn thiện và Đóng gói = Hòa Bảo.

## 2026-10-01 10:40 — Xóa bản trùng NextGo ở công ty cũ, không chép sang HST NextGo

- AI: Cursor. Xóa thêm 230 lead công ty cũ trùng mã hoặc trùng tiêu đề với HST NextGo. Không insert lead/dự án mới vào HST NextGo. Giữ 8 lead Zalo không có bản trên NextGo. HST NextGo vẫn 890 lead, 2.442 hội thoại, 19.469 tin.
- Script: `backend/scripts/purge-nextgo-dup-from-default.js`.

## 2026-10-01 10:30 — Gỡ lead Facebook NextGo khỏi HST mặc định

- AI: Cursor. Trên DB primary, xóa 365 lead nguồn Facebook còn ở công ty NextGo cũ `87479a83` (HST mặc định). Hội thoại, tin nhắn, page và 890 lead HST NextGo giữ nguyên. Nguồn CRM `[FB:1102202982968909]` của công ty cũ đã xóa. Deal `DEAL-2026-998` không có bản trên HST NextGo nên chỉ còn bị gỡ khỏi HST mặc định.
- Script: `backend/scripts/purge-nextgo-fb-from-default.js`. Biên bản: `backend/uploads/_purge_nextgo_fb_from_default_primary_2026-10-01T03-29-42-615Z.json`.
- Backup chưa chạy: công ty HST NextGo trên backup có 0 lead, 524 lead FB vẫn nằm ở công ty cũ. Xóa bên đó sẽ mất bản duy nhất.

## 2026-10-01 09:50 — Nút tích Chuyển công nợ trên setup pipeline xưởng

- AI: Cursor. Tab Cột nhỏ: nút «Chuyển công nợ» gán `board_tab` sang tab Công nợ hoặc trả về Sản xuất. Form sửa cột có ô tích tương ứng.
- File: `frontend/src/pages/ProductionPipelineSettingsPage.jsx`.
- Test: trình duyệt `/sx/pipeline-settings` HCB Tủ bếp, tab Cột nhỏ — nút hiện cạnh Tắt hạn. Form sửa «Tiếp nhận đơn hàng về SX» có checkbox «Chuyển công nợ», đã Hủy không lưu. Cột bộ chung VPT bấm nút báo không có quyền sửa cột toàn hệ thống (đúng quyền cũ).

## 2026-10-01 09:40 — Sửa build: thêm hook useDefaultCompanyOnce

- AI: Cursor. Render fail vì `ProductionDashboard.jsx` import `useDefaultCompanyOnce` nhưng file chưa được commit.
- File: `frontend/src/hooks/useDefaultCompanyOnce.js`.

## 2026-10-01 09:35 — SX: giữ lọc phân loại, Deadline chỉ theo hạn thẻ

- AI: Cursor. `/sx/dashboard` bỏ mục «Tất cả» / «Tất cả loại»; không chọn thì đứng ở loại đầu của xưởng. «Chưa phân loại» vẫn chọn được. Cột Deadline và KPI quá hạn chỉ tính `sx_kanban_deadline_at`, không lấy ngày hoàn thiện / giao / hạn chung.
- File: `ProductionDashboard.jsx`, `WorkshopDashboardFilterPanel.jsx`, `ProductionViews.jsx`, `sxPipelineRevenue.js`, `useWorkshopStaffFilter.js`, `LogisticsDashboard.jsx`, `sxKanbanSummary.js`, `production.js`, `projectDeadlineExport.js`, `tests/sx-deadline-bucket.test.js`.
- Test: trình duyệt `/sx/dashboard` — select còn «Chưa phân loại» và loại của xưởng, không còn «Tất cả». `node tests/sx-deadline-bucket.test.js` in `sx-deadline-bucket: OK`.

## 2026-10-01 08:45 — SX dashboard bỏ dropdown Phân loại: Tất cả

- AI: Cursor. Gỡ select phân loại trên thanh đầu `/sx/dashboard`. KPI và badge cột vẫn theo bộ lọc xưởng; phân loại cụ thể còn trong panel bộ lọc.
- File: `frontend/src/pages/ProductionDashboard.jsx`.
- Test: HMR Vite đã nhận file. Trình duyệt MCP không có phiên đăng nhập nên chưa bấm được board đã login. Ghi chú này bị thay bởi mục 09:35: bộ lọc phân loại được giữ, chỉ bỏ nút Tất cả.

## 2026-09-28 10:02 — Chat không hiện ghi chú panel

- AI: Cursor. Comment `//` trong JSX bị in ra khung chat. Đổi thành `{/* */}`.
- File: `frontend/src/components/MessengerConversationDetailPanel.jsx`.
- Test: đối chiếu diff, chưa mở hội thoại trên trình duyệt.

## 2026-09-28 09:35 — Đặt xưởng khác chỉ cần ngày lấy

- AI: Cursor. Đặt xưởng khác và kế hoạch CRM sang sản xuất chỉ bắt ngày lấy hàng, ngày lắp không bắt buộc.
- File: `SxMultiTargetPicker.jsx`, `ProductionDetail.jsx`, `LeadDetail.jsx`, `CRMDashboard.jsx`, `DealProductionProjectsPanel.jsx`.
- Test: đối chiếu mọi form kế hoạch đều truyền `schedule="pickup"`. Chưa bấm tạo dự án thật.

## 2026-09-26 — Loại HTTP seed mật khẩu, bản sửa local riêng

Founder đã cho phép sửa local và kiểm thử cô lập; chưa cho phép push GitHub hoặc deploy. Nhánh `codex/remove-public-password-seed-20260926` bắt đầu từ SHA Production đã đối chiếu `a458a192e83a4d656561fc87b56f926c16c6140c`, tách khỏi nhánh draft Messenger. Gỡ cả hai handler reset mật khẩu mẫu không có auth trong `backend/src/server.js` và `backend/src/routes/auth.js`; gỡ dòng inventory API không còn hợp lệ. Không thêm seed command, không sửa DB/migration, tài khoản thật hoặc cấu hình Render.

Trạng thái: **local candidate PASS**, 7/7 test và lượt chạy reviewer độc lập PASS; đối chứng baseline phát hiện đúng 2 route trước khi gọi handler. Chưa công bố, chưa Production. Đăng nhập và đổi mật khẩu hợp lệ giữ nguyên code. Chi tiết, lệnh test và giới hạn trong `PASSWORD_SEED_REMOVAL_20260926.md`.

Giới hạn: không require/chạy toàn bộ server hoặc đọc application `.env` vì startup có tác động ra ngoài. Kiểm thử dùng router/handler thực với dependency mock và dữ liệu giả. Chưa xác minh trên Production các tài khoản mẫu còn tồn tại hay có hành vi khai thác.

Hoàn tác local bằng đảo commit này nếu cần, nhưng đưa route cũ trở lại sẽ mở lại lỗ hổng; không dùng việc hoàn tác như biện pháp xử lý bảo mật. Không có thay đổi dữ liệu để rollback. Bản production vẫn cần quy trình staging/review/phê duyệt triển khai riêng.

## 2026-09-25 16:20 — Deadline SX: Quá hạn theo tắt hạn

- AI: Cursor. Thẻ ở cột tắt hạn vẫn bị đếm Quá hạn vì bucket tin hạn giao và stamp server. KPI và tiêu đề cột lấy tổng đó nên lệch thẻ đang hiện.
- File: `sxKanbanSummary.js`, `sxPipelineRevenue.js`, `moduleDeadlinePolicy.js`, `ProductionViews.jsx`, `ProductionDashboard.jsx`.
- Test: `resolveSxDeadlineBucketKey` — TB-2026-493 (Đã giao) = none; TB-2026-920 và TB-2026-934 (hạn thẻ 25/09 17:30) = today. Chưa reload bảng Deadline trên trình duyệt.

## 2026-09-25 13:50 — Đặt xưởng khác: admin Metalla thấy HCB

- AI: Cursor. Modal «Đặt xưởng khác» của admin xưởng bị trống vì danh sách công ty SX khóa đúng một xưởng rồi bị loại khỏi form. Thêm `include_peer_workshops=1` chỉ cho modal này.
- File: `backend/src/routes/companies.js`, `frontend/src/pages/ProductionDetail.jsx`.
- Test: `node --check` companies.js. Chưa bấm đặt đơn thật.

## 2026-09-25 09:36 — Bình luận: dòng chuyển trạng thái nổi bật + thông báo

- AI: Cursor. Lệnh `/` chuyển cột ghi dòng tím trong khung Bình luận và thông báo «Đã chuyển trạng thái». Work Unified có hộp hướng dẫn ở đầu tab Bình luận.
- File: `commentProgressSlash.js`, `CommentsPanels.jsx`, `WorkUnifiedProjectDetailPage.jsx`, `leadComments.js`, `dealCommentNotifications.js`.
- Test: tab Bình luận dự án TB-2026-493 hiện hộp tím và ô nhập «Gõ / để chuyển trạng thái». Chưa bấm chuyển cột trên deal thật.

## 2026-09-25 00:35 — Tắt deadline khi chuyển tới cột mốc

- AI: Cursor. CRM cột Hoàn thành, SX cột tích VC/LĐ, VC/LĐ cột Xong: tự tắt deadline module đó. Bình luận và lịch sử ghi «Đã tắt deadline do chuyển trạng thái».
- File: `backend/src/helpers/stageMoveDeadlineOff.js`, `production.js`, `logistics.js`, `leadLifecycle.js`.
- Test: `node --check` các file trên. Chưa kéo thẻ trên deal thật.

## 2026-09-25 00:20 — Lệnh / hoàn thành theo module, đã giao/đã lắp dùng chung

- AI: Cursor. Cột Hoàn thành CRM/SX/VC chỉ người đúng khối mới thấy. `/Đã giao` và `/Đã lắp` ai cũng có, cả hai chuyển VC/LĐ sang cột lắp (Lắp đặt / Đã lắp / Lắp xong).
- File: `frontend/src/lib/commentProgressSlash.js`, `frontend/src/pages/ProductionDetail.jsx`.
- Test: menu `/` trên deal Tố Nga hiện nhóm Dùng chung «Đã giao», «Đã lắp». Deal chưa có dự án nên chưa bấm chuyển cột.

## 2026-09-24 23:30 — Bình luận: / chuyển tiến độ

- AI: Cursor. Gõ `/` trong bình luận hiện cột pipeline. `/Lắp xong`, `/Đã giao` (có dấu cách, không dấu) chuyển cột SX hoặc VC/LĐ và ghi một dòng bình luận.
- File: `commentProgressSlash.js`, `crmCommentMentions.js`, `crmCommentMentionUi.jsx`, `CommentsPanels.jsx`, `WorkUnifiedProjectDetailPage.jsx`, `ProductionDetail.jsx`, `LeadDetail.jsx`.

## 2026-09-24 14:20 — Hết cảnh báo migration 605 khi mở dự án SX đã xong

- AI: Cursor. PUT trạng thái cột Sản xuất không còn gửi/đọc `logistics_stage_id`. Đồng bộ ngầm «cột xong» không bật `alert`. Thiếu cột 635 báo đúng migration 635.
- File: `backend/src/routes/production.js`, `frontend/src/pages/ProductionDetail.jsx`, `frontend/src/components/CRMTasksTab.jsx`.
- Test: `node --check backend/src/routes/production.js`. Chưa deploy lên Render.

## 2026-09-24 13:10 — Nhiệm vụ và tiến độ dùng chung một tích

- AI: Cursor. Tích cột trên tab Công việc và vòng tròn PipelineStepper đọc/ghi cùng `project_substage_status`. Cột đã đi qua hiện tích cả hai bên. VC/LĐ có danh sách cột lớn và nút hoàn thành cột. SQL 635 thêm `logistics_stage_id` — chưa chạy.
- File: `cotTienDo.js`, `PipelineStepper.jsx`, `CRMTasksTab.jsx`, `ProductionDetail.jsx`, `production.js`, `database/635_vc_substage_status.sql`.

## 2026-09-22 15:25 — VC/LĐ: cột lớn / cột nhỏ + tiến trình như SX

- AI: Cursor. `logistics_pipeline_stages.group_key` + `group_sort` (SQL 632). Tab Cột chính trên `/vc/pipeline-settings`; Gộp cột trên `/vc/dashboard`; stepper chi tiết VC gom theo cột lớn. Không seed group_key live.
- File: `database/632_logistics_pipeline_group_key.sql`, `logistics.js`, `sxGopCot.js`, `LogisticsPipelineSettingsPage.jsx`, `LogisticsDashboard.jsx`, `ProductionDetail.jsx`, `tests/vc-pipeline-group.test.js`.
- Test: `node tests/vc-pipeline-group.test.js`.

## 2026-09-22 14:45 — VC/LĐ: KPI theo cột + Tắt hạn + bộ mẫu ít bấm

- AI: Cursor. Pipeline `/vc/pipeline-settings` thêm tick Đang VC / Đang LĐ / BH / Xong và Tắt hạn (SQL 631). Dashboard đếm theo cột, không theo status thẻ. Tích không reload. `/vc/task-templates` layout cột như SX.
- File: `database/631_logistics_pipeline_dashboard_kpi.sql`, `logistics.js`, `vcOverviewKpis.js`, `moduleDeadlinePolicy.js` (FE+BE), `LogisticsPipelineSettingsPage.jsx`, `LogisticsDashboard.jsx`, `LogisticsViews.jsx`, `WorkshopTaskTemplatesPage.jsx`, `vcPipelineKpi.js`, `vc-mobile/src/lib/vcBoardKpis.ts`, `tests/vc-column-stage-kpi.test.js`.
- Test: `node tests/vc-column-stage-kpi.test.js`.

## 2026-09-22 13:50 — Bộ mẫu SX: gắn theo cột, ít bấm

- AI: Cursor. Bỏ wizard Công ty→Phân loại→Pipeline. Chip loại + danh sách cột; mỗi cột hiện bộ đã gắn và nút + Gắn. Select chuyển cột trên thẻ.
- File: `frontend/src/pages/WorkshopTaskTemplatesPage.jsx`.

## 2026-09-22 11:50 — Gán cột pipeline vào ô Dashboard

- AI: Cursor. Nút tích Đang SX / Chờ VC / Đã VC trên setup pipeline; mỗi công ty map cột vào ô KPI Dashboard. Cột `dashboard_kpi` (SQL 630). Chưa tick thì tự suy như cũ.
- File: `database/630_production_pipeline_dashboard_kpi.sql`, `productionPipelineSchema.js`, `production.js`, `sxPipelineRevenue.js` (FE+BE), `sxKanbanSummary.js`, `workshopKanban.js`, `ProductionPipelineSettingsPage.jsx`, `tests/sx-column-stage-kpi.test.js`.

## 2026-09-22 11:35 — KPI SX theo cờ cột Kanban

- AI: Cursor. Đang SX / Chờ VC / Đã VC đếm theo cột (handover / đã giao), không theo đã gán VC trên dự án.
- File: `sxKanbanSummary.js`, `sxPipelineRevenue.js` (FE+BE), `ProductionDashboard.jsx`, `tests/sx-column-stage-kpi.test.js`.

## 2026-09-22 11:25 — Thứ tự Cột nhỏ theo cột chính

- AI: Cursor. Kéo cột nhỏ/cột chính ghi `order_index` 1…N theo trái→phải, trên→dưới; tab Cột nhỏ đổi số thứ tự theo.
- File: `ProductionPipelineSettingsPage.jsx`.

## 2026-09-22 11:10 — Kéo cột nhỏ lên xuống trong cột chính

- AI: Cursor. Tab Cột chính: kéo cột nhỏ lên/xuống trong thẻ đổi `order_index`; tab Cột nhỏ và Kanban gộp theo thứ tự đó. PUT reorder, không `load()` cả trang.
- File: `ProductionPipelineSettingsPage.jsx`, `sxGopCot.js`.

## 2026-09-22 10:40 — Tích cột pipeline không tải lại trang

- AI: Cursor. Nút Công / Thu / Deadline / Tắt hạn / Bỏ quá hạn / Ẩn cập nhật hàng tại chỗ (optimistic + PUT), không `load()` cả trang.
- File: `ProductionPipelineSettingsPage.jsx`.

## 2026-09-22 10:30 — Nút Tắt hạn trên cột pipeline SX

- AI: Cursor. Cột nhỏ có nút **Tắt hạn**; cột được tích thì kéo thẻ vào sẽ xóa hạn SX và không hiện quá hạn. Flag `clears_deadline` (SQL 629).
- File: `database/629_production_pipeline_clears_deadline.sql`, `productionPipelineSchema.js`, `production.js`, `clearCompletedProjectDeadlines.js`, `crmPipelineSla.js`, `sxKanbanSummary.js`, `workshopKanban.js`, `sxPipelineRevenue.js`, `moduleDeadlinePolicy.js` (FE+BE), `ProductionPipelineSettingsPage.jsx`, tests.
- Test: `node tests/sx-deadline-bucket.test.js`, `sx-delivered-overdue-guard.js`; trình duyệt HCB Tủ bếp Cột nhỏ — hàng «Tiếp nhận đơn hàng về SX» có nút Tắt hạn. Không bật cờ trên cột live.

## 2026-09-22 10:05 — Deadline SX: hiện Quá hạn, Đã giao không đếm lịch sử

- AI: Cursor. Cột Quá hạn «Đã tải 0/2»: gỡ ẩn handover-only; cột Đã giao không đếm `delivery_date` lịch sử. TB-2026-771 hiện; TB-2026-791 hết hạn SX.
- File: `moduleDeadlinePolicy.js` (FE+BE), `sxKanbanSummary.js`, `sxPipelineRevenue.js` (FE+BE), `ProductionViews.jsx`, `ProductionDashboard.jsx`, `production.js`, `tests/sx-deadline-bucket.test.js`.
- Test: `node tests/module-deadline-policy.test.js`, `sx-deadline-bucket.test.js`; trình duyệt `/sx/dashboard` HCB Tủ bếp Deadline — Quá hạn 1 thẻ TB-2026-771.

## 2026-09-22 10:00 — KPI SX theo bộ lọc phân loại

- AI: Cursor. Công nợ/Đã thu dashboard SX lấy `revenue_kpis` từ summary (cùng `workshop_type_id`), không đếm thẻ đã load.
- File: `sxKanbanSummary.js`, `ProductionDashboard.jsx`.
- Test: HCB Tủ bếp → Công nợ 215 / 35.047.380đ; Cánh kính → 175 tổng, Công nợ 6, Đã thu 162.

## 2026-09-22 09:50 — PDF HCB khoanh đỏ nút, từng bước

- AI: Cursor. Ảnh live khoanh số 1–19 (Pipeline, popup Sửa, Dashboard, menu Gộp, Quản lý nhiệm vụ, Giao việc). PDF viết lại theo bước bấm.
- File: `docs/ba/guides/huong-dan-hcb-gop-nhiem-vu/` + `bao-cao/Huong-dan_HCB_Gop-cot-va-Nhiem-vu.pdf`.

## 2026-09-22 09:35 — PDF hướng dẫn HCB gộp cột + nhiệm vụ + công việc

- AI: Cursor. Guide 8 trang: Pipeline Cột chính HCB Tủ bếp, Dashboard gộp + nút Nhiệm vụ, Quản lý nhiệm vụ + nút Công việc, Giao việc TB-2026-787.
- File: `docs/ba/guides/huong-dan-hcb-gop-nhiem-vu/` (PDF, print HTML, 5 PNG, generate-pdf.mjs); bản sao `bao-cao/Huong-dan_HCB_Gop-cot-va-Nhiem-vu.pdf`.

## 2026-09-22 09:16 — Popup sửa cột nhỏ trên tab Cột chính

- AI: Cursor. Nút **Sửa** trên `/sx/pipeline-settings` tab Cột chính mở form trong popup, không chuyển tab.
- File: `ProductionPipelineSettingsPage.jsx`.
- Test: HCB Tủ bếp — Sửa «Thiết kế & lập kế hoạch NVL» và «Chuẩn bị vật tư»; Hủy đóng, vẫn ở Cột chính.

## 2026-09-21 14:50 — Ẩn phân tích hạn SX + nút Sửa cột nhỏ pipeline

- AI: Cursor. Gỡ khối «Kế hoạch SX (tính từ ngày lắp)» khỏi `WorkshopInfoPanel`. Tab Cột chính pipeline: nút **Sửa** trên từng cột nhỏ.
- File: `ProductionDetail.jsx`, `ProductionPipelineSettingsPage.jsx`.
- Test: `/sx/projects/2587e50d-…` không còn khối indigo; `/sx/pipeline-settings` HCB Cánh kính — Sửa «Chuẩn bị Vật tư» mở form.

## 2026-09-21 14:15 — Setup chi phí: lưới nút tích

- AI: Cursor. Vùng «Nút tích» thành lưới thẻ (chọn thẻ → gắn nhiệm vụ), nhiệm vụ 2 cột; bỏ bảng tổng hợp + chuỗi 6 bước.
- File: `AccountingCostSetupPage.jsx`.
- Test: trình duyệt `/management/cost-setup` Phúc Đạt — thẻ Báo giá CRM, lưới nhiệm vụ, tab SX trống + form thêm nút.

## 2026-09-21 13:20 — Đơn hàng: điền khách hàng trên danh sách

- AI: Cursor. Cột Khách hàng `/crm/orders` bấm để nhập tên/SĐT/địa chỉ thay vì `-`.
- File: `OrdersPage.jsx`, `commercialDocs.js` (`ORDER_LIST_SELECT`).

## 2026-09-21 09:35 — CRM Deadline luôn hiện hạn (gỡ ẩn SĐT / đã SX)

- AI: Cursor. Gỡ ẩn hạn CRM khi thiếu SĐT hoặc đã có `project_id`. Badge `0/1` là loaded/total server; FE không còn đẩy thẻ sang «Không hạn» vì hai điều kiện đó.
- File: `crmLeadDeadlineDisplay.js`, `moduleDeadlinePolicy.js` (FE+BE), `leadsList.js`, `CrmLeadDeadlineOverview.jsx`, `LeadDetail.jsx`, `628_crm_deadline_always_show.sql`, `DECISIONS.md` AI-002.
- Test: `node tests/module-deadline-policy.test.js`. SQL 628 đã chạy primary + backup.

## 2026-09-19 15:05 — CRM setup chi phí dùng nút Báo giá có sẵn

- AI: Cursor. Không tạo nút tích CRM mới: `ensureCrmQuotationCostType` lấy nút Upload Excel Báo giá, gắn loại `bao_gia` / `doanhthu.bao_gia`. Tab CRM ẩn form «Thêm nút tích». Báo giá doanh thu vẫn đẩy giá vốn dòng vào `crm.product_cogs`.
- File: `costHub.js`, `costLedger.js`, `AccountingCostSetupPage.jsx`.
- Test: `node tests/cost-ledger.test.js`. Phúc Đạt 183 NV đã gắn.

## 2026-09-19 08:50 — Loại chi phí + Excel + công thức

- AI: Cursor. Tạo loại chi phí theo module, gắn bộ mẫu; checkbox setup công việc bắt upload Excel; công thức `excel.a - (excel.b + excel.c)` nhiều công thức; tab Kế toán upload Excel.
- File: `624_cost_types_excel.sql`, `costLedger.js`, `costHub.js`, `AccountingCostSetupPage.jsx`, template SX/CRM, `CostExcelUpload.jsx`, `WorkUnifiedProjectDetailPage.jsx`.
- Test: `node tests/cost-ledger.test.js`.

## 2026-09-18 16:40 — Setup chi phí: module + toán tử

- AI: Cursor. Trang setup: bật module vào sổ, ghép công thức bằng +, −, ×, / (dropdown).
- File: `AccountingCostSetupPage.jsx`, `costFormulaTerms.js`.

## 2026-09-18 16:20 — Setup chi phí chọn công ty + khu vực

- AI: Cursor. Admin HST chọn công ty/khu vực trên `/management/cost-setup`.
  Khu vực clone mặc định toàn công ty rồi chỉnh riêng (`region_id`, SQL 623).
- File: `623_cost_hub_region.sql`, `costLedger.js`, `costHub.js`, `AccountingCostSetupPage.jsx`.

## 2026-09-18 15:55 — Setup chi phí ở module Dự án + tab Kế toán Work Unified

- AI: Cursor. Gắn setup công thức vào nhóm **3. Thiết lập** (`/management/cost-setup`).
  Tab chi tiết Work Unified đổi **Kế toán** (`?tab=ketoan`) — sổ giá vốn / lợi nhuận
  + dòng tiền. API `GET /projects/:id/cost-summary`.
- File: `Sidebar.jsx`, `App.jsx`, `sidebarModuleContext.js`, `AccountingCostSetupPage.jsx`,
  `WorkUnifiedProjectDetailPage.jsx`, `projects.js`.

## 2026-09-18 14:55 — Sổ chi phí + setup công thức theo module

- AI: Cursor. Sổ `/ketoan/chi-phi`, setup công thức, ledger `cost_entries`.
- File: `622_cost_hub.sql`, `costLedger.js`, `costExpr.js`, `costHub.js`, 2 trang Kế toán, adapter SX/PO/VC/CRM COGS.
- Test: `node tests/cost-ledger.test.js`.
- SQL 622 đã chạy primary + backup.

## 2026-09-18 14:38 — Push nốt ecosystem_admin + gắn công ty HST

- AI: Cursor. Đẩy quyền role mới, Facebook HST, sync `user_companies`.

## 2026-09-18 14:35 — CRM Kanban 400 thiếu company_id trên production

- AI: Cursor. Production `userIsAdmin === admin` nên JWT `ecosystem_admin`
  bị 400. Deploy helpersBundle + adminRole BE/FE + crmAccessRoles.

## 2026-09-18 14:30 — Xóa Linh Tây Ninh + Vân Long Xuyên

- AI: Cursor. Xóa 2 công ty inactive (0 lead/project) trên primary+backup.
  Gỡ `user_companies`; giữ unit/dự án thật. Sync HST chỉ gắn công ty active.
- `admin@tubep.vn` còn 5 công ty.

## 2026-09-18 14:20 — Gắn mọi công ty HST cho admin hệ thống

- AI: Cursor. `user_companies` đủ công ty tenant cho ecosystem_admin.
  Không set `users.company_id`. File: `hstAdminCompanies.js`, login `/me`,
  tạo công ty, Users POST/PUT, SQL 621.
- `admin@tubep.vn`: 7 công ty.

## 2026-09-18 14:10 — Admin HST không bắt company_id trên CRM

- AI: Cursor. `userIsAdmin` thiếu `ecosystem_admin` nên JWT mới bị 400
  «Thiếu company_id của user». File: `helpersBundle.js`.
- Test: `node -e` userIsAdmin('ecosystem_admin') === true.

## 2026-09-18 11:50 — Role quản trị hệ sinh thái (ecosystem_admin)

- AI: Cursor. Thêm enum `ecosystem_admin`, gán `admin@tubep.vn`.
  Helper BE/FE coi role này là admin HST (không `platform_admin`).
  File: `620_user_role_ecosystem_admin.sql`, `adminRole.js`, UsersPage,
  `crmAccessRoles.js`, `facebook.js`.
- Test: `node tests/facebook-lead-chat-scope.test.js`, `npm run test:role-enum`.
- Cần đăng nhập lại để JWT nhận role mới.

## 2026-09-18 11:35 — Admin HST xem hội thoại Facebook trên deal

- AI: Cursor. Admin cả hệ sinh thái (`admin` + `tenant_id`, không khoá
  công ty) xem thread deal trong HST dù Page chưa map công ty. File:
  `facebook.js`, test `facebook-lead-chat-scope.test.js`.
- Test: `node tests/facebook-lead-chat-scope.test.js`.

## 2026-09-18 11:25 — Admin hệ thống xem hội thoại Facebook trên deal

- AI: Cursor. 403 vì lọc Page theo đúng công ty deal. Admin hệ thống
  dùng phạm vi tenant (hoặc all) + cho thread đã gắn lead. File:
  `facebook.js`, `FacebookChatTab.jsx`, test `facebook-lead-chat-scope.test.js`.
- Test: `node tests/facebook-lead-chat-scope.test.js`.

## 2026-09-17 11:45 — Trang cá nhân: cập nhật họ tên và SĐT

- AI: Cursor. Nút **Cập nhật** trên card Thông tin. PATCH profile/me
  nhận `phone`. File: `EditMyNameModal.jsx`, `SocialProfilePage.jsx`,
  `internalSocial.js`.

## 2026-09-17 11:05 — Gửi nhắc tất cả dự án trễ hạn Work Unified

- AI: Cursor. Bấm **Nhắc tiến độ (36)** VPT: 36 bình luận @ người chịu
  trách nhiệm. Proxy Vite cắt ~120s nên UI báo lỗi dù BE vẫn gửi nốt.
  Sửa: gửi song song 5; timeout `/api` 180s.
- Test: `node tests/work-unified-progress-reminder.test.js`.

## 2026-09-17 10:50 — Qua cột Lắp đặt CRM thì hết hạn lắp

- AI: Cursor. PATCH stage CRM sau Lắp đặt tắt hạn lắp (CSKH → warranty;
  Hoàn thành → project_final). File: `crmDealStageGate.js`,
  `moduleDeadlinePolicy.js`, `completeOpenWorkOnModuleDone.js`,
  `leadLifecycle.js`, `management.js`.
- Test: `node tests/module-deadline-policy.test.js`.

## 2026-09-17 10:40 — Nhắc tiến độ dự án quá hạn trên Work Unified

- AI: Cursor. Nút Nhắc tiến độ gửi bình luận @ người chịu trách nhiệm
  (tab Thành viên) cho dự án `forecast=late`. File:
  `workUnifiedProgressReminder.js`, `management.js`,
  `WorkUnifiedOverviewPage.jsx`, test `work-unified-progress-reminder.test.js`.
- Test: `node tests/work-unified-progress-reminder.test.js` OK.

## 2026-09-17 10:10 — Dọn hạn chồng theo vòng đời CRM → SX → lắp

- AI: Cursor. SQL 619 đã chạy primary + backup. Xóa hạn CRM trên
  Thua/Thắng và deal đã lập SX; xóa hạn SX sau giao/bàn giao VC.
  Không đụng ngày giao/lắp. Script:
  `backend/scripts/sync-lifecycle-deadlines.js`.
- Primary trước→sau: thẻ mất 634→0, NV mất 768→0, hạn SX sau giao 13→0.
- Backup: 409/744/2 → 0.

## 2026-09-17 09:40 — Một hạn theo vòng đời CRM → SX → lắp

- AI: Cursor. Policy: CRM lập SX thì hết hạn CRM; SX giao/bàn giao VC thì
  hết hạn SX và đếm hạn lắp; lắp xong thì hết hạn. File:
  `moduleDeadlinePolicy.js` (BE+FE), `crmLeadDeadlineDisplay.js`,
  `leadsList.js`, test, `DECISIONS.md` AI-002.
- Test: `node tests/module-deadline-policy.test.js`,
  `node tests/project-overview-deadline.js` OK.

## 2026-09-16 16:05 — Bật/tắt từng API cảnh báo hạn

- AI: Cursor. Cột công tắc trên bảng API đã cấu hình; tắt thì cron
  không gửi API đó. File: `ProjectDeadlineDispatchPage.jsx`,
  `dashboard.js`, `projectDeadlineDispatch.js`.

## 2026-09-16 16:00 — Bật/tắt cảnh báo hạn + gán hạn nhiệm vụ

- AI: Cursor. Trang `/management/project-deadlines` thêm công tắc
  cảnh báo Zalo toàn hệ thống và gán hạn module vào việc trống.
  File: `ProjectDeadlineDispatchPage.jsx`, `dashboard.js`,
  `projectDeadlineDispatch.js`, `workTasks.js`.

## 2026-09-16 15:40 — Ghi hạn module vào việc con trống trên tổng quan NV

- AI: Cursor. Việc mở chưa có `due_date`/`deadline` được ghi hạn module
  khi tải `/work-tasks/project-overview`. Mẫu xưởng mới cũng nhận hạn
  lúc tạo. File: `projectOverviewDeadline.js`, `workTasks.js`,
  `workshopApplyTemplates.js`.

## 2026-09-16 15:25 — Tổng quan NV: hạn thẻ theo deadline module

- AI: Cursor. Thẻ `/sx/project-tasks` lấy hạn module (SX / VC-LĐ / CRM)
  theo lane nhóm việc; việc con không hạn không còn đẩy thẻ vào
  «Chưa có hạn» nếu dự án đã có hạn xưởng/lắp/deal. File:
  `workTasks.js`, `projectOverviewDeadline.js`, `moduleDeadlinePolicy.js`,
  `tests/project-overview-deadline.js`.

## 2026-09-16 14:20 — Stepper CRM tích ✓ khi SX/VC đã kéo tới

- AI: Cursor. Cột Sản xuất / VC / Hoàn thành trên thanh tiến độ deal
  không còn trống nếu module xưởng/VC đã vào cột tương ứng (kể cả khi
  thẻ CRM chưa kéo theo). Bỏ rule cũ «không bao giờ ✓ cột SX/VC».
  File: `PipelineStepper.jsx`, `crmDealStageGate.js`, `LeadDetail.jsx`,
  `WorkUnifiedProjectDetailPage.jsx`.

## 2026-09-16 13:40 — Hạn Work Unified = buổi lắp VC-LĐ còn lại

- AI: Cursor. Bỏ chống chế «SX đã giao + VC Tiếp nhận thì không trễ».
  Trước khi sửa `routes/management.js`: `queryWorkUnifiedList` /
  `buildItem` dùng `resolveModuleDeadline(logistics)` sau khi gắn
  sự kiện lắp. Hạn = buổi lắp gần nhất ≥ hôm nay (đang lắp vẫn theo
  lịch VC); hết buổi thì ngày cuối — quá hạn nếu chưa Hoàn thành.
  File: `moduleDeadlinePolicy.js` (BE+FE), `projectForecast.js`,
  `management.js`, `projectDealBundle.js`, test deadline + forecast.

## 2026-09-16 13:30 — Work Unified: không trễ khi SX đã giao, VC còn Tiếp nhận

- AI: Cursor. Trước khi sửa `routes/management.js` (vùng dùng chung):
  `classifyProjectForecast` + `queryWorkUnifiedList` (`buildItem`).
  Bỏ tính Trễ hạn ngày lắp khi cột SX đã giao/hoàn thành/chốt công nợ
  và VC còn Tiếp nhận (`delivery_pending`) hoặc chưa có cột VC.
  Đơn đã vào giao/lắp VC vẫn trễ nếu hạn lắp quá khứ.
  File: `projectForecast.js`, `management.js`, `projectDealBundle.js`,
  `project-forecast-gcck.js`.

## 2026-09-16 12:10 — CRM Pipeline tự thêm thành viên theo cột

- AI: Cursor. Setup trên `/crm/pipeline-settings`: tick «Tự thêm thành
  viên CRM khi vào cột», chọn NV (forModule=all, gồm kế toán). Áp khi
  kéo Kanban, lập KH SX, gắn VC-LĐ. SQL 618 + seed Vân cột Đã ký HĐ
  Phúc Đạt. Bỏ hardcode ALWAYS_PHUCDAT.
  File: `PipelineSettingsPage.jsx`, `pipelines.js`,
  `crmPipelineStageMembers.js`, `leadLifecycle.js`, `autoDealWonProject.js`,
  `618_crm_pipeline_stage_default_members.sql`.

## 2026-09-16 11:55 — Phúc Đạt mặc định thêm NV Vân vào deal SX/VC

- AI: Cursor. Deal Phúc Đạt: tự thêm Hoàng Thị Phượng Vân vào tab
  Thành viên khi lập kế hoạch SX và khi gắn VC-LĐ. SQL 617 backfill
  38 deal đang chạy (ký HĐ → hóa đơn, không gồm hoàn thành).
  File: `dealParticipantProduction.js`, `vcHandoverDealMembers.js`,
  `productionWorkshopTypeStaff.js`, `617_phucdat_van_signed_deal_members.sql`.

## 2026-09-16 11:50 — HCB Cánh kính hoàn thành SX tắt hạn toàn dự án

- AI: Cursor. Cột Hoàn thành Cánh kính HCB đóng hết NV còn mở + tắt
  deadline CRM/SX/VC (status completed) để bên khác không quá hạn.
  File: `completeOpenWorkOnModuleDone.js`, `clearCompletedProjectDeadlines.js`,
  `projectForecast.js`. Test: `project-forecast-gcck.js`.

## 2026-09-16 11:20 — Mũi tên cuộn trang Quản lý nhiệm vụ

- AI: Cursor. Board hạn nhiệm vụ dùng cùng chrome mũi tên Dashboard
  Kanban. File: `ProjectTasksOverviewPage.jsx`.

## 2026-09-16 11:05 — Nút Nhiệm vụ trên thẻ Kanban

- AI: Cursor. Đưa nút quản lý nhiệm vụ lên đầu thẻ, gắn nhãn «Nhiệm vụ».
  SX, VC, Work Unified. File: `KanbanGotoProjectTasksBtn.jsx`,
  `ProductionDashboard.jsx`, `LogisticsDashboard.jsx`,
  `WorkUnifiedOverviewPage.jsx`.

## 2026-09-16 10:25 — Thêm cột nhỏ ngay thẻ cột chính

- AI: Cursor. Nút Thêm cột nhỏ trong từng thẻ (và thẻ nét đứt).
  POST `/production/pipeline-stages` nhận `group_sort`. File:
  `ProductionPipelineSettingsPage.jsx`, `production.js`.

## 2026-09-16 10:15 — Kéo cột nhỏ giữa các cột chính

- AI: Cursor. Setup pipeline: thả cột nhỏ vào danh sách bên trong thẻ
  cột chính (không chỉ viền thẻ). Phân biệt kéo cột nhỏ vs kéo thứ tự
  cột chính. File: `ProductionPipelineSettingsPage.jsx`.

## 2026-09-16 09:25 — Setup pipeline quanh cột chính

- AI: Cursor. Trang Pipeline xưởng: tab Cột chính (bảng thẻ), Cột nhỏ,
  Cài đặt. Công ty + phân loại trên cùng. File:
  `ProductionPipelineSettingsPage.jsx`.

## 2026-09-16 09:00 — Thêm cột Đóng gói HCB (Tủ bếp)

- AI: Cursor. Chèn cột pipeline «Đóng gói» Tủ bếp (trước KCS).
  Cửa/Cánh kính giữ «Vệ sinh đóng gói». SQL 616 primary+backup.
  File: `616_hcb_dong_goi_pipeline_column.sql`.

## 2026-09-16 08:50 — Hiện cột lớn Đóng gói HCB

- AI: Cursor. Gộp 1 cột nhỏ vẫn hiện tên cột lớn. Tủ bếp gán
  `dong_goi` cho «ĐƠN HÀNG ĐÃ CHUẨN BỊ XONG». File: `sxGopCot.js`,
  `ProductionDashboard.jsx`, `615_hcb_tubep_dong_goi_group_key.sql`.

## 2026-09-15 16:40 — Tự thêm tab Kanban xưởng

- AI: Cursor. Nút + Tab trên setup cột lớn; `board_tab` lưu tên tab
  tự đặt. Dashboard lặp các tab có cột (Sản xuất + Công nợ + tab mới).
  File: `sxTachCongNo.js`, `ProductionPipelineSettingsPage.jsx`,
  `ProductionDashboard.jsx`, `production.js`.

## 2026-09-15 16:20 — Cột lớn theo tab Sản xuất / Công nợ

- AI: Cursor. Settings Gộp cột + khối Cột pipeline có switcher
  Sản xuất / Công nợ như Dashboard. Tạo/chuyển cột lớn gắn
  `board_tab` — Kanban hiện đúng tab. SQL 614 primary+backup.
  File: `614_production_pipeline_board_tab.sql`, `sxTachCongNo.js`,
  `ProductionPipelineSettingsPage.jsx`, `productionPipelineSchema.js`,
  `workshopKanban.js`, `production.js`.

## 2026-09-15 16:05 — Form thêm cột lớn trên tab Cột pipeline

- AI: Cursor. Cùng form Thêm cột lớn trên tab Cột pipeline (khối
  violet «Cột lớn — giai đoạn nối tiếp»). File:
  `ProductionPipelineSettingsPage.jsx`.

## 2026-09-15 15:30 — Form thêm cột lớn trên tab Gộp cột

- AI: Cursor. Khối «Cột lớn đang dùng» có form tạo cột lớn: tên,
  chip gợi ý, checkbox cột pipeline. File:
  `ProductionPipelineSettingsPage.jsx`.

## 2026-09-15 15:15 — Ô Cột lớn: dropdown tên tiếng Việt

- AI: Cursor. Bảng gán cột lớn bỏ input+datalist slug. Dropdown
  nhãn «Tiếp nhận»…, lưu khi chọn, mục «+ Tên mới…». File:
  `ProductionPipelineSettingsPage.jsx`, `sxGopCot.js`.

## 2026-09-15 15:00 — Gộp cột: kéo thứ tự + sửa tên tại chỗ

- AI: Cursor. Tab Gộp cột đổi lưới 3 cột thành danh sách: kéo /
  ↑↓ đổi thứ tự cột lớn, ô tên lưu khi blur, hiện cột nhỏ, lọc NV.
  Cột `group_sort` (SQL 613, primary + backup). File:
  `ProductionPipelineSettingsPage.jsx`, `sxGopCot.js`,
  `productionPipelineSchema.js`, `workshopKanban.js`, `production.js`.

## 2026-09-15 14:40 — Đóng gói sau Hoàn thiện (Gộp cột)

- AI: Cursor. Lưới Gộp cột + Kanban gộp: `dong_goi` luôn sau
  `hoan_thien`. File: `sxGopCot.js`, `ProductionPipelineSettingsPage.jsx`.

## 2026-09-15 14:20 — Cột lớn Đóng gói (HCB Cửa/Cánh kính)

- AI: Cursor. Tách «Vệ sinh đóng gói» khỏi Hoàn thiện → `dong_goi`.
  File: `612_hcb_dong_goi_group_key.sql`, `sxGopCot.js`,
  `sxWorkshopSchedule.js`, `ProductionPipelineSettingsPage.jsx`.
  Chạy: `node scripts/run-migration-612.js`.

## 2026-09-15 14:15 — CRM: nút Zalo Đã gửi

- AI: Cursor. Chi tiết deal: nút Gửi Zalo → **Đã gửi Zalo** sau khi
  gửi thành công; đọc lại từ `crm_zalo_stage_sends`. File:
  `LeadDetail.jsx`, `leadLifecycle.js`, `helpersBundle.js`.
  Đã kiểm DEAL-2026-1549 (Nam test) hiện Đã gửi; deal chưa gửi
  vẫn Gửi Zalo. Không bấm gửi thật trên deal khách.

## 2026-09-15 13:45 — Pipeline xưởng: lọc + NV cột lớn

- AI: Cursor. Tab Gộp cột: lọc Công ty/Loại; gán người chịu trách
  nhiệm cột lớn (default_staff primary). File:
  `ProductionPipelineSettingsPage.jsx`, `ProductionDashboard.jsx`,
  `sxStageStaff.js`.

## 2026-09-15 13:25 — Lịch Work Unified: chip đủ nhận diện

- AI: Cursor. Ô ngày: mã + khách/tên ngắn · NV. Panel ngày: thêm
  Hạn SX / Giao / Lắp. File: `WorkUnifiedOverviewPage.jsx`.

## 2026-09-15 13:15 — Work Unified Deadline: cột Ngày mai

- AI: Cursor. Board Deadline thêm bucket `tomorrow` (label Ngày mai)
  giữa Hôm nay và Tuần này. File: `WorkUnifiedOverviewPage.jsx`.

## 2026-09-15 11:25 — Thanh nhiệm vụ: chỉ tìm kiếm

- AI: Cursor. Bỏ chip «Sản xuất · N»; thanh còn ô tìm, lọc từng chữ.
  File: `ProjectTasksOverviewPage.jsx`.

## 2026-09-15 11:20 — Thẻ nhiệm vụ → Giao việc + Nhật ký

- AI: Cursor. Thẻ `/sx/project-tasks` mở `/sx/assignments?project_id=`;
  nút **Công việc** (tab tasks dự án), không phải nhật ký.
  File: `ProjectTasksOverviewPage.jsx`, `CRMAssignmentsPage.jsx`,
  `assignmentSourceLink.js`.

## 2026-09-15 10:55 — Bộ lọc nhiệm vụ = Phạm vi xưởng Dashboard

- AI: Cursor. Panel `/sx/project-tasks` dùng `WorkshopScopeFields` (xưởng +
  công ty đặt hàng). API `deal_company_id`. File:
  `ProjectTasksOverviewPage.jsx`, `ProjectTasksFilterPanel.jsx`,
  `WorkshopDashboardFilterPanel.jsx`, `workTasks.js`.

## 2026-09-15 10:52 — Menu SX: Dashboard

- AI: Cursor. Nhãn sidebar `/sx/dashboard` «Deal vào xưởng» → Dashboard.
  File: `Sidebar.jsx`.

## 2026-09-15 10:50 — Bộ lọc nhiệm vụ SX theo Dashboard

- AI: Cursor. `/sx/project-tasks` dùng xưởng `for_module=production`
  (Metalla/HCB/Phúc Đạt), KV+NV `for_module=production`, đồng bộ
  `sx_dash_filters_v1`. File: `ProjectTasksOverviewPage.jsx`,
  `ProjectTasksFilterPanel.jsx`, `crossWorkshopProduction.js`,
  `WorkUnifiedFilterFields.jsx`, `Sidebar.jsx`.

## 2026-09-15 10:35 — Tắt NextGo trên HST mặc định

- AI: Cursor. `is_active=false` cho công ty nguồn
  `87479a83-1145-43b7-b090-3e40812cb5a9` (tenant default).
  Primary: `freeze-nextgo-source.js --apply`. Backup: MCP SQL.
  Clone HST nextgo không đổi. Cache `/companies` ~120s.

## 2026-09-15 10:15 — Bộ lọc NV: NV theo CT / khu vực

- AI: Cursor. Danh sách người phụ trách lọc theo công ty và khu vực
  (`crm_region_ids`). File: `ProjectTasksOverviewPage.jsx`,
  `ProjectTasksFilterPanel.jsx`.

## 2026-09-15 10:08 — Bộ lọc NV: chọn nhiều nhân viên

- AI: Cursor. Người phụ trách trên panel nhiệm vụ dự án là checkbox,
  chọn 1 hoặc nhiều. File: `ProjectTasksFilterPanel.jsx`,
  `ProjectTasksOverviewPage.jsx`.

## 2026-09-15 09:50 — Bộ lọc NV dự án: công ty / khu vực / nhân viên

- AI: Cursor. Panel bộ lọc `/sx/project-tasks` nạp đủ CT/KV/NV; khu vực
  SX lấy từ deal của dự án. File: `ProjectTasksOverviewPage.jsx`,
  `ProjectTasksFilterPanel.jsx`, `workTasks.js`.

## 2026-09-15 09:41 — Kanban SX: nút NV to, tách riêng

- AI: Cursor. Nút quản lý nhiệm vụ trên thẻ Kanban xưởng 32px, nền tím,
  nằm riêng khỏi cụm icon nhỏ. File: `ProductionDashboard.jsx`.

## 2026-09-15 09:22 — Push main: Zalo nút gửi + FE local

- AI: Cursor. Push `main`: nút Gửi Zalo mọi cột, tắt tự gửi; Work Unified
  bỏ chip module; menu 3. Setup xưởng; tab gộp cột pipeline SX.

## 2026-09-15 09:08 — Nút Gửi Zalo mọi cột deal

- AI: Cursor. Nút hiện trên mọi deal, không cần cột Hoàn thành. API
  fill/send thủ công bỏ chặn cột. Tự gửi khi kéo cột vẫn tắt.
- File: `LeadDetail.jsx`, `taxonomy.js`, `helpersBundle.js`.

## 2026-09-15 09:05 — Tắt tự gửi Zalo khi kéo cột

- AI: Cursor. `maybeSendZaloOnDealStageEnter` no-op. Ẩn toggle Zalo
  trên pipeline. Nút **Gửi Zalo** trên chi tiết deal giữ nguyên.
- File: `helpersBundle.js`, `PipelineSettingsPage.jsx`, `LeadDetail.jsx`.

## 2026-09-15 08:58 — Pipeline Zalo: hiện token từ OA accounts

- AI: Cursor. Tab Cài đặt Pipeline → Zalo OA hiện nguồn
  `zalo_oa_accounts` (tự refresh). PUT/preview dùng token hiệu lực.
- File: `taxonomy.js`, `PipelineSettingsPage.jsx`.

## 2026-09-15 08:50 — CRM: hiện lại nút Gửi Zalo OA

- AI: Cursor. Header chi tiết deal (cột Hoàn thành) hiện lại nút **Gửi Zalo**.
- File: `LeadDetail.jsx`.

## 2026-09-15 08:40 — Work Unified: bỏ chip CRM/SX/VC

- AI: Cursor. Thẻ Kanban/Deadline không hiện badge module. Calendar
  bỏ chip tương tự. File: `WorkUnifiedOverviewPage.jsx`.

## 2026-09-14 16:46 — Nhóm menu 3. Setup xưởng

- AI: Cursor. Sidebar SX: «3. Điều hành xưởng» → **3. Setup xưởng**.
- File: `Sidebar.jsx`, `dictionary.en.js`.

## 2026-09-14 16:30 — Zalo ZNS dùng token OA hiệu lực

- AI: Cursor. `getZaloAccessTokenHieuLuc` đọc `zalo_oa_accounts` rồi mới
  dự phòng `app_settings`. File: `zaloTokenHieuLuc.js`, `helpersBundle.js`,
  `taxonomy.js`.

## 2026-09-14 16:00 — Fix build Render: GiaVonExcelModal

- AI: Cursor. Commit `frontend/src/components/GiaVonExcelModal.jsx` vì trang
  mẫu nhiệm vụ đã import, deploy thiếu file.

## 2026-09-14 14:55 — Chi tiết SX: ẩn tab Sự cố

- AI: Cursor. Ẩn nút tab «Sự cố» trên `ProductionDetail`; URL cũ
  `?tab=incidents` không còn trong `DEAL_TAB_KEYS` nên về tab Công việc.
- File: `ProductionDetail.jsx`.

## 2026-09-14 14:30 — Cánh kính/Cửa: bỏ yêu cầu hoàn thành việc trước khi kéo

- AI: Cursor. Gate nhiệm vụ không còn chặn kéo cột Cánh kính và Cửa (BE + SQL 611
  tắt `blocks_stage_advance` mọi mẫu/task hai loại). Tủ bếp giữ nguyên.
- File: `workshopStageAdvanceGate.js`, `database/611_hcb_canh_kinh_cua_khong_chan_keo.sql`.

## 2026-09-14 14:20 — Cánh kính: kéo Tiếp nhận sang sản xuất

- AI: Cursor. Quản lý Nguyễn Nhật không kéo được vì 3 crm_tasks Tiếp nhận
  (Tiếp nhận thông tin / Chốt yêu cầu KT / Vẽ kế hoạch) `blocks_stage_advance`.
- Tắt cờ chặn Cánh kính+Cửa cột Tiếp nhận. Kanban SX mở `BlockingTasksAlertModal`.
- File: `database/610_hcb_canh_kinh_tiep_nhan_khong_chan_keo.sql`, `ProductionDashboard.jsx`.

## 2026-09-14 14:15 — Bình luận: hết nút tải file trùng

- AI: Cursor. Tin hệ thống 📎 vừa link tên file vừa chip Paperclip — 1 file
  hiện 2 chỗ tải. Pill chỉ còn «tên»; chip/preview là chỗ tải duy nhất.
- File: `CommentsPanels.jsx`. DB TB-2026-817 không nhân đôi bản ghi.

## 2026-09-14 14:05 — HCB: đủ thành viên mặc định trên dự án

- AI: Cursor. CRM→SX HCB không còn `primaryOnly` — copy đủ NV setup phân loại.
  SQL 609 bổ sung đội đang thiếu (không đổi phụ trách chính). File:
  `productionWorkshopTypeStaff.js`, `database/609_hcb_fill_workshop_type_staff.sql`.
- RPC: `node scripts/run-migration-609.js` primary + backup, incomplete = 0.

## 2026-09-14 13:55 — Cánh kính HCB: hiện lại cột thanh toán

- AI: Cursor. Cột Đợi thanh toán (8 thẻ) vẫn còn trên DB nhưng `group_key=cong_no`
  nên Kanban SX đẩy sang tab Công nợ. Gỡ group_key Cánh kính/Cửa; Tủ bếp không đổi.
- File: `database/608_hcb_canh_kinh_hien_cot_thanh_toan.sql`, `sxTachCongNo.js`.

## 2026-09-14 13:35 — Tab Công việc SX: Xong hết + hiện việc

- AI: Cursor. Cột lớn/cột nhỏ trên tab Công việc: nút hoàn thành hàng loạt
  và nút hiện/ẩn danh sách nhiệm vụ thuộc cột đó.
- File: `CRMTasksTab.jsx`.

## 2026-09-14 12:20 — NV xưởng dùng hạn kế hoạch SX

- AI: Cursor. API project-overview gắn deadline kế hoạch (tính từ ngày lắp)
  vào nhóm nhiệm vụ khi task chưa có hạn; cột con kế thừa hạn nhóm cha.
- File: `workTasks.js`, `sxInstallPlanKanbanDeadline.js`, `sxWorkshopSchedule.js`,
  `ProductionDetail.jsx`, `production.js`, `projects.js`.

## 2026-09-14 12:00 — Kanban SX: nút nhiệm vụ theo dự án

- AI: Cursor. Thẻ Kanban xưởng thêm nút CheckSquare → `/sx/project-tasks?project=`.
  Trang quản lý NV lọc đúng dự án, chip có thể bỏ lọc.
- File: `ProductionDashboard.jsx`, `ProjectTasksOverviewPage.jsx`.

## 2026-09-14 11:36 — Deadline Work Unified: thẻ gọn

- AI: Cursor. View Deadline lược ĐA MODULE / deal / SĐT / CRM·SX·VC.
  Hiện rõ Hạn SX, Giao, Lắp từng dòng + công đoạn · NV. File:
  `WorkUnifiedOverviewPage.jsx`.

## 2026-09-14 11:28 — Quản lý NV xưởng: cột theo hạn

- AI: Cursor. Trang `/sx/project-tasks` đổi 3 cột rủi hạn thành 6 cột:
  Quá hạn, Hôm nay, Ngày mai, Trong tuần, Tuần sau, Chưa có hạn.
- Thẻ trong cột: mã + hạn trên cùng, tên việc, dự án, thanh tiến độ, người phụ trách.
- File: `ProjectTasksOverviewPage.jsx`, `ProjectTasksFilterPanel.jsx`.

## 2026-09-14 11:30 — Hạn + NV phụ trách trên cột gộp

- AI: Cursor. Phân tích deadline chi tiết SX theo cột gộp; ô ma trận hiện hạn từ ngày lắp
  và người setup ở Cài đặt pipeline. `sxKanbanStages` thêm `deadline_group` + `default_staff`.

## 2026-09-14 10:28 — Chi tiết: tích hoàn thành trên vòng tròn tiến độ

- AI: Cursor. `PipelineStepper`: vòng tròn việc song song = tích xong / bỏ tích.
  Việc đã xong hiện ✓ và đếm n/m trên cột lớn. Tên cột vẫn chuyển thẻ Kanban.

## 2026-09-14 10:20 — HCB Tủ bếp: tách Ban thành phẩm

- AI: Cursor. Mở cột Ban thành phẩm thành Chuẩn bị vật tư / Đặt kính / Sơn.
- 3 đơn (TB-2026-839, 841, 842) ở lại Chuẩn bị vật tư.
- File: `database/607_hcb_tubep_split_ban_thanh_pham.sql`. RPC primary OK; backup cần 604 rồi 607.

## 2026-09-14 10:05 — Work Unified: số KPI ổn định khi đổi tab tiến độ

- AI: Cursor. Tab Tất cả / Đúng tiến độ / Nguy cơ / Trễ đang refetch và trộn
  `totalFiltered` (danh sách đã cắt) với `stats.total` (đôi khi chưa cùng lọc NV)
  → 34 nhảy 79. KPI luôn lấy `stats` của tập chưa cắt forecast; tab lọc trên client
  (trừ danh sách phân trang). File: `frontend/src/pages/WorkUnifiedOverviewPage.jsx`.

## 2026-09-12 11:35 — Ô Đang làm ma trận SX hiện tên dự án

- AI: Cursor. `SxMaTranSongSong` ghi `item.name` / tiêu đề deal dưới nhãn Đang làm và Xong.

## 2026-09-12 10:55 — Deadline không ẩn vì «đã tương tác»

- AI: Cursor. Admin Q2 (`adminq2@vpt.net`) không thấy LEAD-2026-279 ở Deadline
  vì cờ per-user `is_interacted` (06/06) bị dùng như «không có hạn».
- Đã tách: tick vẫn hiện, hạn vẫn tính (NV → setup → SLA).
- File: `moduleDeadlinePolicy` BE/FE, `crmLeadDeadlineDisplay.js`, `leadsList.js`,
  `dailyReportMetrics.js`, `database/606_crm_deadline_not_hidden_by_interacted.sql`.
- Test: `node tests/module-deadline-policy.test.js` OK.
- RPC: đã chạy `node scripts/run-migration-606.js` (primary + backup).

## 2026-09-12 09:30 — Xóa 2 đơn Cửa Phúc Đạt của Minh (không đụng xưởng khác)

- AI: Cursor. Đã chạy `--apply` trên DB primary.
- Xóa: `TB-2026-767` + `DEAL-2026-1401` (Anh Tám); `TB-2026-337` + `DEAL-2026-440` (Anh Hường).
- Không xóa: Metalla `TB-2026-740`, HCB `TB-2026-754/755/764/765/827` và deal `LEAD-2026-1252`, `DEAL-2026-1398/1399/1511`.
- Script: `backend/scripts/delete-phucdat-minh-two-orders.js`.

## 2026-09-12 09:20 — Kanban gộp cột cho dashboard SX (cột lớn nối tiếp / cột nhỏ song song)

- AI thực hiện: Claude, theo yêu cầu anh B.A. Chưa commit (`.git/index.lock` vẫn chặn).
- **Quyết định kiến trúc:** KHÔNG sửa bảng Kanban cũ trong `ProductionDashboard.jsx` (5.957 dòng,
  kéo-thả + lọc + đồng bộ cuộn + highlight tìm kiếm). Làm **chế độ xem thứ 7** đứng cạnh →
  rủi ro với bảng đang chạy bằng 0, bật/tắt bằng một nút.
- **DB — `database/604_production_pipeline_group_key.sql` (ĐÃ CHẠY):**
  thêm `production_pipeline_stages.group_key`, nullable. NULL = cột tự đứng riêng nên các công ty
  khác không đổi gì. Backfill board Tủ bếp HCB theo đúng logic migration 588:
  `tiep_nhan` 1 cột/8 dự án · `ke_hoach` 1/0 · `duyet` 1/0 · `gia_cong` 4/19 · `hoan_thien` 4/89 ·
  `cong_no` 5/215.
- **Backend:**
  - `helpers/productionPipelineSchema.js` — thêm `group_key` vào `buildPipelineStageSelect()` theo
    đúng khuôn cột tùy chọn sẵn có: cờ `pipelineGroupKeyColumnAvailable` + `isPipelineGroupKeyMissingError`
    + `markPipelineGroupKeyColumnMissing`, đăng ký vào bảng retry. DB chưa có cột thì tự bỏ qua, không vỡ.
  - `routes/production.js` — thêm `group_key` vào danh sách field được sửa ở `PUT /pipeline-stages/:id`,
    để sau này gom nhóm lại được từ màn Cài đặt pipeline.
- **Frontend:**
  - `components/SxGroupedKanban.jsx` (mới) — thu lại: mỗi cột lớn là một cột Kanban gộp thẻ của các
    cột nhỏ. Mở ra: lưới, **mỗi dự án đúng một hàng ngang**, thẻ neo trái, các ô phải là từng cột nhỏ.
    Mặc định **thu hết** đúng yêu cầu «dashboard mở lên thì thu các cột vào».
  - `pages/ProductionDashboard.jsx` — thêm view mode `grouped` (nhãn «Gộp cột», icon `Layers`) vào
    `WS_DASH_VIEW_MODES` + `SX_VIEW_MODES`, render `<SxGroupedKanban pipeline={filteredKanbanPipeline}>`.
    Dùng lại đúng dữ liệu đã lọc của Kanban nên mọi bộ lọc hiện có vẫn ăn.
- **GIỚI HẠN đã ghi rõ trên giao diện:** mỗi hàng chỉ sáng ĐÚNG MỘT ô, vì `projects.sx_kanban_column_id`
  chỉ lưu được một cột cho mỗi dự án. Muốn nhiều ô cùng sáng («thùng xong + nhôm đang làm») phải thêm
  bảng `project_substage_status(project_id, stage_id, trang_thai, nguoi_lam, xong_luc)` — CHƯA LÀM,
  đây mới là phần việc lớn, không phải phần giao diện.
- Còn treo chờ anh B.A quyết: (1) `cong_no` 215 dự án có nên là cột lớn thứ 6 không; (2) hai cột lớn
  `ke_hoach` và `duyet` đang 0 dự án — giữ hay bỏ.
- Kiểm thử: parse bằng `@babel/parser` của chính Vite — 2/2 đạt; `node --check` đạt cho 2 file backend.
  CHƯA chạy thử trên trình duyệt.

---

## 2026-09-12 08:35 — Chuẩn bị trả tiến độ SX của HCB về đúng ngày 10/09

- AI thực hiện: Claude. **CHƯA ghi gì vào bảng `projects`** — mới sao lưu + soạn script.
- Yêu cầu của anh B.A: trả tiến độ SX các dự án HCB về đúng vị trí ngày 10/09, **bỏ qua** dự án
  người đã kéo tay sau đó.
- **Phân biệt được «người kéo»:** `sx_pipeline_stage_entered_at` còn nguyên — route kéo thẻ
  (`PATCH /production/projects/:id/stage`) luôn ghi mốc này, còn 588 / 599 / 602 đều KHÔNG ghi.
  Hiện có **49 dự án** mốc >= 10/09 → được bảo vệ. Đáng chú ý 34 cái rơi vào 11/09 16:43–17:24,
  tức ngay sau khi 602 chạy lúc 14:25 — anh em đã kéo tay sửa lại board.
- **Vị trí thật ngày 10/09 KHÔNG còn trong DB.** Đã loại trừ 5 nguồn: `activity_logs` (trống),
  `stage_transitions` (chỉ ghi bàn giao VC, from/to đều NULL — route kéo thẻ SX không ghi vào đây),
  `_bak_20260911_hcb_projects` (chụp SAU 588), `QLCV_Backup` (cũng hậu-588, thiếu 43 dự án),
  `crm_daily_report_snapshots` (chỉ có metric CRM `deal_*`/`lead_*`, không có cột SX).
  → **Chỉ còn đường Point-in-Time Recovery** về mốc trước `2026-09-11 02:46 UTC`.
- **Đã chuẩn bị sẵn:**
  - `_bak_20260912_hcb_projects` — 509 dòng, ảnh chụp trạng thái hôm nay trước mọi thay đổi.
  - `_restore_hcb_sx_10_09` — bảng rỗng chờ nạp (project_code, ten_cot_ngay_10_09).
  - `database/603a_xuat_tien_do_10_09_tu_ban_PITR.sql` — chạy TRÊN bản PITR, sinh ra các câu INSERT.
  - `database/603_hcb_tra_tien_do_ve_10_09.sql` — script áp dụng, **chưa chạy**.
- **Điểm kỹ thuật quan trọng:** phải khớp lại theo **TÊN cột**, không theo id. 588 đã DELETE 7 cột,
  599/600/601 dựng lại nên chúng mang id MỚI — `sx_kanban_column_id` trong bản PITR là id cũ đã chết.
  603 khớp tên trong phạm vi đúng công ty + đúng `workshop_type_id` của từng dự án, và **dừng lại
  không ghi gì** nếu có bất kỳ tên cột nào không khớp được.
- Câu hoàn tác nằm ở cuối file 603.

---

## 2026-09-11 12:10 — Lệnh «/» trong ô bình luận + rà chức năng thông báo nhiệm vụ phát sinh

- AI thực hiện: Claude. Chưa commit (`.git/index.lock` vẫn chặn).
- **Rà soát (đo trên production):**
  - Thông báo giao việc: ĐÚNG — 12/12 nhiệm vụ phát sinh có `crm_assignment_assigned`, số thông báo khớp số người nhận.
  - Bình luận tự động @mention: ĐÚNG. `postSharedWorkspaceAssignmentMentionComment` vào từ commit
    `9a21fd75` (08/09 16:15) nên 11/12 nhiệm vụ cũ không có bình luận — do có TRƯỚC tính năng, không phải lỗi.
    Nhiệm vụ duy nhất sau mốc đó (11/09 03:51) chạy đủ: bình luận + 2 thông báo mention.
  - **LỖI THẬT:** vai trò `primary` («Chịu trách nhiệm chính») không được ghi cho ai **từ 21/08/2026**.
    Mốc đổi rất gắt: 20/08 primary 52 / executor 11 → 21/08 14/62 → 22/08 trở đi **0**.
    30 ngày qua: 1.751 nhiệm vụ, 1.891 lượt gán, **0 primary**.
    Nguyên nhân: `frontend/src/lib/assignmentAssignRoles.js` `DEFAULT_ASSIGN_ROLE = 'executor'` và backend
    `normalizeAssignRole(raw, fallback = 'executor')`. Hệ quả: bình luận tag tất cả ngang nhau, và
    `getPrimaryAssignee()` rơi về `ids[0]` — một người ngẫu nhiên. CHƯA SỬA, chờ anh B.A duyệt.
- **Đã làm — lệnh «/» trong ô bình luận:**
  - `lib/crmCommentMentions.js`: thêm `getActiveSlashState()` + `filterSlashCommands()`. «/» chỉ kích hoạt
    khi đứng đầu dòng hoặc sau khoảng trắng — nếu không thì URL `https://…` và ngày `12/9` đều bật nhầm bảng lệnh.
  - `components/crmCommentMentionUi.jsx`: prop `slashCommands` + `onSlashCommand`; bảng chọn dựng đúng kiểu
    bảng @mention (mũi tên, Enter/Tab chọn, Esc đóng); chọn xong tự xóa đoạn «/từ-khóa». «/» và «@» loại trừ nhau.
  - `components/CommentsPanels.jsx`: chuyển 2 prop qua `CommentThread` → composer; placeholder thêm
    gợi ý «· / tạo công việc».
  - `pages/WorkUnifiedProjectDetailPage.jsx`: khai báo 2 lệnh «Công việc» / «Phát sinh».
- **Tạo tại chỗ (anh B.A yêu cầu):** thêm `components/CommentSlashTaskForm.jsx` — form gọn bật ngay
  trên ô bình luận khi chọn lệnh, không rời trang. Trường: tiêu đề, khối phân công, loại phát sinh
  (+ khối gây lỗi nếu là lỗi nhân viên), hạn xử lý, chọn người nhận dạng chip.
  Gửi thẳng `POST /crm/leads/:id/assignments` — **cùng endpoint với form Giao việc đầy đủ**, nên dùng lại
  nguyên luồng đã kiểm chứng: thông báo từng người nhận + tự đăng bình luận @mention + đồng bộ `crm_tasks`.
  **Form này LUÔN gửi `assignee_roles` với đúng một người `primary`** (nút ★) — vá tại chỗ lỗ hổng
  «không ai chịu trách nhiệm» cho mọi nhiệm vụ tạo bằng đường này. Lỗi gốc ở mặc định hệ thống vẫn còn.
- Kiểm thử: `node --check` đạt cho file .js; JSX kiểm tra cân bằng thẻ/ngoặc ở vùng sửa. 4 file đều thống nhất
  CRLF (0 dòng LF lẻ). CHƯA chạy thử trên trình duyệt.

---

## 2026-09-11 14:25 — HCB Tủ bếp kéo thẻ đúng tiến trình

- 602: theo status / ngày giao-lắp / bàn giao VC. Không đụng cột công nợ.
- Primary: ĐÃ GIAO 70, Mai giao 2, Chuẩn bị xong 3, KCS 9, Ban TP 22.

## 2026-09-11 14:20 — CRM thêm SX: chỉ phụ trách chính

- Trước: CRM→SX ghi cả NV mặc định phân loại, fallback thì cả NV SX công ty.
- Nay: chỉ 1 người chịu trách nhiệm chính; người đó (và phụ trách CRM/VC)
  thêm NV qua chi tiết SX hoặc tab Thành viên.
- API `POST /projects/:id/production-staff`, `DELETE .../production-staff/:userId`.

## 2026-09-11 14:05 — HCB Cánh kính + Cửa trả pipeline cũ

- User: kế hoạch 5 cột chưa thực hiện — khôi phục kính/cửa như trước 589.
- Migration `601_hcb_kinh_cua_restore_pipeline.sql` primary + backup.

## 2026-09-11 13:55 — Luồng tổng quan: Giao nhận

- Đổi nhãn bước đã gộp từ «Giao hàng» → **Giao nhận**.

## 2026-09-11 13:50 — HCB Tủ bếp hoàn tác 5 cột (kế hoạch chưa làm)

- User yêu cầu trả pipeline 15 cột Tủ bếp; công nợ kéo về board Tủ bếp.
- Migration `600_hcb_tubep_restore_pipeline.sql` primary + backup.

## 2026-09-11 13:45 — Hồ sơ liên thông theo module

- Chip CRM / SX / VC trên Work Unified chỉ hiện khi dự án có module đó.
- Panel Hồ sơ liên thông thêm địa chỉ, khu vực, giai đoạn, phân loại xưởng,
  phụ trách, ngày lắp; ẩn khối VC nếu chưa vào vận chuyển/lắp đặt.

## 2026-09-11 13:35 — Báo cáo phát sinh: phân tích + bài học

- Tab Phân tích trên `/management/shared-workspace-report`: theo tuần, tháng,
  bộ phận, dự án/deal, nhân viên, loại phát sinh + thẻ bài học rút kinh nghiệm.
- API `GET /crm/assignments/shared-workspace-report` trả thêm `analysis`
  (tính trên toàn bộ dữ liệu đã lọc, không chỉ trang hiện tại).
- Excel thêm sheet tuần/tháng/bộ phận/dự án/nhân viên/bài học.

## 2026-09-11 13:40 — Tổng quan: cụm nhiệm vụ theo dự án đang mở

- Panel Tổng quan lấy cùng cụm với trang Quản lý nhiệm vụ, lọc `project_id`.
- `GET /work-tasks/project-overview?project_id=` không lọc NV theo nhân viên.

## 2026-09-11 13:30 — Luồng tổng quan gộp Giao hàng

- User chọn 3 thẻ: Chuẩn bị vật tư / Giao hàng / Lắp đặt → gộp thành «Giao hàng».
- `buildDeliveryFlow` collapse slug materials+delivery+installation.
- Work Unified `stages` + lọc `stage=` theo cùng map.

## 2026-09-11 13:25 — HCB: hạn Kanban từ ngày lắp + bộ mẫu 5 cột

- User: «hiện chỉ là kế hoạch» — panel chưa ghi hạn thẻ; Tủ bếp vẫn pipeline cũ (588 no-op).
- 599 gom Tủ bếp 5 cột (ILIKE KCS). 598 gắn bộ theo cột; backfill hạn 123 thẻ primary.
- Kéo cột / đổi ngày lắp ghi `sx_kanban_deadline_at`.

## 2026-09-11 10:00 — HCB Cánh kính/Cửa cùng mẫu 5 cột

- User báo board vẫn pipeline cũ: lọc «Tất cả» / Cánh kính còn cột Hoàn thành, Chờ giao…
- 589 đổi Cánh kính + Cửa giống Tủ bếp; công nợ trùng đã gom. F5 Kanban SX.

- Pipeline Tủ bếp: Tiếp nhận, Kế hoạch, Duyệt, Gia công (6 việc), Hoàn thiện.
- Công nợ tách phân loại riêng; giao/lắp ở VC/LĐ.
- Kế hoạch SX tính từ ngày lắp. Migration `588_hcb_tubep_kanban_to_hoan_thien.sql`.

## 2026-09-11 09:35 — Tiến độ Unified nhiều xưởng SX/VC

- Tab Tiến độ: một stepper / xưởng SX và / nơi VC-LĐ; ngày `dd/mm/yyyy` dưới cột.
- `listDealProductionProjects` thêm cột Kanban SX/VC để phân luồng.

## 2026-09-11 09:30 — Tổng quan: chỉ deal đã ký HĐ, bỏ việc lead

- `work-overview` lọc `postContract` (mốc won / ký HĐ). Việc hôm nay/quá hạn
  không còn `CRM-Lead`. KPI khách mới = deal đang ở giai đoạn đã ký, tạo trong kỳ.

## 2026-09-11 09:25 — Gỡ nút sidebar Dashboard dự án

- Xóa `Dashboard dự án` khỏi nhóm Làm việc (`Sidebar.jsx`). Trùng URL với Work Unified.

## 2026-09-11 09:20 — GCCK hoàn thành SX không hiện trễ hạn

- Forecast Work Unified bỏ «Trễ hạn» khi dự án loại Cánh kính / tên `GCCK-` đã ở cột
  SX Hoàn thành (hoặc đã giao). Helper `projectForecast.js`.
- Tủ bếp/cửa và GCCK chưa xong vẫn tính trễ theo ngày lắp.

## 2026-09-11 09:10 — Tổng quan công việc dùng cùng tập Work Unified

- `GET /management/work-overview`: số dự án đang làm + danh sách cần chú ý lấy từ
  `queryWorkUnifiedList` (cùng nguồn `/work-unified`, gồm deal đặt xưởng khác và
  lọc khu vực theo deal CRM).
- Doanh thu / khách mới / việc quá hạn giữ nguyên nguồn cũ.

## 2026-09-11 09:35 — Bộ lọc Page/Nguồn ở trang Facebook rò dữ liệu chéo hệ sinh thái

- AI thực hiện: Claude.
- Triệu chứng (người dùng báo): đăng nhập `quantri.hst@nextgo.vn` (HST NextGo) nhưng ô
  "— Nguồn (tất cả Page) —" ở CRM → Facebook → Danh bạ liệt kê đủ 11 Page của HST mặc định
  (Phúc Đạt, Vạn Phú Thành, Metalla…) lẫn Page NextGo.
- Nguyên nhân gốc (đã đo): `routes/facebook.js` KHÔNG mount `enforceTenantContext`.
  Auth ở router này là per-route (`r.get('/x', authMiddleware, ...)`) nên `r.use()` cấp router
  sẽ chạy TRƯỚC khi có `req.user` — không thể mount middleware đó như `routes/ecosystem.js`.
  Hệ quả: `req.tenantContext` luôn undefined → `isTenantScopeEnforced(req)` luôn false →
  admin không có `company_id` rơi thẳng vào nhánh `return { mode: 'all' }` của
  `resolveFacebookPageScope`. Các nhánh lọc theo tenant ĐÃ CÓ SẴN ngay bên trên nhưng
  chưa bao giờ chạy.
- Sửa:
  - `backend/src/routes/facebook.js`: thêm `attachTenantContext` (từ `middleware/tenantGate`)
    và helper `ensureFacebookTenantContext(req, res)`; gọi ở dòng đầu của
    `resolveFacebookPageScope`. Không đổi logic lọc — chỉ bật nó lên.
  - `frontend/src/pages/FacebookPage.jsx`: `GET /api/facebook/page-sources` nay gửi kèm
    `fbCompanyQs` và phụ thuộc `[fbCompanyQs]` (trước để `[]`), để chọn công ty ở đầu trang
    cũng thu hẹp danh sách nguồn.
- Phạm vi ảnh hưởng (đo trên prod): 17 endpoint FB dùng `resolveFacebookPageScope` được sửa
  cùng lúc. Tài khoản đổi hành vi: 19 admin có `tenant_id`.
  - 4 admin HST NextGo: 11 Page → 1 Page (`1102202982968909`), 10 nguồn → 1 nguồn.
  - 13 admin HST mặc định: mất Page NextGo, còn 11 Page / 10 nguồn của HST mình.
  - 2 admin HST `abc1` và `Xưởng Anh Hoang Nguyen`: 11 Page → 0 (đúng, 2 HST này không có Page).
  - 3 admin `tenant_id = NULL` và 1 `platform_admin`: KHÔNG đổi (`enforced=false` → `mode:'all'`).
  - 4 HST đều `is_active = true` → `assertTenantActive` không sinh 403 mới.
- Kiểm thử: `node --check backend/src/routes/facebook.js` đạt. CHƯA restart backend nên
  CHƯA xác nhận trên môi trường chạy — cần restart rồi đăng nhập lại `quantri.hst@nextgo.vn`.
- Rủi ro còn lại (CHƯA sửa, báo để quyết định): 65/82 endpoint FB có `authMiddleware`
  nhưng KHÔNG gọi `resolveFacebookPageScope`. Đáng lo nhất vì ghi/đọc chéo HST:
  `PUT/DELETE /contacts/:id`, `POST /contacts/:id/create-lead`, `POST /batch-create-leads`,
  `GET /comments`, `GET /lead-ads`, `POST /dedup-leads`, `POST /sync-contact-phones`.

---

## 2026-09-11 09:00 — Work Unified: deal con không che bình luận deal gốc

- TB-2026-800: `DEAL-2026-1515` (Hucabi, 0 comment) vs `DEAL-2026-1459` (Phúc Đạt, 60).
  Bundle lấy deal `updated_at` mới nhất → tab Bình luận trống. Không phải quyền NV Thành.
- Sửa `pickBundlePrimaryLead` = `sortProjectCrmDeals` (deal gốc trước); đếm comment theo
  thread cha+con. FE dùng `pickPrimarySxCrmDeal`.

## 2026-09-11 — NextGo: khôi phục quyền hệ sinh thái + chặn rò chéo tenant

- AI thực hiện: Claude (Opus 5). Yêu cầu của anh B.A: «lead không về» và «tk nào không vào được hệ sinh thái».

### Kết luận 1 — lead KHÔNG hỏng
- Trang FB NextGo đặt `default_target_type = 'deal'` từ **17/06/2026** (anh B.A xác nhận cố ý).
  Bản ghi `type='lead'` cuối cùng: 19/06; tổng cộng chỉ có 1. Dữ liệu vẫn về đều
  (54 bản ghi/7 ngày). Tab «Lead» trống là hệ quả cấu hình. **Không sửa.**
- Phát sinh: 2 deal ngày 10/09 (nguồn Zalo) rơi vào công ty NextGo **CŨ** `87479a83`, giao cho
  `tranthingochan+oldhst@` (tài khoản đã tắt). Nguồn Zalo vẫn trỏ công ty cũ — **chưa xử lý**.

### Kết luận 2 — 2 tài khoản bị chặn, đã sửa bằng DỮ LIỆU
- `getUserAccessibleUnits` (routes/ecosystem.js) cho qua `['admin','manager']`; role khác phải có
  dòng trong `ecosystem_unit_members`, không có thì trả mảng rỗng.
- Chuyển tenant đã chép `user_companies` nhưng **KHÔNG chép `ecosystem_unit_members`**:
  cả 5 đơn vị NextGo đều 0 thành viên; 4 tài khoản `+oldhst` (đã tắt) mỗi cái có 1.
- Đã chép lại y nguyên phân bổ cũ (`unit_role=member`, `can_manage_children=false`):
  Ngọc Trinh + Ngọc Hân → Phòng Kinh doanh `4471ee38`; Hải Hiền → Xưởng sản xuất `cb4bcf59`;
  Biện Anh Pháp → Phòng Marketing `50c2522f`. Dùng `ON CONFLICT DO NOTHING`, 4 dòng.
- Kiểm chứng: **Ngọc Trinh** và **Hải Hiền** từ BỊ CHẶN → VÀO ĐƯỢC.

### ĐÍNH CHÍNH — tôi nói quá ở phiên trước
- Tôi đã báo «quantri.hst@nextgo.vn nhìn thấy cả hệ sinh thái tenant khác». **Sai một nửa.**
  `GET /units` (trang hệ sinh thái) CÓ lọc tenant qua `addEcosystemUnitTenantFilter`, và
  `r.use(enforceTenantContext)` bật cho cả router; cả 5 user NextGo đều có `tenant_id`, không ai
  là platform_admin ⇒ **tenantContext.enforced = true**, danh sách đơn vị KHÔNG rò.
  Tôi kết luận từ mỗi hàm `getUserAccessibleUnits` mà không đọc route gọi nó.

### Chỗ rò THẬT (đã vá) — routes/ecosystem.js
- `getUserAccessibleUnits` nhánh admin/manager trả **mọi đơn vị đang hoạt động của TOÀN hệ thống**,
  không lọc tenant. Hai nơi dùng: `GET /my-units` (`accessible_unit_ids`) và
  `middleware/permission.js:160` — nơi này mới nặng: admin tenant này được tính **có quyền theo
  đơn vị** trên đơn vị của tenant khác.
- Đã thêm `tenantScopeOfUser(userId, userRole)` dùng `resolveTenantIdForUser` +
  `getTenantCompanyIds`, lọc y hệt khuôn `addEcosystemUnitTenantFilter`. Bỏ qua khi
  platform_admin hoặc user chưa gắn tenant — đúng như `attachTenantContext`.
- `isPlatformAdmin` lấy từ `helpers/adminRole` đã import sẵn (tránh khai báo trùng).
- Số đo trước/sau:
  · 3 admin NextGo: **54 → 13** đơn vị (đúng 13 của NextGo)
  · admin tenant mặc định (VPT/Metalla/tubep): **54 → 41** (đúng của họ, không mất gì)
  · 2 user không phải admin: giữ nguyên 1 đơn vị
  · Toàn hệ thống **0** trường hợp user là thành viên đơn vị của tenant khác ⇒ nhánh membership
    không cần đổi.
- Kiểm thử: `node --check` đạt; nạp được `routes/ecosystem` và `middleware/permission`
  (vòng require vẫn OK).

### Chưa làm
- 46 user toàn hệ thống vẫn bị chặn khỏi hệ sinh thái vì danh sách trắng cứng
  `['admin','manager']` (gồm cả `platform_admin`). Anh B.A yêu cầu **chỉ** xử lý chuyện
  chéo tenant, nên để nguyên.
- Nguồn Zalo trỏ công ty NextGo cũ.


## 2026-09-10 14:35 — Vá chỉ mục bình luận HST mặc định

- Quét DB: comment CRM HST mặc định còn đủ (27.653 dòng, không bị delta
  NextGo xóa). `project_comments` vốn ít (36) vì SX/VC đọc `crm_lead_comments`.
- Lỗi hiển thị: `GET /crm/lead-comments/index` không phân trang → PostgREST
  cắt 1.000 dòng, chỉ ~110/4.668 deal có badge. CRM gửi 2.000 UUID/URL.
- Sửa: `fetchAllByIds` trên index CRM + dự án; FE CRM chunk 200 id.

## 2026-09-10 14:10 — Xóa deal trùng Anh Tám DEAL-2026-1518

- Deal Minh tạo trên Metalla (`DEAL-2026-1518`) trùng khách của Nghĩa.
  Đã xóa (không có dự án SX). Giữ `LEAD-2026-1252` Huỳnh Văn Nghĩa / VPT.
- Snapshot thùng rác; script `delete-dup-anh-tam-deal-1518.js`.

## 2026-09-10 10:45 — Số đếm lọc Work Unified khớp dòng hiển thị

- Danh sách khi lọc NV/KV/hạn/tìm không còn cắt 20/trang — thẻ đếm = số dòng.
- Khớp NV theo deal CRM; sale/PM chỉ khi không có deal. Bỏ lọc lại phía FE.
- Deal scan `type=deal`. Test: `node tests/work-unified-user-filter.js`.

## 2026-09-10 09:20 — Chuyển Anh Tám từ Cửa Phúc Đạt về HCB Tủ bếp

- Deal gốc VPT / Metalla `TB-2026-740`. Bản Phúc Đạt `TB-2026-767` (Cửa) hủy;
  deal `DEAL-2026-1401` → Thua.
- Đặt xưởng Hucabi · Tủ bếp: `TB-2026-827`, cột Tiếp nhận, Sang Thiết Kế VPT 1.
- Giữ HCB Cánh kính `TB-2026-765`. Script `reclassify-anh-tam-to-hcb-tu.js`.

## 2026-09-10 09:10 — Lọc nhiều NV Work Unified hiện đúng người

- Bỏ response cũ khi đổi NV (tránh bảng Showroom ghi đè kết quả đã lọc).
  Khớp đúng NV deal/sale, không lấy thợ SX. FE lọc lại trên trang đang xem.
- Test: `node tests/work-unified-user-filter.js`.

## 2026-09-10 08:45 — Lọc nhiều nhân viên trên tổng quan dự án

- Bộ lọc Work Unified đổi dropdown NV thành danh sách checkbox (tìm tên, chọn
  đang hiện, bỏ chọn). Danh sách + Kanban (và các view cùng API) gửi
  `user_ids` CSV.
- Backend `GET /management/work-unified` và `/work-unified/search` lọc OR theo
  nhiều UUID (`user_ids` / `user_id`). Helper `workUnifiedUserFilter.js`.
  Test: `node tests/work-unified-user-filter.js`. Ô nhảy chi tiết dùng cùng panel.

## 2026-09-10 00:55 — Vá nhật ký hoạt động HST NextGo

- Rà nốt 22 bảng danh mục/cấu hình còn lại: đều khớp giữa công ty cũ và HST mới.
- Khoảng trống cuối: `unified_task_history`. Thêm
  `backend/scripts/fix-nextgo-history-log.js` — ghép thực thể (việc CRM 6.566,
  việc SX 737, giao việc 328) theo cha + created_at + tiêu đề, chép 1.318 dòng
  thay đổi và sửa created_at cho 7.303 dòng «created» do clone sinh ra.
- Sau vá: log HST mới trải 12/06 → 09/09, mỗi loại sự kiện ≥ bên cũ (created
  9.670, deleted 995, assignee_changed 257, status 51, completed 42, deadline 11).

## 2026-09-10 00:40 — Bù lịch sử NextGo mà clone bỏ sót

- Đối chiếu công ty cũ ↔ HST mới trên mọi bảng có `company_id` và các bảng con
  của lead/dự án: phát hiện clone không chép bình luận, tài liệu, tệp việc,
  giao việc, sự kiện, snapshot báo cáo ngày, kế hoạch phòng ban, KPI.
- Thêm `backend/scripts/copy-nextgo-history.js`: dựng map việc CRM theo
  (lead + created_at + title), chèn bản ghi mới với FK ánh xạ, vá `parent_id`
  bình luận sau khi có id mới, chèn lại từng dòng khi lô vướng ràng buộc trùng,
  lọc idempotent cho KPI, kèm dry-run và file hoàn tác (xoá theo id).
- Kết quả: 5.746 hàng chèn. HST mới khớp dump (bình luận 2.414, tệp việc 385,
  giao việc 328, sự kiện 22, snapshot 1.116, kế hoạch 20, KPI 1.622 / 146).
  Bỏ qua `trash_items` (97) và 60 điểm KPI đã do HST mới tự tính.

## 2026-09-10 00:05 — Kiểm tra FB/Google Form theo HST + chuyển delta NextGo

- Kiểm tra dữ liệu thực: cấu hình Fanpage và key `NextGo NV Yến` đều trỏ công ty
  NextGo HST mới, nhưng lead thực tế từ 21/08→09/09 (141 deal FB/Zalo/nhập tay)
  vẫn rơi vào công ty NextGo cũ vì NV còn làm trên hệ cũ; chưa có lượt FB/form
  nào chạy qua cấu hình mới để kiểm chứng.
- Thêm `backend/scripts/migrate-nextgo-delta.js`: dò delta theo bản đồ id clone,
  ánh xạ FK (công ty, pipeline, stage, khu vực, nguồn, người dùng, phòng ban),
  khớp danh mục theo tên cho phần clone không phủ, gán bot HST khác về admin HST
  NextGo, kèm dry-run và file hoàn tác.
- Đã chạy `--apply`: 5.258 bản ghi cập nhật, 0 lỗi. Kiểm chứng: công ty cũ 0 bản
  ghi sau mốc clone, HST mới 766 deal, 0 tham chiếu chéo HST.
- Lưu ý vận hành: `npm run dev` local dùng chung DB production nên lịch bật/tắt
  auto-pipeline FB bị ghi trùng đôi — tắt khi không dùng.

## 2026-09-09 20:05 — Rà soát cách ly HST NextGo + kiểm tra tài khoản NV

- Quét động mọi bảng có `company_id` (84 FK về `users`/`companies`): HST `nextgo`
  chỉ 1 công ty, 0 liên kết chéo sang HST khác (cả hai chiều).
- BE `external.js`: `/project-deadlines` giới hạn công ty theo HST của chủ key
  (không key → HST mặc định), thêm `resolveDefaultTenantId` ở `tenantScope.js`.
- BE `apiKeyAuth.js` + `mcpGateway.js`: key `all_companies` chỉ đọc trong HST của
  chủ key (`tenant_company_ids`); tool báo cáo nhận `company_whitelist` từ key.
- DB (chỉ bản ghi NextGo): tắt `saletest.ui@nextgo.vn`, `sanxuattest.ui@nextgo.vn`;
  `created_by` của `crm_referrers`/`drive_roots` NextGo → `quantri.hst@nextgo.vn`.
- Kiểm thử: 7 tài khoản HST NextGo đăng nhập OK, chỉ thấy 1 công ty / 2 KV / lead
  NextGo; HST mặc định giữ nguyên (95 thông báo hạn, 5 công ty, MCP không thấy
  công ty HST NextGo).

## 2026-09-09 19:40 — HST NextGo chỉ lấy cài đặt Google Form NextGo

- Nguồn / phân loại CRM và API key lọc tenant; form ngoài tìm `Google Form` theo `company_id` của key.
- Key `NextGo NV Yến` chuyển sang công ty / KV / pipeline / Yến bản HST mới (giữ token).
- FE nguồn: ẩn «Chung toàn hệ thống» khi có tenant.

## 2026-09-09 19:30 — HST NextGo chỉ lấy cài đặt Facebook NextGo

- BE `facebook.js`: tenant lọc Page / page-sources / auto-pipeline / image-sets;
  PUT/DELETE Page và bộ ảnh chỉ trong tenant; NextGo không bật công tắc tổng;
  auto-lead config tách theo tenant.
- FE: bỏ «Tất cả công ty» khi có tenant; ẩn master schedule trên HST NextGo.

## 2026-09-09 19:20 — Bộ lọc HST NextGo lẫn công ty HST khác

- Cache `GET /ecosystem/units` (và levels/stage-groups) `scope: role` — mọi
  `admin` dùng chung cache, admin NextGo nhận cây HST mặc định.
- Đổi `scope: company` (theo `tenant_id` khi tenantGate enforced).
- `available-companies` / `available-departments` lọc theo tenant.

## 2026-09-09 19:15 — Đưa HST NextGo vào dùng + admin cao nhất

- Script `provision-nextgo-ecosystem-live.js --apply`.
- Admin tenant: `quantri.hst@nextgo.vn` (không company_id).
- 6 NV chuyển email sang user HST mới; user cũ `+oldhst` tắt.
- Fanpage `1102202982968909` → company HST mới; remap contact lead_id khi có map.
- Không xóa dữ liệu HST mặc định. Hộp thư Yến resolve theo tenant nextgo.

## 2026-09-09 19:00 — Đồng bộ dump NextGo 100%, chờ đích

- Export lại; verify khớp nguồn (739 lead, 8325 crm_tasks, 16050 tin FB).
- Không import: chỉ có qlycv + QLCV_Backup.
- Không xóa / freeze / webhook hệ cũ.
- File: `verify-nextgo-completeness.js`, `docs/ops/nextgo-instance/SYNC-STATUS.md`.

## 2026-09-09 15:40 — Ghim góc phải tối đa 20

- AI: Cursor.
- `MAX_PINNED_PROJECTS` 5 → 20.

## 2026-09-09 14:10 — Harden lưu deadline (CRM + SX)

- AI: Cursor.
- FE: sau PATCH cập nhật lead tại chỗ qua `onLeadPatch`; `onUpdate` lỗi không còn alert «Lỗi lưu deadline».
- BE: bọc comment / emit / effective deadline; `logDealDeadlineChangeComment` không throw.

## 2026-09-09 13:55 — Ghim góc phải trên CRM và VC/LĐ

- AI: Cursor.
- CRM chi tiết: nút Ghim luôn hiện (lead chưa có dự án cũng ghim được).
- Menu `⋯` thẻ Kanban CRM / SX / VC-LĐ: mục «Ghim góc phải».
- Chi tiết module tùy chỉnh: thêm `PinProjectButton`.

## 2026-09-09 13:50 — Sửa lỗi lưu deadline thẻ CRM

- AI: Cursor.
- Nguyên nhân: `LeadInfoPanel` gọi `setLead` (không tồn tại) sau PATCH thành công
  → alert «Lỗi lưu deadline» dù DB đã ghi (LEAD-2026-809, hạn 22/9).
- FE: bỏ `setLead`, đóng modal + `onUpdate`.
- BE: bọc comment sau lưu; so sánh hạn theo timestamp để khỏi ghi lịch sử trùng.

## 2026-09-09 12:10 — Ghim dự án xuống góc phải

- AI: Cursor.
- FE: `pinnedProjects.js` (localStorage, tối đa 5), `PinProjectButton`,
  `PinnedProjectsWidget` dạng danh sách ẩn/hiện + bỏ ghim.
- Nút ghim: Work Unified, ProductionDetail (SX/VC), ProductionProjectDetailPage,
  LeadDetail (deal đã có dự án).
- `App.jsx`: widget luôn gắn (kể cả CRM-only).
- Đã kiểm TB-2026-538: ghim Work Unified, ẩn/hiện, còn trên CRM dashboard,
  bấm danh sách mở lại; nút Bỏ ghim hiện trên `/sx/projects/:id`.

## 2026-09-09 09:00 — Nhật ký công trình: lọc công ty / khu vực / NV

- AI: Cursor.
- FE: dropdown Công ty / Khu vực / Nhân viên trên `/management/project-logs`.
- Tìm CT truyền `company_id`, `region_id`, `user_id` vào `work-unified/search`.
- API log lọc theo người thao tác (`actor_id`); khu vực `__none__` = NV chưa gán KV.
- Excel ghi thêm các bộ lọc này.

## 2026-09-09 08:55 — Trang nhật ký công trình

- AI thực hiện: Cursor.
- API `GET /api/management/project-logs` gom unified_task_history, activity_logs,
  crm_activities, bình luận deal, hạn CRM, phát sinh Không gian chung.
- UI `/management/project-logs`: tìm CT, tab, phân trang, xuất Excel.
- Menu: Dự án và công việc, CRM, SX, VC-LĐ.
- Không sửa `management.js` / `logistics.js`.
- Kiểm thử trình duyệt TB-2026-819: 105 log; tab nhiệm vụ còn 70 dòng.

## 2026-09-09 09:00 — Chuẩn bị tách instance NextGo (chưa cắt)

- AI: Cursor. Đo prod: 734 lead, 32 project, 8 user, 15997 tin FB; 0 xuyên công ty.
- Script: `export-nextgo-instance.js`, `import-nextgo-instance.js`,
  `copy-nextgo-storage.js`, `freeze-nextgo-source.js` (cần NEXTGO_CUTOVER=YES).
- Docs: `docs/ops/nextgo-instance/*`. SQL 597 chỉ instance trống.
- Dump gitignore: `backend/uploads/_nextgo_instance_export/`.
- Không freeze, không import đích, không đổi webhook.

## 2026-09-09 08:30 — Chọn vai trò thành viên khi tạo phát sinh Không gian chung

- AI thực hiện: Cursor.
- Form tạo phát sinh trên tab Không gian chung (Dự án, CRM, SX, VC-LĐ) và
  modal Giao việc Không gian chung: dropdown vai trò từng NV + nút Áp dụng hàng loạt.
- Payload `assignee_roles` gửi kèm `assignee_ids`. Backend sẵn có
  `assignmentAssigneeRoles.js` — không đổi API.
- File: `frontend/src/lib/assignmentAssignRoles.js`,
  `LeadMemberAssignmentsPanel.jsx`, `CRMAssignmentsPage.jsx`.
- Chưa xác minh trên trình duyệt.

## 2026-09-08 16:52 — Thẻ SX lấy người chịu trách nhiệm sản xuất của công ty

- AI thực hiện: Cursor.
- **BÁO TRƯỚC**: tiếp `enrichTaskModuleOwners` trong `workTasks.js`.
- TB-2026-045 không có `production_person_id`, staff chỉ admin hệ thống → thẻ
  «Chưa có người phụ trách». Fallback đúng: `production_handover_settings.responsible_user_id`
  (Phúc Đạt = Minh sản xuất cửa).
- Không đụng `management.js` / `logistics.js`.

## 2026-09-08 16:48 — Không lấy admin hệ thống làm phụ trách SX trên tổng quan

- AI thực hiện: Cursor.
- **BÁO TRƯỚC**: sửa `enrichTaskModuleOwners` trong `backend/src/routes/workTasks.js`.
- TB-2026-029: `production_person_id` trống, `project_production_staff` chỉ còn
  Trương Trọng Thành → thẻ Sản xuất hiện TT.
- Admin hệ thống (`admin` không `company_id`) không còn dùng làm fallback phụ trách
  module SX/VC. Không đụng `management.js` / `logistics.js`.

## 2026-09-08 16:40 — Tổng quan nhiệm vụ tải công ty trước

- AI thực hiện: Cursor.
- Prefetch `GET /companies` khi mở sidebar / hover menu nhiệm vụ.
- Trang `ProjectTasksOverviewPage` chờ danh sách công ty, tự chọn công ty, rồi
  gọi `GET /work-tasks/project-overview` kèm `company_id`.
- Backend `workTasks.js` nhận `company_id` cho admin hệ thống.

## 2026-09-08 16:28 — Tách việc Không gian chung khỏi cột CRM Sản xuất

- AI thực hiện: Cursor.
- **BÁO TRƯỚC**: sửa `backend/src/routes/workTasks.js` — `projectOverviewCategoryId`
  và `categoryFor` trên `GET /project-overview` (+ remind cùng hàm).
- Nguyên nhân TB-2026-738: `crm_tasks.stage_slug = shared_workspace` nhưng
  `pipeline_stage_id` trỏ cột «Sản xuất.» → thẻ Sản xuất hiện người của việc PS.
- Không đụng `management.js` / `logistics.js`.

## 2026-09-08 16:20 — Commit + push WIP còn lại trong ngày

- AI thực hiện: Cursor.
- Gom working tree hôm nay lên `feat/project-phat-sinh-report`: deadline liên module,
  query-guard, tổng quan nhiệm vụ, docs/audit, migration 576 và 591–596.
- Cố ý không commit file tạm/upload/`_to_delete` và SQL trùng số `main` (400–402, 580).
- Việc còn lại: sửa 1 dòng 596 trước khi áp production (REVIEW-596).

## 2026-09-08 22:45 — Sửa 5 lỗi query-guard (BÁO TRƯỚC theo AI-004)

- AI thực hiện: Claude (Opus 5). Trả lời [`BAO-CAO-loi-query-guard-2026-09-08.md`](./BAO-CAO-loi-query-guard-2026-09-08.md) của Cursor.
- **BÁO TRƯỚC vùng dùng chung**: tôi sẽ sửa `backend/src/routes/management.js` ở 4 chỗ —
  `listSelect` (dòng ~1886), nhánh `focus === 'overdue_crm'` (~1930), `attachTaskAndDocCounts`
  (~492), và `loadSxPipelineSummary` (~545-560). Cursor đừng sửa file này tới khi tôi ghi xong.
- Đã kiểm chứng lại toàn bộ số của Cursor trên prod — **đúng hết**, hai chỗ nặng hơn:
  `tasks` đang mở = **2213** (khớp); notification chưa đọc = 130.145; nhưng
  **41 user vượt 1000 thông báo, cao nhất 9.503**; và `wonIds` union thực tế
  **713 + 525** id, vượt xa mốc gãy 643.
- Ba hiệu chỉnh cho báo cáo của Cursor:
  1. P2 notification chỉ là **nhánh dự phòng** — `pgDashboardNotificationStats` chạy trước và
     `return` sớm. Vẫn sửa, nhưng không cấp bách như mô tả.
  2. `getWonDealProjectIds(companyId = null)` **đã có sẵn** tham số companyId
     (`workshopKanban.js:249`) — không cần đổi chữ ký.
  3. `.in('id', wonIds)` có **hai** chỗ (dòng 549 và 559), không phải một.
- Ảnh terminal của anh B.A cho thấy nặng hơn báo cáo: `/api/management/deals` trả
  **HTTP 500** (213 ms, 50 byte), không phải danh sách rỗng.
- **Lỗi của tôi, Cursor bắt đúng**: patch 0003 sửa `crm_leads.budget` ở dòng 339 nhưng
  BỎ SÓT dòng 1886 vì `listSelect` là **biến template string** mà `audit.py` chỉ đọc chuỗi
  literal trong `.select()`. Và bộ quét cột-trong-bộ-lọc không bắt được `.lt('deadline')`
  dòng 1930 vì nó nằm trong `applyDealQueryFilters(query)` — `.from('crm_leads')` ở hàm khác,
  ngoài cửa sổ 800 ký tự. Query-guard bắt được cả hai trong một phiên dev; hai lần quét
  tĩnh của tôi đều trượt. Sẽ vá `audit.py` lần theo biến.
- Quyết định về `deadline`: dùng **alias PostgREST** `deadline:kanban_deadline_at` —
  MỘT cột thật, không `COALESCE` rải (AI-002). `applyDealRowFilters` dòng 386 đọc
  `d.deadline` nên giữ nguyên tên trường ra ngoài. Khi Cursor nối
  `crm_effective_deadline_at` vào route này thì thay alias bằng lời gọi policy.
- **ĐÃ SỬA XONG (22:58):**
  1. `management.js:1885` `listSelect` — bỏ `budget`, `deadline`; thêm alias
     `deadline:kanban_deadline_at` + `expected_close_date`. Kiểm chứng trên prod: câu
     select mới chạy ra hàng, không 42703.
  2. `management.js:1930` `focus=overdue_crm` — lọc theo `kanban_deadline_at` (tên cột thật;
     alias không dùng được trong filter). `applyDealRowFilters:386` vẫn đọc `d.deadline` như cũ.
  3. `management.js:492` — bỏ `d.budget` khỏi `value:`.
  4. `management.js:549 + 559` — hai `.in('id', wonIds)` chuyển sang `fetchAllByIds`
     (tự chia lô). Không đổi phạm vi «won».
  5. `dashboard.js:1275` — 2.213 task active phân trang bằng `fetchAllPagesParallel`,
     bọc lại `{ data }` nên chỗ đọc `allActiveTasks.data` không đổi.
  6. `dashboard.js:209` — nhánh dự phòng badge thông báo bỏ `.limit(1000)`, phân trang.
  7. `supabaseQueryGuard.js` — bọc `PostgrestClient.prototype.rpc`; nhãn bảng của lỗi RPC
     giờ là `rpc:<tên hàm>` thay vì `rpc` + site `khong-xac-dinh`.
  8. `audit/audit.py` — lần theo `const X = \`...\`` khi gặp `.select(X)`. Đã chứng minh
     bản vá bắt được đúng `budget` và `deadline` trên đoạn code gốc.
- Kiểm thử: `node --check` 3 file JS đạt · `test:query-guard` **8/8 ĐẠT** (2 mục hồi quy vẫn xanh)
  · `test:role-enum` ĐẠT · `test:perf-retention` **24/24 ĐẠT**.
- Chưa xác minh: chưa gọi được `GET /api/management/deals` thật (máy ảo của tôi không có
  mạng ra ngoài). **Nhờ anh B.A restart backend rồi mở lại tab tổng quan** — kỳ vọng 200
  thay vì 500, và bảng tổng hợp query-guard sau 15 phút không còn dòng
  `COT-KHONG-TON-TAI crm_leads` lẫn `FILTER-ID-QUA-DAI projects`.
- `management.js` đã trả lại vùng dùng chung — Cursor sửa tiếp được.
- **CỐ Ý chưa làm**: không truyền companyId vào `getWonDealProjectIds`. Cursor đã cảnh báo
  «không thu hẹp ý nghĩa won nếu chưa đo intake xưởng» — tôi đồng ý, nên chỉ **chia lô**
  `.in()`, không đổi phạm vi. Việc scope để lại sau khi có số đo intake HCB.


## 2026-09-08 16:10 — Admin hệ thống sửa/xóa phân công Không gian chung

- AI thực hiện: Cursor.
- Yêu cầu: Trương Trọng Thành (admin hệ thống, `trongthanh0800@gmail.com`) được sửa/xóa
  nhiệm vụ Không gian chung do người khác tạo.
- File: `helpers/assignmentManageAccess.js`, `routes/crmAssignments.js`,
  `frontend/src/lib/assignmentManageAccess.js`, `LeadMemberAssignmentsPanel.jsx`,
  `CRMAssignmentsPage.jsx`.
- Không đụng `management.js` / `logistics.js`.
- Kiểm thử: `node tests/assignment-manage-access.js`.

## 2026-09-08 15:40 — Ghi nhận lỗi query-guard + 42703 (chưa sửa)

- AI thực hiện: Cursor. Việc sửa: giao Claude.
- Log local: `[management/deals] column crm_leads.budget does not exist` + 5 dòng query-guard.
- Đo DB: `crm_leads` không có `budget`/`deadline`. Active tasks 2213; deals có project_id 657.
- Tài liệu: [`BAO-CAO-loi-query-guard-2026-09-08.md`](./BAO-CAO-loi-query-guard-2026-09-08.md).
- Chưa đụng `management.js` / `dashboard.js`.

## 2026-09-08 15:35 — Push trang phát sinh module Dự án

- AI thực hiện: Cursor.
- Phạm vi: trang Báo cáo phát sinh + Setup phát sinh trên module dự án
  (`/management/shared-workspace-report`, `/management/shared-workspace-settings`).
- Không gộp trang Tổng quan nhiệm vụ (`ProjectTasksOverviewPage`) hay chính sách deadline.
- Kiểm thử: `node tests/shared-workspace-report.js` — 6 assertions passed.
- Nhánh: `feat/project-phat-sinh-report`.

## 2026-09-08 22:05 — Rà soát migration 596 trước khi phát hành

- AI thực hiện: Claude (Opus 5).
- Yêu cầu: đọc `CURRENT.md`/`WORKLOG.md`/`DECISIONS.md` và đánh giá kế hoạch deadline liên module.
- Không sửa code. Chỉ đối chiếu working tree với DB production `qlycv`.
- **Phát hiện CHẶN PHÁT HÀNH**: `project_deadline_board` (bảng deadline VC) gọi
  `project_deadline_at(p)`, mà 596 định nghĩa lại hàm này thành chuỗi **Sản xuất**
  (không có `install_date`). Đo trên 671 dự án đang chạy: **86 dự án trên bảng VC mất
  hạn hoàn toàn**, **114 dự án hiện sai hạn**. Sửa: gọi
  `project_module_deadline_at(p, 'logistics')`.
- Xác nhận `CURRENT.md` ghi đúng: 596 **chưa** áp lên production
  (`pg_get_functiondef` trên prod vẫn là định nghĩa cũ).
- Xác nhận điểm tốt: 596 chỉ `CREATE OR REPLACE FUNCTION`, không đổi schema; và
  **không có index biểu thức nào** trên `project_deadline_at` nên không phải reindex.
- Đo được mức lệch JS↔SQL hiện tại: 117 dự án lệch chuỗi SX, 93 lệch chuỗi VC,
  **9 dự án hai bên ra hai ngày khác nhau**. Áp 596 (sau khi sửa) sẽ dứt điểm.
- Kiểm thử: `node tests/module-deadline-policy.test.js` → `module-deadline-policy: OK`.
  Nhưng chưa có `npm script`, và test cần `.env` + mạng nên không chạy được trong CI.
- Chưa làm/rủi ro: 4 hàm MỚI trong 596 mặc định `EXECUTE TO PUBLIC` → anon gọi được;
  596 chưa có file rollback; đo thấy **184 bảng** có policy `USING(true)` cho `public`
  mà `anon` có cả SELECT lẫn UPDATE (gồm `crm_leads`, `customers`, `users`, `projects`).
- Đã viết bản phân công hai bên: [`HANDOFF-2026-09-08-phan-cong.md`](./HANDOFF-2026-09-08-phan-cong.md)
  — ranh giới file, mã dán sẵn cho 3 điểm chặn của 596, thứ tự chạy 8 bước.
- Tự nhận sai: prototype RPC `project_tasks_overview` của tôi tự tính deadline bằng
  `min(deadline)` trên `crm_tasks`/`tasks` — là chuỗi ưu tiên THỨ TƯ, vi phạm AI-002.
  Bản chính thức sẽ gọi hàm chính sách của 596; số đo cũ (228 ms) phải làm lại.
- Bước tiếp theo: xem [`REVIEW-596-deadline.md`](./REVIEW-596-deadline.md) — 9 việc,
  3 việc chặn phát hành.

## 2026-09-08 15:02 — Kiểm thử cập nhật deadline CRM

- AI thực hiện: Cursor.
- Phát hiện API `PATCH /api/crm/leads/:id/deadline` trả 404 dù bản ghi tồn tại.
- Nguyên nhân: PostgREST có nhiều quan hệ giữa `crm_leads` và
  `crm_pipeline_stages`, nhưng select chưa chỉ rõ FK nên query trả `PGRST201`.
- Sửa `backend/src/routes/crm/routes/leadLifecycle.js` để dùng
  `crm_pipeline_stages!crm_leads_stage_id_fkey`.
- Kiểm thử thực tế: đổi `LEAD-6666` từ 21/09 sang 22/09; Kanban cập nhật ngay,
  view Deadline chuyển đúng sang 22/09.
- Đã đổi lại 21/09 và xác nhận DB đã khôi phục dữ liệu gốc.
- Syntax check và lint: đạt.

## 2026-09-08 14:53 — Đồng bộ deadline liên module

- AI thực hiện: Cursor.
- Yêu cầu: chuẩn hóa điều kiện deadline CRM, Sản xuất và VC-LĐ mà không thay đổi cấu trúc
  bảng hoặc bố cục giao diện.
- Đã làm:
  - Tạo policy deadline trung tâm cho backend và adapter tương thích frontend.
  - Tách việc xóa deadline theo module; chỉ hoàn thành dự án cuối mới xóa toàn bộ.
  - Đồng bộ API mutation, KPI, project enrichment và RPC deadline.
  - Bổ sung derived fields `effective_deadline_at`, `effective_deadline_source`,
    `effective_deadline_module`, `deadline_state`.
  - Bổ sung unit test cho thứ tự ưu tiên và hành vi hoàn thành liên module.
- Migration: `database/596_unified_module_deadline_policy.sql`.
- Kiểm thử: unit test policy và syntax check đạt; chưa xác nhận migration trên Supabase production.
- Rủi ro còn lại: cần kiểm thử tích hợp, realtime/cache và giao diện với dữ liệu thật.
- Chi tiết trạng thái: xem [`CURRENT.md`](./CURRENT.md).

---

Khi bắt đầu phiên mới, thêm mục mới lên đầu file, ngay dưới tiêu đề.

## 2026-10-03 — Source registry candidate
Added SQL671/private versioned source registry, authenticated primary-only API, same-snapshot report projection, source editor and exact retry storage. Known historical forms remain explicit unresolved exceptions; all accounts included, no provider completeness or spend grant. Local129 PASS; PostgreSQL/build/browser/independent review pending. See vpt-marketing-automation/SOURCE_REGISTRY.md. No live effects; full goal ACTIVE.

## 2026-10-03 — Source registry SQL correction
36048b5 passed9/10 jobs; census111151084463 failed10 dependent newcases due ambiguous local/column k. Independent review identified k/v/x alias conflicts. Qualified aliases explicitly in SQL671; tests unchanged, PostgreSQL rerun pending.

## 2026-10-03 — Registry final validation delta
50a0e14 passed all10 jobs and independent review; census41/0/0, Node22 697/0/0, build10314 modules. Browser found stale summary after read error: clear alongside editor on load/error/save. Strengthened concurrency observation to active + Lock/PgSleep. Final rerun pending; SOURCE_REGISTRY_BROWSER.md records synthetic UI evidence.

## 2026-10-03 — Held POST editor closure
Review found closing editor before POST settles can preserve stale outer summary. Clear summary after pending is durably stored and before HTTP. Supported browser held-response/close/reopen/exact-retry passed; database unchanged. 2d53b5 all10 checks succeeded; final UI head revalidation pending.

## 2026-10-03 — Source registry closure

Runtime9363535a and independent review PASS. CI37105837930 all10 SUCCESS, census111154053416=41/0/0, Node22 111154053420=697/0/0, build111154053390=10314modules31.35sec. Mergeca1e35a0c6438d310cdd4841842a579660219d38 has identicalcandidate tree4bc46dc5f1470cc661ff70897b742a7335b264a0. Report37105837943/Messenger37105837923SUCCESS. Synthetic browser heldPOST-close fix validated; tabs/servers closed. EvidenceSOURCE_REGISTRY_REVIEW.md. Docs-only closure; full goalACTIVE, no live effects.

## 03/10/2026 — Nối khảo sát và việc chờ theo nhóm quảng cáo đang kiểm chứng

SQL678/API/UI nối nguồn tiếp nhận khách trả phí với tình trạng chăm sóc và lịch hiện hành trong cùng snapshot. Lịch sau kỳ vẫn được giữ; tổng khách cần xử lý loại trùng cả việc chờ xác minh, chưa nối chăm sóc và bàn giao khảo sát. STOP không tự mở lại; hồ sơ chưa quy thuộc được giữ riêng.

Local20 ca mới/44 ca liên quan PASS. PostgreSQL/build/browser và review độc lập đang kiểm. Full goal ACTIVE; chưa UAT/dữ liệu thật/phát hành. [Hợp đồng và hoàn tác](vpt-marketing-automation/COHORT_OPERATIONS.md).

---


03/10/2026 cohort3486c59: review mã/local44/Node22 828/build PASS; browser component thật/API giả PASS. PG ca chờ khóa không quan sát được phiên khác bằng service_role; sửa observer sang owner thử + pg_stat_clear_snapshot, giữ nguyên SQL/runtime. Chờ CI mới.

03/10/2026 — Cohort3f8a565: PostgreSQL214/0/0, Node22 828/0/0, cả10job và build/report/Messenger SUCCESS; merge tree bằng HEAD đã xác minh. Local44/review mã/browser giả PASS. Đã lưu [bằng chứng](vpt-marketing-automation/COHORT_OPERATIONS_REVIEW.md). Không phát hành; goal ACTIVE, bước tiếp xử lý đề xuất/gửi lịch và ngoại lệ vận hành.


## Hiện hành 04/10/2026 — Đang khép quyền gộp CRM; bảo toàn lịch sử còn mở

Bản làm việc trên baseline7cc7cb2 thêm kiểm actor/quyền hiện hành trên toàn bộ Lead giữ/xóa, khóa company/tenant/region, kiểm cờ xóa pipeline và chặn gộp Customer khác nhau chưa có phạm vi đầy đủ. Cleanup không còn tự xóa chỉ vì chung Customer: đọc một công ty có giới hạn, trả yêu cầu đối soát với0thay đổi. Local50ca mới+67regression=117/0/0;7ca PostgreSQL bổ sung chưa có kết quả CI ở checkpoint này.

Reviewer phát hiện mất task/tệp/chat/quyền/tiền/Project/attribution trong thân merge cũ. **CRM merge chưa READY, cutover HOLD**; kiểm quyền không chứng minh giao dịch nguyên tử hoặc bảo toàn dữ liệu. [Phạm vi, findings, kiểm thử và bước triển khai](vpt-marketing-automation/LEGACY_CRM_MERGE_REPAIR.md). Full goal ACTIVE; không DB thật/model/provider/chi quảng cáo/phát hành. Các mục dưới là lịch sử.

---


## Hiện hành 04/10/2026 — Checkpoint quyền CRM đã qua PostgreSQL

Runtime `2cac0949aa78bb5d281f580c55c9dfe1171e6101` kiểm actor và toàn bộ hồ sơ gộp bằng quyền hiện hành; chặn gộp Customer khác nhau chưa đủ phạm vi. Cleanup không tự xóa các cơ hội cùng khách hàng. Local 50 ca mới + 67 regression = 117/0/0; PostgreSQL 271/0/0 gồm 7 ca mới; Node22 843+26+117, cả 10 job, build/report/Messenger SUCCESS. CI merge tree khớp runtime. Reviewer độc lập đã đối chiếu published blobs và log CI, kết luận PASS đúng phạm vi quyền/cleanup.

[Phạm vi, bằng chứng và findings còn mở](vpt-marketing-automation/LEGACY_CRM_MERGE_REPAIR.md). **CRM merge chưa READY**: còn giao dịch nguyên tử, receipt, bảo toàn task/tệp/chat/quyền/tiền/Project/attribution và Customer command đầy đủ. Tiếp tục khép phần này, creator company và cutover; sau đó cấu hình/nghiệm thu toàn tuyến, Founder release. Full goal ACTIVE; chưa DB thật, model/provider, chi quảng cáo hoặc phát hành.

---

## 04/10/2026 — Nhật ký batch và UI phục hồi đang nghiệm thu

SQL684/private journal, helper và GET lịch sử/tiến độ; route batch lưu trước dispatch, kiểm claim và lưu từng kết quả; RESULT cuối hoàn tất nguyên giao dịch. Thay handler UI cũ bằng recovery controller/component có request cố định, reload GET, lịch sử server và trạng thái chưa rõ được giữ lại. Cập nhật suite/CI, source-route VM extraction và CURRENT/README. Local294/0/0, reviewer PASS mã sau ba finding đã sửa; browser thật/API giả PASS các tình huống ghi trong LEGACY_BATCH_JOURNAL.md. 16ca PostgreSQL mới/build chưa xác minh CI. Hoàn tác giữ journal/claim, dừng-chờ-đối soát trước chuyển code. Full goal ACTIVE, chưa live DB/UAT/release hoặc250k thực tế.

04/10/2026 — CI runtime27b17f: Node22 843+26+294/build và report/Messenger PASS, nhưng intake PG306pass/1parentfail vì SQL684 line139 CASE thiếu ngoặc trong IF (42601 tại character10935);16ca mới chưa chạy. Thêm ngoặc cho biểu thức CASE, giữ nguyên điều kiện quyền/trạng thái. Chờ CI sửa; không dùng PASS mã để thay PASS PostgreSQL.

04/10/2026 — Checkpoint nhật ký runtime7b455b9/treee14b82f đã qua PostgreSQL323/0/0 gồm16ca mới307–322, automation37173674070 cả10jobSUCCESS, report37173674086/Messenger37173674069SUCCESS. CImerge85194fb đúng tree và parents basee16c885+runtime. Local294; browser component thật/StrictMode/API giả PASS; review độc lập PASS SQL684/helper/API/UI sau tự đối chiếu published SQL/log CI. Cập nhật CURRENT/README/LEGACY_BATCH_JOURNAL và dẫn bản batch cũ tới hợp đồng mới. Chưa toàn cutover/UAT/release, giữ UNKNOWN/claim và dữ liệu đã ghi khi hoàn tác. Full goal ACTIVE.
## 04/10/2026 — Runtime survey nối lịch và xác nhận khách (chờ CI)

SQL695 thêm policy riêng, shared survey cores giữ facade679, runtime BEGIN/FINISH và authority xuyên dispatch/booking/outcome. Adapter chỉ cho SURVEY với trích dẫn request/location; service chọn actual slot, customer click signed mới đặt lịch và handoff. Unit/full local1.383PASS/0fail/5skip; bộ PG mới còn chờ CI. Reviewer đang rà; đã sửa mất guard679 phát hiện trong diff đầu và thêm human regression. [Hợp đồng và hoàn tác](vpt-marketing-automation/CARE_SURVEY_RUNTIME.md). Chưa live quyền/provider/DB/release; full goal ACTIVE.
04/10/2026 — Follow-up SQL695: sửa qualifier reason bằng block label tường minh theo independent review; facade679 đã giữ current actor, scope replay và delivery barrier. Bổ sung hai race confirmation/finish có observer, cap kể proposal hết hạn và hồi quy human. Unit reviewer35/35PASS; chờ PostgreSQL trên bản cuối, không dùng CI chưa xong làm PASS.
04/10/2026 — CI survey d629fe1/f767b9c477PASS/10FAIL; bản đầu qualifier, bản sau NO_CONFIRMED_OPTION ở9ca. Sửa lọc staff trước inventory/limit theo reviewer, xuyên prepare/propose/dispatch/book; human API giữ nguyên phạm vi. Thêm hai regression hơn200options và diagnostic khi positive fixture không tìm giờ. Chưa PASS PostgreSQL/checkpoint.
04/10/2026 — SQL695 runtime e91381a/treece06e8d đã kiểm chứng: automation37195694346 cả10job SUCCESS; PG111416967405=489/0/0 gồm20ca mới, Node18/22 mỗi bản1.388/0/0; build10.335modules/39,21s; report37195694282/Messenger37195694283SUCCESS. CImerge8149a194 đúng tree/parents; reviewer độc lập xác minh published blobs/log/tree và PASS checkpoint, đóng guard679/qualifier/staff-scope. [Hợp đồng và bằng chứng](vpt-marketing-automation/CARE_SURVEY_RUNTIME.md). Không coi hai CI lỗi trước là PASS. Chưa live/UAT/release; tiếp tục UI runtime/ngoại lệ, cấu hình/chuyển luồng và nghiệm thu. Full goal ACTIVE.


## 04/10/2026 — Runtime activity console

Bổ sung CareRuntime/careRuntimeState, tab Chăm khách và10ca unit cùng workflow. Hiển thị dữ liệu từ API693–695; không SQL/backend change. Pending CLOSE được lưu trướcPOST, exact receipt mớiclear; tab/company/actor đổi loại phản hồi cũ. ProposalId dùng đọc trạng thái hiện tại, không suy booking từDRAFT. Local1393/0/5, esbuildPASS; browseractualWorkspace+APIgiả kiểm lostACK/reload, actor/companyABA, delayedREAD/tab, revokedsource, OPEN→BOOKED, GET503 và mởhàngchờ. CI/review cuối đang chờ; khôngphát hành. Xem CARE_RUNTIME_CONSOLE.md.


### Đóng kiểm chứng runtime UI411e895

Automation37197060961 cả10SUCCESS; Node18/22 mỗi1398/0/0, intakePG489/0/0, build10337modules/36,34s; Report37197060933/Messenger37197061020 SUCCESS. CImerge d974079331084ab70cb59d5ad01daf033906a210 khớp tree528487b595eb4a5aac17de1376d566bb4e12f9ca vàparents. Reviewer xác minh publishedblobs/log/tree, PASScheckpointUI; browserdoimplsynthetic. FullgoalACTIVE; cònchi phíAI/UNKNOWN,cấu hình/chuyểnluồng/UAT/release.


## 04/10/2026 — AI usage/cost visibility

Thêm SQL696 reader cùngsnapshot, API Primary/offdefault và tab Chi phí AI;8unit/9PGcases vàworkflow. Guard company/actorbinding, khônglộsecret/context; serverunresolvedqueue, actualCostNULL, reservedkhôngrefund. Local1401/0/5; browseractualWorkspace/APIgiả kiểm tổng/queue/403/ABA. Reviewđã sửaCASE và fixtureUNIQUE; chờCI/PG/build cuối. Khôngthayadmission/quyền hoặcDB thật. Xem CARE_INFERENCE_COST_CONSOLE.md; fullgoalACTIVE.

### Đóng kiểm chứng Cost Console f7237b6

Automation37198601106 cả 10 job SUCCESS; Node18/22 mỗi bản 1.406/0/0, intake PostgreSQL498/0/0 gồm 9 ca mới, build10.339modules/37,23s. Report37198601104 và Messenger37198601119 SUCCESS. CI merge452fbbd3cfbb7fafece00fde810c8fd560339365 có treee119eedef9acbab75d2805e44073058d43a8d115 và đúng parents base/head. Reviewer độc lập xác minh published blobs/log/tree và PASS checkpoint; không chứng nhận settlement, mở UNKNOWN, provider thật, UAT hoặc phát hành. Đã đóng trang và server kiểm thử dữ liệu giả. Cập nhật CURRENT/README theo câu hỏi Founder về bước tiếp: đối soát AI, cấu hình nội dung/người nhận/lịch/hạn mức, chuyển luồng/khôi phục và nghiệm thu toàn tuyến trước gói phát hành. Full goal ACTIVE; còn công việc được phép, chưa bắt đầu chi thử hoặc có kết quả 250.000 đồng/khách thật.

## 04/10/2026 — Phục hồi ghi biên nhận AI trong cùng lượt

Thay `careOpenAiInference.record` bằng tối đa hai lần ghi cùng receipt bất biến khi lỗi tạm thời/mất ACK; không repeat claim/model/BEGIN/FINISH. Fail closed với mã không nhận diện, quyền, conflict hoặc ACK sai; kiểm Primary trước mỗi lần, cho phép ghi lịch sử sau revoke nhưng không mở quyền trả lời. Thêm 6 unit và 4 ca actual runtime→SQL với HTTP giả. Local focused53/0/0, toàn workflow1.407/0/5; CI/PG/review đang chờ. CURRENT/README/CARE_OPENAI_INFERENCE ghi giới hạn mất tiến trình/hóa đơn/UNKNOWN và hoàn tác. Full goal ACTIVE; chưa gọi provider thật, thay SQL hoặc phát hành.

### Đóng kiểm chứng phục hồi receipt31aa29f

Automation37199346559 cả10job SUCCESS; Node18/22 mỗi bản1.412/0/0; intake PostgreSQL502/0/0 gồm4ca448–451; build10.339modules/36,09s; Report37199346557 và Messenger37199346554 SUCCESS. CImerge9310e17f3f15a6287a7ac1dbe7bb36f7b5bc8a51 khớp treecdf97594f2fdf29c863bc1e165c807bb35a2af8e và parents base/head. Reviewer độc lập xác minh published blobs/log/tree, PASS checkpoint đúng phạm vi khi còn giữ receipt. Chưa giải quyết mất tiến trình, UNKNOWN provider, hóa đơn, cấu hình/chuyển luồng/khôi phục/UAT hoặc phát hành. Full goal ACTIVE; lượt trước là PROGRESS và lượt này tiếp tục thay đổi mã cùng bằng chứng, không phải chỉ nhắc trạng thái. Không thay quyền hoặc chi tiền thật.

## 04/10/2026 — Diễn tập logical restore và OID manifest

Thêm SQL697 private operator restore_plan/rebind_restored_manifest, không cấp quyền hoặc tự thực thi. Thêm facebookRestore.postgres.test.js và service PostgreSQL16 target riêng vào workflow, chạy sau suite502ca để dùng dữ liệu nghiệp vụ đã tạo. So exported snapshot/dump với toàn data/schema/ACL/FK/audit; source/target khác cluster, target rỗng và không worker. Kiểm OID đổi, private permissions, graph/guard/hash/revision sai, lock timeout, collision/rollback, concurrency/replay và UNKNOWN/cost còn nguyên. Node syntax PASS; local rehearsal SKIP đúng vì không có PostgreSQL/Docker. CI/review cuối chờ. RESTORE_REHEARSAL.md ghi nguồn chính thức và giới hạn production/roles/files/RPO/RTO. Full goal ACTIVE; chưa DB thật/phát hành.

# 2026-10-05 — PR19/main compatibility and detail permissions

Reconciled two conflicts between e16c885a and main ca8810c5. Preserved new Page/post/embedded views and PR19 data/async protections. Independent review identified project and Lead detail disclosure in the newly introduced main route; reused existing permission gates. Separate stale action failures from report failures. Modified adAnalytics route/UI, correctness/action lifecycle tests, CI path coverage, CURRENT and integration evidence. Local regressions 127/127; full frontend build and supported-browser synthetic checks. Operational gate HOLD: read-only CRM authorized but login pending; Render workspace unconfirmed; no live changes. See PR19_MAIN_INTEGRATION_20261005.md for scope, limitations and rollback.

## 2026-10-05 — PR22/main integration and qualified-Lead semantics

Merged PR19 f5efde61 (main ca8810c5) into PR22 10ed7b73 in isolated worktree. Preserved new Page/post/embedded views, canonical detail permissions, batching and stale response guards. Retained trial/operations/full-spend panels, 250k qualified paid Lead target and Finance UNKNOWN across all four new routes; labelled closed Deal values as estimates. Adapted two test harnesses for new imports; no production/SQL/config changes. Windows Node24 suite 1488 total / 1486 pass / 0 fail / 2 native-signal skips; report/UI 128 pass; full Vite build pass. Supported-browser synthetic component checks passed; independent preservation reviewer ran 140 pass and matched four runtime blobs. CI/new-head PostgreSQL pending. See vpt-marketing-automation/MAIN_INTEGRATION_20261005.md. Read-only CRM is now explicitly authorized but login remains needed; Render workspace pending. Release HOLD.

### Published integration checkpoint 542c4ee5

Tree bc23ed0a, parents 10ed7b73/f5efde61; CI merge a7c84af7 has identical tree. Automation37255873901 all10 jobs, report37255873900 and Messenger37255873905 SUCCESS. Node18/22 each1491/0/0; intake PostgreSQL507/0/0; restore11/0/0; report128 PASS; frontend build10339 modules. Independent architecture_v11_review verified published blobs/parents/tree and CI logs, PASS technical checkpoint. This documentation closure does not change runtime, SQL, permissions or operational HOLD; CRM login and environment/config/UAT remain outstanding.

## 2026-10-05 — Agent architecture audit requested by Founder

Applied ECC agent-architecture-audit to source679cb926: care runtime, legacy internal reporting chat and workflow integration, mapped to12 layers. Six findings: model-controlled reporting scope; UNKNOWN/approve/wait pass-through; ungated factual final; truncated tool JSON; failed-result session mutation; correction lost before memory priority. Seven offline VM probes reproduced mechanisms, no live DB/model/provider calls.64 focused care contract tests pass on Node24 with --test-isolation=none. Evidence/report/runner saved under audits/2026-10-05-agent-architecture. Scope explicitly does not prove production incidents or activation. No runtime/SQL/config changes, no independent review of this audit, no release/phase/baseline approval. Findings and ordered fixes are proposals. Audit artifacts remain local/unpublished.
