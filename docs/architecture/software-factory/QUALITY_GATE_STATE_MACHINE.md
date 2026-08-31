# Software Factory Quality Gate State Machine

```text
REQUESTED
→ ANALYZED
→ ARCHITECTURE_APPROVED
→ READY_TO_BUILD
→ BUILDING
→ BUILT
→ IN_REVIEW
→ REVIEW_PASSED
→ TESTING
→ TEST_PASSED
→ UAT_READY
→ UAT_PASSED
→ RELEASE_CANDIDATE
→ AWAITING_FOUNDER_APPROVAL
→ BASELINED
→ ROLLED_BACK (khi cần)
```

Nhánh lỗi: `IN_REVIEW → BLOCKED | CHANGES_REQUESTED`; `TESTING → FAILED`. `CHANGES_REQUESTED` hoặc `FAILED` chỉ được Orchestrator đưa về `READY_TO_BUILD`, sau đó phải chạy lại Build → Review → Test bằng `build_cycle` mới; evidence của cycle cũ không được tái sử dụng. `BLOCKED` không có Agent transition tự mở khóa.

| Target state | Actor | Evidence/prerequisite |
|---|---|---|
| ANALYZED | Product Owner | RequirementArtifact |
| ARCHITECTURE_APPROVED | Architect | ArchitectureArtifact |
| READY_TO_BUILD | Orchestrator | architecture gate đã qua |
| BUILDING/BUILT | một Builder đã nhận run | ImplementationArtifact trước BUILT |
| IN_REVIEW | Orchestrator | build hoàn tất |
| REVIEW_PASSED/BLOCKED/CHANGES_REQUESTED | Independent Reviewer | ReviewArtifact cùng status; không phải Builder |
| TESTING/TEST_PASSED/FAILED | QA | QA độc lập; TestArtifact AUTOMATED |
| UAT_READY/UAT_PASSED | QA | TestArtifact UAT PASS hoặc explicit NOT_REQUIRED |
| RELEASE_CANDIDATE | Release Agent | Review/Test/UAT đã qua + ReleaseArtifact CANDIDATE |
| AWAITING_FOUNDER_APPROVAL | cùng Release Agent | candidate hợp lệ |
| BASELINED | cùng Release Agent | Founder/authorized human APPROVED |

Transition không nằm trong map bị `INVALID_GATE_TRANSITION` và được audit là denied. Không có action Agent thông thường để skip hoặc hạ gate.
