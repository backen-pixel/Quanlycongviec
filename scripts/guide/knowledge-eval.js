#!/usr/bin/env node
/**
 * ĐO CHẤT LƯỢNG TRA CỨU KHO KIẾN THỨC — 30 câu hỏi, mỗi câu kèm màn hình kỳ vọng.
 *
 * ═══════════════ VÌ SAO CẦN BỘ NÀY, KHI ĐÃ CÓ NHẬT KÝ HỎI ĐÁP ═══════════════
 *
 * Nhật ký chỉ cho biết model CÓ GỌI tool hay không. Nó không trả lời được câu quan trọng hơn:
 * gọi rồi thì kho có trả về đúng màn hình không. Đo trên nhật ký còn vướng hai nhiễu — model
 * có thể không gọi vì câu hỏi nằm sẵn trên màn hình (đúng), và số lượt thật còn quá ít.
 *
 * Bộ này đo THẲNG `searchKnowledge()`, bỏ qua model. Kết quả không phụ thuộc nhà cung cấp, không
 * tốn một đồng token nào, chạy trong ~1 giây.
 *
 * ═══════════════ CÁCH ĐẶT CÂU HỎI TRONG .eval-cases.json ═══════════════
 *
 * KHÔNG chép lại `keywords` của màn hình vào câu hỏi. Làm vậy là tự chấm cho mình điểm tuyệt đối
 * trên một phép tra vốn chấm điểm bằng chính `keywords` đó — bộ test sẽ luôn xanh và không bao
 * giờ bắt được hồi quy nào. Bốn nhóm, cố ý:
 *
 *   truc tiep  — nói thẳng nhưng khác chữ với nhãn màn hình.
 *   dong nghia — dùng từ người dùng hay dùng, KHÔNG có trong keywords ("thợ đi lắp", "xoá nhầm").
 *                Đây là nhóm phơi ra điểm yếu của tra cứu thuần từ vựng.
 *   khong dau  — gõ không dấu, kiểm nhánh `fold()`.
 *   tu nhat ky — câu NGUYÊN VĂN người dùng đã hỏi thật (guide_chat_log), kể cả câu đã trượt.
 *
 * `expect` là một DANH SÁCH: nhiều câu hỏi có hơn một màn hình trả lời đúng được, và ép một đáp
 * án duy nhất chỉ tạo ra lỗi giả.
 *
 * `hard: true` = biết trước là khó. Vẫn tính vào tổng, nhưng in riêng để đừng nhầm một ca khó
 * kinh niên với một hồi quy mới.
 *
 * Chạy: node scripts/guide/knowledge-eval.js [--verbose] [--min-hit3 <số>]
 *       node scripts/guide/knowledge-eval.js --sweep     ← quét dải trọng số lai
 *
 * `--sweep` cần `.eval-vectors.json` (chạy `npm run guide:embed` trước). Nó chạy CÙNG 30 câu qua
 * mọi mức trộn từ 0% đến 100% ngữ nghĩa, ở cả hai chế độ hợp nhất, rồi in bảng so sánh. 30 câu
 * chỉ tốn 30 lần nhúng cho TOÀN BỘ bảng chứ không phải mỗi ô một lần — `embedMany` đệm theo
 * chuỗi trong tiến trình, nên mọi mức trọng số sau đó dùng lại đúng vector đó.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '../..');
const CASES_JSON = path.join(ROOT, 'backend/data/guide-knowledge/.eval-cases.json');

/**
 * Gọi thẳng helper của backend — KHÔNG chép lại thuật toán chấm điểm sang đây.
 *
 * Chép là dựng đúng loại lệch âm thầm mà repo này đã trả giá nhiều lần: sửa trọng số trong
 * guideKnowledge.js, quên sửa bản sao, và bộ test vẫn xanh trong khi sản phẩm đã đổi hành vi.
 */
const kb = require(path.join(ROOT, 'backend/src/helpers/guideKnowledge'));

