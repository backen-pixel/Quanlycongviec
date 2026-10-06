"""Behavioral differential tests; each core loads in a separate PHP process."""
import copy
import json
from pathlib import Path
import subprocess
import sys
import unittest

PHP = sys.argv.pop(1) if len(sys.argv) > 1 else "php"
ROOT = Path(__file__).resolve().parent.parent
PROBE = ROOT / "tests" / "core_probe.php"
ORIGINAL = ROOT / "tests" / "baseline" / "core_0.2.2.php"
PATCHED = ROOT / "core.php"
SYNTHETIC = {
    "vpt_form": "VPT_V1", "your-consent": "agreed",
    "your-name": "Synthetic Local Contact", "your-area": "Synthetic HCM area",
    "your-phone": "0900000000", "your-material": "Inox", "your-timeline": "Synthetic next month",
    "your-message": "ISOLATED QA; no network or customer contact",
}


def call(core, payload):
    # -n ignores php.ini; this executable only requires the pure mapping core.
    process = subprocess.run([PHP, "-n", str(PROBE), str(core)], input=json.dumps(payload), text=True,
                             capture_output=True, check=True, timeout=5)
    if process.stderr:
        raise AssertionError(process.stderr)
    return json.loads(process.stdout)


def request(data=None, **overrides):
    payload = dict(operation="build", data=copy.deepcopy(SYNTHETIC), mode="live", is_admin=False,
                   url="https://vanphuthanh.net/tu-bep?utm_source=ignored", now=1790726400)
    payload["data"].update(data or {})
    payload.update(overrides)
    return payload


