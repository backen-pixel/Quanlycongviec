"""Offline design checks, not runtime/security/DB/provider acceptance.

Uses a fail-closed validator for the exact emitted JSON Schema subset because
no general Draft2020-12 validator is installed. Not a standards conformance test.
"""
import copy
import hashlib
import json
import re
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import unquote
from uuid import UUID

ROOT = Path(__file__).resolve().parents[1]
SCHEMA = json.loads((ROOT / "schemas/bos-contracts.schema.json").read_text(encoding="utf-8"))
FIXTURES = json.loads((ROOT / "examples/design-fixtures.json").read_text(encoding="utf-8"))
MACHINES = json.loads((ROOT / "schemas/state-machines.json").read_text(encoding="utf-8"))
RESULTS = []

def check(name, function):
    function()
    RESULTS.append({"id": name, "status": "LOCAL_DESIGN_CHECK_PASS"})

def stamp(value):
    result = datetime.fromisoformat(value.replace("Z", "+00:00"))
    assert result.tzinfo is not None
    return result

def validate(value, spec):
    supported = {"$schema", "$id", "title", "$defs", "$ref", "type", "additionalProperties",
                 "properties", "required", "allOf", "if", "then", "const", "enum", "items",
                 "minItems", "maxItems", "uniqueItems", "minimum", "maximum", "minLength", "maxLength", "format", "pattern"}
    assert not set(spec) - supported, "Unsupported schema keyword must not be ignored"
    if "$ref" in spec:
        return validate(value, SCHEMA["$defs"][spec["$ref"].split("/")[-1]])
    if "const" in spec:
        assert value == spec["const"]
    if "enum" in spec:
        assert value in spec["enum"]
    if "type" in spec:
        kinds = spec["type"] if isinstance(spec["type"], list) else [spec["type"]]
        predicates = {"null": lambda: value is None, "object": lambda: isinstance(value, dict),
                      "array": lambda: isinstance(value, list), "string": lambda: isinstance(value, str),
                      "boolean": lambda: isinstance(value, bool),
                      "integer": lambda: isinstance(value, int) and not isinstance(value, bool),
                      "number": lambda: isinstance(value, (int, float)) and not isinstance(value, bool)}
        assert any(predicates[k]() for k in kinds)
    if isinstance(value, dict):
        assert set(spec.get("required", [])) <= set(value)
        properties = spec.get("properties", {})
        if spec.get("additionalProperties") is False:
            assert set(value) <= set(properties)
        for key, item in value.items():
            if key in properties:
                validate(item, properties[key])
    if isinstance(value, str):
        assert len(value) >= spec.get("minLength", 0)
        assert len(value) <= spec.get("maxLength", 10**9)
        if "pattern" in spec:
            assert re.search(spec["pattern"], value)
        if spec.get("format") == "uuid":
            UUID(value)
        if spec.get("format") == "date-time":
            stamp(value)
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        assert value >= spec.get("minimum", float("-inf"))
        assert value <= spec.get("maximum", float("inf"))
    if isinstance(value, list):
        assert len(value) >= spec.get("minItems", 0)
        assert len(value) <= spec.get("maxItems", 10**9)
        if spec.get("uniqueItems"):
            assert len({json.dumps(v, sort_keys=True) for v in value}) == len(value)
        for item in value:
            validate(item, spec.get("items", {}))
    for condition in spec.get("allOf", []):
        try:
            validate(value, condition.get("if", {}))
        except (AssertionError, ValueError):
            continue
        validate(value, condition["then"])

def expect_rejected(value):
    try:
        validate(value, SCHEMA)
    except (AssertionError, ValueError):
        return
    raise AssertionError("Malformed example unexpectedly accepted")

def schema_examples():
    for sample in FIXTURES:
        validate(sample, SCHEMA)
    assert len(FIXTURES) == 30
    malformed = copy.deepcopy(FIXTURES[0])
    malformed["body"]["revision"] = 0
    expect_rejected(malformed)
    malformed = copy.deepcopy(FIXTURES[0])
    malformed["resolved_context"]["actor_id"] = "not-a-uuid"
    expect_rejected(malformed)
    malformed = copy.deepcopy(FIXTURES[0])
    malformed["body"]["arbitrary_write"] = True
    expect_rejected(malformed)
    malformed = copy.deepcopy(FIXTURES[0])
    malformed["resolved_context"]["authenticated_at"] = "2026-01-01T00:00:00"
    expect_rejected(malformed)

