/**
 * KIỂM CHỨNG SƠ ĐỒ — chạy mã thật, khẳng định từng nhánh trong hình 2 và hình 5.
 *
 * Mỗi dòng dưới đây tương ứng một mũi tên hoặc một ô quyết định trong sơ đồ. Nó KHÔNG đọc mã để
 * đoán, mà gọi thẳng hàm thật rồi đo hành vi — nên khi ai đó sửa mã làm lệch sơ đồ, dòng tương
 * ứng chuyển sang TRƯỢT.
 *
 * Chạy:  node kiem-chung-so-do.js        (trong thư mục backend)
 *
 * KHÔNG ghi gì vào kho: sao lưu tệp trước, khôi phục sau. Tầng ngữ nghĩa bị tắt để không ra mạng.
 */
const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, 'uploads', 'guide-memory', 'experience.json');
const SAO_LUU = fs.existsSync(FILE) ? fs.readFileSync(FILE) : null;

const settings = require('./src/helpers/guideSettings');
const goc = settings.get.bind(settings);
settings.get = (k) => (k === 'semantic_enabled' ? false : goc(k));

const exp = require('./src/helpers/guideExperience');
const intent = require('./src/helpers/guideIntent');
const flowLog = require('./src/helpers/guideFlow');
const lib = require('./src/helpers/guideLearn');

let dat = 0; let truot = 0;
function ok(nhan, dung, chiTiet) {
  if (dung) { dat += 1; console.log(`  ĐẠT   ${nhan}`); } else { truot += 1; console.log(`  TRƯỢT ${nhan}${chiTiet ? ` — ${chiTiet}` : ''}`); }
}
function muc(t) { console.log(`\n${t}\n${'─'.repeat(t.length)}`); }

/**
 * Câu hỏi ép được nhánh "dò trúng chắc tay" — mẫu phải TỰ CHỨNG MINH là đủ mạnh.
 *
 * Bản trước chỉ lấy câu đầu tiên dài hơn 12 ký tự, và nó chọn trúng "đưa tôi đến trang đó" — một
 * bản rỗng nghĩa mà cổng stopword nay cố tình làm cho hết dò trúng. Bài kiểm liền báo TRƯỢT ba
 * dòng, trong khi mã đang chạy đúng. Mẫu chọn sai làm bài kiểm nói dối, và đó là kiểu hỏng tệ
 * nhất của một bộ kiểm chứng.
 *
 * Nay quét cả kho, lấy câu nào thật sự dò ra ĐỦ số bản cần nhắc.
 */
function cauTrungKhit(company) {
  const kho = exp.listAll(company) || [];
  const can = goc('experience_recall_count');
  for (const r of kho) {
    const q = r.question || '';
    if (q.length <= 12) continue;
    if (exp.findExperience(q, { company }).length >= can) return q;
  }
  return '';
}

