## 04/10/2026 — Màn hình mức sử dụng AI đã qua kiểm chứng

SQL696/API/tab Chi phí AI tại f7237b6 đọc toàn công ty, gồm Agent; tổng và trang chi tiết cùng snapshot, có hàng chờ AUTHORIZED/UNKNOWN tại server. Node18/22 mỗi bản 1.406 PASS/0 fail/0 skip; PostgreSQL 498/0/0 gồm 9 ca mới; cả 10 job, build, report và Messenger SUCCESS, đúng CI tree/parents. Reviewer độc lập đối chiếu published blobs/log/tree và PASS checkpoint. Browser actual Workspace/API giả do bên triển khai kiểm tổng, queue, 403 và đổi phạm vi. [Phạm vi, bằng chứng và hoàn tác](vpt-marketing-automation/CARE_INFERENCE_COST_CONSOLE.md).

Tiếp theo: khép đối soát mức dùng AI và lượt chưa rõ kết quả; xác nhận nội dung tư vấn, người nhận, lịch khảo sát, tài khoản/model và hạn mức AI; kiểm chuyển luồng/khôi phục; UAT toàn tuyến Facebook → CRM → AI → lịch → dashboard, rồi trình Founder gói phát hành. Câu hỏi cấu hình đã gửi vẫn chờ trả lời, không tự chọn người hoặc mở quyền. PASS phần này không thay UAT. Chi phí thực vẫn chưa xác định khi chưa có hóa đơn; không hoàn reservation hoặc mở UNKNOWN. Full goal ACTIVE, chưa chạy thật hoặc chứng minh 250.000 đồng/khách hợp lệ; trần 100 triệu/30 ngày và phân vùng 80/20 không đổi.

---

## 04/10/2026 — Giao diện theo dõi AI đã qua nghiệm thu kỹ thuật

Bản411e895 thêm tab Hoạt động AI, tách kết quả tư vấn/ACK–echo/lịch đã đặt; đóng RUNNING giữ cùng yêu cầu qua mất ACK/reload. Node18/22 mỗi1.398PASS/0fail/0skip, PostgreSQL489/0/0, cả10job/build/report/Messenger SUCCESS, đúng CI tree/parents. Reviewer độc lập đối chiếu published blobs/log/tree và PASS checkpointUI. Browser actualWorkspace/APIgiả do bên triển khai kiểm scope, stale, SURVEY/BOOKED và mất ACK. [Bằng chứng và hoàn tác](vpt-marketing-automation/CARE_RUNTIME_CONSOLE.md). Không SQL/backend mới hoặc mở quyền. Full goal ACTIVE; còn chi phí AI/biên nhận UNKNOWN, cấu hình, inventory/chuyển luồng, UAT và Founder release; chưa chạy thật hoặc chứng minh250k.

---

## 04/10/2026 — AI đề xuất lịch khảo sát đã qua kiểm chứng

SQL695 nối quyền Agent riêng với lịch CRM, đề xuất và signed customer confirmation, booking/outcome/handoff. Bản e91381a đạt Node18/22 mỗi bản1.388/0/0; PostgreSQL489/0/0 gồm20ca mới; cả10job/build/report/Messenger SUCCESS, đúng tree/parents. Reviewer độc lập xác minh published blobs/log/tree và PASS checkpoint. Đã sửa guard human, qualifier và lọc staff trước limit200. [Hợp đồng, bằng chứng và hoàn tác](vpt-marketing-automation/CARE_SURVEY_RUNTIME.md). Chưa enrollment/provider/DB thật/phát hành. Full goal ACTIVE; còn UI runtime/ngoại lệ, cấu hình, chuyển luồng và UAT.

---

## 04/10/2026 — Gửi câu tư vấn đã đạt kiểm thử tích hợp

SQL694/worker thêm quyền gửi riêng theo Agent/grant/phiên bản câu, lease tối đa5giây và hạn publisher, payload một lần, receipt/echo và barrier dùng chung với survey/outcome. Bản kiểm a388433: Node18/22 mỗi bản1.385/0/0, PostgreSQL469/0/0 gồm21ca mới; cả10job/build/report/Messenger SUCCESS, đúng CI tree/parents. Reviewer độc lập đối chiếu published blobs/log/tree và PASS checkpoint. Không Meta thật/enrollment/phát hành. [Hợp đồng, bằng chứng và hoàn tác](vpt-marketing-automation/CARE_ANSWER_DELIVERY.md). Full goal ACTIVE; còn lịch tự động, UI/ngoại lệ, cấu hình và UAT.

Các lỗi alias/recovery đã sửa; fixture câu dài tạo/duyệt đúng câu2001ký tự mô hình chọn và giữ yêu cầu HELD. Không dùng bản CI lỗi trước đó làm bằng chứng PASS.

---

## 04/10/2026 — Worker tư vấn danh tính riêng đã qua kiểm chứng

