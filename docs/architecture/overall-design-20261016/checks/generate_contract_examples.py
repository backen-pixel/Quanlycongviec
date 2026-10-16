"""Authoring helper: writes design schemas/fixtures only. No app imports/network."""
import json
from pathlib import Path
from uuid import UUID

ROOT = Path(__file__).resolve().parents[1]
UUID_FIELD = {"type": "string", "format": "uuid"}
TEXT = {"type": "string", "minLength": 1, "maxLength": 2048}
TIME = {"type": "string", "format": "date-time"}
HASH = {"type": "string", "pattern": "^[a-f0-9]{64}$"}
NAT = {"type": "integer", "minimum": 0}
REV = {"type": "integer", "minimum": 1}

def ref(name):
    return {"$ref": "#/$defs/" + name}

def enum(*values):
    return {"type": "string", "enum": list(values)}

def array(item):
    return {"type": "array", "items": item, "minItems": 1, "uniqueItems": True}

def nullable(spec):
    result = {**spec, "type": [spec["type"], "null"]}
    if "enum" in spec:
        result["enum"] = [*spec["enum"], None]
    return result

def obj(properties, required=None):
    return {"type": "object", "additionalProperties": False,
            "properties": properties, "required": list(properties) if required is None else required}

def record(properties):
    return obj({"id": UUID_FIELD, "revision": REV, **properties})

