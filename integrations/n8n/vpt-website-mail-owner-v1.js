'use strict';

const META_KEY = '_vptWebsiteMailOwnerV1';

// Self-contained: this exact function is embedded in the n8n Code node below.
// The markers select the sole-writer transport. They are not authentication,
// a durable capture, CRM receipt, successful delivery, or lead qualification.
function classifyVptWebsiteMail(mail) {
  const result = (route, reason) => ({ version: 1, route, reason });
  const unreadable = () => result('hold', 'mail_shape_unreadable');
  if (!mail || typeof mail !== 'object' || Array.isArray(mail)) return unreadable();
  if (typeof mail.text !== 'string' || mail.text.length > 2097152) return unreadable();

  let subject;
  if (Object.prototype.hasOwnProperty.call(mail, 'subject')) {
    // Prefer Gmail's parsed Subject; do not infer it from customer body text.
    subject = mail.subject;
  } else {
    // Also support Gmail API-style header fixtures when no parsed Subject exists.
    const headers = mail.payload && Array.isArray(mail.payload.headers)
      ? mail.payload.headers : mail.headers;
    if (Array.isArray(headers)) {
      const matches = headers.filter(h => h && typeof h.name === 'string'
        && h.name.toLowerCase() === 'subject');
      if (matches.length !== 1) return unreadable();
      subject = matches[0].value;
    } else if (headers && typeof headers === 'object') {
      const names = Object.keys(headers).filter(k => k.toLowerCase() === 'subject');
      if (names.length !== 1) return unreadable();
      subject = headers[names[0]];
      if (typeof subject === 'string') subject = subject.replace(/^subject:[ \t]*/i, '');
    } else return unreadable();
  }
  if (typeof subject !== 'string' || subject.length > 4096 || /[\r\n]/.test(subject)) return unreadable();

  const prefix = '[VPT V1] Tư vấn tủ bếp / thiết bị — ';
  const formLine = 'Mã form: VPT_V1';
  const normalizedSubject = subject.normalize('NFC');
  const lines = mail.text.normalize('NFC').split(/\r\n|\r|\n/);
  const exactSubject = normalizedSubject.startsWith(prefix) && normalizedSubject.length > prefix.length;
  const exactFormLines = lines.filter(line => line === formLine).length;
  // Broader signals only HOLD malformed/quoted/ambiguous variants; they never
  // turn an email into a confirmed submission or grant a fallback POST.
  const visible = value => value.replace(/[\u200B-\u200D\u2060\uFEFF]/g, '');
  const subjectSignals = visible(normalizedSubject).match(/\[\s*vpt[\s_-]*v1\s*\]/giu) || [];
  const formSignals = visible(lines.join('\n')).match(/(?:mã|ma)\s*form\s*[:：]\s*vpt[\s_-]*v1/giu) || [];
  if (exactSubject && exactFormLines === 1 && subjectSignals.length === 1 && formSignals.length === 1) {
    return result('hold', 'bridge_form_reconcile_required');
  }
  if (exactSubject || exactFormLines || subjectSignals.length || formSignals.length) {
    return result('hold', 'ambiguous_bridge_markers');
  }
  return result('legacy', 'no_bridge_markers');
}

function getN8nCode() {
  return `const classifyVptWebsiteMail = ${classifyVptWebsiteMail.toString()};
const metadataKey = ${JSON.stringify(META_KEY)};
return $input.all().map((item, index) => {
  if (!item || !item.json || typeof item.json !== 'object' || Array.isArray(item.json)
      || Object.prototype.hasOwnProperty.call(item.json, metadataKey)) {
    throw new Error('VPT_MAIL_OWNER_INPUT_INVALID');
  }
  return { ...item, json: { ...item.json, [metadataKey]: classifyVptWebsiteMail(item.json) },
    pairedItem: { item: index } };
});`;
}

module.exports = { META_KEY, classifyVptWebsiteMail, getN8nCode };