Runtime `05d657e`, bản kiểm `65b8c7b`: Node18/22 mỗi bản1.374/0/0, PostgreSQL448/0/0 gồm26ca runtime; cả10job/build/report/Messenger SUCCESS, đúng CI tree/parents. Bản kiểm sửa hai lỗi harness/fixture từ CI đầu373/49, giữ nguyên guard và chạy hồi quy trên facade692 cuối. Reviewer độc lập đối chiếu published blobs/log/tree và PASS checkpoint đúng bản cuối.

SQL692/693 tách luật private dùng chung và facade runtime theo Agent/grant riêng; worker mặc định tắt. Tạo draft có nguồn, bàn giao ngoại lệ và dừng khi tiếp quản/opt-out. API lịch sử/đóng run giữ usage, không retry/refund. [Phạm vi, kiểm chứng và hoàn tác](vpt-marketing-automation/CARE_RUNTIME.md).

Full goal ACTIVE. Chưa quyền/gọi AI thật, gửi khách, tự đề xuất lịch, UI runtime hoặc UAT/phát hành.

---

## 04/10/2026 — Hạn mức gọi AI đã qua kiểm thử tích hợp

Router gắn OpenAI Responses adapter mặc định tắt, dedicated key và policy private bắt buộc; SQL691 giữ chỗ lượt gọi theo công ty/actor/key/model/kỳ, chặn lặp và UNKNOWN, lưu usage trước draft. Runtime cc5e6a9: Node18/22 mỗi bản 1.361/0/0; PostgreSQL 422/0/0 gồm 13 ca mới, cả 10 job/build/report/Messenger SUCCESS. CI merge đúng tree/parents; reviewer độc lập đã xác minh published blobs/log và PASS checkpoint. Reservation là dự phòng, actualCostVnd chưa biết, không thay hóa đơn hoặc giới hạn provider. Migration không enrollment/key/model mặc định. [Hợp đồng, bằng chứng và hoàn tác](vpt-marketing-automation/CARE_OPENAI_INFERENCE.md).

Full goal ACTIVE: còn cấu hình được duyệt, quyền runtime, chất lượng thật, worker/gửi, lịch/người nhận, chi phí/dashboard và UAT/Founder release. Chưa gọi AI/Meta/CRM thật, chi quảng cáo hoặc mở quyền.

---

## 04/10/2026 — Màn hình tư vấn và hủy lượt đã qua kiểm chứng

SQL690/API/CareAdvisor bổ sung lịch sử theo actor/company/thread, kết quả có nguồn và dấu hủy chặn BEGIN/RETRY/FINISH muộn. Sửa finding giữ draft khi chuyển tab thư viện; quay lại phải đọc mới. Runtime4b4cdc5: Node18/22 mỗi bản1.349/0/0, PostgreSQL409/0/0 gồm16ca mới; cả10job/build/report/Messenger SUCCESS. Browser actual Workspace/API giả đã kiểm thu hồi nguồn, mất phản hồi/reload/cancel và đổi phạm vi. Reviewer độc lập đối chiếu published blobs/log/tree và PASS checkpoint. [Hợp đồng, kiểm chứng và hoàn tác](vpt-marketing-automation/CARE_ADVISOR_CONSOLE.md).

Full goal ACTIVE. Router chưa provider, không AI thật hoặc gửi khách; còn quyền/chi phí runtime, chất lượng, lịch/người nhận, chuyển luồng/khôi phục, UAT và Founder release. Chỉ tiêu 250k/khách hợp lệ và hạn mức 100 triệu không đổi.

---

## 04/10/2026 — Bản nháp tư vấn đã qua PostgreSQL và review độc lập

SQL689/Application Service đọc hội thoại và thư viện đã duyệt, chọn nguyên văn câu trả lời và lưu nhu cầu kèm trích dẫn chưa xác minh; kiểm lại quyền, nguồn và trạng thái khách trước lưu. BEGIN một lần gọi, đọc/đóng/retry tường minh giữ audit; không ghi Backup khi Primary đổi. Router chưa gắn provider, cờ mặc định tắt, send=false.

Bản kiểm73a7824 (runtime56d424f): Node18/22 mỗi bản1.336/0/0; PostgreSQL393/0/0 gồm22ca advisor, cả10job/build/report/Messenger SUCCESS. Ca chờ khóa có observer; review độc lập PASS sau đối chiếu published blobs/log CI. [Hợp đồng, bằng chứng và hoàn tác](vpt-marketing-automation/CARE_ADVISOR_DRAFTS.md).

Full goal ACTIVE. Còn provider/key/chi phí/quyền runtime, giao diện/worker/gửi và chất lượng AI; hội thoại dài, cấu hình khảo sát, chuyển luồng/khôi phục còn thiếu, UAT và Founder release. Chưa dữ liệu thật, model call, chi quảng cáo hoặc kết quả250k.

---

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

## 04/10/2026 — Bảo trì đường ghi cũ đã qua PostgreSQL

