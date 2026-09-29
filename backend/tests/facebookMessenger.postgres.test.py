#!/usr/bin/env python3
"""Issue #7: real PostgreSQL concurrency tests, isolated synthetic database only.

Requires Python 3 + psql; imports no app code, .env or production credentials.
The guard refuses remote hosts, other database names and nonempty databases.
The Actions service is discarded after each run. PGlite cannot replace this test.
"""
import json
import os
from pathlib import Path
import shutil
import subprocess
import time
import unittest


ROOT = Path(__file__).resolve().parents[2]
FIXTURES = Path(__file__).resolve().parent / "fixtures"
PAGE = "409741855550833"
COMPANY = "991dc79d-cbf5-49f9-a364-35227cb47635"
PREFIX = "vpt_ci_"


def literal(value):
    return "'" + str(value).replace("'", "''") + "'"


def uid(n):
    return f"10000000-0000-4000-8000-{n:012d}"


def isolated_environment():
    if (os.environ.get("VPT_ISOLATED_PG_TEST") != "1"
            or os.environ.get("PGHOST") != "127.0.0.1"
            or os.environ.get("PGDATABASE") != "vpt_messenger_ci"):
        raise RuntimeError("Use only the explicit localhost vpt_messenger_ci disposable database")
    if not shutil.which("psql"):
        raise RuntimeError("psql is required; no real PostgreSQL tests have run")
    # Do not inherit PGSERVICE/PGOPTIONS/PGPASSFILE or a remote fallback host.
    env = {key: value for key, value in os.environ.items() if not key.startswith("PG")}
    for key in ("PGHOST", "PGPORT", "PGDATABASE", "PGUSER", "PGPASSWORD"):
        if key in os.environ:
            env[key] = os.environ[key]
    env["PGCONNECT_TIMEOUT"] = "5"
    env["PGSSLMODE"] = "disable"
    env["PGOPTIONS"] = "-c statement_timeout=30000"
    return env


