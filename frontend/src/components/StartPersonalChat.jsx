import { useCallback, useEffect, useRef, useState } from 'react';

const API = window.location.origin;

/** Mỗi lý do một bộ màu + biểu tượng, để nhìn là biết nặng nhẹ. */
const TONE = {
  not_installed: { icon: '🔌', box: 'bg-gray-50 border-gray-200', head: 'text-gray-700', body: 'text-gray-500' },
  no_account: { icon: '📭', box: 'bg-amber-50 border-amber-200', head: 'text-amber-800', body: 'text-amber-700' },
  unassigned: { icon: '🔑', box: 'bg-amber-50 border-amber-200', head: 'text-amber-800', body: 'text-amber-700' },
  not_owner: { icon: '🔒', box: 'bg-gray-50 border-gray-200', head: 'text-gray-700', body: 'text-gray-500' },
  disabled: { icon: '⏸️', box: 'bg-amber-50 border-amber-200', head: 'text-amber-800', body: 'text-amber-700' },
  all_disabled: { icon: '⏸️', box: 'bg-gray-50 border-gray-200', head: 'text-gray-700', body: 'text-gray-500' },
  need_qr: { icon: '📷', box: 'bg-amber-50 border-amber-200', head: 'text-amber-800', body: 'text-amber-700' },
  offline: { icon: '⚠️', box: 'bg-amber-50 border-amber-200', head: 'text-amber-800', body: 'text-amber-700' },
};

/**
 * Bắt đầu hội thoại Zalo cá nhân với khách của một lead.
 *
 * Ca dùng thật: nhân viên đã có số khách (từ Messenger / Zalo OA), cần tìm tài
 * khoản Zalo của số đó rồi nhắn trước.
 *
 * Khi kênh chưa dùng được, component này NÓI RÕ VÌ SAO thay vì để tab biến mất —
 * ẩn đi thì nhân viên không biết kênh tồn tại, cũng không biết phải hỏi ai.
 */