SQL687 bổ sung hold private, mặc định tắt, chặn toàn bộ DML/TRUNCATE trên 18 bảng gốc và FK descendants. Bản kiểm9ecbec4: PostgreSQL348/0/0 gồm13 ca mới, Node22=1228/0/0, cả10 job/build/report/Messenger SUCCESS. Đã sửa fixture để kiểm SET NULL riêng, log xác nhận nhánh thật. Reviewer độc lập đã đối chiếu published blobs/log CI và kết luận PASS checkpoint maintenance. Hold áp dụng mọi công ty trong manifest; cài migration yêu cầu ghi READ COMMITTED cả khi inactive. Không đổi UNKNOWN/claim hoặc coi process đã dừng.

[Phạm vi, inventory tiến trình, kiểm chứng và hoàn tác](vpt-marketing-automation/LEGACY_WRITE_HOLD.md). Còn dừng/drain mọi writer/tác động ngoài DB và đối soát UNKNOWN, AI/lịch/người nhận, UAT và Founder release. Chưa áp DB thật, bật hold, phát hành hoặc chứng minh 250k. Full goal ACTIVE.

---

## 04/10/2026 — Dừng lượt nhận khách đã qua PostgreSQL và review

Runtimee7d35d1 SQL686/API/UI lưu STOP/tombstone, chặnBEGINmuộn và thu hồi token. Chỉ hủy phần chưa bắt đầu; UNKNOWNgiữclaim. UI giữintentSTOPqua reload/tabkhác, xác nhận đúnglượt. Local/Node22=1228/0/0; PostgreSQL335/0/0 gồm12ca mới; cả10job/build/report/MessengerSUCCESS. Review độc lậpPASS checkpoint sau đối chiếu publishedblobs/logCI; browserthật/APIgiả kiểm mấtphảnhồi/reload vàUNKNOWN+CANCELLED.

[Hợp đồng, kiểm chứng và hoàn tác](vpt-marketing-automation/LEGACY_BATCH_STOP.md). Full goal ACTIVE; còn fence/drain/đốisoátUNKNOWN, AI/lịch/người nhận/phạmviđo, UAT/Founderrelease. Chưa DB thật/phát hành hoặc kết quả250k. Các mục dưới giữ lịch sử.

---

## 04/10/2026 — Rà khách trùng đã qua PostgreSQL và review độc lập

Runtime4df166 thay Facebook dedup cũ bằng reader CRM toàn công ty; hai caller và UI chỉ rà, đường xóa cũ409. SQL685 chặn company NULL/false. Local/Node22=1198/0/0; identityPG35/0/0 gồm8ca mới; intake323/0/0 và cả10job/build/report/MessengerSUCCESS. Review độc lập PASS đúng checkpoint sau đối chiếu published blobs/log CI; browser component thật/API giả kiểm lỗi, A→B→A và link đúng tabquality.

[Hợp đồng, kiểm chứng và hoàn tác](vpt-marketing-automation/LEGACY_DUPLICATE_REVIEW.md). Bước tiếp: dừng/chờ/đối soát writer cũ và các lượt chưa rõ kết quả → cấu hình AI/lịch/người nhận → UAT và Founder release. Full goal ACTIVE; chưa DB thật/phát hành hoặc kết quả250k thực tế. Các mục dưới giữ lịch sử.

---

## 04/10/2026 — Nhật ký xử lý khách đã qua PostgreSQL và browser giả

Runtime7b455b9 SQL684/API/UI lưu yêu cầu batch và kết quả từng contact, chặn dispatch lặp; reload chỉ đọc, hồ sơ chưa rõ giữ lại để đối soát. RESULT cuối khép cùng giao dịch, không treo nếu FINISH mất phản hồi. Local294/0/0; PostgreSQL323/0/0 gồm16ca mới; cả10job/build/report/MessengerSUCCESS. Review độc lập PASS SQL684/helper/API/UI sau đối chiếu published SQL/log CI; browser component thật/API giả kiểm mất phản hồi, reload, UNKNOWN, thu hồi quyền và đổi công ty. Lỗi cú pháp CASE phát hiện ở CI27b17f đã sửa và kiểm lại toàn suite. [Hợp đồng, bằng chứng và giới hạn](vpt-marketing-automation/LEGACY_BATCH_JOURNAL.md).

Full goal ACTIVE; journal chưa khóa mọi writer cũ hoặc làm creator nguyên tử. Còn dừng/chờ/đối soát, AI/lịch/người nhận/phạm vi đo và UAT/Founder release. Chưa DB thật/phát hành hoặc đạt250k thực tế. Các mục dưới giữ lịch sử.

---

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

# Hiện hành 04/10/2026 — Checkpoint quyền CRM đã qua PostgreSQL

Runtime `2cac0949aa78bb5d281f580c55c9dfe1171e6101` kiểm actor và toàn bộ hồ sơ gộp bằng quyền hiện hành; chặn gộp Customer khác nhau chưa đủ phạm vi. Cleanup không tự xóa các cơ hội cùng khách hàng. Local 50 ca mới + 67 regression = 117/0/0; PostgreSQL 271/0/0 gồm 7 ca mới; Node22 843+26+117, cả 10 job, build/report/Messenger SUCCESS. CI merge tree khớp runtime. Reviewer độc lập đã đối chiếu published blobs và log CI, kết luận PASS đúng phạm vi quyền/cleanup.

