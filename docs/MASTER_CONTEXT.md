# MASTER CONTEXT — Trạng thái kiểm soát hiện hành

> Cập nhật: 2026-09-02
>
> Authority: Founder Approval — New SF2-C2 Canonical Baseline; AF3 Engineering Cell V1 Proof; REG4 Agent Registry V1 Baseline; BOS-AI1 Proof Baseline; MG5 Proof Baseline V1
>
> Trạng thái: **SF2-C2 BASELINE APPROVED / AF3 V1 PROOF APPROVED / REG4 V1 BASELINE APPROVED / BOS-AI1 PROOF BASELINE APPROVED / MG5 PROOF BASELINE APPROVED / STOP**

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

REG4 Agent Registry V1 có hai mốc được Founder phê duyệt và không được hoán
đổi:

- REG4 Technical Baseline: commit
  `3def40122e4072f266c943bc4eb84d3164501339`, tree
  `aef6c623ce7f549b560af46e73a7ee6d0abd35ae`.
- REG4 Final Evidence Record: commit
  `4d2093c83d80e1de5b2de174d77e871bad2fb1f5`, tree
  `f7fbcf6e3de4853bf8ff3be3db6781256ce81342`.

Formal Traceable Test và Independent Review đều gắn exact Technical Baseline
`3def4012...` / `aef6c623...`. Final Evidence Record chỉ tổng hợp hồ sơ và
không thay thế Technical Baseline.

BOS-AI1 Project Progress Brief Proof V1.2B có hai mốc được Founder phê duyệt
và phải được phân biệt:

- BOS-AI1 Technical Baseline: commit
  `f44c14365589b7ff9f1df2ce40185ef8ebece05f`, tree
  `f17e4c4f699335ddad056310c8d70e3ed3df6909`.
- BOS-AI1 Final Evidence Record: commit
  `2c8950670ab481c18ac371e32d46107a15912174`, tree
  `3e2b9ab56f5fdcfe879d35484939cee70657885a`.

Formal Traceable Test và Independent Review đều gắn exact BOS-AI1 Technical
Baseline `f44c1436...` / `f17e4c4f...`. Final Evidence Record chỉ bổ sung hồ
sơ bằng chứng; source và test có blob hash giống Technical Baseline và mốc hồ
sơ không thay thế Technical Baseline.

MG5 Model Gateway Proof V1 có hai mốc được Founder phê duyệt và phải được
phân biệt:

- MG5 Proof Technical Baseline: commit
  `c0ba1b282422c68bd96478d7585f2c2381198420`, tree
  `02f6ed227a288009f449ef9de4e94ba98ceb6c33`.
- MG5 Final Evidence Record: commit
  `347ddd2d97a2dfb4f52322086b2c49d568404fee`, tree
  `1751d0de44d1096764c535cd2a33940b8d6a2120`.

Formal Traceable Test và Independent Review đều gắn exact MG5 Proof Technical
Baseline `c0ba1b28...` / `02f6ed22...`. Final Evidence Record bổ sung hồ sơ
bằng chứng, giữ nguyên source/test của Technical Baseline và không thay thế
Technical Baseline.

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

### 2.3. REG4 Agent Registry V1 Baseline

- Founder verdict: **REG4 Agent Registry V1 Proof APPROVED**.
- Technical Baseline: `3def40122e4072f266c943bc4eb84d3164501339`,
  tree `aef6c623ce7f549b560af46e73a7ee6d0abd35ae`.
- Targeted P1-01 `3/3 PASS`; Builder `13/13 PASS`; Independent QA `14/14
  PASS`; combined regression `27/27 PASS`.
- Formal Traceable Test: `PASS` trên exact Technical Baseline.
- Independent Review: `PASS` trên exact Technical Baseline; `P0=0`, `P1=0`,
  `P2=0`; `P1-01 CLOSED`; audit completeness `COMPLETE`.
- Final Evidence Record: `4d2093c83d80e1de5b2de174d77e871bad2fb1f5`,
  tree `f7fbcf6e3de4853bf8ff3be3db6781256ce81342`.
- Remote branch `work/reg4-agent-registry-v1` đã được xác minh tại Final
  Evidence Record trước documentation-only closure; không force push.
- REG4 V1 chứng minh package identity/version/fingerprint, permission/evidence,
  lifecycle approval, self-approval denial, immutable version và audit đầy đủ
  trong phạm vi proof in-memory. Kết quả không phải Registry production hoặc
  runtime eligibility.

### 2.4. BOS-AI1 Proof Baseline

- Founder verdict: **BOS-AI1 Proof Baseline APPROVED**.
- Technical Baseline: `f44c14365589b7ff9f1df2ce40185ef8ebece05f`,
  tree `f17e4c4f699335ddad056310c8d70e3ed3df6909`.
