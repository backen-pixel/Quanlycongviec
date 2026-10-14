"""Behavioral differential tests; each core loads in a separate PHP process."""
import copy
import hashlib
from datetime import datetime, timezone
import json
from pathlib import Path
import subprocess
import sys
import unittest

PHP = sys.argv.pop(1) if len(sys.argv) > 1 else "php"
ROOT = Path(__file__).resolve().parent.parent
PROBE = ROOT / "tests" / "core_probe.php"
ORIGINAL = ROOT / "tests" / "baseline" / "core_0.2.2.php"
LIVE_033 = ROOT / "tests" / "baseline" / "core_0.3.3.php"
PATCHED = ROOT / "core.php"
SYNTHETIC = {
    "vpt_form": "VPT_V1", "your-consent": "agreed",
    "your-name": "Synthetic Local Contact", "your-area": "Synthetic HCM area",
    "your-phone": "0900000000", "your-material": "Inox", "your-timeline": "Synthetic next month",
    "your-message": "ISOLATED QA; no network or customer contact",
}


def call(core, payload):
    # -n ignores php.ini; this executable only requires the pure mapping core.
    process = subprocess.run([PHP, "-n", str(PROBE), str(core)], input=json.dumps(payload), text=True, encoding="utf-8",
                             capture_output=True, check=True, timeout=5)
    if process.stderr:
        raise AssertionError(process.stderr)
    return json.loads(process.stdout)


def backend_receipt(built, now=1790726400, now_ms=None):
    """Model only the entrypoint's server UUID injection, then use the actual pure API parser."""
    body = copy.deepcopy(built)
    body["website_intake"]["request_id"] = "00000000-0000-4000-8000-000000000001"
    js = """const fs=require('fs');
const {externalLeadTracking}=require('./backend/src/domain/externalLeadTracking');
const input=JSON.parse(fs.readFileSync(0,'utf8'));
try {console.log(JSON.stringify({ok:true,result:externalLeadTracking(input.body,input.options)}));}
catch(error) {console.log(JSON.stringify({ok:false,error:error.message}));}"""
    process = subprocess.run(["node", "-e", js], cwd=ROOT.parents[2],
        input=json.dumps({"body": body, "options": {"apiKeyId": "00000000-0000-4000-8000-000000000002", "apiKeyName": "VPT_V1_CF7_CRM_Admin_HCM",
          "companyId": "991dc79d-cbf5-49f9-a364-35227cb47635", "nowMs": now * 1000 if now_ms is None else now_ms}}),
        capture_output=True, text=True, encoding="utf-8", check=True, timeout=5)
    return json.loads(process.stdout)