[Phạm vi, bằng chứng và findings còn mở](vpt-marketing-automation/LEGACY_CRM_MERGE_REPAIR.md). **CRM merge chưa READY**: còn giao dịch nguyên tử, receipt, bảo toàn task/tệp/chat/quyền/tiền/Project/attribution và Customer command đầy đủ. Tiếp tục khép phần này, creator company và cutover; sau đó cấu hình/nghiệm thu toàn tuyến, Founder release. Full goal ACTIVE; chưa DB thật, model/provider, chi quảng cáo hoặc phát hành.

---

## Hiện hành 04/10/2026 — Đang khép quyền gộp CRM; bảo toàn lịch sử còn mở

Bản làm việc trên baseline7cc7cb2 thêm kiểm actor/quyền hiện hành trên toàn bộ Lead giữ/xóa, khóa company/tenant/region, kiểm cờ xóa pipeline và chặn gộp Customer khác nhau chưa có phạm vi đầy đủ. Cleanup không còn tự xóa chỉ vì chung Customer: đọc một công ty có giới hạn, trả yêu cầu đối soát với0thay đổi. Local50ca mới+67regression=117/0/0;7ca PostgreSQL bổ sung chưa có kết quả CI ở checkpoint này.

Reviewer phát hiện mất task/tệp/chat/quyền/tiền/Project/attribution trong thân merge cũ. **CRM merge chưa READY, cutover HOLD**; kiểm quyền không chứng minh giao dịch nguyên tử hoặc bảo toàn dữ liệu. [Phạm vi, findings, kiểm thử và bước triển khai](vpt-marketing-automation/LEGACY_CRM_MERGE_REPAIR.md). Full goal ACTIVE; không DB thật/model/provider/chi quảng cáo/phát hành. Các mục dưới là lịch sử.

---
## Hiện hành 04/10/2026 — Đường quét điện thoại đã qua kiểm thử cô lập

Runtime `119491e`, bản kiểm/test fix `5a3acc6` khóa phạm vi công ty/Page hiện hành, giới hạn final round theo Lead đã chọn, kiểm lỗi DB và chặn đối soát khi Graph/MID/lịch sử chưa hoàn tất. Review độc lập PASS phạm vi phone sau đối chiếu blob/log CI; local77/0/0; PostgreSQL264/0/0 gồm6ca mới; census88+HTTP1, Node22 843+26+67 và cả10job/build/report/Messenger SUCCESS. CImerge tree đúng bản kiểm. Ca211 cũ được sửa theo baseline→tăng1 sau xác minh nền fixture theo ngày; giữ assertion quyền/ẩn dữ liệu, runtime không đổi.

[Phạm vi, bằng chứng và hoàn tác](vpt-marketing-automation/LEGACY_PHONE_REPAIR.md). CRM merge/cleanup và tạo Lead/Customer đúng công ty còn OPEN; cutover, dừng/chờ đường cũ, đối soát/khôi phục, AI/lịch/người nhận/phạm vi đo và UAT/Founder release vẫn còn. Full goal ACTIVE, chưa tác động hệ thống thật hoặc có kết quả250k thực tế. Các mục dưới là lịch sử.

---

## Hiện hành 03/10/2026 — Rà toàn bộ đường cũ còn yêu cầu sửa

Founder hỏi bước tiếp. Ưu tiên vẫn là Facebook → CRM → khảo sát → dashboard, mục tiêu tạm thời 250.000 đồng/khách hợp lệ. Không mở kênh hoặc giai đoạn lớn mới từ lần kiểm trạng thái này.

Reviewer độc lập kết luận **CHANGES_REQUESTED cho việc chuyển Page** trên baseline `a972c03`: còn vòng trích số điện thoại/đồng bộ cuối ghi ngoài phạm vi đã kiểm; một số route quét/chất lượng số điện thoại và CRM merge/cleanup thiếu quyền trên hồ sơ đích; lỗi đọc tin nhắn có thể bị hiểu là không có số rồi cleanup; gộp hồ sơ có bước chuyển liên kết bỏ qua lỗi trước khi xóa nguồn. PASS SQL682 bên dưới chỉ áp dụng phạm vi đã kiểm, không thay kết luận này. Chưa xác minh các timer đang bật trong môi trường thật.

Bản sửa local chưa commit gồm `facebookInboundPhoneReconcile.js`, `facebookLegacyContactWrites.js` và `routes/facebook.js`: thêm kiểm trước quét/đối soát, kiểm lỗi đọc/ghi và dừng ghi trạng thái đồng bộ khi thất bại. Kiểm lại 43 ca hiện có (scope + webhook recovery + intake integration), cú pháp 3 file và diff check đều PASS; **chưa có đủ ca mới, PostgreSQL hoặc review kết luận cho delta này**. Đường gọi tiếp tục trích/xóa sau Graph lỗi và các finding trên vẫn phải khép; không coi bản sửa local đã hoàn tất.

