# ADR-0025: CP1 Governed Agent Control Plane và Production/Project thin slice

- **Trạng thái:** Accepted and CP1 Implemented
- **Ngày:** 2026-08-30
- **Authority:** Founder Approval F0
- **Liên quan:** ADR-0019, ADR-0020, ADR-0021, ADR-0022, ADR-0023, ADR-0024

## Ngữ cảnh

Founder đã phê duyệt F0 và chỉ cho phép mở CP1. Hai rủi ro P0 cần xử lý trong phạm vi CP1 là Legacy Assistant có direct database CRUD và Agent runtime tương lai có thể nhận tenant/company/identity không đáng tin cậy.

CP1 không được mở Agent Factory, Registry production, Model Gateway, OpenClaw, autonomous write hoặc production deployment.

## Quyết định

### 1. Tách Legacy và Governed Agent Path

Legacy Assistant tiếp tục chạy qua namespace compatibility riêng để không phá chức năng hiện tại. Governed Agent Path không được import Legacy AI Actions, Supabase client, generic SQL hoặc generic CRUD.

Static security test duy trì boundary này.

### 2. Trusted Agent Identity

Agent Identity chỉ được tạo từ trusted backend resolver. Identity được brand bằng object identity nội bộ, có TTL, immutable và không thể thay bằng object do Agent/model tự khai hoặc clone.

CP1 chỉ chấp nhận decision level READ_ONLY hoặc RECOMMEND và runtime TEST, DEVELOPMENT hoặc STAGING.

### 3. Immutable Company Context

Company Context chỉ được resolve qua trusted Business OS resolver dựa trên tenant, company và actor từ Agent Identity. Context phải đủ ecosystem, user, role, department, permissions, policy, KPI/process, data scope và enabled capabilities.

Context được deep-freeze, gắn digest và binding với đúng Agent Identity. Thiếu, giả mạo, cross-tenant, cross-company hoặc thay context giữa Run đều DENY.

### 4. Một typed tool và Application Service

CP1 chỉ đăng ký tool production.delivery_risk.assess.

Tool chỉ gọi Application Service production.delivery-risk-assessment ở mode READ_ONLY. Application Service chỉ chấp nhận repository contract loadAssessmentInput; repository có generic database methods bị từ chối.

Application Service kiểm tra tenant, company, Project, Production Order, quan hệ dữ liệu và data scope trước khi gọi Production Domain.

### 5. Domain quyết định, Agent đề xuất

Production Domain dùng canonical manufacturing schedule rules để đánh giá ngày giao, công đoạn hiện tại, delay và risk.

Domain trả PASS/DENY cùng reason_code. Chỉ khi PASS, reasoner mới nhận facts đã immutable để tạo recommendation. DENY là kết quả cuối và không gọi reasoner.

Recommendation không được chứa auto-execution, mutation, command hoặc tool call.

### 6. Audit

CP1 dùng append-only in-memory hash-chain ledger để chứng minh trace:

actor → Agent/version → tenant/company/data scope → tool/Application Service → Domain decision → recommendation.

Đây là evidence cho CP1, không phải audit persistence production.

## Hệ quả

- Governed path fail closed và không có direct database tool.
- Legacy direct-write vẫn tồn tại trong compatibility namespace; không được xem là Agent runtime hợp lệ.
- Resolver, typed repository và reasoner được inject tại composition boundary; CP1 không tạo production API/runtime.
- Audit persistence, Registry, Model Gateway và OpenClaw tiếp tục thuộc phase sau và chưa được phép.
- Agent/OpenClaw production vẫn NO_GO.

## Evidence

Xem docs/architecture/CP1_AGENT_CONTROL_PLANE_AND_REVIEW.md.