def bridge(payload):
    process = subprocess.run([PHP, "-n", str(ROOT / "tests" / "bridge_probe.php"),
        str(ROOT / "vpt-v1-crm-bridge.php")], input=json.dumps(payload), text=True,
        encoding="utf-8", capture_output=True, check=True, timeout=5)
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
    def test_actual_live_033_mapping_notes_and_fingerprint_preserved(self):
        cases = [{}, {"utm_source": "google", "utm_medium": "cpc", "gclid": "synthetic-google"},
            {"utm_source": "google", "utm_medium": "organic"},
            {"utm_source": "facebook", "utm_medium": "paid", "utm_campaign": "120200000000001",
                "utm_content": "120200000000002", "fbclid": "synthetic-facebook"},
            {"vpt_referrer_host": "www.google.com", "vpt_landing_page": "https://vanphuthanh.net/bao-gia/?private=synthetic"},
            {"your-phone": "+84 900 000 000", "your-message": "<b>synthetic</b> business"}]
        for data in cases:
            with self.subTest(data=data):
                old, new = call(LIVE_033, request(data)), call(PATCHED, request(data))
                self.assertTrue(old["ok"] and new["ok"])
                del new["result"]["build"]["payload"]["website_intake"]
                self.assertEqual(old, new)
        for size in [300, 500]:
            old = call(LIVE_033, request({"fbclid": "x" * size}))["result"]
            new = call(PATCHED, request({"fbclid": "x" * size}))["result"]
            self.assertEqual(old["fingerprint"], new["fingerprint"])
            self.assertEqual(old["build"]["business"], new["build"]["business"])
            self.assertEqual(old["build"]["payload"]["notes"], new["build"]["payload"]["notes"])
            self.assertEqual(len(new["build"]["payload"]["attribution"]["fbclid"]), size)

    def test_live_woocommerce_hooks_and_kitchen_root_scope_preserved(self):
        result = bridge({})
        self.assertEqual(result["roots"], [24, 25, 83])
        self.assertEqual([h for h in result["hooks"] if h["name"].startswith("woocommerce_")], [
            {"kind": "action", "name": "woocommerce_single_product_summary", "method": "product_form", "priority": 35, "accepted": 1},
            {"kind": "action", "name": "woocommerce_before_shop_loop", "method": "kitchen_cta", "priority": 5, "accepted": 1},
            {"kind": "action", "name": "woocommerce_single_product_summary", "method": "kitchen_cta", "priority": 36, "accepted": 1}])

    def test_live_kitchen_cta_selects_category_product_and_ancestor_without_widening_scope(self):
        cases = [({"page_kind": "category", "term_id": root}, True) for root in [24, 25, 83]]
        cases += [({"page_kind": "category", "term_id": 900, "ancestors": {"900": [901, 25]}}, True),
            ({"page_kind": "product", "product_id": 99, "terms": [902, 900], "ancestors": {"900": [83]}}, True),
            ({"page_kind": "product", "terms": [24]}, True),
            ({"page_kind": "category", "term_id": 900, "ancestors": {"900": [901]}}, False),
            ({"page_kind": "category"}, False), ({"page_kind": "product", "terms": False}, False),
            ({"page_kind": "product", "terms": []}, False), ({"page_kind": "other", "term_id": 24, "terms": [24]}, False)]
        for payload, expected in cases:
            with self.subTest(payload=payload):
                result = bridge({"mode": "live", **payload})
                self.assertEqual(result["eligible"], expected)
                self.assertEqual(bool(result["cta"]), expected)
                if expected:
                    self.assertIn('href="#wpcf7-f11116-o1"', result["cta"])
                    self.assertIn("Nhận báo giá trọn gói", result["cta"])
                    self.assertIn("scrollIntoView", result["cta"])
                self.assertEqual(result["product_form"], "")
                self.assertEqual(result["shortcodes"], [])

    def test_live_product_form_and_upsell_remain_live_only_and_use_original_form(self):
        for mode in ["off", "test", "live"]:
            for product_id in [6368, 5864, 6203, 999]:
                with self.subTest(mode=mode, product_id=product_id):
                    result = bridge({"mode": mode, "page_kind": "product", "product_id": product_id, "terms": [24]})
                    expected_form = mode == "live" and product_id in [6368, 5864, 6203]
                    self.assertEqual(bool(result["product_form"]), expected_form)
                    self.assertEqual(bool(result["cta"]), mode == "live")
                    if expected_form:
                        self.assertEqual(result["shortcodes"], ['[contact-form-7 id="11116" title="VPT V1 — Tư vấn tủ bếp inox và nhôm"]'])
                        self.assertIn('id="tu-van-tu-bep-vpt-v1"', result["product_form"])
                    else:
                        self.assertEqual(result["shortcodes"], [])

    def compare_build(self, payload, expected_source, eligible=False):
        baseline = call(ORIGINAL, payload)
        candidate = call(PATCHED, payload)
        self.assertTrue(baseline["ok"])
        self.assertTrue(candidate["ok"])
        self.assertEqual(candidate["result"]["build"]["payload"]["source_name"], expected_source)
        if eligible:
            self.assertEqual(baseline["result"]["build"]["payload"]["source_name"], "Website VPT V1")
            self.assertNotEqual(baseline, candidate)
        old = copy.deepcopy(baseline)
        new = copy.deepcopy(candidate)
        del new["result"]["build"]["payload"]["attribution"]
        del new["result"]["build"]["payload"]["is_test"]
        del new["result"]["build"]["payload"]["website_intake"]
        del old["result"]["build"]["payload"]["source_name"]
        del new["result"]["build"]["payload"]["source_name"]
        self.assertEqual(old, new, "Only source_name and additive tracking contract may change; fingerprint, scope and notes remain identical")
        return candidate["result"]

    def test_structured_campaign_clicks_and_test_flag(self):
        built = call(PATCHED, request({"utm_source":"google", "campaignid":"23976669573",
                      "adgroupid":"123456789", "gclid":"synthetic-click"}))["result"]["build"]["payload"]
        self.assertEqual(built["attribution"]["campaign_id"], "23976669573")
        self.assertEqual(built["attribution"]["adset_id"], "123456789")
        self.assertEqual(built["attribution"]["gclid"], "synthetic-click")
        self.assertFalse(built["is_test"])
        marked = call(PATCHED, request({"your-name":"TEST VPT V1 isolated", "your-phone":"0000000001"},
                      mode="test", is_admin=True))["result"]["build"]["payload"]
        self.assertTrue(marked["is_test"])
        self.assertNotIn("gclid", marked["attribution"])

    def test_bridge_payload_accepted_by_backend_contract(self):
        for data in [{}, {"utm_source":"google", "utm_medium":"cpc", "campaignid":"23976669573",
                          "gclid":"synthetic-click", "gbraid":"synthetic-braid"}]:
            built = call(PATCHED, request(data))["result"]["build"]["payload"]
            self.assertIsNone(built["website_intake"]["request_id"], "Only server capture may assign a request UUID")
            result = backend_receipt(built)
            self.assertTrue(result["ok"], result)
            received = result["result"]
            self.assertEqual(received["intake_attribution"], built["attribution"])
            self.assertEqual(received["is_test"], built["is_test"])
            self.assertEqual(received["website_intake"]["api_key_fingerprint"], hashlib.sha256(b"00000000-0000-4000-8000-000000000002").hexdigest())
            self.assertNotIn("api_key_id", received["website_intake"])
            self.assertNotIn("00000000-0000-4000-8000-000000000002", json.dumps(received["website_intake"]))

    def test_website_receipt_defaults_keep_server_time_form_scope_and_no_matching_consent(self):
        built = call(PATCHED, request({"vpt_fbc": "unconsented-cookie", "vpt_fbp": "unconsented-browser",
            "vpt_fb_captured_at": "2026-01-01T00:00:00Z", "request_id": "browser-spoof",
            "api_key_id": "browser-key"}))["result"]["build"]["payload"]
        self.assertEqual(built["website_intake"], {"version": 1, "request_id": None,
            "form_id": "11116", "site_host": "vanphuthanh.net", "submitted_at": "2026-09-30T00:00:00.000+00:00",
            "landing_url": "https://vanphuthanh.net/tu-bep", "captured_at": None, "fbc": None, "fbp": None,
            "measurement_consent": False, "consent_version": "VPT_ADS_V1"})
        self.assertNotIn("api_key_id", built["website_intake"])
        self.assertEqual(built["phone"], "0900000000")
        self.assertNotIn("unconsented", json.dumps(built, ensure_ascii=False))

    def test_only_literal_advertising_opt_in_enables_matching_without_requiring_it_for_intake(self):
        for consent in [None, "", [], [1], 1, True, "true", "yes", "1 ", ["0"]]:
            with self.subTest(consent=consent):
                result = call(PATCHED, request({"your-ads-consent": consent, "vpt_fbc": "unconsented",
                    "vpt_fbp": "unconsented", "vpt_fb_captured_at": "unconsented"}))
                self.assertTrue(result["ok"])
                website = result["result"]["build"]["payload"]["website_intake"]
                self.assertFalse(website["measurement_consent"])
                self.assertIsNone(website["fbc"]); self.assertIsNone(website["fbp"]); self.assertIsNone(website["captured_at"])
        for consent in ["1", ["1"]]:
            with self.subTest(consent=consent):
                result = call(PATCHED, request({"your-ads-consent": consent}))
                self.assertTrue(result["ok"])
                website = result["result"]["build"]["payload"]["website_intake"]
                self.assertTrue(website["measurement_consent"])
                self.assertIsNone(website["fbc"], "Consent cannot invent missing matching identifiers")
        denied_contact = call(PATCHED, request({"your-consent": "", "your-ads-consent": "1"}))
        self.assertEqual(denied_contact, {"ok": False, "error": "missing_consent"})

    def test_consented_original_matching_time_survives_php_to_real_backend_parser(self):
        capture_ms = 1790726340123
        captured_at = datetime.fromtimestamp(capture_ms / 1000, timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")
        for click in ["synthetic-fb", "A" * 300, "A" * 500]:
            with self.subTest(click_length=len(click)):
                fbc = f"fb.1.{capture_ms}.{click}"
                fbp = f"fb.1.{capture_ms - 1000}.123456789012345678901234567890"
                built = call(PATCHED, request({"your-ads-consent": ["1"], "utm_source": "facebook", "utm_medium": "paid",
                    "utm_campaign": "120200000000001", "utm_content": "120200000000002", "fbclid": click,
                    "vpt_fbc": fbc, "vpt_fbp": fbp, "vpt_fb_captured_at": captured_at}))["result"]["build"]["payload"]
                website = built["website_intake"]
                self.assertEqual(website["fbc"], fbc); self.assertEqual(website["fbp"], fbp)
                self.assertEqual(website["captured_at"], captured_at)
                self.assertIn("\nfbclid: " + click[:256] + "\n", built["notes"] + "\n",
                    "Structured matching preserves the full ID while legacy notes retain their existing limit")
                result = backend_receipt(built)
                self.assertTrue(result["ok"], result)
                self.assertEqual(result["result"]["website_intake"]["captured_at"], captured_at)
                self.assertEqual(result["result"]["intake_attribution"]["fbclid"], click)

    def test_measurement_metadata_never_changes_business_fingerprint_or_legacy_notes(self):
        ordinary = call(PATCHED, request())["result"]
        consenting = call(PATCHED, request({"your-ads-consent": "1", "vpt_fbc": "synthetic-only",
            "vpt_fbp": "synthetic-only", "vpt_fb_captured_at": "2026-09-29T23:59:00Z"}))["result"]
        self.assertEqual(consenting["fingerprint"], ordinary["fingerprint"])
        self.assertEqual(consenting["build"]["business"], ordinary["build"]["business"])
        self.assertEqual(consenting["build"]["payload"]["notes"], ordinary["build"]["payload"]["notes"])
        self.assertNotIn("synthetic-only", ordinary["build"]["payload"]["notes"])

    def test_rapid_click_then_submit_retains_real_milliseconds_without_changing_legacy_notes(self):
        base_ms = 1790726400000
        click_ms, submit_ms = base_ms + 123, base_ms + 500
        captured = "2026-09-30T00:00:00.123Z"
        built = call(PATCHED, request({"your-ads-consent": "1", "utm_source": "facebook", "utm_medium": "paid",
            "fbclid": "rapidActualClick", "vpt_fbc": f"fb.1.{click_ms}.rapidActualClick",
            "vpt_fb_captured_at": captured}, submitted_ms=submit_ms))["result"]["build"]["payload"]
        self.assertEqual(built["website_intake"]["submitted_at"], "2026-09-30T00:00:00.500+00:00")
        self.assertEqual(built["website_intake"]["captured_at"], captured)
        self.assertTrue(built["notes"].startswith("VPT_V1 | 2026-09-30T00:00:00+00:00\n"))
        result = backend_receipt(built, now_ms=base_ms + 600)
        self.assertTrue(result["ok"], result)
        self.assertEqual(result["result"]["website_intake"]["submitted_at"], "2026-09-30T00:00:00.500Z")

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
        notes = candidate['build']['payload']['notes']
        self.assertIn('\nvpt_landing_page: https://vanphuthanh.net/tu-bep/', notes)
        self.assertIn('\nvpt_referrer_host: www.google.com.vn', notes)
        self.assertNotIn('private=', notes)
        self.assertNotIn('#secret', notes)
        self.assertEqual(candidate['build']['payload']['attribution']['landing_url'], 'https://vanphuthanh.net/tu-bep/')
        invalid = call(PATCHED, request({'vpt_referrer_host':'google.com/private?secret=x','vpt_landing_page':'https://evil.invalid/path'}))['result']
        self.assertNotIn('vpt_referrer_host:', invalid['build']['payload']['notes'])
        self.assertNotIn('vpt_landing_page:', invalid['build']['payload']['notes'])

    def test_facebook_ad_ids_and_fbclid_become_structured_attribution(self):
        built = call(PATCHED, request({"utm_source": "FB", "utm_medium": "paid", "utm_campaign": "120200000000001",
                                       "utm_content": "120200000000002", "fbclid": "synthetic-fb"}))["result"]
        a = built["build"]["payload"]["attribution"]
        self.assertEqual(a["platform"], "facebook")
        self.assertEqual(a["campaign_id"], "120200000000001")
        self.assertEqual(a["ad_id"], "120200000000002")
        self.assertEqual(a["fbclid"], "synthetic-fb")
        self.assertIn("\nfbclid: synthetic-fb", built["build"]["payload"]["notes"])
        self.assertEqual(built["fingerprint"], call(PATCHED, request())["result"]["fingerprint"])
        named = call(PATCHED, request({"utm_source": "facebook", "utm_campaign": "tet sale", "utm_content": "video"}))["result"]
        self.assertNotIn("ad_id", named["build"]["payload"]["attribution"])
        self.assertNotIn("campaign_id", named["build"]["payload"]["attribution"])
        google = call(PATCHED, request({"utm_source": "google", "utm_content": "120200000000002"}))["result"]
        self.assertNotIn("ad_id", google["build"]["payload"]["attribution"])

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

    def test_public_receipt_state_exposes_only_delivery_state(self):
        cases = [({"state": "sent", "lead_id": "00000000-0000-4000-8000-000000000001", "payload": {"phone": "0900000000"}}, "confirmed"),
                 ({"state": "queued"}, "pending"), ({"state": "sending"}, "pending"),
                 ({"state": "review"}, "failed"), ({"state": "blocked"}, "failed"),
                 ({"state": "other"}, "unknown"), (None, "unknown")]
        for job, expected in cases:
            with self.subTest(expected=expected):
                self.assertEqual(call(PATCHED, {"operation": "receipt", "job": job}), {"ok": True, "result": expected})

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
