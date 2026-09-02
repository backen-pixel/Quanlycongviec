# BOS-AI1 Proof Governance Closure — Final Appendix V1.2B

## 0. Document control

| Trường | Giá trị | Phân loại |
|---|---|---|
| Document | BOS-AI1 Proof Governance Closure — Final Appendix V1.2B | FACT |
| Authority | Founder Execution Order | FOUNDER DECISION |
| Mode | DESIGN-ONLY / DOCUMENTATION-ONLY | FOUNDER DECISION |
| BOS-AI1 implementation | NOT AUTHORIZED by this appendix | FOUNDER DECISION |
| MG5 / OC6 / OpenClaw / Runtime / Production | CLOSED | FOUNDER DECISION |

## 1. REG4 reference baseline

**Phân loại: FOUNDER DECISION**

| Reference | Exact value |
|---|---|
| REG4 Technical Baseline | `3def40122e4072f266c943bc4eb84d3164501339` |
| REG4 Tree | `aef6c623ce7f549b560af46e73a7ee6d0abd35ae` |

Hai reference trên là mốc REG4 bắt buộc của BOS-AI1 proof. Proof request phải bind Agent ID, Agent version, package SHA-256 và REG4 record version theo contract đã đóng.

## 2. Governance closure decision

**Phân loại: FOUNDER DECISION**

### D13

- **CLOSED FOR PROOF — đã đóng cho bài chứng minh.**
- **OPEN FOR PRODUCTION — vẫn mở cho môi trường vận hành thật.**

Proof dùng hợp đồng REG4 thật theo Technical Baseline và Tree ở mục 1. Việc tích hợp REG4 cho Production, availability, cache, durable lifecycle propagation và operational recovery không nằm trong proof.

### D08 — Founder-reserved/material actions

**CLOSED FOR PROOF** bằng cách proof không thực hiện bất kỳ việc trọng yếu nào. Proof chỉ READ và DRAFT. Mọi Publish trả STOP và không có business effect.

Các ngưỡng tiền, dữ liệu, pháp lý, chiến lược, cross-company và materiality cho Production vẫn OPEN.

### D10 — Audit

**CLOSED FOR PROOF** ở mức Proof Audit Ledger — sổ nhật ký trong bộ nhớ. Ledger phải ghi đủ trường tại mục 5.

Durable Audit — nhật ký bền vững; tamper-proof audit — nhật ký chống sửa đổi; retention, backup/recovery và production operations vẫn OPEN. Proof không được claim các năng lực này.

### D11 — Write safety

**CLOSED FOR PROOF** trong phạm vi DRAFT và idempotency — chống thực hiện trùng. Cùng một request hợp lệ gửi lại chỉ tạo đúng một draft. Draft không thể tự publish.

Transaction, rollback/compensation của LIMITED_WRITE/CRITICAL_WRITE và external systems vẫn OPEN FOR PRODUCTION.

## 3. Proof execution boundary

**Phân loại: FOUNDER DECISION**

Proof:

- dùng contract REG4 thật tại baseline/tree đã ghi;
- dùng synthetic fixtures — dữ liệu giả — cho identity, task, delegation và approval policy;
- chỉ thực hiện READ và DRAFT;
- Publish chỉ trả STOP; không thực hiện publish;
- không dùng database, migration hoặc dữ liệu thật;
- không dùng MG5, OC6, OpenClaw, Runtime hoặc Production;
- không cho phép LIMITED_WRITE hoặc CRITICAL_WRITE;
- không push, tag, merge hoặc release nếu chưa có Founder authorization riêng.

## 4. Readiness reassessment

**Phân loại: FOUNDER DECISION**

**READY FOR FOUNDER BOS-AI1 IMPLEMENTATION DECISION: YES.**

Ý nghĩa của YES: hồ sơ governance của proof đã đủ để Founder xem xét ra một quyết định implementation riêng. YES không tự cho phép viết code và không mở phase.

**Recommended next Founder decision — đề nghị quyết định tiếp theo: APPROVE PROOF IMPLEMENTATION**, chỉ trong execution envelope dưới đây. Cho đến khi Founder ban hành lệnh APPROVE riêng: STOP.

