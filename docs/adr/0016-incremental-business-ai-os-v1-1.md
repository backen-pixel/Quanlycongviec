# ADR-0016: Tiến hóa Business AI OS trong repo hiện có

- **Trạng thái:** Accepted — định hướng theo yêu cầu Founder ngày 01/10/2026; bản ghi này thuộc gói chặng 0 chờ review/merge, chưa phải kết quả triển khai.
- **Ngày:** 2026-10-01.
- **Nguồn quyết định:** [Sổ Founder](../ai-handoff/FOUNDER_DECISIONS_ARCHITECTURE_V1_1_20261001.md).
- **Kiến trúc liên quan:** [V1.1](../architecture/BUSINESS_AI_OS_ARCHITECTURE_V1_1.md).

## Ngữ cảnh

Các nguồn cũ khác nhau giữa xây mới và tiến hóa. Hệ thống hiện có tuyến bán hàng/sản xuất đang dùng và các PR Marketing chưa nghiệm thu vận hành.

## Quyết định

Giữ repo Quanlycongviec và stack hiện có; modular hóa từng lát. Đích đợt này là VPT–Metala vận hành, không xây dịch vụ SaaS đăng ký/tính phí hoặc chuyển toàn bộ TypeScript. GitHub giữ hồ sơ chuẩn; mirror chỉ trỏ nguồn. Roadmap và approval từng chặng không được gộp thành quyền release toàn hệ.

Ánh xạ quyết định Founder: F-01, F-03, F-10, F-11.

## Phương án đã xét

Xây mới song song tăng thời gian đối soát và nguy cơ hai nguồn dữ liệu; refactor toàn bộ trước Marketing làm chậm giá trị đầu tiên. Chọn cải tiến từng lát để giữ tương thích.

## Hệ quả và kiểm chứng

Chưa đổi schema/API trong chặng 0. Mỗi lát sau phải có adapter, regression và cách tắt/hoàn tác; tài liệu cũ giữ dấu vết lịch sử. Không suy main/test PASS là nghiệm thu.

## Liên kết

- [Lộ trình/gate](../architecture/BUSINESS_AI_OS_V1_1_ROADMAP.md).
- [Bằng chứng hiện trạng](../ai-handoff/ARCHITECTURE_V1_1_EVIDENCE_20261001.md).
