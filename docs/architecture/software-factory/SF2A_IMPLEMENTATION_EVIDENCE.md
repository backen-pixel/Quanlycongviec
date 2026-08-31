# SF2-A Implementation Evidence

> **BR-1B reconstruction notice (2026-08-31):** The material below is preserved historical narrative from the protected snapshot. Its PASS/review statements are unverified and are not a PASS claim or independent attestation for R30AB. R30AB is a new consolidated SF2-A+B recovery candidate, not an original historical SF2-A commit.

---

> Ngày: 2026-08-30  
> Founder scope: SF2-A only  
> Trạng thái cuối: PASS/STOP  
> Independent review: PASS, không có P0/P1

## 1. Implemented surface

- `backend/src/softwareFactory/canonical.js`: canonical serialization và SHA-256 digest.
- `evidenceContracts.js`: provenance, redaction và deterministic Evidence Envelope.
- `artifactContracts.js`: semantic validation, provenance/digest và integrity verification.
- `mutationGuard.js`: revision, keyed-HMAC idempotency receipt, replay và single-active-writer guard.
- `stateContracts.js`: persistence-neutral port, checkpoint/recovery và CAS coordinator.
- `runtimeAdapterContract.js`: idempotency capability contract, run-scoped key và same-process retry cache cho test adapter.
- `auditLedger.js`, `approvalAuthority.js`: redact trước khi lưu/hash.
- `controlPlane.js`: guarded mutations, parent trace validation, evidence envelope và integrity checks.
- `backend/tests/software-factory-control-plane.test.js`: giữ 28 baseline test và thêm 16 adversarial SF2-A test.

Không có route, migration, database/Supabase client, UI, runtime adapter thật, Codex/OpenClaw integration, Business Agent Registry service hoặc production configuration được thêm.

## 2. Test evidence

Lệnh:

```powershell
cd C:\Projects\Quanlycongviec\backend
npm run test:software-factory
```

Kết quả gần nhất: `44/44 PASS`, gồm `28/28` SF1 baseline và `16/16` SF2-A adversarial/recovery tests.

Full regression gần nhất:

- CP1: `23/23 PASS`;
- Software Factory: `44/44 PASS`;
- Business OS, gồm Domain boundary: `69/69 PASS`;
- syntax check toàn bộ `backend/src/softwareFactory/*.js`: PASS.

Independent reviewer đã chạy lại độc lập và xác nhận:

- Software Factory `44/44 PASS`;
- CP1 `23/23 PASS`;
- Business OS `69/69 PASS`;
- syntax `17/17` Software Factory JavaScript files PASS;
- không có route/API/database/migration/Supabase/UI/Codex/OpenClaw/Business Agent runtime/production config/deploy mới.

Các candidate P1 về redacted-input idempotency collapse, free-form leak, stale provenance policy, orphan receipt, runtime retry và cross-run key collision đã được tái hiện trước khi sửa rồi xác minh lại sau sửa. Kết luận cuối: không còn P0/P1.

## 3. Security/recovery evidence covered

- missing/invalid provenance;
- artifact semantic failure và local rollback;
- secret/PII redaction trong artifact/audit;
- deterministic evidence và artifact/evidence tamper;
- cross-run parent trace;
- stale revision, replay, idempotency-key mutation;
- different raw secret collapsing to the same redaction marker;
- concurrent writer và CAS conflict;
- persistence adapter deny;
- restart/recovery, tampered checkpoint và changed-state replay.
- orphan receipt/missing checkpoint fail-closed;
- runtime evidence retry và cross-run idempotency-key collision.

## 4. Known residual risks

1. Core và audit vẫn in-memory; không có durability, retention hoặc distributed coordination.
2. State Port mới là interface/coordinator; chưa có adapter thật và chưa chứng minh transaction trên database.
3. External source digest chưa được core recompute vì không có repository/tool adapter.
4. Redaction dựa trên pattern; chưa phải enterprise DLP/secret scanning.
5. Identity vẫn dùng trusted resolver contract/test fixture; chưa tích hợp service identity/JWT production.
6. Không có runtime eligibility hoặc release authority ngoài local control-plane contract.
7. Same-process runtime cache không giải quyết crash sau external effect; adapter thật tương lai bắt buộc deduplicate scoped idempotency key, nhưng adapter đó chưa được phép triển khai.
8. P2 không chặn: evidence validator chưa giới hạn object thành JSON plain object; `Map`, `Set`, `Date` có thể bị traversal thành `{}`. Chưa nhận các loại này làm evidence hợp lệ trong vận hành; cần deny rõ ở hardening tương lai.
9. HMAC key storage/rotation chưa được thiết kế; envelope SHA-256 là integrity checksum, chưa phải chữ ký nguồn độc lập.

## 5. Rollback

Rollback SF2-A chỉ cần revert các thay đổi trong `backend/src/softwareFactory/`, test Software Factory và hai tài liệu SF2-A. Không có schema/data/runtime state cần khôi phục. Không chạy destructive database command.

## 6. Release decision

SF2-A đạt PASS và chuyển ngay sang STOP. P2 được ghi nhận nhưng không chặn local/test-only gate. Không mở SF2-B, persistence/API/UI, Codex/OpenClaw adapter, Agent runtime, real package release, runtime eligibility hoặc production deploy. Mọi bước sau cần Founder approval mới.