## 5. Exact proposed implementation envelope

### 5.1 Starting baseline

| Item | Exact value | Phân loại |
|---|---|---|
| Canonical parent commit | `9c1bae61aa853eb438922b14bff720a32b6125d8` | FOUNDER DECISION — existing canonical baseline |
| Canonical parent tree | `4cc8bde842bab081323e196caf41947112749b71` | FOUNDER DECISION — existing canonical baseline |
| REG4 Technical Baseline | `3def40122e4072f266c943bc4eb84d3164501339` | FOUNDER DECISION |
| REG4 Tree | `aef6c623ce7f549b560af46e73a7ee6d0abd35ae` | FOUNDER DECISION |

**Phân loại: PROPOSAL**

Preflight — kiểm tra trước khi làm — phải xác minh exact parent commit/tree và REG4 commit/tree. Mismatch: STOP; không thay bằng HEAD.

### 5.2 Workspace and branch

**Phân loại: PROPOSAL**

| Item | Exact proposal |
|---|---|
| Workspace | `C:\Projects\Quanlycongviec-bos-ai1-proof-v1_2b` |
| Branch | `proof/bos-ai1-v1.2b` |
| Workspace rule | Clean worktree/reconstruction workspace ngoài original dirty working tree |
| Max changed files | 16 files |
| Self-repair rounds | Tối đa 2 vòng sau lần formal test đầu |
| Remote operations | Không push/tag/merge |

Nếu môi trường thực thi không phải Windows, Codex phải STOP và xin Founder phê duyệt workspace path thay thế; không tự đổi.

## 6. Mandatory test inventory

**Phân loại: FOUNDER DECISION về outcome; PROPOSAL về test IDs**

### A. REG4 eligibility and fingerprint

1. `E01` valid Agent tuple passes eligibility.
2. `E02` unknown Agent ID → DENY.
3. `E03` wrong Agent version → DENY.
4. `E04` wrong package SHA-256 → DENY.
5. `E05` package changed while old version claimed → DENY.
6. `E06` BLOCKED Agent → DENY.
7. `E07` RETIRED Agent → DENY.
8. `E08` invalid/expired mandatory evidence → DENY.
9. `E09` REG4 record version changes before effect → STOP/revalidate; invalid new state → DENY.

### B. Actor, task and company context

10. `C01` requester/executor/on_behalf_of/approver stored separately.
11. `C02` forged company ID → DENY.
12. `C03` resource belongs to another company → DENY with zero data disclosure.
13. `C04` forged higher role → DENY.
14. `C05` forged/nonexistent permission → DENY.
15. `C06` expired task → DENY.
16. `C07` revoked delegation → DENY.
17. `C08` on_behalf_of lacks underlying permission → DENY.
18. `C09` effective company context remains immutable within the call.

### C. Approval and Publish STOP

19. `A01` Publish without approval → STOP; zero publish effect.
20. `A02` expired approval → STOP; zero effect.
21. `A03` revoked approval → blocked; zero effect.
22. `A04` consumed approval reused → no second effect.
23. `A05` approval for action A used for action B → DENY.
24. `A06` approval bound to stale resource version → STOP.
25. `A07` approval does not create missing permission → DENY.

### D. READ, DRAFT and idempotency

26. `T01` authorized READ returns only scoped fields.
27. `T02` DRAFT is visibly non-canonical.
28. `T03` DRAFT cannot call or transition to Publish.
29. `T04` same idempotency key + same digest → same draft/result.
30. `T05` same key + different digest → DENY conflict.
31. `T06` two deliveries create exactly one draft.

### E. Audit and failure behavior

32. `L01` every ALLOW/DENY/STOP/duplicate result has a linked ledger record.
33. `L02` dependency unavailable/ambiguous → fail closed.
34. `L03` no raw credential/approval secret/sensitive fixture payload in ledger.
35. `L04` no proof output claims durable/tamper-proof/production-ready audit.
36. `L05` rollback/compensation field records `NOT_APPLICABLE` for READ and discard/expire behavior for DRAFT.

### F. Regression and scope

