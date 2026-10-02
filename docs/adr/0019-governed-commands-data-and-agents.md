# ADR-0019: Kiểm soát lệnh, nguồn ghi và danh tính Agent

- **Trạng thái:** Accepted — định hướng theo yêu cầu Founder ngày 01/10/2026; bản ghi này thuộc gói chặng 0 chờ review/merge, chưa phải kết quả triển khai.
- **Ngày:** 2026-10-01.
- **Nguồn quyết định:** [Sổ Founder](../ai-handoff/FOUNDER_DECISIONS_ARCHITECTURE_V1_1_20261001.md).
- **Kiến trúc liên quan:** [V1.1](../architecture/BUSINESS_AI_OS_ARCHITECTURE_V1_1.md).

## Ngữ cảnh

Repo đã có tenantGate, permission, service_role và MCP act-as; sự tồn tại của chúng không chứng minh kiểm soát đích đã đầy đủ. Cấu hình Primary/Backup live chưa được đối chiếu.

## Quyết định

Domain giữ luật, Application Service kiểm quyền/luật/approval và điều phối, Infrastructure ghi dữ liệu/audit/outbox trong transaction phù hợp. Scope do server xác lập. Agent dùng workload identity + delegation và tool nghiệp vụ giới hạn. Một Primary ghi nghiệp vụ; backup chỉ nhận bản sao có kiểm soát, chuyển vai trò phải ngăn writer cũ.

Ánh xạ quyết định Founder: F-05, F-06, F-08.

## Phương án đã xét

Chỉ dựa prompt/skill/hook không cưỡng chế quyền. Chỉ bật RLS với backend bypass cũng không bảo vệ như đích. Tự chuyển DB theo lỗi kết nối không có fencing/đối soát có nguy cơ hai nguồn ghi.

## Hệ quả và kiểm chứng

Triển khai quyền và DB theo migration/gói riêng, không thay role hay config ở chặng 0. Phân loại tenant-shared/company/intercompany trước đổi schema. Test sai scope, approval cũ, delegation thu hồi, audit/outbox atomicity, đa phiên PostgreSQL và restore. Không dùng xóa dữ liệu hay mở lại quyền hở để rollback.

## Liên kết

- [Lộ trình/gate](../architecture/BUSINESS_AI_OS_V1_1_ROADMAP.md).
- [Bằng chứng hiện trạng](../ai-handoff/ARCHITECTURE_V1_1_EVIDENCE_20261001.md).