defs = {
    "Scope": obj({"tenant_id": UUID_FIELD, "company_id": UUID_FIELD,
                  "actor_id": UUID_FIELD, "actor_type": enum("HUMAN", "AGENT", "SERVICE", "SOURCE_ADAPTER"),
                  "delegation_ref": nullable(TEXT), "authority_epoch": REV,
                  "scopes": array(TEXT), "authenticated_at": TIME}),
    "Money": obj({"currency": {"type": "string", "pattern": "^[A-Z]{3}$"},
                  "amount_minor": {"type": "integer", "minimum": 0, "maximum": 9007199254740991},
                  "exponent": {"type": "integer", "minimum": 0, "maximum": 4}, "basis_ref": TEXT}),
    "FactRef": obj({"fact_id": UUID_FIELD, "revision": REV, "snapshot_hash": HASH}),
    "Target": obj({"provider": TEXT, "account_id": TEXT, "resource_type": TEXT, "resource_id": nullable(TEXT)}),
    "Precondition": obj({"kind": enum("ABSENT", "MATCH_REVISION", "READ_ONLY"),
                         "resource_revision": nullable(REV), "absence_key": nullable(TEXT)}),
    "ConsentRef": obj({"consent_id": UUID_FIELD, "revision": REV, "party_id": UUID_FIELD,
                       "purpose": enum("CONTACT", "AD_MEASUREMENT", "REMARKETING"),
                       "channel": TEXT, "account_id": TEXT}),
}
defs["ConsentContext"] = obj({
    "applicability": enum("REQUIRED", "NOT_APPLICABLE"), "reason": TEXT,
    "refs": {"type": "array", "items": ref("ConsentRef"), "uniqueItems": True},
})
defs.update({
    "Party": record({"display_name": TEXT, "contact_private_ref": TEXT, "relationship_scope_ref": TEXT}),
    "Need": record({"party_id": UUID_FIELD, "description": TEXT, "stage": TEXT,
                    "qualification": enum("PENDING", "QUALIFIED", "UNQUALIFIED"),
                    "qualification_evidence_ref": TEXT, "source_refs": array(TEXT)}),
    "WorkItem": record({"source_type": enum("CRM", "WORK", "SX", "VC", "SERVICE"),
                        "native_id": TEXT, "owner_id": UUID_FIELD, "due_at": TIME,
                        "state": enum("OPEN", "ASSIGNED", "IN_PROGRESS", "WAITING_INPUT", "REVIEW", "COMPLETED", "CANCELLED"),
                        "acceptance_criteria": array(TEXT)}),
    "Fact": record({"subject_type": TEXT, "subject_id": UUID_FIELD, "source_system": TEXT,
                    "source_ref": TEXT, "observed_at": TIME, "recorded_at": TIME,
                    "verification": enum("REPORTED", "VERIFIED", "CONFLICT", "UNKNOWN"),
                    "verification_evidence_ref": TEXT, "snapshot_hash": HASH,
                    "coverage": {"type": "number", "minimum": 0, "maximum": 1}}),
    "Consent": record({"party_id": UUID_FIELD, "purpose": enum("CONTACT", "AD_MEASUREMENT", "REMARKETING"),
                       "channel": TEXT, "account_id": TEXT, "state": enum("REPORTED", "GRANTED", "REVOKED", "EXPIRED"),
                       "notice_version": TEXT, "evidence_ref": TEXT, "effective_at": TIME}),
    "Asset": record({"blob_ref": TEXT, "rights_ref": TEXT, "rights_expires_at": TIME,
                     "source_evidence_ref": TEXT, "state": enum("DRAFT", "APPROVED", "REVOKED", "ARCHIVED")}),
    "Content": record({"brief_ref": TEXT, "asset_refs": array(UUID_FIELD), "payload_hash": HASH,
                       "state": enum("DRAFT", "IN_REVIEW", "APPROVED", "SCHEDULED", "PUBLISHED", "REJECTED", "REVOKED", "ARCHIVED"),
                       "review_decision_ref": TEXT}),
    "CampaignPlan": record({"objective_ref": TEXT, "plan_ref": TEXT, "channel_bindings": array(ref("Target")),
                            "budget_plan_ref": TEXT, "period_start": TIME, "period_end": TIME,
                            "state": enum("DRAFT", "APPROVED", "ACTIVE", "PAUSED", "CLOSED")}),
    "Touchpoint": record({"source_system": TEXT, "native_event_id": TEXT, "occurred_at": TIME,
                          "identity_evidence_ref": TEXT, "source_kind": enum("PAID", "ORGANIC", "DIRECT", "UNKNOWN"),
                          "consent_id": nullable(UUID_FIELD), "consent_revision": nullable(REV)}),
    "Handoff": record({"need_id": UUID_FIELD, "owner_id": nullable(UUID_FIELD),
                       "accountable_owner_id": UUID_FIELD, "due_at": TIME,
                       "state": enum("WAITING_OWNER", "ASSIGNED", "DELIVERED", "ACCEPTED", "REJECTED"),
                       "milestone_evidence_refs": array(TEXT)}),
    "Quote": record({"need_id": UUID_FIELD, "lines_ref": TEXT, "total": ref("Money"),
                     "terms_hash": HASH, "state": enum("DRAFT", "ISSUED", "ACCEPTED", "SUPERSEDED", "CANCELLED")}),
    "Acceptance": record({"quote_id": UUID_FIELD, "quote_revision": REV, "quote_hash": HASH,
                          "customer_evidence_ref": TEXT, "accepted_at": TIME}),
    "Order": record({"quote_id": UUID_FIELD, "acceptance_id": UUID_FIELD,
                     "total": ref("Money"), "execution_unit_keys": array(TEXT),
                     "state": enum("DRAFT", "CONFIRMED", "IN_FULFILMENT", "FULFILLED", "CANCELLED")}),
    "Payment": record({"order_id": UUID_FIELD, "transaction_ref": TEXT, "source_system": TEXT,
                       "amount": ref("Money"), "evidence_ref": TEXT,
                       "state": enum("REPORTED", "PENDING_RECONCILIATION", "RECONCILED", "REJECTED")}),
    "Refund": record({"payment_id": UUID_FIELD, "adjustment_id": UUID_FIELD, "transaction_ref": TEXT,
                      "amount": ref("Money"), "evidence_ref": TEXT,
                      "state": enum("REQUESTED", "APPROVED", "RECONCILED", "REJECTED")}),
    "Project": record({"order_id": UUID_FIELD, "execution_unit_key": TEXT, "owner_id": UUID_FIELD,
                       "milestone_refs": array(TEXT), "capacity_reservation_ref": TEXT,
                       "state": enum("PROPOSED", "ACCEPTED", "PLANNED", "IN_PROGRESS", "DELIVERED", "ACCEPTED_BY_CUSTOMER", "CLOSED", "ON_HOLD", "CANCELLED")}),
    "ServiceCase": record({"party_id": UUID_FIELD, "order_id": nullable(UUID_FIELD),
                           "project_id": nullable(UUID_FIELD), "request_ref": TEXT,
                           "case_kind": enum("SUPPORT", "WARRANTY"),
                           "owner_id": UUID_FIELD, "due_at": TIME, "policy_ref": nullable(TEXT),
                           "policy_revision": nullable(REV),
                           "warranty_context_ref": nullable(obj({"source_type": enum("ORDER", "PROJECT", "PRODUCT", "INSTALLATION", "ENTITLEMENT"),
                               "source_id": TEXT, "source_revision": REV, "evidence_ref": TEXT})),
                           "state": enum("OPEN", "TRIAGED", "ASSIGNED", "SCHEDULED", "IN_PROGRESS", "RESOLVED", "CLOSED", "REOPENED", "WAITING_POLICY", "WAITING_CUSTOMER")}),
    "Rule": record({"evaluator_id": TEXT, "evaluator_version": TEXT, "parameter_schema_ref": TEXT,
                    "policy_scope_ref": TEXT, "hard_deny": {"type": "boolean"},
                    "issued_by": UUID_FIELD, "effective_at": TIME,
                    "state": enum("DRAFT", "REVIEWED", "PUBLISHED", "RETIRED")}),
    "Decision": record({"action": TEXT, "target": ref("Target"), "payload_hash": HASH,
                        "fact_refs": array(ref("FactRef")), "rule_versions": array(TEXT),
                        "consent_context": ref("ConsentContext"), "precondition": ref("Precondition"),
                        "autonomy": enum("C0", "C1", "C2", "C3"), "approval_ref": nullable(TEXT),
                        "reservation_ref": nullable(TEXT), "issued_at": TIME, "expires_at": TIME,
                        "state": enum("PASS", "WAITING_INPUT", "WAITING_APPROVAL", "REJECTED")}),
    "Command": record({"decision_id": UUID_FIELD, "action": TEXT, "target": ref("Target"),
                       "payload_hash": HASH, "idempotency_key": TEXT,
                       "precondition": ref("Precondition"), "expires_at": TIME,
                       "reservation_id": nullable(UUID_FIELD), "fencing_epoch": NAT,
                       "cancellation_requested_at": nullable(TIME), "cancellation_tombstone_ref": nullable(TEXT),
                       "state": enum("RECEIVED", "VALIDATED", "WAITING_INPUT", "WAITING_APPROVAL", "READY",
                                     "EXECUTING", "SUCCEEDED", "REJECTED", "FAILED", "UNKNOWN", "RECONCILING",
                                     "MANUAL_REVIEW", "CANCEL_REQUESTED", "CANCELLED")}),
    "Receipt": record({"command_id": nullable(UUID_FIELD), "intake_id": nullable(UUID_FIELD),
                       "execution_id": nullable(UUID_FIELD),
                       "phase": enum("DURABLE_ACCEPTANCE", "DISPATCH_INTENT", "PROVIDER_ACCEPTED", "BUSINESS_COMMITTED", "RECONCILED"),
                       "stage_result": enum("RECORDED", "ACCEPTED", "APPLIED", "CONFIRMED_NO_EFFECT", "ERROR", "UNKNOWN"),
                       "command_outcome": nullable(enum("SUCCEEDED", "FAILED", "CANCELLED", "UNKNOWN")),
                       "cancellation_tombstone_ref": nullable(TEXT),
                       "external_id": nullable(TEXT), "observed_at": TIME,
                       "evidence_ref": TEXT, "readback_ref": nullable(TEXT)}),
    "Reservation": record({"budget_id": UUID_FIELD, "purpose": enum("MARKETING", "MODEL_CALL"),
                           "effect_key": TEXT, "upper_bound": ref("Money"),
                           "state": enum("HELD", "SETTLED", "RELEASED", "PENDING_RECONCILIATION"),
                           "price_version": TEXT, "expires_at": TIME}),
    "CapacityReservation": record({"project_id": UUID_FIELD, "resource_id": TEXT,
                                   "units": {"type": "integer", "minimum": 1}, "unit": enum("SLOT", "MINUTE"),
                                   "window_start": TIME, "window_end": TIME, "expires_at": TIME,
                                   "state": enum("HELD", "SETTLED", "RELEASED", "PENDING_RECONCILIATION")}),
    "AITask": record({"business_work_item_id": UUID_FIELD, "native_task_id": nullable(TEXT), "template_ref": TEXT,
                      "output_schema_ref": TEXT, "cap_ref": TEXT, "due_at": TIME,
                      "state": enum("QUEUED", "RUNNING", "WAITING_INPUT", "REVIEW", "SUCCEEDED", "FAILED", "CANCELLED")}),
    "AIRun": record({"ai_task_id": UUID_FIELD, "native_run_id": nullable(TEXT), "generation": REV,
                     "workflow_execution_id": nullable(TEXT), "usage_reservation_id": nullable(UUID_FIELD),
                     "state": enum("QUEUED", "RUNNING", "SUCCEEDED", "FAILED", "CANCELLED", "UNKNOWN")}),
    "Callback": record({"ai_task_id": UUID_FIELD, "ai_run_id": UUID_FIELD, "command_id": nullable(UUID_FIELD),
                        "result_kind": enum("TASK_RESULT", "EFFECT_RESULT", "USAGE"),
                        "mapping_version": REV, "generation": REV, "event_key": TEXT, "body_hash": HASH,
                        "signature_ref": TEXT, "sent_at": TIME,
                        "event": enum("COMPLETED", "FAILED", "CANCELLED", "USAGE_REPORTED")}),
    "Expectation": record({"metric_ref": TEXT, "cohort_ref": TEXT, "baseline_ref": TEXT,
                           "guardrail_refs": array(TEXT), "observation_start": TIME, "observation_end": TIME,
                           "sample_requirement_ref": TEXT, "owner_id": UUID_FIELD}),
    "Outcome": record({"expectation_id": UUID_FIELD, "metric_ref": TEXT, "source_fact_refs": array(ref("FactRef")),
                       "coverage": {"type": "number", "minimum": 0, "maximum": 1},
                       "value": {"type": ["number", "null"]}, "reason": TEXT,
                       "state": enum("WAITING_OUTCOME", "OBSERVED", "INCONCLUSIVE", "NEEDS_DATA")}),
})
defs["IntakeEvent"] = record({
    "schema_version": enum("1.0"), "source_event_id": TEXT, "event_type": TEXT,
    "integration_id": UUID_FIELD, "occurred_at": TIME, "received_at": TIME,
    "payload_hash": HASH, "correlation_id": UUID_FIELD, "causation_id": UUID_FIELD,
    "is_test": {"type": "boolean"}, "private_payload_ref": TEXT, "evidence_ref": TEXT,
})

