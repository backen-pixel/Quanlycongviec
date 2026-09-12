/**
 * Bộ vẽ Generative UI + Human-in-the-loop cho các tool của trợ lý hướng dẫn.
 *
 * - `search_knowledge_base` (backend): kết quả JSON.stringify (đã đo — AG-UI luôn trả result dạng
 *   chuỗi) → vẽ lại thành thẻ màn hình đẹp thay vì hiện JSON thô. Đây là phần "Generative UI".
 * - `navigate_to_page` (client, human-in-the-loop THẬT qua `useHumanInTheLoop`): agent chỉ
 *   ĐỀ NGHỊ điều hướng — chỉ khi CON NGƯỜI bấm "Đồng ý" mới thật sự chuyển trang. `respond()`
 *   resume lượt chạy của agent với kết quả người dùng chọn.
 */
import { useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { matchScreen, isNavigablePath } from './lib/matchScreen';
import { waitForPageReady, waitNote } from './lib/pageReady';
import { setConfirm } from './lib/openGuide';
import { closeGuideTour } from './lib/pageTour';

function safeParseJson(s) {
  if (typeof s !== 'string') return null;
  try { return JSON.parse(s); } catch { return null; }
}

export function SearchResultCard({ status, result }) {
  if (status !== 'complete') {
    return <div className="guide-tool-card guide-tool-card--pending">🔎 Đang tra cứu hệ thống…</div>;
  }
  const parsed = safeParseJson(result);
  const items = parsed?.results || [];
  if (items.length === 0) {
    return <div className="guide-tool-card">Không tìm thấy màn hình phù hợp trong kho kiến thức.</div>;
  }
  return (
    <div className="guide-tool-card">
      <div className="guide-tool-card__title">Kết quả tra cứu</div>
      {items.map((it) => (
        <div key={it.path} className="guide-screen-card">
          <div className="guide-screen-card__label">{it.label}</div>
          {it.menu ? <div className="guide-screen-card__menu">📍 {it.menu}</div> : null}
          {it.summary ? <div className="guide-screen-card__summary">{it.summary}</div> : null}
        </div>
      ))}
    </div>
  );
}

export function NavProposalCard({ args, status, result, respond }) {
  const navigate = useNavigate();
  const target = args?.path ? matchScreen(args.path) : null;
  const displayLabel = target?.label || args?.path || '';
  const valid = isNavigablePath(args?.path);

  /**
   * Hai hàm này là NGUỒN DUY NHẤT của cả hai chỗ hỏi: thẻ trong khung chat và bong bóng trên
   * nhân vật. Chép logic ra hai nơi thì sớm muộn một nơi quên `waitForPageReady` hoặc quên
   * `respond`, và lượt chạy của agent treo vĩnh viễn.
   */
  const agree = useCallback(async () => {
    if (!valid) { await respond({ ok: false, reason: 'path_not_found' }); return; }
    // Dẹp tour do chính trợ lý mở trước khi rời trang — xem `closeGuideTour`.
    closeGuideTour();
    navigate(args.path);
    // Trang vừa điều hướng còn đang nạp dữ liệu bất đồng bộ — chờ XONG THẬT trước khi resume
    // lượt chạy, để nếu agent gọi tiếp read_screen_metrics trong cùng lượt thì đọc được số
    // liệu thật thay vì khung trang rỗng/skeleton. Chờ cứng 1.800ms như trước là đoán bừa: trang
    // nhẹ thì thừa, trang nặng thì vẫn đọc sớm.
    const waited = await waitForPageReady({ minMs: 800, maxMs: 12000 });
    await respond({ ok: true, path: args.path, page_wait: waited, note: waitNote(waited) });
  }, [valid, navigate, args?.path, respond]);

  const decline = useCallback(
    async () => { await respond({ ok: false, reason: 'user_declined' }); },
    [respond],
  );

  /**
   * ĐẨY CÂU HỎI RA NHÂN VẬT trong suốt lúc `executing`.
   *
   * Khung chat nay mặc định đóng, nên nếu chỉ vẽ thẻ ở trong đó thì người dùng thấy nhân vật báo
   * "Điều hướng — đang chờ bạn xác nhận" mà không có nút nào để bấm, còn agent thì treo giữa
   * lượt. Dọn kênh khi rời trạng thái này, kể cả khi người dùng trả lời ở khung chat.
   */
  useEffect(() => {
    if (status !== 'executing') return undefined;
    setConfirm({
      text: valid
        ? `Đi tới ${displayLabel}${target?.menu ? ` (${target.menu})` : ''}?`
        : `Đường dẫn "${args?.path || ''}" không có trong hệ thống.`,
      confirm_label: 'Dẫn ta đi',
      agree: valid ? agree : null,
      decline,
    });
    return () => setConfirm(null);
  }, [status, valid, displayLabel, target?.menu, args?.path, agree, decline]);

  if (status === 'inProgress') {
    return <div className="guide-tool-card guide-tool-card--pending">Đang chuẩn bị đề nghị điều hướng…</div>;
  }

  if (status === 'executing') {
    return (
      <div className="guide-tool-card guide-tool-card--confirm">
        <div className="guide-tool-card__title">
          {valid ? <>Đi tới <strong>{displayLabel}</strong>{target?.menu ? ` (${target.menu})` : ''}?</> : 'Đường dẫn không tồn tại trong hệ thống.'}
        </div>
        <div className="guide-tool-card__actions">
          <button type="button" className="guide-btn guide-btn--primary" disabled={!valid} onClick={agree}>
            ✅ Đồng ý, dẫn mình đi
          </button>
          <button type="button" className="guide-btn" onClick={decline}>
            Không, cảm ơn
          </button>
        </div>
      </div>
    );
  }

  // complete
  const parsed = safeParseJson(result) || {};
  return (
    <div className="guide-tool-card guide-tool-card--done">
      {parsed.ok ? `✅ Đã chuyển tới ${displayLabel}.` : '↩️ Đã huỷ điều hướng.'}
    </div>
  );
}

export function ReadMetricsCard({ status, result }) {
  if (status !== 'complete') {
    return <div className="guide-tool-card guide-tool-card--pending">📊 Đang đọc chỉ số trên màn hình…</div>;
  }
  const parsed = safeParseJson(result);
  const items = parsed?.metrics || [];
  if (items.length === 0) {
    return (
      <div className="guide-tool-card">
        Không đọc được chỉ số nào đang hiển thị trên màn hình này.
      </div>
    );
  }
  return (
    <div className="guide-tool-card">
      <div className="guide-tool-card__title">Chỉ số đang hiển thị trên màn hình</div>
      {items.map((it) => (
        <div key={it.label} className="guide-metric-row">
          <span className="guide-metric-row__label">{it.label}</span>
          <span className="guide-metric-row__value">{it.so}</span>
        </div>
      ))}
    </div>
  );
}

/**
 * Phân biệt "không tìm thấy nhãn" với "thao tác lỗi". Trước đây mọi kết quả không phải
 * `ok` đều hiện "Không thấy nút …" — kể cả khi handler lỗi thật, nên thẻ này NÓI SAI
 * (nút vẫn nằm đó). `reason` do guardTool/handler trả về; chuỗi "Error: …" là kết quả thư viện
 * tự chèn khi handler còn ném lỗi ra ngoài (xem guardTool ở AppGuideCopilotPanel.jsx).
 */
export function PointAtButtonCard({ args, status, result }) {
  if (status !== 'complete') {
    return <div className="guide-tool-card guide-tool-card--pending">✨ Đang tìm nút <strong>{args?.label}</strong>…</div>;
  }
  const parsed = safeParseJson(result) || {};
  const err = parsed.reason === 'tool_error'
    || parsed.reason === 'tool_not_found'
    || (typeof result === 'string' && result.startsWith('Error:'));
  let content;
  if (parsed.ok) content = `✨ Đã làm sáng nút "${args?.label}" trên màn hình.`;
  else if (err) content = `⚠️ Không thực hiện được thao tác làm sáng nút "${args?.label}".`;
  else content = `Không thấy nút "${args?.label}" đang hiển thị.`;
  return <div className="guide-tool-card guide-tool-card--done">{content}</div>;
}

/**
 * Thẻ cho `highlight_region`.
 *
 * Hiện TÊN KHU VỰC THẬT (`parsed.name`), không phải chuỗi model xin chỉ (`args.region`): khớp
 * tên là khớp GẦN ĐÚNG — model nói "Thông tin" mà vùng thật tên "THÔNG TIN CHUNG" thì vẫn chỉ,
 * và người dùng cần đọc được nó đã chỉ vào đâu để bắt ngay nếu khớp nhầm vùng khác.
 */
export function PointAtRegionCard({ args, status, result }) {
  if (status !== 'complete') {
    return <div className="guide-tool-card guide-tool-card--pending">✨ Đang tìm khu vực <strong>{args?.region}</strong>…</div>;
  }
  const parsed = safeParseJson(result) || {};
  const err = parsed.reason === 'tool_error'
    || parsed.reason === 'tool_not_found'
    || (typeof result === 'string' && result.startsWith('Error:'));
  let content;
  if (parsed.ok) content = `✨ Đã khoanh sáng khu vực "${parsed.name || args?.region}".`;
  else if (err) content = `⚠️ Không thực hiện được thao tác khoanh khu vực "${args?.region}".`;
  else content = `Không thấy khu vực "${args?.region}" trên màn hình này.`;
  return <div className="guide-tool-card guide-tool-card--done">{content}</div>;
}

/* ─────────────────────────── Thẻ cho CHẾ ĐỘ TOÀN QUYỀN ───────────────────────────
 * Ba thẻ dưới đây phải nói RÕ đã LÀM GÌ THẬT, không chỉ "xong": ở chế độ này trợ lý bấm và
 * điền thay người dùng, nên người dùng cần đọc lại được đúng thao tác vừa xảy ra để phát hiện
 * ngay nếu nó bấm sai nút. Ghi cả nhãn thật tìm thấy (`clicked`) chứ không chỉ nhãn model xin
 * bấm (`args.label`) — hai cái có thể lệch vì khớp nhãn là khớp gần đúng.
 */

export function ReadPageCard({ status, result }) {
  if (status !== 'complete') {
    return <div className="guide-tool-card guide-tool-card--pending">📄 Đang đọc trạng thái màn hình…</div>;
  }
  const parsed = safeParseJson(result) || {};
  const fields = (parsed.fields_and_filters || []).filter((t) => t.value);
  const rowCount = parsed.table?.rows_read || 0;
  return (
    <div className="guide-tool-card">
      <div className="guide-tool-card__title">Đã đọc màn hình {parsed.path || ''}</div>
      <div className="guide-tool-card__summary">
        {fields.length} trường/bộ lọc đang có giá trị
        {rowCount ? `, bảng ${rowCount} dòng` : ''}
        {parsed.active_tab?.length ? `, tab: ${parsed.active_tab.join(', ')}` : ''}
      </div>
    </div>
  );
}

export function ClickResultCard({ args, status, result }) {
  if (status !== 'complete') {
    return <div className="guide-tool-card guide-tool-card--pending">🖱️ Đang bấm <strong>{args?.label}</strong>…</div>;
  }
  const parsed = safeParseJson(result) || {};
  if (parsed.ok) {
    return <div className="guide-tool-card guide-tool-card--done">🖱️ Đã bấm <strong>{parsed.clicked || args?.label}</strong>.</div>;
  }
  if (parsed.reason === 'button_locked') {
    return <div className="guide-tool-card">Nút <strong>{parsed.matched || args?.label}</strong> đang bị khoá, không bấm được.</div>;
  }
  return <div className="guide-tool-card">Không thấy nút "{args?.label}" trên màn hình này.</div>;
}

export function FillFieldCard({ args, status, result }) {
  if (status !== 'complete') {
    return <div className="guide-tool-card guide-tool-card--pending">⌨️ Đang đặt <strong>{args?.label}</strong>…</div>;
  }
  const parsed = safeParseJson(result) || {};
  if (parsed.ok) {
    const placed = parsed.selected || parsed.entered || parsed.set_to || args?.value;
    return (
      <div className="guide-tool-card guide-tool-card--done">
        ⌨️ Đã đặt <strong>{parsed.field || args?.label}</strong> = <strong>{placed || '(trống)'}</strong>.
      </div>
    );
  }
  if (parsed.reason === 'no_matching_option') {
    return (
      <div className="guide-tool-card">
        <div>Trường "{parsed.field || args?.label}" không có lựa chọn nào khớp "{args?.value}".</div>
        {parsed.available_options?.length ? (
          <div className="guide-tool-card__summary">Đang có: {parsed.available_options.join(' · ')}</div>
        ) : null}
      </div>
    );
  }
  return <div className="guide-tool-card">Không đặt được trường "{args?.label}".</div>;
}

export function FindOnPageCard({ args, status, result }) {
  if (status !== 'complete') {
    return <div className="guide-tool-card guide-tool-card--pending">🔦 Đang rà trang tìm “{args?.keyword}”…</div>;
  }
  const parsed = safeParseJson(result) || {};
  const items = parsed.results || [];
  if (items.length === 0) {
    return <div className="guide-tool-card">Không thấy “{args?.keyword}” trong phần đang hiển thị.</div>;
  }
  return (
    <div className="guide-tool-card">
      <div className="guide-tool-card__title">🔦 {items.length} kết quả chứa “{args?.keyword}”</div>
      {items.slice(0, 6).map((it, i) => (
        // Kết quả không có id ổn định; danh sách chỉ hiện một lần rồi thôi nên index là khoá
        // chấp nhận được ở đây.
        // eslint-disable-next-line react/no-array-index-key
        <div key={i} className="guide-screen-card">
          <div className="guide-screen-card__summary">{it.content}</div>
        </div>
      ))}
      {items.length > 6 ? <div className="guide-tool-card__summary">…và {items.length - 6} kết quả nữa</div> : null}
    </div>
  );
}

export function NavDoneCard({ args, status, result }) {
  if (status !== 'complete') {
    return <div className="guide-tool-card guide-tool-card--pending">🧭 Đang chuyển tới {args?.path}…</div>;
  }
  const parsed = safeParseJson(result) || {};
  const target = args?.path ? matchScreen(args.path) : null;
  if (parsed.ok) {
    return <div className="guide-tool-card guide-tool-card--done">🧭 Đã chuyển tới <strong>{target?.label || args?.path}</strong>.</div>;
  }
  return <div className="guide-tool-card">Đường dẫn "{args?.path}" không có trong hệ thống.</div>;
}

/**
 * Lớp 2 — kết quả khoan sâu một khu vực. Hiện SỐ, không đổ danh sách bản ghi ra khung chat:
 * người dùng đang nhìn thẳng vào khu vực đó rồi, in lại là nhiễu.
 */
export function ReadRegionCard({ args, status, result }) {
  if (status !== 'complete') {
    return <div className="guide-tool-card guide-tool-card--pending">🔍 Đang đọc khu vực <strong>{args?.region}</strong>…</div>;
  }
  const parsed = safeParseJson(result) || {};
  if (!parsed.ok) {
    const has = parsed.available_regions || [];
    return (
      <div className="guide-tool-card">
        Không thấy khu vực "{args?.region}".
        {has.length ? ` Đang có: ${has.map((k) => k.name).join(', ')}.` : ''}
      </div>
    );
  }
  const parts = [];
  if (parsed.item_total) parts.push(`${parsed.item_total} mục`);
  if (parsed.controls?.length) parts.push(`${parsed.controls.length} trường`);
  if (parsed.buttons?.length) parts.push(`${parsed.buttons.length} nút`);
  return (
    <div className="guide-tool-card">
      <div className="guide-tool-card__title">Đã đọc khu vực “{parsed.name}”</div>
      <div className="guide-tool-card__summary">{parts.join(' · ') || 'khu vực trống'}</div>
    </div>
  );
}

/**
 * Mở hướng dẫn dựng sẵn. Hiện đúng một dòng: nội dung thật đã nằm trên lớp phủ tour giữa màn
 * hình, chép lại vào khung chat là bắt người dùng đọc hai lần cùng một thứ.
 */
export function OpenTourCard({ args, status, result }) {
  if (status !== 'complete') {
    return <div className="guide-tool-card guide-tool-card--pending">📖 Đang mở hướng dẫn trên màn hình…</div>;
  }
  const parsed = safeParseJson(result) || {};
  if (!parsed.ok) {
    return <div className="guide-tool-card">Màn hình này chưa có hướng dẫn dựng sẵn.</div>;
  }
  return (
    <div className="guide-tool-card guide-tool-card--done">
      📖 Đã mở <strong>{parsed.tour}</strong> — bước {parsed.step}/{parsed.total_steps}
      {parsed.step_name ? `: ${parsed.step_name}` : ''}
      {parsed.matched_keyword === false && args?.keyword ? ' (chưa có bước khớp hẳn với câu hỏi)' : ''}
    </div>
  );
}