(async () => {
  await new Promise((r) => setTimeout(r, 3000)); // chờ thiết lập nạp từ DB

  const CTY = 'chung';
  const trung = cauTrungKhit(CTY);
  console.log(`Kho: ${(exp.listAll(CTY) || []).length} bản · ngưỡng ${goc('experience_threshold')}`
    + ` · nhắc ${goc('experience_recall_count')} · biên bỏ qua ${goc('intent_skip_margin')}`);

  /* ═══════════ HÌNH 2 — thứ tự trong một lượt ═══════════ */
  muc('HÌNH 2 · dò kho trước, diễn giải sau');

  let soLanGoi = 0;
  const demIntent = async () => { soLanGoi += 1; return { task: 'xem sự kiện theo ngày', keywords: ['su', 'kien'], path: '' }; };

  soLanGoi = 0;
  const r1 = await exp.findCombined(trung, { company: CTY, path: '', turn: 'kc', getIntent: demIntent });
  ok('câu trùng khít → KHÔNG gọi subagent ý định', soLanGoi === 0, `đã gọi ${soLanGoi} lần`);
  ok('câu trùng khít → vẫn lấy được kinh nghiệm', r1.length > 0, `lấy ${r1.length} bản`);

  soLanGoi = 0;
  await exp.findCombined('còn tháng trước thì sao', { company: CTY, path: '', turn: 'kc', getIntent: demIntent });
  ok('câu tiếp nối → CÓ gọi subagent ý định', soLanGoi === 1, `đã gọi ${soLanGoi} lần`);

  soLanGoi = 0;
  await exp.findCombined('xyz khong co gi trong kho ca', { company: CTY, path: '', turn: 'kc', getIntent: null });
  ok('không có cách lấy ý định → không nổ, lùi về nguyên văn', true);

  // Đệm theo lượt: gọi inferIntent 3 lần cùng lượt, model chỉ được chạm 1 lần.
  let soLanModel = 0;
  const modelGia = async () => { soLanModel += 1; return '{"task":"loc deal theo cong ty","keywords":["loc","deal"]}'; };
  for (let i = 0; i < 3; i += 1) {
    await intent.inferIntent({ threadId: 'kc-thread', turn: 9, question: 'còn tháng trước thì sao' }, modelGia);
  }
  ok('3 request trong CÙNG một lượt → model ý định chỉ chạy 1 lần', soLanModel === 1, `chạy ${soLanModel} lần`);

  await intent.inferIntent({ threadId: 'kc-thread', turn: 10, question: 'câu khác' }, modelGia);
  ok('sang lượt mới → tính lại, không dùng ý định của lượt cũ', soLanModel === 2, `chạy ${soLanModel} lần`);
  ok('hỏi ý định đã tính sẵn mà KHÔNG gọi model', intent.cachedFor('kc-thread', 9) !== null && soLanModel === 2);

  /* ═══════════ HÌNH 5 — sổ theo lượt ═══════════ */
  muc('HÌNH 5 · sổ theo lượt, và cứu hộ đọc sổ đó');

  const KEY = 'kc-luot';
  flowLog.setTurn(KEY, 7);
  // PHẢI là bản ghi THẬT (có `id`), không phải bản rút gọn của `listAll` vốn chỉ mang `code`.
  const haiBan = exp.findExperience(trung, { company: CTY });
  exp.markInjected(KEY, haiBan, 7);

  const so7 = exp.turnReport(KEY);
  ok('sổ ghi đúng số bản đã chèn', so7.injected.length === haiBan.length, `ghi ${so7.injected.length}`);
  ok('sổ trả về NỘI DUNG, không chỉ mã', !!(so7.injected[0] && so7.injected[0].question));
  ok('cứu hộ đọc được danh sách đã chèn', exp.getInjected(KEY).size === haiBan.length);

  flowLog.setTurn(KEY, 8);
  exp.markInjected(KEY, haiBan.slice(0, 1), 8);
  ok('sang lượt mới → sổ tự thay, không cộng dồn', exp.turnReport(KEY).injected.length === 1,
    `còn ${exp.turnReport(KEY).injected.length}`);

  exp.clearTurnReport(KEY);
  ok('dọn sổ sau khi thủ thư đọc xong', exp.turnReport(KEY).injected.length === 0);

  /* ═══════════ HÌNH 2 + 5 — ngòi nổ cứu hộ ═══════════ */
  muc('HÌNH 2 · cứu hộ chỉ nổ khi ĐỦ dấu hiệu bí');

  const goiTool = (ten, nhan) => ({ role: 'assistant', content: [{ type: 'tool-call', toolName: ten, input: { label: nhan } }] });
  const ketQuaHong = () => ({ role: 'tool', content: [{ type: 'tool-result', output: { ok: false, reason: 'label_not_found' } }] });
  const cauHoi = (t) => ({ role: 'user', content: [{ type: 'text', text: t }] });

  const promptNhe = [cauHoi('đưa tôi đến trang khách hàng'), goiTool('bam_nut', 'Lịch'), ketQuaHong()];
  const promptBi = [
    cauHoi('đưa tôi đến trang khách hàng'),
    goiTool('bam_nut', 'Lịch'), ketQuaHong(),
    goiTool('bam_nut', 'Lịch'), ketQuaHong(),
    goiTool('doc_trang', ''),
  ];

  const doNhe = exp.measureStuckSignals(promptNhe);
  const doBi = exp.measureStuckSignals(promptBi);
  console.log(`  (đo được: nhẹ ${doNhe.step_count} bước/${doNhe.signals.length} dấu hiệu · bí ${doBi.step_count} bước/${doBi.signals.length} dấu hiệu)`);

  let xinYDinh = 0;
  const layYDinh = async () => { xinYDinh += 1; return { task: 'mở màn hình danh sách khách hàng', keywords: ['khach', 'hang'], path: '' }; };
  const mk = () => exp.createRescueMiddleware({ company_id: CTY }, '## Ngữ cảnh hiện tại', { key: KEY }, layYDinh);

  flowLog.setTurn(KEY, 11);
  xinYDinh = 0;
  const raNhe = await mk().transformParams({ params: { prompt: promptNhe } });
  ok('dưới ngưỡng → KHÔNG chèn gì, không xin ý định',
    raNhe.prompt.length === promptNhe.length && xinYDinh === 0, `chèn ${raNhe.prompt.length - promptNhe.length}, xin ${xinYDinh}`);

  xinYDinh = 0;
  const raBi = await mk().transformParams({ params: { prompt: promptBi } });
  ok('đủ dấu hiệu bí → CÓ chèn vào prompt', raBi.prompt.length === promptBi.length + 1);
  ok('cứu hộ XIN Ý ĐỊNH trước khi dò', xinYDinh === 1, `xin ${xinYDinh} lần`);

  const chen = raBi.prompt[raBi.prompt.length - 1];
  const chu = (chen.content || []).map((p) => p.text || '').join('');
  ok('khối chèn mang tiền tố khối ngữ cảnh (để không phá điểm cắt cache)', chu.startsWith('## Ngữ cảnh hiện tại'));
  ok('nội dung chèn là ĐƯỜNG ĐI KHÁC hoặc lời DỪNG',
    /ĐƯỜNG ĐI KHÁC|DỪNG LẠI MÀ XEM|đường đi KHÁC/i.test(chu), chu.slice(0, 60));

  const mw = mk();
  await mw.transformParams({ params: { prompt: promptBi } });
  const lan2 = await mw.transformParams({ params: { prompt: promptBi } });
  ok('cùng một lượt → chỉ chèn MỘT lần', lan2.prompt.length === promptBi.length);

  /* ═══════════ HÌNH 5 — thủ thư ═══════════ */
  muc('HÌNH 5 · thủ thư đọc được sổ gợi ý và chấm lại');

  let bienBan = '';
  const thuThuGia = async (chiDan, chu2) => { bienBan = chu2; return '{"action":"skip"}'; };
  const banGoiY = { code: 'abc123', question: 'xem sự kiện theo ngày', path: '/crm/events', steps: ['Bấm Lịch'], dead_ends: [], lesson: '' };

  await lib.learnInBackground({
    company: CTY, threadId: 'kc-tt', question: 'ngày 25 có sự kiện nào không',
    intent: 'xem sự kiện theo ngày', path: '/crm/events',
    steps: [{ summary: 'Bấm Lịch' }], deadEnds: [],
    injected: [banGoiY], rescue: { fired: true, mode: 'hint', steps: 5, still_stuck: true },
  }, thuThuGia);

  ok('biên bản CÓ mục "Đã gợi ý cho lượt này"', bienBan.includes('Đã gợi ý cho lượt này'));
  ok('biên bản in ĐƯỜNG ĐI đã gợi ý để so', bienBan.includes('Đường đi đã gợi ý'));
  ok('biên bản nói rõ cứu hộ đã nổ', /trợ lý có dấu hiệu bí/.test(bienBan));
  ok('biên bản cảnh báo "vẫn bí KHÔNG chứng minh gợi ý sai"', /không tự nó chứng minh gợi ý sai/.test(bienBan));

  let daDe = false;
  const gocUpdate = exp.updateExperience;
  exp.updateExperience = (rec) => { daDe = rec.mode === 'replace' && rec.code === 'abc123'; return { ok: true, code: rec.code }; };
  const resDe = await lib.learnInBackground({
    company: CTY, threadId: 'kc-tt2', question: 'ngày 25 có sự kiện nào không',
    intent: 'xem sự kiện theo ngày', path: '/crm/events',
    steps: [{ summary: 'Bấm Bộ lọc' }], deadEnds: ['Bấm Lịch — không còn nút này'],
    injected: [banGoiY], rescue: null,
  }, async () => '{"action":"replace","code":"abc123","task":"xem su kien theo ngay","steps":["Bam Bo loc"],"dead_ends":[],"lesson":"","reason":"nut Lich da bi go"}');
  exp.updateExperience = gocUpdate;
  ok('mã của bản ĐÃ GỢI Ý được chấp nhận làm code (không bị gạt)', daDe && resDe.action === 'replace',
    `action=${resDe.action || resDe.reason}`);

  ok('thủ thư "skip" báo ran=true (để KHÔNG lùi về ghi máy móc)',
    (await lib.learnInBackground({
      company: CTY, threadId: 'kc-tt3', question: 'câu gì đó đủ dài để qua cổng',
      steps: [{ summary: 'a' }], deadEnds: [], injected: [], rescue: null,
    }, async () => '{"action":"skip"}')).ran === true);

  const resHong = await lib.learnInBackground({
    company: CTY, threadId: 'kc-tt4', question: 'câu gì đó đủ dài để qua cổng',
    steps: [{ summary: 'a' }], deadEnds: [], injected: [], rescue: null,
  }, async () => 'khong phai json');
  ok('thủ thư trả sai dạng → reason=bad_shape (để LÙI về ghi máy móc)', resHong.reason === 'bad_shape', JSON.stringify(resHong));

  /* ═══════════ HÌNH 5 — bề mặt route của tab quản trị ═══════════ */
  muc('HÌNH 5 · tab Kinh nghiệm chỉ BỎ và KHÔI PHỤC');
  const nguon = fs.readFileSync(path.join(__dirname, 'src', 'routes', 'guide', 'copilotkit.js'), 'utf8');
  const tuyen = [...nguon.matchAll(/r\.(get|post|put|patch|delete)\('(\/experience[^']*)'/g)].map((m) => `${m[1].toUpperCase()} ${m[2]}`);
  console.log('  (tuyến thật:', tuyen.join(' · '), ')');
  ok('không có tuyến nào cho THÊM hoặc SỬA nội dung kinh nghiệm',
    !tuyen.some((t) => /\/experience\/(add|create|update|edit)/.test(t)));

  /* ═══════════ tổng kết ═══════════ */
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`ĐẠT ${dat} · TRƯỢT ${truot}`);
  if (SAO_LUU) { fs.writeFileSync(FILE, SAO_LUU); console.log('Đã khôi phục kho về đúng trạng thái trước khi chạy.'); }
  process.exit(truot ? 1 : 0);
})().catch((e) => {
  if (SAO_LUU) fs.writeFileSync(FILE, SAO_LUU);
  console.error('LỖI:', e && e.stack ? e.stack : e);
  process.exit(1);
});
