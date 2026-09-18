/**
 * Vòng đời một tài khoản Zalo bên trong tiến trình con.
 *
 * Mỗi tài khoản tự giữ: phiên Zalo, allowlist, hàng đợi đĩa, vòng lấy tin gửi.
 * Một tài khoản hỏng không đụng tới tài khoản khác trong cùng tiến trình.
 */
const config = require('./config');
const store = require('./crm');
const { createSpool } = require('./spool');
const { createZcaTransport } = require('./transports/zca');
const { extractVnPhone, normalizeVnPhone } = require('./phone');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Giãn cách giữa hai lần tra số điện thoại, để không thành dò hàng loạt. */
const LOOKUP_GAP_MS = 20000;

/** Rớt kết nối Zalo quá lâu thì tự dựng lại phiên. */
const OFFLINE_RESTART_MS = 90000;
const WATCHDOG_TICK_MS = 15000;

function createAccountRunner(account) {
  const oaId = account.oa_id;
  const tag = `[${account.oa_name || oaId}]`;
  const spool = createSpool(config.spoolFileFor(oaId));

  let transport = null;
  let allowlist = new Set();
  let status = 'offline';
  let note = null;
  let stopping = false;
  let lastQrAt = 0;
  // Thời điểm rớt kết nối Zalo. Bộ điều phối chỉ canh TIẾN TRÌNH chết, không
  // canh phiên Zalo chết — mà zca-js có ngân sách thử lại hữu hạn do chính
  // Zalo quy định, hết lượt là listener im luôn. Không có canh gác ở đây thì
  // tài khoản nằm chết hàng giờ mà không ai biết.
  let offlineSince = null;
  let restarting = false;
  const probedThreads = new Set();
  // Mã những tin CRM vừa gửi. selfListen bật nên Zalo vọng chúng về qua
  // WebSocket; nếu ghi tiếp thì vừa trùng dòng, vừa chạy đua với lệnh ghi mã tin
  // của hàng đợi. CRM đã có sẵn nội dung rồi nên bỏ qua là đúng.
  const sentByUs = new Set();

  const state = () => ({
    oa_id: oaId,
    oa_name: account.oa_name,
    status,
    note,
    transport: transport?.name || null,
    // Chuẩn hoá về 0xxxxxxxxx cho khớp với CRM — Zalo trả dạng +84xxxxxxxxx
    account_phone: normalizeVnPhone(transport?.selfPhone || '') || transport?.selfPhone || null,
    pending: spool.size(),
  });

  // ── Tin đến ────────────────────────────────────────────────

  /**
   * Hội thoại lạ → xem hồ sơ người vừa nhắn MỘT lần để lấy SĐT, nhờ đó backend
   * khớp được với lead.
   *
   * Zalo chỉ trả số khi người đó là bạn bè hoặc có chia sẻ số; với người lạ
   * thường rỗng. Nên đây là đường "được thì tốt" — không thay thế được việc tra
   * theo yêu cầu từ lead. Mỗi hội thoại chỉ hỏi một lần, dù có rỗng, để không
   * biến thành vòng lặp hỏi hồ sơ.
   */
  async function enrichUnknownThread(threadId) {
    if (probedThreads.has(threadId) || !transport?.getProfile) return null;
    probedThreads.add(threadId);
    try {
      const profile = await transport.getProfile(threadId);
      if (profile?.phone) console.log(`${tag} Lấy được SĐT của ${threadId}`);
      return profile;
    } catch (e) {
      console.warn(`${tag} Không lấy được hồ sơ ${threadId}:`, e.message);
      return null;
    }
  }

  async function handleIncoming(payload) {
    if (payload.msg_id && sentByUs.has(String(payload.msg_id))) {
      sentByUs.delete(String(payload.msg_id));
      return;
    }

    const allowed = allowlist.has(String(payload.thread_id));

    // Chưa gắn lead và là tin của khách gửi tới → thử lấy SĐT để backend khớp lead
    if (!allowed && payload.direction !== 'outbound') {
      const profile = await enrichUnknownThread(String(payload.thread_id));
      if (profile?.phone) payload.phone = profile.phone;
      if (profile?.display_name && !payload.display_name) payload.display_name = profile.display_name;
      if (profile?.avatar_url) payload.avatar_url = profile.avatar_url;

      // Hồ sơ không có số thì thử tách số khách tự gõ trong tin.
      // Tách ở đây, chỉ gửi con số lên — nội dung tin vẫn ở lại máy này.
      if (!payload.phone) payload.phone = extractVnPhone(payload.content) || undefined;
    }

    // Hội thoại chưa gắn lead: chỉ báo tên + thời điểm, KHÔNG gửi nội dung.
    // Chat riêng tư không bao giờ rời khỏi máy này.
    const toSend = allowed ? payload : {
      thread_id: payload.thread_id,
      thread_type: payload.thread_type,
      display_name: payload.display_name,
      avatar_url: payload.avatar_url,
      // SĐT là thứ giúp backend khớp ra lead. Nội dung tin thì vẫn KHÔNG gửi
      // chừng nào hội thoại chưa gắn lead.
      phone: payload.phone,
      direction: payload.direction,
      transport: payload.transport,
    };

    // Còn tin tồn từ lần mất mạng trước thì xếp hàng phía sau, giữ đúng thứ tự.
    if (spool.size() > 0) {
      spool.append(toSend);
      return;
    }

    try {
      await store.pushMessages(oaId, [toSend]);
    } catch (e) {
      console.warn(`${tag} CRM không nhận được, cất vào hàng đợi:`, e.message);
      spool.append(toSend);
    }
  }

  // ── Vòng lặp nền ───────────────────────────────────────────

  async function allowlistLoop() {
    while (!stopping) {
      try {
        const ids = await store.getAllowlist(oaId);
        allowlist = new Set((ids || []).map(String));
      } catch (e) {
        console.warn(`${tag} Không lấy được allowlist:`, e.message);
      }
      await sleep(config.allowlistRefreshMs);
    }
  }

  async function outboxLoop() {
    while (!stopping) {
      try {
        if (transport && status === 'online') {
          const messages = await store.pollOutbox(oaId, 10);
          for (const item of messages || []) {
            try {
              const { msgId } = await transport.send(item.thread_id, item.content);
              if (msgId) sentByUs.add(String(msgId));
              // CRM chỉ xếp hàng gửi cho hội thoại đã gắn lead, nên cập nhật
              // allowlist ngay thay vì đợi vòng làm mới 60 giây — nếu không,
              // tin khách trả lời ngay sau đó sẽ bị cắt mất nội dung.
              allowlist.add(String(item.thread_id));
              await store.ackOutbox(item.id, { ok: true, zalo_msg_id: msgId });
              console.log(`${tag} Đã gửi → ${item.thread_id}`);
            } catch (e) {
              console.error(`${tag} Gửi thất bại → ${item.thread_id}:`, e.message);
              await store.ackOutbox(item.id, { ok: false, error: e.message });
            }
          }
        }
      } catch (e) {
        console.warn(`${tag} Lỗi vòng lặp outbox:`, e.message);
      }
      await sleep(config.outboxPollMs);
    }
  }

  /**
   * Tra số điện thoại ra tài khoản Zalo, phục vụ việc khớp hội thoại với lead.
   *
   * Cố ý chậm: mỗi lần chỉ lấy tối đa 5 yêu cầu và giãn 20 giây giữa các lần
   * tra. Dò số hàng loạt là hành vi khiến Zalo khoá tài khoản, nên backend đã
   * chặn hạn mức theo giờ và ở đây giãn thêm một lớp nữa.
   */
  async function linkRequestLoop() {
    while (!stopping) {
      try {
        if (transport?.findUserByPhone && status === 'online') {
          const requests = await store.getLinkRequests(oaId);
          for (const req of requests) {
            try {
              const user = await transport.findUserByPhone(req.phone);
              if (user?.uid) {
                await store.ackLinkRequest(req.id, {
                  zalo_uid: user.uid,
                  display_name: user.display_name,
                  avatar_url: user.avatar_url,
                });
                // Backend vừa tạo hội thoại gắn lead — cho vào allowlist ngay
                allowlist.add(String(user.uid));
                console.log(`${tag} Khớp ${req.phone} → ${user.uid}`);
              } else {
                await store.ackLinkRequest(req.id, { not_found: true });
                console.log(`${tag} ${req.phone} không có tài khoản Zalo`);
              }
            } catch (e) {
              await store.ackLinkRequest(req.id, { error: e.message }).catch(() => {});
              console.warn(`${tag} Tra ${req.phone} thất bại:`, e.message);
            }
            await sleep(LOOKUP_GAP_MS);
          }
        }
      } catch (e) {
        console.warn(`${tag} Lỗi vòng tra số:`, e.message);
      }
      await sleep(config.linkPollMs);
    }
  }

  /**
   * Canh phiên Zalo. Rớt quá lâu thì dựng lại transport cho RIÊNG tài khoản này —
   * không giết cả tiến trình, vì những tài khoản khác trong cùng cụm vẫn đang chạy tốt.
   */
  async function watchdogLoop() {
    while (!stopping) {
      await sleep(WATCHDOG_TICK_MS);
      if (stopping || restarting || !offlineSince) continue;
      if (Date.now() - offlineSince < OFFLINE_RESTART_MS) continue;

      const downFor = Math.round((Date.now() - offlineSince) / 1000);
      console.warn(`${tag} Mất kết nối Zalo ${downFor}s — dựng lại phiên.`);
      restarting = true;
      try {
        try { await transport?.stop(); } catch (_) { /* ignore */ }
        transport = await createZcaTransport(account, hooks);
        offlineSince = null;
        console.log(`${tag} Đã dựng lại phiên.`);
      } catch (e) {
        status = 'error';
        note = `Dựng lại phiên thất bại: ${e.message}`.slice(0, 300);
        console.error(`${tag} Dựng lại phiên thất bại:`, e.message);
        offlineSince = Date.now(); // thử lại ở vòng sau
      } finally {
        restarting = false;
      }
    }
  }

  async function spoolLoop() {
    while (!stopping) {
      if (spool.size() > 0) {
        const res = await spool.flush((batch) => store.pushMessages(oaId, batch));
        if (res.sent) console.log(`${tag} Đã gửi bù ${res.sent} tin.`);
      }
      await sleep(config.spoolRetryMs);
    }
  }

  // ── Khởi động ──────────────────────────────────────────────

  const hooks = {
    onMessage: handleIncoming,
    onStatus: (s, n) => {
      status = s;
      note = n || null;
      // need_qr chờ người quét, không phải sự cố kỹ thuật → không tính là rớt
      if (s === 'online' || s === 'need_qr') offlineSince = null;
      else if (!offlineSince) offlineSince = Date.now();
      console.log(`${tag} ${s}${n ? ` — ${n}` : ''}`);
    },
    onQr: (base64) => {
      // Đẩy mã QR lên CRM để admin quét từ xa. Giới hạn nhịp để mỗi lần mã hết
      // hạn (khoảng 1 phút) không thành một trận bão request.
      const now = Date.now();
      if (base64 && now - lastQrAt < 20000) return;
      lastQrAt = now;
      store.pushQr(oaId, base64).catch((e) => console.warn(`${tag} Đẩy QR thất bại:`, e.message));
    },
  };

  async function start() {
    const pending = spool.size();
    if (pending) console.log(`${tag} Có ${pending} tin tồn từ lần chạy trước, sẽ gửi bù.`);

    try {
      transport = await createZcaTransport(account, hooks);
    } catch (e) {
      status = 'error';
      note = String(e.message).slice(0, 300);
      console.error(`${tag} Không khởi động được transport:`, e.message);
      // Không ném ra ngoài: tài khoản này hỏng nhưng tiến trình vẫn phục vụ
      // những tài khoản còn lại.
      return;
    }

    allowlistLoop();
    outboxLoop();
    spoolLoop();
    linkRequestLoop();
    watchdogLoop();
  }

  async function stop() {
    stopping = true;
    try { await transport?.stop(); } catch (_) { /* ignore */ }
  }

  async function logout() {
    stopping = true;
    try { await transport?.logout(); } catch (_) { /* ignore */ }
    status = 'offline';
    note = 'Đã đăng xuất theo lệnh quản trị';
  }

  return { oaId, start, stop, logout, state };
}

module.exports = { createAccountRunner };