class PostgresIntegration(unittest.TestCase):
    @classmethod
    def run_sql(cls, sql, name="check", timeout=15):
        result = subprocess.run(
            ["psql", "-X", "-w", "-qAt", "-v", "ON_ERROR_STOP=1"],
            input=sql, text=True, capture_output=True,
            env={**cls.env, "PGAPPNAME": PREFIX + name}, timeout=timeout,
        )
        if result.returncode:
            raise AssertionError(f"psql {name} failed: {result.stderr.strip()}")
        return result.stdout.strip()

    @classmethod
    def scalar(cls, sql):
        return cls.run_sql(sql).splitlines()[-1]

    @classmethod
    def setUpClass(cls):
        cls.env = isolated_environment()
        count = cls.scalar("SELECT count(*) FROM pg_tables WHERE schemaname='public';")
        if count != "0":
            raise RuntimeError("Refusing to alter a nonempty database; use a fresh Actions service")
        sections = {part["section"]: part["data"] for part in json.loads(
            (FIXTURES / "lead_attribution_runtime_schema.json").read_text())}
        quoted = lambda value: '"' + value.replace('"', '""') + '"'
        columns = [
            quoted(c["name"]) + " " + c["type"]
            + (" DEFAULT " + c["default"] if c["default"] else "")
            + (" NOT NULL" if c["nullable"] == "NO" else "")
            for c in sections["columns"]
        ]
        columns += ["CONSTRAINT " + quoted(c["name"]) + " " + c["definition"]
                    for c in sections["constraints"]]
        attribution_ddl = "CREATE TABLE lead_attribution(" + ",".join(columns) + ");"
        acl = json.loads((FIXTURES / "lead_attribution_runtime_indexes_acl.json").read_text())
        indexes = []
        for i, spec in enumerate(acl["unique_indexes"]):
            if not spec.get("primary"):
                indexes.append(f"CREATE UNIQUE INDEX attribution_fixture_{i} ON lead_attribution ("
                               + ",".join(map(quoted, spec["columns"])) + ") WHERE " + spec["predicate"] + ";")
        grants = ["GRANT " + ",".join(privileges) + " ON lead_attribution TO " + quoted(role) + ";"
                  for role, privileges in acl["table_privileges"].items()]
        cls.run_sql(f"""
          CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN;
          CREATE ROLE service_role NOLOGIN BYPASSRLS;
          CREATE TABLE companies(id uuid PRIMARY KEY);
          CREATE TABLE customers(id uuid PRIMARY KEY);
          CREATE TABLE facebook_pages(
            page_id text PRIMARY KEY, is_active boolean DEFAULT true,
            default_company_id uuid, default_module_key text, default_target_type text);
          CREATE TABLE crm_leads(
            id uuid PRIMARY KEY DEFAULT gen_random_uuid(), code text, title text, type text,
            company_id uuid REFERENCES companies(id), customer_id uuid REFERENCES customers(id),
            source_id uuid, stage_id uuid, pipeline_id uuid, region_id uuid, lead_type_id uuid,
            install_address text, description text, lead_owner_id uuid, assigned_to uuid,
            created_by uuid, stage_entered_at timestamptz, created_at timestamptz DEFAULT now());
          CREATE TABLE facebook_contacts(
            id uuid PRIMARY KEY, page_id text REFERENCES facebook_pages(page_id),
            lead_id uuid REFERENCES crm_leads(id) ON DELETE SET NULL,
            customer_id uuid REFERENCES customers(id), updated_at timestamptz DEFAULT now());
          CREATE TABLE app_settings(key text PRIMARY KEY, value jsonb);
          {attribution_ddl}
          {''.join(indexes)}
          {''.join(grants)}
          GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO service_role;
          INSERT INTO companies VALUES ('{COMPANY}');
          INSERT INTO facebook_pages VALUES ('{PAGE}',true,'{COMPANY}','crm','lead');
        """)
        for name in ("639_facebook_contact_lead_atomic.sql", "640_facebook_messenger_receipts.sql",
                     "641_facebook_referral_attribution.sql"):
            cls.run_sql((ROOT / "database" / name).read_text(), name="migration")

    def setUp(self):
        self.children = []
        self.run_sql("TRUNCATE lead_attribution,facebook_messenger_receipts,facebook_contacts,crm_leads,customers,app_settings CASCADE;")

    def tearDown(self):
        # Only sessions launched by this synthetic harness in its guarded database.
        self.run_sql(f"SELECT pg_terminate_backend(pid) FROM pg_stat_activity "
                     f"WHERE datname=current_database() AND application_name LIKE '{PREFIX}%' "
                     "AND pid<>pg_backend_pid();")
        for child in self.children:
            try:
                child.communicate(timeout=5)
            except subprocess.TimeoutExpired:
                child.kill()
                child.communicate()
        self.run_sql("DROP TRIGGER IF EXISTS ci_interrupt_link ON facebook_contacts; "
                     "DROP FUNCTION IF EXISTS ci_interrupt_link();")

    def spawn(self, sql, name):
        child = subprocess.Popen(
            ["psql", "-X", "-w", "-qAt", "-v", "ON_ERROR_STOP=1"],
            stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
            text=True, env={**self.env, "PGAPPNAME": PREFIX + name})
        child.stdin.write(sql)
        child.stdin.close()
        child.stdin = None
        self.children.append(child)
        return child

    def result(self, child):
        stdout, stderr = child.communicate(timeout=15)
        self.assertEqual(child.returncode, 0, stderr)
        return stdout.strip()

    def await_condition(self, sql, explanation):
        deadline = time.monotonic() + 8
        while time.monotonic() < deadline:
            if self.scalar(sql) == "t":
                return
            time.sleep(0.04)
        self.fail(explanation)

    def await_sleep(self, name):
        self.await_condition("SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE "
                             f"application_name={literal(PREFIX + name)} AND wait_event='PgSleep');",
                             f"{name} did not reach the deliberate transaction barrier")

    def terminate(self, name):
        result = self.scalar("SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE "
                             f"datname=current_database() AND application_name={literal(PREFIX + name)};")
        self.assertEqual(result, "t")

    def contact(self, n=1):
        self.run_sql(f"INSERT INTO facebook_contacts(id,page_id) VALUES('{uid(n)}','{PAGE}');")

    def lead_call(self, n=1, code="SYNTHETIC-LEAD"):
        data = json.dumps({"code": code, "title": "Synthetic fixture only", "type": "lead", "company_id": COMPANY})
        return "SELECT create_facebook_contact_lead_once(" + ",".join(map(literal, [uid(n), PAGE, COMPANY, data])) + "::jsonb,NULL);"

    def test_concurrent_create_and_link_returns_one_lead(self):
        self.contact()
        holder = self.spawn(f"BEGIN; SELECT id FROM facebook_contacts WHERE id='{uid(1)}' FOR UPDATE; SELECT pg_sleep(60); COMMIT;", "contact_holder")
        self.await_sleep("contact_holder")
        workers = [self.spawn("SET ROLE service_role; " + self.lead_call(code=f"SYNTHETIC-{n}"), f"create_{n}") for n in range(8)]
        self.await_condition("SELECT count(*)=8 FROM pg_stat_activity WHERE "
                             f"application_name LIKE '{PREFIX}create_%' AND wait_event_type='Lock';",
                             "Eight independent RPC sessions did not overlap on the contact lock")
        self.terminate("contact_holder")
        holder.communicate(timeout=5)
        results = [json.loads(self.result(worker)) for worker in workers]
        self.assertEqual(sum(result["created"] for result in results), 1)
        lead_ids = {result["lead"]["id"] for result in results}
        self.assertEqual(len(lead_ids), 1)
        self.assertEqual(self.scalar("SELECT count(*) FROM crm_leads;"), "1")
        self.assertEqual(self.scalar(f"SELECT lead_id FROM facebook_contacts WHERE id='{uid(1)}';"), lead_ids.pop())

    def test_interrupted_connection_rolls_back_insert_and_retry_repairs(self):
        self.contact()
        # This fires after the RPC inserted a Lead, before its contact UPDATE.
        self.run_sql(f"""CREATE FUNCTION ci_interrupt_link() RETURNS trigger LANGUAGE plpgsql AS $$
          BEGIN IF NEW.id='{uid(1)}'::uuid AND NEW.lead_id IS NOT NULL THEN
            PERFORM pg_sleep(60); END IF; RETURN NEW; END $$;
          CREATE TRIGGER ci_interrupt_link BEFORE UPDATE ON facebook_contacts
            FOR EACH ROW EXECUTE FUNCTION ci_interrupt_link();""")
        worker = self.spawn("SET ROLE service_role; " + self.lead_call(), "interrupted_writer")
        self.await_sleep("interrupted_writer")
        self.assertEqual(self.scalar("SELECT count(*) FROM crm_leads;"), "0", "Uncommitted insert leaked")
        self.terminate("interrupted_writer")
        worker.communicate(timeout=5)
        self.assertNotEqual(worker.returncode, 0)
        self.assertEqual(self.scalar("SELECT count(*) FROM crm_leads;"), "0", "Interrupted RPC left an orphan Lead")
        self.assertEqual(self.scalar("SELECT count(*) FROM facebook_contacts WHERE lead_id IS NOT NULL;"), "0")
        self.run_sql("DROP TRIGGER ci_interrupt_link ON facebook_contacts; DROP FUNCTION ci_interrupt_link();")
        first = json.loads(self.run_sql("SET ROLE service_role; " + self.lead_call()))
        replay = json.loads(self.run_sql("SET ROLE service_role; " + self.lead_call()))
        self.assertTrue(first["created"])
        self.assertFalse(replay["created"])
        self.assertEqual(first["lead"]["id"], replay["lead"]["id"])
        self.assertEqual(self.scalar("SELECT count(*) FROM crm_leads;"), "1")

    def test_claim_skips_uncommitted_worker_and_failed_worker_is_recoverable(self):
        self.run_sql(f"INSERT INTO facebook_messenger_receipts(id,event_key,page_id,payload,created_at) VALUES "
                     f"('{uid(10)}','synthetic-first','{PAGE}','{{}}',now()-interval '1 second'),"
                     f"('{uid(11)}','synthetic-second','{PAGE}','{{}}',now());")
        held = self.spawn(f"BEGIN; SET LOCAL ROLE service_role; SELECT id FROM facebook_claim_receipt_v1(ARRAY['{PAGE}'],'{uid(20)}'); SELECT pg_sleep(60); COMMIT;", "claim_holder")
        self.await_sleep("claim_holder")
        claimed = self.run_sql(f"SET ROLE service_role; SET statement_timeout='2s'; "
                               f"SELECT id FROM facebook_claim_receipt_v1(ARRAY['{PAGE}'],'{uid(21)}');")
        self.assertEqual(claimed, uid(11), "Second worker must skip the first worker's locked receipt")
        self.terminate("claim_holder")
        held.communicate(timeout=5)
        reclaimed = self.run_sql(f"SET ROLE service_role; SELECT id FROM facebook_claim_receipt_v1(ARRAY['{PAGE}'],'{uid(22)}');")
        self.assertEqual(reclaimed, uid(10), "Aborted transaction must return the first receipt to the queue")
        self.assertEqual(self.scalar(f"SELECT attempts FROM facebook_messenger_receipts WHERE id='{uid(10)}';"), "1")

    def test_expired_lease_rejects_previous_workers_completion(self):
        self.run_sql(f"INSERT INTO facebook_messenger_receipts(id,event_key,page_id,payload) VALUES('{uid(10)}','synthetic-lease','{PAGE}','{{}}');")
        claim = lambda token: f"SET ROLE service_role; SELECT id FROM facebook_claim_receipt_v1(ARRAY['{PAGE}'],'{uid(token)}');"
        self.assertEqual(self.run_sql(claim(20), name="original_worker"), uid(10))
        self.assertEqual(self.run_sql(claim(21), name="other_worker"), "", "Live lease must exclude other workers")
        # Advance only the disposable fixture's lease; no five-minute real sleep.
        self.run_sql(f"UPDATE facebook_messenger_receipts SET locked_until=now()-interval '1 second' WHERE id='{uid(10)}';")
        self.assertEqual(self.run_sql(claim(21), name="replacement_worker"), uid(10))
        finish = lambda token, success: f"SET ROLE service_role; SELECT facebook_finish_receipt_v1('{uid(10)}','{uid(token)}',{success});"
        self.assertEqual(self.run_sql(finish(20, 'true'), name="stale_worker"), "f")
        self.assertEqual(self.scalar(f"SELECT lock_token FROM facebook_messenger_receipts WHERE id='{uid(10)}';"), uid(21))
        self.assertEqual(self.run_sql(finish(21, 'false'), name="replacement_worker"), "t")
        self.assertEqual(self.run_sql(claim(22)), "", "Retry backoff must exclude immediate reclamation")
        self.run_sql(f"UPDATE facebook_messenger_receipts SET available_at=now()-interval '1 second' WHERE id='{uid(10)}';")
        self.assertEqual(self.run_sql(claim(22)), uid(10))
        self.assertEqual(self.run_sql(finish(21, 'true')), "f")
        self.assertEqual(self.run_sql(finish(22, 'true')), "t")
        self.assertEqual(self.run_sql(claim(23)), "")
        self.assertEqual(self.scalar(f"SELECT status||':'||attempts FROM facebook_messenger_receipts WHERE id='{uid(10)}';"), "done:3")

    def test_parallel_referral_then_lead_link_preserves_one_attribution(self):
        self.contact()
        mapping = json.dumps({"100": {"page_id": PAGE, "company_id": COMPANY,
                                     "campaign_id": "200", "adset_id": "300", "campaign_name": "Synthetic"}})
        self.run_sql("INSERT INTO app_settings VALUES('facebook_ad_campaign_mapping_v1'," + literal(mapping) + "::jsonb);")
        capture = f"SET ROLE service_role; SELECT facebook_capture_referral_v1('{PAGE}','{uid(1)}','{{\"ad_id\":\"100\"}}','{'a' * 64}');"
        results = [self.result(child) for child in [self.spawn(capture, f"referral_{n}") for n in range(8)]]
        self.assertEqual(len(set(results)), 1)
        self.assertEqual(self.scalar("SELECT count(*) FROM lead_attribution WHERE lead_id IS NULL;"), "1")
        created = json.loads(self.run_sql("SET ROLE service_role; " + self.lead_call()))
        link = f"SET ROLE service_role; SELECT facebook_link_attribution_v1('{PAGE}','{uid(1)}');"
        self.assertTrue(all(self.result(child) == "t" for child in [self.spawn(link, f"link_{n}") for n in range(8)]))
        self.run_sql(capture)
        row = json.loads(self.scalar("SELECT row_to_json(a) FROM (SELECT lead_id,fb_ad_id,fb_campaign_id,fb_adset_id FROM lead_attribution) a;"))
        self.assertEqual(row, {"lead_id": created["lead"]["id"], "fb_ad_id": "100", "fb_campaign_id": "200", "fb_adset_id": "300"})
        self.assertEqual(self.scalar("SELECT count(*) FROM lead_attribution;"), "1")


if __name__ == "__main__":
    unittest.main()
