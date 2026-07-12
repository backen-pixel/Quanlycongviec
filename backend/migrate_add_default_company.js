// Thêm cột default_company_id vào facebook_pages
// Chạy: node migrate_add_default_company.js
//
// Script sẽ thử thêm cột tự động.
// Nếu không được, sẽ in SQL để chạy trong Supabase SQL Editor.

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const SQL = `ALTER TABLE facebook_pages ADD COLUMN IF NOT EXISTS default_company_id uuid REFERENCES companies(id);`;

(async () => {
  // Check xem cột đã có chưa
  const { data: row } = await sb.from('facebook_pages').select('*').limit(1).maybeSingle();
  if (row && 'default_company_id' in row) {
    console.log('✅ Cột default_company_id đã tồn tại!');
    return;
  }

  console.log('⚠️  Cột default_company_id chưa có trong facebook_pages.');
  console.log('');
  console.log('📋 Chạy SQL này trong Supabase SQL Editor:');
  console.log('═'.repeat(60));
  console.log(SQL);
  console.log('═'.repeat(60));
  console.log('');
  console.log('🔗 https://supabase.com/dashboard/project/kdxypztstbeovyedmvem/sql');
})();