def guard(condition, properties):
    return {"if": {"properties": condition}, "then": {"properties": properties}}

# Conditional shapes are part of the handoff contract, not runtime enforcement.
defs["Precondition"]["allOf"] = [
    guard({"kind": {"const": "ABSENT"}}, {"resource_revision": {"type": "null"}, "absence_key": TEXT}),
    guard({"kind": {"const": "MATCH_REVISION"}}, {"resource_revision": REV, "absence_key": {"type": "null"}}),
    guard({"kind": {"const": "READ_ONLY"}}, {"resource_revision": {"type": "null"}, "absence_key": {"type": "null"}}),
]
defs["ConsentContext"]["allOf"] = [
    guard({"applicability": {"const": "REQUIRED"}}, {"refs": {"minItems": 1}}),
    guard({"applicability": {"const": "NOT_APPLICABLE"}}, {"refs": {"maxItems": 0}}),
]
defs["Money"]["allOf"] = [guard({"currency": {"const": "VND"}}, {"exponent": {"const": 0}})]
defs["Receipt"]["allOf"] = [
    guard({"phase": {"const": "DURABLE_ACCEPTANCE"}}, {"intake_id": UUID_FIELD, "execution_id": {"type": "null"},
          "stage_result": {"const": "RECORDED"}, "command_outcome": {"type": "null"},
          "external_id": {"type": "null"}, "readback_ref": {"type": "null"}}),
    guard({"phase": {"const": "DISPATCH_INTENT"}}, {"command_id": UUID_FIELD, "execution_id": UUID_FIELD,
          "stage_result": {"const": "RECORDED"}, "command_outcome": {"type": "null"}}),
    guard({"phase": {"const": "PROVIDER_ACCEPTED"}}, {"command_id": UUID_FIELD, "execution_id": UUID_FIELD,
          "stage_result": {"const": "ACCEPTED"}, "command_outcome": {"type": "null"}}),
    guard({"phase": {"const": "BUSINESS_COMMITTED"}}, {"command_outcome": {"const": "SUCCEEDED"}}),
    guard({"command_outcome": {"const": "SUCCEEDED"}}, {"phase": enum("BUSINESS_COMMITTED", "RECONCILED"),
          "stage_result": {"const": "APPLIED"}, "command_id": UUID_FIELD, "execution_id": UUID_FIELD, "readback_ref": TEXT}),
    guard({"stage_result": {"const": "CONFIRMED_NO_EFFECT"}}, {"phase": {"const": "RECONCILED"},
          "command_outcome": enum("FAILED", "CANCELLED"), "command_id": UUID_FIELD, "readback_ref": TEXT}),
    guard({"command_outcome": {"const": "CANCELLED"}}, {"phase": {"const": "RECONCILED"},
          "stage_result": {"const": "CONFIRMED_NO_EFFECT"}, "command_id": UUID_FIELD,
          "readback_ref": TEXT, "cancellation_tombstone_ref": TEXT}),
]
defs["Callback"]["allOf"] = [guard({"result_kind": {"const": "EFFECT_RESULT"}}, {"command_id": UUID_FIELD})]
defs["Command"]["allOf"] = [guard({"state": enum("CANCEL_REQUESTED", "CANCELLED")},
    {"cancellation_requested_at": TIME, "cancellation_tombstone_ref": TEXT})]

