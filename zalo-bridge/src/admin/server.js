/**
 * Trang quản trị nội bộ của cổng Zalo.
 *
 * Chỉ nghe trên 127.0.0.1 theo mặc định — xem được trang này là xem được mã QR,
 * tức là đăng nhập được vào tài khoản Zalo. Muốn mở cho máy khác trong LAN thì
 * đặt ADMIN_HOST=0.0.0.0, và chỉ làm vậy nếu mạng văn phòng đủ tin cậy.
 *
 * Mọi request ghi phải mang header `X-Admin: 1`. Trình duyệt không cho trang web
 * lạ gắn header tuỳ ý vào request chéo nguồn mà không qua preflight (ta không
 * trả lời preflight), nên một trang độc hại người dùng lỡ mở không thể sai khiến
 * cổng này.
 */
const fs = require('fs');
const path = require('path');
const http = require('http');
const config = require('../config');
const settings = require('../settings');
const crm = require('../crm');

const MAX_BODY = 256 * 1024;

function json(res, code, body) {
  const payload = JSON.stringify(body);
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
    'Cache-Control': 'no-store',
  });
  res.end(payload);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) { reject(new Error('Nội dung quá lớn')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
      catch (e) { reject(new Error('JSON không hợp lệ')); }
    });
    req.on('error', reject);
  });
}

/** Chặn trang web lạ sai khiến cổng này qua trình duyệt của người dùng. */
function guardWrite(req, res) {
  if (req.headers['x-admin'] !== '1') {
    json(res, 403, { error: 'Thiếu header X-Admin' });
    return false;
  }
  const origin = req.headers.origin;
  if (origin && !origin.startsWith(`http://${config.adminHost}:${config.adminPort}`) && !origin.startsWith('http://127.0.0.1') && !origin.startsWith('http://localhost')) {
    json(res, 403, { error: 'Nguồn không hợp lệ' });
    return false;
  }
  return true;
}

function startAdminServer({ state, reload }) {
  const page = path.join(__dirname, 'ui.html');

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://local');
    const p = url.pathname;

    try {
      // ── Trang ──────────────────────────────────────────────
      if (req.method === 'GET' && (p === '/' || p === '/index.html')) {
        const buf = fs.readFileSync(page);
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
        return res.end(buf);
      }

      // ── Trạng thái ─────────────────────────────────────────
      if (req.method === 'GET' && p === '/api/state') {
        const snapshot = state();
        const accounts = snapshot.accounts.map((a) => {
          let qr = null;
          if (a.status === 'need_qr') {
            try { qr = fs.readFileSync(config.qrFileFor(a.oa_id)).toString('base64'); } catch (_) { qr = null; }
          }
          return { ...a, qr };
        });
        return json(res, 200, {
          ...snapshot,
          accounts,
          settings: settings.forDisplay(),
          source: crm.describe(),
          crm_health: crm.health(),
        });
      }

      // ── Cấu hình kết nối ───────────────────────────────────
      if (req.method === 'GET' && p === '/api/settings') {
        return json(res, 200, { ok: true, settings: settings.forDisplay() });
      }

      if (req.method === 'POST' && p === '/api/settings') {
        if (!guardWrite(req, res)) return;
        const body = await readBody(req);
        // Ô bí mật để trống = giữ nguyên giá trị cũ, không xoá mất
        const current = settings.load();
        if (body.crm && !body.crm.gatewayToken) body.crm.gatewayToken = current.crm.gatewayToken;

        settings.save(body);
        console.log('[quản trị] Đã đổi kết nối CRM.');

        // Tiến trình con giữ bản cấu hình riêng của nó, nên phải dựng lại thì
        // kết nối mới có hiệu lực ở đó.
        await reload({ force: true });

        return json(res, 200, { ok: true, settings: settings.forDisplay(), restarted: true });
      }

      if (req.method === 'POST' && p === '/api/settings/test') {
        if (!guardWrite(req, res)) return;
        try {
          const result = await crm.testConnection();
          return json(res, 200, { ok: true, ...result });
        } catch (e) {
          return json(res, 200, { ok: false, error: e.message });
        }
      }

      // ── Tài khoản ──────────────────────────────────────────
      if (req.method === 'GET' && p === '/api/accounts') {
        return json(res, 200, { ok: true, accounts: await crm.listAccounts() });
      }

      if (req.method === 'POST' && p === '/api/accounts') {
        if (!guardWrite(req, res)) return;
        const body = await readBody(req);
        const oaId = String(body.oa_id || '').trim();
        const oaName = String(body.oa_name || '').trim();
        if (!oaId) return json(res, 400, { error: 'Thiếu mã tài khoản' });
        if (!oaName) return json(res, 400, { error: 'Thiếu tên hiển thị' });
        if (!/^[A-Za-z0-9_:.-]+$/.test(oaId)) {
          return json(res, 400, { error: 'Mã tài khoản chỉ được dùng chữ, số và _ : . -' });
        }

        const account = await crm.createAccount({
          oa_id: oaId,
          oa_name: oaName,
          auto_create_lead: body.auto_create_lead === true,
          is_active: body.is_active !== false,
          expected_phone: body.expected_phone || null,
        });
        await reload({ force: true });
        return json(res, 201, { ok: true, account });
      }

      const accountMatch = p.match(/^\/api\/accounts\/(.+)$/);
      if (accountMatch) {
        const oaId = decodeURIComponent(accountMatch[1]);

        if (req.method === 'PATCH') {
          if (!guardWrite(req, res)) return;
          const body = await readBody(req);
          const account = await crm.updateAccount(oaId, body);
          await reload({ force: true });
          return json(res, 200, { ok: true, account });
        }

        if (req.method === 'DELETE') {
          if (!guardWrite(req, res)) return;
          await crm.deleteAccount(oaId);
          // Xoá luôn phiên đăng nhập và hàng đợi của tài khoản đã gỡ
          for (const f of [config.sessionFileFor(oaId), config.spoolFileFor(oaId), config.qrFileFor(oaId)]) {
            try { fs.rmSync(f, { force: true }); } catch (_) { /* ignore */ }
          }
          await reload({ force: true });
          return json(res, 200, { ok: true });
        }
      }

      // ── Ảnh QR ─────────────────────────────────────────────
      if (req.method === 'GET' && p === '/api/qr' && url.searchParams.get('oa_id')) {
        const file = config.qrFileFor(url.searchParams.get('oa_id'));
        try {
          const buf = fs.readFileSync(file);
          res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'no-store' });
          return res.end(buf);
        } catch (_) {
          return json(res, 404, { error: 'Chưa có mã QR' });
        }
      }

      json(res, 404, { error: 'Không có đường dẫn này' });
    } catch (e) {
      console.error('[quản trị]', e.message);
      json(res, 500, { error: e.message });
    }
  });

  server.listen(config.adminPort, config.adminHost, () => {
    console.log(`[quản trị] http://${config.adminHost}:${config.adminPort}`);
  });

  server.on('error', (e) => console.error('[quản trị] Không mở được cổng:', e.message));
  return server;
}

module.exports = { startAdminServer };
