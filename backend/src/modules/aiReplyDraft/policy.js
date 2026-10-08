'use strict';

// Pure rules for AI-drafted replies. A draft that breaks any rule is dropped and never
// shown to staff. Staff still read and send manually; the AI never sends anything.
const MAX_DRAFT_CHARS = 600;
const fold = text => String(text ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();

const MONEY = [
  /\d[\d.,]*\s*(?:k|nghin|ngan|trieu|tr|ty|d|dong|vnd|%|phan tram)(?![a-z])/i,
  /\d{1,3}(?:[.,]\d{3})+/,
  /(?:giam|khuyen mai|uu dai|chiet khau)\s*\d+/i,
];
const DANGEROUS = [
  ['cam ket', /\bcam ket\b/], ['dam bao 100', /\bdam bao\s*100/], ['tuyet doi', /\btuyet doi\b/],
  ['mien phi', /\bmien phi\b/],
];
const ENGLISH_STOPWORDS = /\b(the|and|you|with|your|for|are|this|that|will|please)\b/g;

function buildSystemPrompt({ companyName = 'công ty', pilotFacts = [] } = {}) {
  const facts = (Array.isArray(pilotFacts) ? pilotFacts : []).map(f => String(f).trim()).filter(Boolean);
  return [
    `Bạn là trợ lý soạn NHÁP tin nhắn tư vấn tủ bếp cho ${companyName}. Nhân viên sẽ đọc, sửa và tự gửi.`,
    'Chỉ tư vấn nhu cầu và đề xuất đặt lịch khảo sát. Không báo giá, không hứa giảm giá, khuyến mãi, thời gian thi công hay bảo hành.',
    'Không nói mình là người thật. Không hỏi thẳng số điện thoại nếu khách chưa muốn; gợi ý để nhân viên xin.',
    `Viết tiếng Việt lịch sự, tối đa ${MAX_DRAFT_CHARS} ký tự, đúng một câu hỏi tiếp theo. Nhãn như {TEN_KHACH} giữ nguyên.`,
    facts.length ? `Chỉ được nêu các thông tin đã duyệt sau: ${facts.join(' | ')}` : 'Không có thông tin đã duyệt nào ngoài nội dung trên.',
  ].join('\n');
}

function validateDraft(text, { allowedFacts = [] } = {}) {
  const reasons = [];
  const body = typeof text === 'string' ? text.trim() : '';
  if (!body) return { ok: false, reasons: ['EMPTY'] };
  if (body.length > MAX_DRAFT_CHARS) reasons.push('TOO_LONG');
  const facts = fold((Array.isArray(allowedFacts) ? allowedFacts : []).join(' | '));
  const f = fold(body);
  const flat = f.replace(/[\s.\-]/g, '');
  if (/(?:\+?84|0)\d{8,10}/.test(flat) || /\d{9,}/.test(flat)) reasons.push('PII_LEAK');
  if (/[^\s@]+@[^\s@]+\.[a-z]{2,}/i.test(body)) reasons.push('PII_LEAK');
  if (/https?:|www\.|m\.me\/|facebook\.com|zalo\.me/i.test(body)) reasons.push('LINK');
  if ((body.match(/\{[A-Z_]+\}/g) || []).some(l => l !== '{TEN_KHACH}')) reasons.push('UNFILLED_PLACEHOLDER');
  for (const re of MONEY) {
    const hit = f.match(re);
    if (hit && !facts.includes(hit[0].trim())) { reasons.push('PRICE_MENTION'); break; }
  }
  for (const [word, re] of DANGEROUS) if (re.test(f) && !facts.includes(word)) reasons.push('RISKY_PROMISE');
  if (/nguoi that|khong phai\s+(?:la\s+)?(?:ai|robot|bot)\b|con nguoi that/.test(f)) reasons.push('IDENTITY_CLAIM');
  if (/\b(system prompt|ignore (?:all|previous)|as an ai|openai|chatgpt|gpt)\b/.test(f)) reasons.push('PROMPT_LEAK');
  if ((f.match(ENGLISH_STOPWORDS) || []).length >= 3) reasons.push('NOT_VIETNAMESE');
  const unique = [...new Set(reasons)];
  return { ok: unique.length === 0, reasons: unique };
}

module.exports = { MAX_DRAFT_CHARS, buildSystemPrompt, validateDraft };