const args = process.argv.slice(2);
const VERBOSE = args.includes('--verbose');
const minIdx = args.indexOf('--min-hit3');
const MIN_HIT3 = minIdx >= 0 ? Number(args[minIdx + 1]) : null;

const SWEEP = args.includes('--sweep');

/**
 * Chấm một cấu hình tra cứu trên toàn bộ ca.
 * @param {(q: string) => Promise<Array>} run  hàm tra cứu đang đem đo
 */
async function evaluate(cases, run) {
  let hit1 = 0; let hit3 = 0; let hit5 = 0; let mrr = 0;
  const fails = [];
  const byGroup = new Map();

  for (const c of cases) {
    // eslint-disable-next-line no-await-in-loop
    const results = await run(c.q);
    const rank = results.findIndex((r) => c.expect.includes(r.path)) + 1; // 0 = không thấy
    if (rank === 1) hit1 += 1;
    if (rank >= 1 && rank <= 3) hit3 += 1;
    if (rank >= 1) { hit5 += 1; mrr += 1 / rank; }

    const g = byGroup.get(c.group) || { n: 0, ok3: 0 };
    g.n += 1;
    if (rank >= 1 && rank <= 3) g.ok3 += 1;
    byGroup.set(c.group, g);

    if (rank < 1 || rank > 3) {
      fails.push({
        q: c.q, hard: !!c.hard, note: c.note, rank: rank, expect: c.expect,
        got: results.slice(0, 3).map((r) => `${r.label} [${r.path || '-'}]`),
      });
    }
    if (VERBOSE && !SWEEP) {
      const mark = rank === 1 ? '①' : (rank >= 1 && rank <= 3 ? `②③(${rank})` : '✗');
      console.log(`  ${mark.padEnd(7)} ${c.q}`);
    }
  }
  return { hit1, hit3, hit5, mrr: mrr / cases.length, fails, byGroup };
}

