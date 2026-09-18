/**
 * Ai được dùng tài khoản Zalo cá nhân nào.
 *
 * Quy tắc: tài khoản Zalo thuộc về nhân viên có SỐ ĐIỆN THOẠI trùng với số của
 * chính tài khoản Zalo đó. Số này do máy công ty báo lên từ `fetchAccountInfo`,
 * không ai nhập tay, nên không gán nhầm được.
 *
 * Mọi chỗ kiểm quyền Zalo cá nhân phải đi qua file này — rải điều kiện ra nhiều
 * nơi là sớm muộn cũng sót một chỗ.
 */
const { supabase } = require('../config/supabase');

/** Chuẩn hoá về 0xxxxxxxxx; null nếu không phải di động Việt Nam hợp lệ. */
function normalizePhone(raw) {
  if (!raw) return null;
  let d = String(raw).replace(/\D/g, '');
  if (d.startsWith('84') && d.length === 11) d = `0${d.slice(2)}`;
  else if (d.length === 9 && !d.startsWith('0')) d = `0${d}`;
  if (d.length !== 10 || !d.startsWith('0')) return null;
  return /^0(3[2-9]|5[2689]|7[06-9]|8[1-9]|9[0-9])\d{7}$/.test(d) ? d : null;
}

/**
 * Máy công ty báo số của tài khoản Zalo → lưu lại và tìm chủ sở hữu.
 * @returns {Promise<{phone: string|null, ownerId: string|null, changed: boolean}>}
 */
async function syncAccountOwner(account, rawPhone) {
  const phone = normalizePhone(rawPhone);
  if (!phone) return { phone: null, ownerId: account.owner_user_id || null, changed: false };
  if (phone === account.account_phone && account.owner_user_id) {
    return { phone, ownerId: account.owner_user_id, changed: false };
  }

  // users.phone lưu đủ kiểu, có cả rác — so khớp sau khi chuẩn hoá hai đầu
  const { data: candidates } = await supabase
    .from('users')
    .select('id, full_name, phone')
    .not('phone', 'is', null);

  const owner = (candidates || []).find((u) => normalizePhone(u.phone) === phone) || null;

  await supabase.from('zalo_oa_accounts').update({
    account_phone: phone,
    owner_user_id: owner?.id || null,
    updated_at: new Date().toISOString(),
  }).eq('id', account.id);

  if (owner) {
    console.log(`[Zalo cá nhân] ${account.oa_name || account.oa_id} (${phone}) → ${owner.full_name}`);
  } else {
    console.warn(`[Zalo cá nhân] ${phone} không khớp nhân viên nào — tài khoản chưa có chủ`);
  }

  return { phone, ownerId: owner?.id || null, changed: true };
}

/**
 * @returns {{ok: boolean, reason?: string}} — `reason` là câu hiện cho người dùng
 */
function canUsePersonalAccount(user, account) {
  if (!account) return { ok: false, reason: 'Không tìm thấy tài khoản Zalo' };
  if (account.account_kind !== 'personal') return { ok: true };

  // Số tổng đài dùng chung — admin bật cờ này khi số thật sự của cả nhóm
  if (account.share_mode === 'team') return { ok: true };

  // KHÔNG có cửa sau cho admin. Khách nhìn thấy tên nhân viên nào thì chỉ nhân
  // viên đó nhắn được, và chat của người này người khác không đọc được.
  // Admin vẫn quản lý tài khoản (thêm, xoá, đăng xuất, quét QR) qua đường riêng,
  // nhưng không đọc và không gửi thay.
  if (account.owner_user_id && String(account.owner_user_id) === String(user?.id)) {
    return { ok: true };
  }

  if (!account.owner_user_id) {
    return {
      ok: false,
      reason: 'Tài khoản Zalo này chưa gán được cho nhân viên nào. Quản trị viên cần điền đúng số điện thoại vào hồ sơ nhân viên sở hữu số đó.',
    };
  }

  return {
    ok: false,
    reason: 'Tài khoản Zalo này của nhân viên khác. Bạn chỉ dùng được số Zalo đăng ký bằng số điện thoại của mình.',
  };
}

/** Những tài khoản cá nhân mà người này được dùng. */
async function listUsableAccounts(user, { onlyOnline = false } = {}) {
  let q = supabase.from('zalo_oa_accounts')
    .select('*')
    .eq('account_kind', 'personal')
    .eq('is_active', true);

  if (onlyOnline) q = q.eq('bridge_status', 'online');

  const { data } = await q.order('oa_name');
  return (data || []).filter((a) => canUsePersonalAccount(user, a).ok);
}

/**
 * Tài khoản nên dùng để nhắn cho một lead: ưu tiên đúng tài khoản của người
 * đang thao tác, để tin đi từ số Zalo của chính họ.
 */
async function pickAccountForUser(user, preferredOaId = null) {
  const usable = await listUsableAccounts(user, { onlyOnline: true });
  if (!usable.length) return null;

  if (preferredOaId) {
    const picked = usable.find((a) => a.oa_id === preferredOaId);
    if (picked) return picked;
  }

  const own = usable.find((a) => String(a.owner_user_id) === String(user?.id));
  return own || usable[0];
}


