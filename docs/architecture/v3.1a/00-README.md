# Business AI OS V3.1a — thiết kế tổng thể và gói giao xây dựng

**BOS-ARCH-DESIGN-01 / BOS-V31A-ARCH-01 · 16/10/2026 · nhánh `design/v3.1a`.**

Phạm vi là **toàn Business AI OS có Marketing tích hợp**. M1 nhận khách → phân công → xác nhận (ACK) → theo dõi → đối soát là chặng xây đầu tiên. Bản này tiếp tục V3.1, không mở V3.2.

**Trạng thái: DESIGN_PACKAGE_READY_WITH_EVIDENCE_GAPS.** Phần thiết kế độc lập đã hoàn thiện và được kiểm chéo. Chưa nghiệm thu đầy đủ đề bài hoặc G0: runner chưa dựng được DB trắng; đối chiếu schema live là UNKNOWN; hai nguồn audit và đánh giá sơ đồ chưa được xác minh. D1–D7 là giả định chờ Founder chốt, chưa cấp quyền vận hành.

## Đường đọc

| Nội dung | Tài liệu |
|---|---|
| Tổng thể sáu miền, sáu Hệ, Marketing và vòng đời nghiệp vụ | [overall-system](overall-system.md), [kiến trúc đầy đủ kế thừa](../overall-design-20261016/ARCHITECTURE.md) |
| Nhiệm vụ, nguồn và đoạn trích nguyên văn | [TASK](TASK.md), [manifest nguồn](sources/manifest.json), [open-questions](open-questions.md) |
| Pha A: chín nhóm hiện trạng và khoảng trống | [inventory W0](01-inventory-w0.md), [gap register](03-gap-register.md) |
| Mười tầng, dữ liệu và migration cần viết | [layer mapping](02-layer-mapping.md), [data model](data-model.md) |
| Mười quyết định kiến trúc | [ADR](adr/README.md) |
| Tám loại bản ghi, schema và fixture giả | [hợp đồng](contracts/README.md), [schema](contracts/bos-contracts.schema.json), [fixtures](contracts/fixtures.json) |
| Quyết định, lệnh và sơ đồ | [state machines](state-machines.md), [diagrams](diagrams/README.md) |
| Ba connector M1 và ranh giới AI | [connectors](connectors.md), [ai-boundary](ai-boundary.md) |
| Audit từ mã nguồn | [audit-report](audit-report.json), [schema kiểm cục bộ](contracts/audit-report.schema.json) |
| Thứ tự giao xây và nghiệm thu | [m1-build-plan](m1-build-plan.md), [acceptance matrix](acceptance-matrix.md) |
| Kiểm chứng và giới hạn | [checks](checks/README.md), [contract results](checks/contract-results.json), [package results](checks/package-results.json), [blank DB results](checks/blank-db-results.json) |

## Lựa chọn thiết kế đề xuất

Một backend chia module theo L1–L10, tận dụng CRM, Work và Finance hiện có. L3 chuẩn hóa hợp đồng trên nguồn dữ liệu có chủ; không tạo thêm CRM/ERP hoặc sổ việc, sổ tiền cạnh tranh. Marketing gồm kế hoạch, nội dung/tài sản, chiến dịch, hành trình/consent, bàn giao và đo lường; nối với Sales, Order/Project, Payment/Refund và Service.

M1 dùng một cổng WorkItem chuẩn; CRM phụ trách ghi việc trước bán, các miền Work/SX/VC giữ writer đã đăng ký. Intake chạy độc lập với AI: xác thực binding → inbox bền vững → projection theo công ty → phân công → ACK → theo dõi/đối soát. Website/form, Meta Lead Ads và Zalo OA dùng chung khung connector trong backend. Theo D2, n8n chỉ dùng nội bộ; nhiệm vụ này không gỡ hoặc tắt hệ hiện hữu.

C2-báo trước giới hạn bốn hành động nội bộ thuộc policy đã duyệt. Phải có bằng chứng thông báo đã giao, đủ thời gian chờ và không bị veto, kiểm đồng bộ với dispatch. Gửi tin khách, chiết khấu và ngân sách quảng cáo nằm ngoài danh sách M1. Cả bốn cửa Pháp–Lệ–Lý–Tình đều được DENY/UNKNOWN; phê duyệt không vượt điều cấm.

AI giữ dấu nguồn không tin cậy, phiên/bộ nhớ theo một công ty, reviewer chỉ PASS/FAIL trên bản nội dung cố định, giới hạn vòng/call và phiên bản prompt/model. Code tính các số liệu nghiệp vụ; AI không tự tạo sự thật hay thay luật.

## Kết quả kiểm

