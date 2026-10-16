# ADR-007 — D7: ba connector M1 trên backend framework chung

- Trạng thái: **ASSUMPTION_PENDING_FOUNDER**, không mở connector/account runtime.
- Nhiệm vụ: BOS-V31A-ARCH-01; ngày **16/10/2026, Asia/Ho_Chi_Minh**.

## Bối cảnh và lựa chọn

D7 chọn website/form, Meta Lead Ads, Zalo OA cho M1; Google/TikTok sau M1. W0 A6 có source cả ba nhưng entitlement/deployed state UNKNOWN; Zalo missing-signature/ACK trước persist là gap đã báo, không readiness proof. All-channel capability map cũ vẫn dùng cho kiến trúc tổng thể và các chặng sau.

- **A — Mọi kênh ngay:** breadth lớn nhưng permission/quota/cost chưa rõ, khó chứng minh một hành trình M1.
- **B — Mỗi connector có luật/dedup/scheduler/CRM riêng hoặc n8n ở product path:** nhanh riêng lẻ nhưng nhân writer, trái D2.
- **C — Backend framework hữu hạn + ba source adapters:** dùng core scope/inbox/key/cap/receipt, giữ native semantics. Chọn **C** theo giả định D7.

## Đề xuất M1 và khung chung

| Nguồn | Capability M1 | Giới hạn |
|---|---|---|
| Website/form | Auth/binding, source trail/consent capture, durable intake/receipt | Form submit/mail success không là qualification/owner ACK; Organic thiếu evidence UNKNOWN |
| Meta Lead Ads | Signed webhook, lead retrieval, backfill/polling bù theo quyền/API hỗ trợ; Page/form/leadgen IDs | Không mở Ads campaign/spend/CAPI purchase; quyền app/Page/account phải chứng minh riêng |
| Zalo OA | Authenticated inbound event/message→inbox→CRM/handoff; polling/readback bù nếu capability thật có | Không giả có recovery API lịch sử; missing signature rejected, ACK sau commit; không gửi khách M1 |

Framework gồm IntegrationBinding versioned theo tenant/company/account; secret_ref/workload auth; chữ ký/token/replay defense khi giao thức hỗ trợ; native event identity/hash; pagination/watermark/checkpoint; rate-limit/backoff/jitter/deadline; webhook+polling reconciliation; errors/UNKNOWN; API pin/capability manifest; logs/redaction và contract tests. Token “theo tenant” vẫn hẹp **company/account/capability**, không grant audience/write xuyên company.

Webhook và polling dùng cùng source event key; retry không sinh key mới/phone dedup mọi nhu cầu. Source auth không tự chứng minh nội dung đúng hoặc cấp quyền liên hệ. Account/retrieval thiếu proof giữ UNVERIFIED/NEEDS_INPUT, không READY từ tên connector hoặc số0 giả.

Backend giữ product scheduler/retry; [ADR-002](ADR-002-D2-n8n-product-boundary.md) để n8n nội bộ. Không dựng workflow engine tổng quát. Legacy hook/n8n dependency có thì inventory/cutover trong nhiệm vụ riêng, không tự tắt/gỡ. Google/TikTok đang chạy giữ nguyên, chỉ không thuộc backlog xây M1.

## Trade-off, nghiệm thu và nguồn

Chọn operation registry hữu hạn, không abstraction ép mọi native schema giống nhau. Provider rate/quota/version vẫn cần maintainer; thiếu quyền dùng fixture, không đăng nhập thật để chứng minh thiết kế. Nếu provider không cho polling history thì công bố gap/retention và đường đối soát, không hứa bù vô điều kiện.

[TASK](../TASK.md) D2/D7/B6; W0 A6; [connectors](../connectors.md); [CHANNELS kế thừa](../../overall-design-20261016/CHANNELS.md). MB-02–06; [acceptance](../acceptance-matrix.md) T01–T08/T10/T30/T31, V3A-T01/02/18/19/23. Contract/provider/live tests NOT_RUN; ADR không gọi account/API thật.