- Failed candidate `bfca56ef3fe242f2595813e734d8a6b3b94341e0`, tree
  `a5f9c21afc9c379f5de9bd17a2d3d8d3cef2d788`, được giữ nguyên làm bằng
  chứng bốn P1 trước closure.
- P1 closure targeted `4/4 PASS`; BOS-AI1 `40/40 PASS`; REG4 Builder `13/13
  PASS`; REG4 Independent QA `14/14 PASS`; REG4 combined `27/27 PASS`; full
  combined regression `67/67 PASS`.
- Formal Traceable Test: `PASS` trên exact Technical Baseline. Independent
  Review: `PASS` trên cùng commit/tree; `P0=0`, `P1=0`, `P2=0`.
- Bốn P1 đã đóng: hostile thrown-value provenance, final REG4 revalidation
  ordering, trusted approver verification/audit distinction và reentrant
  idempotency. Audit completeness: `COMPLETE` trong phạm vi proof in-memory;
  duplicate reentrant tạo đúng một draft.
- Final Evidence Record: `2c8950670ab481c18ac371e32d46107a15912174`,
  tree `3e2b9ab56f5fdcfe879d35484939cee70657885a`.
- Branch `proof/bos-ai1-v1.2b-p1-closure` được xác minh tại Final Evidence
  Record trước documentation-only closure; không force push.
- Kết quả chỉ phê duyệt BOS-AI1 Proof Baseline; không phải durable audit,
  Runtime, Production hoặc quyền mở phase tiếp theo.

### 2.5. MG5 Proof Baseline V1

- Founder verdict: **MG5 Proof Baseline V1 APPROVED**.
- Technical Baseline: `c0ba1b282422c68bd96478d7585f2c2381198420`,
  tree `02f6ed227a288009f449ef9de4e94ba98ceb6c33`.
- Final Evidence Record: `347ddd2d97a2dfb4f52322086b2c49d568404fee`,
  tree `1751d0de44d1096764c535cd2a33940b8d6a2120`.
- Builder `36/36 PASS`; Independent QA `12/12 PASS`; MG5 combined `48/48
  PASS`; REG4 combined `27/27 PASS`; BOS-AI1 `40/40 PASS`; full combined
  regression `115/115 PASS`.
- Formal Traceable Test: `PASS` trên exact Technical Baseline. Independent
  Review: `PASS` trên cùng commit/tree; `P0=0`, `P1=0`, `P2=0`; audit
  completeness `COMPLETE` trong phạm vi proof in-memory.
- Builder đã dùng đủ `2/2` repair rounds. Independent QA chỉ sửa một lỗi oracle
  Git-blob của chính suite QA; không sửa candidate hoặc thay expected baseline.
- Final Evidence Record có tổng phạm vi `11/20` path. Source/test MG5, REG4 và
  BOS-AI1 giữ nguyên giữa Technical Baseline và hồ sơ bằng chứng cuối.
- Remote branch `proof/mg5-v1` đã được xác minh tại Final Evidence Record bằng
  exact SHA; push không force. Documentation-only closure có parent trực tiếp
  là Final Evidence Record và không định nghĩa lại Technical Baseline.
- MG5 V1 chỉ chứng minh model-request admission, fake catalog/adapters,
  proof-only D0–D4 policy, symbolic budget/cost, bounded retry/fallback,
  idempotency, T1 revalidation, strict `UNTRUSTED` output và safe linked audit
  bằng synthetic in-memory data. Kết quả không phải real provider/API,
  durable audit, Business AI Runtime hoặc Production.

## 3. Trạng thái quyền hạn

| Hạng mục | Trạng thái |
|---|---|
| SF2-C2 canonical technical baseline | `FOUNDER-APPROVED` |
| Historical baseline `9c1bae61...` | `PRESERVED / SUPERSEDED` |
| Production-ready | `NO` |
| Merge vào main | `NOT_AUTHORIZED` |
| Tag / release | `NOT_AUTHORIZED` |
| AF3 Engineering Cell V1 Proof | `FOUNDER-APPROVED / COMPLETE` |
| BOS-AI1 | `FOUNDER-APPROVED PROOF BASELINE / COMPLETE` |
| REG4 | `FOUNDER-APPROVED V1 TECHNICAL BASELINE / COMPLETE` |
| MG5 | `FOUNDER-APPROVED PROOF BASELINE / COMPLETE` |
| OC6 | `NOT_AUTHORIZED` |
| Business AI Runtime | `NO_GO / NOT_AUTHORIZED` |
| OpenClaw Production | `NO_GO / NOT_AUTHORIZED` |
| Production Deployment | `NO_GO / NOT_AUTHORIZED` |
| Phase tiếp theo | `PENDING FOUNDER SELECTION / NOT_OPENED` |

