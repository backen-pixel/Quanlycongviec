/**
 * Dọn avatar cũ quá nặng: thu nhỏ cho vừa khung 512px (giữ nguyên tỷ lệ, không cắt) + nén WebP cho các avatar nằm trong Storage của dự án, rồi cập nhật users.avatar.
 *
 * MẶC ĐỊNH LÀ CHẠY THỬ (dry-run): chỉ liệt kê và ước tính dung lượng tiết kiệm, KHÔNG tải gì lên Storage, KHÔNG sửa DB.
 * Chỉ khi có cờ --apply mới ghi: tải bản nhỏ lên Storage rồi sửa users.avatar (có điều kiện avatar vẫn là giá trị cũ,
 * nên không đè lên avatar mà người dùng vừa đổi). Ảnh gốc KHÔNG bị xoá. Mỗi lần sửa được ghi vào tệp nhật ký để khôi phục.
 *
 * Chạy (từ thư mục backend):
 *   node scripts/optimize-user-avatars.js                      # chạy thử toàn bộ
 *   node scripts/optimize-user-avatars.js --user <uuid>        # chạy thử một người
 *   node scripts/optimize-user-avatars.js --limit 5            # chạy thử 5 người đầu
 *   node scripts/optimize-user-avatars.js --user <uuid> --apply            # ghi thật cho một người (nên thử trước)
 *   node scripts/optimize-user-avatars.js --apply                          # ghi thật cho tất cả
 *   node scripts/optimize-user-avatars.js --rollback <tệp-nhật-ký> [--apply]  # trả avatar về URL cũ (mặc định chỉ xem thử)
 *
 * Tùy chọn: --log <đường-dẫn> (nơi ghi nhật ký, mặc định scripts/avatar-optimize-<thời-gian>.log.jsonl)
 */
const fs = require('fs');
const path = require('path');
const { optimizeAvatarUrl, publicBaseOf } = require('../src/helpers/avatarOptimize');

function parseArgs(argv) {
  const get = (name) => {
    const i = argv.indexOf(name);
    return i >= 0 ? argv[i + 1] : null;
  };
  const limitRaw = get('--limit');
  return {
    apply: argv.includes('--apply'),
    userId: get('--user'),
    limit: limitRaw ? Math.max(1, parseInt(limitRaw, 10) || 0) : null,
    rollbackFile: get('--rollback'),
    logPath: get('--log'),
  };
}

const kb = (n) => `${((n || 0) / 1024).toFixed(0)}KB`;

/** Duyệt các user có avatar nằm trong Storage của dự án (phân trang, ổn định theo id). */
async function* iterUsers(supabase, base, { userId, pageSize = 500 }) {
  if (userId) {
    const { data, error } = await supabase.from('users').select('id, full_name, avatar').eq('id', userId);
    if (error) throw error;
    for (const u of data || []) yield u;
    return;
  }
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from('users')
      .select('id, full_name, avatar')
      .not('avatar', 'is', null)
      .like('avatar', `${base}%`)
      .order('id')
      .range(from, from + pageSize - 1);
    if (error) throw error;
    if (!data || !data.length) break;
    for (const u of data) yield u;
    if (data.length < pageSize) break;
  }
}

