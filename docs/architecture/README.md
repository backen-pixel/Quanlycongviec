# Architecture

## Gói V3.1a — bổ sung W0 và kỹ thuật ngày 16/10/2026

- [Điểm vào thiết kế tổng thể V3.1a](./v3.1a/00-README.md): toàn Business AI OS có Marketing tích hợp, kế thừa gói tổng thể; M1 là chặng xây đầu.
- Inventory mã, 10 tầng, 10 ADR, contracts/fixtures, decision/command, connectors/AI boundary và kế hoạch M1. **Chưa nghiệm thu G0/production**: baseline probe thất bại, schema live UNKNOWN; audit gốc/đánh giá sơ đồ chưa xác minh. Xem [nguồn còn thiếu](./v3.1a/open-questions.md).


## Gói thiết kế tổng thể BOS-ARCH-DESIGN-01 — 16/10/2026

- [Tóm tắt và bộ bàn giao](./overall-design-20261016/SUMMARY.md): một Business AI OS đủ sáu miền, đối chiếu nguồn đã có, contracts/schema/fixtures, sơ đồ, ADR đề xuất và backlog nghiệm thu để giao xây dựng.
- [Nguồn và kết quả review](./overall-design-20261016/EVIDENCE.md): phân biệt code/live/đề xuất; phạm vi chỉ thiết kế, không setup/deploy hoặc thay hệ thống đang chạy. Các lựa chọn mới PROPOSED, không thay bản ghi Founder/ADR đã duyệt bên dưới.

## Điểm vào Business AI OS V1.1

- [Kiến trúc V1.1](./BUSINESS_AI_OS_ARCHITECTURE_V1_1.md): chuẩn đích theo hướng Founder đã duyệt; bản ghi chặng 0 qua review/merge, không chứng nhận runtime.
- [Lộ trình và gate](./BUSINESS_AI_OS_V1_1_ROADMAP.md): các chặng 0–8, gói chặng 1, Factory pilot và nghiệm thu.
- [Quyết định Founder](../ai-handoff/FOUNDER_DECISIONS_ARCHITECTURE_V1_1_20261001.md): phạm vi được duyệt và phần chưa mở.
- [Đối chiếu mã nguồn](../ai-handoff/ARCHITECTURE_V1_1_EVIDENCE_20261001.md): hiện trạng tại baseline, giới hạn và phần cần xác minh.
- [ADR](../adr/README.md): quyết định theo từng chủ đề; [CURRENT](../ai-handoff/CURRENT.md): trạng thái công việc.

## Tài liệu lịch sử / hiện trạng CRM–ERP

Các tài liệu Tủ Bếp Pro/BizMind bên dưới được giữ làm nguồn lịch sử. Không coi toàn văn là kiến trúc mới đã duyệt hoặc bằng chứng deployment; khi mâu thuẫn định hướng dùng quyết định V1.1 có phạm vi tương ứng, khi xác minh implementation dùng mã/migration và bằng chứng vận hành.

| File | Mô tả |
|---|---|
| [kien-truc-tong-the.html](./kien-truc-tong-the.html) | Kiến trúc tổng thể (HTML) |
| [kien-truc-tong-the.pdf](./kien-truc-tong-the.pdf) | Bản PDF |
| [kien-truc-cu-moi-work-unified.html](./kien-truc-cu-moi-work-unified.html) | So sánh kiến trúc cũ/mới — Work Unified |
| [he-thong-tong-quan.html](./he-thong-tong-quan.html) | Tổng quan hệ thống |
| [TuBep-Pro-Tong-quan-he-thong.pdf](./TuBep-Pro-Tong-quan-he-thong.pdf) | PDF tổng quan |
| [cau-truc-he-thong-co-ban/](./cau-truc-he-thong-co-ban/) | Schema relationships / cột cơ bản |

Quyết định kiến trúc mới ghi vào [`../adr/`](../adr/).