async function main() {
  const cases = JSON.parse(fs.readFileSync(CASES_JSON, 'utf8'));

  /**
   * Kho nay nap TU DB, va viec do bat dong bo. Khong ep nap o day thi `load()` tra ve kho rong va
   * moi ca deu truot — mot bo test bao 0/30 vi ly do khong lien quan gi toi thuat toan.
   */
  await kb.loadFromDb({ force: true });
  if (kb.load().chunks.length === 0) {
    console.error('❌ Kho kiến thức rỗng — không đọc được DB. Kiểm .env và migration 603.');
    process.exit(1);
  }

  /**
   * Kỳ vọng trỏ vào màn hình KHÔNG CÒN TỒN TẠI thì ca đó vĩnh viễn trượt, và người đọc sẽ đi
   * sửa thuật toán chấm điểm cho một lỗi nằm ở tệp ca test. Kiểm trước, báo riêng.
   */
  const known = new Set(kb.load().chunks.map((c) => c.path).filter(Boolean));
  const broken = [];
  for (const c of cases) {
    const missing = c.expect.filter((p) => !known.has(p));
    if (missing.length === c.expect.length) broken.push({ q: c.q, missing });
  }
  if (broken.length) {
    console.error(`\n❌ ${broken.length} ca có KỲ VỌNG trỏ vào màn hình không có trong kho:`);
    for (const b of broken) console.error(`   "${b.q}" → ${b.missing.join(', ')}`);
    console.error('   Sửa .eval-cases.json (màn hình đã đổi path?), đừng sửa thuật toán.\n');
    process.exit(1);
  }

  const n = cases.length;

  if (SWEEP) {
    const vs = await kb.vectorStatus();
    if (!vs.db || vs.total === 0) {
      console.error('❌ Không đọc được kiến thức từ DB. Đã chạy database/603_guide_knowledge_vectors.sql chưa?');
      process.exit(1);
    }
    if (vs.missing) {
      console.warn(`⚠  ${vs.missing}/${vs.total} mục chưa có vector — số đo dưới đây thấp hơn thực tế.`);
      console.warn('   Chạy `npm run guide:embed` rồi đo lại.\n');
    }
    console.log(`\n═══ QUÉT DẢI TRỌNG SỐ — ${n} câu, ${vs.total - vs.missing} vector (${vs.store}) ═══`);
    console.log('   trọng số = phần của NGỮ NGHĨA (0% = thuần từ khoá, 100% = thuần embedding)\n');

    for (const mode of ['rrf', 'blend']) {
      console.log(`  ── ${mode.toUpperCase()} ──`);
      console.log('    ngữ nghĩa   hit@1        hit@3        MRR');
      for (let w = 0; w <= 1.0001; w += 0.1) {
        const weight = Math.round(w * 10) / 10;
        // eslint-disable-next-line no-await-in-loop
        const r = await evaluate(cases, (q) => kb.searchKnowledgeHybrid(q, {
          isAdmin: true, mode: mode, weight: weight,
        }));
        const bar = (x) => `${String(x).padStart(2)}/${n} ${(100 * x / n).toFixed(0).padStart(3)}%`;
        console.log(`      ${String(Math.round(weight * 100)).padStart(3)}%     ${bar(r.hit1)}   ${bar(r.hit3)}   ${r.mrr.toFixed(3)}`);
      }
      console.log('');
    }
    return;
  }

  /**
   * Mặc định đo ĐÚNG hàm đang chạy thật (`searchKnowledgeHybrid`, 50/50 lấy vector từ tệp), chứ
   * không đo nhánh từ khoá cho đẹp số. `--keyword` để lấy lại mốc nền thuần từ khoá khi cần so.
   */
  const KEYWORD_ONLY = args.includes('--keyword');
  const r = await evaluate(cases, async (q) => (KEYWORD_ONLY
    ? kb.searchKnowledge(q, { isAdmin: true })
    : kb.searchKnowledgeHybrid(q, { isAdmin: true })));
  if (KEYWORD_ONLY) console.log('(chế độ --keyword: thuần từ khoá)');
  const pct = (x) => `${(100 * x / n).toFixed(1)}%`;
  console.log(`\n═══ KHO KIẾN THỨC — ${n} câu, ${known.size} màn hình ═══`);
  console.log(`  hit@1 : ${String(r.hit1).padStart(2)}/${n}  ${pct(r.hit1)}   (đúng ngay kết quả đầu)`);
  console.log(`  hit@3 : ${String(r.hit3).padStart(2)}/${n}  ${pct(r.hit3)}   (lọt top 3 — model đọc được)`);
  console.log(`  hit@5 : ${String(r.hit5).padStart(2)}/${n}  ${pct(r.hit5)}   (lọt danh sách trả về)`);
  console.log(`  MRR   : ${r.mrr.toFixed(3)}`);

  console.log('\n  Theo nhóm (hit@3):');
  for (const [g, v] of r.byGroup) console.log(`    ${g.padEnd(12)} ${v.ok3}/${v.n}`);

  if (r.fails.length) {
    console.log(`\n  ── ${r.fails.length} ca TRƯỢT top 3 ──`);
    for (const f of r.fails) {
      console.log(`\n  ${f.hard ? '[khó] ' : ''}"${f.q}"`);
      console.log(`     mong đợi : ${f.expect.join(' | ')}`);
      console.log(`     nhận được: ${f.got.length ? f.got.join('  ·  ') : '(không có kết quả nào)'}`);
      if (f.note) console.log(`     ghi chú  : ${f.note}`);
    }
  }

  if (MIN_HIT3 !== null && r.hit3 < MIN_HIT3) {
    console.error(`\n❌ hit@3 = ${r.hit3}, dưới mức tối thiểu ${MIN_HIT3}.`);
    process.exit(1);
  }
  console.log('');
}

main();
