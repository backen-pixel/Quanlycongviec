#!/usr/bin/env node
/**
 * Quét lại SĐT từ tin nhắn Facebook của KH (inbound), không đọc tin page/outbound.
 * extractContactInfo đã loại bỏ URL (http, m.me, zalo.me, …) trước khi tách SĐT.
 *
 * Thứ tự xử lý: hoạt động mới nhất → cũ (max(last_message_at, created_at)), giống danh bạ.
 *
 * Chạy từ thư mục backend:
 *   node scripts/rescan-fb-inbound-phones.js --limit 50
 *   node scripts/rescan-fb-inbound-phones.js --limit 100 --filter all --replace
 *   node scripts/rescan-fb-inbound-phones.js --limit 20 --filter missing --dry-run
 *
 * Tham số:
 *   --limit N      Số contact xử lý (mặc định 50)
 *   --offset N     Bỏ qua N contact đầu sau khi sort mới→cũ (theo hoạt động)
 *   --filter all|missing|has   all = cả có/không SĐT; missing = chưa có SĐT; has = đã có SĐT
 *   --replace      Ghi đè SĐT contact + KH + mô tả lead khi quét được số mới khác số đang lưu
 *   --clear-phone-if-not-found  Quét không thấy SĐT inbound mới → xóa SĐT cũ trên contact (+ KH trùng chuỗi, gỡ dòng SĐT trong mô tả lead)
 *   --delete-lead-without-phone Sau bước trên, contact không còn SĐT mà vẫn có lead → xóa lead (chỉ type=lead,
 *                  không project, không báo giá/đơn, không lead con; không xóa nếu lead còn gắn contact khác)
 *   --dry-run      Chỉ in kết quả, không ghi DB
 *   --messages N   Số tin inbound tối đa mỗi contact (mặc định 1600, tối đa 3200)
 *
 * SĐT quét được trùng SĐT đang lưu → bỏ qua (không ghi DB).
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { supabase } = require('../src/config/supabase');
const { extractInboundContactInfo } = require('../src/helpers/facebookPhoneExtract');
const { sortFacebookContactsNewestFirst } = require('../src/helpers/facebookContactActivity');
const { deleteLeadIfAllowedForRescan } = require('../src/helpers/facebookLeadDeleteWhenNoPhone');

function usage() {
  console.log(`
Usage: node scripts/rescan-fb-inbound-phones.js [options]

Options:
  --limit N        Contacts to process (default 50)
  --offset N       Skip first N after newest-first activity sort (default 0)
  --filter MODE    all | missing | has  (default all)
  --replace                   Overwrite stored phone when inbound scan finds a different valid VN number
  --clear-phone-if-not-found  No new inbound phone → clear stored phone on contact
  --delete-lead-without-phone Delete CRM lead when contact ends with no phone (guarded)
  --dry-run                   Print actions only
  --messages N                Max inbound messages per contact (default 1600, max 3200)
  --help                      Show help
`);
}

function parseArgs(argv) {
  const out = {
    limit: 50,
    offset: 0,
    filter: 'all',
    replace: false,
    clearPhoneIfNotFound: false,
    deleteLeadWithoutPhone: false,
    dryRun: false,
    messages: 1600,
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') { out.help = true; continue; }
    if (a === '--replace') { out.replace = true; continue; }
    if (a === '--clear-phone-if-not-found') { out.clearPhoneIfNotFound = true; continue; }
    if (a === '--delete-lead-without-phone') { out.deleteLeadWithoutPhone = true; continue; }
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
  // Gom đủ contact khớp filter rồi sort theo hoạt động mới nhất; --offset áp sau sort (không theo thứ tự trang DB).
  const target = Math.min(20_000, Math.max(offset + limit + 400, 600));

  while (pool.length < target) {
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
      pool.push(c);
    }
    dbOffset += page;
    if (data.length < page) break;
  }
  const sorted = sortFacebookContactsNewestFirst(pool);
  return sorted.slice(offset, offset + limit);
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

function stripStoredPhonesFromLeadDescription(desc) {
  let d = desc || '';
  d = d.replace(/\n?SĐT khác:\s*[^\n]*/gi, '');
  d = d.replace(/SĐT:\s*\S+/g, 'SĐT:');
  return d.replace(/\n{3,}/g, '\n\n').trim();
}

