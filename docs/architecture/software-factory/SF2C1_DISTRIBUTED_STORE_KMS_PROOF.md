# SF2-C1 Distributed Durable Store & KMS Proof

> Scope: staging/test-only proof. Không phải runtime hoặc production deployment.

## 1. Components

| Component | Responsibility | Explicit boundary |
|---|---|---|
| `HttpDurableStatePortProof` | Durable State Port RPC client | loopback only; redirect denied; bounded request/response; private ephemeral token; production-ready false |
| `SqliteDurableStoreProofEngine` | SQLite schema, atomic transaction, CAS/unique và consistent snapshot | isolated temporary DB; không Business OS data |
| store proof server | Process/network owner của store engine và fault injection | test fixture, temp path và minimal child env only |
| `HttpKmsKeyProviderProof` | Exact Key Provider RPC surface | canonical prehash only; không raw Business payload/public state/raw-key/export API |
| KMS proof server | encrypted vault, sign/verify, authenticated lifecycle/audit | separate process; runtime master key only |
| SF2-C1 worker | multi-process commit client | nhận trusted decision digest + scoped ephemeral RPC credentials; không DB handle/raw key/master key |

## 2. Store schema/invariants

Temporary proof schema tách seven record families:

1. state records by `(scope_id, revision)`;
2. checkpoints by `(scope_id, revision)`;
3. receipts by `(scope_id, request_id)`;
4. idempotency records by `(scope_id, request_id)`;
5. evidence records by `(scope_id, request_id)`;
6. transaction seals by `(scope_id, request_id)`;
7. ordered audit events by `(scope_id, sequence)`.

Mọi family có unique transaction binding. `BEGIN IMMEDIATE` đọc current revision, kiểm tra request uniqueness, xác minh audit tip và insert toàn complete set trước `COMMIT`. Không có receipt-committed/state-missing success path.

Recovery dùng one SQLite read transaction để dựng current tip, requested transaction và `history_record_sets` cho mọi revision. Core tiếp tục verify digest/HMAC/evidence; adapter không thay Business/authorization policy.

## 3. KMS vault

Vault chỉ giữ ciphertext + AES-GCM nonce/tag + descriptor status và bị khóa dưới OS temp directory. Runtime master key và service token được sinh trong test harness, truyền qua minimal environment riêng cho KMS process, zeroed ở các Buffer có thể kiểm soát khi shutdown và không persist. Raw data key chỉ tồn tại ngắn trong KMS process memory, được zero sau sign/verify/encrypt. Một metadata authentication key riêng được derive bằng HKDF từ master key; mọi key row và audit event có HMAC riêng, được verify trước khi dùng. Lifecycle actor/reason chứa secret/PII bị deny trước transaction.

`signCanonical`/`verifyCanonical` canonicalize và SHA-256 prehash trong application boundary. KMS RPC chỉ nhận exact digest envelope `{prehash_schema_version, algorithm, canonical_sha256}` rồi HMAC envelope đó; raw input/next-state/secret không đi qua KMS network/process boundary.

Application nhận duy nhất descriptor/reference hoặc kết quả crypto. Lifecycle:

```text
KEY_CREATED ACTIVE v1
  → KEY_ROTATED: v1 VERIFY_ONLY, v2 ACTIVE
  → old records verify with v1
  → KEY_REVOKED v1
  → v1 recovery FAIL-CLOSED
```

## 4. Threat model và tests

| Threat | Proof |
|---|---|
| double execution/concurrent retry | two worker processes through two store service processes/SQLite connections; exactly one committed outcome, loser replay |
| race/concurrent commit | two store processes sharing one WAL database, different requests at revision 0; one CAS winner |
| stale revision | SF2-B regression + real store CAS path |
| restart/process crash | store/KMS service restart and worker SIGKILL after commit |
| lost ACK | commit then disconnect; complete-set recovery once |
| timeout/unknown/unavailable | injected before commit, store stopped, KMS stopped/timeout; no guessed success |
| partial write/history missing | delete current receipt or old evidence out-of-band; recovery fail closed |
| tampered HMAC | corrupt seal auth tag; KMS verification fails |
| replay/payload mismatch | same payload replay; changed payload HMAC deny |
| key rotation/revocation | old-version verify across KMS restart; revoked version denies recovery |
| vault status/audit rewrite | HKDF-separated metadata MAC; sửa status và xóa revoke tail làm authenticated read fail closed |
| forged authorization/TOCTOU | trusted decision set and deferred verifier mutation test |
| secret leakage | spy KMS RPC chứng minh chỉ prehash qua boundary; scan durable DB/WAL và KMS vault cho raw secret/master/token |
| inherited credential leakage | store/KMS/worker child environment is explicit OS allowlist only |
| redirect/body exfiltration | HTTP redirect error, target nhận 0 body; client request/stream response byte cap |
| slow body after headers | one AbortController covers fetch + body read + parse/validation |
| deep/oversized input | depth/node/per-string/key/cumulative UTF-8 budget rejection before side effect |
| replica stale read | not supported by SQLite proof; residual risk, no claim |

## 5. Failure policy

- No automatic retry that changes request/revision.
- Client timeout/unavailable returns explicit failure.
- Unknown commit triggers consistent recovery; absent/partial set returns failure.
- Same request race can replay only after complete HMAC verification.
- Store/KMS request and streamed response are byte-limited; response remains timeout-bound through canonical validation.
- HTTP redirect is always denied; only the originally validated loopback origin may receive the RPC body.
- Proof RPC endpoint is loopback only and authenticated with ephemeral token.

## 6. Forbidden surfaces

Không migration trong `database/`, production/staging credential, production database, API/UI, Codex/OpenClaw runtime, Business/Executive Agent, Registry service, Model Gateway, Telegram runtime, autonomous write hoặc deploy.

## 7. Rollback

Remove SF2-C1 adapters/fixtures/test and revert canonical resource budget/prehash/export/script/docs. Proof databases/vaults only exist under OS temp directory and are removed by test cleanup. Không có business/production data để migrate hoặc rollback.
