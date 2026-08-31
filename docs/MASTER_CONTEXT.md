# MASTER CONTEXT — Trạng thái kiểm soát hiện hành

> Cập nhật: 2026-08-31
>
> Authority: Founder decision — SF2-C2 Canonical Baseline
>
> Trạng thái: **FOUNDER-APPROVED SF2-C2 CANONICAL BASELINE / STOP**

## 1. Baseline có thẩm quyền

- Full commit SHA: `9c1bae61aa853eb438922b14bff720a32b6125d8`
- Git tree SHA: `4cc8bde842bab081323e196caf41947112749b71`
- Parent audit candidate: `0c6f2c764f93b1518f87d2e138e25f1cc164acc7`
- Phạm vi định danh: SF2-C2 canonical technical baseline.

Mọi tuyên bố kỹ thuật về baseline SF2-C2 phải gắn với đúng full commit và tree trên. Không được thay bằng tên nhánh, SHA rút gọn hoặc trạng thái working tree.

## 2. Căn cứ phê duyệt

- TT-1 formal traceable test: **PASS** trên đúng commit/tree.
- IR-1 Independent Review: **PASS / STOP**.
- Independent rerun: `144/144 PASS` trên năm suite đã được repository định nghĩa.
- P0: `0`.
- P1: `0`.
- P2: `3`, được Founder chấp nhận là residual risk cho quyết định canonical-baseline này; không được mô tả là đã sửa hoặc đã đóng.

Không có canonical aggregate/full-regression command trong package đã commit. Vì vậy, con số `144/144` chỉ là tổng của CP1, Software Factory, SF2-C1, SF2-C2 và Business OS; không phải một tuyên bố full-regression ngoài các suite đó.

## 3. Trạng thái quyền hạn

| Hạng mục | Trạng thái |
|---|---|
| SF2-C2 canonical technical baseline | `FOUNDER-APPROVED` |
| Production-ready | `NO` |
| AF3 | `NOT_AUTHORIZED` |
| BOS-AI1 | `NOT_AUTHORIZED` |
| REG4 | `NOT_AUTHORIZED` |
| MG5 | `NOT_AUTHORIZED` |
| OC6 | `NOT_AUTHORIZED` |
| Business AI Runtime | `NO_GO / NOT_AUTHORIZED` |
| OpenClaw Production | `NO_GO / NOT_AUTHORIZED` |
| Production Deployment | `NO_GO / NOT_AUTHORIZED` |
| Phase tiếp theo | `NOT_OPENED` |

Việc ghi nhận canonical baseline không cho phép push, tag, merge, migration, deploy hoặc thay đổi canonical main. Mọi bước tiếp theo cần Founder decision riêng.

## 4. Hồ sơ kiểm soát liên quan

- [Canonical baseline record](./baseline/SF2C2_CANONICAL_BASELINE.md)
- [Decision Log](./PROJECT_DECISION_LOG.md)
- [Evidence Index](./baseline/SF2C2_EVIDENCE_INDEX.md)
- [Residual Risk Register](./baseline/SF2C2_RESIDUAL_RISK_REGISTER.md)

Nếu một tài liệu cũ mâu thuẫn với trạng thái này, hồ sơ Founder decision gắn với exact commit/tree ở trên là điểm đối chiếu hiện hành. Trạng thái điều hành sau khi ghi nhận: **STOP**.