Tiếp theo: khép kiểm quyền/phạm vi và lỗi đọc/ghi của các đường này → kiểm độc lập và phương án dừng/chờ đường cũ → hoàn thiện cấu hình AI/lịch/người nhận/phạm vi đo → nghiệm thu trọn tuyến và trình Founder gói phát hành. **HOLD vận hành thật**; chưa chứng minh chi phí 250.000 đồng bằng dữ liệu thật. Full goal ACTIVE; chưa đổi DB thật, quyền AI, ngân sách hoặc phát hành.

---

## Hiện hành 03/10/2026 — Preflight đường ghi cũ đã qua PostgreSQL

Runtime9cdfe7d/treeaf25883 bổ sung SQL682/helper kiểm phạm vi trước mutation, kiểm lại target vừa tìm được và dừng cleanup khi lỗi đọc/count. Đã khép hai finding P1/P2 về mã và kiểm cả lịch sử comment. Local43/0/0; PostgreSQL258/0/0 gồm14ca mới; census88+HTTP1, Node22 843+26+33, cả10job/build/report/Messenger SUCCESS. CImerge tree khớp runtime; reviewer độc lập PASS phạm vi preflight/SQL682 sau đối chiếu blob/log CI. [Bằng chứng](vpt-marketing-automation/LEGACY_WRITE_PREFLIGHT_REVIEW.md).

[Phạm vi và bước tiếp](vpt-marketing-automation/LEGACY_WRITE_PREFLIGHT.md). Preflight không giữ giao dịch xuyên HTTP; cutover vẫn HOLD, còn kiểm toàn bộ caller, dừng/chờ đường cũ và đối soát/khôi phục trước enrollment. Sau đó khép cấu hình AI/lịch/người nhận/phạm vi đo và nghiệm thu toàn tuyến Facebook→CRM→khảo sát→dashboard, trình Founder gói phát hành. Full goal ACTIVE; chưa DB thật/phát hành hoặc kết quả250k thực tế.

---

## Hiện hành 03/10/2026 — Giao diện đối chiếu khách đã kiểm chứng

Runtime8f42595 bổ sung SQL681/API/UI tìm hồ sơ, xác nhận bằng chứng và đóng yêu cầu chưa rõ kết quả. LINK/CLOSE giữ nguyên yêu cầu qua reload; đóng trước thì chặn lệnh đến muộn, đã ghi thì giữ liên kết. Hai P2 tenant cảhaiNULL và mapping một phần/mâu thuẫn đã khép.

Local26, PostgreSQL244/0/0 (11ca mới), census88+HTTP1, Node22 843+26 PASS, cả10job/build/report/Messenger SUCCESS. Reviewer độc lập PASS SQL681/API/UI; browser component thật/API giả kiểm mất phản hồi, reload, CLOSE, quyền và phản hồi muộn. [Bằng chứng](vpt-marketing-automation/CARE_CONNECTION_CONSOLE_REVIEW.md), [hợp đồng và bản đồ đường ghi cũ](vpt-marketing-automation/CARE_CONNECTION_CONSOLE.md).

Full goal ACTIVE. Tiếp theo chuyển các đường gọi cũ trước enrollment, đối soát/khôi phục và khép AI/lịch/người nhận/phạm vi đo, rồi UAT/Founder release trước mở kênh tiếp. Chưa dữ liệu thật đạt250k hoặc phát hành. Các mục dưới là lịch sử.

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

## Hiện hành 03/10/2026 — Đã nối khảo sát và việc chờ theo nhóm quảng cáo

Bản3f8a565 nối nhóm khách trả phí với chăm sóc/lịch hiện hành trong cùng snapshot. Lịch sau kỳ vẫn giữ; tổng khách cần xử lý loại trùng cả việc chờ xác minh, chưa nối chăm sóc và bàn giao khảo sát. STOP không tự mở lại; hồ sơ chưa quy thuộc hiển thị riêng.

Local20 ca mới/44 ca liên quan, PostgreSQL214/0/0 (6 ca mới), Node22 828/0/0 và cả10 job/build/report/Messenger SUCCESS. Reviewer mã PASS; browser component thật/API giả đã kiểm lỗi nguồn, STOP, phản hồi cũ và lỗi report cha. [Bằng chứng đúng phiên bản](vpt-marketing-automation/COHORT_OPERATIONS_REVIEW.md), [hợp đồng/hoàn tác](vpt-marketing-automation/COHORT_OPERATIONS.md).

Full goal ACTIVE. Còn UI xử lý đề xuất/gửi lịch và ngoại lệ, điểm nhận/kênh khác, cấu hình AI/lịch/người nhận, UAT và Founder release. Chưa dữ liệu thật đạt250k hoặc phát hành. Các mục dưới giữ lịch sử.

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

## Hiện hành 03/10/2026 — Đối soát bản xuất nguồn đã kiểm chứng

