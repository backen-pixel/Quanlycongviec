/**
 * Sinh kho kiến thức TRANG CHI TIẾT LEAD / DEAL từ tài liệu nghiệp vụ.
 *
 *     node scripts/guide/generate-lead-detail.js
 *     (hoặc: npm run guide:lead-detail)
 *
 * Nguồn: E:\CRMtb\ba\ba\KIEN_THUC_TRANG_CHI_TIET_LEAD_DEAL.md — tài liệu do bên nghiệp vụ viết,
 * 984 dòng, mô tả từng vùng UI và thao tác từng bước theo đúng nhãn nút đang chạy.
 *
 * VÌ SAO SINH CHỨ KHÔNG CHÉP TAY: tài liệu này sẽ còn sửa (đổi nhãn nút, thêm tab). Chép tay một
 * lần là từ đó trở đi kho kiến thức và tài liệu trôi khỏi nhau, mà trôi thì không ai phát hiện —
 * trợ lý cứ hướng dẫn theo nhãn nút của năm ngoái.
 *
 * BA QUYẾT ĐỊNH:
 *
 * 1. CẮT THEO "#### " CHỨ KHÔNG THEO "## ". Mục `## 1. Header` dài 90 dòng và gộp cả chục việc
 *    khác nhau; ai hỏi "làm sao trả deal về lead" mà nhận nguyên mục đó thì phải tự dò. Mỗi khối
 *    `####` là ĐÚNG MỘT việc có các bước đánh số — đó mới là đơn vị người ta hỏi.
 *
 * 2. `actions` LẤY TỪ CÁC BƯỚC ĐÁNH SỐ. Trường này có trọng số 4 khi chấm điểm (chỉ sau
 *    `keywords`), nên nhét đúng câu lệnh thao tác vào đây thì câu hỏi dạng "làm sao …" khớp trúng.
 *
 * 3. BẢNG MARKDOWN GIỮ LẠI, ép về một dòng "cột — cột". Phần lớn tri thức phân biệt (tab nào làm
 *    gì, nút nào hiện khi nào) nằm trong bảng; bỏ bảng là bỏ đúng phần đắt nhất của tài liệu.
 */

const fs = require('fs');
const path = require('path');

const SOURCE_MD = process.env.LEAD_DETAIL_MD
  || path.join('E:', 'CRMtb', 'ba', 'ba', 'KIEN_THUC_TRANG_CHI_TIET_LEAD_DEAL.md');
const OUT = path.join(__dirname, '..', '..', 'backend', 'data', 'guide-knowledge', 'lead-detail.json');

const PAGE_PATH = '/crm/leads/:id';
const MENU = 'CRM → Bán hàng';
/** Trần độ dài `content`. Tool trả tối đa 5 kết quả — dài quá là một lần tra cứu nuốt cả ngữ cảnh. */
const MAX_CONTENT_LEN = 1100;

/* ─────────────────────────── Công cụ chữ ─────────────────────────── */

const COMBINING = new RegExp('[\\u0300-\\u036f]', 'g');

function fold(s) {
  return String(s || '')
    .normalize('NFD').replace(COMBINING, '')
    .replace(/đ/g, 'd').replace(/Đ/g, 'D')
    .toLowerCase().trim();
}

function slug(s) {
  return fold(s).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
}

/** Bỏ cú pháp markdown, giữ chữ. */
function clean(s) {
  return String(s || '')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/\*\*([^*]*)\*\*/g, '$1')
    .replace(/\*([^*]*)\*/g, '$1')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Một dòng bảng markdown → "a — b — c". Bỏ dòng kẻ `|---|`. */
function tableRow(d) {
  const o = d.split('|').map((x) => clean(x)).filter((x) => x !== '');
  if (!o.length || o.every((x) => /^:?-+:?$/.test(x))) return '';
  return o.join(' — ');
}

