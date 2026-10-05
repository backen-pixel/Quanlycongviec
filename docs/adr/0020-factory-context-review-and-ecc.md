# ADR-0020: Factory dùng ngữ cảnh chung, review độc lập và ECC có chọn lọc

- **Trạng thái:** Accepted — định hướng theo yêu cầu Founder ngày 01/10/2026; bản ghi này thuộc gói chặng 0 chờ review/merge, chưa phải kết quả triển khai.
- **Ngày:** 2026-10-01.
- **Nguồn quyết định:** [Sổ Founder](../ai-handoff/FOUNDER_DECISIONS_ARCHITECTURE_V1_1_20261001.md).
- **Kiến trúc liên quan:** [V1.1](../architecture/BUSINESS_AI_OS_ARCHITECTURE_V1_1.md).

## Ngữ cảnh

Ngữ cảnh phân tán giữa công cụ; dự thảo gộp Claude Code/Cowork và coi thiếu nhãn rủi ro là thấp. ECC trong Codex không chứng minh các môi trường/hook khác đã sẵn sàng.

## Quyết định

ChatGPT tư vấn Founder; Claude Code khảo sát/chuẩn bị ngữ cảnh và nhận phần việc được giao; Cowork tổng hợp hồ sơ trong quyền riêng; Codex kiểm chứng/xây/test/PR. Reviewer dùng phiên riêng với phiên tác giả, đọc đầy đủ yêu cầu đã duyệt và bằng chứng. ECC là tooling Factory, ghim phiên bản, chọn tập con; chưa phân loại rủi ro là UNKNOWN.

Ánh xạ quyết định Founder: F-09, F-10.

## Phương án đã xét

Buộc mọi việc qua hai AI tăng chi phí không cần thiết. Reviewer chỉ đọc diff thiếu bối cảnh. Dùng ECC làm cổng quyền hoặc tự cài vào CI không đúng phạm vi. Chọn một owner/việc, việc nhỏ giao thẳng, pilot trước khi bắt buộc cho việc phức tạp.

## Hệ quả và kiểm chứng

Không cài tool/hook/CI hoặc cấp credential. Pilot ba việc trong roadmap chỉ kết luận theo số đo thực; thiếu baseline là INCONCLUSIVE. Hồ sơ gắn SHA và cập nhật cùng PR. Cơ chế quyền của môi trường vẫn áp dụng; brief hay ADR không tự cấp quyền công cụ.

## Liên kết

- [Lộ trình/gate](../architecture/BUSINESS_AI_OS_V1_1_ROADMAP.md).
- [Bằng chứng hiện trạng](../ai-handoff/ARCHITECTURE_V1_1_EVIDENCE_20261001.md).
