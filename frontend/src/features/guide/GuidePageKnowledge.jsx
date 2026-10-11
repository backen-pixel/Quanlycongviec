/**
 * TAB "KIẾN THỨC TRANG" — nằm TRONG bảng Hành động của trợ lý, chỉ admin thấy.
 *
 * ═══════════════ VÌ SAO LÀ TAB, KHÔNG PHẢI MỘT BẢNG NỔI RIÊNG ═══════════════
 *
 * Bản đầu là một nút nổi riêng ở góc trái dưới. Hai bảng nổi cùng lúc cho cùng một người (admin)
 * là hai thứ tranh chỗ trên màn hình họ đang làm việc, và người đọc phải tự đoán cái nào nói về
 * cái gì. Gộp vào một khung thì mọi công cụ soi trợ lý nằm cùng chỗ, mở một lần thấy hết.
 *
 * Gộp cũng bỏ được toàn bộ phần khung riêng — nút thu gọn, trạng thái mở, định vị cố định — nay
 * do bảng Hành động lo. Và nó cho luôn một cổng tiết kiệm: component chỉ mount khi tab đang mở,
 * nên đóng tab là không còn request nào, giống hệt các tab khác của bảng đó.
 *
 * ═══════════════ VÌ SAO PHẢI Ở TRÊN TRANG, KHÔNG PHẢI TRONG MÀN HÌNH CÀI ĐẶT ═══════════════
 *
 * Màn hình Cài đặt → Kiến thức quản lý được cả kho, nhưng nó trả lời sai câu hỏi. Người phát hiện
 * ra một trang thiếu tài liệu là người đang DÙNG trang đó và thấy trợ lý trả lời ngớ ngẩn — bắt
 * họ nhớ đường dẫn, mở trang khác, tìm lại trong danh sách 334 mục là đủ để việc đó không bao giờ
 * được làm.
 *
 * Quan trọng hơn: chỉ ở đây mới quét được giao diện thật. Tab, nút, trường nhập của một trang chỉ
 * tồn tại trong DOM khi trang đó đang mở.
 *
 * ═══════════════ "CÓ KIẾN THỨC CHƯA" KHÔNG PHẢI CÂU HỎI CÓ/KHÔNG ═══════════════
 *
 * Generator sinh bản ghi cho MỌI route, nên `found` gần như luôn đúng. Cái thật sự quyết định là
 * bản ghi đó có `summary` và `keywords` chưa — thiếu từ khoá thì nó gần như không bao giờ được
 * tra ra, tức có cũng như không. Nên có BA trạng thái, không phải hai.
 *
 * ═══════════════ NGƯỜI BẤM LƯU, KHÔNG PHẢI MÁY ═══════════════
 *
 * Quét xong là hiện bản nháp để đọc, rồi mới có nút Lưu. Kho kiến thức là thứ mọi câu trả lời của
 * trợ lý dựa vào: một mục sai ở đây sai với mọi người hỏi, mãi mãi, cho tới khi ai đó tình cờ
 * phát hiện. Không có đường tắt nào cho máy ghi thẳng.
 */
import { useCallback, useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Loader2, RefreshCw, Save, ScanLine, X } from 'lucide-react';
import api from '../../lib/api';
import { matchScreen } from './lib/matchScreen';
import { scanPageStructure } from './lib/pageStructureScanner';

/**
 * Chờ một nhịp trước khi hỏi máy chủ sau mỗi lần đổi trang.
 *
 * Điều hướng bằng router hay kéo theo vài lần render liên tiếp (redirect, guard, tải dữ liệu), và
 * hỏi ở mỗi lần là bắn 3-4 request cho cùng một trang. 600 ms đủ để mọi thứ lắng xuống.
 */
const SETTLE_MS = 600;