entity_names = [name for name in defs if name not in {"Scope", "Money", "FactRef", "Target", "Precondition", "ConsentRef", "ConsentContext"}]
schema = {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "$id": "urn:bos:design:contracts:0.1.0",
    "title": "BOS design-only record envelopes; not deployed API schemas",
    "type": "object", "additionalProperties": False,
    "required": ["data_class", "record_type", "resolved_context", "body"],
    "properties": {"data_class": enum("SYNTHETIC"), "record_type": enum(*entity_names),
                   "resolved_context": ref("Scope"), "body": {"type": "object"}},
    "allOf": [{"if": {"properties": {"record_type": {"const": name}}},
               "then": {"properties": {"body": ref(name)}}} for name in entity_names],
    "$defs": defs,
}

def uid(n):
    return str(UUID(int=n))

scope = {"tenant_id": uid(100), "company_id": uid(101), "actor_id": uid(102),
         "actor_type": "AGENT", "delegation_ref": "SYNTHETIC:delegation-1",
         "authority_epoch": 1, "scopes": ["fixture.campaign.create"], "authenticated_at": "2026-01-01T00:00:00Z"}

def specimen(spec, field=""):
    if "$ref" in spec:
        return specimen(defs[spec["$ref"].split("/")[-1]], field)
    if "enum" in spec:
        return spec["enum"][0]
    kind = spec.get("type")
    if isinstance(kind, list):
        return None
    if kind == "object":
        return {k: specimen(v, k) for k, v in spec["properties"].items()}
    if kind == "array":
        return [specimen(spec["items"], field)]
    if kind == "boolean":
        return True
    if kind == "integer":
        if field == "exponent":
            return 0
        return max(1, spec.get("minimum", 0))
    if kind == "number":
        return 1
    if spec.get("format") == "uuid":
        return uid(1)
    if spec.get("format") == "date-time":
        return "2026-01-01T00:00:00Z"
    if spec.get("pattern") == "^[a-f0-9]{64}$":
        return "a" * 64
    if spec.get("pattern") == "^[A-Z]{3}$":
        return "VND"
    return "SYNTHETIC:" + (field or "reference")