async function loadLeadAndCustomer(contact) {
  let lead = null;
  let cust = null;
  if (contact.lead_id) {
    const { data: ld } = await supabase
      .from('crm_leads')
      .select('id, customer_id, description, install_address, title, type, project_id, parent_lead_id')
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

  const oldPhone = contact.phone && String(contact.phone).trim() ? String(contact.phone).trim() : null;
  const { lead, cust } = await loadLeadAndCustomer(contact);

  const row = {
    contact_id: contact.id,
    name: contact.fb_name,
    inbound_count: inboundMsgs.length,
    old_phone: oldPhone,
    scanned_phone: extractedPhone,
    action: 'skip',
  };

  // Trùng SĐT quét được với SĐT đang lưu → không làm gì
  if (extractedPhone && oldPhone && phonesEqual(oldPhone, extractedPhone)) {
    row.action = 'skip_duplicate_phone';
    return row;
  }

  const hasExtracted = !!(extractedPhone || extractedAddress || extraPhones.length);
  const wantClear = opts.clearPhoneIfNotFound && !extractedPhone && oldPhone;
  const wantDeleteOnly = !!(opts.deleteLeadWithoutPhone && !oldPhone && !extractedPhone && contact.lead_id);
  const wantAnyWork = hasExtracted || wantClear || wantDeleteOnly;

  if (!wantAnyWork) {
    row.action = 'no_inbound_info';
    return row;
  }

  let shouldWriteContactPhone = false;
  let newContactPhone = oldPhone;
  if (extractedPhone) {
    if (!oldPhone) {
      shouldWriteContactPhone = true;
      newContactPhone = extractedPhone;
    } else if (opts.replace && !phonesEqual(oldPhone, extractedPhone)) {
      shouldWriteContactPhone = true;
      newContactPhone = extractedPhone;
    }
  } else if (wantClear) {
    shouldWriteContactPhone = true;
    newContactPhone = null;
  }

  const effectivePhoneForDesc = newContactPhone || extractedPhone || oldPhone || null;

  if (opts.dryRun) {
    if (shouldWriteContactPhone && newContactPhone) row.action = 'would_update_contact_phone';
    else if (shouldWriteContactPhone && !newContactPhone) row.action = 'would_clear_contact_phone';
    else if (extractedAddress || extraPhones.length) row.action = 'would_update_meta_only';
    else if (wantDeleteOnly) row.action = 'would_delete_lead_no_phone';
    else row.action = 'dry_run_noop';
    if (opts.deleteLeadWithoutPhone && !newContactPhone && contact.lead_id) {
      row.would_try_delete_lead = true;
    }
    return row;
  }

  if (shouldWriteContactPhone) {
    const { error: e1 } = await supabase
      .from('facebook_contacts')
      .update({
        phone: newContactPhone,
        updated_at: new Date().toISOString(),
      })
      .eq('id', contact.id);
    if (e1) throw e1;
    row.action = newContactPhone ? 'updated_contact_phone' : 'cleared_contact_phone';
  }

  const leadCustId = lead?.customer_id || contact.customer_id;

  if (wantClear && oldPhone && leadCustId) {
    const custPhoneStr = cust?.phone != null ? String(cust.phone).trim() : '';
    if (custPhoneStr && custPhoneStr === oldPhone) {
      const { error: ec } = await supabase
        .from('customers')
        .update({ phone: '', updated_at: new Date().toISOString() })
        .eq('id', leadCustId);
      if (ec) throw ec;
      row.customer_phone_cleared = true;
    }
  }

  if (leadCustId) {
    const custUpd = {};
    if (extractedPhone) {
      const custPhoneEmpty = !cust?.phone || !String(cust.phone).trim();
      if (custPhoneEmpty || opts.replace) {
        if (!phonesEqual(cust?.phone, extractedPhone)) custUpd.phone = extractedPhone;
      }
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
    let newDesc;
    if (wantClear && !extractedPhone) {
      newDesc = stripStoredPhonesFromLeadDescription(lead.description || '');
      if (extractedAddress) {
        newDesc = mergeLeadDescription({ ...lead, description: newDesc }, null, extractedAddress, []);
      }
    } else {
      newDesc = mergeLeadDescription(lead, effectivePhoneForDesc, extractedAddress, extraPhones);
    }
    if (newDesc !== (lead.description || '')) leadUpd.description = newDesc;
    if (Object.keys(leadUpd).length > 1) {
      const { error: e3 } = await supabase.from('crm_leads').update(leadUpd).eq('id', contact.lead_id);
      if (e3) throw e3;
      row.lead_updated = true;
    }
  }

  if (opts.deleteLeadWithoutPhone && !newContactPhone && contact.lead_id) {
    const del = await deleteLeadIfAllowedForRescan(supabase, contact.lead_id, contact.id);
    row.lead_delete = del;
    if (del.ok) row.action = row.action === 'cleared_contact_phone' ? 'cleared_phone_and_deleted_lead' : 'deleted_lead_no_phone';
  }

  if (row.action === 'skip' && (row.customer_updated || row.lead_updated || row.customer_phone_cleared)) {
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