async function runOptimize(args, deps) {
  const { supabase, optimize, out, appendLog, sleep } = deps;
  const base = publicBaseOf(supabase);
  const counts = {};
  const bump = (k) => { counts[k] = (counts[k] || 0) + 1; };
  let before = 0;
  let after = 0;
  let seen = 0;
  let changed = 0;
  out(`Chế độ: ${args.apply ? 'GHI THẬT (--apply)' : 'CHẠY THỬ (không ghi gì)'}`);

  for await (const u of iterUsers(supabase, base, args)) {
    if (args.limit && seen >= args.limit) break;
    if (!u.avatar || !String(u.avatar).startsWith(base)) continue;
    seen += 1;
    const r = await optimize(u.avatar, u.id, { supabase, dryRun: !args.apply });
    const label = `${u.id} ${(u.full_name || '').slice(0, 24)}`.trim();

    if (r.optimized) {
      // Ghi thật: cập nhật có điều kiện avatar vẫn là giá trị cũ.
      const { data, error } = await supabase.from('users').update({ avatar: r.url }).eq('id', u.id).eq('avatar', u.avatar).select('id');
      if (error) {
        bump('db_error');
        out(`  LỖI ghi DB ${label}: ${error.message}`);
      } else if (!data || !data.length) {
        bump('changed_meanwhile');
        out(`  BỎ QUA ${label}: avatar vừa được đổi trong lúc chạy`);
      } else {
        bump('optimized');
        changed += 1;
        before += r.beforeBytes || 0;
        after += r.afterBytes || 0;
        appendLog({ at: new Date().toISOString(), id: u.id, old: u.avatar, new: r.url, beforeBytes: r.beforeBytes, afterBytes: r.afterBytes });
        out(`  ĐÃ SỬA ${label}: ${kb(r.beforeBytes)} → ${kb(r.afterBytes)}`);
      }
    } else if (r.reason === 'dry_run') {
      bump('would_optimize');
      before += r.beforeBytes || 0;
      after += r.afterBytes || 0;
      out(`  SẼ SỬA ${label}: ${kb(r.beforeBytes)} → ${kb(r.afterBytes)}`);
    } else {
      bump(r.reason || 'unknown');
      if (['resize_failed', 'download_failed', 'error', 'upload_failed'].includes(r.reason)) {
        out(`  KHÔNG LÀM ĐƯỢC ${label}: ${r.reason}`);
      }
    }
    await sleep(150);
  }

  out('--- Tổng kết');
  out(`Đã xét: ${seen} avatar trong Storage`);
  out(`Theo lý do: ${JSON.stringify(counts)}`);
  if (before) out(`Dung lượng: ${kb(before)} → ${kb(after)} (tiết kiệm ${kb(before - after)})${args.apply ? '' : ' [ước tính]'}`);
  if (!args.apply) out('Đây chỉ là chạy thử. Thêm --apply để ghi thật.');
  return { seen, changed, counts, before, after };
}

async function runRollback(args, deps) {
  const { supabase, out, sleep } = deps;
  const lines = fs.readFileSync(args.rollbackFile, 'utf8').split('\n').filter((l) => l.trim());
  out(`Khôi phục từ ${args.rollbackFile}: ${lines.length} dòng — ${args.apply ? 'GHI THẬT (--apply)' : 'CHẠY THỬ'}`);
  let restored = 0;
  let skipped = 0;
  for (const line of lines) {
    let e;
    try { e = JSON.parse(line); } catch { continue; }
    if (!e.id || !e.old || !e.new) continue;
    if (!args.apply) { out(`  SẼ TRẢ ${e.id}`); continue; }
    // Có điều kiện avatar hiện tại vẫn là bản đã tối ưu (không đè nếu người dùng đã đổi tiếp).
    const { data, error } = await supabase.from('users').update({ avatar: e.old }).eq('id', e.id).eq('avatar', e.new).select('id');
    if (error || !data || !data.length) {
      skipped += 1;
      out(`  BỎ QUA ${e.id}: ${error ? error.message : 'avatar đã khác bản đã tối ưu'}`);
    } else {
      restored += 1;
      out(`  ĐÃ TRẢ ${e.id}`);
    }
    await sleep(100);
  }
  out(`Đã trả: ${restored}, bỏ qua: ${skipped}`);
  return { restored, skipped };
}

async function main(argv, deps = {}) {
  const args = parseArgs(argv);
  // eslint-disable-next-line global-require
  const supabase = deps.supabase || require('../src/config/supabase').supabase;
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const logPath = args.logPath || path.join(__dirname, `avatar-optimize-${stamp}.log.jsonl`);
  const d = {
    supabase,
    optimize: deps.optimize || optimizeAvatarUrl,
    out: deps.out || ((m) => console.log(m)),
    sleep: deps.sleep || ((ms) => new Promise((r) => setTimeout(r, ms))),
    appendLog: deps.appendLog || ((obj) => fs.appendFileSync(logPath, `${JSON.stringify(obj)}\n`)),
  };
  if (args.rollbackFile) return runRollback(args, d);
  const res = await runOptimize(args, d);
  if (args.apply && res.changed > 0 && !deps.appendLog) {
    d.out(`Nhật ký khôi phục: ${logPath}\n  (khôi phục: node scripts/optimize-user-avatars.js --rollback "${logPath}" --apply)`);
  }
  return res;
}

module.exports = { main, parseArgs };

if (require.main === module) {
  // eslint-disable-next-line global-require
  require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
  main(process.argv.slice(2))
    .then(() => process.exit(0))
    .catch((e) => {
      console.error('Lỗi:', e && e.message ? e.message : e);
      process.exit(1);
    });
}