fixtures = [{"data_class": "SYNTHETIC", "record_type": name, "resolved_context": dict(scope),
             "body": specimen(defs[name])} for name in entity_names]
for entry in fixtures:
    entry["body"]["id"] = uid(entity_names.index(entry["record_type"]) + 1)
    # Temporal examples illustrate ordering; they are not live records.
    for field in ["expires_at", "rights_expires_at", "due_at", "period_end", "observation_end", "window_end"]:
        if field in entry["body"]:
            entry["body"][field] = "2026-01-02T00:00:00Z"
ids = {entry["record_type"]: entry["body"]["id"] for entry in fixtures}
foreign = {
    "party_id": "Party", "need_id": "Need", "quote_id": "Quote", "acceptance_id": "Acceptance",
    "order_id": "Order", "payment_id": "Payment", "project_id": "Project", "decision_id": "Decision",
    "command_id": "Command", "reservation_id": "Reservation", "usage_reservation_id": "Reservation",
    "business_work_item_id": "WorkItem", "ai_task_id": "AITask", "ai_run_id": "AIRun", "expectation_id": "Expectation",
}
for entry in fixtures:
    body = entry["body"]
    for field, entity in foreign.items():
        if field in body:
            body[field] = ids[entity]
    for field in ["fact_refs", "source_fact_refs"]:
        if field in body:
            body[field] = [{"fact_id": ids["Fact"], "revision": 1, "snapshot_hash": "a" * 64}]
