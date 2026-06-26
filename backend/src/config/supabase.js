/**
 * Supabase client — delegate qua supabaseRouter (primary/backup failover).
 * Giữ export { supabase } để không phải sửa ~200 file import.
 */
const { supabase, startHealthChecker } = require('./supabaseRouter');

startHealthChecker();

module.exports = { supabase };
