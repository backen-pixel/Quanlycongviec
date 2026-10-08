'use strict';

// Pure module: removes personal data from a conversation BEFORE it can leave the system.
// Fail closed: if anything personal might remain, `safe` is false and the caller must not
// send the text to a model provider. Replacement labels never contain digits or '@'.
const LABELS = Object.freeze({
  phone: '{SO_DIEN_THOAI}', email: '{EMAIL}', link: '{LIEN_KET}',
  number: '{SO}', name: '{TEN_KHACH}', address: '{DIA_CHI}',
});

// 1:1 character folding (Vietnamese diacritics removed, lower case) so positions line up.
function foldChar(ch) {
  const f = ch.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();
  return f.length === 1 ? f : ch.toLowerCase().slice(0, 1);
}
const fold = text => Array.from(String(text ?? '')).map(foldChar).join('');

const EMAIL = /[a-z0-9._%+-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)+/gi;
const URL_LIKE = /(?:https?:\/\/|www\.|(?:m\.me|fb\.com|facebook\.com|zalo\.me|messenger\.com)\/)\S*/gi;
const PHONE = /(?<!\d)(?:\+?84|0)(?:[\s.\-]?\d){8,10}(?!\d)/g;
const LONG_DIGITS = /(?<![\d])\d(?:[\s.\-]?\d){5,}(?!\d)/g;
// A phone number spoken in words: six or more Vietnamese digit words in a row (matched on folded text).
const DIGIT_WORDS = /(?<![a-z])(?:(?:khong|mot|hai|ba|bon|tu|nam|sau|bay|tam|chin|muoi|linh)(?![a-z])[\s,.\-]*){6,}/g;
// A line that is only a short run of digits is the tail or head of a phone split across messages.
const DIGIT_ONLY_LINE = /(?<=^(?:KHACH|NHAN_VIEN): ?)\+?[\d\s.\-]{4,}$/gm;
// Street-level address typed by the customer (differs from the CRM address): house number, street, alley.
const STREET = [
  /(?<![a-z])so\s*nha\s*\d+[a-z0-9\/]*/g,
  /(?<![a-z0-9])\d+[a-z]?(?:\/\d+[a-z]?)*\s+(?:duong|pho|hem|ngo|ngach|ap|thon|khom)(?![a-z])(?:\s+[a-z0-9]+){0,3}/g,
  /(?<![a-z])(?:duong|pho|hem|ngo|ngach|ap|thon|khom|kdc|chung cu)\s+[a-z0-9\/]+(?:\s+[a-z0-9]+){0,3}/g,
];

function collect(text, regex, label, out) {
  for (const m of text.matchAll(regex)) out.push([m.index, m.index + m[0].length, label]);
}

const escapeRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function collectWords(folded, words, label, out) {
  for (const word of words) {
    const w = fold(word).trim();
    if (w.length < 3) continue;
    collect(folded, new RegExp(`(?<![a-z0-9])${escapeRe(w)}(?![a-z0-9])`, 'g'), label, out);
  }
}

// Earlier ranges win; overlapping ranges merge into the first label.
function applyRanges(original, ranges) {
  const sorted = ranges.filter(r => r[1] > r[0]).sort((a, b) => a[0] - b[0] || b[1] - a[1]);
  let out = '', cursor = 0;
  for (const [start, end, label] of sorted) {
    if (start < cursor) { cursor = Math.max(cursor, end); continue; }
    out += original.slice(cursor, start) + label;
    cursor = end;
  }
  return out + original.slice(cursor);
}

const lineOf = message =>
  `${message.direction === 'outbound' ? 'NHAN_VIEN' : 'KHACH'}: ${String(message.text).replace(/\s+/g, ' ').trim()}`;

function anonymizeConversation({ messages = [], customer = {}, maxMessages = 12, maxChars = 4000 } = {}) {
  const usable = (Array.isArray(messages) ? messages : [])
    .filter(m => m && typeof m.text === 'string' && m.text.trim() && ['inbound', 'outbound'].includes(m.direction))
    .slice(-maxMessages);
  const raw = usable.map(lineOf).join('\n');
  const folded = fold(raw);
  const ranges = [];
  collect(raw, EMAIL, LABELS.email, ranges);
  collect(raw, URL_LIKE, LABELS.link, ranges);
  collect(raw, PHONE, LABELS.phone, ranges);
  collect(raw, LONG_DIGITS, LABELS.number, ranges);
  collect(raw, DIGIT_ONLY_LINE, LABELS.number, ranges);
  collect(folded, DIGIT_WORDS, LABELS.phone, ranges);
  for (const street of STREET) collect(folded, street, LABELS.address, ranges);
  const fullName = String(customer.name ?? '');
  const nameParts = fullName.split(/\s+/).filter(Boolean);
  collectWords(folded, [fullName, ...nameParts], LABELS.name, ranges);
  const fullAddress = String(customer.address ?? '');
  const addressParts = fullAddress.split(/[,;\n]/).map(s => s.trim()).filter(s => s.length >= 5);
  collectWords(folded, [fullAddress, ...addressParts], LABELS.address, ranges);
  let text = applyRanges(raw, ranges);
  if (text.length > maxChars) {
    text = text.slice(text.length - maxChars);
    const firstLine = text.indexOf('\n');
    if (firstLine >= 0 && firstLine < 200) text = text.slice(firstLine + 1);
  }

  const reasons = [];
  if (/\d{9,}/.test(text.replace(/[\s.\-]/g, ''))) reasons.push('RESIDUAL_DIGITS');
  if (text.includes('@')) reasons.push('RESIDUAL_AT');
  if (/https?:|www\.|\.com\b|\.vn\b/i.test(text)) reasons.push('RESIDUAL_LINK');
  const foldedOut = fold(text);
  const stillThere = [fullName, ...nameParts].map(w => fold(w).trim()).filter(w => w.length >= 3)
    .some(w => new RegExp(`(?<![a-z0-9])${escapeRe(w)}(?![a-z0-9])`).test(foldedOut));
  if (stillThere) reasons.push('RESIDUAL_NAME');
  if (usable.length === 0) reasons.push('NO_MESSAGES');

  const last = nameParts.length ? nameParts[nameParts.length - 1] : '';
  return { text, placeholders: { name: last }, safe: reasons.length === 0, reasons, messageCount: usable.length };
}

// Local only: put the customer's short name back into a draft shown to staff.
function restore(text, placeholders = {}) {
  const name = typeof placeholders.name === 'string' ? placeholders.name.trim() : '';
  return name ? String(text).replaceAll(LABELS.name, name) : String(text);
}

module.exports = { anonymizeConversation, restore, LABELS };
