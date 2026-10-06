'use strict';

// CRM owns intake policy. Provider text is data, never a routing/permission command.
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const fail = code => Object.assign(new Error(code), { code });
const id = value => typeof value === 'string' && /^\d{1,32}$/.test(value);
const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

function intakeIdentity(pageId, payload, lease) {
  const value = payload?.event?.value;
  if (!id(pageId) || payload?.kind !== 'change' || payload?.event?.field !== 'leadgen'
      || !object(value) || !id(value.leadgen_id) || !id(value.form_id)
      || (value.page_id !== undefined && value.page_id !== pageId)
      || (value.ad_id !== undefined && !id(value.ad_id))
      || !uuid(lease?.inboxId) || !uuid(lease?.leaseToken)) throw fail('FB_INBOX_LEAD_IDENTITY_INVALID');
  return { pageId, formId: value.form_id, leadgenId: value.leadgen_id, adId: value.ad_id || null };
}

function validateProvider(identity, data) {
  if (!object(data) || data.id !== identity.leadgenId || data.form_id !== identity.formId
      || data.form_page_id !== identity.pageId || !Array.isArray(data.field_data)
      || data.field_data.length > 100 || !data.field_data.length
      || (identity.adId && data.ad_id !== identity.adId)) throw fail('FB_INBOX_PROVIDER_IDENTITY_MISMATCH');
  for (const key of ['ad_id', 'adset_id', 'campaign_id']) {
    if (data[key] != null && !id(data[key])) throw fail('FB_INBOX_PROVIDER_IDENTITY_MISMATCH');
  }
  if (data.is_organic != null && typeof data.is_organic !== 'boolean') throw fail('FB_INBOX_PROVIDER_DATA_INVALID');
  if (data.created_time != null && (typeof data.created_time !== 'string' || !Number.isFinite(Date.parse(data.created_time)))) {
    throw fail('FB_INBOX_PROVIDER_DATA_INVALID');
  }
  return data;
}

function prepareLead(data, mapping) {
  if (mapping != null && !object(mapping)) throw fail('FB_INBOX_FORM_MAPPING_INVALID');
  const fields = Object.create(null);
  for (const item of data.field_data) {
    if (!object(item) || typeof item.name !== 'string' || !item.name.trim() || item.name.length > 255
        || Object.hasOwn(fields, item.name) || !Array.isArray(item.values) || !item.values.length
        || item.values.length > 20 || item.values.some(value => typeof value !== 'string' || value.length > 2000)) {
      throw fail('FB_INBOX_PROVIDER_DATA_INVALID');
    }
    fields[item.name] = item.values.join('; ').trim();
  }
  const read = (key, standard) => {
    if (mapping?.[key] !== undefined) {
      if (typeof mapping[key] !== 'string' || !mapping[key].trim() || !Object.hasOwn(fields, mapping[key])) {
        throw fail('FB_INBOX_FORM_MAPPING_INVALID');
      }
      return fields[mapping[key]];
    }
    return fields[standard] || '';
  };
  const fullName = read('ho_ten', 'full_name') || [fields.first_name, fields.last_name].filter(Boolean).join(' ');
  const phoneRaw = read('sdt', 'phone_number');
  // This first lane supports Vietnamese ten-digit numbers. Ambiguous/international
  // numbers remain pending for review; URL/ID fragments are never guessed as phones.
  if (!/^[+\d\s().-]+$/.test(phoneRaw)) throw fail('FB_INBOX_LEAD_PHONE_REVIEW_REQUIRED');
  let phone = phoneRaw.replace(/\D/g, '');
  if (phone.startsWith('84') && phone.length === 11) phone = '0' + phone.slice(2);
  if (!/^0[1-9]\d{8}$/.test(phone)) throw fail('FB_INBOX_LEAD_PHONE_REVIEW_REQUIRED');
  if (!fullName || fullName.length > 255) throw fail('FB_INBOX_LEAD_NAME_REQUIRED');
  const email = read('email', 'email');
  if (email.length > 255 || (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) throw fail('FB_INBOX_LEAD_EMAIL_INVALID');
  return {
    full_name: fullName, phone, email: email || null, field_data: fields,
    description: Object.entries(fields).map(([key, value]) => `${key}: ${value}`).join('\n'),
  };
}

module.exports = { object, fail, id, uuid, intakeIdentity, validateProvider, prepareLead };
