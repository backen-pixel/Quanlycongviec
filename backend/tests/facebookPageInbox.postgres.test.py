#!/usr/bin/env python3
"""H1: PostgreSQL Page inbox tests; only a fresh explicitly opted-in localhost DB.

Python standard library + PostgreSQL CLI only. No app startup, provider, .env or
production connection. CI must supply the disposable DB vpt_page_inbox_ci.
Optional VPT_INBOX_RESTORE_TEST=1 also requires pg_dump/pg_restore and CREATEDB;
it creates its own empty vpt_page_inbox_restore_ci and refuses an existing target.
The logical restore is a bounded inbox check, not production backup acceptance.
"""
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import time
import unittest

ROOT = Path(__file__).resolve().parents[2]
PREFIX = "vpt_inbox_ci_"
TABLE = "public.facebook_page_inbox"
MIGRATION = ROOT / "database/701_facebook_page_inbox.sql"


def literal(value):
    return "'" + str(value).replace("'", "''") + "'"


def uid(n):
    return f"70100000-0000-4000-8000-{n:012d}"


def event(n, page="synthetic-page-A", kind="messaging"):
    return {"event_key": hashlib.sha256(f"synthetic-event-{n}".encode()).hexdigest(),
            "page_id": page, "payload": {"kind": kind, "event": {"fixture": n}}}


def enqueue(rows):
    return "SELECT public.facebook_page_inbox_enqueue_v1(" + literal(json.dumps(rows)) + "::jsonb);"


def isolated_environment():
    if (os.environ.get("VPT_ISOLATED_PG_TEST") != "1"
            or os.environ.get("PGHOST") != "127.0.0.1"
            or os.environ.get("PGDATABASE") != "vpt_page_inbox_ci"):
        raise RuntimeError("Use only explicit localhost disposable vpt_page_inbox_ci")
    if not shutil.which("psql"):
        raise RuntimeError("psql unavailable: real PostgreSQL tests have NOT run")
    env = {key: value for key, value in os.environ.items() if not key.startswith("PG")}
    for key in ("PGHOST", "PGPORT", "PGDATABASE", "PGUSER", "PGPASSWORD"):
        if key in os.environ:
            env[key] = os.environ[key]
    env.update(PGCONNECT_TIMEOUT="5", PGSSLMODE="disable", PGOPTIONS="-c statement_timeout=30000")
    return env


