# Sơ đồ thiết kế — BOS-ARCH-DESIGN-01

Toàn bộ sơ đồ có nhãn **DESIGN_PROPOSAL / NOT_LIVE**: mô tả hợp đồng đích, không chứng minh tích hợp hoặc triển khai thật. Đối chiếu nguồn và trạng thái ở `../INVENTORY.md`, nội dung chuẩn ở `../ARCHITECTURE.md` và `../CONTRACTS.md`.

| Tệp | Dùng để review |
|---|---|
| `overall.mmd` | Một boundary Business AI OS, sáu miền ngang hàng, nền L1–L10; kênh vào L2, Codex ngoài runtime |
| `overall.svg`, `overall.png` | Bản tổng thể dễ mở, 1800×1760, có nhãn phạm vi và chú giải; SVG có text/vector |
| `technical.mmd` | Module/process logic, owner, auth, inbox, command, gateway, cap và receipt |
| `ownership-erd.mmd` | ERD logic và quan hệ authority, không phải lệnh tạo bảng |
| `deployment.mmd` | Local design, dev/staging đề xuất, production/pilot inventory và recovery |
| `seq-01-intake.mmd` | Website/native → inbox → CRM → giao nhận người phụ trách → kết quả |
| `seq-02-action.mmd` | Content/campaign → luật/duyệt/cap → command → native adapter → receipt |
| `seq-03-money.mmd` | Quote/acceptance → Order/Project → thu/hoàn/đối soát → reporting |
| `seq-04-ai.mmd` | WorkItem → Paperclip task/run → gateway → callback/usage/cancel |
| `seq-05-failure.mmd` | Trùng/conflict, thiếu owner, đổi quyền/consent, mất đáp ứng, UNKNOWN |

Nguồn `.mmd` chỉnh sửa được bằng Mermaid. Bản SVG/PNG là **hình minh họa soạn riêng từ cùng mô hình**, chưa phải kết quả render Mermaid tự động. `render-overall.cjs` giữ nội dung/toạ độ để tái tạo SVG/PNG offline bằng thư viện sharp đã có; không tải/cài dependency hoặc gọi mạng. Ví dụ truyền đường dẫn tuyệt đối tới module sharp hiện có: `node render-overall.cjs <sharp-module-path>`.

Ký hiệu cardinality của ERD đã đối chiếu [tài liệu Mermaid chính thức](https://mermaid.js.org/syntax/entityRelationshipDiagram.html), đọc16/10/2026; marker bên trái khác bên phải. Điều này chỉ là đối chiếu cú pháp tài liệu, không thay parser.

Kiểm thực sự trong nhiệm vụ: SVG/PNG render cục bộ và kiểm trực quan; kiểm cấu trúc Mermaid ở mức đầu tệp/cặp block. Không có Mermaid engine cục bộ, nên parser/render toàn bộ `.mmd` **chưa chạy**. Builder có thể render trong công cụ Mermaid của môi trường xây trước phát hành tài liệu. Các ca vận hành trên sequence vẫn **NOT_RUN**.