by_type = {entry["record_type"]: entry["body"] for entry in fixtures}
precondition = {"kind": "ABSENT", "resource_revision": None, "absence_key": "SYNTHETIC:campaign-business-key-1"}
target = {"provider": "SYNTHETIC:adapter", "account_id": "SYNTHETIC:account-A1",
          "resource_type": "campaign", "resource_id": None}
by_type["Decision"].update({"action": "fixture.campaign.create", "autonomy": "C1", "approval_ref": None,
                            "consent_context": {"applicability": "NOT_APPLICABLE",
                                                "reason": "SYNTHETIC draft campaign without personal audience/contact", "refs": []},
                            "precondition": precondition, "target": target})
by_type["Command"].update({"action": "fixture.campaign.create", "precondition": precondition, "target": target})
by_type["Receipt"].update({"phase": "DURABLE_ACCEPTANCE", "stage_result": "RECORDED", "command_outcome": None,
                           "intake_id": ids["IntakeEvent"], "execution_id": None,
                           "external_id": None, "readback_ref": None})
by_type["AITask"].update({"state": "RUNNING", "native_task_id": "SYNTHETIC:native-task-1"})
by_type["AIRun"].update({"state": "RUNNING", "native_run_id": "SYNTHETIC:native-run-1"})
by_type["Callback"].update({"result_kind": "TASK_RESULT", "command_id": None})
by_type["ServiceCase"].update({"case_kind": "SUPPORT", "order_id": None, "project_id": None,
                              "policy_ref": None, "policy_revision": None, "warranty_context_ref": None,
                              "state": "WAITING_POLICY"})
model_reservation = {"data_class": "SYNTHETIC", "record_type": "Reservation", "resolved_context": dict(scope),
                     "body": {**by_type["Reservation"], "id": uid(900), "purpose": "MODEL_CALL",
                              "effect_key": "SYNTHETIC:model-attempt-1", "price_version": "SYNTHETIC:model-price-v1"}}
fixtures.append(model_reservation)
by_type["AIRun"]["usage_reservation_id"] = uid(900)

state_machines = {
    "label": "LOCAL_DESIGN_MODEL_NOT_RUNTIME",
    "Command": {
        "RECEIVED": ["VALIDATED", "REJECTED", "CANCELLED"],
        "VALIDATED": ["READY", "WAITING_INPUT", "WAITING_APPROVAL", "REJECTED", "CANCELLED"],
        "WAITING_INPUT": ["VALIDATED", "REJECTED", "CANCELLED"],
        "WAITING_APPROVAL": ["READY", "REJECTED", "CANCELLED"],
        "READY": ["EXECUTING", "WAITING_INPUT", "WAITING_APPROVAL", "REJECTED", "CANCELLED"],
        "EXECUTING": ["SUCCEEDED", "FAILED", "UNKNOWN", "CANCEL_REQUESTED"],
        "UNKNOWN": ["RECONCILING"], "RECONCILING": ["SUCCEEDED", "FAILED", "CANCELLED", "MANUAL_REVIEW"],
        "CANCEL_REQUESTED": ["RECONCILING"], "FAILED": ["VALIDATED"],
        "MANUAL_REVIEW": ["RECONCILING"], "SUCCEEDED": [], "REJECTED": [], "CANCELLED": [],
    },
    "Reservation": {
        "HELD": ["SETTLED", "RELEASED", "PENDING_RECONCILIATION"],
        "PENDING_RECONCILIATION": ["SETTLED", "RELEASED"],
        "SETTLED": [], "RELEASED": [],
    },
    "guards": {
        "FAILED->VALIDATED": "Confirmed no effect AND no cancellation intent/tombstone; keep command/effect key; obtain fresh decision",
        "RECONCILING->CANCELLED": "Durable cancellation intent/tombstone AND confirmed no effect; never mere timeout",
        "RECONCILING->SUCCEEDED": "Confirmed effect even after cancellation; compensate through a separate authorized command",
        "PENDING_RECONCILIATION->RELEASED": "Readback/provider evidence proves no billable usage/effect",
        "EXECUTING->FAILED": "Known no effect, never mere timeout",
        "WAITING_APPROVAL->READY": "Current same-digest approval and all gates PASS",
    },
}
for relative, data in [
    ("schemas/bos-contracts.schema.json", schema),
    ("schemas/state-machines.json", state_machines),
    ("examples/design-fixtures.json", fixtures),
]:
    target = ROOT / relative
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(json.dumps({"schema_definitions": len(defs), "synthetic_records": len(fixtures),
                  "status": "AUTHORED_DESIGN_ONLY"}))