class PageInboxPostgres(unittest.TestCase):
    @classmethod
    def sql_process(cls, sql, name="check", timeout=15, database=None):
        env = {**cls.env, "PGAPPNAME": PREFIX + name}
        if database:
            env["PGDATABASE"] = database
        return subprocess.run(["psql", "-X", "-w", "-qAt", "-v", "ON_ERROR_STOP=1",
                               "-v", "VERBOSITY=verbose"], input=sql, text=True,
                              capture_output=True, env=env, timeout=timeout)

    @classmethod
    def sql(cls, sql, **kwargs):
        result = cls.sql_process(sql, **kwargs)
        if result.returncode:
            raise AssertionError(result.stderr.strip())
        return result.stdout.strip()

    @classmethod
    def service(cls, sql, **kwargs):
        return cls.sql("SET ROLE service_role; " + sql, **kwargs)

    @classmethod
    def scalar(cls, sql, **kwargs):
        return cls.sql(sql, **kwargs).splitlines()[-1]

    @classmethod
    def setUpClass(cls):
        cls.env = isolated_environment()
        if cls.scalar("SELECT count(*) FROM pg_tables WHERE schemaname='public';") != "0":
            raise RuntimeError("Refusing a nonempty database; create a new disposable CI service")
        cls.sql("CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; "
                "CREATE ROLE service_role NOLOGIN BYPASSRLS;")
        # Actual baseline hardening first; 701 must not reopen broad access.
        cls.sql((ROOT / "database/700_revoke_anon_public_access.sql").read_text(encoding="utf-8"), name="700")
        cls.sql(MIGRATION.read_text(encoding="utf-8"), name="701")
        cls.sql(MIGRATION.read_text(encoding="utf-8"), name="701_replay")

    def setUp(self):
        self.children = []
        self.sql(f"TRUNCATE {TABLE} RESTART IDENTITY;")

    def tearDown(self):
        self.sql("SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE "
                 f"datname=current_database() AND application_name LIKE '{PREFIX}%' "
                 "AND pid<>pg_backend_pid();")
        for child in self.children:
            try:
                child.communicate(timeout=5)
            except subprocess.TimeoutExpired:
                child.kill()
                child.communicate()

    def spawn(self, sql, name):
        child = subprocess.Popen(["psql", "-X", "-w", "-qAt", "-v", "ON_ERROR_STOP=1"],
                                 stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                 text=True, env={**self.env, "PGAPPNAME": PREFIX + name})
        child.stdin.write(sql)
        child.stdin.close()
        child.stdin = None
        self.children.append(child)
        return child

    def result(self, child):
        stdout, stderr = child.communicate(timeout=10)
        self.assertEqual(child.returncode, 0, stderr)
        return stdout.strip()

    def wait(self, name, event_name, timeout=5):
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            # Each poll is a fresh owner connection/snapshot, unlike a cached stats TX.
            if self.scalar("SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE "
                           f"application_name={literal(PREFIX + name)} AND "
                           f"(wait_event={literal(event_name)} OR wait_event_type={literal(event_name)}));") == "t":
                return
            time.sleep(0.015)
        self.fail(f"{name} did not reach observed {event_name} barrier")

    def terminate(self, name):
        self.assertEqual(self.scalar("SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE "
                                     f"datname=current_database() AND application_name={literal(PREFIX + name)};"), "t")

    def error(self, sql, code, service=True):
        result = self.sql_process(("SET ROLE service_role; " if service else "") + sql)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn(code, result.stderr)

    def claim(self, token=1):
        value = self.service(f"SELECT row_to_json(x) FROM public.facebook_page_inbox_claim_v1('{uid(token)}') x;")
        return json.loads(value) if value else None

    def finish(self, row_id, token=1, success=True, error_code="PROCESSING_FAILED"):
        return self.service("SELECT public.facebook_page_inbox_finish_v1(" +
                            f"'{row_id}','{uid(token)}',{'true' if success else 'false'},{literal(error_code)});")

    def test_01_idempotent_migration_minimal_acl_rls_invoker(self):
        self.assertEqual(self.scalar(f"SELECT relrowsecurity FROM pg_class WHERE oid='{TABLE}'::regclass;"), "t")
        for role in ("anon", "authenticated"):
            for privilege in ("SELECT", "INSERT", "UPDATE", "DELETE", "TRUNCATE", "TRIGGER"):
                self.assertEqual(self.scalar(f"SELECT has_table_privilege('{role}','{TABLE}','{privilege}');"), "f")
        for privilege in ("SELECT", "INSERT", "UPDATE"):
            self.assertEqual(self.scalar(f"SELECT has_table_privilege('service_role','{TABLE}','{privilege}');"), "t")
        for privilege in ("DELETE", "TRUNCATE", "TRIGGER", "REFERENCES"):
            self.assertEqual(self.scalar(f"SELECT has_table_privilege('service_role','{TABLE}','{privilege}');"), "f")
        self.assertEqual(self.scalar("SELECT count(*)=5 AND bool_and(NOT prosecdef) AND "
            "bool_and(has_function_privilege('service_role',oid,'EXECUTE')) AND "
            "bool_and(NOT has_function_privilege('anon',oid,'EXECUTE')) AND "
            "bool_and(NOT has_function_privilege('authenticated',oid,'EXECUTE')) "
            "FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname LIKE 'facebook_page_inbox_%_v1';"), "t")
        self.assertEqual(self.scalar("SELECT has_sequence_privilege('service_role',"
            "'public.facebook_page_inbox_queue_order_seq','UPDATE');"), "f")
        self.error("SELECT public.facebook_page_inbox_health_v1();", "42501", service=False)
        self.service(enqueue([event(1)]))
        self.error(f"DELETE FROM {TABLE};", "42501")
        self.error(f"TRUNCATE {TABLE};", "42501")

    def test_02_unknown_page_and_all_envelope_kinds_retained_duplicate_no_reset(self):
        rows = [event(1, "unknown-signed-page", "entry"), event(2, kind="change"), event(3)]
        self.assertEqual(self.service(enqueue(rows + [rows[0]])), "4")
        self.assertEqual(self.scalar(f"SELECT count(*) FROM {TABLE};"), "3")
        before = self.scalar(f"SELECT jsonb_agg(to_jsonb(i) ORDER BY queue_order) FROM {TABLE} i;")
        self.assertEqual(self.service(enqueue(rows)), "3")
        self.assertEqual(before, self.scalar(f"SELECT jsonb_agg(to_jsonb(i) ORDER BY queue_order) FROM {TABLE} i;"))
        claimed = self.claim()
        self.assertEqual(claimed["page_id"], "unknown-signed-page")
        self.assertEqual(claimed["payload"], rows[0]["payload"])
        self.assertEqual(self.finish(claimed["id"]), "t")
        self.service(enqueue([rows[0]]))
        self.assertEqual(self.scalar(f"SELECT status FROM {TABLE} WHERE id='{claimed['id']}';"), "done")

    def test_03_whole_invalid_batch_and_conflicting_key_roll_back(self):
        bad_rows = [None, [], {}, {**event(2), "event_key": "not-sha"}, {**event(2), "page_id": " "},
                    {**event(2), "payload": {"kind": "other", "event": {}}},
                    {**event(2), "payload": {"kind": None, "event": {}}},
                    {**event(2), "payload": {"kind": "entry", "event": []}}]
        for invalid in bad_rows:
            self.error(enqueue([event(1), invalid]), "22023")
            self.assertEqual(self.scalar(f"SELECT count(*) FROM {TABLE};"), "0")
        for batch in (None, {}, [], [event(n) for n in range(101)]):
            self.error(enqueue(batch), "22023")
        self.service(enqueue([event(2)]))
        for conflict in ({**event(2), "page_id": "other"}, {**event(2), "payload": event(3)["payload"]}):
            self.error(enqueue([event(1), conflict]), "23505")
            self.assertEqual(self.scalar(f"SELECT count(*) FROM {TABLE};"), "1")

    def test_04_concurrent_duplicate_batch_preserves_one_copy(self):
        rows = [event(n, kind="change") for n in range(100)]
        workers = [self.spawn("SET ROLE service_role; " + enqueue(rows), f"enqueue_{n}") for n in range(8)]
        self.assertEqual([self.result(w) for w in workers], ["100"] * 8)
        self.assertEqual(self.scalar(f"SELECT count(*) FROM {TABLE};"), "100")
        actual = json.loads(self.scalar(f"SELECT jsonb_agg(payload->'event'->'fixture' ORDER BY queue_order) FROM {TABLE};"))
        self.assertEqual(actual, list(range(100)))

    def test_05_uncommitted_claim_skips_page_not_its_next_event_and_crash_recovers(self):
        self.service(enqueue([event(1), event(2), event(3, "synthetic-page-B")]))
        first = self.scalar(f"SELECT id FROM {TABLE} ORDER BY queue_order LIMIT 1;")
        holder = self.spawn("BEGIN; SET LOCAL ROLE service_role; "
            f"SELECT id FROM public.facebook_page_inbox_claim_v1('{uid(1)}'); SELECT pg_sleep(60); COMMIT;", "claim_holder")
        self.wait("claim_holder", "PgSleep")
        other = self.claim(2)
        self.assertEqual(other["payload"]["event"]["fixture"], 3)
        self.assertIsNone(self.claim(3), "Same-Page second event must not overtake locked head")
        self.terminate("claim_holder")
        holder.communicate(timeout=5)
        self.assertNotEqual(holder.returncode, 0)
        recovered = self.claim(4)
        self.assertEqual(recovered["id"], first)
        self.assertEqual(recovered["attempts"], 1, "Aborted claim must not count as committed attempt")

    def test_06_parallel_claims_never_two_live_leases_on_page(self):
        self.service(enqueue([event(n) for n in range(1, 9)]))
        workers = [self.spawn("SET ROLE service_role; "
            f"SELECT id FROM public.facebook_page_inbox_claim_v1('{uid(n)}');", f"claim_{n}") for n in range(1, 9)]
        replies = [self.result(w) for w in workers]
        self.assertEqual(sum(bool(x) for x in replies), 1)
        self.assertEqual(self.scalar(f"SELECT count(*) FROM {TABLE} WHERE status='processing';"), "1")

    def test_07_page_order_survives_retry_backoff_and_other_page_proceeds(self):
        self.service(enqueue([event(1), event(2), event(3, "synthetic-page-B")]))
        first = self.claim(1)
        self.assertEqual(self.finish(first["id"], success=False, error_code="UPSTREAM_TEMPORARY"), "t")
        self.assertEqual(self.claim(2)["payload"]["event"]["fixture"], 3)
        self.assertIsNone(self.claim(3))
        self.sql(f"UPDATE {TABLE} SET available_at=clock_timestamp()-interval '1 second' WHERE id='{first['id']}';")
        self.assertEqual(self.claim(4)["id"], first["id"])
        self.assertEqual(self.finish(first["id"], 4), "t")
        self.assertEqual(self.claim(5)["payload"]["event"]["fixture"], 2)

    def test_08_expiry_and_replacement_fence_finish_and_renew(self):
        self.service(enqueue([event(1)]))
        item = self.claim(1)
        row_id = item["id"]
        self.assertIsNone(self.claim(2))
        self.assertEqual(self.service(f"SELECT public.facebook_page_inbox_renew_v1('{row_id}','{uid(2)}');"), "f")
        self.sql(f"UPDATE {TABLE} SET locked_until=clock_timestamp()-interval '1 second' WHERE id='{row_id}';")
        self.assertEqual(self.finish(row_id, 1), "f", "Expired token cannot finish even before replacement")
        self.assertEqual(self.service(f"SELECT public.facebook_page_inbox_renew_v1('{row_id}','{uid(1)}');"), "f")
        self.assertEqual(self.claim(2)["id"], row_id)
        self.assertEqual(self.finish(row_id, 1), "f")
        self.assertEqual(self.service(f"SELECT public.facebook_page_inbox_renew_v1('{row_id}','{uid(2)}');"), "t")
        self.assertEqual(self.finish(row_id, 2), "t")
        self.assertEqual(self.finish(row_id, 2), "f", "Terminal completion cannot be rewritten")
        self.assertIsNone(self.claim(3))

    def test_09_expiry_rechecked_after_observed_row_lock_wait(self):
        for operation in ("finish", "renew"):
            self.sql(f"TRUNCATE {TABLE} RESTART IDENTITY;")
            self.service(enqueue([event(1)]))
            row_id = self.claim(1)["id"]
            holder = self.spawn(f"BEGIN; SELECT id FROM {TABLE} WHERE id='{row_id}' FOR UPDATE; "
                f"UPDATE {TABLE} SET locked_until=clock_timestamp()+interval '100 milliseconds' WHERE id='{row_id}'; "
                "SELECT pg_sleep(0.65); COMMIT;", "expiry_holder")
            self.wait("expiry_holder", "PgSleep")
            suffix = ",true,NULL" if operation == "finish" else ""
            waiter = self.spawn("SET ROLE service_role; "
                f"SELECT public.facebook_page_inbox_{operation}_v1('{row_id}','{uid(1)}'{suffix});", "expiry_waiter")
            self.wait("expiry_waiter", "Lock", timeout=0.5)
            self.result(holder)
            self.assertEqual(self.result(waiter), "f")
            self.assertEqual(self.scalar(f"SELECT status FROM {TABLE};"), "processing")

    def test_10_failure_retained_forever_bounded_backoff_error_sanitized(self):
        self.service(enqueue([event(1)]))
        row_id = self.claim(1)["id"]
        self.sql(f"UPDATE {TABLE} SET attempts=10000 WHERE id='{row_id}';")
        self.assertEqual(self.finish(row_id, success=False, error_code="raw https://secret.invalid/token?key=FAKE"), "t")
        result = json.loads(self.scalar(f"SELECT row_to_json(q) FROM (SELECT status,attempts,last_error_code,"
            f"extract(epoch FROM available_at-clock_timestamp()) AS delay FROM {TABLE}) q;"))
        self.assertEqual(result["status"], "pending")
        self.assertEqual(result["attempts"], 10000)
        self.assertEqual(result["last_error_code"], "PROCESSING_FAILED")
        self.assertGreater(result["delay"], 295)
        self.assertLessEqual(result["delay"], 300)
        self.assertEqual(self.scalar(f"SELECT count(*) FROM {TABLE};"), "1")

    def test_11_health_empty_pending_expired_processing_done(self):
        empty = {"pendingCount": 0, "oldestPendingSeconds": 0, "processingCount": 0}
        self.assertEqual(json.loads(self.service("SELECT public.facebook_page_inbox_health_v1();")), empty)
        self.service(enqueue([event(n, f"synthetic-page-{n}") for n in range(1, 5)]))
        done = self.claim(1)
        self.finish(done["id"], 1)
        expired = self.claim(2)
        self.sql(f"UPDATE {TABLE} SET locked_until=clock_timestamp()-interval '1 second',"
                 f"created_at=clock_timestamp()-interval '90 seconds' WHERE id='{expired['id']}';")
        # Hold this expired Page gate so claim selects a different Page.
        holder = self.spawn("BEGIN; SELECT pg_advisory_xact_lock(hashtextextended("
            + literal("facebook_page_inbox.page:" + expired["page_id"]) + ",0)); SELECT pg_sleep(60); COMMIT;", "health_gate")
        self.wait("health_gate", "PgSleep")
        self.assertIsNotNone(self.claim(3))
        health = json.loads(self.service("SELECT public.facebook_page_inbox_health_v1();"))
        self.assertEqual(health["pendingCount"], 2)
        self.assertEqual(health["processingCount"], 1)
        self.assertGreaterEqual(health["oldestPendingSeconds"], 90)
        self.assertEqual(set(health), set(empty), "Health must never expose payload, token or Page PII")

    def test_12_connection_failure_rolls_back_entire_batch(self):
        holder = self.spawn("BEGIN; SET LOCAL ROLE service_role; " + enqueue([event(1), event(2)]) +
                            " SELECT pg_sleep(60); COMMIT;", "enqueue_crash")
        self.wait("enqueue_crash", "PgSleep")
        self.assertEqual(self.scalar(f"SELECT count(*) FROM {TABLE};"), "0")
        self.terminate("enqueue_crash")
        holder.communicate(timeout=5)
        self.assertNotEqual(holder.returncode, 0)
        self.assertEqual(self.service(enqueue([event(1), event(2)])), "2")
        self.assertEqual(self.scalar(f"SELECT count(*) FROM {TABLE};"), "2")

    def test_13_null_arguments_non_rc_and_accidental_public_execute_denied(self):
        for sql in ("SELECT public.facebook_page_inbox_claim_v1(NULL);",
                    f"SELECT public.facebook_page_inbox_finish_v1('{uid(1)}','{uid(2)}',NULL,NULL);",
                    f"SELECT public.facebook_page_inbox_renew_v1(NULL,'{uid(2)}');"):
            self.error(sql, "22023")
        self.error("BEGIN ISOLATION LEVEL REPEATABLE READ; " + enqueue([event(1)]), "25001")
        self.error(f"BEGIN ISOLATION LEVEL SERIALIZABLE; SELECT * FROM public.facebook_page_inbox_claim_v1('{uid(1)}');", "25001")
        self.sql("GRANT EXECUTE ON FUNCTION public.facebook_page_inbox_enqueue_v1(jsonb),"
                 "public.facebook_page_inbox_health_v1() TO PUBLIC;")
        try:
            for role in ("anon", "authenticated"):
                self.error(f"SET ROLE {role}; " + enqueue([event(1)]), "42501", service=False)
                self.error(f"SET ROLE {role}; SELECT public.facebook_page_inbox_health_v1();", "42501", service=False)
        finally:
            self.sql(MIGRATION.read_text(encoding="utf-8"), name="restore_acl")

    def test_14_bounded_enqueue_lock_timeout_leaves_no_rows(self):
        holder = self.spawn("BEGIN; SELECT pg_advisory_xact_lock(hashtextextended("
            "'facebook_page_inbox.enqueue.v1',0)); SELECT pg_sleep(60); COMMIT;", "enqueue_gate")
        self.wait("enqueue_gate", "PgSleep")
        waiter = self.spawn("SET ROLE service_role; " + enqueue([event(1), event(2)]), "blocked_enqueue")
        self.wait("blocked_enqueue", "Lock", timeout=0.7)
        stdout, stderr = waiter.communicate(timeout=5)
        self.assertNotEqual(waiter.returncode, 0)
        self.assertIn("lock timeout", stderr)
        self.assertEqual(stdout.strip(), "")
        self.assertEqual(self.scalar(f"SELECT count(*) FROM {TABLE};"), "0")
        self.terminate("enqueue_gate")
        holder.communicate(timeout=5)
        self.assertEqual(self.service(enqueue([event(1), event(2)])), "2")
        self.assertEqual(self.scalar("SELECT bool_and(proconfig @> ARRAY['lock_timeout=1s','statement_timeout=5s']) "
            "FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname LIKE 'facebook_page_inbox_%_v1';"), "t")

    @unittest.skipUnless(os.environ.get("VPT_INBOX_RESTORE_TEST") == "1", "Set VPT_INBOX_RESTORE_TEST=1 for isolated logical restore")
    def test_15_logical_dump_restore_keeps_payload_status_fences_acl_and_sequence(self):
        for executable in ("pg_dump", "pg_restore"):
            self.assertTrue(shutil.which(executable), f"{executable} required")
        target = "vpt_page_inbox_restore_ci"
        self.assertEqual(self.scalar(f"SELECT count(*) FROM pg_database WHERE datname='{target}';"), "0",
                         "Refuse any preexisting restore target")
        self.service(enqueue([event(1), event(2), event(3, "unknown-page", "entry")]))
        done = self.claim(1)
        self.finish(done["id"])
        leased = self.claim(2)
        source_rows = self.scalar(f"SELECT jsonb_agg(to_jsonb(i) ORDER BY queue_order) FROM {TABLE} i;")
        created = False
        try:
            self.sql(f"CREATE DATABASE {target};")
            created = True
            with tempfile.TemporaryDirectory(prefix="vpt-inbox-fixture-") as directory:
                archive = str(Path(directory) / "inbox.dump")
                dumped = subprocess.run(["pg_dump", "--format=custom", "--file", archive],
                                        env=self.env, capture_output=True, text=True, timeout=30)
                self.assertEqual(dumped.returncode, 0, dumped.stderr)
                restored = subprocess.run(["pg_restore", "--single-transaction", "--exit-on-error", "--dbname", target, archive],
                                          env=self.env, capture_output=True, text=True, timeout=30)
                self.assertEqual(restored.returncode, 0, restored.stderr)
            self.assertEqual(source_rows, self.scalar(f"SELECT jsonb_agg(to_jsonb(i) ORDER BY queue_order) FROM {TABLE} i;", database=target))
            self.assertEqual(self.scalar(f"SELECT has_table_privilege('anon','{TABLE}','SELECT') OR "
                f"has_table_privilege('service_role','{TABLE}','DELETE');", database=target), "f")
            self.assertEqual(self.service(f"SELECT public.facebook_page_inbox_finish_v1('{leased['id']}','{uid(99)}',true,NULL);", database=target), "f")
            self.assertEqual(self.service(enqueue([event(4, "another-page")]), database=target), "1")
            self.assertEqual(self.scalar(f"SELECT max(queue_order)>3 FROM {TABLE};", database=target), "t")
            self.assertEqual(self.scalar(f"SELECT count(*) FROM {TABLE};"), "3", "Restore checks must not write source")
        finally:
            if created:
                self.sql(f"DROP DATABASE {target} WITH (FORCE);")


if __name__ == "__main__":
    unittest.main(verbosity=2)
