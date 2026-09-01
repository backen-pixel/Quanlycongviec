# SF2-C2 Security Remediation — Local Candidate Evidence

Status: `DEVELOPMENT VALIDATION ONLY / AWAITING FORMAL TRACEABLE TEST DECISION`

This record describes the bounded local remediation authorized by the Founder.
It does not change the canonical baseline, authorize release, or claim a Formal
Traceable Test result.

## 1. Provenance and boundary

- Canonical code baseline preserved: `9c1bae61aa853eb438922b14bff720a32b6125d8`.
- Documentation record starting commit:
  `3da3ed3821bc93cdbfb4719313adc2fe7834c120`.
- Starting commit parent:
  `9c1bae61aa853eb438922b14bff720a32b6125d8`.
- Local branch: `codex/sf2-c2-security-remediation`.
- Local candidate commit and tree are reported externally after the candidate
  commit is created. A commit cannot self-record its own full SHA.
- No production source, business rule, database, migration, release, tag,
  remote branch, or canonical baseline is changed by this task.
- `xlsx` remains exactly `0.18.5`; Excel read/write code is unchanged.

## 2. Controlled dependency changes

No bulk `npm audit fix` was run. Direct packages were pinned explicitly and
transitive packages were pinned through npm `overrides`.

| Package | Before | After | Relationship | Reason | Compatibility risk |
|---|---:|---:|---|---|---|
| axios | 1.15.1 | 1.20.0 | Direct | Resolve aggregate HTTP/proxy/security advisories | Medium: proxy, redirect and outbound request behavior |
| body-parser | 2.2.2 | 2.3.0 | Transitive via Express; override | Invalid-limit enforcement | Low: body parsing and error shape |
| brace-expansion | 2.1.1 | 2.1.4 | Transitive via googleapis/glob; override | Expansion resource-exhaustion advisory | Low |
| engine.io | 6.6.5 | 6.6.9 | Transitive via Socket.IO; override | Polling/WebTransport resource-exhaustion advisories | Medium: transport/reconnect behavior |
| form-data | 4.0.5 | 4.0.6 | Newly declared direct dependency | CRLF escaping; source already imported it directly | Low |
| morgan | 1.10.1 | 1.12.0 | Direct | Log-forging advisory | Low: log formatting |
| multer | 2.1.0 | 2.3.0 | Direct | Upload DoS, nested field and abort-cleanup advisories | Medium: upload rejection/error behavior |
| path-to-regexp | 8.3.0 | 8.4.2 | Transitive via Express router; override | Route-pattern DoS advisories | Medium: route compilation/matching |
| qs | 6.15.0 | 6.16.0 | Transitive via Express/body-parser/googleapis; override | Stringify/limit DoS advisories | Low: query serialization/parsing |
| socket.io-adapter | 2.5.6 | 2.5.8 | Transitive; override | Pull corrected WebSocket dependency graph | Medium: broadcast/adapter behavior |
| socket.io-parser | 4.2.5 | 4.2.7 | Transitive; override | Attachment-count memory exhaustion | Medium: malformed packet rejection |
| undici | 8.3.0 | 8.10.1 | Direct | Aggregate TLS/WebSocket/cache/retry/cookie advisories | Medium: HTTP/TLS/failover behavior |
| ws | 8.18.3 / 8.19.0 | 8.21.3 | Transitive; override and dedupe | Fragment/chunk memory exhaustion and disclosure | Medium: WebSocket framing |

Expected graph-only changes introduced by the target packages include
`axios → https-proxy-agent → agent-base` and updated helper versions required
by body-parser/form-data/qs. They are not new business dependencies.

## 3. Security tests added

Test file: `backend/tests/sf2c2-dependency-security-remediation.test.js`.

The suite covers:

1. exact lockfile contract for all 13 packages and preservation of
   `xlsx@0.18.5`;
2. multipart field-name and filename CRLF escaping;
3. valid upload handling plus file-size, file-count, part-count and field-name
   limits;
4. invalid/oversized body and bounded query parsing;
5. compatibility of the existing `/{*splat}` route;
6. Socket.IO zero/excess attachment and malformed transport/session rejection;
7. Axios resistance to inherited `config.proxy` prototype pollution;
8. Undici HTTP/TLS fail-closed behavior with explicit backup failover.

## 4. Development validation

These are development checks only and are not a Formal Traceable Test result.

