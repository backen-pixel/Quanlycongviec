# MASTER CONTEXT — Trạng thái kiểm soát hiện hành

> Cập nhật: 2026-09-03
>
> Authority: các Founder Approval trước đây và Founder Approval — BOS-AI1 Draft Pre-Effect Handoff Proof Baseline V1, 2026-09-03
>
> Trạng thái: **BOS-AI1 DRAFT PRE-EFFECT HANDOFF V1 FOUNDER-APPROVED / DOCUMENTATION CLOSURE / OC6 G0 CONDITIONAL**

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

### 1.1. BOS-AI1 Controlled Publish Proof Baseline V1 — phê duyệt được bảo toàn

- Technical Baseline: `1317f1468a341379f51e33b5631d7767af7c8848`.
- Git tree: `ab7296b7ac316ea24324f5dc431a66c3375d91ca`.
- Final Evidence Record: `24f5cec5880e5f37c60930cd07388a8ec360d414`.
- Evidence tree: `0bed4862bc3dbc7a1b6806481519785fd7103a81`.
- Historical READ/DRAFT Technical Baseline: `f44c14365589b7ff9f1df2ce40185ef8ebece05f`,
  tree `f17e4c4f699335ddad056310c8d70e3ed3df6909`; giữ nguyên lịch sử và source/test.

Baseline mới chỉ bổ sung `project.publish_status_update` / LIMITED_WRITE giả
lập trong bộ nhớ. Mốc bằng chứng không thay phiên bản code chuẩn. Xác minh
đóng hồ sơ đã đọc Git object và 24 artifact từ evidence đã commit: Formal
195/195 và Independent Adversarial 152/152 cùng gắn đúng technical commit/tree
trên; source/test ở evidence record không đổi. Chi tiết:
[Controlled Publish Baseline V1](./bos-ai1/BOS_AI1_CONTROLLED_PUBLISH_BASELINE.md).

### 1.2. BOS-AI1 Pre-Effect Handoff Proof Baseline — phê duyệt được bảo toàn

- Founder verdict ngày 2026-09-03: **APPROVED**, chỉ trong phạm vi proof giả lập.
- Technical Baseline: `a4c80f30e3afcf8d0c2fec43d8634368890b383d`.
- Git tree: `7850bf028741e6319c62262cbd2b2f86c822134a`.
- Final Evidence Record: `18fd91bbc7e6ae8bfe10f4519219a4c53642d83e`.
- Evidence tree: `104f8e9254d6e2fcec1faa033decc94fa6ede0ce`; direct parent là technical baseline.
- Formal 535/535 và Independent Adversarial 173/173 cùng gắn chính xác commit/tree
  kỹ thuật trên; P0/P1/P2=0/0/0. Xác minh trước ghi hồ sơ đã kiểm tra Git objects,
  toàn bộ 123 artifact SHA-256, manifest, log TAP gốc và source/test blobs.
- Mốc bằng chứng và closure tài liệu không thay technical baseline. Source/test
  từ technical đến evidence không đổi. Các baseline READ/DRAFT và Controlled
  Publish cùng hồ sơ lịch sử được giữ nguyên.

Bổ sung này chứng minh BOS quyết định và audit trước tác động, bàn giao permit
cho Application Service, Domain có quyền veto trước fake adapter, tái kiểm tra
authority/approval và chống lặp. Chỉ dữ liệu, approval, Domain, audit và effect
giả trong bộ nhớ. Hồ sơ: [Pre-Effect Handoff Baseline](./bos-ai1/BOS_AI1_PRE_EFFECT_HANDOFF_BASELINE.md).

### 1.3. BOS-AI1 Draft Pre-Effect Handoff Proof Technical Baseline V1 — quyết định hiện hành

