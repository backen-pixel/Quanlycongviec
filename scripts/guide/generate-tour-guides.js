/**
 * Sinh kiến thức cho Trợ lý hướng dẫn TỪ PRODUCT TOUR có sẵn.
 *
 * Chạy:  cd backend && npm run guide:tours
 *
 * VÌ SAO CÓ FILE NÀY. Kho kiến thức thiếu hẳn luồng "tạo Lead / tạo Deal" — đo được: hỏi
 * "cach tao lead moi" thì top 3 ra *mục Ghi âm*, *mục Drive*, *Hành trình Lead*, và quét cả 251
 * chunk chỉ có 4 cái nhắc tới việc tạo lead, đều là chuyện khác (Facebook tự động, Zalo, chặn
 * SĐT). Trong khi đó tour `crm-create-lead-deal` đã dạy đúng việc đó, từng bước, bám giao diện
 * thật. Chép tay sang JSON là tự tạo ra hai bản sự thật rồi để chúng lệch nhau — nên sinh.
 *
 * BA ĐIỂM THIẾT KẾ:
 *
 * 1. GHI RA FILE RIÊNG `tour-guides.json`, KHÔNG chèn vào `guides.json`. `guides.json` là dữ
 *    liệu viết tay; trộn máy sinh vào đó thì chạy lại lần hai là nhân đôi bản ghi, và không ai
 *    còn biết dòng nào được phép sửa tay. Cùng nguyên tắc đã dùng cho screens.json (sinh) và
 *    guides.json (tay).
 *
 * 2. ĐỌC THẲNG `tours.js` BẰNG ESM `import()`. Được, vì `frontend/package.json` khai
 *    `"type": "module"` và tours.js KHÔNG import gì cả. Không phải bundle, không phải regex —
 *    regex trên mã nguồn là thứ vỡ im lặng ngay lần đầu ai đó xuống dòng khác đi.
 *
 * 3. CẮT TOUR THEO TIÊU ĐỀ BƯỚC, không theo chỉ số. Một tour dài là nhiều việc khác nhau
 *    (`crm-create-lead-deal` = tạo Lead ở bước 1–10, tạo Deal ở 11–15). Tách thành hai bản ghi
 *    thì câu hỏi "tạo deal thế nào" mới trúng được. Cắt theo chỉ số thì chèn một bước vào giữa
 *    là lệch hết mà không ai biết; cắt theo tiêu đề thì sai là BÁO LỖI ngay (xem `sliceSection`).
 */

const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const ROOT = path.join(__dirname, '..', '..');
const TOURS_FILE = path.join(ROOT, 'frontend/src/lib/productTour/tours.js');
const OUT = path.join(ROOT, 'backend/data/guide-knowledge/tour-guides.json');

/**
 * Cấu hình tay, cố ý: chỉ ở đây mới biết một tour dài gồm mấy VIỆC, và mỗi việc nên gắn với
 * path nào / gọi tên là gì. Suy tự động ra được thì cũng chỉ là đoán.
 *
 * `from_step` / `to_step` là TIÊU ĐỀ bước (khớp chính xác). `to_step: null` = tới hết tour.
 */
const SECTIONS = [
  {
    tour: 'crm-create-lead-deal',
    menu: 'CRM → Bán hàng',
    section: [
      {
        path: '/crm/dashboard#tao-lead',
        label: 'Tạo Lead mới',
        from_step: 'Chọn tab Leads',
        to_step: 'Đóng form Lead',
        summary: 'Tạo một Lead (khách tiềm năng) mới từ Dashboard CRM: sang tab Leads, bấm'
          + ' "+ Thêm Lead", điền tên lead và tên khách (hai trường bắt buộc), chọn công ty /'
          + ' khu vực, nhập số điện thoại để hệ thống quét trùng, rồi bấm "Tạo Lead".',
        keywords: ['tao lead', 'them lead', 'lead moi', 'tao khach tiem nang', 'nhap lead',
          'them khach moi', 'tao moi lead', 'form lead'],
      },
      {
        path: '/crm/dashboard#tao-deal',
        label: 'Tạo Deal mới',
        from_step: 'Chuyển sang tab Deals',
        to_step: null,
        summary: 'Tạo một Deal (cơ hội bán hàng) mới từ Dashboard CRM: sang tab Deals, nút đổi'
          + ' thành "+ Thêm Deal", điền tên deal (bắt buộc), khách và giá trị. Tạo Deal thẳng'
          + ' được, không bắt buộc phải có Lead trước.',
        keywords: ['tao deal', 'them deal', 'deal moi', 'tao co hoi ban hang', 'co hoi moi',
          'tao moi deal', 'form deal'],
      },
    ],
  },
];

