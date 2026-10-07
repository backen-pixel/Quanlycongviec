#!/usr/bin/env python3
"""SQL702 real PostgreSQL tests: fresh localhost vpt_lead_ads_ci only.

No application bootstrap, provider calls or live configuration. CRM baseline is
an explicit synthetic schema; Facebook/attribution/639/700/701/702 are actual
migrations. No task-template behavior or production/UAT claim is made here.
VPT_INBOX_RESTORE_TEST=1 additionally restores the complete fixture to the new
localhost vpt_lead_ads_restore_ci DB; it refuses a preexisting target and never
replaces the source. Requires matching pg_dump/pg_restore and CREATEDB.
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
PREFIX = "vpt_lead_ads_ci_"
PAGE = "70200001"
PAGE_B = "70200002"
FORM = "70201"
RESTORE_DATABASE = "vpt_lead_ads_restore_ci"


def uid(n):
    return f"70200000-0000-4000-8000-{n:012d}"


def lit(value):
    return "'" + str(value).replace("'", "''") + "'"


def js(value):
    return lit(json.dumps(value, ensure_ascii=False)) + "::jsonb"


def event(n=1, page=PAGE, kind="change", leadgen=None, form=FORM):
    value = {"leadgen_id": leadgen or str(7021000 + n), "form_id": form, "page_id": page, "ad_id": "70299"}
    body = {"field": "leadgen", "value": value} if kind == "change" else {"message": {"mid": f"synthetic-{n}"}}
    return {"event_key": hashlib.sha256(f"{page}:{kind}:{n}".encode()).hexdigest(),
            "page_id": page, "payload": {"kind": kind, "event": body}}


def data(n=1):
    return {"full_name": "Khách thử nghiệm", "phone": f"090{n:07d}", "email": "synthetic@example.invalid",
            "description": "Tư vấn tủ bếp", "field_data": {"ho_ten": "Khách thử nghiệm", "sdt": f"090{n:07d}"}}


def proof(n=1, page=PAGE, leadgen=None, form=FORM):
    return {"id": leadgen or str(7021000 + n), "form_id": form, "form_page_id": page,
            "created_time": "2026-10-01T09:00:00+07:00", "ad_id": "70299", "adset_id": "70298",
            "campaign_id": "70297", "is_organic": False, "platform": "facebook",
            "field_data": [{"name": "phone_number", "values": [data(n)["phone"]]}]}


BASE_SCHEMA = """
CREATE TYPE user_role AS ENUM ('admin','sales_admin','sales','staff');
CREATE TYPE notification_type AS ENUM ('task_assigned','system');
CREATE TABLE tenants(id uuid PRIMARY KEY, is_active boolean DEFAULT true);
CREATE TABLE companies(id uuid PRIMARY KEY, name text NOT NULL, tenant_id uuid REFERENCES tenants(id), is_active boolean DEFAULT true);
CREATE TABLE users(id uuid PRIMARY KEY, full_name text NOT NULL, role user_role,
 company_id uuid REFERENCES companies(id), tenant_id uuid REFERENCES tenants(id), is_active boolean DEFAULT true);
CREATE TABLE user_companies(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid REFERENCES users(id),
 company_id uuid REFERENCES companies(id),is_primary boolean DEFAULT false,UNIQUE(user_id,company_id));
CREATE TABLE company_regions(id uuid PRIMARY KEY,company_id uuid NOT NULL REFERENCES companies(id),name text NOT NULL,is_active boolean DEFAULT true);
CREATE TABLE user_company_regions(user_id uuid REFERENCES users(id),region_id uuid REFERENCES company_regions(id),PRIMARY KEY(user_id,region_id));
CREATE TABLE customers(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),full_name varchar(255) NOT NULL,phone varchar(20) NOT NULL,
 email varchar(255),address text,source varchar(50),company_id uuid REFERENCES companies(id) ON DELETE SET NULL,
 assigned_to uuid REFERENCES users(id),created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now());
CREATE TABLE crm_sources(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),name text NOT NULL,icon text,
 company_id uuid REFERENCES companies(id) ON DELETE SET NULL,is_active boolean DEFAULT true);
CREATE TABLE crm_pipelines(id uuid PRIMARY KEY,name text NOT NULL,company_id uuid REFERENCES companies(id),is_active boolean DEFAULT true);
CREATE TABLE crm_pipeline_stages(id uuid PRIMARY KEY,name text NOT NULL,pipeline_id uuid REFERENCES crm_pipelines(id),
 pipeline_type text DEFAULT 'lead',is_active boolean DEFAULT true,is_won boolean DEFAULT false,is_lost boolean DEFAULT false);
-- Minimal dependencies for the actual full migrations147 and568. Intake uses
-- NULL project_id and does not claim complete customer info or create a deal.
CREATE TABLE projects(id uuid PRIMARY KEY,company_id uuid REFERENCES companies(id));
CREATE TABLE crm_leads(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),code text,title text NOT NULL,type text DEFAULT 'lead',
 customer_id uuid REFERENCES customers(id),stage_id uuid REFERENCES crm_pipeline_stages(id),source_id uuid REFERENCES crm_sources(id),
 pipeline_id uuid REFERENCES crm_pipelines(id),company_id uuid REFERENCES companies(id),region_id uuid REFERENCES company_regions(id),
 assigned_to uuid REFERENCES users(id),lead_owner_id uuid REFERENCES users(id),created_by uuid REFERENCES users(id),description text,
 lead_type_id uuid,install_address text,phone text,estimated_value numeric,project_id uuid REFERENCES projects(id),
 stage_entered_at timestamptz,created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now());
CREATE TABLE crm_activities(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),lead_id uuid REFERENCES crm_leads(id),
 activity_date timestamptz,created_at timestamptz DEFAULT now(),type text);
CREATE TABLE crm_deal_projects(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),lead_id uuid REFERENCES crm_leads(id),
 project_id uuid REFERENCES projects(id));
-- Primary preflight 2026-10-06: type and entity_id are TEXT, not UUID/enum.
CREATE TABLE notifications(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid NOT NULL REFERENCES users(id),type text NOT NULL,
 title varchar(255) NOT NULL,message text,entity_type varchar(30),entity_id text,metadata jsonb,is_read boolean DEFAULT false,created_at timestamptz DEFAULT now());
