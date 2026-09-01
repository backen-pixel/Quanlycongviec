# SX-1 Controlled XLSX Security Remediation Evidence

Status: `DEVELOPMENT VALIDATION PASS / AWAITING FOUNDER REVIEW`

This record covers only the Founder-authorized replacement of backend
`xlsx@0.18.5` with the official SheetJS Community Edition `0.20.3` tarball.
It does not change the canonical baseline, open Formal Traceable Test or
Independent Review, or authorize AF3, Runtime, Production, release, merge,
tag, push, deployment, or migration.

## 1. Starting point and scope boundary

- Starting commit: `4d5ef23d28ea25f38229f71b416b6e007ec0beed`.
- Starting tree: `54678e6b3e10f5ef93a7a34368b402ff05391896`.
- Starting commit is preserved as the immutable parent of the SX-1 candidate.
- Local branch: `codex/sx-1-xlsx-security-remediation`.
- Local workspace:
  `C:\Users\HUNG\Documents\ChatGPT\Nhà máy ai agent\SX1_XLSX_SECURITY_REMEDIATION_2026-09-01`.
- Business source changed: `NO`.
- Database or migration changed: `NO`.
- The candidate commit and tree are reported externally after commit creation;
  a commit cannot self-record its own full SHA.

## 2. Tarball provenance and vendoring

| Field | Recorded value |
|---|---|
| Package | `xlsx` |
| Vendored version | `0.20.3` |
| Source | `https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz` |
| Download started | `2026-09-01T13:17:46.9095424+07:00` |
| Download completed | `2026-09-01T13:17:47.9865952+07:00` |
| Server date | `Tue, 01 Sep 2026 06:17:46 GMT` |
| HTTP status | `200` |
| Final URI | Same as source; redirects disabled |
| Size | `2,409,319` bytes |
| SHA-256 | `8dc73fc3b00203e72d176e85b50938627c7b086e607c682e8d3c22c02bb99fe8` |
| Git blob | `b9df84a5c07d3bb78d75e310b7931e3dbf56783e` |
| Lockfile SHA-512 integrity | `sha512-oLDq3jw7AcLqKWH2AhCpVTZl8mf6X2YReP+Neh0SJUzV/BdZYjth94tG5toiMB1PPrYtxOCfaoUCkvtuH+3AJA==` |
| Vendored path | `vendor/xlsx-0.20.3.tgz` |
| Package metadata | `name=xlsx`, `version=0.20.3`, `license=Apache-2.0` |

Tar inspection found 26 entries, all below `package/`, no absolute or parent
traversal path, and no symbolic-link entry. The installed CommonJS package
reports `XLSX.version === "0.20.3"`. `backend/package.json` and the lockfile use
`file:../vendor/xlsx-0.20.3.tgz`; no alternate XLSX source was used.

The source and vendoring method match the official SheetJS Node installation
guidance:

- https://docs.sheetjs.com/docs/getting-started/installation/nodejs/

## 3. Compatibility corpus and functional validation

`backend/tests/fixtures/sx1/generate-baseline-fixtures.js` generated the
baseline corpus with `xlsx@0.18.5` before the controlled upgrade. Fixture
digests are:

| Fixture | Bytes | SHA-256 |
|---|---:|---|
| `baseline-0.18.5.xls` | 4,096 | `a382d31f7ca0d0a3c4e7cdc77811703718b2809a9060d5b9055bb70758edcd4a` |
| `baseline-0.18.5.xlsx` | 16,469 | `d59de0547ad6a05667863b362266287252ef58d6c9353ac3182fd75da19f7770` |
| `baseline-0.18.5.ods` | 8,113 | `ea8e3a86205e45b48b35749bbb2d86ae7606fc1e0a9d7604c11a56eb68fe220c` |

The SX-1 suite passed all seven top-level checks:

1. tarball, package, local-file dependency, lock integrity and installed
   version binding;
2. XLS, XLSX and ODS baseline reads with Vietnamese text, decimal numbers,
   dates, formula cached values, and XLSX/ODS formula expressions;
