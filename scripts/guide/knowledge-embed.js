#!/usr/bin/env node
/**
 * NHÚNG KHO KIẾN THỨC — bù cho tới khi mọi mục trong DB đều có vector.
 *
 * ═══════════════ TỆP NÀY KHÔNG CÒN GHI RA TỆP NÀO ═══════════════
 *
 * Bản trước ghi `knowledge-vectors.json` rồi để runtime đọc lên. Cách đó sinh ra ba nguồn lệch
 * pha nhau — xem đầu `database/603_guide_knowledge_vectors.sql`. Nay vector nằm cùng hàng với
 * kiến thức trong `guide_knowledge`, và script này chỉ là cách BẤM NÚT cho vòng lặp vốn đã chạy
 * nền trong `helpers/guideKnowledge.js`.
 *
 * Tức là KHÔNG BẮT BUỘC phải chạy: không chạy thì vòng lặp tự bù trong vài phút. Chạy tay có ích
 * khi bạn vừa `guide:sync` một loạt màn hình mới và muốn xong ngay, hoặc khi vừa đổi model nhúng
 * và cần nhúng lại cả kho.
 *
 * Chạy: cd backend && npm run guide:embed
 */
const path = require('path');

const ROOT = path.join(__dirname, '../..');
const kb = require(path.join(ROOT, 'backend/src/helpers/guideKnowledge'));
const embeddings = require(path.join(ROOT, 'backend/src/helpers/guideEmbedding'));

/** Trần vòng lặp — chặn ca bù mãi không xong vì mỗi lô đều lỗi. */
const MAX_ROUNDS = 200;

async function main() {
  if (!process.env.OPENAI_API_KEY) {
    console.error('❌ Thiếu OPENAI_API_KEY — chạy lệnh này trong thư mục backend để nạp .env.');
    process.exit(1);
  }
  if (!embeddings.ENABLED) {
    console.error('❌ GUIDE_EMBEDDING=0 — nhúng đang tắt.');
    process.exit(1);
  }

  // Kho nạp từ DB và việc đó bất đồng bộ; ép nạp ngay thay vì chờ nhịp dò 3 giây lúc khởi động.
  await kb.loadFromDb({ force: true });

  const before = await kb.vectorStatus();
  if (!before.db) {
    console.error('❌ Không đọc được DB kiến thức. Kiểm SUPABASE_URL / SERVICE_ROLE trong .env,');
    console.error('   và đã chạy database/603_guide_knowledge_vectors.sql chưa.');
    process.exit(1);
  }
  console.log(`Kho: ${before.total} mục · thiếu vector: ${before.missing} · model ${before.store}`);
  if (!before.missing) {
    console.log('✅ Không có gì phải nhúng.');
    return;
  }

  const t0 = Date.now();
  let done = 0;
  for (let i = 0; i < MAX_ROUNDS; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    const n = await kb.backfillVectorsOnce();
    if (!n) break;                       // hết việc, hoặc lô này hỏng cả — `vectorStatus` nói rõ
    done += n;
    process.stdout.write(`\r  đã nhúng ${done}/${before.missing}…`);
  }
  process.stdout.write('\n');

  const after = await kb.vectorStatus();
  const giay = ((Date.now() - t0) / 1000).toFixed(1);
  if (after.missing === 0) {
    console.log(`✅ Xong sau ${giay} giây — ${after.total} mục đều đã nhúng.`);
  } else {
    console.warn(`⚠  Còn ${after.missing}/${after.total} mục chưa nhúng sau ${giay} giây.`);
    console.warn('   Những mục đó tạm thời chỉ tra được bằng từ khoá; vòng lặp nền sẽ thử lại.');
  }
}

main().then(() => process.exit(0)).catch((e) => {
  console.error('❌', e?.message || e);
  process.exit(1);
});
