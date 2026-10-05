-- Metadata only. Not a migration. Run separately on the confirmed Primary and Backup.
-- Review the target project before executing. No customer rows, secrets or business RPCs.
-- This transaction cannot alter persistent data; finish with ROLLBACK.
BEGIN TRANSACTION READ ONLY;
SET LOCAL statement_timeout = '20s';
SET LOCAL lock_timeout = '2s';

SELECT current_database() AS database_name, current_user AS reader,
       current_setting('server_version') AS server_version,
       current_setting('transaction_read_only') AS read_only,
       current_setting('max_locks_per_transaction') AS max_locks_per_transaction,
       pg_is_in_recovery() AS is_recovery;

-- Physical column presence, type/default and constraints: distinguish absent column from REST cache.
SELECT n.nspname AS schema_name, c.relname AS table_name, a.attname AS column_name,
       format_type(a.atttypid, a.atttypmod) AS data_type, a.attnotnull AS not_null,
       pg_get_expr(d.adbin, d.adrelid) AS default_expression
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
LEFT JOIN pg_attrdef d ON d.adrelid = c.oid AND d.adnum = a.attnum
WHERE n.nspname = 'public' AND c.relname IN ('crm_leads', 'facebook_contacts')
ORDER BY n.nspname, c.relname, a.attnum;

SELECT n.nspname AS schema_name, c.relname AS table_name,
       k.conname, k.contype, k.convalidated, pg_get_constraintdef(k.oid) AS definition
FROM pg_constraint k
JOIN pg_class c ON c.oid = k.conrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relname IN ('crm_leads', 'facebook_contacts')
ORDER BY c.relname, k.conname;

SELECT schemaname, tablename, indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public' AND tablename IN ('crm_leads', 'facebook_contacts')
ORDER BY tablename, indexname;

-- Scoped catalog/ACL inventory, not a complete permission or tenant-isolation proof.
SELECT n.nspname AS schema_name, c.relname AS table_name,
       c.relrowsecurity AS rls_enabled, c.relforcerowsecurity AS rls_forced,
       pg_get_userbyid(c.relowner) AS owner, c.relacl::text AS acl
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE c.relkind IN ('r', 'p')
  AND n.nspname NOT IN ('pg_catalog', 'information_schema')
  AND (c.relname IN ('crm_leads', 'customers', 'facebook_contacts', 'facebook_pages',
                    'facebook_lead_ads', 'users', 'companies')
       OR c.relname LIKE 'crm_lead_%' OR c.relname LIKE 'facebook_lead_%'
       OR c.relname LIKE 'marketing_%')
ORDER BY n.nspname, c.relname;

SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies
WHERE tablename IN ('crm_leads', 'customers', 'facebook_contacts', 'facebook_pages',
                    'facebook_lead_ads', 'users', 'companies')
   OR tablename LIKE 'crm_lead_%' OR tablename LIKE 'facebook_lead_%'
   OR tablename LIKE 'marketing_%'
ORDER BY schemaname, tablename, policyname;

-- Discover ledger structure only. Read ledger records after verifying which ledger is authoritative.
SELECT table_schema, table_name, column_name, data_type
FROM information_schema.columns
WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
  AND (table_name ILIKE '%migration%' OR table_name ILIKE '%schema_version%')
ORDER BY table_schema, table_name, ordinal_position;

ROLLBACK;
