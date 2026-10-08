## 2026-10-08 — Sửa test báo cáo quảng cáo adAnalytics

Sáu lỗi ở /pages-profile, /page-ads, /page-posts do DB giả thiếu toán tử .is('lead_id', null) đã thêm trong mã báo cáo; sửa harness tại backend/tests/adAnalytics.correctness.test.js, giữ nguyên khẳng định đếm Lead và đọc theo lô.
Kiểm tra: 127/127 test adAnalytics và 68/68 test P1 liên quan đạt trên Node 24 với --test-isolation=none; node --check đạt. Lệnh workflow nguyên dạng bị sandbox chặn spawn (EPERM); chưa kiểm Node 18/22 hoặc DB thật. Không đổi mã runtime/API; hoàn tác bằng cách bỏ diff test và mục bàn giao này.

---

## 2026-10-08 — Bảng sản xuất: dự án mới đã gán đơn vị VC không còn bị xếp vào cột cuối («Đã giao»)

Lỗi: deal thắng MỚI về xưởng đã chọn sẵn đơn vị vận chuyển lúc tạo (`projects.logistics_company_id`), status còn `consulting`, `sx_kanban_column_id` NULL, bị `resolveSxDisplayColumnId` (`backend/src/helpers/workshopKanban.js`) xếp vào cột CUỐI pipeline («CÔNG NỢ ĐÃ CHỐT»), nên thẻ hiện «Đã xong / Đã giao» + «Công nợ đã chốt» (thấy ở TB-2026-1037/1038). Nguyên nhân: nhánh `wonDeal` chỉ trả cột đầu khi `!inLogistics`; dự án có đơn vị VC rơi xuống nhánh `inLogistics` cuối hàm → `lastSxPipelineColumnId`. Sửa (commit `f04b8752`): nếu `inLogistics` nhưng status `consulting`, chưa `current_stage_id`, chưa `sx_handover_at` và chưa có `vc_kanban_column_id` thì về cột đầu như dự án chưa gán đơn vị VC. Hàm dùng chung nên web và app đổi theo; không đổi API/schema.

