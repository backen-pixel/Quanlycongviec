# MASTER CONTEXT — Trạng thái kiểm soát hiện hành

> Cập nhật: 2026-09-01
>
> Authority: Founder Approval — New SF2-C2 Canonical Baseline
>
> Trạng thái: **FOUNDER-APPROVED NEW SF2-C2 CANONICAL BASELINE / STOP**

## 1. Baseline có thẩm quyền

- Full commit SHA: `bd281ab1d61d7177a593e449ac04ba1d4c79d882`.
- Git tree SHA: `3eb2266e4177fba76960316fa167895b01ec84fb`.
- Immediate parent: `684d25fd34928bbde23c1bc01bd5572ea2a4d5dd`.
- Founder-authorized SX-1 start:
  `4d5ef23d28ea25f38229f71b416b6e007ec0beed`.
- Phạm vi định danh: SF2-C2 canonical technical baseline.

Mọi tuyên bố kỹ thuật về baseline SF2-C2 hiện hành phải gắn với đúng full
commit và tree trên. Không được thay bằng tên nhánh, SHA rút gọn, documentation
record commit hoặc trạng thái working tree.

Baseline trước `9c1bae61aa853eb438922b14bff720a32b6125d8`, tree
`4cc8bde842bab081323e196caf41947112749b71`, được giữ nguyên làm historical
baseline. Không được xóa, viết lại hoặc dùng làm mốc phát triển SF2-C2 hiện
hành.

## 2. Căn cứ phê duyệt

- SheetJS Community Edition `xlsx@0.20.3` được vendor từ nguồn chính thức.
- Tarball SHA-256:
  `8dc73fc3b00203e72d176e85b50938627c7b086e607c682e8d3c22c02bb99fe8`.
- Business source/database/migration changed: `NO / NO / NO`.
- Formal Traceable Test: `160/160 PASS` trên exact commit/tree.
- Existing development checks: `153/153 PASS`.
- Independent rerun: `160/160 PASS`.
- Dependency audit: Critical `0`, High `0`, Moderate `0`, Low `0`, Info `0`.
- Independent Review: **PASS / STOP**.
- P0: `0`.
- P1: `0`.
- Candidate, formal-test và independent-review worktrees: clean.

Founder chấp nhận ba P2 còn mở cho quyết định baseline: commit/attestation
chưa ký mật mã; resource limits mới là bằng chứng test chứ chưa phải runtime
assurance; và export chưa được kiểm tra qua live delivery/storage. Các P2 phải
được theo dõi, không được mô tả là đã đóng hoặc Production-ready.

## 3. Trạng thái quyền hạn

| Hạng mục | Trạng thái |
|---|---|
| SF2-C2 canonical technical baseline | `FOUNDER-APPROVED` |
| Historical baseline `9c1bae61...` | `PRESERVED / SUPERSEDED` |
| Production-ready | `NO` |
| Merge vào main | `NOT_AUTHORIZED` |
| Tag / release | `NOT_AUTHORIZED` |
| AF3 | `NOT_AUTHORIZED` |
| BOS-AI1 | `NOT_AUTHORIZED` |
| REG4 | `NOT_AUTHORIZED` |
| MG5 | `NOT_AUTHORIZED` |
| OC6 | `NOT_AUTHORIZED` |
| Business AI Runtime | `NO_GO / NOT_AUTHORIZED` |
| OpenClaw Production | `NO_GO / NOT_AUTHORIZED` |
| Production Deployment | `NO_GO / NOT_AUTHORIZED` |
| Phase tiếp theo | `NOT_OPENED` |

Việc ghi nhận canonical baseline không cho phép push, merge, tag, release,
migration, deploy hoặc thay đổi canonical main. Mọi phase tiếp theo cần Founder
decision riêng.

## 4. Hồ sơ kiểm soát liên quan

- [Canonical baseline record](./baseline/SF2C2_CANONICAL_BASELINE.md)
- [Historical baseline 9c1bae61](./baseline/SF2C2_HISTORICAL_BASELINE_9c1bae61.md)
- [Decision Log](./PROJECT_DECISION_LOG.md)
- [Evidence Index](./baseline/SF2C2_EVIDENCE_INDEX.md)
- [Residual Risk Register](./baseline/SF2C2_RESIDUAL_RISK_REGISTER.md)

Nếu tài liệu cũ mâu thuẫn với trạng thái này, Founder approval gắn exact
commit/tree `bd281ab1...` / `3eb2266e...` là điểm đối chiếu hiện hành. Trạng
thái điều hành sau khi ghi nhận: **STOP**.
