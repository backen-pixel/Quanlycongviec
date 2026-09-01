# MASTER CONTEXT — Trạng thái kiểm soát hiện hành

> Cập nhật: 2026-09-01
>
> Authority: Founder Approval — New SF2-C2 Canonical Baseline; AF3 Engineering Cell V1 Proof
>
> Trạng thái: **SF2-C2 BASELINE APPROVED / AF3 V1 PROOF APPROVED / STOP**

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

AF3 Engineering Cell V1 Proof có hai mốc được Founder phê duyệt và phải được
phân biệt:

- Implementation baseline: commit
  `c05d2f9a7cc8f8591df6d300301788dbca0ecc9b`, tree
  `46f858c4b7bfc324f65d43b85c7c3a685cfc6087`.
- Final evidence record: commit
  `f26885ca99a533e8d1a221b9b9290584d3ebd23e`, tree
  `ed52b2b39b5d8bc860a39ee551c0ae1bf32335aa`.

Điều kiện bất biến đã được kiểm tra: từ implementation baseline đến final
evidence record chỉ thay Builder report, evidence package, Independent QA report
và QA-owned independent test. Implementation source
`tools/af3/canonical-evidence-manifest.js` và Builder test
`tools/af3/canonical-evidence-manifest.test.js` không đổi.

## 2. Căn cứ phê duyệt

### 2.1. SF2-C2 canonical technical baseline

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

### 2.2. AF3 Engineering Cell V1 Proof

- Architect, Builder và Independent QA là ba agent identity tách biệt với
  artifact ownership riêng.
- Phạm vi proof tại final evidence record: `7/20` file.
- Builder tests: `11/11 PASS`.
- Independent QA tests: `12/12 PASS`.
- Combined formal tests: `23/23 PASS`.
- Independent Review: `PASS`.
- Open findings: `P0=0`, `P1=0`, `P2=0`; hai P2 lịch sử đã được sửa trong
  repair round `1/2`, không waiver.
- Audit completeness: `COMPLETE`; worktree sạch; remote branch
  `work/af3-engineering-cell-v1` được xác minh tại final evidence commit.
- Không thay Business Rules, database/migration, dependency, Runtime hoặc
  Production.

## 3. Trạng thái quyền hạn

| Hạng mục | Trạng thái |
|---|---|
| SF2-C2 canonical technical baseline | `FOUNDER-APPROVED` |
| Historical baseline `9c1bae61...` | `PRESERVED / SUPERSEDED` |
| Production-ready | `NO` |
| Merge vào main | `NOT_AUTHORIZED` |
| Tag / release | `NOT_AUTHORIZED` |
| AF3 Engineering Cell V1 Proof | `FOUNDER-APPROVED / COMPLETE` |
| BOS-AI1 | `NOT_AUTHORIZED` |
| REG4 | `NOT_AUTHORIZED` |
| MG5 | `NOT_AUTHORIZED` |
| OC6 | `NOT_AUTHORIZED` |
| Business AI Runtime | `NO_GO / NOT_AUTHORIZED` |
| OpenClaw Production | `NO_GO / NOT_AUTHORIZED` |
| Production Deployment | `NO_GO / NOT_AUTHORIZED` |
| Phase tiếp theo | `PENDING FOUNDER SELECTION / NOT_OPENED` |

Việc ghi nhận canonical baseline không cho phép push, merge, tag, release,
migration, deploy hoặc thay đổi canonical main. Mọi phase tiếp theo cần Founder
decision riêng.

Founder approval AF3 thay thế trạng thái `AF3 NOT_AUTHORIZED` trước đó chỉ để
ghi nhận AF3 V1 Proof đã hoàn thành. Quyết định này không cho phép merge vào
main, tag/release, BOS-AI1, REG4, MG5, OC6, Business AI Runtime, OpenClaw
Production, Production Deployment hoặc tự mở phase tiếp theo.

## 4. Hồ sơ kiểm soát liên quan

- [Canonical baseline record](./baseline/SF2C2_CANONICAL_BASELINE.md)
- [Historical baseline 9c1bae61](./baseline/SF2C2_HISTORICAL_BASELINE_9c1bae61.md)
- [Decision Log](./PROJECT_DECISION_LOG.md)
- [Evidence Index](./baseline/SF2C2_EVIDENCE_INDEX.md)
- [Residual Risk Register](./baseline/SF2C2_RESIDUAL_RISK_REGISTER.md)
- [AF3 Evidence Index](./af3/AF3_EVIDENCE_INDEX.md)
- [AF3 Architect Design](./af3/AF3_ARCHITECT_DESIGN.md)
- [AF3 Builder Report](./af3/AF3_BUILDER_REPORT.md)
- [AF3 Independent QA Report](./af3/AF3_INDEPENDENT_QA_REPORT.md)
- [AF3 Final Evidence Package](./af3/AF3_EVIDENCE_PACKAGE.md)

Nếu tài liệu cũ mâu thuẫn với trạng thái này, Founder approval gắn exact
commit/tree `bd281ab1...` / `3eb2266e...` là điểm đối chiếu hiện hành. Trạng
thái điều hành sau khi ghi nhận: **STOP**.

Sau Founder approval AF3, trạng thái điều hành vẫn là **STOP** để Founder chọn
phase tiếp theo; không phase nào được tự động mở.
