const { createClient } = require('@supabase/supabase-js');
const config = require('./index');

const supabase = createClient(config.supabaseUrl, config.supabaseServiceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

module.exports = { supabase };