class CorePatchTests(unittest.TestCase):
    def compare_build(self, payload, expected_source, eligible=False):
        baseline = call(ORIGINAL, payload)
        candidate = call(PATCHED, payload)
        self.assertTrue(baseline["ok"])
        self.assertTrue(candidate["ok"])
        self.assertEqual(candidate["result"]["build"]["payload"]["source_name"], expected_source)
        if eligible:
            self.assertEqual(baseline["result"]["build"]["payload"]["source_name"], "Website VPT V1")
            self.assertNotEqual(baseline, candidate)
        else:
            self.assertEqual(baseline, candidate)
        old = copy.deepcopy(baseline)
        new = copy.deepcopy(candidate)
        del old["result"]["build"]["payload"]["source_name"]
        del new["result"]["build"]["payload"]["source_name"]
        self.assertEqual(old, new, "Only source_name may change, including fingerprint, scope and notes")
        return candidate["result"]

    def test_canonical_chatgpt_paid_changes_only_source(self):
        self.compare_build(request({"utm_source": "chatgpt", "utm_medium": "paid"}), "ChatGPT Ads VPT V1", True)

    def test_chatgpt_case_and_whitespace_normalized(self):
        self.compare_build(request({"utm_source": "  ChatGPT  ", "utm_medium": " PAID "}), "ChatGPT Ads VPT V1", True)

    def test_existing_google_paid_sources_unchanged(self):
        for medium in ["cpc", "ppc", "paid_search", " CPC "]:
            with self.subTest(medium=medium):
                self.compare_build(request({"utm_source": " GOOGLE ", "utm_medium": medium}), "Google Ads VPT V1")

    def test_unrecognized_and_organic_sources_remain_website(self):
        for source, medium in [("chatgpt", "organic"), ("chatgpt", "cpc"), ("chatgpt", ""),
                               ("openai", "paid"), ("facebook", "paid"),
                               ("", "paid"), ("", ""), ("chatgpt.com", "paid")]:
            with self.subTest(source=source, medium=medium):
                self.compare_build(request({"utm_source": source, "utm_medium": medium}), "Website VPT V1")

    def test_google_organic_has_distinct_source_but_preserves_business(self):
        self.compare_build(request({"utm_source": " Google ", "utm_medium": " Organic "}), "SEO Google VPT V1", True)

    def test_click_ids_prevent_organic_classification(self):
        for key in ("gclid", "gbraid", "wbraid"):
            with self.subTest(key=key):
                self.compare_build(request({"utm_source": "google", "utm_medium": "organic", key: "synthetic-click"}), "Website VPT V1")

    def test_referrer_and_landing_do_not_leak_queries_or_change_fingerprint(self):
        direct = call(PATCHED, request())['result']
        candidate = call(PATCHED, request({"utm_source":"google", "utm_medium":"organic", "vpt_referrer_host":"www.google.com.vn",
                                           "vpt_landing_page":"https://www.vanphuthanh.net/tu-bep/?private=synthetic#secret"}))['result']
        self.assertEqual(candidate['fingerprint'], direct['fingerprint'])
        self.assertEqual(candidate['build']['business'], direct['build']['business'])
        self.assertIn('\nvpt_landing_page: https://vanphuthanh.net/tu-bep/',candidate['build']['payload']['notes'])
        self.assertIn('\nvpt_referrer_host: www.google.com.vn',candidate['build']['payload']['notes'])
        self.assertNotIn('private=',candidate['build']['payload']['notes'])
        self.assertNotIn('#secret',candidate['build']['payload']['notes'])
        invalid = call(PATCHED, request({'vpt_referrer_host':'google.com/private?secret=x','vpt_landing_page':'https://evil.invalid/path'}))['result']
        self.assertNotIn('vpt_referrer_host:',invalid['build']['payload']['notes'])
        self.assertNotIn('vpt_landing_page:',invalid['build']['payload']['notes'])

    def test_test_mode_overrides_all_paid_sources(self):
        for source, medium in [("chatgpt", "paid"), ("google", "cpc"), ("", "")]:
            with self.subTest(source=source):
                self.compare_build(request({"your-name": "TEST VPT V1 isolated", "your-phone": "0000000001",
                                            "utm_source": source, "utm_medium": medium}, mode="test", is_admin=True),
                                   "TEST VPT V1 — không tính khách")

    def test_all_tracking_fields_preserved_in_notes(self):
        tracking = {"utm_source": "ChatGPT", "utm_medium": "PAID", "utm_campaign": "vpt_chatgpt_v1",
                    "utm_content": "synthetic_variant", "utm_term": "synthetic kitchen", "gclid": "synthetic_google_id",
                    "gbraid": "synthetic_gbraid", "wbraid": "synthetic_wbraid", "campaignid": "synthetic_campaign",
                    "adgroupid": "synthetic_adgroup", "keyword": "synthetic keyword", "matchtype": "synthetic",
                    "device": "synthetic desktop"}
        result = self.compare_build(request(tracking), "ChatGPT Ads VPT V1", True)
        notes = result["build"]["payload"]["notes"]
        for field, value in tracking.items():
            self.assertIn("\n" + field + ": " + value, notes)
        self.assertTrue(notes.startswith("VPT_V1 | "))
        self.assertIn("Đồng ý liên hệ: có", notes)

    def test_sanitization_and_scope_unchanged(self):
        result = self.compare_build(request({"utm_source": "<b>ChatGPT</b>", "utm_medium": "<i>paid</i>",
                                             "your-message": "<b>synthetic</b>\u0001 note"}), "ChatGPT Ads VPT V1", True)
        self.assertEqual(result["build"]["business"]["message"], "synthetic note")
        self.assertEqual(result["build"]["payload"]["assigned_to"], "49fcd3ff-0d7c-4d54-8f5a-1068bd10d68c")
        self.assertEqual(result["build"]["payload"]["pipeline_id"], "78e6251c-aea1-46bc-a19f-a401f1de7f34")
        self.assertEqual(result["build"]["payload"]["region_id"], "f68e643d-7999-442c-83ee-edb7f5237ab1")
        self.assertEqual(result["build"]["payload"]["lead_type_id"], "889a29ee-ddb4-478e-9e15-755eaf4b3639")

    def test_url_normalization_does_not_leak_query(self):
        for url, page in [("https://www.vanphuthanh.net/tu-bep?private=synthetic", "https://vanphuthanh.net/tu-bep"),
                          ("https://unrelated.invalid/tu-bep?private=synthetic", "")]:
            with self.subTest(url=url):
                result = self.compare_build(request({"utm_source": "chatgpt", "utm_medium": "paid"}, url=url),
                                            "ChatGPT Ads VPT V1", True)
                self.assertIn("\nTrang: " + page + "\n", result["build"]["payload"]["notes"])
                self.assertNotIn("private=", result["build"]["payload"]["notes"])

    def test_auth_form_consent_and_contact_guards_unchanged(self):
        cases = [(request(mode="off"), "bridge_off"),
                 (request(mode="test", is_admin=False), "test_requires_admin"),
                 (request({"vpt_form": "OTHER"}), "wrong_form_marker"),
                 (request({"your-consent": ""}), "missing_consent"),
                 (request({"your-name": ""}), "invalid_required_fields"),
                 (request({"your-area": ""}), "invalid_required_fields"),
                 (request({"your-phone": "invalid"}), "invalid_required_fields"),
                 (request({"your-name": "ordinary", "your-phone": "0000000001"}, mode="test", is_admin=True),
                  "test_requires_synthetic_contact"),
                 (request({"your-name": "TEST VPT V1 isolated"}), "test_data_in_live"),
                 (request({"gclid": "VPT_TEST_SYNTHETIC"}), "test_data_in_live")]
        for payload, error in cases:
            with self.subTest(error=error):
                payload["data"].update(utm_source="chatgpt", utm_medium="paid")
                old, new = call(ORIGINAL, payload), call(PATCHED, payload)
                self.assertEqual(old, new)
                self.assertEqual(new, {"ok": False, "error": error})

    def test_fingerprint_remains_business_only(self):
        direct = self.compare_build(request(), "Website VPT V1")
        paid = self.compare_build(request({"utm_source": "chatgpt", "utm_medium": "paid", "utm_content": "another_variant"}),
                                  "ChatGPT Ads VPT V1", True)
        self.assertEqual(direct["fingerprint"], paid["fingerprint"])
        changed = self.compare_build(request({"your-message": "different synthetic business request",
                                              "utm_source": "chatgpt", "utm_medium": "paid"}),
                                     "ChatGPT Ads VPT V1", True)
        self.assertNotEqual(paid["fingerprint"], changed["fingerprint"])

    def test_response_confirmation_and_uncertain_no_retry_policy_unchanged(self):
        lead_id = "00000000-0000-4000-8000-000000000001"
        cases = [(201, json.dumps({"lead": {"id": lead_id}}), False,
                  {"state": "sent", "reason": "confirmed_lead_id", "lead_id": lead_id}),
                 (201, "{}", False, {"state": "review", "reason": "success_without_lead_id"}),
                 (200, "not-json", False, {"state": "review", "reason": "success_without_lead_id"}),
                 (201, json.dumps({"lead": {"id": "invalid"}}), False,
                  {"state": "review", "reason": "success_without_lead_id"}),
                 (502, "{}", False, {"state": "review", "reason": "http_502"}),
                 (400, "{}", False, {"state": "review", "reason": "http_400"}),
                 (201, json.dumps({"lead": {"id": lead_id}}), True,
                  {"state": "review", "reason": "transport_outcome_unknown"})]
        for status, body, transport, expected in cases:
            with self.subTest(status=status, transport=transport, expected=expected["reason"]):
                payload = dict(operation="response", status=status, body=body, transport_error=transport)
                old, new = call(ORIGINAL, payload), call(PATCHED, payload)
                self.assertEqual(old, new)
                self.assertEqual(new, {"ok": True, "result": expected})

    def test_scope_helpers_and_endpoint_unchanged(self):
        payload = dict(operation="scope", data={"nested": {"id": "synthetic", "company_id": "company-a"},
                                                 "other": [{"company_id": "company-b"}, {"company_id": "company-a"}]},
                       id="synthetic")
        old, new = call(ORIGINAL, payload), call(PATCHED, payload)
        self.assertEqual(old, new)
        self.assertEqual(new["result"]["company"], "991dc79d-cbf5-49f9-a364-35227cb47635")
        self.assertEqual(new["result"]["base"], "https://tubep-backend.onrender.com/api/external")
        self.assertTrue(new["result"]["contains"])
        self.assertEqual(new["result"]["company_ids"], ["company-a", "company-b"])


if __name__ == "__main__":
    unittest.main(verbosity=2)