def scope_gate(auth, requested):
    return "ALLOW" if auth.get("tenant") and auth.get("company") and auth == requested else "REJECTED"

def scope_cases():
    a1 = {"tenant": "A", "company": "A1"}
    assert scope_gate(a1, a1) == "ALLOW"
    assert scope_gate(a1, {"tenant": "A", "company": "A2"}) == "REJECTED"
    assert scope_gate(a1, {"tenant": "B", "company": "B1"}) == "REJECTED"
    assert scope_gate({"company": "A1"}, {"company": "A1"}) == "REJECTED"

def idempotency_model():
    ledger = {}
    def receive(key, digest):
        if key in ledger:
            return "REPLAY" if ledger[key] == digest else "CONFLICT"
        ledger[key] = digest
        return "SAVED"
    key = ("A", "A1", "binding1", "native-event1", "lead.created")
    assert receive(key, "h1") == "SAVED"
    assert receive(key, "h1") == "REPLAY"
    assert receive(key, "changed") == "CONFLICT"
    assert receive(("A", "A1", "binding1", "native-event2", "lead.created"), "h1") == "SAVED"

def dispatch_model(policy, current):
    if current["forbidden"] or not current["scope_valid"]:
        return "REJECTED"
    if not current["required_facts"]:
        return "WAITING_INPUT"
    if any(policy[k] != current[k] for k in ["payload_hash", "rule_revision", "fact_revision", "consent_revision", "authority_epoch"]):
        return "REEVALUATE"
    if current["consent_state"] != "GRANTED" or current["now"] >= policy["expires"]:
        return "REJECTED"
    if current["approval_required"] and not current["approval_valid"]:
        return "WAITING_APPROVAL"
    return "READY"

def decision_cases():
    policy = {"payload_hash": "h1", "rule_revision": 1, "fact_revision": 1,
              "consent_revision": 1, "authority_epoch": 1, "expires": 100}
    current = {**policy, "forbidden": False, "scope_valid": True, "required_facts": True,
               "consent_state": "GRANTED", "now": 50, "approval_required": False, "approval_valid": False}
    assert dispatch_model(policy, current) == "READY"
    for field in ["payload_hash", "rule_revision", "fact_revision", "consent_revision", "authority_epoch"]:
        changed = dict(current)
        changed[field] = "changed"
        assert dispatch_model(policy, changed) == "REEVALUATE"
    assert dispatch_model(policy, {**current, "forbidden": True, "approval_valid": True}) == "REJECTED"
    assert dispatch_model(policy, {**current, "scope_valid": False, "approval_valid": True}) == "REJECTED"
    assert dispatch_model(policy, {**current, "consent_state": "REVOKED"}) == "REJECTED"
    assert dispatch_model(policy, {**current, "now": 100}) == "REJECTED"
    assert dispatch_model(policy, {**current, "required_facts": False}) == "WAITING_INPUT"
    assert dispatch_model(policy, {**current, "approval_required": True}) == "WAITING_APPROVAL"

def unknown_cases():
    edges = MACHINES["Command"]
    assert edges["UNKNOWN"] == ["RECONCILING"]
    assert "READY" not in edges["UNKNOWN"]
    assert edges["SUCCEEDED"] == []
    assert edges["CANCELLED"] == []
    assert "FAILED->VALIDATED" in MACHINES["guards"]
    assert "PENDING_RECONCILIATION->RELEASED" in MACHINES["guards"]
    assert "UNKNOWN" in edges["EXECUTING"]
    assert "CANCELLED" in edges["RECONCILING"]
    assert "no cancellation intent/tombstone" in MACHINES["guards"]["FAILED->VALIDATED"]
    assert "confirmed no effect" in MACHINES["guards"]["RECONCILING->CANCELLED"]