/** Cắt một khoảng bước theo tiêu đề. Không tìm thấy mốc → ném lỗi, KHÔNG đoán. */
function sliceSection(steps, { from_step, to_step }, tourName) {
  const start = steps.findIndex((s) => s.title === from_step);
  if (start < 0) {
    throw new Error(`Tour "${tourName}": không có bước nào tên "${from_step}".`
      + ' Tiêu đề bước đã đổi — sửa CAU_HINH trong scripts/guide/generate-tour-guides.js.');
  }
  if (!to_step) return steps.slice(start);
  const end = steps.findIndex((s, i) => i > start && s.title === to_step);
  if (end < 0) {
    throw new Error(`Tour "${tourName}": không có bước nào tên "${to_step}" sau "${from_step}".`);
  }
  return steps.slice(start, end + 1);
}

/**
 * Nút mà người dùng THẬT SỰ phải bấm.
 *
 * Hai điều kiện, phải đủ cả hai:
 *  1. `advanceOn: 'target-click'` — chính tour khai bước đó chỉ đi tiếp khi bấm trúng phần tử.
 *  2. Tiêu đề mở đầu bằng một ĐỘNG TỪ DẪN ("Bấm", "Nút", "Chọn", "Mở"), để phần còn lại đúng là
 *     NHÃN của control.
 *
 * Vì sao cần điều kiện 2. Bản đầu chỉ xét điều kiện 1 và sinh ra hai "nút" không hề tồn tại:
 * `"Đóng form Lead"` (nút thật là X hoặc "Hủy") và `"Chuyển sang tab Deals"` (nhãn thật là
 * "Deals"). `actions` được trả cho model dưới tên `allowed_actions` — tức danh sách thứ
 * nó được phép bấm hộ — nên nhãn sai không phải chuyện thẩm mỹ: trợ lý gọi `bam_nut` với chuỗi
 * đó là trượt, rồi phải dò lại. Thà liệt kê ÍT mà đúng.
 */
const LEADING_VERB_RE = /^(Bấm|Nút|Chọn|Mở)\s+/u;

function actionsOfSection(steps) {
  const out = [];
  const seen = new Set();
  for (const s of steps) {
    if (s.advanceOn !== 'target-click') continue;
    const title = String(s.title || '');
    if (!LEADING_VERB_RE.test(title)) continue;
    // "Chọn tab Leads" → "Leads": chữ "tab" là loại phần tử, không nằm trong nhãn hiển thị.
    // "+ Thêm Lead" → "Thêm Lead": dấu "+" trong tiêu đề tour là ICON (SVG), KHÔNG nằm trong
    // text của nút. Đã kiểm trên DOM thật: nút mang `data-tour="add-lead"` có textContent đúng
    // bằng "Thêm Deal". Mà `pickByLabel` của pageActions so theo bằng → bắt đầu bằng → chứa,
    // đều trên nhãn DOM: giữ dấu "+" là cả ba tầng đều trượt, `bam_nut` không tìm ra nút.
    const label = title
      .replace(LEADING_VERB_RE, '')
      .replace(/^tab\s+/iu, '')
      .replace(/^[+\-–—•]+\s*/u, '')
      .trim();
    if (!label || seen.has(label)) continue;
    seen.add(label);
    out.push({ label });
  }
  return out;
}

/** Nội dung chuyên sâu = chính lời giảng từng bước của tour, đánh số lại theo phần. */
function contentOfSection(steps) {
  return steps
    .map((s, i) => `${i + 1}. ${s.title}${s.body ? ` — ${s.body}` : ''}`)
    .join('\n');
}

async function main() {
  const { TOURS } = await import(pathToFileURL(TOURS_FILE).href);

  const out = [];
  for (const cfg of SECTIONS) {
    const def = TOURS[cfg.tour];
    if (!def?.steps?.length) throw new Error(`Không tìm thấy tour "${cfg.tour}" trong tours.js.`);

    for (const p of cfg.phan) {
      const steps = sliceSection(def.steps, p, cfg.tour);
      out.push({
        path: p.path,
        label: p.label,
        menu: cfg.menu,
        summary: p.summary,
        keywords: p.keywords,
        content: contentOfSection(steps),
        actions: actionsOfSection(steps),
        // Dấu vết nguồn: đọc file JSON là biết ngay không được sửa tay, phải sửa tour rồi sinh
        // lại. Trường thừa không ảnh hưởng tra cứu (fieldTexts không đọc tới).
        generated_from_tour: cfg.tour,
        generated_from_step: `${p.from_step} → ${p.to_step || '(hết tour)'} (${steps.length} bước)`,
      });
    }
  }

  fs.writeFileSync(OUT, `${JSON.stringify(out, null, 2)}\n`, 'utf8');
  console.log(`✅ Sinh ${out.length} bản ghi từ ${SECTIONS.length} tour → ${path.relative(ROOT, OUT)}`);
  for (const c of out) {
    console.log(`   • ${c.label.padEnd(16)} ${c.path.padEnd(28)} ${c.actions.length} thao tác, ${c.noi_dung.split('\n').length} bước`);
  }
  console.log('\n⚠️  KHÔNG sửa tay tour-guides.json — sửa tours.js rồi chạy lại `npm run guide:tours`.');
}

main().catch((e) => {
  console.error('❌', e.message);
  process.exit(1);
});