Việc ghi nhận canonical baseline tự nó không cho phép push, merge, tag,
release, migration, deploy hoặc thay đổi canonical main. Ngoại lệ hiện hành
chỉ là đúng một documentation-only closure commit có parent trực tiếp
`347ddd2d97a2dfb4f52322086b2c49d568404fee` và fast-forward push được Founder
phê duyệt riêng trên nhánh `proof/mg5-v1`. Mọi phase tiếp theo cần Founder
decision riêng.

Founder approval AF3 thay thế trạng thái `AF3 NOT_AUTHORIZED` trước đó chỉ để
ghi nhận AF3 V1 Proof đã hoàn thành. Quyết định này không cho phép merge vào
main, tag/release, BOS-AI1, REG4, MG5, OC6, Business AI Runtime, OpenClaw
Production, Production Deployment hoặc tự mở phase tiếp theo.

Founder approval REG4 thay thế trạng thái `REG4 NOT_AUTHORIZED` trước đó chỉ để
ghi nhận REG4 Agent Registry V1 Technical Baseline đã hoàn thành. Quyết định
REG4 tự nó không cấp quyền BOS-AI1; các Founder authorization và baseline
approval BOS-AI1 ban hành sau chỉ thay thế giới hạn đó trong đúng phạm vi proof.
Không quyết định nào cho phép merge vào main, tag/release, MG5, OC6, OpenClaw,
Business AI Runtime, Production Deployment hoặc tự mở phase tiếp theo.

Founder approval BOS-AI1 thay thế trạng thái `BOS-AI1 NOT_AUTHORIZED / PENDING
FOUNDER DECISION` chỉ để ghi nhận BOS-AI1 Proof Baseline đã hoàn thành. Quyết
định không cho phép source/test change sau baseline, merge main, tag/release,
MG5, OC6, OpenClaw, Business AI Runtime, Production hoặc tự mở phase tiếp theo.

Founder approval MG5 thay thế trạng thái `MG5 NOT_AUTHORIZED` trước đó chỉ để
ghi nhận MG5 Proof Baseline V1 đã hoàn thành. Quyết định không cho phép sửa
source/test sau baseline, merge main, force push, tag/release, OC6, OpenClaw,
Business AI Runtime, Production hoặc tự mở phase tiếp theo.

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
- [REG4 Evidence Index](./reg4/REG4_EVIDENCE_INDEX.md)
- [REG4 Final Evidence Package](./reg4/REG4_EVIDENCE_PACKAGE.md)
- [REG4 to BOS-AI1 Design Alignment](./reg4/REG4_BOS_AI1_DESIGN_ALIGNMENT.md)
- [BOS-AI1 Proof Baseline](./bos-ai1/BOS_AI1_PROOF_BASELINE.md)
- [BOS-AI1 Evidence Index](./bos-ai1/BOS_AI1_EVIDENCE_INDEX.md)
- [BOS-AI1 P1 Closure Evidence Package](./bos-ai1/BOS_AI1_P1_CLOSURE_EVIDENCE_PACKAGE.md)
- [BOS-AI1 Formal Traceable Test](./bos-ai1/BOS_AI1_P1_CLOSURE_FORMAL_TRACEABLE_TEST.md)
- [BOS-AI1 Independent Review](./bos-ai1/BOS_AI1_P1_CLOSURE_INDEPENDENT_REVIEW.md)
- [MG5 Proof Baseline](./mg5/MG5_PROOF_BASELINE_V1.md)
- [MG5 Evidence Index](./mg5/MG5_EVIDENCE_INDEX.md)
- [MG5 Evidence Package](./mg5/MG5_EVIDENCE_PACKAGE.md)
- [MG5 Formal Traceable Test](./mg5/MG5_FORMAL_TRACEABLE_TEST.md)
- [MG5 Independent Review](./mg5/MG5_INDEPENDENT_REVIEW.md)
- [MG5 Provenance Manifest](./mg5/MG5_PROVENANCE_MANIFEST.md)

Nếu tài liệu cũ mâu thuẫn với trạng thái này, các Founder approval và exact
commit/tree trong Mục 1 là điểm đối chiếu hiện hành. Trạng thái điều hành sau
khi ghi nhận: **STOP**.

Sau Founder approval AF3, trạng thái điều hành vẫn là **STOP** để Founder chọn
phase tiếp theo; không phase nào được tự động mở.

Sau Founder approval BOS-AI1 Proof Baseline và documentation-only closure,
trạng thái điều hành vẫn là **STOP**. Không phase nào được tự động mở.

Sau Founder approval MG5 Proof Baseline V1 và documentation-only closure,
trạng thái điều hành vẫn là **APPROVED / COMPLETE / STOP**. Không phase nào
được tự động mở.