/** Nhãn in đậm trong một đoạn chữ — thường là TÊN NÚT thật trên phần mềm. */
function boldLabels(raw) {
  const out = [];
  const re = /\*\*([^*\n]{2,40})\*\*/g;
  let m = re.exec(raw);
  while (m) {
    const t = m[1].trim().replace(/[:.,]$/, '');
    // Bỏ các nhãn cấu trúc của tài liệu — chúng in đậm nhưng không phải tên nút.
    const rac = /^(Chức năng|Tác dụng|Mục đích|Mục tiêu|Nhãn UI|Tooltip|Tour|Lưu ý|Ví dụ|Badge|trước|của bạn|vào|người|một đơn)$/i;
    if (t && !/^\d+\.?$/.test(t) && !rac.test(t) && !out.includes(t)) out.push(t);
    m = re.exec(raw);
  }
  return out;
}

/**
 * Chuyển thân một khối thành chữ phẳng: bỏ tiêu đề, giữ bảng, giữ gạch đầu dòng và bước đánh số.
 */
function blockText(raw) {
  const lines = [];
  for (const d0 of raw.split('\n')) {
    const d = d0.trim();
    if (!d || d.startsWith('#') || d.startsWith('---')) continue;
    if (d.startsWith('|')) { const b = tableRow(d); if (b) lines.push(b); continue; }
    if (d.startsWith('>')) { lines.push(clean(d.slice(1))); continue; }
    lines.push(clean(d.replace(/^[-*]\s+/, '• ').replace(/^\d+\.\s+/, '')));
  }
  return lines.filter(Boolean).join('\n');
}

/** Các bước đánh số (1. 2. 3.) trong một khối — thứ đi vào `actions`. */
function numberedSteps(raw) {
  const out = [];
  for (const d0 of raw.split('\n')) {
    const d = d0.trim();
    const m = /^\d+\.\s+(.{3,})$/.exec(d);
    if (m) out.push({ label: clean(m[1]).slice(0, 140) });
  }
  return out.slice(0, 12);
}

/* ─────────────────────────── Cắt tài liệu ─────────────────────────── */

