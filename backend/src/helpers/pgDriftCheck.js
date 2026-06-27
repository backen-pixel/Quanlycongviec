/**
 * Kiểm tra drift row count primary vs backup — song song theo batch.
 */
const { quotePgIdent } = require('./pgQuote');

function driftConcurrency() {
  return Math.max(4, parseInt(process.env.SUPABASE_BACKUP_DRIFT_CONCURRENCY || '24', 10));
}

async function countOneTable(pool, table) {
  try {
    const { rows } = await pool.query(
      `SELECT COUNT(*)::bigint AS n FROM public.${quotePgIdent(table)}`,
    );
    return { count: Number(rows[0]?.n || 0), error: null };
  } catch (e) {
    return { count: null, error: e.message };
  }
}

async function countTablesParallel(pool, tables, concurrency) {
  const results = new Map();
  let idx = 0;
  const workers = Math.min(concurrency, tables.length || 1);
  async function worker() {
    while (idx < tables.length) {
      const i = idx;
      idx += 1;
      const table = tables[i];
      results.set(table, await countOneTable(pool, table));
    }
  }
  await Promise.all(Array.from({ length: workers }, () => worker()));
  return results;
}

/**
 * @param {import('pg').Pool} pPool
 * @param {import('pg').Pool} bPool
 * @param {string[]} tables
 */
async function compareTableCounts(pPool, bPool, tables) {
  const concurrency = driftConcurrency();
  const [primaryMap, backupMap] = await Promise.all([
    countTablesParallel(pPool, tables, concurrency),
    countTablesParallel(bPool, tables, concurrency),
  ]);
  const rows = [];
  for (const table of tables) {
    const p = primaryMap.get(table) || { count: null, error: 'missing' };
    const b = backupMap.get(table) || { count: null, error: 'missing' };
    const error = p.error || b.error || null;
    const primaryCount = p.count;
    const backupCount = b.count;
    rows.push({
      table,
      primary: primaryCount,
      backup: backupCount,
      drift: primaryCount != null && backupCount != null ? primaryCount - backupCount : null,
      ok: primaryCount != null && backupCount != null && primaryCount === backupCount,
      error,
    });
  }
  return rows;
}

module.exports = {
  driftConcurrency,
  compareTableCounts,
};