CREATE TABLE external_api_keys(id uuid PRIMARY KEY);
CREATE TABLE crm_tasks(id uuid PRIMARY KEY,lead_id uuid NOT NULL REFERENCES crm_leads(id) ON DELETE CASCADE,title text NOT NULL);
-- Actual migration392 conditionally retains nullable tenants on legacy rows.
-- Its actual Lead trigger still prohibits every new Lead with a NULL tenant.
INSERT INTO companies(id,name) VALUES('70200000-0000-4000-8000-000000000999','Legacy baseline');
INSERT INTO users(id,full_name,role,company_id) VALUES('70200000-0000-4000-8000-000000000999','Legacy baseline','admin','70200000-0000-4000-8000-000000000999');
"""


class LeadAdsIntakePostgres(unittest.TestCase):
    @classmethod
    def sql_process(cls, sql, name="check", timeout=20, database=None):
        if database not in (None, "vpt_lead_ads_ci", RESTORE_DATABASE):
            raise RuntimeError("Unexpected database target")
        env = {**cls.env, "PGAPPNAME": PREFIX + name}
        if database:
            env["PGDATABASE"] = database
        return subprocess.run(["psql", "-X", "-w", "-qAt", "-v", "ON_ERROR_STOP=1", "-v", "VERBOSITY=verbose"],
                              input=sql, text=True, capture_output=True,
                              env=env, timeout=timeout)

    @classmethod
    def sql(cls, sql, **kwargs):
        result = cls.sql_process(sql, **kwargs)
        if result.returncode:
            raise AssertionError(result.stderr.strip())
        return result.stdout.strip()

    @classmethod
    def scalar(cls, sql, **kwargs):
        return cls.sql(sql, **kwargs).splitlines()[-1]

    @classmethod
    def service(cls, sql, **kwargs):
        return cls.sql("SET ROLE service_role; " + sql, **kwargs)

    @classmethod
    def setUpClass(cls):
        if (os.environ.get("VPT_ISOLATED_PG_TEST") != "1" or os.environ.get("PGHOST") != "127.0.0.1"
                or os.environ.get("PGDATABASE") != "vpt_lead_ads_ci"):
            raise RuntimeError("Use only explicit localhost disposable vpt_lead_ads_ci")
        if not shutil.which("psql"):
            raise RuntimeError("psql unavailable; PostgreSQL tests NOT RUN")
        cls.env = {k: v for k, v in os.environ.items() if not k.startswith("PG")}
        for key in ("PGHOST", "PGPORT", "PGDATABASE", "PGUSER", "PGPASSWORD"):
            if key in os.environ:
                cls.env[key] = os.environ[key]
        cls.env.update(PGCONNECT_TIMEOUT="5", PGSSLMODE="disable", PGOPTIONS="-c statement_timeout=30000")
        if cls.scalar("SELECT count(*) FROM pg_tables WHERE schemaname='public';") != "0":
            raise RuntimeError("Refusing nonempty database")
        # Roles may already exist in the same disposable CI cluster used by H1.
        cls.sql("DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF; "
                "IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF; "
                "IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF; END $$;")
        cls.sql(BASE_SCHEMA)
        for file in ("42_facebook_integration.sql", "23_facebook_default_company.sql", "304_facebook_pages_default_target_type.sql",
                     "305_facebook_pages_default_module_key.sql", "108_crm_leads_code_unique.sql",
                     "129_crm_auto_lead_blocked_phones.sql", "638_lead_attribution_quality_partner.sql",
                     "639_facebook_contact_lead_atomic.sql", "39_auto_gen_tasks_trigger.sql", "227_drop_legacy_auto_gen_tasks_trigger.sql",
                     "145_crm_stage_history.sql", "147_crm_leads_kpi_fields.sql", "392_tenant_isolation_db.sql",
                     "568_projects_has_crm_deal_column.sql", "700_revoke_anon_public_access.sql",
                     "701_facebook_page_inbox.sql", "702_facebook_lead_ads_intake.sql", "702_facebook_lead_ads_intake.sql"):
            cls.sql((ROOT / "database" / file).read_text(encoding="utf-8"), name=file.split("_")[0])
        if cls.scalar("SELECT count(*) FROM facebook_lead_ads_bindings;") != "0":
            raise AssertionError("Migration must not enroll any Page/form")

    def setUp(self):
        self.children = []
        self.sql("TRUNCATE tenants,companies,users,customers,crm_pipelines,crm_sources,company_regions,"
                 "facebook_page_inbox,facebook_lead_ads_intake_receipts,notifications,crm_auto_lead_blocked_phones RESTART IDENTITY CASCADE;")
        self.sql(f"""
        INSERT INTO tenants VALUES('{uid(1)}',true),('{uid(2)}',true);
        INSERT INTO companies VALUES('{uid(11)}','Company A','{uid(1)}',true),('{uid(12)}','Company B','{uid(2)}',true);
        INSERT INTO users VALUES('{uid(21)}','Admin A','admin','{uid(11)}','{uid(1)}',true),
          ('{uid(22)}','Admin B','admin','{uid(12)}','{uid(2)}',true);
        INSERT INTO user_companies(user_id,company_id) VALUES('{uid(21)}','{uid(11)}'),('{uid(22)}','{uid(12)}');
        INSERT INTO company_regions VALUES('{uid(31)}','{uid(11)}','A Region',true),('{uid(32)}','{uid(12)}','B Region',true);
        INSERT INTO crm_pipelines VALUES('{uid(41)}','A Pipeline','{uid(11)}',true),('{uid(42)}','B Pipeline','{uid(12)}',true);
        INSERT INTO crm_pipeline_stages(id,name,pipeline_id) VALUES('{uid(51)}','A New','{uid(41)}'),('{uid(52)}','B New','{uid(42)}');
        INSERT INTO crm_sources(id,name,company_id) VALUES('{uid(61)}','A Facebook','{uid(11)}'),('{uid(62)}','B Facebook','{uid(12)}');
        INSERT INTO facebook_pages(page_id,page_name,access_token,default_company_id,created_by)
          VALUES('{PAGE}','A Page','SYNTHETIC-NOT-A-CREDENTIAL','{uid(11)}','{uid(21)}'),
          ('{PAGE_B}','B Page','SYNTHETIC-NOT-A-CREDENTIAL','{uid(12)}','{uid(22)}');
        INSERT INTO facebook_lead_ads_bindings(page_id,form_id,company_id,recipient_id,pipeline_id,stage_id,source_id,region_id,active)
          VALUES('{PAGE}','{FORM}','{uid(11)}','{uid(21)}','{uid(41)}','{uid(51)}','{uid(61)}','{uid(31)}',true),
          ('{PAGE_B}','{FORM}','{uid(12)}','{uid(22)}','{uid(42)}','{uid(52)}','{uid(62)}','{uid(32)}',true);
        """)

    def tearDown(self):
        self.sql("SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=current_database() "
                 f"AND application_name LIKE '{PREFIX}%' AND pid<>pg_backend_pid();")
        for child in self.children:
            try:
                child.communicate(timeout=5)
            except subprocess.TimeoutExpired:
                child.kill()
                child.communicate()
        self.sql("DROP TRIGGER IF EXISTS test_notification_fail ON notifications; DROP FUNCTION IF EXISTS test_notification_fail(); "
                 "DROP TRIGGER IF EXISTS test_notification_wait ON notifications; DROP FUNCTION IF EXISTS test_notification_wait();")

    def spawn(self, sql, name):
        child = subprocess.Popen(["psql", "-X", "-w", "-qAt", "-v", "ON_ERROR_STOP=1", "-v", "VERBOSITY=verbose"],
                                 stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True,
                                 env={**self.env, "PGAPPNAME": PREFIX + name})
        child.stdin.write(sql)
        child.stdin.close()
        child.stdin = None
        self.children.append(child)
        return child

    def result(self, child, code=None):
        out, err = child.communicate(timeout=12)
        if code:
            self.assertNotEqual(child.returncode, 0, out)
            self.assertIn(code, err)
        else:
            self.assertEqual(child.returncode, 0, err)
        return out.strip()

    def wait(self, name, event_name, timeout=5):
        until = time.monotonic() + timeout
        while time.monotonic() < until:
            if self.scalar("SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE "
                           f"application_name={lit(PREFIX + name)} AND "
                           f"(wait_event={lit(event_name)} OR wait_event_type={lit(event_name)}));") == "t":
                return
            time.sleep(0.02)
        self.fail(f"Missing actual {event_name} barrier: {name}")

    def terminate(self, name):
        self.sql("SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE "
                 f"datname=current_database() AND application_name={lit(PREFIX + name)};")

    def error(self, command, code="40001", service=True, **kwargs):
        result = self.sql_process(("SET ROLE service_role; " if service else "") + command, **kwargs)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn(code, result.stderr)
        return result.stderr

    def enqueue(self, *events):
        self.service(f"SELECT facebook_page_inbox_enqueue_v1({js(list(events))});")

    def claim(self, token=101, pages=None):
        array = "ARRAY[" + ",".join(lit(x) for x in (pages or [PAGE])) + "]::text[]"
        out = self.service(f"SELECT row_to_json(x) FROM facebook_page_inbox_claim_lead_ads_v1('{uid(token)}',{array}) x;")
        return json.loads(out) if out else None

    def prepare(self, n=1, page=PAGE, token=101, leadgen=None):
        self.enqueue(event(n, page=page, leadgen=leadgen))
        return self.claim(token, [page])

    def command(self, item, token=101, business=None, provider=None, version=1):
        return ("SELECT facebook_lead_ads_intake_v1(" + f"'{item['id']}','{uid(token)}',{version},"
                + js(business if business is not None else data()) + ","
                + js(provider if provider is not None else proof()) + ");")

    def intake(self, item, **kwargs):
        return json.loads(self.service(self.command(item, **kwargs)))

    def counts(self, **kwargs):
        return self.scalar("SELECT json_build_array((SELECT count(*) FROM customers),(SELECT count(*) FROM crm_leads),"
                           "(SELECT count(*) FROM facebook_contacts),(SELECT count(*) FROM facebook_lead_ads),"
                           "(SELECT count(*) FROM lead_attribution),(SELECT count(*) FROM notifications),"
                           "(SELECT count(*) FROM facebook_lead_ads_intake_receipts),(SELECT count(*) FROM crm_tasks));", **kwargs)

    def canonicalize_restore_checks(self):
        """Round-trip exact PostgreSQL CHECK DDL in this disposable source only.

        BETWEEN expands into nested AND nodes on its initial parse. Dump emits
        the equivalent comparisons; reparsing can flatten those AND nodes and
        change redundant parentheses. Use PostgreSQL itself, never text stripping
        or predicate replacement, then require a second round-trip to be stable.
        """
        previous = None
        for _ in range(2):
            self.sql("""
            DO $reparse$
            DECLARE item record; current_check record;
            BEGIN
              FOR item IN
                SELECT c.conrelid,c.conname,c.convalidated,c.connoinherit,c.conkey,
                  c.conislocal,c.coninhcount,pg_get_constraintdef(c.oid) AS definition,
                  obj_description(c.oid,'pg_constraint') AS comment
                FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid
                WHERE c.connamespace='public'::regnamespace AND c.contype='c'
                ORDER BY c.conrelid::regclass::text,c.conname
              LOOP
                IF NOT item.conislocal OR item.coninhcount<>0 THEN
                  RAISE EXCEPTION 'Restore fixture must not reparse inherited CHECKs';
                END IF;
                EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I',item.conrelid::regclass,item.conname);
                EXECUTE format('ALTER TABLE %s ADD CONSTRAINT %I %s',item.conrelid::regclass,item.conname,item.definition);
                IF item.comment IS NOT NULL THEN
                  EXECUTE format('COMMENT ON CONSTRAINT %I ON %s IS %L',item.conname,item.conrelid::regclass,item.comment);
                END IF;
                SELECT c.* INTO STRICT current_check FROM pg_constraint c
                  WHERE c.conrelid=item.conrelid AND c.conname=item.conname;
                IF current_check.convalidated IS DISTINCT FROM item.convalidated
                  OR current_check.connoinherit IS DISTINCT FROM item.connoinherit
                  OR current_check.conkey IS DISTINCT FROM item.conkey THEN
                  RAISE EXCEPTION 'CHECK properties changed while reparsing';
                END IF;
              END LOOP;
            END
            $reparse$;
            """)
            current = self.scalar("SELECT jsonb_agg(jsonb_build_object('table',conrelid::regclass::text,"
                                  "'name',conname,'definition',pg_get_constraintdef(oid)) "
                                  "ORDER BY conrelid::regclass::text,conname) FROM pg_constraint "
                                  "WHERE connamespace='public'::regnamespace AND contype='c';")
            if previous is not None:
                self.assertEqual(previous, current, "PostgreSQL CHECK serialization must reach a fixed point")
            previous = current

    def assert_restore_inventory_equal(self, expected, actual, message="Restored logical inventory differs"):
        differences = []

        def visit(left, right, path):
            if len(differences) >= 12 or left == right:
                return
            if isinstance(left, dict) and isinstance(right, dict):
                for key in sorted(set(left) | set(right)):
                    if key not in left or key not in right:
                        differences.append(path + "." + key + ": missing key")
                    else:
                        visit(left[key], right[key], path + "." + key)
            elif isinstance(left, list) and isinstance(right, list):
                if len(left) != len(right):
                    differences.append(f"{path}.length: {len(left)} != {len(right)}")
                for index, (a, b) in enumerate(zip(left, right)):
                    label = (a.get("name") or a.get("table") or "") if isinstance(a, dict) else ""
                    visit(a, b, f"{path}[{index}{':' + label if label else ''}]")
            else:
                # Metadata/digests only, bounded even for full function bodies.
                differences.append(f"{path}: {repr(left)[:180]} != {repr(right)[:180]}")

        visit(expected, actual, "inventory")
        if differences:
            self.fail(message + "\n" + "\n".join(differences))

    def restore_inventory(self, database=None):
        """Normalized logical state, without OIDs/default-ACL representation noise."""
        table_names = json.loads(self.scalar("SELECT jsonb_agg(relname ORDER BY relname) FROM pg_class "
                                "WHERE relnamespace='public'::regnamespace AND relkind IN ('r','p');", database=database))
        quoted = lambda name: '"' + name.replace('"', '""') + '"'
        # Every fixture table, including stage history/receipts/config and empty
        # tables, is compared. JSONB rows are sorted independent of heap order.
        statements = ["SELECT jsonb_build_object('table'," + lit(name) + ",'count',count(*),"
                      "'sha256',encode(sha256(convert_to(coalesce(string_agg(to_jsonb(t)::text,E'\\n' "
                      "ORDER BY to_jsonb(t)::text),''),'UTF8')),'hex')) FROM public."
                      + quoted(name) + " t;" for name in table_names]
        rows = [json.loads(line) for line in self.sql("\n".join(statements), database=database).splitlines()]
        metadata = json.loads(self.scalar("""
        SELECT jsonb_build_object(
          'relations',(SELECT jsonb_agg(jsonb_build_object('name',c.relname,'kind',c.relkind,'owner',r.rolname,
            'rls',c.relrowsecurity,'forceRls',c.relforcerowsecurity,'acl',
              (SELECT jsonb_agg(jsonb_build_object('grantee',coalesce(gr.rolname,'PUBLIC'),'grantor',go.rolname,
                'privilege',a.privilege_type,'grantable',a.is_grantable)
                ORDER BY coalesce(gr.rolname,'PUBLIC'),go.rolname,a.privilege_type,a.is_grantable)
               FROM aclexplode(coalesce(c.relacl,acldefault((CASE WHEN c.relkind='S' THEN 's' ELSE 'r' END)::"char",c.relowner))) a
               LEFT JOIN pg_roles gr ON gr.oid=a.grantee LEFT JOIN pg_roles go ON go.oid=a.grantor)) ORDER BY c.relname)
            FROM pg_class c JOIN pg_roles r ON r.oid=c.relowner
            WHERE c.relnamespace='public'::regnamespace AND c.relkind IN ('r','p','S')),
          'constraints',(SELECT jsonb_agg(jsonb_build_object('table',c.conrelid::regclass::text,'name',c.conname,
            'definition',pg_get_constraintdef(c.oid),'validated',c.convalidated) ORDER BY c.conrelid::regclass::text,c.conname)
            FROM pg_constraint c WHERE c.connamespace='public'::regnamespace),
          'columns',(SELECT jsonb_agg(jsonb_build_object('table',c.table_name,'column',c.column_name,
            'type',c.udt_name,'nullable',c.is_nullable,'default',c.column_default,'identity',c.is_identity,
            'identityGeneration',c.identity_generation,'generated',c.is_generated,
            'generationExpression',c.generation_expression) ORDER BY c.table_name,c.ordinal_position)
            FROM information_schema.columns c WHERE c.table_schema='public'),
          'indexes',(SELECT jsonb_agg(jsonb_build_object('table',tablename,'name',indexname,'definition',indexdef)
            ORDER BY tablename,indexname) FROM pg_indexes WHERE schemaname='public'),
          'triggers',(SELECT jsonb_agg(jsonb_build_object('table',t.tgrelid::regclass::text,'name',t.tgname,
            'enabled',t.tgenabled,'definition',pg_get_triggerdef(t.oid)) ORDER BY t.tgrelid::regclass::text,t.tgname)
            FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
            WHERE c.relnamespace='public'::regnamespace AND NOT t.tgisinternal),
          'policies',(SELECT jsonb_agg(to_jsonb(p) ORDER BY p.tablename,p.policyname) FROM pg_policies p WHERE p.schemaname='public'),
          'sequenceDefinitions',(SELECT jsonb_agg(to_jsonb(s)-'last_value' ORDER BY s.sequencename)
            FROM pg_sequences s WHERE s.schemaname='public'),
          'functions',(SELECT jsonb_agg(jsonb_build_object('name',p.proname,'args',pg_get_function_identity_arguments(p.oid),
            'owner',r.rolname,'definer',p.prosecdef,'config',p.proconfig,'definition',pg_get_functiondef(p.oid),'acl',
              (SELECT jsonb_agg(jsonb_build_object('grantee',coalesce(gr.rolname,'PUBLIC'),'grantor',go.rolname,
                'privilege',a.privilege_type,'grantable',a.is_grantable)
                ORDER BY coalesce(gr.rolname,'PUBLIC'),go.rolname,a.privilege_type,a.is_grantable)
               FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
               LEFT JOIN pg_roles gr ON gr.oid=a.grantee LEFT JOIN pg_roles go ON go.oid=a.grantor))
            ORDER BY p.proname,pg_get_function_identity_arguments(p.oid)) FROM pg_proc p JOIN pg_roles r ON r.oid=p.proowner
            WHERE p.pronamespace='public'::regnamespace AND p.prokind='f'),
          'schemaCreate',(SELECT jsonb_agg(jsonb_build_object('role',name,'create',has_schema_privilege(name,'public','CREATE')) ORDER BY name)
            FROM unnest(ARRAY['anon','authenticated','service_role']) name)
        );
        """, database=database))
        sequence_names = json.loads(self.scalar("SELECT coalesce(jsonb_agg(relname ORDER BY relname),'[]'::jsonb) FROM pg_class "
                                               "WHERE relnamespace='public'::regnamespace AND relkind='S';", database=database))
        sequences = []
        for name in sequence_names:
            sequences.append(json.loads(self.scalar("SELECT jsonb_build_object('name'," + lit(name)
                                                    + ",'last',last_value,'called',is_called) FROM public."
                                                    + quoted(name) + ";", database=database)))
        return {"data": rows, "metadata": metadata, "sequences": sequences}

    def test_01_acl_definer_entrypoint_and_operator_only_binding(self):
        for table in ("facebook_lead_ads_bindings", "facebook_lead_ads_intake_receipts"):
            self.assertEqual(self.scalar(f"SELECT relrowsecurity FROM pg_class WHERE oid='{table}'::regclass;"), "t")
            self.assertEqual(self.scalar(f"SELECT has_table_privilege('service_role','{table}','SELECT');"), "t")
            for role in ("anon", "authenticated", "service_role"):
                for privilege in ("INSERT", "UPDATE", "DELETE", "TRUNCATE"):
                    self.assertEqual(self.scalar(f"SELECT has_table_privilege('{role}','{table}','{privilege}');"), "f")
        signature = "facebook_lead_ads_intake_v1(uuid,uuid,integer,jsonb,jsonb)"
        self.assertEqual(self.scalar(f"SELECT prosecdef FROM pg_proc WHERE oid='{signature}'::regprocedure;"), "t")
        item = self.prepare()
        self.error(self.command(item), "42501", service=False)
        self.sql(f"GRANT EXECUTE ON FUNCTION {signature} TO anon;")
        try:
            self.error("SET ROLE anon; " + self.command(item), "42501", service=False)
        finally:
            self.sql(f"REVOKE EXECUTE ON FUNCTION {signature} FROM anon;")

    def test_02_atomic_creation_and_recipient_source_links(self):
        item = self.prepare()
        result = self.intake(item)
        self.assertEqual(result["status"], "created")
        self.assertEqual(result["recipientId"], uid(21))
        self.assertEqual(json.loads(self.counts()), [1, 1, 1, 1, 1, 1, 1, 0])
        self.assertEqual(self.scalar(f"SELECT bool_and(company_id='{uid(11)}' AND assigned_to='{uid(21)}' "
                                    f"AND lead_owner_id='{uid(21)}' AND created_by IS NULL AND type='lead') FROM crm_leads;"), "t")
        self.assertEqual(self.scalar("SELECT raw->>'paid_status' FROM lead_attribution;"), "UNVERIFIED")
        self.assertEqual(self.scalar("SELECT raw->'provider_data'->>'is_organic' FROM lead_attribution;"), "false")
        self.assertEqual(self.scalar(f"SELECT user_id='{uid(21)}' AND entity_id='{result['leadId']}' FROM notifications;"), "t")
        self.assertEqual(self.scalar("SELECT status FROM facebook_page_inbox;"), "processing", "Domain must not forge queue finish ACK")
        self.assertEqual(self.scalar(f"SELECT count(*) FROM crm_lead_stage_history WHERE lead_id='{result['leadId']}' AND to_stage_id='{uid(51)}';"), "1")
        self.assertEqual(self.scalar("SELECT count(*) FROM pg_trigger WHERE tgrelid='crm_leads'::regclass AND tgname LIKE 'trg_auto_gen_tasks%';"), "0")

    def test_03_response_loss_exact_replay_no_duplicate_or_new_provider_fetch(self):
        item = self.prepare()
        original = self.intake(item)
        before = self.counts()
        replay = self.intake(item)
        self.assertEqual(replay, {**original, "status": "existing"})
        self.assertEqual(before, self.counts())
        cached = json.loads(self.service("SELECT json_build_object('lead',lead_data,'provider',provider_data) FROM facebook_lead_ads_intake_receipts;"))
        self.assertEqual(cached, {"lead": data(), "provider": proof()})

    def test_04_same_provider_identity_in_different_signed_envelope_reuses_receipt(self):
        first = self.prepare()
        result = self.intake(first)
        self.service(f"SELECT facebook_page_inbox_finish_v1('{first['id']}','{uid(101)}',true,NULL);")
        second = self.prepare(2, leadgen=proof()["id"])
        self.assertEqual(self.intake(second), {**result, "status": "existing"})
        self.assertEqual(json.loads(self.counts()), [1, 1, 1, 1, 1, 1, 1, 0])

    def test_05_concurrent_same_lease_has_one_atomic_commit(self):
        item = self.prepare()
        workers = [self.spawn("SET ROLE service_role; " + self.command(item), f"same_{n}") for n in range(5)]
        results = [json.loads(self.result(w)) for w in workers]
        self.assertEqual(sum(x["status"] == "created" for x in results), 1)
        self.assertEqual(len({x["receiptId"] for x in results}), 1)
        self.assertEqual(json.loads(self.counts()), [1, 1, 1, 1, 1, 1, 1, 0])

    def test_06_notification_failure_rolls_back_all_domain_rows(self):
        item = self.prepare()
        self.sql("CREATE FUNCTION test_notification_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic failure'; END $$; "
                 "CREATE TRIGGER test_notification_fail BEFORE INSERT ON notifications FOR EACH ROW EXECUTE FUNCTION test_notification_fail();")
        self.error(self.command(item), "P0001")
        self.assertEqual(json.loads(self.counts()), [0] * 8)
        self.assertEqual(self.scalar("SELECT status FROM facebook_page_inbox;"), "processing")
        self.sql("DROP TRIGGER test_notification_fail ON notifications; DROP FUNCTION test_notification_fail();")
        self.assertEqual(self.intake(item)["status"], "created")

    def test_07_provider_and_business_identity_validation_no_mutation(self):
        item = self.prepare()
        for patch in ({"id": "wrong"}, {"form_id": "wrong"}, {"form_page_id": PAGE_B}, {"ad_id": "bad"},
                      {"field_data": None}, {"created_time": "infinity"}, {"access_token": "forbidden"}):
            self.error(self.command(item, provider={**proof(), **patch}), "22023")
        for patch in ({"phone": "0000000000"}, {"phone": "+84900000001"}, {"full_name": " "}, {"field_data": None},
                      {"company_id": uid(12)}, {"full_name": None}):
            self.error(self.command(item, business={**data(), **patch}), "22023")
        self.assertEqual(json.loads(self.counts()), [0] * 8)

    def test_08_current_company_recipient_tenant_checks_deny_null_or_foreign(self):
        item = self.prepare()
        alterations = [
            (f"UPDATE companies SET is_active=NULL WHERE id='{uid(11)}'", f"UPDATE companies SET is_active=true WHERE id='{uid(11)}'"),
            (f"UPDATE users SET is_active=false WHERE id='{uid(21)}'", f"UPDATE users SET is_active=true WHERE id='{uid(21)}'"),
            (f"UPDATE users SET role=NULL WHERE id='{uid(21)}'", f"UPDATE users SET role='admin' WHERE id='{uid(21)}'"),
            (f"UPDATE users SET role='sales' WHERE id='{uid(21)}'", f"UPDATE users SET role='admin' WHERE id='{uid(21)}'"),
            (f"UPDATE users SET company_id='{uid(12)}' WHERE id='{uid(21)}'", f"UPDATE users SET company_id='{uid(11)}' WHERE id='{uid(21)}'"),
            (f"UPDATE users SET tenant_id=NULL WHERE id='{uid(21)}'", f"UPDATE users SET tenant_id='{uid(1)}' WHERE id='{uid(21)}'"),
            (f"UPDATE tenants SET is_active=NULL WHERE id='{uid(1)}'", f"UPDATE tenants SET is_active=true WHERE id='{uid(1)}'"),
        ]
        for change, restore in alterations:
            self.sql(change)
            self.error(self.command(item), "42501")
            self.sql(restore)
        self.assertEqual(json.loads(self.counts()), [0] * 8)

    def test_09_page_taxonomy_and_optional_region_are_current(self):
        item = self.prepare()
        alters = [
            (f"UPDATE facebook_pages SET auto_create_lead=NULL WHERE page_id='{PAGE}'", f"UPDATE facebook_pages SET auto_create_lead=true WHERE page_id='{PAGE}'"),
            (f"UPDATE facebook_pages SET default_module_key='production' WHERE page_id='{PAGE}'", f"UPDATE facebook_pages SET default_module_key='crm' WHERE page_id='{PAGE}'"),
            (f"UPDATE crm_pipelines SET company_id='{uid(12)}' WHERE id='{uid(41)}'", f"UPDATE crm_pipelines SET company_id='{uid(11)}' WHERE id='{uid(41)}'"),
            (f"UPDATE crm_pipeline_stages SET pipeline_type='deal' WHERE id='{uid(51)}'", f"UPDATE crm_pipeline_stages SET pipeline_type='lead' WHERE id='{uid(51)}'"),
            (f"UPDATE crm_pipeline_stages SET pipeline_id='{uid(42)}' WHERE id='{uid(51)}'", f"UPDATE crm_pipeline_stages SET pipeline_id='{uid(41)}' WHERE id='{uid(51)}'"),
            (f"UPDATE crm_sources SET company_id=NULL WHERE id='{uid(61)}'", f"UPDATE crm_sources SET company_id='{uid(11)}' WHERE id='{uid(61)}'"),
            (f"UPDATE company_regions SET is_active=NULL WHERE id='{uid(31)}'", f"UPDATE company_regions SET is_active=true WHERE id='{uid(31)}'"),
        ]
        for change, restore in alters:
            self.sql(change)
            self.error(self.command(item), "42501")
            self.sql(restore)
        self.assertEqual(json.loads(self.counts()), [0] * 8)

    def test_10_binding_disabled_version_and_replay_revocation(self):
        item = self.prepare()
        self.error(self.command(item, version=2))
        result = self.intake(item)
        self.sql(f"UPDATE facebook_lead_ads_bindings SET active=false WHERE page_id='{PAGE}';")
        self.assertEqual(self.scalar(f"SELECT version FROM facebook_lead_ads_bindings WHERE page_id='{PAGE}';"), "2")
        self.error(self.command(item, version=2))
        self.sql(f"UPDATE facebook_lead_ads_bindings SET active=true WHERE page_id='{PAGE}';")
        self.error(self.command(item, version=3), "40001")
        self.assertEqual(self.scalar("SELECT id FROM facebook_lead_ads_intake_receipts;"), result["receiptId"])

    def test_11_foreign_phone_not_linked_same_company_phone_requires_review(self):
        self.sql(f"INSERT INTO customers(id,full_name,phone,company_id) VALUES('{uid(81)}','Other','{data()['phone']}','{uid(12)}');")
        item = self.prepare()
        result = self.intake(item)
        self.assertNotEqual(result["customerId"], uid(81))
        self.service(f"SELECT facebook_page_inbox_finish_v1('{item['id']}','{uid(101)}',true,NULL);")
        second = self.prepare(2)
        self.error(self.command(second, business=data(), provider=proof(2)))
        self.assertEqual(self.scalar("SELECT count(*) FROM crm_leads;"), "1")

    def test_12_unreceipted_partial_rows_are_never_adopted(self):
        item = self.prepare()
        self.sql(f"INSERT INTO facebook_lead_ads(page_id,leadgen_id,form_id,raw_data) VALUES('{PAGE}','{proof()['id']}','{FORM}',{js(proof())});")
        self.error(self.command(item))
        self.sql("DELETE FROM facebook_lead_ads;")
        self.sql(f"INSERT INTO facebook_contacts(page_id,psid) VALUES('{PAGE}','leadad_{proof()['id']}');")
        self.error(self.command(item))
        self.assertEqual(self.scalar("SELECT count(*) FROM facebook_lead_ads_intake_receipts;"), "0")

    def test_13_lease_rechecked_after_actual_recipient_lock_wait(self):
        item = self.prepare()
        holder = self.spawn(f"BEGIN; SELECT id FROM users WHERE id='{uid(21)}' FOR UPDATE; SELECT pg_sleep(60); COMMIT;", "recipient_holder")
        self.wait("recipient_holder", "PgSleep")
        self.sql(f"UPDATE facebook_page_inbox SET locked_until=clock_timestamp()+interval '300 milliseconds' WHERE id='{item['id']}';")
        caller = self.spawn("SET ROLE service_role; " + self.command(item), "lease_wait")
        self.wait("lease_wait", "Lock")
        time.sleep(0.35)
        self.terminate("recipient_holder")
        self.result(caller, "40001")
        self.assertEqual(json.loads(self.counts()), [0] * 8)

    def test_14_expiry_during_insert_rolls_back_everything(self):
        item = self.prepare()
        self.sql("CREATE FUNCTION test_notification_wait() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN PERFORM pg_sleep(0.4); RETURN NEW; END $$; "
                 "CREATE TRIGGER test_notification_wait BEFORE INSERT ON notifications FOR EACH ROW EXECUTE FUNCTION test_notification_wait();")
        self.sql(f"UPDATE facebook_page_inbox SET locked_until=clock_timestamp()+interval '250 milliseconds' WHERE id='{item['id']}';")
        self.error(self.command(item))
        self.assertEqual(json.loads(self.counts()), [0] * 8)

    def test_15_expired_and_replaced_token_never_create(self):
        item = self.prepare()
        self.error(self.command(item, token=102))
        self.sql(f"UPDATE facebook_page_inbox SET locked_until=clock_timestamp()-interval '1 second' WHERE id='{item['id']}';")
        self.error(self.command(item))
        replacement = self.claim(102)
        self.error(self.command(item))
        self.assertEqual(self.intake(replacement, token=102)["status"], "created")

    def test_16_messenger_pending_does_not_block_lane_but_live_lease_does(self):
        self.enqueue(event(9, kind="messaging"), event())
        lead = self.claim()
        self.assertEqual(lead["payload"]["event"]["field"], "leadgen")
        self.assertEqual(self.scalar("SELECT status FROM facebook_page_inbox ORDER BY queue_order LIMIT 1;"), "pending")
        self.assertEqual(self.service(f"SELECT count(*) FROM facebook_page_inbox_claim_v1('{uid(102)}');"), "0")
        self.service(f"SELECT facebook_page_inbox_finish_v1('{lead['id']}','{uid(101)}',true,NULL);")
        msg = json.loads(self.service(f"SELECT row_to_json(x) FROM facebook_page_inbox_claim_v1('{uid(102)}') x;"))
        self.enqueue(event(2))
        self.assertIsNone(self.claim(103))
        self.assertEqual(msg["payload"]["kind"], "messaging")

    def test_17_lane_due_order_backoff_poison_does_not_starve_valid_submission(self):
        self.enqueue(event(), event(2), event(3, page=PAGE_B))
        lead = self.claim()
        self.service(f"SELECT facebook_page_inbox_finish_v1('{lead['id']}','{uid(101)}',false,'REVIEW_REQUIRED');")
        valid = self.claim(102)
        self.assertEqual(valid["payload"]["event"]["value"]["leadgen_id"], proof(2)["id"])
        self.intake(valid, token=102, business=data(2), provider=proof(2))
        self.service(f"SELECT facebook_page_inbox_finish_v1('{valid['id']}','{uid(102)}',true,NULL);")
        self.sql(f"UPDATE facebook_page_inbox SET available_at=clock_timestamp() WHERE id='{lead['id']}';")
        retry_bad = self.claim(104)
        self.error(self.command(retry_bad, token=104, business={**data(), 'phone': ''}), "22023")
        self.service(f"SELECT facebook_page_inbox_finish_v1('{retry_bad['id']}','{uid(104)}',false,'REVIEW_REQUIRED');")
        self.assertEqual(self.scalar("SELECT count(*) FROM crm_leads;"), "1")
        other = self.claim(103, [PAGE, PAGE_B])
        self.assertEqual(other["page_id"], PAGE_B)
        self.error(f"SELECT * FROM facebook_page_inbox_claim_lead_ads_v1('{uid(101)}',ARRAY[NULL]::text[]);", "22023")

    def test_18_concurrent_claims_only_one_live_page_lease(self):
        self.enqueue(event(), event(2), event(3))
        workers = [self.spawn(f"SET ROLE service_role; SELECT id FROM facebook_page_inbox_claim_lead_ads_v1('{uid(110+n)}',ARRAY['{PAGE}']);", f"claim_{n}") for n in range(6)]
        self.assertEqual(sum(bool(self.result(w)) for w in workers), 1)
        self.assertEqual(self.scalar("SELECT count(*) FROM facebook_page_inbox WHERE status='processing';"), "1")

    def test_19_blocklist_and_waiting_insert_checked_before_commit(self):
        item = self.prepare()
        holder = self.spawn(f"BEGIN; INSERT INTO crm_auto_lead_blocked_phones(phone_last9) VALUES('{data()['phone'][-9:]}'); "
                            "SELECT pg_sleep(0.7); COMMIT;", "block_holder")
        self.wait("block_holder", "PgSleep")
        caller = self.spawn("SET ROLE service_role; " + self.command(item), "block_wait")
        self.wait("block_wait", "Lock")
        self.result(holder)
        self.result(caller, "42501")
        self.assertEqual(json.loads(self.counts()), [0] * 8)

    def test_20_current_rights_checked_on_receipt_replay(self):
        item = self.prepare()
        self.intake(item)
        self.sql(f"UPDATE users SET is_active=false WHERE id='{uid(21)}';")
        self.error(self.command(item), "42501")
        self.sql(f"UPDATE users SET is_active=true WHERE id='{uid(21)}'; UPDATE facebook_pages SET default_company_id='{uid(12)}' WHERE page_id='{PAGE}';")
        self.error(self.command(item))
        self.assertEqual(json.loads(self.counts()), [1, 1, 1, 1, 1, 1, 1, 0])

    def test_21_receipt_history_immutable_no_adoption_after_mapping_change(self):
        item = self.prepare()
        result = self.intake(item)
        self.error("UPDATE facebook_lead_ads_intake_receipts SET lead_data='{}';", "42501")
        self.error("UPDATE facebook_lead_ads_intake_receipts SET lead_data='{}';", "42501", service=False)
        self.sql(f"UPDATE crm_leads SET company_id='{uid(12)}' WHERE id='{result['leadId']}';")
        self.error(self.command(item))
        self.assertEqual(self.scalar("SELECT count(*) FROM notifications;"), "1")

    def test_22_legacy_null_tenants_fail_closed_sales_admin_current_company_supported(self):
        item = self.prepare()
        self.sql(f"UPDATE companies SET tenant_id=NULL WHERE id='{uid(11)}'; UPDATE users SET tenant_id=NULL,role='sales_admin' WHERE id='{uid(21)}';")
        self.assertIn("FB_INBOX_COMPANY_UNAVAILABLE", self.error(self.command(item), "42501"))
        self.sql(f"UPDATE companies SET tenant_id='{uid(1)}' WHERE id='{uid(11)}'; UPDATE users SET tenant_id='{uid(1)}' WHERE id='{uid(21)}';")
        self.assertEqual(self.intake(item)["status"], "created")

    def test_23_repeatable_read_rejected_even_for_replay(self):
        item = self.prepare()
        self.intake(item)
        self.error("BEGIN ISOLATION LEVEL REPEATABLE READ; " + self.command(item), "25001")

    def test_24_same_phone_two_pages_same_company_serializes_without_merge(self):
        self.sql(f"UPDATE facebook_pages SET default_company_id='{uid(11)}' WHERE page_id='{PAGE_B}'; "
                 f"UPDATE facebook_lead_ads_bindings SET company_id='{uid(11)}',recipient_id='{uid(21)}',pipeline_id='{uid(41)}',stage_id='{uid(51)}',source_id='{uid(61)}',region_id='{uid(31)}' WHERE page_id='{PAGE_B}';")
        a = self.prepare()
        b = self.prepare(2, page=PAGE_B, token=102)
        workers = [self.spawn("SET ROLE service_role; " + self.command(a), "phone_a"),
                   self.spawn("SET ROLE service_role; " + self.command(b, token=102, business=data(), provider=proof(2, page=PAGE_B), version=2), "phone_b")]
        outputs = [w.communicate(timeout=12) for w in workers]
        self.assertEqual(sum(w.returncode == 0 for w in workers), 1)
        self.assertTrue(any("40001" in err for out, err in outputs))
        self.assertEqual(json.loads(self.counts()), [1, 1, 1, 1, 1, 1, 1, 0])

    def test_25_same_global_leadgen_wrong_page_conflicts_without_mutation(self):
        self.intake(self.prepare())
        other = self.prepare(2, page=PAGE_B, token=102, leadgen=proof()["id"])
        self.error(self.command(other, token=102, provider=proof(page=PAGE_B)), "23505")
        self.assertEqual(json.loads(self.counts()), [1, 1, 1, 1, 1, 1, 1, 0])

    def test_26_care_namespace_or_binding_presence_blocks_create_and_replay(self):
        item = self.prepare()
        for create, drop in (("CREATE SCHEMA crm_care_control;", "DROP SCHEMA crm_care_control;"),
                             ("CREATE TABLE marketing_fb_lead_bindings(id int);", "DROP TABLE marketing_fb_lead_bindings;")):
            self.sql(create)
            try:
                self.assertIn("FB_INBOX_CARE_SCOPE_REVIEW_REQUIRED", self.error(self.command(item), "42501"))
                self.assertEqual(json.loads(self.counts()), [0] * 8)
            finally:
                self.sql(drop)
        self.intake(item)
        for create, drop in (("CREATE SCHEMA crm_care_control;", "DROP SCHEMA crm_care_control;"),
                             ("CREATE TABLE marketing_fb_lead_bindings(id int);", "DROP TABLE marketing_fb_lead_bindings;")):
            self.sql(create)
            try:
                self.assertIn("FB_INBOX_CARE_SCOPE_REVIEW_REQUIRED", self.error(self.command(item), "42501"))
                self.assertEqual(json.loads(self.counts()), [1, 1, 1, 1, 1, 1, 1, 0])
            finally:
                self.sql(drop)

    def test_27_notification_missing_or_retargeted_invalidates_replay_without_repair(self):
        item = self.prepare()
        self.intake(item)
        self.sql(f"UPDATE notifications SET user_id='{uid(22)}';")
        self.assertIn("FB_INBOX_LEAD_HANDOFF_REVIEW_REQUIRED", self.error(self.command(item)))
        self.sql("DELETE FROM notifications;")
        self.assertIn("FB_INBOX_LEAD_HANDOFF_REVIEW_REQUIRED", self.error(self.command(item)))
        self.assertEqual(self.scalar("SELECT count(*) FROM notifications;"), "0")

    def test_28_legacy_triggers_cannot_be_shadowed_by_temp_tables(self):
        item = self.prepare()
        result = json.loads(self.service("CREATE TEMP TABLE companies(id uuid,tenant_id uuid); "
                            "CREATE TEMP TABLE crm_pipeline_stages(id uuid,canonical_slug text); "
                            "CREATE TEMP TABLE crm_lead_stage_history(id uuid); " + self.command(item)))
        self.assertEqual(result["status"], "created")
        self.assertEqual(self.scalar("SELECT count(*) FROM public.crm_lead_stage_history;"), "1")

    def test_29_untrusted_schema_create_is_rejected_and_actual_old_trigger_blocks(self):
        item = self.prepare()
        for role in ("PUBLIC", "anon", "authenticated", "service_role"):
            self.sql(f"GRANT CREATE ON SCHEMA public TO {role};")
            try:
                self.assertIn("FB_INBOX_SCHEMA_SCOPE_UNSAFE", self.error(self.command(item), "42501"))
            finally:
                self.sql(f"REVOKE CREATE ON SCHEMA public FROM {role};")
        self.sql((ROOT / "database/39_auto_gen_tasks_trigger.sql").read_text(encoding="utf-8"))
        try:
            self.assertIn("FB_INBOX_LEGACY_TASK_TRIGGER_REVIEW_REQUIRED", self.error(self.command(item), "42501"))
        finally:
            self.sql((ROOT / "database/227_drop_legacy_auto_gen_tasks_trigger.sql").read_text(encoding="utf-8"))
        self.assertEqual(json.loads(self.counts()), [0] * 8)

    @unittest.skipUnless(os.environ.get("VPT_INBOX_RESTORE_TEST") == "1", "Set VPT_INBOX_RESTORE_TEST=1 for isolated SQL702 restore")
    def test_30_full_logical_restore_preserves_domain_receipts_queue_replay_and_restricted_acl(self):
        for executable in ("pg_dump", "pg_restore"):
            self.assertTrue(shutil.which(executable), f"{executable} required")
        self.assertEqual(self.env["PGHOST"], "127.0.0.1")
        self.assertEqual(self.env["PGDATABASE"], "vpt_lead_ads_ci")
        self.assertNotEqual(RESTORE_DATABASE, self.env["PGDATABASE"])
        self.assertEqual(self.scalar(f"SELECT count(*) FROM pg_database WHERE datname='{RESTORE_DATABASE}';"), "0",
                         "Refuse a preexisting restore target; never clean/overwrite another database")

        # Commit CRM for A without finishing inbox: actual crash/response-loss seam.
        unfinished = self.prepare()
        original = self.intake(unfinished)
        # Separate completed receipt, then pending Messenger and Lead Ads entries.
        completed = self.prepare(2, page=PAGE_B, token=102)
        completed_result = self.intake(completed, token=102, business=data(2), provider=proof(2, page=PAGE_B))
        self.sql(f"UPDATE crm_leads SET expected_construction_time='under_1m' WHERE id='{completed_result['leadId']}';")
        self.assertEqual(self.scalar(f"SELECT lead_temperature FROM crm_leads WHERE id='{completed_result['leadId']}';"), "hot")
        self.service(f"SELECT facebook_page_inbox_finish_v1('{completed['id']}','{uid(102)}',true,NULL);")
        self.enqueue(event(3, kind="messaging"), event(4, page=PAGE_B))
        self.canonicalize_restore_checks()
        # A direct malformed row still hits the actual CHECK after its exact DDL
        # round-trip, without the enqueue RPC masking a weakened constraint.
        check_error = self.error("INSERT INTO facebook_page_inbox(event_key,page_id,payload) VALUES("
                                 + lit("a" * 64) + ",''," + js(event()["payload"]) + ");", "23514", service=False)
        self.assertIn("facebook_page_inbox_page_id_check", check_error)
        before = self.restore_inventory()
        self.assertEqual(json.loads(self.counts()), [2, 2, 2, 2, 2, 2, 2, 0])
        self.assertGreater(len(before["data"]), 15, "Must dump full fixture, not inbox-only")
        self.assertTrue(any(s["name"] == "facebook_page_inbox_queue_order_seq" and s["called"] for s in before["sequences"]))
        source_database_oid = self.scalar("SELECT oid FROM pg_database WHERE datname=current_database();")
        created = False
        archive_sha = None
        archive_bytes = 0
        try:
            self.sql(f"CREATE DATABASE {RESTORE_DATABASE} TEMPLATE template0;")
            created = True
            self.assertEqual(self.scalar("SELECT count(*) FROM pg_tables WHERE schemaname='public';", database=RESTORE_DATABASE), "0")
            self.assertNotEqual(source_database_oid, self.scalar("SELECT oid FROM pg_database WHERE datname=current_database();", database=RESTORE_DATABASE))
            with tempfile.TemporaryDirectory(prefix="vpt-lead-ads-restore-") as directory:
                archive = Path(directory) / "lead-ads-full.dump"
                dumped = subprocess.run(["pg_dump", "--format=custom", "--file", str(archive)],
                                        env=self.env, capture_output=True, text=True, timeout=60)
                self.assertEqual(dumped.returncode, 0, dumped.stderr)
                archive_content = archive.read_bytes()
                archive_bytes = len(archive_content)
                self.assertGreater(archive_bytes, 10000)
                archive_sha = hashlib.sha256(archive_content).hexdigest()
                restored = subprocess.run(["pg_restore", "--single-transaction", "--exit-on-error", "--dbname", RESTORE_DATABASE, str(archive)],
                                          env={**self.env, "PGDATABASE": RESTORE_DATABASE}, capture_output=True, text=True, timeout=60)
                self.assertEqual(restored.returncode, 0, restored.stderr)
            # Owner/ACL/RLS, actual trigger bodies, functions, FKs/indexes and all
            # table data must match before touching the restored queue.
            self.assert_restore_inventory_equal(before, self.restore_inventory(database=RESTORE_DATABASE))
            self.assert_restore_inventory_equal(before, self.restore_inventory(), "Source cannot change during the rehearsal")
            # Prove the comparison observes effective grant drift, not just rows.
            self.sql("GRANT SELECT ON facebook_lead_ads_intake_receipts TO anon;", database=RESTORE_DATABASE)
            self.assertNotEqual(before["metadata"], self.restore_inventory(database=RESTORE_DATABASE)["metadata"])
            self.sql("REVOKE SELECT ON facebook_lead_ads_intake_receipts FROM anon;", database=RESTORE_DATABASE)
            self.assert_restore_inventory_equal(before, self.restore_inventory(database=RESTORE_DATABASE))
            denied_tables = ["facebook_page_inbox", "facebook_lead_ads_bindings", "facebook_lead_ads_intake_receipts",
                             "customers", "crm_leads", "facebook_contacts", "facebook_lead_ads", "lead_attribution", "notifications"]
            allowed = self.scalar("SELECT bool_and(NOT has_table_privilege(r,t,p)) FROM "
                                  "unnest(ARRAY['anon','authenticated']) r CROSS JOIN unnest(ARRAY["
                                  + ",".join(lit(t) for t in denied_tables) + "]) t CROSS JOIN "
                                  "unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE']) p;", database=RESTORE_DATABASE)
            self.assertEqual(allowed, "t")
            self.assertEqual(self.scalar("SELECT bool_and(NOT has_table_privilege('service_role',t,p)) FROM "
                "unnest(ARRAY['facebook_lead_ads_bindings','facebook_lead_ads_intake_receipts']) t CROSS JOIN "
                "unnest(ARRAY['INSERT','UPDATE','DELETE','TRUNCATE']) p;", database=RESTORE_DATABASE), "t")
            self.assertEqual(self.scalar("SELECT has_table_privilege('service_role','facebook_page_inbox','DELETE') OR "
                "has_table_privilege('service_role','facebook_page_inbox','TRUNCATE');", database=RESTORE_DATABASE), "f")
            signature = "facebook_lead_ads_intake_v1(uuid,uuid,integer,jsonb,jsonb)"
            self.assertEqual(self.scalar(f"SELECT has_function_privilege('service_role','{signature}','EXECUTE') AND "
                f"NOT has_function_privilege('anon','{signature}','EXECUTE') AND "
                f"NOT has_function_privilege('authenticated','{signature}','EXECUTE');", database=RESTORE_DATABASE), "t")
            self.error("SET ROLE anon; SELECT * FROM facebook_lead_ads_intake_receipts;", "42501", service=False, database=RESTORE_DATABASE)
            self.error("UPDATE facebook_lead_ads_bindings SET active=true;", "42501", database=RESTORE_DATABASE)
            self.error("UPDATE facebook_lead_ads_intake_receipts SET lead_data='{}';", "42501", service=False, database=RESTORE_DATABASE)
            self.assertEqual(self.service(f"SELECT facebook_page_inbox_finish_v1('{unfinished['id']}','{uid(199)}',true,NULL);",
                                          database=RESTORE_DATABASE), "f")

            # Restore does not grant a new lease. Simulate elapsed time only on
            # target; recover through actual claim and cached receipt RPC.
            self.sql(f"UPDATE facebook_page_inbox SET locked_until=clock_timestamp()-interval '1 second' WHERE id='{unfinished['id']}';",
                     database=RESTORE_DATABASE)
            recovered = json.loads(self.service(f"SELECT row_to_json(x) FROM facebook_page_inbox_claim_lead_ads_v1('{uid(201)}',ARRAY['{PAGE}']) x;",
                                                 database=RESTORE_DATABASE))
            self.assertEqual(recovered["id"], unfinished["id"])
            self.error(self.command(unfinished), "40001", database=RESTORE_DATABASE)
            cached = json.loads(self.service("SELECT json_build_object('lead',lead_data,'provider',provider_data) "
                                            f"FROM facebook_lead_ads_intake_receipts WHERE id='{original['receiptId']}';", database=RESTORE_DATABASE))
            replay = json.loads(self.service(self.command(recovered, token=201, business=cached["lead"], provider=cached["provider"]),
                                            database=RESTORE_DATABASE))
            self.assertEqual(replay, {**original, "status": "existing"})
            self.assertEqual(json.loads(self.counts(database=RESTORE_DATABASE)), [2, 2, 2, 2, 2, 2, 2, 0])
            self.assertEqual(self.service(f"SELECT facebook_page_inbox_finish_v1('{recovered['id']}','{uid(201)}',true,NULL);",
                                          database=RESTORE_DATABASE), "t")
            self.assertEqual(self.service(f"SELECT facebook_page_inbox_enqueue_v1({js([event()])});", database=RESTORE_DATABASE), "1")
            self.assertEqual(self.scalar(f"SELECT status FROM facebook_page_inbox WHERE id='{unfinished['id']}';", database=RESTORE_DATABASE), "done")
            self.assertEqual(self.scalar("SELECT count(*) FROM facebook_page_inbox WHERE payload->>'kind'='messaging' AND status='pending';",
                                         database=RESTORE_DATABASE), "1")

            # A new envelope for the same provider identity also returns the
            # preserved receipt; identity sequence must continue after restore.
            self.service(f"SELECT facebook_page_inbox_enqueue_v1({js([event(5, leadgen=proof()['id'])])});", database=RESTORE_DATABASE)
            self.assertEqual(self.scalar("SELECT max(queue_order)>4 FROM facebook_page_inbox;", database=RESTORE_DATABASE), "t")
            duplicate = json.loads(self.service(f"SELECT row_to_json(x) FROM facebook_page_inbox_claim_lead_ads_v1('{uid(202)}',ARRAY['{PAGE}']) x;",
                                                database=RESTORE_DATABASE))
            duplicate_result = json.loads(self.service(self.command(duplicate, token=202, business=cached["lead"], provider=cached["provider"]),
                                                      database=RESTORE_DATABASE))
            self.assertEqual(duplicate_result, {**original, "status": "existing"})
            self.assertEqual(self.service(f"SELECT facebook_page_inbox_finish_v1('{duplicate['id']}','{uid(202)}',true,NULL);",
                                          database=RESTORE_DATABASE), "t")
            # This time perform a new full intake, proving restored functions,
            # real stage-history triggers and FK permissions still execute.
            fresh = json.loads(self.service(f"SELECT row_to_json(x) FROM facebook_page_inbox_claim_lead_ads_v1('{uid(203)}',ARRAY['{PAGE_B}']) x;",
                                            database=RESTORE_DATABASE))
            fresh_result = json.loads(self.service(self.command(fresh, token=203, business=data(4), provider=proof(4, page=PAGE_B)),
                                                  database=RESTORE_DATABASE))
            self.assertEqual(fresh_result["status"], "created")
            self.assertEqual(json.loads(self.counts(database=RESTORE_DATABASE)), [3, 3, 3, 3, 3, 3, 3, 0])
            self.assertEqual(self.scalar("SELECT count(*) FROM crm_lead_stage_history;", database=RESTORE_DATABASE), "3")
            self.assertEqual(self.scalar(f"SELECT lead_temperature FROM crm_leads WHERE id='{completed_result['leadId']}';",
                                         database=RESTORE_DATABASE), "hot")
            self.assertEqual(self.scalar(f"SELECT project_id IS NULL AND lead_temperature IS NULL AND info_complete IS FALSE "
                                         f"FROM crm_leads WHERE id='{fresh_result['leadId']}';", database=RESTORE_DATABASE), "t")
            self.assertEqual(self.service(f"SELECT facebook_page_inbox_finish_v1('{fresh['id']}','{uid(203)}',true,NULL);",
                                          database=RESTORE_DATABASE), "t")
            self.assertEqual(self.scalar("SELECT count(*) FROM facebook_page_inbox WHERE status='done';", database=RESTORE_DATABASE), "4")
            self.assert_restore_inventory_equal(before, self.restore_inventory(), "Restored processing must not write the source DB")
            print(json.dumps({"rehearsal": "SQL702_FULL_FIXTURE", "archiveSha256": archive_sha,
                              "archiveBytes": archive_bytes, "tables": len(before["data"]),
                              "source": "vpt_lead_ads_ci", "target": RESTORE_DATABASE,
                              "sameCluster": True, "productionRestore": False}, sort_keys=True), flush=True)
        finally:
            if created:
                # Literal allowlisted target created by this method only. No path,
                # connection string or preexisting DB is accepted as a target.
                self.sql(f"DROP DATABASE {RESTORE_DATABASE} WITH (FORCE);")

    def test_31_actual_temperature_and_project_triggers_run_without_intake_side_effects(self):
        trigger_names = ["trg_crm_lead_auto_temperature_ins", "trg_crm_lead_auto_temperature_upd", "trg_crm_leads_has_crm_deal"]
        self.assertEqual(self.scalar("SELECT count(*) FROM pg_trigger WHERE tgrelid='crm_leads'::regclass "
                                     "AND tgenabled='O' AND tgname=ANY(ARRAY["
                                     + ",".join(lit(name) for name in trigger_names) + "]);"), "3")
        self.sql(f"INSERT INTO projects(id,company_id) VALUES('{uid(71)}','{uid(11)}');")
        project_before = self.scalar(f"SELECT to_jsonb(p) FROM projects p WHERE id='{uid(71)}';")
        result = self.intake(self.prepare())
        self.assertEqual(self.scalar(f"SELECT project_id IS NULL AND lead_temperature IS NULL AND info_complete IS FALSE "
                                     f"FROM crm_leads WHERE id='{result['leadId']}';"), "t")
        self.assertEqual(project_before, self.scalar(f"SELECT to_jsonb(p) FROM projects p WHERE id='{uid(71)}';"))
        self.assertEqual(self.scalar("SELECT count(*) FROM crm_deal_projects;"), "0")
        self.assertEqual(self.scalar("SELECT count(*) FROM crm_tasks;"), "0")
        # Exercise the actual UPDATE trigger too; no copied substitute function.
        self.sql(f"UPDATE crm_leads SET expected_construction_time='under_1m' WHERE id='{result['leadId']}';")
        self.assertEqual(self.scalar(f"SELECT lead_temperature FROM crm_leads WHERE id='{result['leadId']}';"), "hot")
        self.sql(f"UPDATE crm_leads SET expected_construction_time='1_2m' WHERE id='{result['leadId']}';")
        self.assertEqual(self.scalar(f"SELECT lead_temperature FROM crm_leads WHERE id='{result['leadId']}';"), "warm")
        self.assertEqual(project_before, self.scalar(f"SELECT to_jsonb(p) FROM projects p WHERE id='{uid(71)}';"))


if __name__ == "__main__":
    unittest.main(verbosity=2)