Kiểm chứng: cấu hình 23 cột thật HCB Tủ bếp + dự án mô phỏng (lỗi đổi «CÔNG NỢ ĐÃ CHỐT» → «Tiếp nhận đơn hàng về SX», các trường hợp shipping/completed/đã có cột VC/đã vào xưởng giữ nguyên); so cột 430 dự án thật trước/sau sửa: 0 thay đổi; dự án test thật `TEST-NULL-001` — app (backend chưa deploy) hiện «CÔNG NỢ ĐÃ CHỐT», code đã sửa cho «Tiếp nhận đơn hàng về SX». ĐÃ MERGE (#67) VÀ DEPLOY; kiểm lại sau deploy trên app: `TEST-NULL-001` hiện «Tiếp nhận đơn hàng về SX», chip «Tiếp nhận» 0 → 1, hết nhãn «Đã giao».

DỮ LIỆU TEST (đã dọn): AI đã ghi vào DB thật theo yêu cầu người dùng `projects` `TEST-NULL-001` và `crm_leads` deal `TEST-NULL-DEAL-001` (HCB Tủ bếp, cột NULL, đã gán đơn vị VC Phúc Đạt, dùng lại khách «ZZ TEST — kiểm thử kéo thẻ (xoá sau)»). Người dùng đã tự xóa cả hai; kiểm tra lại bằng SQL chỉ-đọc: không còn dòng nào mã `TEST-%` ở `projects`/`crm_leads`, không còn dự án HCB Tủ bếp cột NULL, app tìm «TEST-NULL» trả 0. Khách «ZZ TEST…» là dữ liệu có từ trước, vẫn còn. HCB Tủ bếp lúc kiểm: 431 dự án (gồm TB-2026-1043 thật tạo 08/10 11:11), máy chủ 431/42/5/124/0 khớp app.

Chưa xử lý: nhánh «đã vào xưởng (`current_stage_id`) + có đơn vị VC + không có cột» vẫn về cột cuối (có thể là dự án cũ hợp lệ).

---

## 2026-10-08 — P1-10: ảnh chụp tổng hợp đợt thử (local)

Thêm SQL 713/rollback, module summary, daily khi COMPLETE, job cờ `VPT_P1_SNAPSHOT_CRON` mặc định tắt và GET `/snapshots` chỉ admin trên DB chính.
Chỉ ghi thêm; khi chi tiêu chưa COMPLETE, `spend_by_day=[]` và `source_note` ghi trạng thái, không suy thiếu thành 0.
Test Node trực tiếp và `node --check` đạt; chưa chạy SQL, kết nối DB/mạng hay kiểm chứng dữ liệu thật. Hoàn tác: bỏ delta P1-10; rollback SQL chỉ gỡ bảng rỗng, giữ ảnh chụp đã có.
---

## 2026-10-08 — SX mobile: trần quét việc dự án không còn cắt âm thầm

`GET /api/work-tasks/team-project-tasks` trước đây quét tối đa 8000 dòng và bỏ phần vượt mà không báo; HCB đã có ~6410 việc không hạn cũ (mọi phân loại, vì lọc phân loại làm sau khi quét) nên sắp chạm trần. Nay trần mặc định 30.000 (`TEAM_TASKS_SCAN_CAP`), quét theo đợt 6 lô song song (`TEAM_TASKS_SCAN_WAVE`), và `counts` có thêm `truncated` + `scan_total`; vượt trần thì `console.warn` và app tab Công việc (xem quản lý) hiện dòng «Danh sách quá lớn … chỉ tính phần đầu». App cũ bỏ qua hai trường mới. Commit `813f5bde` (backend), `7c44e4bb` (app).

Kiểm chứng chỉ-đọc bằng server Express tạm (auth giả trong bộ nhớ, dữ liệu thật): HCB không hạn mọi loại quét 6410 dòng, `truncated=false`; ép `TEAM_TASKS_SCAN_CAP=3000` thì `truncated=true`, `scan_total=6410`; Tủ bếp mặc định 864 quá hạn / 1434 việc / 108 nhóm, Hôm nay 51/3 — khớp app. Chưa xem dòng cảnh báo trên màn hình app (cần ép trần trên backend máy, đổi JWT và mất phiên đăng nhập); mới kiểm kiểu bằng tsc. Chưa merge/deploy.

Chưa xử lý gốc: lọc phân loại vẫn chạy SAU khi quét nên «Tủ bếp» vẫn quét cả 6410 việc của HCB; trần mới chỉ là đệm. Muốn gọn hơn thì đẩy lọc phân loại xuống truy vấn.

---

## 2026-10-08 — P1-9: mốc Cold/Warm/Hot (khách đã được sales phân loại) tự động (mã cục bộ)

`/summary` thêm `milestone` từ lịch sử bước do người chuyển sau `cham_dau_luc` của ứng viên, chi phí đến nay và nhóm qua 4 ngày; vẫn `NOT_EVALUATED`, chỉ đọc, cờ mặc định tắt. UI hiển thị chỉ số thay thế trung tính; xác nhận thủ công là tuỳ chọn.
Test Node trực tiếp và `node --check` đạt (xem WORKLOG). `trialCohort` lấy attribution mới nhất nếu khách có nhiều dòng, nên chưa bảo đảm `cham_dau_luc` là lần chạm đầu; chưa build/duyệt trình duyệt hoặc đối chiếu DB/HTTP thật. Hoàn tác: bỏ delta P1-9 và hai mục handoff này.

---

## 2026-10-08 — P1-8: tổng hợp tạm tính chi phí khách hợp lệ (mã cục bộ)

GET `/summary` dùng cùng tập ứng viên với `/queue`, đọc chi tiêu Facebook theo scope và chỉ tính tiền khi đủ coverage; giao diện hiển thị số tạm tính, luôn `NOT_EVALUATED`. Cờ `VPT_P1_REVIEW_WRITE` giữ mặc định tắt; không ghi DB hay đổi quảng cáo.
Kiểm thử Node và số ca xem WORKLOG. Chưa kiểm DB/HTTP thật, dữ liệu chi tiêu thật, build hay duyệt trình duyệt. Hoàn tác: bỏ đúng delta P1-8 trong route, module cohort, test, hai file UI và hai mục handoff này.
---

## 2026-10-08 — SX mobile: KPI bảng sản xuất khớp web/máy chủ; summary HCB hết lỗi 500

Lỗi: `GET /api/production/projects?summary=1` trả 500 «Bad Request» với mọi truy vấn có HCB (652 dự án gắn deal), Metalla (91) vẫn chạy. Nguyên nhân: `thinScanSummary` và `loadSxDeadlineBucketPage` nhét cả mảng `wonIds` vào `.or(id.in.(…))`, URL PostgREST vỡ từ khoảng 556 id. App phải rơi về đếm ở máy. Sửa ở `backend/src/helpers/sxKanbanSummary.js`: chia lô id (dùng `pickChunkTarget`/`chunkIds` của `sxChunkedIdPage.js`), quét song song, hợp nhất theo `id`. Không đổi API/schema.

Đồng bộ định nghĩa: web và máy chủ đếm Đang SX / Chờ VC / Đã VC CHỈ theo cột kanban (`sxColumnStageKpiKey`); app thêm quy tắc `projectIsShipped` (có đơn vị VC thì «đã VC») nên HCB hiện Đã VC 216 / Đang SX 28 so với 121 / 41. Sửa `computeSxBoardKpis` trong `sx-mobile/src/lib/sxBoardKpis.ts` đếm theo cột; `projectIsShipped`/`projectIsDelivered` giữ cho nhãn thẻ và quá hạn.

Kiểm chứng (chỉ-đọc, HCB Tủ bếp, 07/10/2026): hàm đã sửa trả tổng 429, Đang SX 41, Chờ VC 5, Đã VC 121, quá hạn 7 (đếm tay trong DB cũng ra 41/5/121); Metalla không đổi. App ở máy: 429 / 42 / 5 / 121 / 7 — chênh 1 ở Đang SX vì API danh sách «làm giàu» `sx_kanban_column_id` cho dự án DB để NULL (TB-2026-1037, 1038) còn summary đếm cột thô. Khi summary chạy, tiêu đề app dùng số máy chủ (41).

Đã gộp vào main qua #54 (và #53); chưa xác nhận backend đã deploy bản sửa summary — cần gọi lại `summary=1` cho HCB (kỳ vọng 200, 429/41/5/121/7) hoặc xem thẻ KPI trên app.

Chưa xử lý: TB-2026-556 (không gắn deal, `sx_kanban_column_id` NULL) bị cả web lẫn app loại khỏi bảng — chưa rõ thiết kế hay dữ liệu rác; thẻ TB-2026-1037/1038 mới tạo hiện nhãn «Đã xong / Đã giao» và «CÔNG NỢ ĐÃ CHỐT»; `TEAM_TASKS_SCAN_CAP=8000` ở `workTasks.js` cắt âm thầm (HCB hiện 6410 việc không hạn cũ); huy hiệu chuông (83) chưa đối chiếu được với DB. Mục «2026-10-06 16:39 — Sửa cổng xác minh callback Lead App» ở dưới đã mất thân bài từ lần gộp #55, không do phiên này.

---

## 2026-10-07 — P1-7b: màn admin đánh dấu khách đợt thử (mã cục bộ)

Thêm GET config/trials/queue vào route P1 đang tắt mặc định và khối đánh dấu trên trang quảng cáo FB. Kênh ứng viên: `messenger`, `lead_ads`; scope tài khoản quảng cáo chưa đối chiếu.
Kiểm tra: 7 test queue, 2 test UI, 22 test route cũ, 6 test qualification đạt bằng Node; chưa build/duyệt trình duyệt, chưa kiểm DB/HTTP thật. Hoàn tác: bỏ delta P1-7b ở route, hai test, hai file UI mới, import/JSX và hai mục handoff.

---

## 2026-10-07 — P1-7: route xác nhận khách (mã cục bộ)

Thêm route admin `GET/PUT/POST /api/marketing-p1/qualification/leads/:leadId` (POST thêm `/revoke`), mặc định tắt bằng `VPT_P1_REVIEW_WRITE`. Kiểm CRM company, phạm vi HST và primary trước RPC; chỉ trả trường sự kiện cho phép.
Kiểm thử: route 22/22, qualification/trialRegistry 11/11; chưa thử HTTP thật, DB thật hay SQL. Hoàn tác: bỏ route/test, một dòng mount và hai mục handoff P1-7.

---

## 2026-10-06 — P1-5: sự kiện xác nhận khách (SQL 712, mã cục bộ)

Thêm SQL 712/rollback, adapter `qualification.js` và test giả; chưa nối route/UI, chưa chạy SQL hay DB thật. `canonical_lead_id` tạm là `crm_leads.id`; P1-3 sẽ xử lý gộp và đếm trùng. Kiểm thử và số ca xem mục WORKLOG cùng ngày.
Hoàn tác: chạy rollback trên bản sao được phép (giữ bảng có dữ liệu), rồi bỏ đúng delta P1-5 và hai mục handoff.

---
## 2026-10-06 — P1-6: đọc chi tiêu Facebook và chứng minh coverage (local)

Thêm `spendCoverage.js` chỉ đọc và `spendCoverage.test.js`; không route, migration hay kết nối nguồn thật. 14/14 test P1-6, 8/8 đồng bộ cũ, 38/38 lead measurement đạt bằng Node. Chỉ kết luận `COMPLETE` khi sync và mọi dòng đủ điều kiện; chưa có đối soát tổng cấp tài khoản Meta (`AD_LEVEL_ONLY`). Claude cần chạy adapter với DB thật và đối chiếu 27.589.061 đ cho 07/09–05/10 cùng trạng thái sync trước PR. Hoàn tác: bỏ hai file JS P1-6 và hai mục bàn giao P1-6.

---

## 2026-10-06 16:39 — Sửa cổng xác minh callback Lead App trước chuyển đổi (mã cục bộ)
## 2026-10-07 — SX mobile tab Công việc/Dự án của quản lý: lọc theo hạn, khử trùng, tự nhảy cột

App sx-mobile (quản lý/admin) tab Công việc lấy việc dự án của cả đội qua `GET /api/work-tasks/team-project-tasks` (phân trang theo nhóm dự án, quá hạn lên trước, có mục riêng "Không hạn" cho việc cũ hơn 7 ngày). Chip Hạn xử lý (Hôm nay / Ngày mai / Trong tuần / Tuần sau), Phân loại và Người đều lọc ở máy chủ (`due_from`, `due_to`, `workshop_type_id`, `assignee_id`).

Lỗi đã sửa: lọc khoảng hạn trước khi khử trùng khiến bản CRM (hạn hôm nay) sống sót dù bản SX cùng tên đã quá hạn, nên dự án quá hạn lọt vào Hôm nay/Ngày mai (ví dụ TB-2026-986, TB-2026-989 ở HCB). Nay khử trùng trước (lấy thêm bản SX song sinh của các dự án có việc CRM trong khoảng) rồi mới lọc lại khoảng hạn.

Tab Dự án (Kanban): khi áp Hạn xử lý mà cột đang xem trống thì tự nhảy tới cột đầu tiên có dự án, một lần cho mỗi giá trị bộ lọc.

Đối chiếu SQL chỉ-đọc với app sau deploy (HCB = Công ty Hucabi, 07/10/2026): Tủ bếp Hôm nay 43 việc/3 nhóm, Ngày mai 51/3; Cánh kính Hôm nay 7/1, Ngày mai 7/1 — khớp. Các số đổi theo ngày và theo việc được hoàn thành.

Chưa kiểm: độ mượt cuộn trên máy thật (LDPlayer render phần mềm, số đo giật không đáng tin); `/project-overview` (route do tác giả khác thêm) mất ~13,7 s với HCB; sửa/xóa ở không gian chung chưa phân quyền theo vai trò; badge thông báo còn race. Token `gh` của phiên AI không có quyền tạo/merge PR, người dùng tạo PR và merge thủ công.

---

## 2026-10-07 — Quản lý phát sinh ở các module còn lại

Trang hai tab Không phí / Có phí của Sản xuất có thêm ở CRM (`/crm/phat-sinh`), Lắp đặt (`/vc/phat-sinh`), Kế toán (`/ketoan/phat-sinh`), Mua hàng (`/mua-hang/phat-sinh`) và module tùy chỉnh (`/m/:moduleKey/phat-sinh`). Mỗi trang chỉ hiện việc phát sinh của đúng module đó.

---

## 2026-10-07 — Chi phí phát sinh kế toán lấy từ việc phát sinh không gian chung

Khu "Chi phí phát sinh" ở tab Tài chính chi tiết deal kế toán liệt kê việc phát sinh của deal (`crm_assignments` có `phat_sinh_kind`, bỏ việc đã hủy): loại, có phí/không phí theo loại, trạng thái, lỗi nhân viên/khách yêu cầu, người làm. Kế toán ghi chi phí từng việc (số tiền, "Không phí" = 0, "Bỏ" = void). Không còn nhập tay vào `project_expenses`.

Chi phí lưu ở `cost_entries` (`source_key='sx.project_expense'`, `source_table='crm_tasks'`, `source_row_id` = `crm_task_id` của việc) vì `source_row_id` là uuid còn id việc là bigint. Không đổi schema. Việc chưa gắn `crm_task_id` thì chưa ghi được phí.

Thẻ dashboard hiện "Phát sinh (n việc)", tổng phí hoặc "Chưa ghi phí". Checklist hồ sơ có mục "Phát sinh đã ghi chi phí" (chỉ khi deal có việc phát sinh). CSV thêm "Số việc phát sinh".

---

## 2026-10-07 — Kế toán thấy VC/LĐ của từng deal

Thẻ deal kế toán có thêm cột "Vận chuyển / Lắp đặt" (đơn vị VC, cột kanban VC, ngày giao, ngày lắp) và ô "Phí VC/LĐ". Lọc được theo Chưa bàn giao / Đang VC/LĐ / Lắp xong. Chi tiết deal cho kế toán nhập `projects.logistics_cost` (trống = chưa nhập, 0 = không phí), ghi kèm sổ chi phí qua `syncLogisticsCost`. Hồ sơ deal thêm mục "Có phí VC/LĐ"; "Thu đủ tiền" cũng báo thiếu khi đã lắp xong. Công nợ có cột VC/LĐ. Giai đoạn VC suy theo `logistics_pipeline_stages` (dùng `kpiBucketForStage`), dự án `vc_deleted_at` coi như chưa bàn giao.

---

## 2026-10-07 — Kế toán giai đoạn 1: hồ sơ deal, xuất hóa đơn, công nợ

Mỗi deal kế toán có danh sách 8 mục hồ sơ (báo giá, file Excel, đơn hàng, đơn khớp giá deal, cọc, mã giao dịch khoản thu, hóa đơn, thu đủ). Dashboard có khung "Việc kế toán cần làm" đếm deal thiếu từng mục, bấm để lọc. Chi tiết deal có nút xử lý từng mục và hộp "Xuất hóa đơn" từ đơn hàng (ghi `invoices.lead_id`, chặn vượt giá trị đơn). Trang mới `/ketoan/cong-no` chia tiền còn thu theo số ngày nợ, tính từ ngày bàn giao SX. Không đổi schema. Chưa làm: công nợ phải trả xưởng/NCC, sổ quỹ, báo cáo lãi lỗ, khóa kỳ.

---

## 2026-10-07 — Bấm bình luận mở đúng module của người nhận

Nhân viên xưởng bấm chuông bình luận của sale CRM không còn bị đưa sang trang deal CRM. Người chỉ thuộc Sản xuất mở `/sx/projects/:id?tab=comments`, người VC mở `/vc/projects/:id`, người CRM mở `/crm/leads/:id`. Thông báo mới ghi `viewer_module_key` theo từng người nhận.

---

## 2026-10-07 — Kế toán: đối chiếu file báo giá với tên CRM và tên xưởng

Danh sách kế toán hiện mỗi deal thành ba cột: tên dự án CRM, tên dự án xưởng, file báo giá. Deal có hai tên khác nhau được đánh dấu. File Excel đã nhập báo giá được ưu tiên; nếu chưa nhập thì hiện tệp đang nằm trên dự án xưởng.

---

## 2026-10-06 — Tiến độ thẻ SX không tính xong khi CRM còn bản đang mở

Thẻ danh mục xưởng chỉ cộng việc con là xong khi mọi việc CRM cùng tên đã xong. Còn một bản đang mở (ví dụ Sơn vừa completed vừa pending) thì việc xưởng cùng tên vẫn chưa xong. Bản huỷ không giữ việc ở trạng thái mở.

---

## 2026-10-06 — Kanban trên Quản lý nhiệm vụ

Quản lý nhiệm vụ có hai kiểu xem: Kanban (Chưa làm, Đang làm, Đã làm) và Hạn (các cột theo ngày). Lựa chọn giữ trong phiên làm việc của từng module.

---

## 2026-10-06 — KPI Tổng / Chưa làm / Đang làm / Đã làm / Quá hạn trên Quản lý nhiệm vụ

Trang Quản lý nhiệm vụ (CRM, Sản xuất, Lắp đặt và tổng quan) có dải số giống Giao việc. Bấm Chưa làm, Đang làm hoặc Quá hạn để lọc bảng. Đã làm đếm danh mục đã xong hết việc con.

---

## 2026-10-06 — Quản lý nhiệm vụ CRM cùng khung với Sản xuất

`/crm/project-tasks` dùng cùng khung tràn ngang với `/sx/project-tasks`. Thẻ CRM không có hạn module thì lấy mốc lịch lắp của dự án để xếp vào cột Quá hạn / Hôm nay / Ngày mai, giống thẻ xưởng. Không ghi hạn đó xuống việc con.

---

## 2026-10-06 — Lọc dự án theo công ty và nhân viên CRM

Ô chọn dự án/deal trong hộp giao việc có bộ lọc Công ty và Nhân viên CRM (đội kinh doanh của công ty đó). Đổi công ty thì danh sách nhân viên CRM và kết quả tìm dự án đổi theo.

---

## 2026-10-06 — Nhóm theo hạn có cột Ngày mai

Màn Deadline của giao việc (Nhóm theo hạn) thêm cột Ngày mai, nằm giữa Hôm nay và Tuần này. Việc hạn đúng ngày hôm sau vào cột này; Tuần này giữ phần còn lại trong 7 ngày tới.

---

## 2026-10-06 — Form phát sinh có phân loại và người chịu trách nhiệm

Hộp «Giao việc mới» trên `/sx/phat-sinh` có loại phát sinh (theo tab có phí / không phí), loại nhiệm vụ, khối gây lỗi, người chịu trách nhiệm và người làm. Chọn loại có người phụ trách thì điền sẵn người chịu trách nhiệm. Tạo việc lưu `phat_sinh_kind` và nguồn nhiệm vụ.

---

## 2026-10-06 — Kéo thả thẻ giao việc sang cột khác

Thẻ Kanban giao việc kéo được sang cột khác. Id thẻ giữ trong ref lúc kéo (không setState trong dragstart, vì setState làm trình duyệt hủy kéo). Thả đúng cột đang đứng thì không gọi API. Link deal trên thẻ không cướp thao tác kéo.

---

## 2026-10-06 — Bộ lọc nhanh giao việc mặc định đóng

Cột «Bộ lọc nhanh» trên trang giao việc khởi tạo ở trạng thái thu gọn (dải hẹp trên desktop, thanh mỏng trên mobile). Bấm tiêu đề để mở lại.

---

## 2026-10-06 — Bộ lọc giao việc luôn một công ty

Dropdown Công ty trên trang giao việc (bộ lọc nhanh, panel lọc giao việc và Không gian chung) không còn mục «Tất cả công ty». Admin chưa chọn hoặc chọn công ty không còn trong danh sách được gán công ty mặc định (công ty của user, rồi Phúc Đạt, rồi công ty đầu danh sách). Đặt lại bộ lọc giữ nguyên công ty đang xem. Form tạo việc vẫn có «Tất cả công ty module này» để lọc deal.

---

## 2026-10-06 — Dấu ★ setup CRM → SX trên ô chọn xưởng

Ô chọn công ty SX và phân loại trong hộp chuyển deal sang sản xuất hiện dấu ★ đúng các dòng ưu tiên ở Cài đặt pipeline. Một loại CRM được đánh ★ nhiều dòng. Deal chưa gán loại CRM vẫn thấy mọi cặp ★ của công ty; deal đã có loại thì ★ hiện mọi dòng ưu tiên của loại đó.

---

## 2026-10-06 — Đồng bộ chi tiêu Facebook: chặn sai nguồn

Helper đồng bộ ghi phần dữ liệu hợp lệ nhưng đánh dấu thiếu khi hết trang/dòng hỏng; không ghi chi tiêu nếu chưa biết currency, giữ nhãn USD, dùng ngày Việt Nam và mã lỗi Meta đã lọc. Giữ các trường kết quả cũ; không đổi runner/schema/chu kỳ. Test cô lập tại `backend/tests/fbMarketingSync.test.js`: V8 giả lập 8/8 PASS; Node CLI bị chặn khi tạo phiên sandbox. Chưa kiểm chứng DB/Meta/production. Hoàn tác: đảo diff helper, test và hai mục bàn giao này.

---

## 2026-10-06 — P1-1: so sánh nguyên và trạng thái bộ đo Lead

- Local only: sửa `leadMeasurement.js` (so sánh VND nguyên, chặn tràn tích, `uiState`) và thêm test trong `marketingAutomation.leads.test.js`.
- 25 test cũ giữ nguyên; tổng 38 test. Harness JS giả lập chạy 38/38; Claude review chạy lại bằng Node 24 (`node --test --test-isolation=none`) cũng đạt 38/38.
- Search `backend/src` chỉ thấy `measureLeadTrial` trong chính module; chưa có caller runtime. Chưa kiểm DB, mạng hay tích hợp.
- Hoàn tác: bỏ delta P1-1 ở hai file JS và hai mục handoff mới; giữ nội dung lịch sử.


## 2026-10-06 — Founder đã duyệt kích hoạt tuyến Facebook Form

Founder yêu cầu **“cho bật chạy thật luôn nhé”**. Quyền phát hành tuyến Facebook Form → CRM → Admin Vạn Phú Thành đã có, không chờ duyệt lại. [Hồ sơ kích hoạt và hiện trạng thật](FACEBOOK_LEAD_ADS_ACTIVATION_20261006.md) thay các trạng thái HOLD vì thiếu approval ở mục lịch sử bên dưới; các điều kiện kỹ thuật vẫn phải kiểm chứng.

Đã đối chiếu Page/công ty/Admin/taxonomy trên Primary, sửa khác biệt kiểu thông báo thật và tách Lead Ads khỏi Messenger. Source `327864b759c6e5663949b87723ed7049c209d193` có234/234 kiểm thử Node cục bộ PASS; đang chạy CI có PostgreSQL restore và review độc lập. Chưa merge/deploy/áp701–702 hoặc bật worker. Tab Render hiện thiếu quyền vào dịch vụ; đồng bộ Backup lần cuối thất bại đang được khảo sát. Không đổi ads/ngân sách, không gửi tin khách, không thay SQL700 của Claude.

---

## 2026-10-06 — Tiếp theo H1: Lead Ads → CRM và giao Admin

Founder giao làm bước tiếp theo. PR29 được bổ sung hợp đồng Lead Ads: binding Page/form rõ, atomic Customer/Lead/source/receipt/thông báo cho Admin, retry không tạo trùng; SQL702 mới chưa áp vào DB thật. [Phạm vi và hồ sơ kiểm chứng](FACEBOOK_LEAD_ADS_INTAKE_20261006.md). Source `a5bcabf3`:194/194 Node PASS,29/29 PostgreSQL intake và15/15 inbox PASS trên CI37393352657; regression Messenger CI37393352980 PASS. [Review độc lập](FACEBOOK_LEAD_ADS_INTAKE_REVIEW_20261006.md). Mọi cờ giữ mặc định tắt. H1 chuyển toàn endpoint nên còn phải chốt chuyển đổi Messenger và nghiệm thu cấu hình thật trước kích hoạt. Không merge/deploy, không thay ngân sách hoặc gửi tin khách.

---

## 2026-10-06 — H1: gói tiếp nhận Facebook Page riêng từ main

Founder giao tiếp tục và giữ quyết định phát hành. Đã tách nhánh `codex/facebook-durable-inbox-20261006` từ main `1f879ea8`, triển khai signed durable inbox + SQL701, giữ worker paused. Không merge PR22/25 toàn khối; không sửa SQL700 của Claude. [Phạm vi, giới hạn, kiểm thử và phương án dừng](FACEBOOK_PAGE_INBOX_H1_20261006.md).

PR29 draft, mã mới chưa triển khai. Source `c97c2f3d`:104/104 Node PASS; CI H1 run37383522836 đạt3/3job gồm15/15 PostgreSQL17 và restore fixture; regression Messenger cũ5/5 PG PASS; reviewer độc lập PASS mã mặc định tắt. Nghiệp vụ tự tạo Lead/projection/attribution còn pending có chủ đích; không dùng ACK/inbox làm Lead hợp lệ. Bật hệ thống thật HOLD; bước tiếp là hợp đồng Lead Ads đúng Page/công ty và projection phù hợp, không mở H2/C/ngân sách. Mục lịch sử bên dưới giữ nguyên theo thời điểm ghi.

---
## 2026-10-02 — Trợ lý Marketing–CRM: hồ sơ khảo sát MCRM-D0 v1

- Phạm vi được giao: khảo sát mã và chuẩn bị thử nghiệm; gói tại [marketing-crm-assistant/README.md](./marketing-crm-assistant/README.md).
- Đã làm: bản đồ 33 file nguồn tại main `0db11ce1adb0fb89fc87529036e495a62d58fce7`, 4 hợp đồng công cụ đề xuất, báo cáo dữ liệu giả, 26 kịch bản runtime và 8 đầu việc có owner/gate.
- Phát hiện cần xử lý trước pilot: đọc chi tiết Lead có thể ghi `lead_seen_by`; sổ attribution không đủ chứng minh mọi intake đã vào CRM; đường đọc Ads MCP có xử lý lỗi riêng cần rà lại.
- Kiểm chứng hồ sơ và review: [VALIDATION.md](./marketing-crm-assistant/VALIDATION.md). Không quy kết phát hiện tĩnh thành sự cố production đã xảy ra.
- Agent/API/DB/runtime: chưa chạy; 26 kịch bản NOT_RUN; nghiệm thu dữ liệu thật/phát hành HOLD. Còn thiếu Sales Admin cụ thể, target môi trường và policy tiếp nhận/chăm sóc.
- PR #19 và #20: đã kiểm metadata ngày 02/10, vẫn open/unmerged tại SHA ghi trong gói; chưa thay baseline hoặc release.
- Các mục cũ bên dưới giữ nguyên như lịch sử tại thời điểm ghi; không tự là xác nhận hiện trạng.

---


## 2026-10-02 — F-13/F-14: Marketing tự động, đo Lead trước

Founder đã giao triển khai kế hoạch thay phương án A/B/nhân sự cũ, rồi chuyển phép đo trước mắt sang250.000 đồng/khách hợp lệ. Trần một đợt100 triệu/30 ngày và80/20 giữ nguyên;300 khách tương ứng75 triệu, không buộc tiêu hết.7% doanh thu đánh giá sau; không chặn giai đoạn Lead vì chưa nối kế toán.

[PR22](https://github.com/backen-pixel/Quanlycongviec/pull/22) chứa bản sửa báo cáo và nền domain/queue đang tắt, [kế hoạch](https://github.com/backen-pixel/Quanlycongviec/blob/codex/vpt-marketing-automation-20261002/docs/architecture/VPT_MARKETING_SALES_AUTOMATION_V1.md) và [trạng thái triển khai](https://github.com/backen-pixel/Quanlycongviec/blob/codex/vpt-marketing-automation-20261002/docs/ai-handoff/vpt-marketing-automation/README.md). Các adapter dữ liệu thật, atomic budget/slot, tài sản/nội dung và UAT chưa hoàn tất. Không merge/deploy/đổi ads/DB thật. PR20 là hồ sơ kiến trúc; PR19 vẫn là dependency của PR22. Xem validation đúng phiên bản trong PR22, không suy tất cả hệ thống PASS.

F-13/F-14 là quyết định mới, F-12 và nhật ký dưới đây giữ lịch sử theo thời điểm. Các gate kiến trúc/Factory và sources đồng bộ giữ nguyên.

---

# 2026-10-02 — Ưu tiên Marketing đa kênh để có khách

Founder đã chốt F-12: làm Marketing đa kênh và CRM tiếp nhận/chăm sóc trước các phát triển chuyên sâu sau bán. Các kênh: Facebook, website, Google, ChatGPT Ads, TikTok, Zalo. [Gói ưu tiên và ngân sách đề xuất](MARKETING_MULTICHANNEL_PRIORITY_20261002.md).

- Đã cập nhật roadmap và ghi quyết định mới; kiến trúc V1.1 và kiểm soát giữ nguyên. Gói media A: 14 triệu/14 ngày; B: 21 triệu/14 ngày có quỹ thử một kênh mới — cả hai **CHỜ DUYỆT**, không tự chi thêm.
- Hồ sơ Facebook ghi đã đăng bộ được duyệt ngày 01/10, lần cuối đang xử lý; chưa đọc lại trạng thái phân phối. Không dùng brief cũ “chờ duyệt” để phủ nhận phê duyệt đã có.
- Gói trợ lý Marketing–CRM ở PR #21 phục vụ tuyến này, chưa là điều kiện phải hoàn thành để tạo khách; runtime chưa triển khai theo hồ sơ gói.
- Còn thiếu danh mục URL/tài khoản của kênh mới, đầu mối Marketing/Sales Admin, baseline chất lượng khách và phép đo. Nội dung, tiêu chí và các gói triển khai cụ thể tiếp tục được chuẩn bị trong phạm vi ưu tiên mới.
- [Review phần cập nhật](MARKETING_PRIORITY_REVIEW_20261002.md); không chạy runtime hoặc sửa quảng cáo/DB trong phiên này. Lịch sử bên dưới giữ nguyên theo thời điểm ghi.

---

# 2026-10-01 — Business AI OS V1.1 / chặng 0

Trạng thái: **gói tài liệu PASS kiểm tra và review Agent độc lập; chờ merge, chưa mở chặng 1**. Founder yêu cầu triển khai kế hoạch; phạm vi đang mở là chặng 0.

- [Kiến trúc và mục lục](../architecture/README.md); [lộ trình/gói chặng 1](../architecture/BUSINESS_AI_OS_V1_1_ROADMAP.md); [sổ quyết định Founder](FOUNDER_DECISIONS_ARCHITECTURE_V1_1_20261001.md).
- Baseline main: 0db11ce1adb0fb89fc87529036e495a62d58fce7; [đối chiếu hiện trạng](ARCHITECTURE_V1_1_EVIDENCE_20261001.md).
- CRM giữ việc trước bán; Work Unified giữ sau bán; không gom toàn bộ crm_tasks. Chưa triển khai thay đổi runtime/schema/quyền.
- PR #16 vẫn draft/open; PR #19 head e16c885ae7c2305645be02a1227bf378cb59137f vẫn open/chưa merge, nghiệm thu vận hành HOLD. Hồ sơ cũ bên dưới không phải trạng thái cập nhật của các PR đó.
- Chặng tiếp chưa mở: cần gói C1-01…08, target được phép và dữ liệu đầu vào nghiệm thu; xem roadmap. Không tự chạy ứng dụng/GET hoặc SQL thật.
- [Review độc lập](ARCHITECTURE_V1_1_INDEPENDENT_REVIEW_20261001.md): PASS trong phạm vi tài liệu; không phải GitHub/human approval hoặc nghiệm thu production.
- Hoàn tác tài liệu: revert đúng commit của gói; giữ lịch sử bàn giao. Không có tác động DB để hoàn tác.

---


## 2026-10-05 - PR A minimal: lead measurement core
State: local only; copied leadMeasurement.js and its 25 tests from PR #22 (679cb926), trimmed policy.js, and added isolated CI. No commit or push.
Verification: Node 24.19.0 syntax checks passed; node --test --test-isolation=none passed 25/25. Plain node --test hit sandbox spawn EPERM; Node 18/22 CI is pending.
Runtime: measureLeadTrial has no caller; no real-data report, DB/API access, migration, or deployment.
Rollback: remove the three added module/test files and the isolated workflow, then remove these handoff entries.

## 2026-10-01 - Issue #15: Marketing / Business AI OS M0 candidate

**Update 2026-10-05:** Founder approved merging PR #16 into `main`. The module is not wired into any route, scheduler or migration, so the merge changes no runtime behavior. The "No main merge" statement below describes the state before this approval.

**State: IN PROGRESS.** Feature branch `codex/marketing-bos-m0-20261001`, base `0bc6392286df0b986cdd6dfc59b499916dd6fd31`; implementation commit `33874dd2e3632c0a1127fd76cc7351a663138e9c`.

Added a pure normalized-evidence contract and synthetic tests, ADR-0015, an integration/dependency map, a non-runtime implementation backlog and a read-only PR CI workflow. See `MARKETING_BOS_M0_EVIDENCE_20261001.md` and `../architecture/MARKETING_BOS_INTEGRATION_V1.md`.

Verification: 73/73 synthetic tests on Node 22.16.0 in an isolated container; 73/73 on Node 24.19.0 in a fresh Windows sandbox after fetching this exact GitHub commit. All six new Git blob SHA-256 hashes match the locally tested contents. Helper/test syntax and diff checks pass. These are repeat runs by the same assistant, not independent review; no full application, staging or live E2E tests were run.

No main merge, production deploy, SQL, CRM records, ad budgets/statuses, credentials, permissions, scheduler, agent deletion or existing runtime files were changed. The helper is not registered in an application route/worker. PR #14 remains an independent workstream.

Next: review exact PR head and CI, then M1 target/schema/recipient/source verification and a scoped read adapter. M2 E2E/shadow evidence and M3 authorized release remain NOT STARTED. Preserve existing single-writer ownership and schedules. Rollback only this additive candidate; never delete customer/receipt/evidence data.

Historical entries below are preserved byte-for-byte; this entry does not re-certify their live status.

---


## 2026-10-05 — PR19 integration with current main; operational HOLD

Integrates main `ca8810c57d2078087a7d0afdd95776fba6e84cc3` into PR19 `e16c885ae7c2305645be02a1227bf378cb59137f`. Preserves Page/post/ad views and embedded mode, strict batched CRM reads, unique counts, safe errors and async scope guards. New Lead detail uses canonical CRM permission; project joins use canonical project READ gate. 127/127 local regressions pass; full Vite build and synthetic supported-browser checks pass within limits in [integration evidence](./PR19_MAIN_INTEGRATION_20261005.md). CI/review must match published version.

Founder has now explicitly authorized read-only CRM account/calendar verification. The opened CRM tab is still at login, so recipient account/company/regions/survey roster/busy slots remain unverified. Render workspace confirmation is pending. Historical access blocks below are history, not a request to reapprove this read scope. No production writes, deployment, ads, messages, migration or main merge. PR22 must be integrated/retested against updated PR19, retaining qualified-Lead and Finance UNKNOWN semantics. Live gate HOLD.

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

# Current candidate handoff

## 2026-10-05 — Khóa quyền anon/authenticated trên public, code only

Nhánh `claude/security-anon-revoke`, nền `043c0a3b`. Đã thêm audit SELECT-only, snapshot catalog, migration 700 và rollback, smoke test PostgREST staging, runbook vận hành. Chưa kết nối database, chưa chạy SQL/smoke, chưa áp staging/production hoặc backup. Chưa commit được vì `.git` của worktree trỏ ra ngoài writable root và `git add` không tạo được `index.lock`. `BRIEF_SECURITY.md` là brief chưa theo dõi; không đưa vào diff.

Backend chỉ dùng service key trong các client được rà; `supabaseAnonKey` chỉ được khai báo tại config. Frontend và sáu app mobile không có lời gọi trực tiếp Supabase REST/RPC theo rà mã nguồn; `ProductionBackupSyncPage.jsx` chỉ có chuỗi hướng dẫn biến môi trường. Cần vận hành chạy audit → snapshot → migration 700 → verify trên staging, xác nhận rollback và smoke test ứng dụng trước khi Founder duyệt phát hành. Lưu ý default `PUBLIC EXECUTE` toàn cục của PostgreSQL cho hàm mới không thể thu bằng default ACL chỉ trong schema public; xem runbook.

## 2026-09-29 — VPT Messenger durable intake, local candidate only

Issue #7: https://github.com/backen-pixel/Quanlycongviec/issues/7. Base: `413e8f575b5b611b25a50980564d754b7bfcf211`. Founder requested finishing the Messenger A2/B trial. No remote commit, PR, migration, live test or deployment performed by this workstream.

Opt-in Page 409741855550833: persist Messenger event before ACK, retry with DB lease/token; extract referral even without message; exact ad→campaign mapping; reuse existing lead_attribution; delayed Lead linking. Auto/manual/legacy scan share atomic contact→Lead RPC for this Page and CRM Lead type. Unique nullable crm_leads.facebook_contact_id and contact row lock guard retry/concurrent creation. Existing customer/phone reuse also uses the same RPC. Other Pages remain unchanged unless explicitly opted in.

Files: two sanitized runtime schema/index/ACL fixtures; routes/facebook.js, routes/crm/routes/leadLifecycle.js, server.js (legacy scan identity), helpers/facebookAtomicLead.js, helpers/facebookMessengerReceipt.js, migrations639–641, five test files, config example and review notes. Applied migrations are unchanged. 636–638 reserved from the older unmerged package, unavailable locally (Library helper retried twice, HTTP502).

Tests: Node handler VM + helper tests and real isolated PGlite SQL; no application .env, full server import, production DB or message sends. See VPT_MESSENGER_REVIEW_20260929.md for exact commands and gates. Source-backed baseline failed ACK/retry regression tests; candidate passes 40/40 local tests. SQL tests are one PGlite connection, not multi-session PostgreSQL staging.

Runtime schema/FKs/unique indexes are now compared and represented by schema-only test fixtures. Existing attribution ACL is broad with RLS=false; no global ACL is changed. New raw/ref/source/message/phone/PSID data stays only in protected receipts, attribution gets numeric IDs and event keys. Unresolved before activation: multi-session Postgres CI + controlled staging fault/restart tests; deploy SHA/API health; Meta messaging_referrals subscription; real referral→phone→Lead→campaign E2E. Runtime historical 7 ad rows sharing one timestamp do not prove current writer. No automation for budget stop/resume or ad activation in this patch.

Rollback: keep ads paused; drain pending receipts before disabling FB_DURABLE_MESSENGER_PAGE_IDS and reverting backend. Keep evidence and additive identity columns. Never delete historical leads/contacts/attribution to roll back. Notifications/tasks after commit are not guaranteed exactly once; customer creation remains outside Lead transaction and can leave an unused customer during a race. Cross-contact shared Lead retains original first-touch attribution and this contact's pending evidence.


# Trạng thái công việc hiện tại

Cập nhật: 2026-10-06 12:30 (UTC+7)

## SX Kanban — deadline thẻ và các mốc còn lại

Trạng thái: **local, chưa deploy.**

Nút «Deadline» trên thẻ chỉ ghi `sx_kanban_deadline_at`, không đổi ngày lắp. Mở nút nay thấy deadline thẻ, ngày lắp và các mốc kế hoạch còn lại (từ hôm nay). Sửa deadline thẻ không kéo ngày lắp. Sửa ngày lắp hoặc một mốc thì ghi `delivery_date` — hoàn thiện = lắp − 2 và deadline thẻ tính lại theo cột.

Hoàn tác: revert `SxKanbanDeadlinesModal.jsx` và đoạn modal trong `ProductionDashboard.jsx`.

## Bình luận — nút ⋯ để xóa

Trạng thái: **local, chưa deploy.**

Bong bóng bình luận có nút ⋯ góc phải. Người viết thấy Sửa và Xóa. Admin hệ thống / admin công ty thấy Xóa cả bình luận của người khác. API xóa lead trước đây truyền `role` (chuỗi) vào hàm nhận object user nên admin không xóa được — đã sửa. Xóa có hỏi xác nhận.

Hoàn tác: revert `CommentsPanels.jsx`, `leadComments.js`, `projects.js`.

## SX — NV công ty CRM mở dự án tại xưởng HCB/Metalla bị 403

Trạng thái: **BE local, chưa deploy.**

`getAccountingClientProjectIdsAtWorkshop` đọc dự án xưởng theo trang và tra deal theo lô ID (trước đây `.in()` 641 UUID → `Bad Request` → trả rỗng → 403 «Dự án không thuộc deal công ty của bạn tại xưởng này»).

Hoàn tác: revert `backend/src/helpers/accountingScope.js`.

## Drive — menu file không còn đè lên thẻ

Trạng thái: **FE local.**

Menu ⋯ của file trong lưới Drive được gắn lên `document.body`, không còn bị `overflow-hidden` của thẻ cắt và đè lên ảnh. Hết chỗ phía dưới thì menu mở lên trên.

Hoàn tác: revert `DriveFileViews.jsx`.

## Drive — xác nhận và báo khi xóa file

Trạng thái: **FE local.**

Menu ⋯ trên file Drive của hồ sơ hỏi xác nhận (kèm tên file) trước khi xóa. Xóa xong hiện toast «Đã xóa …». Trang Drive cũng báo khi đưa vào thùng rác hoặc xóa vĩnh viễn.

Hoàn tác: revert `DriveAttachments.jsx`, `DrivePage.jsx`.



## Bình luận — tải file giữ khi đổi trang

Trạng thái: **FE local.**

Đổi trang trong app không cắt request. Tiến trình hiện ở bảng góc dưới phải (cùng chỗ Drive): %, tốc độ mạng, thời gian còn lại. File ≤ 50MB và file lớn lên Drive đều vào bảng này. Đóng tab hoặc tải lại trang thì trình duyệt vẫn hủy request.

Hoàn tác: revert `FileUpload.jsx`, `drive.js`, `oversizedDriveUpload.js`.

## Bình luận — thanh tải file không còn nằm trong ô nhập

Trạng thái: **FE local.**

Khi gửi file, tiến trình hiện thành một hàng phía trên ô bình luận (tên file một dòng, thanh %, trạng thái một dòng). Ô nhập chỉ còn nút kẹp giấy.

File trên 50MB (ví dụ APK 68MB) đi Google Drive: trình duyệt gửi hết lên server thì % dừng ở 99, server mới tải tiếp lên Drive rồi tạo link. Dòng trạng thái ghi «Đã gửi xong, đang lưu Google Drive…» rồi «Đang tạo link xem…».

Hoàn tác: revert `CommentsPanels.jsx`, `FileUpload.jsx`, `UploadProgressBubble.jsx`, `oversizedDriveUpload.js`, `uploadProgressEta.js`.

## Deadline HCB — đổi ngày vẫn quá hạn

Trạng thái: **FE+BE local, đã quét lại hạn thẻ HCB trên DB.**

Hạn thẻ lấy nhóm việc mẫu còn mở sớm nhất (duyệt = lắp − 6). Đổi ngày lắp lên 10/10 vẫn ra 04/10 17:30 nên sáng 05/10 vẫn quá hạn. Nay hạn thẻ và bảng nhiệm vụ SX bám cột Kanban đang đứng, chốt 17:30. Cùng ngày chỉ vào Quá hạn sau 17:30.

Hoàn tác: revert `sxCardPlanDeadline.js`, nhánh production trong `workTasks.js`, và `deadlineBucketOf` trong `ProjectTasksOverviewPage.jsx`.



## Bình luận — file trên 50MB lưu Drive

Trạng thái: **FE+BE local.** Chưa thử file thật lớn hơn 50MB.

Đính kèm trong bình luận lead/dự án: file trên 50MB được tải lên Drive của hồ sơ, link chia sẻ hiện trong nội dung bình luận và nút Mở Drive. Chat lead làm cùng việc và thêm một bình luận. Messenger lưu Drive cá nhân và gửi link trong tin nhắn. File từ 10MB đến 50MB vẫn chỉ nhắc, vẫn gửi trực tiếp được.

Kéo file từ máy vào khung chat lead, Messenger hoặc phòng ban thì gửi như khi bấm đính kèm. Khung hiện «Thả file để gửi».

## Dashboard SX — Hào thấy lại toàn bộ dự án xưởng

Trạng thái: **BE local, đã gỡ lọc.**

Đã bỏ giới hạn chỉ hiện dự án có việc của `hao@metalla.com`. Dashboard Hào trở lại như trước: thấy mọi dự án của công ty, theo phân loại đang chọn.

## Hàng nhiệm vụ — hiện nhân viên được gán

Trạng thái: **FE local, đã xem trên TB-2026-963.**

Dòng nhiệm vụ thu gọn hiện tên người nhận cạnh ngày hẹn. Phôi và Cánh hiện «Thuận» mà không cần bấm Chi tiết.

Hoàn tác: revert nhánh `assignees.map` trong `renderTaskRow` của `CRMTasksTab.jsx`.

## CRM — nút BC theo tổ chức cho quản trị HST

Trạng thái: **FE+BE, đưa lên main.**

Tài khoản `ecosystem_admin` mở nhóm KPI & báo cáo nhưng không thấy **BC theo tổ chức**, vì sidebar chỉ tính executive với `admin` / `manager` / `director` / `supervisor` / `sales_admin` / `crm_production_admin`. Menu và `RequireExecutive` nay dùng chung `isCrmExecutive`. API báo cáo tổ chức cũng nhận `ecosystem_admin` và `crm_production_admin` là báo cáo đầy đủ, không còn thu về đúng một người.

## Không gian chung — bộ lọc giống Giao việc

Trạng thái: **FE+BE local.**

Panel bộ lọc tab Không gian chung có Công ty, Phòng ban, Nhân viên, Trạng thái, Ưu tiên — cùng các ô với tab Giao việc. Admin chọn nhân viên thì danh sách là việc của người đó.

## Giao việc Sản xuất — lọc phân loại xưởng

Trạng thái: **FE+BE local, đã xem trên `/sx/assignments`.**

Header Giao việc Sản xuất có cùng ô phân loại với dashboard: Chưa phân loại, HCB · Tủ bếp, HCB · Cánh kính, HCB · Cửa. Lọc cả bảng Giao việc và tab Không gian chung theo `projects.workshop_type_id`. Giá trị nhớ chung với dashboard (`sx_dash_filters_v1`).

Đã chọn HCB · Tủ bếp: 11 việc. HCB · Cánh kính: 0 việc. Chưa phân loại và Không gian chung trả 200. Đã trả bộ lọc về HCB · Tủ bếp.

Hoàn tác: revert `workshop_type_id` trong `crmAssignments.js`, `sharedWorkspaceInbox.js`, và select trong `CRMAssignmentsPage.jsx`.

## Không gian chung — không nhận nhiệm vụ mẫu xưởng

Trạng thái: **BE local, đã thử trên DB.**

Sửa hoặc áp bộ mẫu xưởng không còn tạo giao việc. Tab Không gian chung không liệt kê nhiệm vụ `sx_pl_…` / `vc_…`. Phát sinh `sx_shared` vẫn tạo giao việc. Đã gọi sync trên «Chốt công nợ»: bỏ qua, số giao việc trước và sau đều 0.

Hoàn tác: revert `workshopPipelineTask.js` và chỗ gọi trong `crmTaskAssignmentSync.js`, `crmSequentialAssignment.js`, `sharedWorkspaceInbox.js`.

## Hạn thẻ SX — sửa ngày lắp thì hạn chạy theo

Trạng thái: **BE local, đã thử trên TB-2026-978 rồi trả lại ngày cũ.**

`projects` không có cột `install_occurrence_dates`. Lần tính lại hạn trước đó đọc cột này nên lỗi và hạn thẻ giữ nguyên. Nay sửa ngày lắp ghi `install_date` cùng ngày, và tính lại `sx_kanban_deadline_at` từ ngày đó. Thử đổi ngày lắp TB-2026-978 từ 07/10 sang 14/10: hạn thẻ từ 03/10 sang 08/10, sau đó đã ghi lại đúng dữ liệu cũ.

## Module SX — phát sinh, giai đoạn, bàn giao VC, hạn thẻ

Trạng thái: **FE+BE local.** Chưa chạy `database/648_sx_phat_sinh_order.sql` (MCP primary chỉ đọc).

Đơn phát sinh là project con (`source_project_id`), nút trên chi tiết SX. Cột phát sinh là cờ pipeline, không đẩy CRM. Kéo cột chỉ ghi `sx_kanban_column_id` trừ cột bàn giao VC hoặc cột đã gán KPI. Bàn giao VC bắt cột tiếp nhận của đúng công ty VC. Hạn thẻ dashboard ghi lại từ lịch 7 ngày của việc nhỏ còn mở.

## Dashboard SX — hết lỗi filterBusy

Trạng thái: **FE local, đã mở `/sx/dashboard`.**

`filterBusy` được khai báo sau hiệu ứng tự chọn phân loại nên trang vỡ. Đã đưa khai báo lên trước. Trang hiện «Đã lọc xong · 14 thẻ».

## Giao việc SX — tích và kéo nhiệm vụ của dự án

Trạng thái: **FE local, đã xem trên `/sx/assignments?project_id=`.**

Thẻ nhiệm vụ pipeline khi lọc một dự án tích được (Đang làm / Hoàn thành) và kéo sang cột. Quản trị hệ sinh thái cũng kéo được giao việc người khác tạo. Đã bấm Đang làm trên «Tiếp nhập thông tin dự án» của TB-2026-760 rồi trả lại Chưa làm.

## Giao việc — mắt tìm kiếm mở chi tiết đúng module

Trạng thái: **FE local, đã xem trên `/sx/assignments`.**

Nút mắt trong gợi ý tìm không còn luôn mở deal CRM. Đang ở Sản xuất thì mở chi tiết dự án SX; đang ở Lắp đặt thì mở dự án VC; đang ở CRM thì vẫn mở deal. Đã bấm DEAL-2026-1148 từ Giao việc SX và vào `/sx/projects/797f9136-bfdb-4a57-80b4-0e55fb0321da`.

## Quản lý nhiệm vụ SX — hạn lịch 7 ngày và tiến độ việc nhỏ

Trạng thái: **BE local, đã xem trên `/sx/project-tasks`.**

Hạn thẻ lấy từ lịch 7 ngày tính lùi theo ngày lắp, theo nhóm của việc còn mở. Danh mục chỉ rời bảng khi các việc nhỏ bên trong đã xong. Số trên thẻ cộng việc xưởng đã xong với nhiệm vụ SX cùng tên đã hoàn thành. Đã xem: Quá hạn 34, Hôm nay 3, Ngày mai 8; thẻ có tiến độ kiểu 1/2, 1/7, 3/4.

Hoàn tác: revert `resolveOverviewGroupDeadline` trong `projectOverviewDeadline.js`.



## Thẻ Giao việc — hiện số ghi chú và file

Trạng thái: **FE+BE local.**

Nút **Ghi chú & file** trên thẻ Kanban hiện số file và số ghi chú khi nhiệm vụ đã có. Không có thì nút giữ nguyên, không hiện số 0.

Hoàn tác: revert nút trong `Card` của `CRMAssignmentsPage.jsx` và `note_count` trong `crmTaskAssignmentSync.js`.

## Giao việc SX — không lọc thì hiện mọi việc

Trạng thái: **FE local.**

Tài khoản quản trị hệ sinh thái mở `/sx/assignments` không còn bị khóa vào đúng người đang đăng nhập. Không chọn công ty, nhân viên, trạng thái hay ưu tiên thì bảng hiện toàn bộ giao việc sản xuất.

Hoàn tác: revert `isAdmin` trong `CRMAssignmentsPage.jsx`.

## Chi tiết dự án — tải nhiệm vụ nhỏ song song

Trạng thái: **FE+BE local.**

Mở `/sx/projects/:id` hiện chi tiết ngay khi có dự án. `GET /production/projects/:id/task-bootstrap` lấy mã deal song song với chi tiết, rồi gọi nhiệm vụ xưởng ngay — cột nhỏ (`4/4`) không chờ tải lại cả dự án. API tasks chạy đếm file và gán người song song.

Hoàn tác: revert `load()` trong `ProductionDetail.jsx`, `loadTasks` trong `CRMTasksTab.jsx`, và `GET /crm/leads/:id/tasks` trong `crmTasks.js`.

## Thẻ Giao việc — ghi chú và file như chi tiết nhiệm vụ

Trạng thái: **FE+BE local.**

Thẻ Kanban có nhiệm vụ pipeline có nút **Ghi chú & file**. Mở ra cùng ô ghi chú, ghi chú đính kèm và upload file như tab Nhiệm vụ trên deal.

Hoàn tác: revert nút trên `Card` trong `CRMAssignmentsPage.jsx` và `CrmTaskNotesFilesPanel` trong `WorkTaskExtrasPanel.jsx`.

## Giao việc SX — thông tin dự án dưới thống kê nhân viên

Trạng thái: **FE+BE local.**

Khi mở `/sx/assignments?project_id=`, cột lọc nhanh hiện khối **Dự án đang lọc** ngay dưới «Số việc theo nhân viên»: mã, tên, công ty, khu vực, ngày lắp, người phụ trách xưởng.

Hoàn tác: revert khối `projectScope` trong `CRMAssignmentsPage.jsx` và `loadAssignmentProjectScope` trong `crmAssignments.js`.

## Giao việc SX theo dự án — chỉ nhiệm vụ xưởng

Trạng thái: **FE+BE local.**

`/sx/assignments?project_id=` chỉ đếm và hiện nhiệm vụ xưởng (`stage_slug` `sx_` hoặc có cột pipeline SX). Nhiệm vụ deal CRM (báo giá, bản vẽ, hợp đồng) không vào board này.

Hoàn tác: revert `CRMAssignmentsPage.jsx` và `crmAssignments.js`.

## Quản lý NV xưởng — bấm thẻ mở dự án

Trạng thái: **FE local.**

Bấm thân thẻ hoặc tên người phụ trách trên `/sx/project-tasks` (và bản VC) mở chi tiết dự án `/sx/projects/:id` hoặc `/vc/projects/:id`. Nút **Công việc** vẫn mở Giao việc đã lọc đúng dự án. Thẻ CRM mở lead/deal.

Hoàn tác: revert `overviewProjectHref` trong `ProjectTasksOverviewPage.jsx`.

## Gỡ Trương Trọng Thành khỏi đội dự án

Trạng thái: **đã chạy primary + backup.** Tài khoản admin giữ nguyên, primary vẫn tắt.

Đã xóa khỏi đội SX, thành viên deal, NV mặc định phân loại, người phụ trách sản xuất / vận chuyển / lắp đặt. Code không còn tự gắn lại vào HCB.

Hoàn tác: khôi phục từ bản trước 647; revert `dealParticipantProduction.js`. File `database/647_remove_truong_trong_thanh_assignments.sql`.

## Kanban VC/LĐ — hiện mốc thời gian như thẻ sản xuất

Trạng thái: **FE+BE local.**

Thẻ Kanban `/vc/dashboard` hiện ngày tạo lead cạnh mã, các mốc Đặt / Lấy / Lắp / Lắp SX, và hạn hoàn thiện xưởng (🏭). Lắp và Lắp SX tô vàng khi lệch ngày. Thẻ quá hạn lắp có nút đỏ **Quá hạn** kèm ngày. Thanh công cụ có nút **Quá hạn** với số lượng. Chân thẻ hiện ngày tạo dự án.

Hoàn tác: revert `LogisticsDashboard.jsx` và hai dòng select trong `GET /logistics/projects` ở `logistics.js`.

## Sự kiện — bảng ngày lắp và ngày lấy hàng

Trạng thái: **FE+BE local.**

Trang Sự kiện có nút **Bảng lắp / lấy hàng** (`/crm/events/schedule`, và bản SX `/sx/events/schedule`, VC `/vc/events/schedule`). Bảng một dòng một dự án: ngày lấy hàng, ngày lắp CRM/LĐ, ngày lắp SX, hoàn thiện SX. Ô vàng khi ngày lắp SX lệch ngày lắp CRM/LĐ. Xuất Excel.

Hoàn tác: gỡ route `GET /events/install-schedule`, `EventsInstallSchedulePage.jsx`, và nút trên `EventsFeedPage.jsx`.

## Deadline — sửa ngày trong chi tiết thì hạn thẻ đổi theo

Trạng thái: **FE+BE local.**

Sửa Ngày lắp trên SX hoặc VC ghi cả hai mốc cùng một ngày, hoàn thiện = lắp − 2, và tính lại `sx_kanban_deadline_at` từ đúng ngày vừa sửa. Không còn giữ hạn cũ khi lý do thẻ là tay, hoặc khi lịch lắp cũ đè ngày mới. Cột tắt hạn / bàn giao VC thì xóa hạn thẻ. Sửa riêng ngày hoàn thiện chỉ đổi hạn thẻ khi cột thuộc nhóm hoàn thiện hoặc chưa gán nhóm.

Hoàn tác: revert `ProductionDetail.jsx`, `projects.js`, `projectDeliveryDates.js`, `sxInstallPlanKanbanDeadline.js`.

## Pipeline xưởng — hiện NV phụ trách cột lớn

Trạng thái: **đã ghi DB primary** cho Tủ bếp và Cánh kính. Phần hiện tên trên ô chọn vẫn là FE + API local.

Cửa, Tủ bếp và Cánh kính: Tiếp nhận và Kế hoạch = Sang Thiết Kế VPT 1, Duyệt = Nguyễn Nhật, Gia công = Nguyễn Minh Nhựt, Hoàn thiện và Đóng gói = Hòa Bảo. Phân loại Công nợ không có cột pipeline.

Hoàn tác dữ liệu: xóa `production_pipeline_stage_default_staff` vừa thêm trên cột Tủ bếp và Cánh kính. Cửa giữ nguyên. Hoàn tác giao diện: revert `ProductionPipelineSettingsPage.jsx` và đoạn bổ sung user trong `GET /production/workshop-type-staff-defaults` ở `production.js`.

## Facebook NextGo — gỡ khỏi HST mặc định

Trạng thái: **đã chạy DB primary.** Backup chưa đụng.

365 lead nguồn page NextGo trên công ty cũ `87479a83` (HST mặc định) đã xóa, kèm nguồn CRM cũ. Thêm 230 lead trùng mã hoặc trùng tiêu đề với HST NextGo cũng đã xóa, không chép sang HST NextGo. Page, 2.442 hội thoại, 19.469 tin và 890 lead HST NextGo giữ nguyên. Công ty cũ còn 8 lead Zalo chưa có bản trên NextGo.

Hoàn tác: không có file dump từng dòng. Bản trên HST NextGo vẫn là bản đang dùng.

## Pipeline xưởng — nút tích Chuyển công nợ

Trạng thái: **FE local.**

Tab Cột nhỏ trên `/sx/pipeline-settings`: mỗi cột có nút **Chuyển công nợ**. Bật thì `board_tab=cong_no` (Kanban sang tab Công nợ). Tắt thì về tab Sản xuất. Form sửa cột có ô tích cùng tên.

Hoàn tác: revert `ProductionPipelineSettingsPage.jsx`.

## Build Render — thiếu hook useDefaultCompanyOnce

Trạng thái: **đẩy main.**

`ProductionDashboard.jsx` đã import hook này. File `frontend/src/hooks/useDefaultCompanyOnce.js` được bổ sung để Vite resolve được.

Hoàn tác: revert file hook đó; dashboard sẽ gãy build nếu import còn.

## Dashboard SX — bỏ «Tất cả», Deadline theo hạn thẻ

Trạng thái: **FE+BE, đẩy main.**

Bộ lọc phân loại trên `/sx/dashboard` giữ lại. Bỏ mục «Tất cả» / «Tất cả loại». Không chọn loại thì tự đứng ở loại đầu tiên của xưởng. «Chưa phân loại» vẫn chọn được. Cột Deadline và KPI quá hạn chỉ lấy `sx_kanban_deadline_at`.

Hoàn tác: revert `ProductionDashboard.jsx`, `WorkshopDashboardFilterPanel.jsx`, `ProductionViews.jsx`, `sxPipelineRevenue.js`, `sxKanbanSummary.js`, `production.js`.

## Chat — ẩn ghi chú panel chi tiết

Trạng thái: **FE, đẩy main.**

Ghi chú `//` nằm trong JSX nên hiện thành chữ trên khung chat. Đổi thành comment JSX.

Hoàn tác: revert `MessengerConversationDetailPanel.jsx`.

## Đặt xưởng khác — chỉ bắt ngày lấy

Trạng thái: **FE, đẩy main.**

Đặt xưởng khác và kế hoạch CRM sang sản xuất không còn bắt ngày lắp. Thiếu ngày lấy thì không tạo được dự án.

Hoàn tác: revert `SxMultiTargetPicker.jsx`, `ProductionDetail.jsx`, `LeadDetail.jsx`, `CRMDashboard.jsx`, `DealProductionProjectsPanel.jsx`.

## 2026-09-26 — Loại HTTP seed mật khẩu, bản sửa local riêng

Founder đã cho phép sửa local và kiểm thử cô lập; chưa cho phép push GitHub hoặc deploy. Nhánh `codex/remove-public-password-seed-20260926` bắt đầu từ SHA Production đã đối chiếu `a458a192e83a4d656561fc87b56f926c16c6140c`, tách khỏi nhánh draft Messenger. Gỡ cả hai handler reset mật khẩu mẫu không có auth trong `backend/src/server.js` và `backend/src/routes/auth.js`; gỡ dòng inventory API không còn hợp lệ. Không thêm seed command, không sửa DB/migration, tài khoản thật hoặc cấu hình Render.

Trạng thái: **local candidate PASS**, 7/7 test và lượt chạy reviewer độc lập PASS; đối chứng baseline phát hiện đúng 2 route trước khi gọi handler. Chưa công bố, chưa Production. Đăng nhập và đổi mật khẩu hợp lệ giữ nguyên code. Chi tiết, lệnh test và giới hạn trong `PASSWORD_SEED_REMOVAL_20260926.md`.

Giới hạn: không require/chạy toàn bộ server hoặc đọc application `.env` vì startup có tác động ra ngoài. Kiểm thử dùng router/handler thực với dependency mock và dữ liệu giả. Chưa xác minh trên Production các tài khoản mẫu còn tồn tại hay có hành vi khai thác.

Hoàn tác local bằng đảo commit này nếu cần, nhưng đưa route cũ trở lại sẽ mở lại lỗ hổng; không dùng việc hoàn tác như biện pháp xử lý bảo mật. Không có thay đổi dữ liệu để rollback. Bản production vẫn cần quy trình staging/review/phê duyệt triển khai riêng.

## Deadline SX — Quá hạn khớp cột và KPI

Trạng thái: **đã gồm trong mục dashboard 2026-10-01.**

Cột đã «Tắt hạn» hoặc bàn giao VC không còn vào bucket Quá hạn (server summary + trang bucket, và client). KPI «Quá hạn» và số trên cột Deadline đếm cùng các thẻ đang hiện, không lấy tổng server đã gắn cứng bucket.

Hoàn tác: revert `sxKanbanSummary.js`, `sxPipelineRevenue.js`, `moduleDeadlinePolicy.js`, `ProductionViews.jsx`, `ProductionDashboard.jsx`.

## Đặt xưởng khác — admin Metalla/HCB thấy xưởng kia

## Đặt xưởng khác — admin Metalla/HCB thấy xưởng kia

Trạng thái: **FE+BE local.**

Admin công ty xưởng (Toại / Metalla) mở «Đặt xưởng khác» bị trống vì `GET /companies?for_module=production` chỉ trả xưởng của họ, rồi giao diện loại đúng xưởng dự án nguồn. Modal gọi thêm `include_peer_workshops=1` để thấy HCB (và xưởng SX khác). Bảng Kanban vẫn chỉ một xưởng.

Hoàn tác: revert `companies.js`, `ProductionDetail.jsx`.

## Bình luận — dòng chuyển trạng thái nổi bật

Trạng thái: **FE+BE local.**

Gõ `/` chuyển cột ghi dòng tím «➡️ Đã chuyển trạng thái …» ngay trong khung Bình luận và gửi thông báo «Đã chuyển trạng thái» cho thành viên. Đầu tab Bình luận (Work Unified) có hộp tím hướng dẫn lệnh `/`.

Hoàn tác: revert `commentProgressSlash.js`, `CommentsPanels.jsx`, `WorkUnifiedProjectDetailPage.jsx`, `leadComments.js`, `dealCommentNotifications.js`.

## Tắt deadline khi vào cột mốc

Trạng thái: **BE local.**

CRM vào cột Hoàn thành: tắt deadline CRM (`deadline_disabled_at`). Sản xuất vào cột tích VC/LĐ: xóa hạn SX. VC/LĐ vào cột Xong/Hoàn thành: ghi nhận tắt hạn lắp. Cả ba ghi dòng bình luận và dòng lịch sử «Đã tắt deadline do chuyển trạng thái».

## Bình luận — lệnh `/` theo module

## Bình luận — lệnh `/` theo module

Trạng thái: **FE local.**

Lệnh cột «Hoàn thành» (hoặc cột thắng) chỉ hiện với người thuộc đúng khối: CRM / Sản xuất / VC-LĐ. Admin hệ thống vẫn thấy đủ. `/Đã giao` và `/Đã lắp` ai cũng thấy, cả hai chuyển cột VC/LĐ «đã lắp» (cột tên Lắp đặt / Lắp xong nếu chưa có cột Đã lắp). Deal chưa có dự án thì báo, không chuyển im lặng.

## Bình luận — gõ `/` để chuyển tiến độ

Trạng thái: **FE local.**

Ô bình luận (Work Unified, chi tiết SX/VC, chi tiết CRM): gõ `/` rồi tên cột, ví dụ `/Lắp xong`, `/Đã giao`. Chọn cột là chuyển Kanban đúng module và ghi dòng «Đã chuyển tiến độ …». Cột đang đứng, bàn giao VC, đổi phân loại, nhiệm vụ chặn, cột bắt hạn: không chuyển im lặng.

Hoàn tác: revert `commentProgressSlash.js`, `crmCommentMentions.js`, `crmCommentMentionUi.jsx`, `CommentsPanels.jsx`, `WorkUnifiedProjectDetailPage.jsx`, `ProductionDetail.jsx`, `LeadDetail.jsx`.

## Cảnh báo «Chưa chạy migration 605» khi mở dự án SX đã xong việc

Trạng thái: **FE+BE local, chưa deploy.**

Mở tab Công việc của dự án đã xong hết việc thì hệ thống tự ghi «cột xong». Câu ghi luôn gửi `logistics_stage_id` (cột của migration 635). Database live chưa có cột đó nên PostgREST báo schema cache, API trả nhầm «Chưa chạy migration 605», và hộp thoại hiện lên.

Sửa: ghi/đọc Sản xuất không đụng `logistics_stage_id`. Chỉ pipeline logistics mới ghi cột đó. Đồng bộ ngầm không bật hộp thoại; bấm tích tay vẫn báo lỗi thật. VC/LĐ vẫn cần chạy SQL 635 thì tích mới lưu được.

Hoàn tác: revert `production.js`, `ProductionDetail.jsx`, `CRMTasksTab.jsx`.

## Nhiệm vụ và tiến độ — một tích cho cả hai bên

Trạng thái: **FE+BE local. SQL 635 chưa chạy** (cần chạy để tích cột VC/LĐ lưu được).

Tab Công việc và `PipelineStepper` dùng chung trạng thái cột. Cột đã đi qua hiện tích ở cả hai nơi. Bấm vòng tròn trên tiến độ hoặc nút tích trên nhiệm vụ thì bên kia đổi theo. Bấm tên cột trên tiến độ vẫn chuyển thẻ. Tab VC/LĐ có cùng danh sách cột lớn / cột nhỏ và nút «Tích hoàn thành cột này».

Hoàn tác: revert `cotTienDo.js`, `PipelineStepper.jsx`, `CRMTasksTab.jsx`, `ProductionDetail.jsx`, `production.js`; `ALTER TABLE project_substage_status DROP COLUMN logistics_stage_id`.

## Pipeline VC/LĐ — cột lớn / cột nhỏ + tiến trình như SX

## Pipeline VC/LĐ — cột lớn / cột nhỏ + tiến trình như SX

Trạng thái: **FE+BE local + SQL 632 đã chạy primary/backup.**

`/vc/pipeline-settings` có tab **Cột chính** (kéo cột nhỏ vào giai đoạn nối tiếp) và **Cột nhỏ**. Dashboard `/vc/dashboard` có **Gộp cột** (menu chế độ xem) khi đã gán `group_key`. Chi tiết dự án VC dùng `PipelineStepper` nhóm song song như SX.

Cột `logistics_pipeline_stages.group_key` + `group_sort`. Không gán sẵn nhóm cho công ty nào. Tick việc song song trên stepper VC chưa ghi `project_substage_status` (FK đang trỏ pipeline SX) — click vòng tròn = chuyển cột.

Hoàn tác: revert schema/route/UI; `DROP COLUMN logistics_pipeline_stages.group_key, group_sort`.

## Pipeline VC/LĐ — Tắt hạn + ô Dashboard (Đang VC / Đang LĐ / BH / Xong)

Trạng thái: **FE+BE local + SQL 631 đã chạy primary/backup.**

`/vc/pipeline-settings`: mỗi cột có nút **Đang VC / Đang LĐ / BH / Xong** và **Tắt hạn**. Tích cập nhật đúng hàng, không reload trang. Dashboard `/vc/dashboard` đếm 4 ô KPI **theo cột** (tick thắng heuristic tên/cờ). Cột Tắt hạn / Hoàn thành không đếm quá hạn.

Cột `logistics_pipeline_stages.clears_deadline` + `dashboard_kpi` (`shipping` | `installing` | `warranty` | `completed` | null). Chưa tick thì suy như cũ (cột LĐ / bảo hành / hoàn thành / còn lại = đang VC). Không gắn cứng tên cột.

Bộ mẫu `/vc/task-templates` dùng layout ít bấm như SX (công ty + danh sách cột + Gắn).

Hoàn tác: revert schema/route/UI/KPI helpers; `DROP COLUMN logistics_pipeline_stages.clears_deadline, dashboard_kpi`.

## Bộ mẫu nhiệm vụ SX — gắn theo cột, ít bấm

Trạng thái: **FE local.**

`/sx/task-templates`: bỏ wizard 4 bước + sidebar. Chọn công ty + chip phân loại là thấy **mọi cột pipeline** kèm bộ đã gắn. `+ Gắn` trên cột; đổi cột bằng select trên thẻ bộ. Nhớ công ty/loại (localStorage).

Hoàn tác: revert `WorkshopTaskTemplatesPage.jsx`.

## Pipeline xưởng — gán cột vào ô Dashboard (Đang SX / Chờ VC / Đã VC)

Trạng thái: **FE+BE local + SQL 630.**

Mỗi cột nhỏ trên `/sx/pipeline-settings` có nút **Đang SX / Chờ VC / Đã VC**. Tích = đếm vào ô KPI tương ứng trên Dashboard (theo công ty + phân loại). Nhấn lại để bỏ (về tự suy). Form sửa cột có radio «Ô Dashboard».

Cột `production_pipeline_stages.dashboard_kpi` (`producing` | `awaiting_delivery` | `shipped` | null). `sxColumnStageKpiKey` ưu tiên tick; chưa tick thì giữ heuristic cũ (bàn giao VC / tên đã giao / còn lại = đang SX). Không gắn cứng tên cột — mỗi công ty tự map.

Hoàn tác: revert schema/route/UI/KPI helpers; `DROP COLUMN production_pipeline_stages.dashboard_kpi`.

## Dashboard SX — KPI theo cờ cột Kanban

Trạng thái: **FE+BE local.**

Thanh KPI `/sx/dashboard` (Đang sản xuất / Chờ VC / Đã VC) đếm thẻ **theo cột đang đứng**:
- Chờ vận chuyển = cột tích bàn giao VC
- Đã vận chuyển = cột Đã giao
- Đang sản xuất = cột SX còn lại (không intake, không công/thu)

Không còn đếm `logistics_company_id` (thẻ vẫn ở cột SX thì vẫn là Đang SX). Công nợ / Đã thu / Quá hạn giữ theo cột như cũ.

Hoàn tác: revert `sxKanbanSummary.js`, `sxPipelineRevenue.js` (FE+BE), `ProductionDashboard.jsx`.

## Pipeline xưởng — kéo cột nhỏ lên xuống trong cột chính

Trạng thái: **FE local.**

Tab Cột chính `/sx/pipeline-settings`: kéo cột nhỏ lên/xuống (hoặc kéo cột chính) ghi lại `order_index` 1…N
theo trái→phải / trên→dưới. Tab **Cột nhỏ** (số thứ tự 1, 2, 3…) đổi theo đúng thứ tự đó. Không reload trang.

Hoàn tác: revert `ProductionPipelineSettingsPage.jsx`, `sxGopCot.js`.

## Pipeline xưởng — nút Tắt hạn trên cột nhỏ

Trạng thái: **FE+BE local + SQL 629 đã chạy primary/backup.**

Mỗi cột nhỏ trên `/sx/pipeline-settings` (tab Cột nhỏ) có nút **Tắt hạn** cạnh Deadline / Bỏ quá hạn.
Cột được tích: khi kéo thẻ tới cột đó, BE xóa hạn SX (`sx_kanban_deadline_at`, `production_deadline`, `production_finish_date`) và Kanban không còn đếm quá hạn.
Bật Tắt hạn cũng xóa hạn các dự án đang nằm trong cột; loại trừ với **Deadline** bắt buộc.
Tích Công / Thu / Deadline / Tắt hạn / Bỏ quá hạn / Ẩn **cập nhật đúng hàng** (PUT + state), không `load()` cả danh sách — trang không nháy «Đang tải».

Không bật sẵn trên «Tiếp nhận đơn hàng về SX» — admin tự tích cột muốn tắt hạn (vd. Đã giao).

Hoàn tác: revert `ProductionPipelineSettingsPage.jsx`, `production.js`, `productionPipelineSchema.js`, `clearCompletedProjectDeadlines.js`, `crmPipelineSla.js`, `sxKanbanSummary.js`, `workshopKanban.js`, `sxPipelineRevenue.js`, `moduleDeadlinePolicy.js` (FE+BE); `DROP COLUMN production_pipeline_stages.clears_deadline`.

## Deadline SX — cột Quá hạn trống dù đếm 2

Trạng thái: **FE+BE local.**

Cột Deadline «Quá hạn» đếm 2 nhưng «Đã tải 0/2»:
1. **TB-2026-791** cột ĐÃ GIAO — `delivery_date` lịch sử, hạn SX đã null. Server vẫn đếm quá hạn vì không nhận cột Đã giao.
2. **TB-2026-771** cột chờ bàn giao VC — hạn hoàn thiện 18/9 đã qua, chưa giao thật. FE ẩn vì `is_handover_to_logistics`.

Đã giao / đã công / đã thu / đã sang VC: hết hạn SX (deadline hiểu đã xong). Chờ VC chưa giao: hiện Quá hạn.
Kiểm tra HCB: 0 dự án done còn `production_deadline` / `sx_kanban_deadline_at`; 67 còn `delivery_date` (lịch sử, không đếm).

Hoàn tác: revert `moduleDeadlinePolicy.js` (FE+BE), `sxKanbanSummary.js`, `sxPipelineRevenue.js` (FE+BE), `ProductionViews.jsx`, `ProductionDashboard.jsx`, `production.js`.

## Dashboard SX — KPI theo bộ lọc phân loại

Trạng thái: **FE+BE local.**

KPI Công nợ / Đã thu trên `/sx/dashboard` lấy tổng server cùng filter xưởng + phân loại
(không còn đếm 40 thẻ đã load). Đổi Tủ bếp ↔ Cánh kính thì số dự án và tiền đổi theo loại.

Hoàn tác: revert `sxKanbanSummary.js`, `ProductionDashboard.jsx`.

## PDF hướng dẫn HCB — gộp cột + nhiệm vụ + công việc

Trạng thái: **docs local.** Ảnh live khoanh đỏ số 1–19, hướng dẫn từng bước bấm.

- `docs/ba/guides/huong-dan-hcb-gop-nhiem-vu/HUONG_DAN_HCB_GOP_NHIEM_VU.pdf`
- Bản sao: `bao-cao/Huong-dan_HCB_Gop-cot-va-Nhiem-vu.pdf`
- Xuất lại: `node docs/ba/guides/huong-dan-hcb-gop-nhiem-vu/generate-pdf.mjs`

Hoàn tác: xóa thư mục guide + file trong `bao-cao/`.

## Pipeline xưởng — Sửa cột nhỏ mở popup

Trạng thái: **FE local.**

Tab Cột chính `/sx/pipeline-settings`: nút **Sửa** mở popup ngay trên tab (không nhảy sang Cột nhỏ).
Đóng bằng ×, Hủy, hoặc bấm nền. Tab Cột nhỏ vẫn sửa inline như cũ.

Hoàn tác: revert `ProductionPipelineSettingsPage.jsx`.

## Chi tiết SX — ẩn phân tích hạn + pipeline nút Sửa cột nhỏ

Trạng thái: **FE local.**

Panel Thông tin chi tiết dự án SX **không còn khối** «Kế hoạch SX (tính từ ngày lắp)».
Trang `/sx/pipeline-settings` tab Cột chính: mỗi cột nhỏ có nút **Sửa** ngay trên dòng
(mở form tab Cột nhỏ). Cột chưa gán cũng có nút Sửa.

Hoàn tác: revert `ProductionDetail.jsx`, `ProductionPipelineSettingsPage.jsx`.

## Setup chi phí — lưới nút tích

Trạng thái: **FE local.**

Vùng «Nút tích» trên `/management/cost-setup` đổi từ bảng + danh sách dọc sang **lưới thẻ**:
mỗi nút tích một thẻ (tên, biến, số nhiệm vụ). Chọn thẻ mới hiện panel gắn nhiệm vụ;
nhiệm vụ xếp lưới 2 cột. Form thêm nút nằm trong ô nét đứt của lưới.

Hoàn tác: revert `AccountingCostSetupPage.jsx`.

## Đơn hàng — điền khách hàng trên danh sách

Trạng thái: **FE+BE local.**

Cột Khách hàng trên `/crm/orders` không còn `-` chết: bấm để nhập tên / SĐT / địa chỉ, Lưu qua `PUT /crm/orders/:id`.
API list trả thêm `customer_phone`, `customer_address`.

Hoàn tác: revert `OrdersPage.jsx`, `ORDER_LIST_SELECT` trong `commercialDocs.js`.

## CRM Deadline — luôn hiện hạn trên Kanban

Trạng thái: **FE+BE local + SQL 628 đã chạy primary/backup.**

Badge `0/1` trên cột Deadline là số thẻ đã tải / tổng server, không phải nút ẩn hạn.
Hai điều kiện cũ đẩy thẻ sang «Không hạn» trong khi server vẫn đếm 1:

1. **Chưa có SĐT** (`display_phone` / `phone` / `customer.phone` trống)
2. **Đã lập SX** (`project_id` / cột Đang SX / Đang lắp / Vận chuyển)

Đã gỡ cả hai. Hạn CRM vẫn hiện sau khi có dự án SX. Chỉ còn ẩn khi user tắt hạn
(`deadline_disabled_at`) hoặc cột Thắng/Thua/Hoàn thành doanh thu.
SQL **628 đã chạy primary + backup** (RPC `crm_deadline_bucket_counts` /
`crm_deadline_bucket_page_ids` không còn NULL hạn vì thiếu SĐT).

Hoàn tác: revert `crmLeadDeadlineDisplay.js`, `moduleDeadlinePolicy.js` (FE+BE),
`leadsList.js` `crmDeadlineTsForRow`, `CrmLeadDeadlineOverview.jsx`, `LeadDetail.jsx`.

## Setup chi phí — CRM lấy nút Báo giá có sẵn

Trạng thái: **FE+BE local.**

Trang setup không bắt tạo nút tích mới cho CRM. Mở `/management/cost-setup` tự lấy
nút **Upload Excel Báo giá** đã có trên nhiệm vụ CRM: tạo loại `bao_gia` (doanh thu,
biến `doanhthu.bao_gia`), bật cờ trên bộ mẫu «Báo giá», gắn `cost_type_id` vào
nhiệm vụ đang có nút. Phúc Đạt: 183 NV đã gắn.

Hoàn tác: xóa `cost_types` code `bao_gia`; gỡ `cost_type_id` / cờ trên mẫu CRM;
revert `costHub.js` (`ensureCrmQuotationCostType`), `costLedger.js` (fallback +
giữ `crm.product_cogs`), `AccountingCostSetupPage.jsx`.

## Loại chi phí + Excel + công thức

Trạng thái: **FE+BE local; SQL 624 (chạy script `run-migration-624.js`).**

Setup `/management/cost-setup` (và `/ketoan/chi-phi/setup`): tạo **loại chi phí**, chỉ định module (SX/VC/CRM/…), gắn bộ mẫu công việc.
Setup công việc SX/VC/CRM: checkbox **Bắt upload Excel** theo loại.
Tab Kế toán Work Unified: upload Excel → sổ `excel.<mã>`; công thức ví dụ `excel.nvl - (excel.vc + excel.crm)`. Nhiều công thức. Hoàn thành NV bị chặn nếu chưa có file.

Hoàn tác: revert 624 + `costHub` types/excel, `CostExcelUpload`, checkbox trên template pages; bảng 624 để đó.

## Sổ chi phí + công thức theo module

Trạng thái: **FE+BE local + SQL 622/623 đã chạy primary/backup.**

Kế toán có `/ketoan/chi-phi` (sổ) và `/ketoan/chi-phi/setup` (nhóm / nguồn auto-push / công thức AST).
Module Dự án (Work Unified): **Setup công thức chi phí** tại `/management/cost-setup` (nhóm 3. Thiết lập).
Trang setup: **module nào vào sổ** (bật/tắt) + ghép công thức bằng **+ − × /** (không cần gõ biến). Chọn công ty/khu vực.
Tab chi tiết Work Unified **Kế toán** — giá vốn / lợi nhuận / nguồn + dòng tiền. API `GET /projects/:id/cost-summary` dùng công thức theo khu vực deal.
Module đẩy dòng lên `cost_entries` (idempotent): chi phí xưởng, phát sinh SX, PO, phí VC (`projects.logistics_cost`), COGS dòng BG/ĐH (`cost_price`).
Công thức mặc định: Giá vốn = `entries.total`; Lợi nhuận gộp = `crm.doanh_thu - gia_von`.
Chi tiết deal Kế toán thêm khối «Chi phí theo nguồn».

Hoàn tác: revert route `costHub.js`, helper `costLedger.js` / `costExpr.js`, 2 trang FE, menu, adapter trong `projects.js` / `purchasing.js` / `commercialDocs.js`; bảng 622 để đó.

## CRM Kanban — 400 thiếu company_id (admin HST)

Nguyên nhân: production `userIsAdmin` chỉ `admin`, JWT đã là `ecosystem_admin`.
Đã nhận role mới + không bắt `users.company_id`. Đang đẩy nốt quyền HST / Facebook / user_companies.

## Đã xóa Linh Tây Ninh + Vân Long Xuyên

Trạng thái: **đã xóa primary + backup.** Hai công ty inactive, không lead/project.
Admin HST còn 5 công ty. Sync HST chỉ gắn công ty `is_active`.

## Admin HST — gắn mọi công ty trong hệ sinh thái

Trạng thái: **FE+BE local + SQL 621 đã chạy primary/backup.**

Admin hệ thống (`ecosystem_admin` / `admin` không `company_id`) được thêm
vào `user_companies` với **mọi công ty đang hoạt động của tenant**.
`users.company_id` vẫn null. Tạo công ty mới cũng gắn các admin HST.
`admin@tubep.vn` hiện 5 công ty.

Hoàn tác: xóa `user_companies` của user đó; revert `hstAdminCompanies.js`.

## CRM — admin HST không bắt company_id

Trạng thái: **BE local.**

`userIsAdmin` gồm `ecosystem_admin` (và alias superadmin). Admin hệ thống
không gắn công ty không còn 400 «Thiếu company_id của user».

Hoàn tác: revert `helpersBundle.js` (`userIsAdmin`, `requireUserCompanyId*`).

## Role `ecosystem_admin` — quản trị hệ sinh thái

Trạng thái: **FE+BE local + SQL 620 đã chạy primary/backup.**

Role cao nhất trong HST (mọi công ty trong tenant), **không** phải
`platform_admin` (SaaS vượt tenant). Đã gán `admin@tubep.vn`
(Admin Hệ Thống). JWT cũ còn `admin` đến khi đăng nhập lại.

Hoàn tác: `UPDATE users SET role='admin' WHERE email='admin@tubep.vn'`;
không xóa được giá trị enum. Revert helper `adminRole.js`.

## Facebook — admin hệ sinh thái xem hội thoại deal

Trạng thái: **FE+BE local.**

Admin cả HST (`admin` không `company_id`, có `tenant_id`) xem tab Facebook
trên mọi deal trong HST, kể cả Page chưa gán/gán lệch công ty. Deal ngoài
HST vẫn 403. NV/admin một công ty giữ lọc Page.

Hoàn tác: revert `facebook.js` (`isFacebookHstAdmin`,
`contactAllowedOnLeadThread`), `FacebookChatTab.jsx`.

## Trang cá nhân — cập nhật họ tên + SĐT

Trạng thái: **FE+BE local.**

Card **Thông tin** trên `/social/u/:id`: nút **Cập nhật** (chủ hồ sơ)
sửa họ tên và số điện thoại. PATCH `/internal-social/profile/me` nhận
`phone`.

Hoàn tác: revert `EditMyNameModal.jsx`, `SocialProfilePage.jsx`,
`internalSocial.js`.

## CRM stepper — qua Lắp đặt thì hết hạn lắp

Trạng thái: **FE+BE local.**

Kéo deal CRM sang cột **sau Lắp đặt** (CSKH / bảo hành / nghiệm thu /
Hoàn thành): tắt hạn lắp. `install_date` giữ. CSKH → `projects.status=warranty`
(vẫn hiện Work Unified). Hoàn thành CRM → đóng việc VC + mọi hạn còn lại.

Hoàn tác: revert `crmDealStageGate.js` (BE+FE), `moduleDeadlinePolicy.js`
(BE+FE), `completeOpenWorkOnModuleDone.js`, `leadLifecycle.js`,
`management.js` (`warranty` trong danh sách Work Unified).

## Work Unified — nhắc cập nhật tiến độ dự án quá hạn

Trạng thái: **FE+BE local. Đã gửi 36/36 dự án trễ hạn VPT hôm nay.**

Nút **Nhắc tiến độ** trên `/management/work-unified` (và chuông từng dòng
trễ hạn): ghi bình luận `@` người chịu trách nhiệm, thêm họ vào tab
Thành viên (vai trò Chịu trách nhiệm) nếu chưa có. Mỗi dự án 1 lần/ngày,
tối đa 80 dự án/lần. Gửi song song 5 dự án; proxy Vite `/api` 180s.

Hoàn tác: revert `workUnifiedProgressReminder.js`, `management.js`
(POST `/work-unified/remind-progress`), `WorkUnifiedOverviewPage.jsx`.

## Deadline — 1 hạn theo vòng đời CRM → SX → lắp

Trạng thái: **FE+BE local + SQL 619 đã chạy primary/backup.**

Một lúc chỉ đếm một hạn. Đã dọn dữ liệu chồng:
- CRM Thua/Thắng: xóa hạn thẻ + hạn NV mở (không xóa việc).
- Deal đã lập SX: xóa hạn CRM (thẻ + NV CRM, giữ NV sx_/vc_).
- SX đã giao / bàn giao VC: xóa `sx_kanban_deadline_at` + `production_deadline`.
- Giữ `install_date` / `delivery_date` / `production_finish_date`.

Hoàn tác: snapshot `backend/uploads/_lifecycle_deadline_sync_*.json`;
revert `moduleDeadlinePolicy.js` (BE+FE), `crmLeadDeadlineDisplay.js`,
`leadsList.js`, `619_sync_lifecycle_deadlines.sql`.

## Cảnh báo hạn — bật/tắt từng API

Trạng thái: **FE+BE local.**

Bảng «API đã cấu hình»: cột **Bật** từng dòng. Tắt thì cron/due-watch
bỏ API đó; gửi tay / test vẫn được. Công tắc form đồng bộ với bảng.

Hoàn tác: revert `ProjectDeadlineDispatchPage.jsx`, `dashboard.js`,
`projectDeadlineDispatch.js` (field `enabled` trên profile).

## Cảnh báo hạn — công tắc bật/tắt trên trang quản lý

Trạng thái: **FE+BE local.**

`/management/project-deadlines`: công tắc **Cảnh báo hạn công trình**
(cron Zalo) và **Gán hạn module vào nhiệm vụ trống**. Tự gửi Zalo từng
API cũng là công tắc. Gửi tay/test vẫn chạy khi tắt cron.

Hoàn tác: revert `ProjectDeadlineDispatchPage.jsx`, `dashboard.js`,
`projectDeadlineDispatch.js`; gỡ check stamp trong `workTasks.js` /
`workshopApplyTemplates.js`.

## Tổng quan nhiệm vụ — ghi hạn module vào việc con

Trạng thái: **BE local.**

Mở `/sx/project-tasks` (và CRM/VC cùng API): việc con còn mở, chưa có
hạn, được ghi hạn module (SX / VC-LĐ / CRM). Việc đã có hạn không đụng.
Tạo mẫu xưởng mới cũng nhận hạn module lúc insert. Dự án không có hạn
module (vd. TB-2026-029 không ngày SX/giao/lắp) vẫn trống.

Hoàn tác: revert `workTasks.js`, `projectOverviewDeadline.js`,
`workshopApplyTemplates.js`, `moduleDeadlinePolicy.js` (`forDisplay`).

## Stepper CRM — ✓ theo tiến độ SX/VC

Trạng thái: **FE local.**

Thanh tiến độ deal: cột Đang sản xuất / Vận chuyển / Lắp đặt / CSKH /
Hoàn thành được ✓ khi Kanban SX hoặc VC đã kéo tới (hoặc qua) giai đoạn
đó. Cột CRM đang đứng vẫn hiện icon hiện tại, không ✓.

Hoàn tác: revert `PipelineStepper.jsx`, `crmDealStageGate.js`,
`LeadDetail.jsx`, `WorkUnifiedProjectDetailPage.jsx`.

## Work Unified — hạn bàn giao = lịch lắp VC-LĐ đang chạy

Trạng thái: **BE+FE local.** Bỏ chống chế ẩn trễ khi VC còn Tiếp nhận.

Hạn tổng quan = deadline module VC/LĐ: buổi lắp **còn lại gần nhất**
(≥ hôm nay). Đang lắp nhiều buổi thì không trễ vì ngày đầu đã qua.
Hết buổi mà chưa **Hoàn thành** VC thì mới trễ. Kéo Hoàn thành / dời
lịch VC thì hạn đổi theo. Cánh kính SX xong giữ rule cũ.

Hoàn tác: revert `moduleDeadlinePolicy.js` (BE+FE), `projectForecast.js`,
`management.js`, `projectDealBundle.js`, test deadline + forecast.

## CRM Pipeline — tự thêm thành viên khi vào cột / lập KH SX

Trạng thái: **FE+BE local + SQL 618 primary/backup.**

Cài đặt Pipeline CRM (sửa cột Deal, kể cả cột Thắng): tick
**Tự thêm thành viên CRM khi vào cột**, chọn NV. Deal vào cột đó
(kéo Kanban / lập kế hoạch SX / gắn VC-LĐ) thì NV vào tab Thành viên.
Phúc Đạt «Đã ký hợp đồng» đã seed Vân. Không còn hardcode trong code.

Hoàn tác: revert `PipelineSettingsPage.jsx`, `pipelines.js`,
`crmPipelineStageMembers.js`, `leadLifecycle.js`, `autoDealWonProject.js`;
SQL trong `618_crm_pipeline_stage_default_members.sql`.

## Phúc Đạt — mặc định thêm NV Vân vào deal SX / VC-LĐ

Trạng thái: **BE local + SQL 617 primary/backup.**

Hoàng Thị Phượng Vân (`phuongvanhoang1505@gmail.com`) tự vào tab
Thành viên khi deal Phúc Đạt thiết lập kế hoạch SX hoặc gắn VC-LĐ.
Đã backfill 38 deal đang chạy (6 Đã ký HĐ, 15 SX, 13 VC/LĐ, 4 Hóa đơn).
Không thêm vào đội SX (chỉ thành viên deal).

Hoàn tác: revert `dealParticipantProduction.js`,
`vcHandoverDealMembers.js`, `productionWorkshopTypeStaff.js`;
xóa `lead_members` user Vân vừa thêm.

## HCB Cánh kính — hoàn thành SX tắt hết hạn + NV

Trạng thái: **BE local.**

Kéo loại **Cánh kính HCB** sang cột SX **Hoàn thành** (cờ Đã thu): đóng
mọi nhiệm vụ còn mở (SX, VC/LĐ, CRM, giao việc), tắt deadline CRM/SX/VC,
đánh `projects.status = completed`. Tủ bếp / Cửa / «Đợi thanh toán» không
đổi (vẫn chỉ đóng hạn SX). Job quét hạn cũng dọn đơn Cánh kính đang nằm
sẵn ở Hoàn thành.

Hoàn tác: revert `completeOpenWorkOnModuleDone.js`,
`clearCompletedProjectDeadlines.js`, `projectForecast.js`.

## Quản lý nhiệm vụ — mũi tên cuộn Kanban

Trạng thái: **FE local.**

Trang `/sx/project-tasks` (và VC/CRM/tổng quan cùng component): mép
trái/phải có mũi tên cuộn ngang giống Dashboard Kanban.

Hoàn tác: revert `ProjectTasksOverviewPage.jsx`.

## Kanban — nút Nhiệm vụ nổi trên thẻ

Trạng thái: **FE local.**

Thẻ SX / VC / Work Unified: nút **Nhiệm vụ** (chữ + icon) trên đầu
thẻ, mở trang Quản lý nhiệm vụ của đúng dự án. Không còn icon ẩn
dưới chân thẻ.

Hoàn tác: revert `KanbanGotoProjectTasksBtn.jsx`,
`ProductionDashboard.jsx`, `LogisticsDashboard.jsx`,
`WorkUnifiedOverviewPage.jsx`.

## Pipeline xưởng — thêm cột nhỏ trong thẻ cột chính

Trạng thái: **FE + BE local.**

Mỗi thẻ cột chính có nút **Thêm cột nhỏ**: nhập tên, tạo cột pipeline
gắn sẵn `group_key` + tab đang chọn. POST nhận `group_sort`.

Hoàn tác: revert `ProductionPipelineSettingsPage.jsx`, `production.js`.

## Pipeline xưởng — kéo cột nhỏ giữa cột chính

Trạng thái: **FE local.**

Tab **Cột chính**: kéo cột nhỏ từ thẻ này sang thẻ kia (kể cả thả
vào danh sách bên trong). Payload `nho:`/`lon:` + ref để không mất
drop khi `dragEnd` chạy trước. Không đổi `order_index` cột nhỏ.

Hoàn tác: revert `ProductionPipelineSettingsPage.jsx`.

## Pipeline xưởng — trang setup cột chính

Trạng thái: **FE local.**

Trang `/sx/pipeline-settings` mặc định tab **Cột chính**: bảng thẻ
theo tab Dashboard (Sản xuất / Công nợ). Cột chưa setup hiện thẻ
nét đứt. Kéo cột nhỏ vào thẻ để gán. Tab **Cột nhỏ** / **Cài đặt**
tách chi tiết và giờ deadline + NV.

Hoàn tác: revert `ProductionPipelineSettingsPage.jsx`.

## HCB — cột pipeline Đóng gói đủ loại

Trạng thái: **DB primary/backup SQL 616.**

Tủ bếp: cột Kanban **Đóng gói** (trước KCS), `group_key=dong_goi`,
`is_packaging_done`. Cửa / Cánh kính giữ «Vệ sinh đóng gói».
«ĐƠN HÀNG ĐÃ CHUẨN BỊ XONG» trả về Hoàn thiện.

Hoàn tác: SQL trong `616_hcb_dong_goi_pipeline_column.sql`.

## HCB — hiện cột lớn Đóng gói đủ loại

Trạng thái: **FE + DB primary/backup.**

Kanban gộp: cột lớn chỉ 1 cột nhỏ vẫn hiện tên lớn (Đóng gói).
Tủ bếp có cột pipeline Đóng gói (616); Cửa / Cánh kính từ 612.

Hoàn tác: SQL trong `615_hcb_tubep_dong_goi_group_key.sql`; revert
`sxGopCot.js`, `ProductionDashboard.jsx`.

## Pipeline xưởng — tự thêm tab Kanban

Trạng thái: **FE + BE local.**

Nút **+ Tab** cạnh Sản xuất / Công nợ: đặt tên tab mới, gán cột lớn
vào tab đó. Dashboard hiện mọi tab có cột. `board_tab` nhận tên tự
đặt (không chỉ sx/cong_no). Tab trống xóa bằng ×.

Hoàn tác: revert `sxTachCongNo.js`, `ProductionPipelineSettingsPage.jsx`,
`ProductionDashboard.jsx`, `production.js`.

## Pipeline xưởng — cột lớn theo tab Sản xuất / Công nợ

Trạng thái: **FE + BE local; DB primary/backup `board_tab`.**

Setup cột lớn chọn tab **Sản xuất** hoặc **Công nợ** (giống
Dashboard). Cột gán vào tab nào thì Kanban hiện đúng tab đó.
Cột `board_tab` (SQL 614). Cánh kính/Cửa: bấm «→ Công nợ» nếu
muốn tách tab (mặc định vẫn trên Sản xuất như cũ).

Hoàn tác: SQL `database/614_production_pipeline_board_tab.sql`;
revert `sxTachCongNo.js`, `ProductionPipelineSettingsPage.jsx`,
`productionPipelineSchema.js`, `workshopKanban.js`, `production.js`.

## Pipeline xưởng — thêm cột lớn cả 2 tab

Trạng thái: **FE local.**

Form **Thêm cột lớn** (tên + chip + chọn cột pipeline) có trên tab
Gộp cột và tab Cột pipeline.

Hoàn tác: revert `ProductionPipelineSettingsPage.jsx`.

## Pipeline xưởng — thêm cột lớn ngay danh sách

Trạng thái: **FE local.**

Khối «Cột lớn đang dùng»: form **Thêm cột lớn** (tên + chip gợi ý
+ chọn cột pipeline đưa vào). Không cần gán từng dòng bảng dưới.

Hoàn tác: revert `ProductionPipelineSettingsPage.jsx`.

## Pipeline xưởng — ô Cột lớn thành dropdown

Trạng thái: **FE local.**

Bảng Gộp cột (và form sửa cột): chọn **Tiếp nhận / Hoàn thiện…**
thay vì gõ slug `tiep_nhan`. Lưu ngay khi chọn; «+ Tên mới…» nếu
cần tên khác.

Hoàn tác: revert `ProductionPipelineSettingsPage.jsx`, `sxGopCot.js`.

## Pipeline xưởng — sắp xếp + sửa cột lớn dễ hơn

Trạng thái: **FE + BE local; DB primary/backup đã có `group_sort`.**

Tab «Gộp cột»: cột lớn thành danh sách (kéo / ↑↓), sửa tên ngay trên
thẻ, hiện cột nhỏ bên trong, lọc NV. Thứ tự lưu `group_sort` — không
đổi `order_index` cột nhỏ. Kanban gộp đọc cùng thứ tự.

Hoàn tác: SQL `database/613_production_pipeline_group_sort.sql`;
revert `sxGopCot.js`, `ProductionPipelineSettingsPage.jsx`,
`productionPipelineSchema.js`, `workshopKanban.js`, `production.js`.

## Pipeline xưởng — cột lớn Đóng gói

Trạng thái: **FE + DB primary/backup đã chạy.**

HCB Cửa + Cánh kính: «Vệ sinh đóng gói» ra cột lớn **Đóng gói**.
Thứ tự lưới/Kanban gộp: **Hoàn thiện rồi Đóng gói** (không theo
order_index cột nhỏ).

Hoàn tác: SQL trong `database/612_hcb_dong_goi_group_key.sql`;
revert `sxGopCot.js`, `sxWorkshopSchedule.js` (FE+BE),
`ProductionPipelineSettingsPage.jsx`.

## CRM — nút Zalo chi tiết: Đã gửi + lưu DB

Trạng thái: **FE + BE local, chưa commit.**

Nút **Gửi Zalo** trên chi tiết deal: gửi xong đổi **Đã gửi Zalo** (xanh).
Mở lại deal vẫn giữ trạng thái từ `crm_zalo_stage_sends` (`msg_id`).
Bấm lại thì hỏi gửi lần nữa. API `GET /crm/leads/:id/detail` thêm
`zalo_oa_sent` / `zalo_oa_send`.

Hoàn tác: revert `LeadDetail.jsx`, `leadLifecycle.js`, `helpersBundle.js`.

## Pipeline xưởng — lọc công ty/loại + NV cột lớn

Trạng thái: **FE local, chưa commit.**

Tab «Gộp cột» có bộ lọc Công ty + Loại (không phải sang tab Cột
pipeline). Mỗi cột lớn có ô **Người chịu trách nhiệm** — gán NV
chính cho mọi cột nhỏ trong nhóm. Kanban gộp hiện tên NV trên
cột lớn.

Hoàn tác: revert `ProductionPipelineSettingsPage.jsx`,
`ProductionDashboard.jsx`, `sxStageStaff.js`.

## Work Unified — chip lịch: mã + khách + NV

Trạng thái: **FE local, chưa commit.**

Ô ngày trên Lịch chỉ còn mã TB, khách/tên ngắn, NV phụ trách.
Lịch SX không lặp chữ «Hạn SX» (đã có màu). Bấm ngày: tên đầy đủ,
SĐT, công đoạn, cả 3 hạn SX/Giao/Lắp.

Hoàn tác: revert `WorkUnifiedOverviewPage.jsx`.

## Work Unified — cột Deadline «Ngày mai»

Trạng thái: **FE local, chưa commit.**

Board Deadline `/management/work-unified` thêm cột **Ngày mai**
(hạn đúng ngày kế tiếp), nằm giữa Hôm nay và Tuần này.

Hoàn tác: revert `WorkUnifiedOverviewPage.jsx`.

## SX — thanh chip module → ô tìm từng chữ

Trạng thái: **FE local, chưa commit.**

Thanh «Sản xuất · 770» trên `/sx/project-tasks` thành ô tìm kiếm
full-width; gõ từng chữ là lọc board ngay.

Hoàn tác: revert `ProjectTasksOverviewPage.jsx`.

## SX — thẻ nhiệm vụ → Giao việc + Nhật ký

Trạng thái: **FE + BE local, chưa commit.**

Bấm thẻ hoặc nút **Công việc** trên `/sx/project-tasks` mở
**Giao việc Sản xuất** lọc đúng dự án (`?project_id=`). Board hiện
giao việc + nhiệm vụ pipeline của dự án đó.

Hoàn tác: revert `ProjectTasksOverviewPage.jsx`, `CRMAssignmentsPage.jsx`,
`ProjectConstructionLogsPage.jsx`, `assignmentSourceLink.js`,
`crmAssignments.js`.

## SX — bộ lọc nhiệm vụ = Phạm vi xưởng Dashboard

Trạng thái: **FE + BE local, chưa commit.**

Panel `/sx/project-tasks` dùng đúng khối «Phạm vi xưởng» của Dashboard:
Công ty sản xuất (xưởng) + Công ty đặt hàng (CRM + ngoài).
`GET /work-tasks/project-overview` nhận `deal_company_id`.

Hoàn tác: revert `ProjectTasksOverviewPage.jsx`, `ProjectTasksFilterPanel.jsx`,
`WorkshopDashboardFilterPanel.jsx`, `workTasks.js`.

## Menu SX — Deal vào xưởng → Dashboard

Trạng thái: **FE local, chưa commit.**

Mục ghim `/sx/dashboard` đổi nhãn «Deal vào xưởng» → **Dashboard**.

Hoàn tác: revert `Sidebar.jsx`.

## SX — bộ lọc nhiệm vụ dự án = Dashboard xưởng

Trạng thái: **FE local, chưa commit.**

`/sx/project-tasks` lấy công ty / khu vực / NV như Dashboard SX:
`/companies?for_module=production`, không còn NextGo/VPT CRM.
Mặc định xưởng theo `sx_dash_filters_v1` (HCB/Metalla), không «Tất cả công ty».

Hoàn tác: revert `ProjectTasksOverviewPage.jsx`, `ProjectTasksFilterPanel.jsx`,
`crossWorkshopProduction.js`, `WorkUnifiedFilterFields.jsx`, `Sidebar.jsx`.

## NextGo — tắt công ty cũ trên HST mặc định

Trạng thái: **đã chạy DB primary + backup.** Không đổi code.

`Công Ty TNHH Bao Bì NextGo` trên tenant `default`
(`87479a83-1145-43b7-b090-3e40812cb5a9`) → `is_active=false`.
Ẩn khỏi `/api/companies` (CRM/SX/VC dropdown). Dữ liệu không xóa.

HST `nextgo` clone (`842cff41-…`) vẫn `is_active=true`.

Hoàn tác: `NEXTGO_CUTOVER=YES node scripts/freeze-nextgo-source.js --unfreeze --apply`
(và `UPDATE companies SET is_active=true` trên backup).

## SX — bộ lọc NV: NV theo công ty / khu vực

Trạng thái: **FE local, chưa commit.**

Danh sách người phụ trách trên panel `/sx/project-tasks` chỉ còn NV
của công ty đang chọn, và (nếu chọn khu vực) NV gắn khu vực đó.

Hoàn tác: revert `ProjectTasksOverviewPage.jsx`, `ProjectTasksFilterPanel.jsx`.

## SX — bộ lọc NV: chọn nhiều nhân viên

Trạng thái: **FE local, chưa commit.**

Tab Nhân viên trên `/sx/project-tasks` chọn 1 hoặc nhiều người phụ
trách (checkbox + tìm). Board hiện task của bất kỳ người đã chọn.

Hoàn tác: revert `ProjectTasksFilterPanel.jsx`, `ProjectTasksOverviewPage.jsx`.

## SX — bộ lọc NV: công ty / khu vực / nhân viên

Trạng thái: **FE + BE local, chưa commit.**

Bộ lọc nâng cao `/sx/project-tasks` mở tab Nhân viên, nạp đủ khu vực
(`company-regions`) và nhân viên (`employees-by-company`). Khu vực NV SX
lấy từ deal gắn `project_id` (trước chỉ có khi task có `lead_id`).

Hoàn tác: revert `ProjectTasksOverviewPage.jsx`,
`ProjectTasksFilterPanel.jsx`, `workTasks.js`.

## Zalo — tắt tự gửi, nút Gửi Zalo mọi cột deal

Trạng thái: **commit + push main.**

Kéo deal vào cột không tự gửi ZNS. Nút **Gửi Zalo** trên chi tiết deal
(mọi cột). Ẩn toggle Zalo trên Cài đặt Pipeline. Token ZNS lấy từ
`zalo_oa_accounts`.

Hoàn tác: khôi phục `maybeSendZaloOnDealStageEnter` + điều kiện cột
Hoàn thành trên nút.

## Work Unified — bỏ badge CRM/SX/VC trên thẻ

Trạng thái: **commit + push main.**

Kanban và Deadline không còn chip CRM · SX · VC (và ĐA MODULE). Lịch
cũng gỡ chip module.

## Menu SX — nhóm 3 Setup xưởng

Trạng thái: **commit + push main.**

Đổi tiêu đề nhóm sidebar «3. Điều hành xưởng» → **3. Setup xưởng**.

## Zalo ZNS — token hiệu lực từ OA

Trạng thái: **commit + push main.**

Gửi ZNS / cấu hình / test lấy access token từ `zalo_oa_accounts` (tự refresh),
không dùng bản chép cũ trong `app_settings`.

## Deploy Render — thiếu GiaVonExcelModal

Trạng thái: **commit + push main.**

`WorkshopTaskTemplatesPage` import modal giá vốn nhưng file chưa git →
vite build Render fail. Thêm `GiaVonExcelModal.jsx`.

## Chi tiết SX — ẩn tab Sự cố

Trạng thái: **FE local, chưa commit.**

Tab «⚠️ Sự cố» không còn trên chi tiết dự án xưởng. `?tab=incidents`
chuyển về Công việc.

Hoàn tác: hiện lại `tabBtn('incidents'…)` và thêm `'incidents'` vào
`DEAL_TAB_KEYS`.

## HCB Cánh kính / Cửa — bỏ chặn kéo cột

Trạng thái: **SQL 611 + BE local.**

Không còn bắt hoàn thành nhiệm vụ trước khi kéo Kanban Cánh kính/Cửa.
Gate `assertSxKanbanAdvanceAllowed` bỏ qua hai phân loại này. Tủ bếp giữ chặn.

Hoàn tác: revert `workshopStageAdvanceGate.js` + gán lại `blocks_stage_advance`.

## HCB Cánh kính — kéo Tiếp nhận → sản xuất

Trạng thái: **SQL 610 đã chạy; FE local.**

Tài khoản quản lý Cánh kính (Nguyễn Nhật): kéo thẻ bị chặn vì 3 nhiệm vụ
Tiếp nhận tick «Chặn chuyển giai đoạn» (mẫu 598). Đã tắt cờ chặn trên
Cánh kính/Cửa cột Tiếp nhận. Kanban hiện hộp nhiệm vụ nếu còn chặn.

Hoàn tác: gán lại `blocks_stage_advance=true` cho task/mẫu cột Tiếp nhận.

## Bình luận SX — tin tải file không hiện 2 nút

Trạng thái: **FE local, chưa commit.**

Upload 1 file (TB-2026-817, `ANH PHÚC LONG AN - ĐƠN 4.xlsx`) chỉ 1 bản ghi
`file_attachments` + 1 tin 📎; UI hiện tên file tải được *và* thẻ tải bên dưới.
Tên trong pill chỉ còn in đậm; tải file ở chip/preview.

Hoàn tác: revert `CommentsPanels.jsx` (`renderSystemCommentBody`).

## HCB — đủ NV mặc định phân loại trên dự án

Trạng thái: **SQL 609 đã chạy primary + backup; BE local.**

Đơn HCB mới không còn cắt còn 1 phụ trách chính. Đơn đang thiếu đã được
bổ sung đủ NV setup phân loại (Tủ bếp 20, Cánh kính 9) vào đội SX + tab
Thành viên (role SX/VC). Công ty khác vẫn `primaryOnly`.

Hoàn tác: xóa dòng staff/member vừa thêm (không đụng `is_primary` cũ).

## HCB Cánh kính — hiện lại cột thanh toán

Trạng thái: **SQL 608 đã chạy primary + backup; FE local.**

Cột «Đợi thanh toán» / thu tiền / nợ quá hạn bị `group_key=cong_no` nên tab
Sản xuất dời sang tab Công nợ. Gỡ group_key trên Cánh kính+Cửa; Tủ bếp giữ tab.

Hoàn tác: gán lại `group_key='cong_no'` cho 3 cột đó.

## Tab Công việc SX — Xong hết + hiện việc

Trạng thái: **local, chưa commit.**

Cột lớn (GIA CÔNG…) và từng cột nhỏ: nút **Xong hết** (tích hoàn thành
hàng loạt). Nút **Hiện việc** / bấm tên cột nhỏ để mở danh sách nhiệm vụ
thuộc nhóm đó (cháu).

Hoàn tác: revert khối `sxPlanGroups` trong `CRMTasksTab.jsx`.

## Quản lý NV — hạn kế hoạch SX (từ ngày lắp)

Trạng thái: **local, chưa commit.**

Thẻ `/sx/project-tasks` lấy hạn từ kế hoạch SX (panel indigo chi tiết dự án)
khi nhiệm vụ chưa có deadline. Cột song song dùng hạn cột cha (`group_key`:
Gia công → cabinet, Hoàn thiện → finishing, Tiếp nhận/KH/Duyệt → planning).

Hoàn tác: revert `workTasks.js`, `sxInstallPlanKanbanDeadline.js`,
`sxWorkshopSchedule.js` (BE+FE), `ProductionDetail.jsx`.

## Tab Công việc SX — cha / con, ẩn cháu

Trạng thái: **local, chưa commit.**

Tab Công việc chi tiết dự án: cột lớn (Tiếp nhận, Gia công…) = cha;
cột nhỏ (HT nhôm…) = con. Dòng nhiệm vụ (cháu) không hiện.

Hoàn tác: revert `CRMTasksTab.jsx` (`sxPlanGroups`).

## Quản lý NV xưởng — bấm thẻ vào chi tiết dự án

Trạng thái: **đã đổi (2026-10-01).**

Thân thẻ mở chi tiết dự án. Nút Công việc vẫn vào Giao việc `?project_id=`.

Hoàn tác: revert `overviewProjectHref` trong `ProjectTasksOverviewPage.jsx`.

## Kanban SX — nút mở quản lý nhiệm vụ theo dự án

Trạng thái: **FE local, chưa commit.**

Nút ô vuông trên thẻ Kanban xưởng mở `/sx/project-tasks?project=…`.
Nút to hơn (32px), nền tím, nằm riêng bên trái cụm icon nhỏ.

Hoàn tác: revert `ProductionDashboard.jsx` (nút thẻ), `ProjectTasksOverviewPage.jsx`.

## Work Unified Deadline — thẻ gọn, hạn nổi

Trạng thái: **local, chưa commit.**

View Deadline bỏ ĐA MODULE, deal, SĐT, badge CRM/SX/VC. Thẻ còn mã + tên,
từng hạn SX/Giao/Lắp một dòng, rồi công đoạn · người phụ trách. Kanban/Planner
giữ thẻ cũ.

Hoàn tác: revert `WorkUnifiedOverviewPage.jsx` (`WorkKanbanCard` variant deadline).

## Quản lý nhiệm vụ xưởng — cột theo hạn

Trạng thái: **local, chưa commit.**

`/sx/project-tasks` (và CRM/VC cùng trang): 6 cột Quá hạn / Hôm nay / Ngày mai /
Trong tuần / Tuần sau / Chưa có hạn. Thẻ trong cột: mã dự án, tên việc, hạn,
tiến độ n/N, người phụ trách. Hạn sau tuần sau gom vào «Tuần sau».

Hoàn tác: revert `ProjectTasksOverviewPage.jsx`, `ProjectTasksFilterPanel.jsx`.

## Ma trận gộp cột — hạn kế hoạch + người phụ trách cột

Trạng thái: **local, chưa commit.**

Panel «Kế hoạch SX» trên chi tiết khớp cột gộp (từng cột nhỏ + NV setup pipeline).
Ô ma trận song song hiện hạn (tính từ ngày lắp) và người chịu trách nhiệm cột.

Hoàn tác: revert `WorkshopInfoPanel` / `SxMaTranSongSong` / `sxKanbanStages` default_staff.

## Chi tiết SX — bấm vòng tròn tích việc song song

Trạng thái: **local, chưa commit.**

Thanh tiến độ chi tiết: bấm vòng tròn việc song song để tích/bỏ hoàn thành;
việc đã tích hiện ✓. Bấm tên cột vẫn chuyển thẻ. Ma trận Kanban dùng cùng bảng.

Hoàn tác: revert `PipelineStepper.jsx`.

## HCB Tủ bếp — mở Ban thành phẩm thành 3 cột

Trạng thái: **đã chạy SQL 607 trên primary; backup chạy kèm 604 (thiếu group_key).**

Cột «Ban thành phẩm» → **Chuẩn bị vật tư** (3 đơn giữ nguyên) + thêm **Đặt kính**, **Sơn**.
Các cột sau (ĐANG SX THÙNG, HT NHÔM…) lùi thứ tự. `group_key` vẫn `gia_cong`.

Hoàn tác: đổi tên lại Ban thành phẩm, xóa 2 cột Đặt kính/Sơn, dồn thẻ về cột 4.

## Work Unified — KPI không đổi khi bấm tab tiến độ

Trạng thái: **đã push main (`e14b41b0`).**

Thẻ Đang thực hiện / Đúng tiến độ / Nguy cơ / Trễ luôn đếm trên cùng bộ lọc
(công ty, NV, khu vực, hạn, tìm, công đoạn). Tab tiến độ chỉ lọc danh sách,
không đổi 4 số KPI. Không trộn `items.length` của tab hiện tại với `stats` API.

Hoàn tác: revert `WorkUnifiedOverviewPage.jsx`.

## Ma trận SX — ô Đang làm / Xong hiện tên dự án

Trạng thái: **local, chưa commit.**

`SxMaTranSongSong`: ô việc song song (Đang làm, Xong) ghi tên dự án dưới nhãn
trạng thái, cùng nguồn tên với thẻ Kanban bên trái.

Hoàn tác: revert khối ô trong `ProductionDashboard.jsx` (`SxMaTranSongSong`).

## Deadline CRM — tick «đã tương tác» không còn ẩn hạn

Trạng thái: **RPC primary + backup đã chạy (SQL 606); code FE/BE local đã sửa; production FE chưa deploy.**

Tick xanh «đã tương tác» chỉ còn đánh dấu cá nhân. Không đẩy thẻ sang «Không hạn»
và không ẩn badge Quá hạn (Deadline / Kanban). LEAD-2026-279 của Admin Q2 sẽ
hiện lại ở cột Quá hạn sau khi RPC primary + FE/BE lên production.

Hoàn tác: revert `moduleDeadlinePolicy` (BE/FE), `crmLeadDeadlineDisplay.js`,
`leadsList.js` `crmDeadlineTsForRow`, `dailyReportMetrics.js`, SQL 605.

## Xóa 2 đơn Cửa Phúc Đạt (Minh)

Trạng thái: **đã chạy trên DB, script local chưa commit.**

Đã xóa đúng bản Phúc Đạt trên Kanban Cửa:
- `TB-2026-767` / `DEAL-2026-1401` (Anh Tám)
- `TB-2026-337` / `DEAL-2026-440` (Anh Hường)

Giữ nguyên xưởng khác (Anh Tám): Metalla `TB-2026-740`, HCB `754`/`755`/`764`/`765`/`827`.
Anh Hường không có bản xưởng khác. Snapshot thùng rác + rollback
`backend/uploads/_delete_phucdat_minh_two_orders_1789180288590.json`.
Script: `backend/scripts/delete-phucdat-minh-two-orders.js`.

Hoàn tác: khôi phục từ Thùng rác (project + deal).

## CRM thêm SX — chỉ 1 NV xưởng; phụ trách chính thêm người

Trạng thái: **local, chưa commit.**

Khi CRM thêm sản xuất (tạo dự án / bàn giao / intake / đổi xưởng), hệ thống
chỉ gắn **1 người chịu trách nhiệm chính** (setup phân loại hoặc NV handover),
không còn đổ cả đội / cả xưởng vào `project_production_staff`.

Phụ trách chính module (CRM / SX / VC) được thêm NV vào dự án:
`POST/DELETE /projects/:id/production-staff` + tab Thành viên (NV SX đồng bộ đội).
Chi tiết SX: ô «Thêm NV vào dự án» dưới Đội SX.

Hoàn tác: revert `productionWorkshopTypeStaff.js`, `autoDealWonProject.js`,
`projects.js` (route production-staff), `ProductionDetail.jsx`, `LeadChatTabs.jsx`.

## Báo cáo phát sinh — phân tích + bài học

Trạng thái: **local, chưa commit.**

Trang `/management/shared-workspace-report` có tab **Phân tích** (mặc định) và
**Danh sách**. Phân tích theo tuần / tháng / bộ phận / dự án / nhân viên / loại;
sinh bài học rút kinh nghiệm. Excel xuất thêm các sheet này. API field `analysis`.

Hoàn tác: revert `sharedWorkspaceAssignmentsAnalysis.js` + report helper/page/excel.

## Hồ sơ liên thông — thêm TT cơ bản theo module

Trạng thái: **local, chưa commit.**

Work Unified: chip CRM/SX/VC và khối «Hồ sơ liên thông» chỉ hiện module dự án
đang có (VC ẩn nếu chưa bàn giao / chưa gắn công ty VC hoặc cột Kanban VC).
Hồ sơ thêm địa chỉ, khu vực, giai đoạn, phân loại, phụ trách, ngày lắp.

Hoàn tác: revert `projectDealBundle.js`, `ProjectOverviewPanel.jsx`,
`WorkUnifiedProjectDetailPage.jsx`.

## Tổng quan dự án — cụm nhiệm vụ như trang Quản lý nhiệm vụ

Trạng thái: **local, chưa commit.**

Tab Tổng quan Work Unified (`ProjectOverviewPanel`) không còn liệt kê từng việc lẻ
«Công việc trọng yếu». Gọi `/work-tasks/project-overview?project_id=` — cùng thuật
gom cụm với `/crm/project-tasks`, chỉ hồ sơ đang mở. Bấm dòng → tab Công việc.

Hoàn tác: revert `workTasks.js` + `ProjectOverviewPanel.jsx` + prop `projectId`.

## Luồng tổng quan — gộp Giao nhận

Trạng thái: **local, chưa commit.**

Luồng thực hiện (Work Unified / tab Tổng quan) gộp 3 bước «Chuẩn bị vật tư»,
«Giao hàng», «Lắp đặt» thành **một** bước **Giao nhận**. Kanban cột workflow_stages
trong DB không đổi; chỉ hiển thị + lọc stage.

Hoàn tác: revert `projectDealBundle.js` + `management.js`.

## HCB — pipeline cũ + chỉnh tiến trình Tủ bếp

Trạng thái: **600/601 pipeline cũ; 602 kéo thẻ Tủ bếp đúng cột (primary + backup).**

Quy tắc 602 (không đụng CHỐT CÔNG NỢ / Cánh kính / Cửa):
- đang lắp hoặc ngày giao/lắp đã qua → ĐÃ GIAO
- shipping + giao ngày mai → NGÀY MAI GIAO
- shipping / đã bàn giao VC → ĐÃ CHUẨN BỊ XONG
- Ban thành phẩm, giao hôm nay hoặc trước → KCS

Primary Tủ bếp: Tiếp nhận 8 · Kế hoạch 1 · Ban TP 22 · KCS 9 · Chuẩn bị xong 3 · Mai giao 2 · Đã giao 70 · CHỐT CN 215.

Cánh kính giữ: sản xuất 6, Đợi TT 5, Hoàn thành 149, Hủy 2. Cửa 0 thẻ.

F5 Kanban SX.

## Tab Tiến độ Unified — nhiều xưởng SX / VC

Trạng thái: **local, chưa commit.**

Tab Tiến độ Work Unified hiện **từng dự án SX** và **từng nơi VC/LĐ** khi deal đặt
nhiều xưởng. Stepper đủ cột; dưới bước ghi ngày `dd/mm/yyyy` (không giờ). CRM lấy
lịch sử stage; SX/VC lấy ngày vào cột hiện tại và mốc hoàn thành/giao/lắp.

Hoàn tác: revert `WorkUnifiedProjectDetailPage.jsx`, `PipelineStepper.jsx`,
`autoDealWonProject.js`, `projectDealBundle.js`.

## Tổng quan công việc — chỉ từ deal đã ký HĐ

Trạng thái: **local, chưa commit.**

`/management/work-overview` không lấy lead: dự án/việc chỉ deal đã ký HĐ (mốc
`is_won` / `contract_signed`) trở đi. Thẻ «Công việc quá hạn» trước đây gọi
`/work-tasks` (gồm `CRM-Lead`, cắt 50 dòng). Nay lọc `unified_tasks_v` theo
project/deal đã ký, loại `CRM-Lead` và việc cá nhân.

Hoàn tác: revert `management.js`, `WorkOverviewPage.jsx`.

## Sidebar — gỡ «Dashboard dự án»

Trạng thái: **local, chưa commit.**

Bỏ mục trùng `/management/work-unified` ở nhóm «2. Làm việc». Vào trang đó vẫn từ
«Work Unified» (Tổng quan). Hoàn tác: thêm lại dòng trong `Sidebar.jsx`.

## GCCK đã hoàn thành SX — không hiện trễ hạn

Trạng thái: **local, chưa commit.**

Work Unified / Tổng quan công việc đếm trễ theo ngày lắp. Đơn Cánh kính (tên `GCCK-…`
hoặc loại xưởng «Cánh kính») đã sang cột SX «Hoàn thành» / đã giao thì **không** hiện
«Trễ hạn». GCCK còn đang sản xuất, và tủ bếp/cửa dù cột hoàn thành, vẫn đếm trễ như cũ.

Hoàn tác: revert `projectForecast.js`, `management.js`, `projectDealBundle.js`.

## Tổng quan công việc lấy cùng tập Work Unified

Trạng thái: **local, chưa commit.**

`/management/work-overview` trước đây đếm `projects` trực tiếp (thiếu deal CRM
đặt xưởng khác, khu vực theo project_id lead). Đã dùng chung `queryWorkUnifiedList`
với `/work-unified` cho «Dự án đang thực hiện» và «Dự án cần chú ý».

Doanh thu 6 tháng / KH mới / việc quá hạn vẫn nguồn cũ (`projects.estimated_value`,
`crm_leads` type=lead, `unified_tasks_v`).

Hoàn tác: revert `backend/src/routes/management.js`.

## Work Unified tab Bình luận — deal con che thread gốc

Trạng thái: **local, chưa commit.**

TB-2026-800 (`6ddb5e86-…`): deal con Hucabi `DEAL-2026-1515` (0 comment, updated_at mới hơn)
đè deal gốc Phúc Đạt `DEAL-2026-1459` (60 comment). Tài khoản Trương Trọng Thành
(admin HST, `comment_show_on_screen=true`) không lỗi quyền — tab Chat lấy `primary_lead`
theo `updated_at DESC`.

Đã vá: `projectDealBundle` chọn deal gốc (`sortProjectCrmDeals`) + đếm comment cả thread;
FE `pickPrimarySxCrmDeal`. Hoàn tác: revert `projectDealBundle.js`,
`WorkUnifiedProjectDetailPage.jsx`.

## Bình luận HST mặc định — chỉ mục bị cắt 1.000 dòng

Trạng thái: **đã push `cd6d001b` lên main.**

Dữ liệu không mất: HST mặc định còn 27.653 bình luận deal (9.767 hội thoại,
17.881 hệ thống), 587/651 dự án có comment CRM. View «Bình luận» CRM/SX trống
vì `GET /crm/lead-comments/index` chỉ lấy 1.000 dòng PostgREST → ~110/4.668
deal hiện badge. CRM còn gửi tối đa 2.000 UUID một URL (vượt ~600 UUID).

Đã vá: index dùng `fetchAllByIds` (chia khúc + phân trang); CRM chunk 200 id.
Hoàn tác: revert `leadComments.js`, `projects.js`, `CRMDashboard.jsx`.

## Xóa deal trùng Anh Tám DEAL-2026-1518

Trạng thái: **đã chạy trên DB, script local chưa commit.**

Minh (Phúc Đạt) tạo `DEAL-2026-1518` trên Metalla hôm nay — trùng khách
Anh Tám / 0946714857. Đã xóa; giữ deal Nghĩa `LEAD-2026-1252` (VPT,
ĐANG SẢN XUẤT). Snapshot thùng rác `de7e69ed-3d13-4ff5-baed-7028e649a13e`.

Hoàn tác: khôi phục từ Thùng rác hoặc
`backend/uploads/_delete_deal_1518_rollback_1789024228487.json`.
Script: `backend/scripts/delete-dup-anh-tam-deal-1518.js`.

Còn bản đặt xưởng (không xóa): HCB `1398`/`1399`/`1511`, Phúc Đạt `1401` (Thua).

## Bộ lọc nhân viên Work Unified — chọn nhiều NV

Trạng thái: **local, đang vá số đếm khớp bảng.**

Đã push `71c5cc17` (checkbox `user_ids`). Vá tiếp: danh sách khi đang lọc
tải **đủ dòng** (không cắt 20/trang) nên thẻ «Đang thực hiện» = số dòng bảng.
Khớp NV theo **deal CRM**; sale/PM chỉ khi dự án không có deal (tránh đếm
dự án hiện tên NV khác). Chỉ lấy `crm_leads.type=deal`.

Hoàn tác: revert `management.js`, `workUnifiedUserFilter.js`,
`WorkUnifiedFilterFields.jsx`, `WorkUnifiedOverviewPage.jsx`.

## Anh Tám — chuyển Cửa Phúc Đạt về HCB Tủ bếp

Trạng thái: **đã chạy trên DB, script local chưa commit.**

`TB-2026-767` (Phúc Đạt · Cửa) hủy. Nguồn Metalla `TB-2026-740` đặt thêm
Hucabi · Tủ bếp → `TB-2026-827` / `DEAL-2026-1511`, cột Tiếp nhận, phụ trách
Sang Thiết Kế VPT 1. Deal clone Phúc Đạt `DEAL-2026-1401` → Thua.
Giữ HCB Cánh kính `TB-2026-765`.

Hoàn tác: khôi phục placement Phúc Đạt, `status=producing` cho `TB-2026-767`,
gỡ `TB-2026-827`. Script: `backend/scripts/reclassify-anh-tam-to-hcb-tu.js`.

## Bộ lọc nhân viên Work Unified — chọn nhiều NV

Trạng thái: **local, chưa commit — đã vá cột Người phụ trách.**

Tổng quan dự án lọc nhiều NV bằng checkbox. API nhận `user_ids` CSV.
Khớp theo **mọi deal gắn dự án** (không chỉ deal được pick), cột «Người phụ
trách» ưu tiên NV deal đang lọc (tránh hiện PM/xưởng như Hoàng Dương khi
đang lọc Vũ / Rốt Trần). Chip hiện từng tên NV.

Hoàn tác: revert `management.js`, `workUnifiedUserFilter.js`,
`WorkUnifiedFilterFields.jsx`, `WorkUnifiedOverviewPage.jsx`,
`WorkUnifiedProjectDetailPage.jsx`.

## Nhật ký hoạt động HST NextGo (đã vá)

Clone không mang log thật; 7.716 dòng «created» ở HST mới là do trigger sinh ra
khi clone (dồn về 21/08). Đã vá bằng `backend/scripts/fix-nextgo-history-log.js`:
chép 1.318 dòng thay đổi (xoá / đổi người / đổi trạng thái / hoàn thành / đổi
deadline) và trả lại thời điểm gốc cho 7.303 dòng «created». Log HST mới giờ
trải 12/06 → 09/09, số dòng mỗi loại ≥ công ty cũ. 1.002 `source_id` của bản ghi
đã xoá giữ nguyên id cũ (cột text, không phải khoá ngoại).

Hoàn tác: `node scripts/fix-nextgo-history-log.js --rollback=uploads/_nextgo_log_rollback_1788975783246.json`.

## Bù lịch sử trước mốc clone (đã xong)

`clone-nextgo-to-tenant.js` chỉ sao chép lead / khách hàng / dự án / việc /
thành viên, nên 625 deal trước 21/08 ở HST mới thiếu phần phụ. Đã bù bằng
`backend/scripts/copy-nextgo-history.js` (id mới, ánh xạ FK theo bản đồ clone,
việc CRM ghép theo lead + thời điểm tạo + tiêu đề — 6.566/6.587 khớp):
bình luận 2.414, tài liệu lead 386, tệp việc 385, giao việc 328, sự kiện 22,
snapshot báo cáo ngày 1.116, kế hoạch phòng ban 20, KPI ledger 1.622, điểm KPI
146 — khớp đúng bản dump. Không chép `trash_items` (97, thùng rác).
Kiểm tra: 0 bản ghi trỏ người dùng / việc ngoài HST NextGo.

Hoàn tác: `node scripts/copy-nextgo-history.js --rollback=uploads/_nextgo_history_rollback_1788974016467.json`
(và file `..._1788974138250.json` cho phần KPI bù sau).

## Chuyển delta NextGo về HST mới (đã xong)

Từ 21/08 (mốc clone) đến 09/09, NV NextGo vẫn làm trên công ty cũ ở HST mặc định
nên dữ liệu mới rơi vào đó. Đã chuyển bằng `backend/scripts/migrate-nextgo-delta.js`
(giữ nguyên id, chỉ ánh xạ lại FK theo `uploads/_nextgo_clone_id_map.json`):
141 deal, 150 khách hàng, 6 dự án, 1.738 việc CRM, 532 bình luận, 9 thành viên,
78 tệp việc, 6 sự kiện, 242 dòng KPI, 2.049 dòng lịch sử, 167 việc SX, 140 báo
cáo ngày. Sau khi chạy: công ty cũ còn 0 bản ghi sau mốc clone, HST mới 766 deal,
0 tham chiếu chéo HST (người dùng / pipeline / stage / khu vực / nguồn).

Hoàn tác: `node scripts/migrate-nextgo-delta.js --rollback=uploads/_nextgo_delta_rollback_1788973190866.json`.

Còn lại: chưa có lượt Facebook / Google Form nào chạy qua cấu hình HST mới để
kiểm chứng đầu-cuối (cần 1 tin nhắn FB có SĐT và 1 lượt submit form thật).

## Rà soát cách ly HST NextGo (đã xong)

Quét toàn bộ bảng có `company_id` và 84 khoá ngoại → HST `nextgo` chỉ có 1 công
ty, không có công ty/nhân sự HST khác. 7 tài khoản HST NextGo đăng nhập được,
chỉ thấy công ty + khu vực + lead NextGo (6 NV chưa tự đăng nhập lần nào).

Đã siết thêm: `/api/external/project-deadlines` và API key không gắn công ty
(`all_companies`) giờ chỉ đọc trong HST của chủ key (`tenant_company_ids`),
nên MCP «toàn quyền» không còn thấy công ty HST NextGo. HST mặc định giữ nguyên
phạm vi cũ (đã kiểm: 95 thông báo hạn, 5 công ty như trước).

Đã tắt 2 tài khoản test `saletest.ui@nextgo.vn`, `sanxuattest.ui@nextgo.vn`
(còn sống ở HST mặc định, `tenant_id` rỗng) và trả `created_by` của
`crm_referrers`/`drive_roots` NextGo về `quantri.hst@nextgo.vn`.

## Facebook + Google Form HST NextGo — chỉ cài đặt NextGo

Nguồn CRM / API key / form ngoài (`source_name=Google Form`) lọc theo tenant.
Key `NextGo NV Yến` đã gắn công ty HST mới (cùng token Apps Script).

## Facebook HST NextGo — chỉ cài đặt NextGo

Admin/NV tenant `nextgo` không còn thấy Page, auto pipeline, nguồn, bộ ảnh,
công tắc tổng hay auto-lead config của HST mặc định. Page phải gắn công ty
NextGo; auto-lead lưu `app_settings.auto_lead_config:<tenant_id>`.

## NextGo HST mới — đã đưa vào dùng (cùng app)

Tenant `nextgo` + công ty clone. Admin HST: `quantri.hst@nextgo.vn`.
6 NV đăng nhập email cũ → HST mới (bản cũ `+oldhst`, tắt, không xóa).
Fanpage gắn công ty HST mới. Webhook URL không đổi.
Dữ liệu HST mới = bản clone 21/08 + delta 21/08→09/09 đã chuyển về (xem mục trên).

## Sửa deadline thẻ CRM — lỗi «Lỗi lưu deadline»

Trạng thái: **đang harden thêm (local) — PATCH thành công không bị side-effect làm 500.**

`LeadInfoPanel.saveKanbanDeadline` gọi `setLead` (không có trong scope) sau khi
API thành công → alert generic dù hạn đã ghi DB. Đã bỏ `setLead`, reload qua
`onUpdate`. Backend bọc comment sau lưu; so sánh hạn theo timestamp.

## Ghim dự án góc phải (tối đa 20)

Trạng thái: **bổ sung CRM + VC/LĐ, đang gộp main.**

Nút **Ghim** trên chi tiết CRM (kể cả chưa có `project_id`). Menu thẻ Kanban
CRM / SX / VC-LĐ có **Ghim góc phải**. Chi tiết VC (`/vc/projects/:id`) đã có nút.

Nút **Ghim** trên chi tiết dự án: Work Unified, SX (`/sx/projects/:id`),
VC (`/vc/projects/:id`), tổng quan SX, CRM deal đã có `project_id`.
Danh sách góc phải (localStorage), giữ khi đổi trang; bấm mở lại đúng module;
bỏ ghim; ẩn/hiện. Tối đa 5. Widget hiện cả tài khoản CRM-only.

Đã kiểm trên TB-2026-538: ghim từ Work Unified → danh sách góc phải;
ẩn thành nút số; sang `/crm/dashboard` vẫn còn; bấm mở lại dự án.

## Nhật ký công trình — trang gom log + xuất Excel

## Nhật ký công trình — trang gom log + xuất Excel

Trạng thái: **đã commit, đang push.**

Trang `/management/project-logs`: tìm công trình, tab Tất cả / nhiệm vụ / phát sinh /
dự án / CRM / bình luận, lọc công ty / khu vực / nhân viên + ngày + nội dung, xuất Excel.
API `GET /api/management/project-logs` (route mới, không sửa `management.js`).
Lọc công ty/khu vực/NV: tìm CT (`work-unified/search`) và lọc log theo người thao tác.
Đã kiểm thử trên TB-2026-819: 105 dòng (70 nhiệm vụ, 8 CRM, 27 bình luận).

## Không gian chung — chọn vai trò thành viên khi tạo phát sinh

Trạng thái: **đã commit cùng nhật ký công trình.**

Form tạo/sửa phân công phát sinh (tab Không gian chung trên Dự án / CRM / SX / VC-LĐ
và modal Giao việc Không gian chung) chọn vai trò từng NV:
`primary` / `executor` / `observer` / `manager`. Gửi `assignee_roles` lên API
(backend đã hỗ trợ). Nút **Áp dụng** gán cùng vai trò cho mọi người đã chọn.

File: `frontend/src/lib/assignmentAssignRoles.js`,
`frontend/src/components/LeadMemberAssignmentsPanel.jsx`,
`frontend/src/pages/CRMAssignmentsPage.jsx`.

Chưa xác minh trình duyệt (dev server / phiên đăng nhập chưa mở).

## Tổng quan nhiệm vụ — tải công ty trước cho nhanh

Trạng thái: **đã sửa local, chưa commit.**

`/management/project-tasks` prefetch `/companies` từ sidebar, tự chọn công ty
(mặc định CRM / công ty đăng nhập), rồi mới gọi `GET /work-tasks/project-overview?company_id=`.
Admin hệ thống có thể đổi công ty trên header; không còn tải hết mọi công ty lúc mở trang.

## Tổng quan nhiệm vụ — thẻ SX lấy người chịu trách nhiệm sản xuất

Khi dự án chưa có `production_person_id` và staff xưởng chỉ admin hệ thống, fallback
`production_handover_settings.responsible_user_id` (Phúc Đạt: Minh sản xuất cửa).

## Tổng quan nhiệm vụ — không hiện admin hệ thống trên thẻ SX

TB-2026-029 (CHÚ ĐẠT TÂN PHÚ): không có `production_person_id`, staff xưởng chỉ
Trương Trọng Thành → fallback hiện TT. Đã bỏ admin hệ thống khỏi phụ trách mặc định.

## Tổng quan nhiệm vụ — việc PS không dính cột Sản xuất

Trạng thái: **đã sửa local, chưa commit.**

`crm_tasks` Không gian chung (`shared_workspace` / `sx_shared` / `vc_shared`) từng lấy
`pipeline_stage_id` của deal (vd. «Sản xuất.») nên người được giao việc PS hiện trên
thẻ Sản xuất (TB-2026-738). Nay tách thành danh mục «Không gian chung».

## 2026-09-08 16:20 — Commit + push WIP còn lại trong ngày

## Đã commit + push phần WIP còn lại (16:20)

Nhánh `feat/project-phat-sinh-report`. Gom phần chưa commit của hôm nay:
đồng bộ deadline, sửa query-guard, tổng quan nhiệm vụ, tài liệu bàn giao.

Không commit: `.idea`, upload, `_to_delete`, log/ảnh tạm, SQL trùng số trên
`main` (`400`–`402`, `580_clear_all_project_deadlines_*`). Migration 596
vẫn **chặn phát hành** — xem mục dưới.

## Không gian chung — admin hệ thống sửa/xóa việc người khác

Trạng thái: **đã commit trên `feat/project-phat-sinh-report`.**

Người tạo vẫn sửa/xóa được việc của mình. Admin hệ thống (role `admin`, không
`company_id` — gồm Trương Trọng Thành) sửa/xóa được việc người khác trên
Không gian chung và bảng Giao việc. Admin/sales_admin gắn công ty chỉ trong
phạm vi `company_id` / `executor_company_id`. NV thường không thấy nút Sửa/Xóa
trên việc không phải của mình.

## Lỗi query-guard / 42703 trên tổng quan dự án — Claude lên kế hoạch sửa

Trạng thái: **đã ghi nhận, chưa sửa code.**

Tab tổng quan deal (`GET /api/management/deals?...&all=1500`) trả ~50 byte vì
`column crm_leads.budget does not exist` (42703). Đo DB: `crm_leads` không có
`budget` lẫn `deadline`; có `estimated_value`, `kanban_deadline_at`,
`expected_close_date`.

Báo cáo + kế hoạch 7 bước: [`BAO-CAO-loi-query-guard-2026-09-08.md`](./BAO-CAO-loi-query-guard-2026-09-08.md).

`routes/management.js` là vùng dùng chung — ghi `WORKLOG.md` trước khi sửa.

## Trang phát sinh module Dự án

Trạng thái: commit `4877842c` trên `feat/project-phat-sinh-report`; đang đẩy lên `main`.
Working tree local vẫn còn các thay đổi khác (deadline, tổng quan nhiệm vụ) chưa commit.

## Đồng bộ deadline CRM, Sản xuất và VC-LĐ

Trạng thái: đã triển khai code và kiểm thử cục bộ; migration chưa được xác nhận đã áp dụng
lên Supabase production.

### Chính sách đã thống nhất

- CRM: nhiệm vụ mở của cột hiện tại → hạn Kanban → SLA → ngày dự kiến chốt.
- Sản xuất: hạn Kanban SX → ngày hoàn thành SX → hạn SX → ngày giao → hạn dự án.
- VC-LĐ: ngày lắp → ngày giao → hạn dự án.
- Hoàn thành một module chỉ tắt deadline thuộc module đó.
- Hoàn thành dự án cuối tại bước lắp đặt mới xóa các deadline còn mở của toàn dự án.
- Trường ngày không có giờ được quy đổi theo giờ kết thúc làm việc của công ty tại múi giờ
  `Asia/Ho_Chi_Minh`.

### File chính

- `backend/src/helpers/moduleDeadlinePolicy.js`
- `backend/src/helpers/clearCompletedProjectDeadlines.js`
- `backend/src/helpers/completeOpenWorkOnModuleDone.js`
- `backend/src/routes/production.js`
- `backend/src/routes/logistics.js`
- `backend/src/routes/management.js`
- `backend/src/routes/crm/routes/leadLifecycle.js`
- `backend/src/helpers/projectModuleCompanies.js`
- `backend/src/helpers/vcOverviewKpis.js`
- `frontend/src/lib/moduleDeadlinePolicy.js`
- `frontend/src/lib/crmLeadDeadlineDisplay.js`
- `frontend/src/lib/sxPipelineRevenue.js`
- `frontend/src/components/LogisticsViews.jsx`
- `database/596_unified_module_deadline_policy.sql`
- `backend/tests/module-deadline-policy.test.js`

### Đã kiểm thử

- Kiểm thử trình duyệt CRM với bản ghi `LEAD-6666`: đổi hạn 21/09 → 22/09,
  thẻ Kanban cập nhật ngay và view Deadline hiển thị `Hạn: 22/9/2026`.
- Đã hoàn tác bản ghi thử về 21/09 và xác nhận trực tiếp trong DB.
- Đã sửa lỗi API PATCH trả 404 do PostgREST không xác định được quan hệ
  `crm_leads` → `crm_pipeline_stages`; join hiện dùng FK rõ ràng.
- `node --check src/routes/crm/routes/leadLifecycle.js` — đạt.
- `node --check src/routes/management.js`
- `node tests/module-deadline-policy.test.js` — đạt.
- `git diff --check -- backend/src/routes/management.js database/596_unified_module_deadline_policy.sql` — đạt.
- IDE không báo lỗi lint mới trên `backend/src/routes/management.js`.

## Đã sửa 5 lỗi query-guard (Claude, 22:58) — chờ anh restart backend xác minh

Nguồn: [`BAO-CAO-loi-query-guard-2026-09-08.md`](./BAO-CAO-loi-query-guard-2026-09-08.md) của Cursor.
Số của Cursor kiểm chứng lại trên prod: **đúng hết**, hai chỗ nặng hơn (41 user >1.000 thông báo,
cao nhất 9.503; wonIds thực tế 713+525 id).

- P0 `GET /management/deals` trả HTTP 500 — `crm_leads.budget`/`deadline` không tồn tại. **Đã sửa.**
- P1 `.in('id', wonIds)` vượt mốc gãy URL — **đã chia lô**, không đổi phạm vi «won».
- P1 2.213 task active bị cắt ở 1.000 dòng — **đã phân trang**.
- P2 badge thông báo (nhánh dự phòng) — **đã phân trang**.
- P2 guard không có site cho `.rpc()` — **đã bọc**, nhãn thành `rpc:<tên hàm>`.
- Bonus: `audit/audit.py` nay lần theo `.select(BIẾN)` — đúng lỗ đã để lọt lỗi P0.

**Cần anh B.A**: restart backend local, mở lại tab tổng quan module Dự án. Kỳ vọng 200 thay vì
500; sau 15 phút bảng query-guard không còn `COT-KHONG-TON-TAI crm_leads` và
`FILTER-ID-QUA-DAI projects`.

`routes/management.js` đã trả lại vùng dùng chung.

## Phân công hai bên: [`HANDOFF-2026-09-08-phan-cong.md`](./HANDOFF-2026-09-08-phan-cong.md)

Có ranh giới file, mã dán sẵn cho 3 điểm chặn của 596, và thứ tự chạy 8 bước.
Hai file `routes/management.js` và `routes/logistics.js` là **vùng dùng chung** —
ghi `WORKLOG.md` TRƯỚC khi sửa.

## CHẶN PHÁT HÀNH — migration 596 cần sửa 1 dòng

Rà soát 2026-09-08 22:05 (Claude): `project_deadline_board` gọi `project_deadline_at(p)`,
mà 596 định nghĩa lại hàm đó thành chuỗi **Sản xuất** (không có `install_date`).
Đo trên 671 dự án đang chạy: **86 dự án trên bảng VC mất hạn**, **114 dự án sai hạn**.
Sửa thành `project_module_deadline_at(p, 'logistics')` trước khi áp.

Kèm 2 việc chặn khác: thu quyền `EXECUTE` của 4 hàm mới khỏi `anon`, và tạo
`596_rollback.sql` trước khi chạy. Chi tiết + số đo: [`REVIEW-596-deadline.md`](./REVIEW-596-deadline.md).

### Cần xác nhận trước khi phát hành

- Rà soát SQL migration 596 trên môi trường thử nghiệm trước khi chạy production.
- Tiếp tục kiểm thử tích hợp và hồi quy giao diện SX/VC-LĐ với dữ liệu thật.
- Xác nhận cache/socket cập nhật đúng khi đổi deadline từ một màn hình và quan sát ở màn hình khác.
- Không tự ý commit các file tạm, upload, lock hoặc thay đổi `.idea` đang tồn tại trong working tree.
## 2026-10-08 — P1-11: kiểm phạm vi quảng cáo (local)

`/summary` đối chiếu ad ID qua chi tiêu/danh mục của account trong scope, trả `scope_check`, hai chi phí mốc và độ tin cậy; snapshots có hai số phạm vi. UI cảnh báo và liệt kê tối đa 10 quảng cáo ngoài phạm vi.
233 test tổng hợp P1/adAnalytics/mốc/chi tiêu đạt; `node --check` đạt. `vite build` chưa chạy được vì thiếu `cross-env` tại máy; chưa kiểm DB/HTTP/dữ liệu thật hay duyệt UI. Không chạy SQL, bật cờ, commit hoặc push. Hoàn tác: bỏ diff P1-11 và hai mục bàn giao này.

---
