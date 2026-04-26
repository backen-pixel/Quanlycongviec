#!/usr/bin/env node
/**
 * Quét lại SĐT từ tin nhắn Facebook của KH (inbound), không đọc tin page/outbound.
 * extractContactInfo đã loại bỏ URL (http, m.me, zalo.me, …) trước khi tách SĐT.
 *
 * Chạy từ thư mục backend:
 *   node scripts/rescan-fb-inbound-phones.js --limit 50
 *   node scripts/rescan-fb-inbound-phones.js --limit 100 --filter all --replace
 *   node scripts/rescan-fb-inbound-phones.js --limit 20 --filter missing --dry-run
 *
 * Tham số:
 *   --limit N      Số contact xử lý (mặc định 50)
 *   --offset N     Bỏ qua N contact khớp filter (theo thứ tự hoạt động mới nhất)
 *   --filter all|missing|has   all = cả có/không SĐT; missing = chưa có SĐT; has = đã có SĐT
 *   --replace      Ghi đè SĐT contact + KH + mô tả lead khi quét được số mới khác số đang lưu
 *   --dry-run      Chỉ in kết quả, không ghi DB
 *   --messages N   Số tin inbound tối đa mỗi contact (mặc định 1600, tối đa 3200)
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { supabase } = require('../src/config/supabase');
const { extractInboundContactInfo } = require('../src/helpers/facebookPhoneExtract');

function usage() {
  console.log(`
Usage: node scripts/rescan-fb-inbound-phones.js [options]

Options:
  --limit N        Contacts to process (default 50)
  --offset N       Skip first N matching contacts (default 0)
  --filter MODE    all | missing | has  (default all)
  --replace        Overwrite stored phone when inbound scan finds a different valid VN number
  --dry-run        Print actions only
  --messages N     Max inbound messages per contact (default 1600, max 3200)
  --help           Show help
`);
}

function parseArgs(argv) {
  const out = {
    limit: 50,
    offset: 0,
    filter: 'all',
    replace: false,
    dryRun: false,
    messages: 1600,
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') { out.help = true; continue; }
    if (a === '--replace') { out.replace = true; continue; }
    if (a === '--dry-run') { out.dryRun = true; continue; }
    const next = () => (argv[++i] || '');
    if (a === '--limit') out.limit = Math.max(1, parseInt(next(), 10) || 50);
    else if (a === '--offset') out.offset = Math.max(0, parseInt(next(), 10) || 0);
    else if (a === '--filter') out.filter = String(next()).toLowerCase();
    else if (a === '--messages') out.messages = Math.min(3200, Math.max(100, parseInt(next(), 10) || 1600));
    else console.warn('Unknown arg:', a);
  }
  if (!['all', 'missing', 'has'].includes(out.filter)) {
    console.error('Invalid --filter, use all|missing|has');
    process.exit(1);
  }
  return out;
}

function hasMeaningfulPhone(p) {
  const s = String(p || '').replace(/\D/g, '');
  return s.length >= 9;
}

function normalizeDigits(p) {
  let d = String(p || '').replace(/\D/g, '');
  if (d.startsWith('84') && d.length >= 10) d = '0' + d.slice(2);
  if (d.startsWith('0084')) d = '0' + d.slice(4);
  return d;
}

function phonesEqual(a, b) {
  return normalizeDigits(a) === normalizeDigits(b) && normalizeDigits(a).length >= 9;
}

async function fetchContactsMatching(opts) {
  const { limit, offset, filter } = opts;
  const pool = [];
  let dbOffset = 0;
  const page = 250;
  let skipped = 0;

  while (pool.length < limit) {
    const { data, error } = await supabase
      .from('facebook_contacts')
      .select('id, fb_name, phone, lead_id, customer_id, last_message_at, created_at')
      .not('psid', 'is', null)
      .order('last_message_at', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })
      .range(dbOffset, dbOffset + page - 1);

    if (error) throw error;
    if (!data?.length) break;

    for (const c of data) {
      const hasP = hasMeaningfulPhone(c.phone);
      if (filter === 'missing' && hasP) continue;
      if (filter === 'has' && !hasP) continue;
      if (skipped < offset) {
        skipped += 1;
        continue;
      }
      pool.push(c);
      if (pool.length >= limit) break;
    }
    dbOffset += page;
    if (data.length < page) break;
  }
  return pool;
}

async function loadInboundMessages(contactId, maxRows) {
  const PAGE = 800;
  const rows = [];
  for (let from = 0; from < maxRows; from += PAGE) {
    const to = Math.min(from + PAGE - 1, maxRows - 1);
    const { data, error } = await supabase
      .from('facebook_messages')
      .select('id, content, direction, created_at')
      .eq('contact_id', contactId)
      .eq('direction', 'inbound')
      .order('created_at', { ascending: false })
      .range(from, to);
    if (error) throw error;
    if (!data?.length) break;
    rows.push(...data);
    if (data.length < PAGE) break;
  }
  return rows;
}

async function loadLeadAndCustomer(contact) {
  let lead = null;
  let cust = null;
  if (contact.lead_id) {
    const { data: ld } = await supabase
      .from('crm_leads')
      .select('id, customer_id, description, install_address, title')
      .eq('id', contact.lead_id)
      .maybeSingle();
    lead = ld;
    if (lead?.customer_id) {
      const { data: c } = await supabase
        .from('customers')
        .select('id, phone, address')
        .eq('id', lead.customer_id)
        .maybeSingle();
      cust = c;
    }
  }
  if (!cust && contact.customer_id) {
    const { data: c2 } = await supabase
      .from('customers')
      .select('id, phone, address')
      .eq('id', contact.customer_id)
      .maybeSingle();
    cust = c2;
  }
  return { lead, cust };
}

function mergeLeadDescription(lead, effectivePhone, extractedAddress, extraPhones) {
  let desc = lead.description || '';
  if (effectivePhone) {
    if (/SĐT:/.test(desc)) {
      const oldMatch = desc.match(/SĐT:\s*(\S*)/);
      if (!oldMatch?.[1] || oldMatch[1] !== effectivePhone) {
        desc = desc.replace(/SĐT:.*$/m, `SĐT: ${effectivePhone}`);
      }
    } else {
      desc = `${desc.trimEnd()}\nSĐT: ${effectivePhone}`.trim();
    }
  }
  if (extractedAddress) {
    if (/Địa chỉ:/.test(desc)) desc = desc.replace(/Địa chỉ:.*$/m, `Địa chỉ: ${extractedAddress}`);
    else desc = `${desc.trimEnd()}\nĐịa chỉ: ${extractedAddress}`.trim();
  }
  if (extraPhones?.length) {
    if (/SĐT khác:/.test(desc)) desc = desc.replace(/SĐT khác:.*$/m, `SĐT khác: ${extraPhones.join(', ')}`);
    else desc = `${desc.trimEnd()}\nSĐT khác: ${extraPhones.join(', ')}`.trim();
  }
  return desc;
}

async function applyOne(contact, opts) {
  const inboundMsgs = await loadInboundMessages(contact.id, opts.messages);
  const info = extractInboundContactInfo(inboundMsgs, {});
  const extractedPhone = info.phone || null;
  const extractedAddress = info.address || null;
  const extraPhones = info.extraPhones || [];

  const oldPhone = contact.phone && String(contact.phone).trim() ? contact.phone : null;
  const { lead, cust } = await loadLeadAndCustomer(contact);

  let shouldWriteContact = false;
  if (extractedPhone) {
    if (!oldPhone) shouldWriteContact = true;
    else if (opts.replace && !phonesEqual(oldPhone, extractedPhone)) shouldWriteContact = true;
  }

  const effectivePhone = extractedPhone || oldPhone || null;

  const row = {
    contact_id: contact.id,
    name: contact.fb_name,
    inbound_count: inboundMsgs.length,
    old_phone: oldPhone,
    scanned_phone: extractedPhone,
    action: 'skip',
  };

  if (!extractedPhone && !extractedAddress && !extraPhones.length) {
    row.action = 'no_inbound_info';
    return row;
  }

  if (!shouldWriteContact && !extractedAddress && !extraPhones.length) {
    row.action = extractedPhone ? 'unchanged_phone' : 'no_phone_change';
    return row;
  }

  if (opts.dryRun) {
    row.action = shouldWriteContact ? 'would_update_contact' : 'would_update_meta_only';
    return row;
  }

  if (shouldWriteContact && extractedPhone) {
    const { error: e1 } = await supabase
      .from('facebook_contacts')
      .update({ phone: extractedPhone, updated_at: new Date().toISOString() })
      .eq('id', contact.id);
    if (e1) throw e1;
    row.action = 'updated_contact_phone';
  }

  const leadCustId = lead?.customer_id || contact.customer_id;
  if (leadCustId && extractedPhone) {
    const custUpd = {};
    const custPhoneEmpty = !cust?.phone || !String(cust.phone).trim();
    if (custPhoneEmpty || opts.replace) {
      if (!phonesEqual(cust?.phone, extractedPhone)) custUpd.phone = extractedPhone;
    }
    if (extractedAddress && extractedAddress !== cust?.address) custUpd.address = extractedAddress;
    if (Object.keys(custUpd).length) {
      const { error: e2 } = await supabase.from('customers').update(custUpd).eq('id', leadCustId);
      if (e2) throw e2;
      row.customer_updated = true;
    }
  }

  if (lead && contact.lead_id) {
    const leadUpd = { updated_at: new Date().toISOString() };
    if (extractedAddress && extractedAddress !== lead.install_address) {
      leadUpd.install_address = extractedAddress;
    }
    const newDesc = mergeLeadDescription(lead, effectivePhone, extractedAddress, extraPhones);
    if (newDesc !== (lead.description || '')) leadUpd.description = newDesc;
    if (Object.keys(leadUpd).length > 1) {
      const { error: e3 } = await supabase.from('crm_leads').update(leadUpd).eq('id', contact.lead_id);
      if (e3) throw e3;
      row.lead_updated = true;
    }
  }

  if (row.action === 'skip' && (row.customer_updated || row.lead_updated)) {
    row.action = 'updated_crm_only';
  }
  return row;
}

(async () => {
  const opts = parseArgs(process.argv);
  if (opts.help) {
    usage();
    process.exit(0);
  }

  console.log('Opts:', JSON.stringify(opts, null, 2));
  const contacts = await fetchContactsMatching(opts);
  console.log(`Loaded ${contacts.length} contacts (filter=${opts.filter}, offset=${opts.offset}).\n`);

  let ok = 0;
  let err = 0;
  for (let i = 0; i < contacts.length; i++) {
    const c = contacts[i];
    process.stdout.write(`[${i + 1}/${contacts.length}] ${c.fb_name || c.id} ... `);
    try {
      const r = await applyOne(c, opts);
      console.log(JSON.stringify(r));
      ok += 1;
    } catch (e) {
      err += 1;
      console.log('ERROR:', e.message);
    }
  }
  console.log(`\nDone. OK=${ok} ERR=${err}${opts.dryRun ? ' (dry-run)' : ''}`);
  process.exit(err > 0 ? 1 : 0);
})().catch((e) => {
  console.error('Fatal:', e);
  process.exit(1);
});