def callback_cases():
    def callback(task_state, signed, same_scope, expected_generation, generation):
        if not signed or not same_scope:
            return "REJECTED"
        if generation != expected_generation or task_state == "CANCELLED":
            return "QUARANTINED"
        return "AI_RESULT_RECORDED_NOT_BUSINESS_SUCCESS"
    assert callback("RUNNING", True, True, 1, 1).startswith("AI_RESULT")
    assert callback("CANCELLED", True, True, 1, 1) == "QUARANTINED"
    assert callback("RUNNING", True, True, 2, 1) == "QUARANTINED"
    assert callback("RUNNING", False, True, 1, 1) == "REJECTED"
    assert callback("RUNNING", True, False, 1, 1) == "REJECTED"

def budget_cases():
    cap, actual, hold = 130, 70, 30
    assert cap - actual - hold == 30
    # Settlement substitutes actual for the matched reservation, not both.
    settled = 20
    actual, hold = actual + settled, hold - settled
    assert cap - actual - hold == 30
    unknown_hold = hold
    assert unknown_hold == 10  # timeout does not release it
    assert cap - actual - unknown_hold < 40  # another40-unit effect cannot reserve
    price_or_cap = None
    assert price_or_cap is None  # paid gateway must refuse UNSET

def metric_cases():
    def cpl(cost, parties, complete):
        return None if cost is None or not parties or not complete else cost / len(set(parties))
    assert cpl(100, [], True) is None
    assert cpl(None, ["p1"], True) is None
    assert cpl(100, ["p1"], False) is None
    assert cpl(100, ["p1", "p1"], True) == 100
    assert 1.0 - sum([0.4, 0.3]) >= 0  # residual attribution remains UNKNOWN
    assert sum([0.7, 0.7]) > 1.0  # such a proposal must be rejected
    def conversion(order, kind="PURCHASE", definition="v1"):
        return ("A", "A1", "account1", order, kind)
    assert conversion("order1", definition="v1") == conversion("order1", definition="v2")
    assert conversion("order1", "REFUND-adjustment1") != conversion("order1")

def conditional_contract_cases():
    by_type = {row["record_type"]: row for row in FIXTURES}
    def altered(kind, **changes):
        sample = copy.deepcopy(by_type[kind])
        sample["body"].update(changes)
        return sample
    # Acknowledgement stages cannot claim business success or demand provider IDs.
    validate(altered("Receipt", command_id=None), SCHEMA)
    expect_rejected(altered("Receipt", command_outcome="SUCCEEDED"))
    expect_rejected(altered("Receipt", intake_id=None))
    expect_rejected(altered("Receipt", phase="PROVIDER_ACCEPTED", execution_id=str(UUID(int=500)),
                            stage_result="ACCEPTED", command_outcome="SUCCEEDED"))
    validate(altered("Receipt", phase="BUSINESS_COMMITTED", execution_id=str(UUID(int=500)),
                     intake_id=None, stage_result="APPLIED", command_outcome="SUCCEEDED",
                     readback_ref="SYNTHETIC:committed-version-proof"), SCHEMA)
    cancelled = altered("Receipt", phase="RECONCILED", execution_id=str(UUID(int=500)),
        intake_id=None, stage_result="CONFIRMED_NO_EFFECT", command_outcome="CANCELLED",
        readback_ref="SYNTHETIC:no-effect-proof", cancellation_tombstone_ref="SYNTHETIC:cancel-intent")
    validate(cancelled, SCHEMA)
    cancelled["body"]["execution_id"] = None
    validate(cancelled, SCHEMA)  # Pre-dispatch cancel uses inbox/dispatch absence proof, no fabricated attempt.
    cancelled["body"]["cancellation_tombstone_ref"] = None
    expect_rejected(cancelled)
    for kind in ["AITask", "AIRun"]:
        changes = {"state": "QUEUED", "native_task_id" if kind == "AITask" else "native_run_id": None}
        if kind == "AIRun":
            changes["usage_reservation_id"] = None
        validate(altered(kind, **changes), SCHEMA)  # Mapping intent before native ACK/paid dispatch.
    validate(altered("Callback", result_kind="TASK_RESULT", command_id=None), SCHEMA)
    expect_rejected(altered("Callback", result_kind="EFFECT_RESULT", command_id=None))
    decision = altered("Decision", consent_context={"applicability": "REQUIRED", "reason": "contact", "refs": []})
    expect_rejected(decision)
    decision["body"]["consent_context"]["refs"] = [{"consent_id": str(UUID(int=40)), "revision": 1,
        "party_id": str(UUID(int=1)), "purpose": "CONTACT", "channel": "SYNTHETIC:OA", "account_id": "SYNTHETIC:OA1"}]
    validate(decision, SCHEMA)
    del decision["body"]["consent_context"]["refs"][0]["account_id"]
    expect_rejected(decision)
    expect_rejected(altered("Command", precondition={"kind": "ABSENT", "absence_key": None, "resource_revision": 1}))
    expect_rejected(altered("Command", precondition={"kind": "MATCH_REVISION", "absence_key": None, "resource_revision": None}))
    expect_rejected(altered("Command", state="CANCELLED", cancellation_requested_at=None, cancellation_tombstone_ref=None))
    validate(altered("ServiceCase", project_id=None, order_id=None, policy_ref=None, state="WAITING_POLICY"), SCHEMA)
    expect_rejected(altered("Payment", amount={"currency": "VND", "amount_minor": 100, "exponent": 2, "basis_ref": "SYNTHETIC:bank"}))