| Command | Result |
|---|---|
| `npm run test:sf2c2-security-remediation` | PASS 9/9 |
| `npm run test:agent-control-plane` | PASS 23/23 |
| `npm run test:software-factory` | PASS 57/57 |
| `npm run test:software-factory-sf2c1` | PASS 14/14 |
| `npm run test:software-factory-sf2c2` | PASS 13/13 |
| `npm run test:business-os` | PASS 37/37 |

Aggregate development result: `153/153 PASS`.

Post-change `npm audit --omit=dev --json`:

- Critical: 0
- High: 1
- Moderate: 0
- Low: 0
- Remaining package: `xlsx@0.18.5`
- Automatic fix available for `xlsx`: no

## 5. XLSX options — research only

Current runtime use includes:

- `backend/src/helpers/calc3dParsers/xlsxParser.js`;
- `backend/src/helpers/quotationExcelParser.js`;
- `backend/src/routes/crm/shared/helpersBundle.js`;
- `backend/src/routes/crm/routes/crmTasks.js`;
- `backend/src/helpers/dailyReportAdminNotify.js`.

### Option A — verified SheetJS upgrade

- Candidate: SheetJS Community Edition `0.20.3`, subject to a separate
  authorization and provenance verification.
- Safety: addresses the known `<0.19.3` prototype-pollution and `<0.20.2`
  ReDoS ranges. A fresh audit and malicious-workbook tests remain mandatory.
- Compatibility: best option because it preserves the `xlsx` module and its
  `read`, `write` and `utils.sheet_to_json` API model. SheetJS documents
  read/write support for XLS, XLSX and ODS.
- Breaking risk: medium. Parser normalization, dates, formulas, merged cells,
  codepages and generated-workbook fidelity must be compared.
- Code scope: dependency manifest/lock, supply-chain fixture, and five import
  sites only if compatibility changes require it.
- Tests: golden XLS/XLSX/ODS corpus; quotation and calc-3D imports; daily-report
  export/reopen; formulas/dates/merged cells/codepages; malformed, oversized,
  compressed and adversarial workbooks.
- Traceability: public npm `xlsx` stops at `0.18.5`. Upstream identifies
  `cdn.sheetjs.com` as authoritative, publishes `0.20.3`, and recommends
  vendoring for stability.
- Provenance gate: download only from the documented upstream URL, record
  SHA-256, archive the tarball in an approved vendor/source store, verify
  package metadata/source correspondence, and independently review it.

Sources:

- https://docs.sheetjs.com/docs/getting-started/installation/nodejs/
- https://docs.sheetjs.com/docs/miscellany/formats/

### Option B — replace with another Excel library

- Candidate for evaluation: ExcelJS for XLSX-centric paths.
- Safety: removes current SheetJS but requires a new audit and threat model for
  the replacement dependency graph.
- Compatibility: low for the combined XLS/XLSX/ODS contract unless additional
  format-specific parsers are introduced, increasing dependency surface.
- Breaking risk: high. Workbook model, dates, formulas, styles, merged cells,
  streaming behavior and error semantics differ.
- Code scope: all five import sites, parser adapters, export path and fixtures.
- Tests: complete Option A corpus plus API parity, round-trip and migration.
- Traceability: pin the official GitHub release/tag and registry integrity.

Source: https://github.com/exceljs/exceljs

### Option C — temporarily retain and isolate

- Safety: lowest. It reduces blast radius but does not remove either finding.
- Compatibility: highest because the library and spreadsheet behavior remain
  unchanged.
- Breaking risk: medium operational risk; low file-format risk.
- Future scope: move untrusted parsing into a no-network worker/process;
  enforce file, compressed-size, sheet, row, cell, string and execution-time
  limits; kill on timeout; isolate temporary storage; authenticate uploads;
  verify file signature/MIME; record metrics and failures.
- Tests: resource exhaustion, zip bomb, malformed workbook, prototype-pollution
  containment, timeout/kill, cleanup and process recovery.
- Traceability: unchanged `xlsx@0.18.5`; both audit findings remain and require
  a time-bounded Founder exception with owner and expiry.

## 6. Recommendation to Founder

Recommend **Option A**, using a vendored and SHA-256-pinned upstream SheetJS
`0.20.3` tarball after a separate provenance review and compatibility spike.
It offers the smallest API/file-format change while resolving both advisory
ranges.

Keep Option C only as a short, explicit, expiring exception if Option A cannot
be validated immediately. Use Option B only if the upstream SheetJS artifact
cannot satisfy the provenance decision, because replacement has the largest
functional and testing scope.