/**
 * Vì sao người này chưa dùng được Zalo cá nhân — để giao diện nói thẳng lý do
 * thay vì ẩn tab đi. Ẩn đi thì nhân viên không biết hỏi ai.
 *
 * @returns {Promise<{available: boolean, code: string, title: string,
 *                    detail: string, action?: string, account?: object}>}
 */
async function describePersonalAvailability(user) {
  const { data: all } = await supabase
    .from('zalo_oa_accounts')
    .select('*')
    .eq('account_kind', 'personal');

  const accounts = all || [];

  if (!accounts.length) {
    const { data: gateways } = await supabase.from('zalo_gateways').select('id').limit(1);
    return gateways?.length
      ? {
        available: false,
        code: 'no_account',
        title: 'Chưa có tài khoản Zalo nào được kết nối',
        detail: 'Máy công ty đã cài nhưng chưa ai đăng nhập tài khoản Zalo vào đó.',
        action: 'Quản trị viên vào trang quản trị của máy công ty để thêm tài khoản và quét mã QR.',
      }
      : {
        available: false,
        code: 'not_installed',
        title: 'Zalo cá nhân chưa được tích hợp',
        detail: 'Hệ thống chưa có máy nào giữ tài khoản Zalo. Kênh này chưa dùng được.',
        action: 'Liên hệ quản trị viên để cài đặt.',
      };
  }

  const usable = accounts.filter((a) => a.is_active && canUsePersonalAccount(user, a).ok);

  if (!usable.length) {
    // Tài khoản CỦA CHÍNH NGƯỜI NÀY nhưng đang bị tắt — nói thẳng, đừng để họ
    // tưởng chưa có tài khoản nào.
    const mineButOff = accounts.filter((a) => !a.is_active && canUsePersonalAccount(user, a).ok);
    if (mineButOff.length) {
      const a = mineButOff[0];
      return {
        available: false,
        code: 'disabled',
        title: 'Tài khoản Zalo của bạn đang tắt',
        detail: `“${a.oa_name || a.oa_id}”${a.account_phone ? ` (${a.account_phone})` : ''} đã bị tắt trên máy công ty nên không nhận và không gửi tin được.`,
        action: 'Nhờ quản trị viên bật lại trong trang quản trị của máy công ty.',
        account: a,
      };
    }

    // Không tài khoản nào đang bật — kênh coi như dừng hẳn
    if (!accounts.some((a) => a.is_active)) {
      return {
        available: false,
        code: 'all_disabled',
        title: 'Kênh Zalo cá nhân đang tắt',
        detail: `Cả ${accounts.length} tài khoản Zalo đều đã bị tắt trên máy công ty.`,
        action: 'Nhờ quản trị viên bật lại tài khoản cần dùng.',
      };
    }

    const unassigned = accounts.filter((a) => !a.owner_user_id);
    if (unassigned.length === accounts.length) {
      return {
        available: false,
        code: 'unassigned',
        title: 'Tài khoản Zalo chưa gán cho nhân viên nào',
        detail: `Đang có ${accounts.length} tài khoản Zalo nhưng chưa khớp được với hồ sơ nhân viên nào.`,
        action: 'Quản trị viên điền đúng số điện thoại của tài khoản Zalo vào hồ sơ nhân viên sở hữu số đó.',
      };
    }
    return {
      available: false,
      code: 'not_owner',
      title: 'Bạn chưa có tài khoản Zalo riêng',
      detail: 'Các tài khoản Zalo đang kết nối đều thuộc nhân viên khác. Bạn chỉ dùng được số Zalo đăng ký bằng chính số điện thoại trong hồ sơ của mình.',
      action: 'Nhờ quản trị viên kết nối số Zalo của bạn, và kiểm tra số điện thoại trong hồ sơ nhân viên đã đúng chưa.',
    };
  }

  const online = usable.filter((a) => a.bridge_status === 'online');
  if (!online.length) {
    const needQr = usable.find((a) => a.bridge_status === 'need_qr');
    return needQr
      ? {
        available: false,
        code: 'need_qr',
        title: 'Tài khoản Zalo của bạn đã đăng xuất',
        detail: `“${needQr.oa_name || needQr.oa_id}” cần quét lại mã QR trên máy công ty.`,
        action: 'Nhờ quản trị viên quét lại mã QR.',
        account: needQr,
      }
      : {
        available: false,
        code: 'offline',
        title: 'Máy công ty đang không chạy',
        detail: 'Tài khoản Zalo của bạn có kết nối nhưng máy giữ phiên đang tắt hoặc mất mạng.',
        action: 'Tin bạn gõ vẫn được lưu và sẽ tự gửi khi máy chạy lại.',
        account: usable[0],
      };
  }

  return {
    available: true,
    code: 'ok',
    title: 'Sẵn sàng',
    detail: '',
    account: online[0],
  };
}

module.exports = {
  normalizePhone,
  syncAccountOwner,
  canUsePersonalAccount,
  listUsableAccounts,
  pickAccountForUser,
  describePersonalAvailability,
};