export default function StartPersonalChat({ leadId, phone, onLinked }) {
  const [status, setStatus] = useState(null);      // null | pending | done | not_found | failed
  const [avail, setAvail] = useState(null);        // tình trạng tích hợp Zalo của người đang xem
  const [error, setError] = useState(null);
  const [starting, setStarting] = useState(false);
  const pollRef = useRef(null);
  // Báo "đã nối xong" đúng MỘT lần. Nếu không, khung chat tải lại → chưa có tin
  // nào → component này hiện lại → lại báo → vòng lặp vô hạn, màn hình giật.
  const notifiedRef = useRef(false);

  const headers = () => ({
    Authorization: `Bearer ${localStorage.getItem('token')}`,
    'Content-Type': 'application/json',
  });

  const onLinkedRef = useRef(onLinked);
  onLinkedRef.current = onLinked;

  /** Kênh Zalo cá nhân có dùng được không, và nếu không thì vì sao. */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(`${API}/api/zalo/personal/status`, { headers: headers() });
        const d = await r.json();
        if (!cancelled) setAvail(r.ok ? d : { available: false, code: 'error', title: 'Không kiểm tra được tình trạng Zalo', detail: d?.error || '' });
      } catch (e) {
        if (!cancelled) setAvail({ available: false, code: 'error', title: 'Không kiểm tra được tình trạng Zalo', detail: e.message });
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const check = useCallback(async () => {
    try {
      const r = await fetch(`${API}/api/zalo/personal/leads/${leadId}/resolve`, { headers: headers() });
      const d = await r.json();
      const req = d?.request;
      if (!req) return;
      setStatus(req.status);
      if (req.status === 'done') {
        clearInterval(pollRef.current);
        if (!notifiedRef.current) {
          notifiedRef.current = true;
          onLinkedRef.current?.();
        }
      } else if (req.status === 'not_found' || req.status === 'failed') {
        clearInterval(pollRef.current);
        setError(req.error || null);
      }
    } catch (_) { /* để vòng sau thử lại */ }
  }, [leadId]);

  // Có yêu cầu đang chờ từ lần trước thì tiếp tục theo dõi
  useEffect(() => {
    check();
    return () => clearInterval(pollRef.current);
  }, [check]);

  useEffect(() => {
    if (status !== 'pending') return undefined;
    pollRef.current = setInterval(check, 4000);
    return () => clearInterval(pollRef.current);
  }, [status, check]);

  const start = async () => {
    setStarting(true);
    setError(null);
    try {
      const r = await fetch(`${API}/api/zalo/personal/leads/${leadId}/resolve`, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({}),
      });
      const d = await r.json();
      if (!r.ok) {
        setError(d?.error || 'Không tạo được yêu cầu tìm khách');
        setStatus('failed');
      } else if (d.already_linked) {
        if (!notifiedRef.current) { notifiedRef.current = true; onLinkedRef.current?.(); }
      } else {
        setStatus('pending');
      }
    } catch (e) {
      setError(e.message);
      setStatus('failed');
    } finally {
      setStarting(false);
    }
  };

  // ── Lead chưa có số thì không làm gì được ───────────────────
  if (!phone) {
    return (
      <div className="text-center text-gray-400 py-10 px-4">
        <p className="text-3xl mb-2">📱</p>
        <p className="text-sm text-gray-600 font-medium">Lead này chưa có số điện thoại</p>
        <p className="text-xs mt-1">Zalo cá nhân tìm khách theo số điện thoại. Thêm số cho khách hàng rồi quay lại đây.</p>
      </div>
    );
  }

  // ── Đang kiểm tra tình trạng tích hợp ───────────────────────
  if (avail === null) {
    return (
      <div className="text-center text-gray-400 py-10 px-4">
        <span className="inline-block w-4 h-4 border-2 border-gray-300 border-t-transparent rounded-full animate-spin" />
        <p className="text-xs mt-3">Đang kiểm tra kết nối Zalo…</p>
      </div>
    );
  }

  // ── Chưa dùng được: nói rõ vì sao và ai xử lý ───────────────
  if (!avail.available) {
    const tone = TONE[avail.code] || TONE.not_owner;
    return (
      <div className="py-8 px-4">
        <div className={`max-w-md mx-auto border rounded-xl p-5 text-center ${tone.box}`}>
          <p className="text-3xl mb-2">{tone.icon}</p>
          <p className={`text-sm font-semibold ${tone.head}`}>{avail.title}</p>
          {avail.detail && <p className={`text-xs mt-2 ${tone.body}`}>{avail.detail}</p>}
          {avail.action && (
            <p className={`text-xs mt-3 pt-3 border-t ${tone.body} border-current/20`}>
              <span className="font-semibold">Cần làm gì: </span>{avail.action}
            </p>
          )}
        </div>
        <p className="text-[11px] text-gray-400 text-center mt-3">
          Số khách hàng: <span className="font-mono">{phone}</span> — sẵn sàng nhắn ngay khi kênh hoạt động.
        </p>
      </div>
    );
  }

  // ── Dùng được: nút tìm khách ────────────────────────────────
  return (
    <div className="text-center py-10 px-4">
      <p className="text-3xl mb-2">📱</p>
      <p className="text-sm text-gray-700 font-medium">Chưa có hội thoại Zalo cá nhân với khách này</p>
      <p className="text-xs text-gray-500 mt-1">
        Số khách hàng: <span className="font-mono font-semibold text-gray-700">{phone}</span>
      </p>
      {avail.account?.oa_name && (
        <p className="text-[11px] text-gray-400 mt-1">
          Nhắn bằng tài khoản <span className="font-medium text-gray-600">{avail.account.oa_name}</span>
          {avail.account.account_phone ? ` · ${avail.account.account_phone}` : ''}
        </p>
      )}

      {status === 'pending' ? (
        <div className="mt-5">
          <div className="inline-flex items-center gap-2 text-sm text-blue-600">
            <span className="w-3.5 h-3.5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
            Đang tìm số này trên Zalo…
          </div>
          <p className="text-xs text-gray-400 mt-2">
            Máy công ty đang tra. Thường mất vài giây, trang này tự cập nhật.
          </p>
        </div>
      ) : status === 'not_found' ? (
        <div className="mt-5">
          <p className="text-sm text-amber-600">Không tìm thấy tài khoản Zalo cho số này.</p>
          <p className="text-xs text-gray-400 mt-1 max-w-sm mx-auto">
            Có thể số chưa đăng ký Zalo, hoặc khách đã tắt “cho phép tìm qua số điện thoại” trong
            phần riêng tư. Hệ thống không phân biệt được hai trường hợp này.
          </p>
          <button type="button" onClick={start} className="mt-3 text-xs text-blue-600 hover:underline">
            Thử tìm lại
          </button>
        </div>
      ) : (
        <div className="mt-5">
          <button
            type="button"
            onClick={start}
            disabled={starting}
            className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {starting ? 'Đang gửi yêu cầu…' : 'Tìm khách trên Zalo & bắt đầu nhắn'}
          </button>
          <p className="text-xs text-gray-400 mt-3 max-w-sm mx-auto">
            Máy công ty sẽ tìm tài khoản Zalo ứng với số này. Tìm được thì khung chat mở ra ngay
            tại đây và bạn nhắn được cho khách.
          </p>
          {error && <p className="text-xs text-red-500 mt-3 max-w-sm mx-auto">{error}</p>}
        </div>
      )}
    </div>
  );
}