- Founder verdict ngày 2026-09-03: **APPROVED — SYNTHETIC PROOF ONLY**.
- Technical Baseline: `a0fbabb9e210b4fdf2ad2e7fc2b8e9f89200d0d0`.
- Technical tree: `6d0e3895400599570aefffaa14430231c1dfa443`.
- Final Evidence Record: `3f7092a3902a9050846ef497056793bf5d690b71`.
- Evidence tree: `93b4021addb044d5e33097c4915a84ea4d6794f5`; direct parent là technical baseline.
- Formal 884/884, Independent Test 223/223 và Independent Regression 884/884 cùng
  gắn chính xác technical commit/tree trên. P0/P1/P2=0/0/0; 8/10 file; 1/2 vòng sửa.
- Kiểm tra trước ghi hồ sơ đã đọc Git objects, 366 artifact bytes/hash, manifest,
  TAP gốc và source/test blobs. Cả năm worktree build/FTT/IR sạch; delta từ code
  đến evidence chỉ là bốn tài liệu. Các baseline và bằng chứng lịch sử giữ nguyên.
- G0 phải dùng technical baseline DRAFT này cùng REG4
  `3def40122e4072f266c943bc4eb84d3164501339` / `aef6c623ce7f549b560af46e73a7ee6d0abd35ae`
  và MG5 `c0ba1b282422c68bd96478d7585f2c2381198420` / `02f6ed227a288009f449ef9de4e94ba98ceb6c33`.

BOS-AI1 ALLOW chỉ cấp Execution Permit, chưa tạo draft. Audit trước tác động phải
thành công; Application Service điều phối qua Domain ALLOW/DENY/STOP. Domain veto
không tạo draft; ALLOW tạo đúng một draft; duplicate tuần tự, đồng thời trong một
tiến trình và gọi lồng không tạo draft thứ hai. Mọi kết quả có correlation_id/audit.
Hồ sơ: [Draft Pre-Effect Handoff Baseline](./bos-ai1/BOS_AI1_DRAFT_PRE_EFFECT_HANDOFF_BASELINE.md).

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

### 2.5. Controlled Publish Proof Baseline V1

- Founder verdict: **APPROVED**; Formal 195/195, Independent Adversarial 152/152.
- P0=0, P1=0, P2=0; proof diff 8/12 file; implementation repair 0/2.
- Worktrees clean; evidence đã push đúng `proof/bos-ai1-controlled-publish-v1`.
- Chỉ dữ liệu, approval, adapter và effect giả trong bộ nhớ. Không chứng minh
  Publish thật, database/email/hệ thống thật, durable audit, chịu tải, phục hồi
  hoặc readiness Production.
- Founder cho phép đúng một documentation-only closure commit nối tiếp
  `24f5cec5880e5f37c60930cd07388a8ec360d414` và fast-forward push cùng nhánh.
- Sau đóng hồ sơ: chạy lại OC6 G0 với baseline mới. G0 PASS mới tiếp tục OC6
  Fast Track đã duyệt; G0 FAIL thì STOP và báo exact gap. Không tự duyệt OC6 baseline.

### 2.6. Pre-Effect Handoff Proof Baseline

- Formal: 188 handoff + 195 baseline regression + 152 historical adversarial = 535/535.
- Independent: 173/173 adversarial; reviewer chạy lại 383 repository + 152 historical
  regression trên đúng technical commit/tree. P0=0, P1=0, P2=0.
- Proof diff 8/12 file; repair 2/2. Failed candidate `3d2b647a5d106590b86a18408bf1d631f491dc04`
  và bằng chứng IR-HANDOFF-001 được giữ nguyên; sửa chữa đã được kiểm định ở baseline mới.
- Cả năm worktree build/FTT/IR lịch sử và cuối sạch tại xác minh đóng hồ sơ.
- Founder cho phép đúng bốn hồ sơ quản trị, một commit chỉ tài liệu có direct parent
  `18fd91bbc7e6ae8bfe10f4519219a4c53642d83e`, fast-forward push lên
  `proof/bos-ai1-pre-effect-domain-audit-v1` tại repository đã chỉ định.
- Sau đóng và xác minh hồ sơ, chạy lại OC6 G0 với technical baseline bổ sung này.
  PASS: tiếp tục Fast Track OC6 đã duyệt. FAIL: STOP và báo đúng gap. Không tự duyệt OC6 baseline.
