# FOUNDER APPROVAL F0 — BẮT ĐẦU CP1 CONTROL PLANE

> **BR-1B reconstruction notice (2026-08-31):** The material below is preserved historical narrative from the protected snapshot. It is not a current PASS claim, approval, or commit-bound attestation for this reconstructed candidate. Formal traceable testing and Independent Review are not authorized in BR-1B.

---

> Authority: Founder
>
> Ngày tiếp nhận: 2026-08-30
>
> Quyết định: F0 PASS; cho phép CP1; không cho phép phase sau hoặc production runtime

## 1. Quyết định Founder

F0: **PASS**.

Chấp nhận:

- Long-term AI Operating System Platform Charter;
- ADR-0024;
- Gap Analysis;
- roadmap tuần tự;
- các P0/P1 findings đã xác định;
- nguyên tắc Think top-down, Build bottom-up, Validate end-to-end, Scale by replication.

Cho phép bắt đầu CP1.

Chưa cho phép mở:

- SF2;
- AF3;
- REG4;
- MG5;
- OC6;
- OpenClaw production;
- Agent production;
- autonomous write;
- production deployment.

## 2. Nhiệm vụ CP1

Xây CP1 bằng một Production/Project Thin Vertical Slice.

Mục tiêu không phải xây Production AI hoàn chỉnh. Mục tiêu là chứng minh Control Plane có thể kiểm soát an toàn một AI Agent theo luồng:

Agent Identity
→ Company Context
→ Permission
→ Application Service
→ Domain Rules
→ PASS / DENY
→ Audit.

## 3. Việc P0 phải làm trước

Ưu tiên số 1 là cô lập đường direct database write hiện tại của Legacy Assistant qua aiActions.js.

Agent tương lai không được:

- direct Supabase CRUD;
- generic table CRUD;
- generic SQL;
- direct database credential;
- bypass Application Service;
- bypass Domain Rules.

Không phá chức năng production hiện tại. Nếu cần compatibility layer cho Legacy Assistant thì phải tách rõ LEGACY và GOVERNED AGENT PATH.

## 4. Agent Identity

Mỗi Agent Run phải xác định được tối thiểu:

- agent_id;
- agent_version;
- role;
- domain;
- capabilities;
- decision_level;
- tenant;
- company;
- user/actor;
- permission scope;
- runtime environment.

Thiếu hoặc không hợp lệ phải DENY BY DEFAULT. Agent không được tự khai hoặc tự nâng identity/authority.

## 5. Immutable Company Context

Company Context phải được resolve từ Business OS, không lấy từ lời model tự khai.

Context tối thiểu gồm:

- ecosystem;
- tenant;
- company;
- user;
- role;
- department;
- permissions;
- policy;
- process/KPI context;
- data scope;
- enabled capabilities.

Sau khi Run bắt đầu, Company Context phải immutable. Agent không được tự đổi company, tenant hoặc permission giữa một Run. Cross-company mặc định DENY.

## 6. Production/Project Thin Vertical Slice

Use case ưu tiên:

> Đánh giá nguy cơ trễ tiến độ của một Project/Production Order so với ngày giao hàng và đề xuất hành động.

Luồng mục tiêu:

Project / Production data
→ Production/Project Application Service
→ Domain Rules
→ Agent-readable result
→ AI analysis
→ Recommendation
→ Audit.

Agent ở CP1 chỉ được READ_ONLY hoặc RECOMMEND. Không AUTO_EXECUTE. Không cho Agent tự thay đổi tiến độ, ngày giao, công đoạn hoặc trạng thái production.

## 7. Domain Ownership

Production scheduling rules thuộc Production Domain. Project deadline rules thuộc Project Domain.

Agent chỉ reasoning trên dữ liệu/kết quả được Application Service cung cấp. Không đưa canonical Business Rules vào prompt để thay thế Domain Rules.

Nguyên tắc:

**AI THINKS. BUSINESS OS DECIDES. DOMAIN RULES ENFORCE.**

## 8. PASS / DENY Contract

Domain/Application Service phải trả PASS hoặc DENY kèm reason_code.

Agent phải tôn trọng DENY và không được retry bằng đường khác để bypass policy.

## 9. Security Tests bắt buộc

CP1 phải fail closed với:

- missing tenant;
- missing company;
- fake company;
- cross-tenant access;
- cross-company access;
- insufficient permission;
- spoofed Agent Identity;
- changed Company Context;
- direct database attempt;
- forbidden tool;
- Domain DENY.

## 10. Audit

Mỗi Agent request phải trace được:

Founder/User
→ Agent Identity
→ Company Context
→ Application Service
→ Domain decision
→ Result/Recommendation.

Audit phải xác định được actor, Agent/version, company, data scope, tool/service, Domain PASS/DENY và recommendation.

## 11. Không over-engineer

Chỉ xây đủ cho CP1 và thin vertical slice. Không xây trước toàn bộ Agent Factory, Registry production, Model Gateway, OpenClaw, Production AI hoặc Project AI.

Contract CP1 phải tương thích với North Star và roadmap tương lai.

## 12. Exit Gate CP1

CP1 chỉ PASS khi có evidence chứng minh:

1. Agent Identity fail-closed.
2. Company Context immutable.
3. Tenant/company isolation PASS.
4. Direct database path không tồn tại trên governed Agent path.
5. Use case Production/Project chạy xuyên Application Service → Domain Rules.
6. PASS/DENY hoạt động đúng.
7. READ_ONLY/RECOMMEND hoạt động.
8. Audit trace đầy đủ.
9. Security negative tests PASS.
10. Existing Business OS regression tests không bị phá.

Sau khi hoàn thành phải STOP, không tự mở SF2, và báo Founder PASS, CONDITIONAL_PASS hoặc NO_GO kèm evidence.

## 13. Nguyên tắc dài hạn

Production/Project slice là sợi chỉ xuyên suốt cho CP1 → SF2 → AF3 → REG4 → MG5 → OC6 → Pilot.

Không biến slice thành logic hard-code riêng cho công ty hiện tại. Cùng Brain/Agent Package về sau phải chạy cho công ty thứ hai bằng Company Context/Industry Pack mà không fork source.
