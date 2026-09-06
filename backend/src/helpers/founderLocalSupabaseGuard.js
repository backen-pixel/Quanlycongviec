const { isFounderLocalReadOnly } = require('../config/runtimeProfile');

const BLOCKED_QUERY_METHODS = Object.freeze(['insert', 'upsert', 'update', 'delete']);
const READ_ONLY_RPC_NAMES = Object.freeze([
  'user_has_permission',
  'crm_leads_page_ids',
  'crm_leads_stage_counts',
  'crm_filter_summary',
]);
const READ_ONLY_RPC_SET = new Set(READ_ONLY_RPC_NAMES);
const PATCH_MARK = Symbol.for('quanlycongviec.founderLocalSupabaseGuard');
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function readOnlyError(operation) {
  const error = new Error(`Founder-local read-only đã chặn thao tác Supabase: ${operation}`);
  error.code = 'FOUNDER_LOCAL_DATABASE_WRITE_BLOCKED';
  error.operation = operation;
  return error;
}

function assertReadOnlyRpcScope(functionName, args) {
  if (functionName === 'user_has_permission') return;
  const companyId = String(args?.p_company_id || '').trim();
  const companyIds = args?.p_company_ids;
  const hasCompanyIdScope = UUID_RE.test(companyId);
  const hasCompanyIdsScope = Array.isArray(companyIds)
    && companyIds.every((id) => UUID_RE.test(String(id || '').trim()));
  if (!hasCompanyIdScope && !hasCompanyIdsScope) {
    throw readOnlyError(`rpc.${functionName}.company_scope`);
  }
}

/**
 * Last-resort guard for accidental write-on-GET code paths. HTTP mutations,
 * startup writers and realtime are blocked separately at the server boundary.
 */
function installFounderLocalSupabaseGuard({
  env = process.env,
  PostgrestQueryBuilder,
  SupabaseClient,
} = {}) {
  if (!isFounderLocalReadOnly(env)) return { installed: false, reason: 'profile_inactive' };

  let QueryBuilder = PostgrestQueryBuilder;
  let Client = SupabaseClient;
  if (!QueryBuilder) {
    ({ PostgrestQueryBuilder: QueryBuilder } = require('@supabase/postgrest-js'));
  }
  if (!Client) {
    ({ SupabaseClient: Client } = require('@supabase/supabase-js'));
  }

  const queryPrototype = QueryBuilder?.prototype;
  if (!queryPrototype) {
    const error = new Error('Không cài được Supabase write guard: thiếu PostgrestQueryBuilder.');
    error.code = 'FOUNDER_LOCAL_GUARD_INSTALL_FAILED';
    throw error;
  }

  if (!queryPrototype[PATCH_MARK]) {
    for (const method of BLOCKED_QUERY_METHODS) {
      if (typeof queryPrototype[method] !== 'function') {
        const error = new Error(`Không cài được Supabase write guard: thiếu method ${method}.`);
        error.code = 'FOUNDER_LOCAL_GUARD_INSTALL_FAILED';
        throw error;
      }
      Object.defineProperty(queryPrototype, method, {
        configurable: false,
        enumerable: false,
        writable: false,
        value() {
          throw readOnlyError(`postgrest.${method}`);
        },
      });
    }
    Object.defineProperty(queryPrototype, PATCH_MARK, {
      configurable: false,
      enumerable: false,
      writable: false,
      value: true,
    });
  }

  const clientPrototype = Client?.prototype;
  if (!clientPrototype || typeof clientPrototype.rpc !== 'function') {
    const error = new Error('Không cài được Supabase write guard: thiếu SupabaseClient.rpc.');
    error.code = 'FOUNDER_LOCAL_GUARD_INSTALL_FAILED';
    throw error;
  }
  if (!clientPrototype[PATCH_MARK]) {
    const originalRpc = clientPrototype.rpc;
    Object.defineProperty(clientPrototype, 'rpc', {
      configurable: false,
      enumerable: false,
      writable: false,
      value(functionName, ...args) {
        const normalizedName = String(functionName || '').trim().toLowerCase();
        if (READ_ONLY_RPC_SET.has(normalizedName)) {
          assertReadOnlyRpcScope(normalizedName, args[0]);
          return originalRpc.call(this, functionName, ...args);
        }
        throw readOnlyError(`rpc.${String(functionName || 'unknown')}`);
      },
    });
    Object.defineProperty(clientPrototype, PATCH_MARK, {
      configurable: false,
      enumerable: false,
      writable: false,
      value: true,
    });
  }

  return {
    installed: true,
    blocked_query_methods: [...BLOCKED_QUERY_METHODS],
    allowed_read_only_rpcs: [...READ_ONLY_RPC_NAMES],
    unknown_rpc_blocked: true,
  };
}

module.exports = {
  BLOCKED_QUERY_METHODS,
  READ_ONLY_RPC_NAMES,
  assertReadOnlyRpcScope,
  installFounderLocalSupabaseGuard,
  readOnlyError,
};
