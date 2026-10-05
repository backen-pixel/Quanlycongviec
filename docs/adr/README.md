# Architecture Decision Records (ADR)

Mỗi quyết định kỹ thuật quan trọng = 1 file ADR. Không sửa ADR đã `Accepted` — tạo ADR mới nếu đổi hướng.

## Trạng thái

`Proposed` → `Accepted` → `Deprecated` / `Superseded`

## Danh sách

| ID | Tiêu đề | Trạng thái |
|---|---|---|
| 0015 | [Marketing boundary — PR #16](https://github.com/backen-pixel/Quanlycongviec/blob/19c35323bb932e55a78fff1eee312fff5f6c12ea/docs/adr/0015-marketing-business-os-boundary.md) | Candidate ngoài main, không đổi trạng thái trong PR này |
| 0016 | [Tiến hóa Business AI OS trong repo hiện có](./0016-incremental-business-ai-os-v1-1.md) | Accepted về định hướng; gói tài liệu chặng 0 qua review/merge |
| 0017 | [Tách việc trước bán và sau bán theo nghiệp vụ](./0017-presales-postsales-work-ownership.md) | Accepted về định hướng; gói tài liệu chặng 0 qua review/merge |
| 0018 | [Bàn giao thương mại có phiên bản và điều phối bền vững](./0018-versioned-commercial-handoff.md) | Accepted về định hướng; gói tài liệu chặng 0 qua review/merge |
| 0019 | [Kiểm soát lệnh, nguồn ghi và danh tính Agent](./0019-governed-commands-data-and-agents.md) | Accepted về định hướng; gói tài liệu chặng 0 qua review/merge |
| 0020 | [Factory dùng ngữ cảnh chung, review độc lập và ECC có chọn lọc](./0020-factory-context-review-and-ecc.md) | Accepted về định hướng; gói tài liệu chặng 0 qua review/merge |

Tạo mới: copy [`0000-template.md`](./0000-template.md) → `NNNN-tieu-de-ngan.md`.

Số 0016–0020 được cấp sau khi kiểm main và cây sáu PR đang mở ngày 01/10/2026; 0015 đã dùng ở PR #16. Kiểm lại số trước merge nếu có ADR mới. Accepted không có nghĩa đã triển khai hoặc được release; xem [sổ Founder](../ai-handoff/FOUNDER_DECISIONS_ARCHITECTURE_V1_1_20261001.md).