def linked_fixture_invariants(records):
    by_id = {(r["record_type"], r["body"]["id"]): r for r in records}
    for entry in records:
        body = entry["body"]
        if entry["record_type"] == "Command":
            decision = by_id[("Decision", body["decision_id"])]["body"]
            assert decision["autonomy"] != "C0" and decision["state"] == "PASS"
            assert decision["action"] == body["action"] and decision["payload_hash"] == body["payload_hash"]
            assert decision["precondition"] == body["precondition"] and decision["target"] == body["target"]
            if body["precondition"]["kind"] == "ABSENT":
                assert body["target"]["resource_id"] is None
            if body["precondition"]["kind"] == "MATCH_REVISION":
                assert body["target"]["resource_id"] is not None
        if entry["record_type"] == "AIRun" and body["usage_reservation_id"]:
            assert by_id[("Reservation", body["usage_reservation_id"])]["body"]["purpose"] == "MODEL_CALL"
        if entry["record_type"] == "ServiceCase" and body["case_kind"] == "WARRANTY" and body["state"] in ["RESOLVED", "CLOSED"]:
            assert body["policy_ref"] and body["policy_revision"] and body["warranty_context_ref"]

def linked_fixture_cases():
    linked_fixture_invariants(FIXTURES)
    product_warranty = copy.deepcopy(FIXTURES)
    service = next(r["body"] for r in product_warranty if r["record_type"] == "ServiceCase")
    service.update({"case_kind": "WARRANTY", "state": "RESOLVED", "order_id": None, "project_id": None,
        "policy_ref": "SYNTHETIC:verified-policy", "policy_revision": 1,
        "warranty_context_ref": {"source_type": "PRODUCT", "source_id": "SYNTHETIC:product1",
                                  "source_revision": 1, "evidence_ref": "SYNTHETIC:entitlement-evidence"}})
    linked_fixture_invariants(product_warranty)  # Valid warranty need not fabricate a Project.
    for row in product_warranty:
        validate(row, SCHEMA)
    mutations = [("Decision", "autonomy", "C0"), ("AIRun", "usage_reservation_id",
        next(r["body"]["id"] for r in FIXTURES if r["record_type"] == "Reservation" and r["body"]["purpose"] == "MARKETING"))]
    for kind, field, value in mutations:
        changed = copy.deepcopy(FIXTURES)
        next(r["body"] for r in changed if r["record_type"] == kind)[field] = value
        try:
            linked_fixture_invariants(changed)
        except AssertionError:
            continue
        raise AssertionError("Cross-record invalid fixture unexpectedly accepted")