function splitBlocks(md) {
  const blocks = [];
  // Cắt ở "## " (mục lớn), rồi trong mỗi mục cắt tiếp ở "#### " (một việc cụ thể).
  const sections = md.split(/\n(?=## )/).slice(1);
  for (const section of sections) {
    const sectionName = clean((/^##\s+(.+)$/m.exec(section) || [])[1] || '').replace(/^\d+\.\s*/, '');
    /**
     * BỎ HẲN vài mục — chúng là NAM CHÂM hút mọi câu hỏi.
     *
     * "Checklist tự kiểm" liệt kê tên của gần như mọi nút và mọi tab trong tài liệu, nên nó khớp
     * với bất cứ câu hỏi nào và đứng hạng nhất. Đã đo: "trả deal về lead thì mất dự án SX không"
     * và "xưởng không thấy file" đều rơi vào nó, đẩy bản ghi đúng xuống hạng hai.
     *
     * Nó cũng không phải tri thức để trả lời — nó là bài tự kiểm cho người học.
     */
    if (!sectionName || /^(Liên kết đào tạo|Checklist tự kiểm)/i.test(sectionName)) continue;

    /**
     * TÁCH RIÊNG mấy khối `###` mang tri thức TRIỆU CHỨNG.
     *
     * "Lỗi hay gặp", "Phân biệt nhanh"… trong tài liệu nằm SAU các khối `####`, nên cắt theo
     * `####` là chúng dính vào khối cuối cùng — sai chỗ hẳn. Đã đo: câu "upload hợp đồng rồi mà
     * xưởng bảo không thấy file" trượt sạch top-5, vì đúng câu trả lời của nó ("Upload HĐ nhưng
     * không share SX → xưởng báo thiếu file") lại đang nằm trong bản ghi tên là "Xóa file".
     *
     * Đây là loại tri thức người dùng hỏi nhiều nhất — họ mô tả TRIỆU CHỨNG, không hỏi tên chức
     * năng. Nên nó phải thành bản ghi riêng, mang tên mục cha để còn nhận out.
     */
    const STANDALONE_RE = /^(Lỗi hay gặp|Phân biệt|Khi nào dùng|Lưu ý)/i;
    const kept = [];
    for (const h3 of section.split(/\n(?=### )/)) {
      const h3Name = clean((/^###\s+(.+)$/m.exec(h3) || [])[1] || '');
      if (h3Name && STANDALONE_RE.test(h3Name)) {
        blocks.push({ name: `${h3Name} — ${sectionName}`, parent: sectionName, raw: h3, isOverview: false });
      } else {
        kept.push(h3);
      }
    }

    const parts = kept.join('\n').split(/\n(?=#### )/);
    const intro = parts[0];

    blocks.push({ name: sectionName, parent: '', raw: intro, isOverview: true });
    for (const p of parts.slice(1)) {
      const taskName = clean((/^####\s+(.+)$/m.exec(p) || [])[1] || '').replace(/^[A-Z]\.\s*/, '');
      if (!taskName) continue;
      blocks.push({ name: taskName, parent: sectionName, raw: p, isOverview: false });
    }
  }
  return blocks;
}

function buildChunk(k) {
  const content = blockText(k.raw);
  if (content.length < 40) return null; // khối rỗng / chỉ có tiêu đề

  const steps = numberedSteps(k.raw);
  const labels = boldLabels(k.raw);
  const label = k.parent ? `${k.name} (${k.parent})` : k.name;

  /**
   * `keywords` — chỗ chấm điểm nặng nhất (trọng số 5). Ghép: tên việc, tên mục cha, và tên các nút
   * in đậm. Nút mới là thứ người dùng gõ khi hỏi ("nút Trả về Lead ở đâu"), nên phải có mặt.
   */
  /**
   * Khối nào in đậm QUÁ NHIỀU nhãn thì đó là BẢNG LIỆT KÊ (vd. "Bản đồ hàng tab" gọi tên cả 12
   * tab). Lấy hết vào `keywords` — trọng số 5 — là biến nó thành nam châm khớp mọi câu hỏi, đè
   * mất bản ghi chuyên sâu của từng tab. Bảng đó vẫn giữ trong `content` để trả lời câu "tab nào
   * dùng để làm gì"; chỉ là không cho nó tranh chấp ở tầng keyword.
   */
  const tooManyLabels = labels.length > 7;

  /** "Chuyển Lead → Deal" — người ta gõ "chuyển lead thành deal" / "lead sang deal". */
  const variants = (t) => (t.includes('→')
    ? [t.replace(/→/g, 'thanh'), t.replace(/→/g, 'sang')].map((x) => x.replace(/\s+/g, ' ').trim())
    : []);

  const base = [
    fold(k.name),
    ...(k.parent ? [fold(k.parent)] : []),
    ...(tooManyLabels ? [] : labels.map(fold)),
  ];
  const keywords = [...new Set([
    ...base,
    ...base.flatMap(variants),
    'lead', 'deal', 'chi tiet lead', 'chi tiet deal', 'ho so khach',
  ])].filter((x) => x.length > 1).slice(0, 18);

  return {
    path: `${PAGE_PATH}#${slug(k.parent ? `${k.parent}-${k.name}` : k.name)}`,
    label,
    menu: MENU,
    summary: content.split('\n')[0].slice(0, 280),
    keywords,
    content: content.slice(0, MAX_CONTENT_LEN),
    ...(steps.length ? { actions: steps } : {}),
    generated_from_doc: 'KIEN_THUC_TRANG_CHI_TIET_LEAD_DEAL.md',
  };
}

function main() {
  if (!fs.existsSync(SOURCE_MD)) {
    console.error(`Không thấy tài liệu nguồn: ${SOURCE_MD}`);
    console.error('Đặt lại bằng biến môi trường LEAD_DETAIL_MD nếu file nằm chỗ khác.');
    process.exit(1);
  }
  const md = fs.readFileSync(SOURCE_MD, 'utf8');
  const chunks = splitBlocks(md).map(buildChunk).filter(Boolean);

  fs.writeFileSync(OUT, JSON.stringify(chunks, null, 1), 'utf8');
  const lengths = chunks.map((c) => c.noi_dung.length);
  console.log(`Đã sinh ${chunks.length} bản ghi → ${OUT}`);
  console.log(`  có actions : ${chunks.filter((c) => c.actions).length}`);
  console.log(`  content    : ngắn nhất ${Math.min(...lengths)}, dài nhất ${Math.max(...lengths)} ký tự`);
}

main();