export default function GuidePageKnowledge() {
  const location = useLocation();
  const [info, setInfo] = useState(null);      // kết quả /knowledge/for-path
  const [loading, setLoading] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState(null);    // bản nháp chờ người duyệt
  const [note, setNote] = useState('');
  /** Mẩu dữ liệu nhất thời trợ lý lỡ chép vào bản nháp — cảnh báo, không tự xoá. */
  const [transient, setTransient] = useState([]);

  const screen = matchScreen(location.pathname);
  const canonicalPath = screen?.path || '';

  const fetchInfo = useCallback(async (p) => {
    if (!p) { setInfo(null); return; }
    setLoading(true);
    try {
      const { data } = await api.get('/copilotkit/knowledge/for-path', { params: { path: p } });
      setInfo(data);
    } catch {
      // Công cụ phụ trợ cho admin — hỏng thì im, tuyệt đối không chen thông báo lỗi vào màn hình
      // của người đang làm việc khác.
      setInfo(null);
    } finally {
      setLoading(false);
    }
  }, []);

  // Đổi trang thì mọi thứ của trang cũ phải biến mất — nhất là bản nháp, vì lưu nhầm nháp của
  // trang trước vào trang sau là hỏng dữ liệu chứ không phải phiền một chút.
  useEffect(() => {
    setDraft(null);
    setNote('');
    setTransient([]);
    setInfo(null);
    if (!canonicalPath) return undefined;
    const id = setTimeout(() => { fetchInfo(canonicalPath); }, SETTLE_MS);
    return () => clearTimeout(id);
  }, [canonicalPath, fetchInfo]);

  const scan = async () => {
    setScanning(true);
    setNote('');
    setTransient([]);
    try {
      // Quét NGAY lúc bấm, không dùng lại kết quả quét cũ: người dùng thường mở đúng tab cần tài
      // liệu rồi mới bấm, và tab đang mở quyết định nút nào có trong DOM.
      const structure = scanPageStructure();
      const { data } = await api.post('/copilotkit/knowledge/scan', {
        path: canonicalPath,
        label_hint: screen?.label || '',
        menu_hint: screen?.menu || '',
        structure: structure,
      });
      setDraft(data.draft);
      const bits = [`quét được ${data.observed.tabs} tab · ${data.observed.buttons} nút · ${data.observed.fields} trường`];
      if (data.dropped_actions > 0) bits.push(`bỏ ${data.dropped_actions} nhãn nút không khớp giao diện`);
      setNote(bits.join(' · '));
      setTransient(data.transient || []);
    } catch (e) {
      setNote(e?.response?.data?.error || 'Không quét được trang này');
    } finally {
      setScanning(false);
    }
  };

  const save = async () => {
    if (!draft) return;
    setSaving(true);
    try {
      const { data } = info?.found
        ? (await api.put('/copilotkit/knowledge', draft))
        : (await api.post('/copilotkit/knowledge', draft));
      if (data?.ok === false) { setNote(data.reason || 'Không lưu được'); return; }
      // Nói ra khi vector chưa nhúng — im lặng ở đây là để mục vừa lưu lặng lẽ mất tầng ngữ nghĩa.
      setNote(data?.vector === 'pending'
        ? 'Đã lưu. Vector chưa nhúng xong — vòng lặp nền sẽ bù, tạm thời mục này tra bằng từ khoá.'
        : 'Đã lưu — lượt hỏi tiếp theo dùng ngay bản mới.');
      setDraft(null);
      setTransient([]);
      await fetchInfo(canonicalPath);
    } catch (e) {
      setNote(e?.response?.data?.reason || e?.response?.data?.error || 'Không lưu được');
    } finally {
      setSaving(false);
    }
  };

  // Route không có trong bản đồ màn hình thì không có gì để gắn kiến thức vào.
  if (!canonicalPath) {
    return (
      <p className="guide-act__empty">
        Trang này không có trong bản đồ màn hình nên chưa gắn kiến thức được.
        Nếu đây là route mới, chạy <code>npm run guide:sync</code> rồi dựng lại.
      </p>
    );
  }

  const live = (info?.entries || []).filter((x) => !x.discarded);
  const state = !info ? 'unknown' : (info.complete ? 'ok' : (info.found ? 'thieu' : 'trong'));
  const COLOR = {
    ok: 'bg-emerald-500', thieu: 'bg-amber-500', trong: 'bg-rose-500', unknown: 'bg-gray-400',
  }[state];
  const TEXT = {
    ok: 'Trang này đã có kiến thức',
    thieu: 'Có bản ghi nhưng thiếu mô tả / từ khoá',
    trong: 'Trang này CHƯA có kiến thức',
    unknown: 'Đang kiểm tra…',
  }[state];

  return (
    <div className="text-xs leading-relaxed">
      <div className="flex items-center gap-2 mb-1.5">
        <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${COLOR}`} />
        <span className="font-semibold">{TEXT}</span>
        {loading && <Loader2 className="h-3 w-3 animate-spin opacity-60" />}
        <button
          type="button"
          onClick={() => fetchInfo(canonicalPath)}
          disabled={loading || scanning}
          title="Đọc lại trạng thái từ kho"
          className="ml-auto p-1 rounded hover:bg-black/10 disabled:opacity-40 cursor-pointer"
        >
          <RefreshCw className="h-3 w-3" />
        </button>
      </div>

      <div className="font-mono opacity-60 break-all mb-1.5">{canonicalPath}</div>

      {live.length === 0 && !loading && (
        <div className="opacity-70 mb-1.5">Chưa có bản ghi nào cho đường dẫn này trong kho.</div>
      )}

      {live.map((x) => (
        <div key={`${x.source}#${x.path}`} className="mb-1.5 rounded border border-current/20 p-1.5">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="font-medium">{x.label || '(chưa có tên)'}</span>
            <span className="px-1 rounded bg-black/20 text-[10px]">{x.source}</span>
            {x.hand_edited && <span className="px-1 rounded bg-indigo-500/30 text-[10px]">đã sửa tay</span>}
          </div>
          <Row k="menu" v={x.menu} />
          <Row k="tóm tắt" v={x.summary} />
          <Row k="từ khoá" v={x.keywords.length ? x.keywords.join(' · ') : ''} />
          <div className="opacity-50 mt-0.5">
            nội dung sâu: {x.content_len ? `${x.content_len} ký tự` : 'chưa có'}
            {' · '}nhãn nút: {x.actions_count || 0}
          </div>
        </div>
      ))}

      {draft && (
        <div className="mb-1.5 rounded border border-violet-400/60 bg-violet-500/10 p-1.5">
          <div className="font-semibold mb-1">Bản nháp trợ lý vừa soạn — đọc rồi bấm Lưu</div>
          <Row k="tên" v={draft.label} />
          <Row k="menu" v={draft.menu} />
          <Row k="tóm tắt" v={draft.summary} />
          <Row k="từ khoá" v={(draft.keywords || []).join(' · ')} />
          <Row k="nhãn nút" v={(draft.actions || []).map((a) => a.label).join(' · ')} />

          {transient.length > 0 && (
            <div className="mt-1.5 px-1.5 py-1 rounded bg-rose-500/20 border border-rose-400/60">
              <div className="font-semibold">Bản nháp còn dữ liệu của thời điểm này:</div>
              <div>{[...new Set(transient.map((t) => t.mau))].join(' · ')}</div>
              {/* Không tự xoá: có con số là thật và cố ý ("tối đa 50 dòng"). Người đọc quyết định. */}
              <div className="opacity-80">
                Số đếm và trạng thái tab sẽ sai ngay ngày mai. Sửa lại ở Cài đặt → Trợ lý → Kiến thức
                sau khi lưu, hoặc bấm Bỏ rồi quét lại.
              </div>
            </div>
          )}

          {draft.content && (
            <div className="mt-1">
              <div className="opacity-60">nội dung sâu</div>
              <div className="whitespace-pre-wrap max-h-40 overflow-y-auto">{draft.content}</div>
            </div>
          )}
        </div>
      )}

      {note && <div className="mb-1.5 opacity-80">{note}</div>}

      <div className="flex items-center gap-1.5 flex-wrap">
        <button
          type="button"
          onClick={scan}
          disabled={scanning || saving}
          className="h-7 px-2 rounded bg-violet-600 text-white font-semibold hover:bg-violet-700 disabled:opacity-50 cursor-pointer inline-flex items-center gap-1"
        >
          {scanning ? <Loader2 className="h-3 w-3 animate-spin" /> : <ScanLine className="h-3 w-3" />}
          {scanning ? 'Đang quét…' : (info?.found ? 'Quét & cập nhật' : 'Quét & tạo mới')}
        </button>

        {draft && (
          <>
            <button
              type="button"
              onClick={save}
              disabled={saving}
              className="h-7 px-2 rounded bg-emerald-600 text-white font-semibold hover:bg-emerald-700 disabled:opacity-50 cursor-pointer inline-flex items-center gap-1"
            >
              {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
              Lưu
            </button>
            <button
              type="button"
              onClick={() => { setDraft(null); setNote(''); setTransient([]); }}
              disabled={saving}
              className="h-7 px-2 rounded border border-current/40 disabled:opacity-50 cursor-pointer inline-flex items-center gap-1"
            >
              <X className="h-3 w-3" /> Bỏ
            </button>
          </>
        )}
      </div>
    </div>
  );
}

/** Một dòng "nhãn: giá trị", rỗng thì nói rõ là chưa có thay vì để trống gây hiểu nhầm. */
function Row({ k, v }) {
  return (
    <div className="mt-0.5 flex gap-1.5">
      <span className="opacity-60 shrink-0">{k}:</span>
      {v ? <span className="break-words">{v}</span> : <span className="text-rose-400">chưa có</span>}
    </div>
  );
}
