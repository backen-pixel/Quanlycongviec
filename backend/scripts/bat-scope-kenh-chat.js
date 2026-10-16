/**
 * Bật scope `channels_read` cho một khoá MCP.
 *
 * Mặc định CHỈ THỬ. Thêm --ghi để cập nhật thật (có file lùi trong backend/uploads/).
 * Chạy: cd backend && node scripts/bat-scope-kenh-chat.js "<tên khoá>" [--ghi]
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { supabase } = require('../src/config/supabase');

const GHI = process.argv.includes('--ghi');
const TEN = process.argv.slice(2).find((a) => !a.startsWith('--'));
const SCOPE = 'channels_read';

(async () => {
  if (!TEN) { console.log('Thiếu tên khoá. Ví dụ: node scripts/bat-scope-kenh-chat.js "Claude Desktop — Chi doc" --ghi'); return; }

  const { data: keys, error } = await supabase.from('external_api_keys')
    .select('id, name, mcp_scopes, company_id, allowed_company_ids, active')
    .eq('name', TEN);
  if (error) { console.log('LỖI đọc:', error.message); return; }
  if (!keys?.length) { console.log(`Không tìm thấy khoá tên "${TEN}".`); return; }
  if (keys.length > 1) { console.log(`Có ${keys.length} khoá trùng tên — dừng cho chắc.`); return; }

  const k = keys[0];
  const cu = Array.isArray(k.mcp_scopes) ? k.mcp_scopes : [];
  console.log(`=== Khoá "${k.name}" ===`);
  console.log(`  đang hoạt động : ${k.active}`);
  console.log(`  công ty        : ${k.company_id || `${(k.allowed_company_ids || []).length} công ty khai tay`}`);
  console.log(`  scope hiện tại : ${JSON.stringify(cu)}`);

  if (cu.includes(SCOPE)) { console.log(`\n→ Đã có "${SCOPE}" rồi, không cần làm gì.`); return; }
  const moi = [...cu, SCOPE];
  console.log(`  scope sau khi bật: ${JSON.stringify(moi)}`);

  if (!GHI) { console.log('\n*** CHỈ THỬ — thêm --ghi để cập nhật thật ***'); return; }

  const fLui = path.join(__dirname, '../uploads', `_rollback_mcp_scope_${Date.now()}.json`);
  fs.writeFileSync(fLui, JSON.stringify([{ id: k.id, name: k.name, mcp_scopes_cu: cu }], null, 2), 'utf8');
  console.log(`\nĐã ghi file lùi: ${fLui}`);

  const { error: e2 } = await supabase.from('external_api_keys')
    .update({ mcp_scopes: moi }).eq('id', k.id);
  if (e2) { console.log(`❌ LỖI ghi: ${e2.message}`); return; }

  const { data: sau } = await supabase.from('external_api_keys')
    .select('mcp_scopes').eq('id', k.id).maybeSingle();
  console.log(`✅ Xong. Đọc lại từ CSDL: ${JSON.stringify(sau?.mcp_scopes)}`);
})().catch((e) => console.log('NGOẠI LỆ:', e.message));