- Không sửa source/test hoặc hồ sơ bằng chứng đã kiểm định; không main, force push,
  PR, merge, tag, release; không OpenClaw/model thật, Business AI Runtime hoặc Production.

### 2.7. Draft Pre-Effect Handoff Proof Baseline V1

- Formal 884/884 = DRAFT 176 + hồi quy 708. Independent 223/223 và independent
  regression 884/884 trên cùng exact technical identity; không fail/skip/cancel/todo.
- IR-DRAFT-P2-001 đã đóng bằng kiểm tra độc lập không đổi; failed candidate
  `38a4dd853100f022843758360464206bfb1e0e58` và bằng chứng thất bại được giữ nguyên.
- Founder cho phép đúng bốn hồ sơ quản trị và một commit chỉ tài liệu có parent
  trực tiếp `3f7092a3902a9050846ef497056793bf5d690b71`, fast-forward push lên
  `proof/bos-ai1-draft-pre-effect-v1` tại repository đã chỉ định. Không sửa source/test/evidence.
- Sau closure và xác minh GitHub: chạy lại OC6 G0 dùng baseline DRAFT mới; PASS
  tự tiếp tục Fast Track hiện hữu, FAIL STOP báo exact gap. Giữ nguyên P01–P14,
  G0–G9, IR-OC6-1, REG4/MG5, giới hạn 20 file/2 vòng sửa. Không tự duyệt OC6 baseline.
- Chỉ dữ liệu giả, Domain/Adapter giả lập và trạng thái/audit trong bộ nhớ. Không
  chứng minh database, Business Rules của Domain thật, durable/tamper-proof audit,
  tải thực tế hoặc Production readiness. Không OpenClaw/model/API/dữ liệu thật,
  Business AI Runtime, Production hoặc phase lớn mới.

## 3. Trạng thái quyền hạn

| Hạng mục | Trạng thái |
|---|---|
| SF2-C2 canonical technical baseline | `FOUNDER-APPROVED` |
| Historical baseline `9c1bae61...` | `PRESERVED / SUPERSEDED` |
| Production-ready | `NO` |
| Merge vào main | `NOT_AUTHORIZED` |
| Tag / release | `NOT_AUTHORIZED` |
| AF3 Engineering Cell V1 Proof | `FOUNDER-APPROVED / COMPLETE` |
| BOS-AI1 | `DRAFT PRE-EFFECT HANDOFF V1 FOUNDER-APPROVED; ALL PRIOR BASELINES PRESERVED` |
| REG4 | `FOUNDER-APPROVED V1 TECHNICAL BASELINE / COMPLETE` |
| MG5 | `PINNED PROOF DEPENDENCY c0ba1b28; NO NEW MG5 WORK` |
| OC6 | `G0 RE-RUN AFTER CLOSURE; CONTINUE EXISTING FAST TRACK ONLY IF PASS` |
| Business AI Runtime | `NO_GO / NOT_AUTHORIZED` |
| OpenClaw Production | `NO_GO / NOT_AUTHORIZED` |
| Production Deployment | `NO_GO / NOT_AUTHORIZED` |
| Phase lớn mới | `NOT_AUTHORIZED` |

Việc ghi nhận canonical baseline tự nó không cho phép push, merge, tag,
release, migration, deploy hoặc thay đổi canonical main. Ngoại lệ hiện hành
chỉ là đúng một documentation-only closure commit và fast-forward push được
Founder phê duyệt riêng trên nhánh Draft Pre-Effect Handoff. Quyền OC6 tiếp tục có
điều kiện theo Mục 2.7; không mở phase lớn mới.

Founder approval AF3 thay thế trạng thái `AF3 NOT_AUTHORIZED` trước đó chỉ để
ghi nhận AF3 V1 Proof đã hoàn thành. Quyết định này không cho phép merge vào
main, tag/release, BOS-AI1, REG4, MG5, OC6, Business AI Runtime, OpenClaw
Production, Production Deployment hoặc tự mở phase tiếp theo.

