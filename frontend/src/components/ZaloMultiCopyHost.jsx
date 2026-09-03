import { useEffect, useState } from 'react';
import { Images, Loader2, X } from 'lucide-react';
import { copyImageToClipboard } from '../lib/messengerMessageActions';
import { endZaloCopySession } from '../lib/zaloCopySession';
import { showCopyToast } from '../lib/copyToast';

/** Thanh nổi: copy từng ảnh để dán Zalo (trình duyệt không ghi được nhiều file một lúc). */
export default function ZaloMultiCopyHost() {
  const [session, setSession] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const onSession = (e) => setSession(e.detail || null);
    window.addEventListener('app:zalo-copy-session', onSession);
    return () => window.removeEventListener('app:zalo-copy-session', onSession);
  }, []);

  if (!session?.urls?.length) return null;

  const total = session.urls.length;
  const nextIndex = session.nextIndex || 0;
  const copied = Math.min(nextIndex, total);
  const done = nextIndex >= total;

  const copyNext = async () => {
    if (busy || done) return;
    setBusy(true);
    try {
      const kind = await copyImageToClipboard(session.urls[nextIndex]);
      const ni = nextIndex + 1;
      setSession({ ...session, nextIndex: ni });
      if (kind === 'url') {
        showCopyToast(`Đã copy link ảnh ${ni}/${total}`);
      } else if (ni >= total) {
        showCopyToast(`Đã copy ảnh ${total}/${total} — dán Zalo (Ctrl+V)`);
      } else {
        showCopyToast(`Đã copy ảnh ${ni}/${total} — dán Zalo, rồi bấm Ảnh tiếp`);
      }
    } catch (err) {
      alert(err?.message || 'Không sao chép được ảnh');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed bottom-5 left-1/2 z-[10000] w-[min(440px,calc(100vw-24px))] -translate-x-1/2 rounded-2xl border border-[#1877f2]/25 bg-white px-3.5 py-3 shadow-xl"
      role="status"
      aria-live="polite"
    >
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#e7f3ff] text-[#1877f2]">
          <Images size={18} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold text-[#050505]">
            {done ? `Đã copy hết ${total} ảnh` : `Dán Zalo từng ảnh (${copied}/${total})`}
          </p>
          <p className="mt-0.5 text-[12px] leading-snug text-[#65676b]">
            {done
              ? 'Ctrl+V lần cuối trong Zalo. Trình duyệt không copy được nhiều ảnh một lúc.'
              : 'Mở ô chat Zalo → Ctrl+V → quay lại đây bấm Ảnh tiếp.'}
          </p>
        </div>
        <button
          type="button"
          className="rounded-lg p-1 text-[#65676b] hover:bg-[#f0f2f5]"
          title="Đóng"
          onClick={() => { setSession(null); endZaloCopySession(); }}
        >
          <X size={16} />
        </button>
      </div>
      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        {!done ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => void copyNext()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#1877f2] px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-[#166fe5] disabled:opacity-60"
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            Ảnh tiếp ({copied + 1}/{total})
          </button>
        ) : null}
        <span className="text-[11px] text-[#8a8d91]">
          {Array.from({ length: total }, (_, i) => (i < copied ? '●' : '○')).join(' ')}
        </span>
      </div>
    </div>
  );
}
