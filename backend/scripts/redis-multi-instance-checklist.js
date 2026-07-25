/**
 * Checklist Redis / multi-instance cho SX (Socket.IO + responseCache).
 *
 * Chạy: node scripts/redis-multi-instance-checklist.js
 *
 * Không đổi env production — chỉ in checklist + kiểm tra biến hiện tại.
 */

const c = { g: '\x1b[32m', r: '\x1b[31m', y: '\x1b[33m', b: '\x1b[1m', d: '\x1b[2m', x: '\x1b[0m' };

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const items = [
  {
    id: 'REDIS_URL',
    ok: () => !!(process.env.REDIS_URL || process.env.REDIS_HOST),
    how: 'Prod Render: set REDIS_URL (Redis Cloud / Render Redis). responseCache L2 + Socket.IO adapter dùng chung.',
  },
  {
    id: 'REDIS_DISABLED_off',
    ok: () => process.env.REDIS_DISABLED !== '1',
    how: 'Prod: bỏ REDIS_DISABLED=1 (hoặc =0). Local có thể giữ =1.',
  },
  {
    id: 'RESPONSE_CACHE',
    ok: () => process.env.RESPONSE_CACHE_DISABLED !== '1',
    how: 'Giữ response cache bật trên prod (TTL Kanban 20s). Invalidate tag `production` khi stage/handover.',
  },
  {
    id: 'socket_adapter_code',
    ok: () => {
      const fs = require('fs');
      const p = require('path').join(__dirname, '../src/server.js');
      const s = fs.readFileSync(p, 'utf8');
      return s.includes('createAdapter') && s.includes('REDIS');
    },
    how: 'backend/src/server.js đã có Socket.IO Redis adapter khi REDIS_URL hợp lệ.',
  },
  {
    id: 'responseCache_redis',
    ok: () => {
      const fs = require('fs');
      const p = require('path').join(__dirname, '../src/middleware/responseCache.js');
      const s = fs.readFileSync(p, 'utf8');
      return s.includes('getRedisIfReady') && s.includes('rc:data:');
    },
    how: 'responseCache đã L2 Redis — multi-instance không lệch cache nếu cùng REDIS_URL.',
  },
];

console.log(`${c.b}Redis / multi-instance checklist (SX)${c.x}\n`);

let pass = 0;
let fail = 0;
for (const it of items) {
  const good = !!it.ok();
  if (good) {
    pass += 1;
    console.log(`  ${c.g}OK${c.x}  ${it.id}`);
  } else {
    fail += 1;
    console.log(`  ${c.y}TODO${c.x} ${it.id}`);
  }
  console.log(`      ${c.d}${it.how}${c.x}`);
}

console.log(`\n${c.b}Deploy checklist (thủ công)${c.x}`);
console.log(`  ${c.d}1. Tạo Redis trên Render / Upstash, gắn REDIS_URL vào web service${c.x}`);
console.log(`  ${c.d}2. Xóa REDIS_DISABLED trên prod (nếu có)${c.x}`);
console.log(`  ${c.d}3. Scale web ≥ 2 instance — mở 2 tab Kanban SX, kéo thẻ, xác nhận realtime cả 2${c.x}`);
console.log(`  ${c.d}4. Logs: dòng «Socket.IO Redis adapter enabled»${c.x}`);
console.log(`  ${c.d}5. Smoke: GET /api/production/projects?view=kanban — Cache-Control / hit L2 sau request 2${c.x}`);

console.log(`\n${c.b}Env hiện tại:${c.x} ${pass} OK · ${fail} TODO`);
console.log(`  REDIS_URL=${process.env.REDIS_URL ? '(set)' : '(empty)'}`);
console.log(`  REDIS_DISABLED=${process.env.REDIS_DISABLED || '(unset)'}`);
console.log(`  RESPONSE_CACHE_DISABLED=${process.env.RESPONSE_CACHE_DISABLED || '(unset)'}`);
console.log(`  NODE_ENV=${process.env.NODE_ENV || '(unset)'}`);

// Exit 0 luôn — đây là checklist, local thường chưa có Redis.
process.exit(0);