Runtime920e66bc nối SQL674/API/UI để so CSV với tập mã/time/form đã quét đúng kỳ, giữ bằng chứng và audit bất biến. Dòng ngoài kỳ/trùng/mâu thuẫn/rỗng có trạng thái riêng; receipt mới hoặc nguồn đổi làm trạng thái cần rà lại. Server hash bytes và loại cột PII trước DB; UI giữ metadata/hash để retry và phân biệt biên nhận lịch sử với kết quả hiện hành.

Review độc lập PASS; local24, PostgreSQL60/0/0 (10ca mới), HTTP1/0/0, Node22 745/0/0, cả10job/fullbuild/report/Messenger SUCCESS. Browser component thật/API giả kiểm tệp, mất phản hồi, reload, stale, exact retry và lỗi nguồn. [Bằng chứng đúng phiên bản](vpt-marketing-automation/SOURCE_EXPORT_REVIEW.md), [hợp đồng/hoàn tác](vpt-marketing-automation/SOURCE_EXPORT.md).

Full goal ACTIVE. Kế tiếp hoàn thiện provenance/phạm vi thực và bản chốt phép đo với spend/identity/qualification/attribution/asOf; fingerprint hiện bảo thủ cần tinh chỉnh. Nối các nguồn khác, hoàn thiện ngoại lệ vận hành, UAT và trình Founder phát hành. MATCHED không chứng nhận đủ nguồn, đạt250k hoặc mở chi. Các mục dưới giữ lịch sử.

---

## 2026-10-03 — Source export: kiểm biên nhận lịch sử và giới hạn HTTP

Candidate36793fbc cả10jobSUCCESS, censusPG59/0/0, Node22 743/0/0, frontend10.318module. Review backend/SQLPASS. Follow-up: UI ghi rõ biên nhận sau replay là lịch sử, reset đọc tệp khi reload; thêm kiểm Express2mb nhận CSV1MiB và từ chối thêm1byte, thêm barrier PG khi receipt tới sau comparison nhưng trước append. Local24PASS; browser lost-response→reload→stale đang kiểm. Chưa phát hành/đủnguồn/CPQL, full goalACTIVE.

---

## 2026-10-03 — Đối soát bản xuất nguồn đang kiểm chứng

SQL674 nối witness và digest tuple đúng cutoff vào snapshot, thêm so sánh CSV nguồn với tập quét theo ID/time/form, append-only evidence+audit, replay và invalidation khi receipt/source/phạm vi đổi. Server hash bytes, bỏ cột PII trước DB; UI chỉ giữmetadata/hash để retry. Local22 PASS; đang chờ PostgreSQL/browser/review. [Hợp đồng/hoàn tác](vpt-marketing-automation/SOURCE_EXPORT.md). MATCHED không là completeness/CPQL/quyền chi. Full goalACTIVE, chưa live effects.

---

## Hiện hành 03/10/2026 — Dashboard tư vấn/khảo sát đã kiểm chứng

Runtime9c317310 thêm SQL673/API/UI báo cáo toàn công ty: nhóm cần xử lý, hội thoại, lịch sắp tới/trong giờ/qua giờ, bàn giao và ngoại lệ. Hai P2 về lịch NULL/infinity và union CARE+SURVEY đã sửa. STOP giữ nghĩa vụ khảo sát; ACK chưa phải hoàn tất. Chưa quy thuộc lịch theo kỳ quảng cáo.

Review độc lập PASS; local24, PostgreSQL208/0/0 (9ca mới), Node22 721/0/0, cả10job/build và report/Messenger SUCCESS. Browser API giả kiểm lỗi nguồn/scope, STOP, lịch đổi, identity, đổi công ty/người và phản hồi muộn. [Bằng chứng đúng phiên bản](vpt-marketing-automation/OPERATIONS_DASHBOARD_REVIEW.md), [hợp đồng/hoàn tác](vpt-marketing-automation/OPERATIONS_DASHBOARD.md).

Full goal ACTIVE. Tiếp theo đối soát đủ phạm vi/ID/chi tiêu/khách và chốt kỳ đo, hoàn thiện ngoại lệ vận hành rồi UAT tuyến Facebook→CRM→dashboard và trình Founder phát hành. Chưa dữ liệu thật chứng minh250k hoặc phát hành. Các mục bên dưới giữ lịch sử.

---

## 2026-10-03 — Sửa ngoại lệ lịch và tổng nhóm cần xử lý

Review độc lập tìm hai lỗi trong dashboard mới: lịch đã đổi nhưng thiếu giờ kết thúc làm báo cáo lỗi; tổng nhóm cần xử lý bỏ sót việc khảo sát khi hội thoại đã trả lời. Đã đưa lịch thay đổi vào ngoại lệ trước kiểm thời gian và gộp cả việc chăm khách lẫn khảo sát vào tổng nhóm. Local24 PASS, reviewer đã kiểm lại hai lỗi.

Candidate551046c đạt9/10job; PostgreSQL có3 assertion mới giả định hồ sơ luôn nằm trong50 mục đầu. Sửa kiểm tra bằng biến động tổng số việc, giữ giới hạn50 và mọi ca cũ; bổ sung NULL/infinity cho lịch thay đổi. Đang kiểm CI/browser đúng bản sửa, chưa UAT/phát hành. Full goal ACTIVE.

