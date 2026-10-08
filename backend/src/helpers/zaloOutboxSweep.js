/**
 * Dọn hàng đợi Zalo cá nhân bị kẹt ở trạng thái 'sending'.
 *
 * GET /outbox đổi 'pending' → 'sending' để hai tiến trình không gửi trùng.
 * Nếu cổng nhận được danh sách rồi mất mạng trước khi ack, hàng đó nằm lại
 * 'sending' mãi mãi: nhân viên thấy tin chưa gửi xong, mà thực tế không ai
 * biết nó đã tới tay khách hay chưa.
 *
 * CỐ Ý KHÔNG tự gửi lại. Cổng có thể đã gửi thành công rồi mới mất mạng, nên
 * tự động thử lại là nguy cơ khách nhận hai lần — khó chịu hơn hẳn so với việc
 * hiện cảnh báo để nhân viên tự quyết. Đổi ý thì sửa 'failed' thành 'pending'
 * và bỏ dòng last_error.
 */
const { supabase } = require('../config/supabase');

/** Quá hạn này mà chưa ack thì coi như cổng đã mất liên lạc giữa chừng. */
const STUCK_MS = Number(process.env.ZALO_OUTBOX_STUCK_MS) || 5 * 60 * 1000;

const STUCK_NOTE = 'Cổng đã nhận nhưng không báo kết quả — có thể đã gửi tới khách. '
  + 'Kiểm tra Zalo trước khi gửi lại.';

async function sweepStuckSending(io) {
  const deadline = new Date(Date.now() - STUCK_MS).toISOString();

  const { data: stuck, error } = await supabase
    .from('zalo_outbox')
    .select('id, contact_id, message_id, oa_id')
    .eq('status', 'sending')
    .lt('claimed_at', deadline)
    .limit(50);

  if (error) throw new Error(error.message);
  if (!stuck?.length) return 0;

  const now = new Date().toISOString();
  const { error: upErr } = await supabase
    .from('zalo_outbox')
    .update({ status: 'failed', last_error: STUCK_NOTE, updated_at: now })
    .in('id', stuck.map((row) => row.id))
    .eq('status', 'sending');

  if (upErr) throw new Error(upErr.message);

  for (const row of stuck) {
    try {
      io?.emit('zalo_outbox_ack', {
        outbox_id: row.id,
        contact_id: row.contact_id,
        message_id: row.message_id,
        ok: false,
        error: STUCK_NOTE,
      });
    } catch (_) { /* ignore */ }
  }

  console.warn(`[Zalo outbox] ${stuck.length} tin kẹt quá ${Math.round(STUCK_MS / 60000)} phút — đánh dấu thất bại.`);
  return stuck.length;
}

module.exports = { sweepStuckSending, STUCK_MS, STUCK_NOTE };