3. the repository's existing XLSX report opens; quotation import succeeds;
   an Excel report with Vietnamese text, date, number and formula exports and
   reopens; the existing daily-report export module loads;
4. the existing calc-3D business parser accepts XLS, XLSX and ODS;
5. empty, valid-empty, corrupt and oversized inputs have deterministic bounded
   outcomes;
6. a crafted comment reference `__proto__` cannot add or change properties on
   `Object.prototype`;
7. a one-megabyte regex-stress XML input completes or is rejected in an
   isolated worker bounded to 5 seconds and a 64 MiB old-generation heap.

Legacy BIFF8 (`.xls`) preserves the cached formula result but does not expose
the formula expression in the baseline reader. This is the observed
`xlsx@0.18.5` fixture behavior and is not a new regression. XLSX and ODS
preserve both formula expression and cached value.

Existing application upload boundaries were also checked: quotation import is
limited to 10 MiB and calc-3D import to 50 MiB. The worker deadline and heap
cap are safety controls for the adversarial development test itself; no new
runtime parser architecture was introduced in this dependency-only scope.

Security advisory boundaries used for the validation:

- CVE-2023-30533 / GHSA-4r6h-8v6p-xvw6 affects releases through `0.19.2`;
- CVE-2024-22363 / GHSA-5pgg-2g8v-p4x9 affects releases through `0.20.1`.

Official advisory sources:

- https://cdn.sheetjs.com/advisories/CVE-2023-30533
- https://cdn.sheetjs.com/advisories/CVE-2024-22363

## 4. Test results

These results are development checks only. They are not a Formal Traceable
Test or Independent Review result.

| Command | Result |
|---|---|
| `npm run test:sx1-xlsx` | `7/7 PASS` |
| `npm run test:sf2c2-security-remediation` | `9/9 PASS` |
| `npm run test:agent-control-plane` | `23/23 PASS` |
| `npm run test:software-factory` | `57/57 PASS` |
| `npm run test:software-factory-sf2c1` | `14/14 PASS` |
| `npm run test:software-factory-sf2c2` | `13/13 PASS` |
| `npm run test:business-os` | `37/37 PASS` |

Existing development aggregate: `153/153 PASS`.

Additional SX-1 checks: `7/7 PASS`.

## 5. Dependency audit

Command: `npm audit --omit=dev --json`

| Severity | Count |
|---|---:|
| Critical | 0 |
| High | 0 |
| Moderate | 0 |
| Low | 0 |
| Info | 0 |
| Total | 0 |

The command exited `0` and returned an empty `vulnerabilities` object for 313
production dependencies (317 total dependency records). npm did not emit a
false positive for the local SheetJS tarball in this run.

Remaining known dependency vulnerabilities from this audit: `0`.

## 6. Files in the SX-1 candidate

- `backend/package.json`
- `backend/package-lock.json`
- `vendor/xlsx-0.20.3.tgz`
- `backend/tests/sf2c2-dependency-security-remediation.test.js`
- `backend/tests/sx1-xlsx-security-remediation.test.js`
- `backend/tests/fixtures/sx1/generate-baseline-fixtures.js`
- `backend/tests/fixtures/sx1/baseline-0.18.5.xls`
- `backend/tests/fixtures/sx1/baseline-0.18.5.xlsx`
- `backend/tests/fixtures/sx1/baseline-0.18.5.ods`
- `docs/baseline/SX1_XLSX_SECURITY_REMEDIATION_EVIDENCE.md`

Rollback is a normal revert of the single SX-1 candidate commit, restoring
the immutable parent `4d5ef23d28ea25f38229f71b416b6e007ec0beed`.

## 7. Development disposition

- Business source changed: `NO`.
- XLS/XLSX/ODS compatibility: `PASS`.
- Prototype Pollution test: `PASS`.
- ReDoS bounded-worker test: `PASS`.
- Full existing development checks: `153/153 PASS`.
- npm audit: `0` vulnerabilities at every severity.
- Ready for Founder decision on Formal Traceable Test: `YES`.
- Formal Traceable Test opened: `NO`.
- Independent Review opened: `NO`.

`STOP / AWAITING FOUNDER REVIEW`.
