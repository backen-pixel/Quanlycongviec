# Nguồn chưa xác minh, điểm dừng và đầu vào cần bổ sung

Ngày16/10/2026. Các phần độc lập tiếp tục theo xác nhận mới của Founder trong chat: thiết kế tổng thể Business AI OS có marketing tích hợp; M1 là chặng đầu. Không coi nguồn thiếu là đã nhận và không cần hỏi lại để viết thiết kế.

## 1. Trích nguyên văn hai nguồn được nhắc

File nguồn: **BOS-V31A-ARCH-01 — Nhiệm vụ thiết kế kiến trúc giao Codex.md** trong Downloads. SHA256 nguyên bản:
`8c191af46a08a65bedfe0e711003d536120735aa8595cbc0b0f753a51e430997`.

Tên file ghi Codex; tiêu đề nội dung dòng1 ghi “giao Claude Code”. Đây là khác biệt phiên bản/tên giao việc, không thay lệnh trực tiếp hiện hành của Founder. [TASK.md](TASK.md) giữ nguyên số dòng, chỉ che tên tác giả ở dòng3.

**Dòng24, mục2 — audit gốc:**

> | 4 | Báo cáo audit kiến trúc agent (9 phát hiện) | Phần sửa bắt buộc ở L7 |

**Dòng85, mục4/B10 — đánh giá sơ đồ:**

> 10. **Sơ đồ:** bản kỹ thuật dạng Mermaid trong repo; danh sách sửa cho sơ đồ nghiệp vụ tổng thể (10 điểm đã nêu trong đánh giá).

**Dòng110, mục5 — yêu cầu đối chiếu audit:**

> `audit-report.json` cập nhật 9 phát hiện của audit thiết kế bằng bằng chứng từ code: giữ, hạ mức, nâng mức hoặc đóng, mỗi thay đổi có `evidence_refs`.

**Trạng thái: SOURCE_UNVERIFIED.** Chưa có bản nguồn audit9 hoặc đánh giá10 để xác minh ID, phiên bản, nội dung và mức độ ban đầu. Đã tìm trong Downloads và repo; Founder xác nhận tiếp tục với trạng thái chưa xác minh. [Audit hiện tại](audit-report.json) là chín phát hiện mới từ mã có43 evidence_refs, **không phải** phép ánh xạ chín mục gốc. Không kết luận đã giữ/hạ/nâng/đóng bất kỳ finding gốc nào. Danh sách điều chỉnh sơ đồ ở [diagrams/README](diagrams/README.md) là đề xuất dựa brief hiện có, không nhận là “10 điểm đã nêu”.

Cần bổ sung khi có: bản audit nguyên gốc+ID finding+ngày/version/hash; bản nhận xét10điểm+ảnh/version được đánh giá. Khi nhận, lập original_id→local_id/evidence→disposition, giữ findings chưa xác minh và lịch sử review.

## 2. Các kết luận còn phụ thuộc schema live

Founder đã xác nhận **chưa có cấu hình chỉ đọc được xác minh**. Không dùng admin/service role thay thế, không tạo role/đổi quyền live. UNKNOWN này không chặn toàn bộ thiết kế.

| Kết luận chưa được phép chốt | Bằng chứng cần bổ sung |
|---|---|
| Repo schema = production/backup | Catalog có timestamp/project/server version của từng target; tables/columns/types/defaults/constraints/indexes/views/functions/triggers/RLS/policies/grants/extensions |
| Migration nào đã áp, bị sửa hay thiếu | Applied history/sổ filename+checksum/source từ từng target; các thay đổi ngoài runner; không chỉ count/max prefix |
| Baseline local tái tạo được live | Curated schema-only baseline có dependency manifest, replay thành công DB trắng, normalized catalog diff MATCH hoặc danh sách lệch được review |
| Customer/work/money writer và scope thật | Catalog constraints/FKs/RLS/grants + deployed SHA/config; source code chưa chứng minh flags/callpath thực |
| Service-role bypass đã được khống chế | Effective role/grant/SECURITY DEFINER inventory, scope tests ở môi trường được giao, không thử truy cập khách thật |
| Primary/backup parity và restore | Catalog/hash/ledger hai bên, backup metadata, restore rehearsal và reconciliation trace |

Kết nối nếu được cung cấp sau phải xác minh đúng project, role chỉ đọc, non-superuser/non-BYPASSRLS và transaction read-only; SELECT không tự bảo đảm an toàn nếu gọi function có side effect. Dùng query catalog allowlist, không SELECT dữ liệu khách hoặc gọi function nghiệp vụ.

Local probe đã xác minh runner thất bại trên DB trắng:42704 missing anon; thêm fixture roles ở **DB tạm** rồi42P01 missing crm_leads; ledger0. Đây là lỗi dependency/baseline thực chứng, không tự miễn R03 hoặc chứng minh schema live lỗi. Không dựng baseline giả bằng table stubs rồi nhận khớp production.

## 3. Quyết định và điểm dừng theo phạm vi

| Mục | Trạng thái / chủ cần xử lý | Việc thiết kế đã làm |
|---|---|---|
| D1–D7 | ASSUMPTION_PENDING_FOUNDER; không là runtime approval | ADR001–007, contracts/state/AI/connectors có nhãn; không mở V3.2 |
| Work core/runner/tenantpilot | ADR008–010 proposed; có tiêu chí chọn | Một WorkItem façade, CRM presales writer M1; giữ domain writer sau bán; reuse runner |
| Candidate auth/scope/signature gaps | Static risk đã báo, chưa khai thác/live probe; security/domain owner | X-User-Id act-as, thiếu tenant bypass, global contact lookup, Zalo missing signature guard/ACK trước persist được ghi trong W0/gaps |
| Deployed SHA, agent roster33, model/tool/memory settings | UNKNOWN; runtime owner cung cấp sanitized metadata | Health/runtime version là bằng chứng hẹp; không khẳng định33agent còn active |
| Meta/Zalo entitlement và API pin | UNVERIFIED; connector owner cung cấp config evidence đúng account/project | Capability manifest, fail-closed gates và contracttest; không đăng nhập/đổi app |
| R03, original-audit mapping | Chưa đạt/chưa đủ evidence | Chặn kết luận fullacceptance và gate xây tương ứng; vẫn bàn giao toàn bộ phần độc lập |

Không thấy D1–D7 bất khả thi chỉ từ source đã đọc. D2 cần chuyển schedule/connector bằng gate sau, không cần gỡ n8n. Không mở việc triển khai bằng tài liệu. Hành động sửa source quyền, áp migration chung, bật connector hoặc gửi tin phải thuộc nhiệm vụ xây/phát hành riêng.

## 4. Sai lệch và bài học cho vòng xây tiếp

- “502 file” không còn đúng ở SHA hiện tại; manifest bằng filename+checksum quan trọng hơn số file hoặc số tiền tố.
- Baseline stamp khác baseline schema; nghiệm thu cần thực tế replay và catalog diff.
- Source implementation, lịch sử release và live status là ba loại evidence; không lấy main HEAD thay deployed SHA.
- Agent tool-loop giới hạn không thay reviewer roundbudget; prompt bắt dùng tool không thay enforcement code.
- Nội dung hướng dẫn chờ plan mode và sửa .claude trong TASK mục9 là mẫu giao Claude Code. Lệnh trực tiếp hiện hành giao tự xử lý phạm vi thiết kế, vì vậy không chạy mẫu đó, không thay cấu hình host.