Founder approval REG4 thay thế trạng thái `REG4 NOT_AUTHORIZED` trước đó chỉ để
ghi nhận REG4 Agent Registry V1 Technical Baseline đã hoàn thành. Quyết định
REG4 tự nó không cấp quyền BOS-AI1; các Founder authorization và baseline
approval BOS-AI1 ban hành sau chỉ thay thế giới hạn đó trong đúng phạm vi proof.
Các giới hạn của quyết định cũ áp dụng tại thời điểm ban hành. Founder Decision
mới chỉ thay thế chúng trong đúng hành lang proof được nêu ở Mục 2.7; merge
main, tag/release, OpenClaw thật, Runtime và Production vẫn không được phép.

Founder approval BOS-AI1 thay thế trạng thái `BOS-AI1 NOT_AUTHORIZED / PENDING
FOUNDER DECISION` chỉ để ghi nhận BOS-AI1 Proof Baseline đã hoàn thành. Quyết
định không cho phép source/test change sau baseline, merge main, tag/release,
MG5, OC6, OpenClaw, Business AI Runtime, Production hoặc tự mở phase tiếp theo.

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
- [Draft Pre-Effect Handoff Proof Baseline V1](./bos-ai1/BOS_AI1_DRAFT_PRE_EFFECT_HANDOFF_BASELINE.md)
- [Pre-Effect Handoff Proof Baseline](./bos-ai1/BOS_AI1_PRE_EFFECT_HANDOFF_BASELINE.md)
- [Controlled Publish Proof Baseline V1](./bos-ai1/BOS_AI1_CONTROLLED_PUBLISH_BASELINE.md)
- [Historical READ/DRAFT Proof Baseline](./bos-ai1/BOS_AI1_PROOF_BASELINE.md)
- [BOS-AI1 Evidence Index](./bos-ai1/BOS_AI1_EVIDENCE_INDEX.md)
- [BOS-AI1 P1 Closure Evidence Package](./bos-ai1/BOS_AI1_P1_CLOSURE_EVIDENCE_PACKAGE.md)
- [BOS-AI1 Formal Traceable Test](./bos-ai1/BOS_AI1_P1_CLOSURE_FORMAL_TRACEABLE_TEST.md)
- [BOS-AI1 Independent Review](./bos-ai1/BOS_AI1_P1_CLOSURE_INDEPENDENT_REVIEW.md)

Nếu tài liệu cũ mâu thuẫn với trạng thái này, các Founder approval và exact
commit/tree trong Mục 1 là điểm đối chiếu hiện hành. Trạng thái điều hành sau
khi ghi nhận theo quyết định mới nhất: **đóng hồ sơ baseline, rồi chạy OC6 G0**.

Sau Founder approval AF3, trạng thái điều hành vẫn là **STOP** để Founder chọn
phase tiếp theo; không phase nào được tự động mở.

Trạng thái STOP của BOS-AI1 V1.2B ở quyết định cũ được giữ làm lịch sử. Founder
Approval Controlled Publish V1 cho phép chạy lại G0 sau closure và tiếp tục
đúng OC6 Fast Track hiện hữu nếu PASS; không tự công nhận OC6 baseline.

Founder Approval Pre-Effect Handoff ngày 2026-09-03 được giữ làm quyết định lịch sử:
G0 phải dùng bổ sung a4c80f30... / 7850bf02... sau khi closure được xác minh.
Các tuyên bố STOP hoặc không cấp quyền OC6 trong quyết định cũ chỉ giữ nghĩa lịch sử.

Founder Approval Draft Pre-Effect Handoff V1 là quyết định hiện hành tiếp nối:
đóng hồ sơ và xác minh GitHub xong mới chạy G0 trên a0fbabb9... / 6d0e3895...,
giữ nguyên REG4/MG5. Chưa tuyên bố G0 PASS; kết quả G0 được ghi riêng sau closure.