Source sản phẩm được kiểm tại **fe3f4398ebf2186596c108a7570f83e3bbef104a**; bộ thiết kế kế thừa tại **49c4fda6f256ed1517213fb0a1bf831c869919d6**. Đây không phải xác nhận SHA đang triển khai.

- **79 kiểm schema/mô hình đạt** bằng Ajv 8.20.0 và fixture giả.
- **11 kiểm hồ sơ đạt**: liên kết, JSON, trích nguyên văn, T01–T20, checksum migration và quét mẫu secret/PII. Không phát hiện mẫu nhạy cảm mới; các dấu vết liên hệ đã có trong nhật ký baseline được phân loại riêng, không sao chép giá trị vào báo cáo. Quét regex có giới hạn.
- **DB tạm đã thử thực tế**: bootstrap thiếu role `anon` (42704); với role giả lập, migration đầu thiếu `crm_leads` (42P01). Ledger có 0 hàng. DB dùng socket riêng, không TCP, đã dừng và xóa. Chưa replay toàn bộ hoặc đối chiếu live.
- **56 ca nghiệm thu tương lai đều NOT_RUN**. Kiểm offline không thay kiểm hệ thống.
- **9 finding local, 43 dẫn chứng mã** trong audit. Chưa ánh xạ với chín finding gốc. Schema kiểm được formal hóa từ mẫu ECC skill; validator upstream chưa được cung cấp.
- Mermaid có bốn nguồn kỹ thuật mới; **parser/render NOT_RUN** vì chưa có thư viện sẵn. Hình nguồn đã xem trực quan; đề xuất sửa mới được phân biệt với “10 điểm” chưa nhận.

Kiểm kê tìm thấy 738 file SQL gốc, trong đó runner nhận 722 migration tiến, có 68 nhóm tiền tố trùng; manifest chứa checksum từng file. Có 20 luật nguồn đủ vị trí, nội dung, phạm vi và kế hoạch đăng ký.

## Trạng thái 11 tiêu chí

Đây là kết quả review kỹ thuật, **Founder chưa đánh dấu nghiệm thu**.

| Mã | Kết quả |
|---|---|
| R01 | Đủ chín mục W0; UNKNOWN có lý do và bằng chứng cần bổ sung |
| R02 | Đủ L1–L10, có mapping mã/bảng/endpoint/trạng thái |
| R03 | **CHƯA ĐẠT**: local baseline thất bại, live UNKNOWN |
| R04 | Có lựa chọn lõi việc, tiêu chí, chuyển writer và rollback |
| R05 | Có 20 luật nguồn cho rule registry |
| R06 | Schema/fixture và trường D6 được kiểm cục bộ |
| R07 | Đủ nhánh Decision/Command và các bất biến |
| R08 | T01–T20 và ca bổ sung giữ NOT_RUN, không ghi PASS giả |
| R09 | Audit local hợp schema cục bộ; nguồn gốc và upstream validator còn thiếu |
| R10 | Đã quét mẫu secret/PII trong nội dung mới, có ghi giới hạn |
| R11 | Chỉ tài liệu/prototype và DB tạm được phép; không thay source sản phẩm hay production |

Founder đã xác nhận tiếp tục các phần độc lập khi chưa có kết nối chỉ đọc và hai nguồn còn thiếu. Sự xác nhận này không biến R03 hoặc ánh xạ audit gốc thành PASS. [Open questions](open-questions.md) liệt kê từng kết luận còn phụ thuộc schema live và trích đúng dòng 24, 85, 110 của brief.

## Phiên bản và bàn giao

Nhánh mới kế thừa [draft PR142](https://github.com/backen-pixel/Quanlycongviec/pull/142). V3.1a là điểm vào mới; gói cũ giữ hợp đồng toàn hệ, nguồn lực và tài liệu tham chiếu. Khi xung đột, D2/D3/D4/D6 và phạm vi M1 trong V3.1a được ưu tiên. A01–A12 DESIGN_PASS của gói cũ không thay nghiệm thu R01–R11.

Rollback tài liệu bằng revert commit; không có dữ liệu nghiệp vụ cần rollback. Gói xây tiếp theo bắt đầu từ G0 trong kế hoạch M1, bằng nhiệm vụ xây riêng.

## Nhật ký thay đổi

- 16/10/2026: thêm W0, mapping, ADR, hợp đồng, state machines, connector/AI, audit và kế hoạch V3.1a.
- 16/10/2026: ghi xác nhận của Founder về tổng thể có Marketing và xử lý nguồn thiếu; giữ schema live UNKNOWN.
- 16/10/2026: ghi thất bại baseline thực tế; sửa mô hình theo review về terminal Decision, digest, cửa sổ thông báo, precondition/consent và nguồn taint.
