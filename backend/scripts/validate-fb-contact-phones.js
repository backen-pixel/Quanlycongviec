#!/usr/bin/env node
/**
 * Chuẩn hóa / dọn SĐT facebook_contacts theo quy tắc VN (thuê bao 0xxxx… 10–11 số).
 * - SĐT không hợp lệ → xóa (NULL) trên contact.
 * - SĐt hợp lệ nhưng sai định dạng → ghi dạng chuẩn 0xxxxxxxxx.
 * - Chưa có SĐT: với --fill-missing, quét tin inbound (KH FB) để điền nếu có số hợp lệ.
 *
 * Chạy từ thư mục backend:
 *   node scripts/validate-fb-contact-phones.js --limit 200 --dry-run
 *   node scripts/validate-fb-contact-phones.js --limit 500 --fill-missing
 *   node scripts/validate-fb-contact-phones.js --limit 1000 --sync-customer-match
 *
 * --sync-customer-match: khi xóa SĐT sai trên contact, nếu customers.phone đúng bằng chuỗi cũ thì xóa luôn.
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { supabase } = require('../src/config/supabase');
const {
  validateVnSubscriberPhoneStored,
  extractInboundContactInfo,
} = require('../src/helpers/facebookPhoneExtract');

function usage() {
  console.log(`
Usage: node scripts/validate-fb-contact-phones.js [options]

  --limit N              Số contact (mặc định 200)
  --offset N             Supabase .range offset (mặc định 0)
  --fill-missing         Điền SĐT từ tin inbound khi contact đang trống
  --sync-customer-match  Xóa customers.phone nếu trùng chuỗi SĐT sai vừa xóa trên contact
  --dry-run
  --help
`);
}

function parseArgs(argv) {
  const o = { limit: 200, offset: 0, fillMissing: false, syncCustomerMatch: false, dryRun: false };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') { o.help = true; continue; }
    if (a === '--fill-missing') { o.fillMissing = true; continue; }
    if (a === '--sync-customer-match') { o.syncCustomerMatch = true; continue; }
    if (a === '--dry-run') { o.dryRun = true; continue; }
    const next = () => argv[++i] || '';
    if (a === '--limit') o.limit = Math.max(1, parseInt(next(), 10) || 200);
    else if (a === '--offset') o.offset = Math.max(0, parseInt(next(), 10) || 0);
    else console.warn('Unknown:', a);
  }
  return o;
}

async function loadInboundMessages(contactId, maxRows = 800) {
  const { data, error } = await supabase
    .from('facebook_messages')
    .select('id, content, direction, created_at')
    .eq('contact_id', contactId)
    .eq('direction', 'inbound')
    .order('created_at', { ascending: false })
    .limit(maxRows);
  if (error) throw error;
  return data || [];
}

async function clearCustomerIfSame(custId, exactString, dry) {
  if (!custId || !exactString) return false;
  const { data: cust } = await supabase.from('customers').select('id, phone').eq('id', custId).maybeSingle();
  if (!cust || cust.phone == null) return false;
  if (String(cust.phone).trim() !== String(exactString).trim()) return false;
  if (!dry) {
    await supabase
      .from('customers')
      .update({ phone: '', updated_at: new Date().toISOString() })
      .eq('id', cust.id);
  }
  return true;
}

(async () => {
  const opts = parseArgs(process.argv);
  if (opts.help) {
    usage();
    process.exit(0);
  }

  console.log('Opts:', JSON.stringify(opts));

  const { data: rows, error } = await supabase
    .from('facebook_contacts')
    .select('id, fb_name, phone, customer_id, lead_id, last_message_at')
    .not('psid', 'is', null)
    .order('last_message_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
    .range(opts.offset, opts.offset + opts.limit - 1);

  if (error) {
    console.error(error.message);
    process.exit(1);
  }

  const contacts = rows || [];
  console.log(`Loaded ${contacts.length} contacts.\n`);

  let cleared = 0;
  let normalized = 0;
  let filled = 0;
  let unchanged = 0;
  let custCleared = 0;
  let err = 0;

  for (let i = 0; i < contacts.length; i++) {
    const c = contacts[i];
    const raw = c.phone != null && String(c.phone).trim() !== '' ? String(c.phone).trim() : '';
    let action = 'unchanged';
    let nextVal = raw || null;

    try {
      let phoneAfter = raw;

      if (raw) {
        const v = validateVnSubscriberPhoneStored(raw);
        if (!v.valid) {
          action = 'clear_invalid';
          phoneAfter = '';
          nextVal = null;
          if (!opts.dryRun) {
            await supabase
              .from('facebook_contacts')
              .update({ phone: null, updated_at: new Date().toISOString() })
              .eq('id', c.id);
          }
          cleared += 1;
          if (opts.syncCustomerMatch) {
            const did = await clearCustomerIfSame(c.customer_id, raw, opts.dryRun);
            if (did) custCleared += 1;
          }
        } else if (v.normalized !== raw) {
          action = 'normalize';
          phoneAfter = v.normalized;
          nextVal = v.normalized;
          if (!opts.dryRun) {
            await supabase
              .from('facebook_contacts')
              .update({ phone: v.normalized, updated_at: new Date().toISOString() })
              .eq('id', c.id);
          }
          normalized += 1;
        }
      }

      if (opts.fillMissing && !phoneAfter) {
        const msgs = await loadInboundMessages(c.id);
        const info = extractInboundContactInfo(msgs, {});
        const v2 = validateVnSubscriberPhoneStored(info.phone);
        if (v2.valid) {
          action = raw ? 'replace_from_inbound_after_clear' : 'fill_missing';
          nextVal = v2.normalized;
          phoneAfter = v2.normalized;
          if (!opts.dryRun) {
            await supabase
              .from('facebook_contacts')
              .update({ phone: v2.normalized, updated_at: new Date().toISOString() })
              .eq('id', c.id);
          }
          filled += 1;
        }
      }

      if (action === 'unchanged') unchanged += 1;
      else {
        console.log(JSON.stringify({
          i: i + 1,
          id: c.id,
          name: c.fb_name,
          was: raw || null,
          action,
          now: nextVal,
        }));
      }
    } catch (e) {
      err += 1;
      console.error(`ERR ${c.id}:`, e.message);
    }
  }

  console.log('\n--- Summary ---');
  console.log('cleared_invalid:', cleared, 'normalized:', normalized, 'filled_from_inbound:', filled);
  console.log('unchanged:', unchanged, 'customer_phone_cleared:', custCleared, 'errors:', err);
  if (opts.dryRun) console.log('(dry-run: DB không ghi; filled/cleared/normalized = số thao tác sẽ làm)');
  process.exit(err > 0 ? 1 : 0);
})().catch((e) => {
  console.error('Fatal:', e);
  process.exit(1);
});