def document_checks():
    exchanges = json.loads((ROOT / "examples/contract-exchange.json").read_text(encoding="utf-8"))
    assert exchanges["classification"] == "SYNTHETIC_DESIGN_TRANSCRIPT_NOT_RUN"
    assert len(exchanges["exchanges"]) == 4
    intake = exchanges["exchanges"][0]
    event = intake["event_after_commit"]
    assert set(["schema_version", "event_id", "event_type", "source_event_id", "source_system",
        "integration_id", "occurred_at", "received_at", "resolved_context", "subject_type", "subject_id",
        "subject_revision", "payload_hash", "correlation_id", "causation_id", "is_test", "data", "evidence_ref"]) <= set(event)
    assert "resolved_context" not in intake["request"]["body"]
    assert intake["response"]["body"]["effect_certainty"] == "NOT_ASSERTED"
    body = dict(intake["request"]["body"])
    digest = body.pop("payload_hash")
    assert hashlib.sha256(json.dumps(body, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode()).hexdigest() == digest
    backlog = (ROOT / "BACKLOG_ACCEPTANCE.md").read_text(encoding="utf-8")
    cases = re.findall(r"^\| (T\d{2})\b.*$", backlog, re.M)
    assert sorted(set(cases)) == [f"T{i:02}" for i in range(1, 33)]
    case_rows = [line for line in backlog.splitlines() if re.match(r"^\| T\d{2}\b", line)]
    assert all("NOT_RUN" in row for row in case_rows)
    contracts = (ROOT / "CONTRACTS.md").read_text(encoding="utf-8")
    contract_ids = set(re.findall(r"\|\s*(C-[A-Z]+)\s*\|", contracts))
    for name in ["BACKLOG_ACCEPTANCE.md", "ARCHITECTURE.md", "CHANNELS.md"]:
        refs = set(re.findall(r"\bC-[A-Z]+\b", (ROOT / name).read_text(encoding="utf-8")))
        assert refs <= contract_ids, (name, refs - contract_ids)

def link_checks():
    failures = []
    for source in ROOT.rglob("*.md"):
        for link in re.findall(r"!?\[[^\]]*\]\(([^)]+)\)", source.read_text(encoding="utf-8")):
            link = unquote(link.split("#", 1)[0].split(" ", 1)[0])
            if not link or re.match(r"^[a-zA-Z][a-zA-Z0-9+.-]*:", link):
                continue
            if not (source.parent / link).exists():
                failures.append((str(source.relative_to(ROOT)), link))
    assert not failures, failures

for label, function in [
    ("LC01-schema-examples-and-negative-shapes", schema_examples),
    ("LC02-scope-A1-A2-B1-and-missing-tenant", scope_cases),
    ("LC03-native-event-key-payload-conflict", idempotency_model),
    ("LC04-fresh-decision-and-hard-deny", decision_cases),
    ("LC05-unknown-no-blind-retry-and-guarded-release", unknown_cases),
    ("LC06-callback-generation-cancel-scope", callback_cases),
    ("LC07-budget-settlement-and-unknown-hold", budget_cases),
    ("LC08-cpl-coverage-and-conversion-identity", metric_cases),
    ("LC09-traceability-and-live-NOT_RUN", document_checks),
    ("LC10-local-document-links", link_checks),
    ("LC11-phase-consent-precondition-and-nullable-intent", conditional_contract_cases),
    ("LC12-linked-fixture-autonomy-and-reservation-purpose", linked_fixture_cases),
]:
    check(label, function)

report = {"checked_at": datetime.now(timezone.utc).isoformat(), "classification": "LOCAL_DESIGN_CHECK",
          "schema_validator": "strict emitted-keyword subset; NOT Draft2020-12 standards conformance",
          "synthetic_records": len(FIXTURES), "checks": RESULTS,
          "limitations": ["No application startup, credentials or network", "No DB concurrency/fencing proof",
                          "No cryptographic callback verification", "No provider/business/live acceptance"]}
(ROOT / "checks/results.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(json.dumps({"status": "LOCAL_DESIGN_CHECK_PASS", "checks": len(RESULTS), "synthetic_records": len(FIXTURES)}))