---

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

## Hiện hành03/10/2026 — Danh mục nguồn khách đã kiểm chứng

Runtime9363535a thêm SQL671/API/editor cho phạm vi công ty/kỳ/tất cả tài khoản/Page/biểu mẫu/điểm nhận. Có revision/audit/exact retry, ngoại lệ lịch sử chưa rõ tài khoản và phát hiện cấu hình/quyền đổi. Projection cùng snapshot; không biến khai báo thành bằng chứng provider đủ hoặc quyền chi.

Review độc lập PASS; local129, censusPG41/0/0, Node22 697/0/0, cả10job/build và report/Messenger SUCCESS. Browser dữ liệu giả kiểm lưu, thiếu nguồn, cấu hình đổi, lỗi/sai actor, mất phản hồi/reload/đổi người/retry và heldPOST-close. [Bằng chứng](vpt-marketing-automation/SOURCE_REGISTRY_REVIEW.md), [hợp đồng/hoàn tác](vpt-marketing-automation/SOURCE_REGISTRY.md).

Full goal ACTIVE. Tiếp theo provider witness/đối soát bản xuất thực và chốt kỳ có bằng chứng; lịch/chờ xử lý cùng nghĩa vụ vận hành còn lại giữ nguyên. Chưa Meta/UAT thật/phát hành/đạt250k. Các mục dưới đây giữ lịch sử theo phiên bản.

---

## 2026-10-03 — Đóng danh mục trong lúc gửi

2d53b5 đạt cả10job, gồm barrier PostgreSQL active/Lock/PgSleep. Review tiếp phát hiện khi đóng editor lúc POST chờ thì summary có thể còn cũ. Đã xóa summary trước POST; browser held-response/close/reopen/retry kiểm đúng phiên bản2 và không khôi phục kết luận cũ. Bản UI sửa cần CI/review cuối; không đổi SQL.

---

## 2026-10-03 — Danh mục nguồn đã qua PostgreSQL; chốt kiểm chứng cuối

Runtime50a0e14: review độc lập PASS; automation37104975047 cả10job SUCCESS, censusPG41/0/0, Node22 697/0/0, build10.314module; report/Messenger SUCCESS. UI thử đã kiểm lưu, nguồn mới, mất phản hồi/reload/đổi người/retry, lỗi nguồn và thay cấu hình. Có delta cuối: xóa summary cũ khi read lỗi/save và siết test chờ thành active + Lock/PgSleep; đang chạy lại đúng phiên bản. [Kiểm giao diện](vpt-marketing-automation/SOURCE_REGISTRY_BROWSER.md). Full goal ACTIVE, chưa provider đủ/CPQL/UAT/phát hành.

---

## 2026-10-03 — Sửa lỗi tên biến trong SQL danh mục

Candidate36048b5 đạt9/10 job/build nhưng PostgreSQL census111151084463 phát hiện tên alias k trùng biến hàm, khiến lưu danh mục bị từ chối và10 ca mới phụ thuộc thất bại. Review độc lập phát hiện cùng nhóm lỗi v/x/k. SQL671 đã dùng alias/cột rõ ràng; giữ nguyên ca nghiệm thu, chạy lại đúng bản sửa. Chưa PASS toàn gói và chưa phát hành.

---

## 2026-10-03 — Danh mục nguồn khách đang kiểm chứng

SQL671/API/giao diện bổ sung phạm vi công ty/kỳ/tất cả tài khoản/Page/biểu mẫu/điểm nhận, xác nhận có phiên bản và lịch sử. Giữ ngoại lệ biểu mẫu lịch sử chưa rõ tài khoản; không suy không có điểm nhận từ số khách bằng0. Lưu nguyên giao dịch, retry đúng yêu cầu; thay cấu hình/quyền làm danh mục stale. Projection cùng snapshot báo cáo, không nâng provider completeness/CPQL/quyền chi.

Local129 PASS; PostgreSQL/build/browser/review độc lập đang chờ. [Phạm vi, kiểm thử và hoàn tác](vpt-marketing-automation/SOURCE_REGISTRY.md). Chưa phát hành/Meta/UAT thật; full goal ACTIVE. Phần đã kiểm chứng trước đó giữ bên dưới.

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

## 2026-10-03 — Measurement reconciliation follow-up

efcf783 passed9/10 automation jobs, including census PostgreSQL and full build. Trial PostgreSQL111138267777 failed6 cases because its acquisition fixture remained in today's excluded interval and expected both days' spend. Fixture now uses yesterday acquisition and500k closed-day cost. Independent review found DONE source/observation timestamps disagreeing outside the period could disappear; report and reverse reconciliation now retain an explicit acquisition conflict. Added regression and legacy partial-day PostgreSQL case. Revalidation pending; no live actions.

---

## 2026-10-03 — Cùng kỳ đo khách và chi tiêu (đang kiểm chứng)

