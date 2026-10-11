#!/usr/bin/env node
/**
 * Chạy database/602_guide_assistant_en.sql lên Postgres của Supabase.
 *
 * Tệp SQL đó lo cả hai tình huống: CSDL trống thì tạo mới, CSDL đang mang lược đồ cũ (tên cột
 * tiếng Việt) thì khối 0 đổi tên rồi phần sau bù nốt. Nên script này không cần biết đích đang
 * ở trạng thái nào.
 *
 * Vì sao có tệp này thay vì bảo "dán vào SQL Editor": migration phải chạy trên CẢ HAI cơ sở dữ
 * liệu (chính + dự phòng). `supabaseIncrementalDbSync.js` đồng bộ MỌI bảng trong schema `public`
 * bằng cách so cột — đổi tên cột ở bản chính mà không đổi ở bản dự phòng thì vòng đồng bộ kế
 * tiếp gãy đúng ở các bảng guide_*, và không có gì báo ngoài log.
 *
 *   node scripts/guide/run-migration-602.js                 # bản CHÍNH (mặc định)
 *   node scripts/guide/run-migration-602.js --target=backup # bản DỰ PHÒNG
 *   node scripts/guide/run-migration-602.js --check         # chỉ xem schema hiện tại, không ghi
 *
 * Tệp SQL tự nó đã idempotent (mỗi lệnh đổi tên đều kiểm tra cột cũ còn tồn tại), nên chạy lại
 * lần hai không lỗi và không làm gì thêm.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
require(path.join(ROOT, 'backend', 'node_modules', 'dotenv')).config({ path: path.join(ROOT, 'backend', '.env') });

const { Client } = require(path.join(ROOT, 'backend', 'node_modules', 'pg'));

const SQL_FILE = path.join(ROOT, 'database', '602_guide_assistant_en.sql');

const argv = process.argv.slice(2);
const CHECK_ONLY = argv.includes('--check');
const TARGET = (argv.find((a) => a.startsWith('--target=')) || '--target=primary').split('=')[1];

/**
 * Ưu tiên cổng TRỰC TIẾP (5432), không dùng pooler (6543): pooler chạy chế độ transaction, mà
 * migration này là một transaction dài có DDL — qua pooler dễ đứt giữa chừng.
 */
const TARGETS = {
  primary: [process.env.SUPABASE_DB_DIRECT_URL, process.env.SUPABASE_DB_URL],
  backup: [process.env.SUPABASE_BACKUP_DB_DIRECT_URL, process.env.SUPABASE_BACKUP_DB_URL],
  dev: [process.env.SUPABASE_DEV_DB_DIRECT_URL, process.env.SUPABASE_DEV_DB_URL],
};

const CHECKS = [
  ["bảng guide_*", `SELECT table_name FROM information_schema.tables
                     WHERE table_schema='public' AND table_name LIKE 'guide%' ORDER BY 1`],
  ["cột guide_experiences", `SELECT string_agg(column_name, ', ' ORDER BY ordinal_position) AS cols
                              FROM information_schema.columns
                             WHERE table_schema='public' AND table_name='guide_experiences'`],
  ["cột guide_chat_log", `SELECT string_agg(column_name, ', ' ORDER BY ordinal_position) AS cols
                           FROM information_schema.columns
                          WHERE table_schema='public' AND table_name='guide_chat_log'`],
  ["hàm guide_*", `SELECT string_agg(proname, ', ' ORDER BY proname) AS fns
                    FROM pg_proc WHERE proname LIKE 'guide_%'`],
];

async function connect() {
  const candidates = (TARGETS[TARGET] || []).filter(Boolean);
  if (!candidates.length) throw new Error(`Không có URL cho target "${TARGET}" trong backend/.env`);

  const errors = [];
  for (const url of candidates) {
    const remote = /supabase\.(co|com)/.test(url);
    const client = new Client({
      connectionString: url,
      ssl: remote ? { rejectUnauthorized: false } : false,
      connectionTimeoutMillis: 10000,
      // DDL trên bảng đang có kết nối khác giữ khoá: thà báo lỗi sớm còn hơn treo im.
      statement_timeout: 120000,
    });
    try {
      await client.connect();
      const { hostname, port } = new URL(url);
      console.log(`✔ Kết nối ${TARGET}: ${hostname}:${port}`);
      return client;
    } catch (e) {
      errors.push(`${new URL(url).hostname}:${new URL(url).port} → ${e.code || ''} ${e.message}`);
      await client.end().catch(() => {});
    }
  }
  throw new Error(`Không kết nối được ${TARGET}:\n  - ${errors.join('\n  - ')}`);
}

async function report(client, title) {
  console.log(`\n── ${title} ──`);
  for (const [label, sql] of CHECKS) {
    const { rows } = await client.query(sql);
    const value = rows.length === 1 && !rows[0].table_name
      ? Object.values(rows[0])[0]
      : rows.map((r) => r.table_name).join(', ');
    console.log(`  ${label}: ${value || '(không có)'}`);
  }
}

(async () => {
  const client = await connect();
  try {
    await report(client, 'TRƯỚC');
    if (CHECK_ONLY) {
      console.log('\n--check: không ghi gì.');
      return;
    }
    console.log('\n▶ Đang chạy 602_guide_assistant_en.sql …');
    await client.query(fs.readFileSync(SQL_FILE, 'utf8'));
    console.log('✔ Migration chạy xong.');
    await report(client, 'SAU');
    console.log('\nNhớ chạy cả `--target=backup` nếu bản dự phòng đang được đồng bộ.');
  } catch (e) {
    console.error('\n✖ LỖI:', e.message);
    console.error('  Transaction trong tệp SQL tự rollback — schema giữ nguyên như trước.');
    process.exitCode = 1;
  } finally {
    await client.end().catch(() => {});
  }
})().catch((e) => {
  console.error('✖', e.message);
  process.exitCode = 1;
});
