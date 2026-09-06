/**
 * Supabase client — delegate qua supabaseRouter (primary/backup failover).
 * Giữ export { supabase } để không phải sửa ~200 file import.
 */
const { supabase, startHealthChecker } = require('./supabaseRouter');

if (process.env.SUPABASE_HEALTH_CHECK_DISABLED !== '1') {
  startHealthChecker();
}

module.exports = { supabase };