Base b66ce94. SQL670 lưu observation provider kể cả ngoài kỳ, chốt census tại ngày Việt Nam hoàn tất; report dùng cùng cutoff cho tiền và khách. Chi phí fetch trước cutoff không được coi là đủ; receipt tới muộn chỉ loại khỏi kỳ khi có bằng chứng đúng nguồn, giữ trạng thái và lịch sử gốc.

Local140 domain/service/provider tests PASS. PostgreSQL, build và independent review đang chờ. [Hợp đồng, giới hạn và hoàn tác](vpt-marketing-automation/MEASUREMENT_PERIOD.md). Còn registry phạm vi + provider coverage, close có bằng chứng và đường positive CPQL, lịch/chờ xử lý trên dashboard và UAT. Full goal ACTIVE; chưa đạt250k, không DB/Meta thật, không mở chi/phát hành.

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

Follow-up57a54f0: all10 jobs PASS in CI37095511369, PostgreSQL111124498610 =176/0/0 incl18 handoff cases. Further independent review found a membership-insert gap between locking read and inventory. The next delta authorizes only positively locked membership/contact rows, fingerprints membership, and tests the exact gap with an isolated barrier plus revocation waiting until commit. Revalidation of this new SQL delta remains pending. [Browser evidence](vpt-marketing-automation/SURVEY_HANDOFFS_BROWSER.md).

SQL668, default-off authenticated APIs and CRM staff UI add scoped queue/detail/history and atomic receipt by the current recipient. Owner/admin monitoring does not allow proxy ACK; booking RSVP and historical booking result remain separate. Exact pending requests survive browser reload. Initial independent review found null-owner authorization and moved-staff name leakage; both fixed with regression cases.

Runtime76340d initial CI37095078505 passed9 jobs, including full frontend and Node22 604 tests. PostgreSQL job111123247026 failed one fixture assumption: duplicate contact insert is already rejected by the existing unique constraint. The test now asserts that rejection before testing changed Customer mapping; added authority/calendar races and53-row pagination. Local adapter/UI-state11 PASS. Browser verified full55-message history, manager cannot ACK and lost-response replay across reload with a synthetic API. PostgreSQL revalidation and final independent review remain pending. [Contract and rollback](vpt-marketing-automation/SURVEY_HANDOFFS.md). No live migration/send/AI call/ad change or release. Full goal ACTIVE; CPQL250k remains a target, not an observed result.

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

## 2026-09-29 — VPT Messenger durable intake, local candidate only

Issue #7: https://github.com/backen-pixel/Quanlycongviec/issues/7. Base: `413e8f575b5b611b25a50980564d754b7bfcf211`. Founder requested finishing the Messenger A2/B trial. No remote commit, PR, migration, live test or deployment performed by this workstream.

Opt-in Page 409741855550833: persist Messenger event before ACK, retry with DB lease/token; extract referral even without message; exact ad→campaign mapping; reuse existing lead_attribution; delayed Lead linking. Auto/manual/legacy scan share atomic contact→Lead RPC for this Page and CRM Lead type. Unique nullable crm_leads.facebook_contact_id and contact row lock guard retry/concurrent creation. Existing customer/phone reuse also uses the same RPC. Other Pages remain unchanged unless explicitly opted in.

Files: two sanitized runtime schema/index/ACL fixtures; routes/facebook.js, routes/crm/routes/leadLifecycle.js, server.js (legacy scan identity), helpers/facebookAtomicLead.js, helpers/facebookMessengerReceipt.js, migrations639–641, five test files, config example and review notes. Applied migrations are unchanged. 636–638 reserved from the older unmerged package, unavailable locally (Library helper retried twice, HTTP502).

Tests: Node handler VM + helper tests and real isolated PGlite SQL; no application .env, full server import, production DB or message sends. See VPT_MESSENGER_REVIEW_20260929.md for exact commands and gates. Source-backed baseline failed ACK/retry regression tests; candidate passes 40/40 local tests. SQL tests are one PGlite connection, not multi-session PostgreSQL staging.

Runtime schema/FKs/unique indexes are now compared and represented by schema-only test fixtures. Existing attribution ACL is broad with RLS=false; no global ACL is changed. New raw/ref/source/message/phone/PSID data stays only in protected receipts, attribution gets numeric IDs and event keys. Unresolved before activation: multi-session Postgres CI + controlled staging fault/restart tests; deploy SHA/API health; Meta messaging_referrals subscription; real referral→phone→Lead→campaign E2E. Runtime historical 7 ad rows sharing one timestamp do not prove current writer. No automation for budget stop/resume or ad activation in this patch.

Rollback: keep ads paused; drain pending receipts before disabling FB_DURABLE_MESSENGER_PAGE_IDS and reverting backend. Keep evidence and additive identity columns. Never delete historical leads/contacts/attribution to roll back. Notifications/tasks after commit are not guaranteed exactly once; customer creation remains outside Lead transaction and can leave an unused customer during a race. Cross-contact shared Lead retains original first-touch attribution and this contact's pending evidence.


# Trạng thái công việc hiện tại

Cập nhật: 2026-10-01 14:45 (UTC+7)

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