37. `R01` full authorized parent regression passes.
38. `R02` changed-file count ≤ 16.
39. `R03` no database/migration/MG5/OC6/OpenClaw/Runtime/Production path changed.
40. `R04` no push/tag/merge performed.

## 7. Formal Traceable Test plan

**Phân loại: FOUNDER DECISION**

Formal Traceable Test — kiểm tra chính thức gắn đúng phiên bản — thực hiện sau khi hết tối đa hai vòng tự sửa:

1. record parent commit/tree and REG4 commit/tree;
2. record proof full commit SHA/tree;
3. verify clean status and changed-file manifest;
4. run all tests E01–R04 plus full authorized regression;
5. record exact commands, environment and tool versions;
6. record pass/fail counts and P0/P1/P2;
7. export request/response, state-effect and Proof Audit Ledger evidence;
8. bind report and digests to exact proof SHA/tree;
9. STOP; Builder không tự tuyên bố canonical baseline hoặc mở phase.

Không được chuyển kết quả test sang SHA/tree khác.

## 8. Independent Reviewer

**Phân loại: PROPOSAL**

Independent Review role: `IR-BOS-AI1-V1.2B`.

Reviewer phải:

- là agent/session độc lập, không phải Builder;
- không sửa code hoặc evidence;
- xác minh parent/provenance/scope;
- checkout/reconstruct exact proof SHA/tree;
- rerun toàn bộ E01–R04 và regression;
- kiểm tra no-effect assertions cho DENY/STOP/duplicate/Publish;
- xác nhận ledger chỉ là in-memory proof ledger;
- báo P0/P1/P2 và PASS/STOP;
- trả báo cáo về Founder.

Danh tính cụ thể của Reviewer được ghi trong Founder Implementation Authorization hoặc execution record; thiếu Reviewer: STOP.

## 9. Evidence Package

**Phân loại: FOUNDER DECISION**

Gói bằng chứng phải gồm:

1. Founder requirement và phụ lục V1.2B;
2. canonical parent SHA/tree và REG4 SHA/tree;
3. clean-workspace/branch attestation;
4. proof commit SHA/tree;
5. changed-file manifest;
6. Agent eligibility and Tool Contract versions;
7. synthetic fixture manifest;
8. Formal Traceable Test report;
9. test results E01–R04 and full regression;
10. linked Proof Audit Ledger export;
11. no-effect evidence for wrong company, forged authority, BLOCKED/RETIRED, invalid approval, duplicate and Publish STOP;
12. Independent Review report and independent rerun;
13. risk register with P0/P1/P2;
14. provenance/integrity digest manifest;
15. Founder decision sheet.

## 10. PASS / STOP gate

**Phân loại: FOUNDER DECISION**

Only propose PASS when all are true:

- E01–R04 PASS;
- full authorized regression PASS;
- wrong company/forged role/permission/BLOCKED/RETIRED never creates effect;
- invalid approval never creates effect;
- Publish never executes;
- duplicate deliveries create one draft;
- every case has linked audit;
- P0 = 0;
- P1 = 0;
- formal test is bound to exact proof SHA/tree;
- Independent Review and independent rerun PASS;
- evidence package complete;
- no scope exception.

Missing any mandatory condition: STOP.

PASS only means BOS-AI1 Proof passed. It does not authorize Production, durable audit, MG5, OC6, OpenClaw, Runtime, push/tag/merge or a subsequent phase.

## 11. Mandatory return to Founder

**Phân loại: FOUNDER DECISION**

STOP and return Founder if:

- parent or REG4 SHA/tree mismatch;
- proposed workspace/branch cannot be used;
- more than 16 files are required;
- more than two repair rounds are required;
- any new dependency or scope is needed;
- P0/P1 appears;
- policy/context is ambiguous or contradictory;
- primary REG4 contract behavior differs from this appendix;
- formal test or Independent Review fails;
- evidence is incomplete;
- push/tag/merge, Runtime or Production is requested.

## 12. Final closure

**Phân loại: FOUNDER DECISION**

Proof governance is CLOSED and ready for a separate Founder BOS-AI1 Proof Implementation decision.

This appendix does not itself authorize implementation. Until a separate Founder APPROVE order is issued: **STOP**.
