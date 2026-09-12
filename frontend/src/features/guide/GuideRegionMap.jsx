/**
 * BẢN ĐỒ KHU VỰC CÓ NÚT CHI TIẾT — hiện trong tab Ngữ cảnh của bảng "Hành động của trợ lý".
 *
 * Mục đích: người dùng thấy được KHẢ NĂNG THẬT của trợ lý trên từng khu vực, thay vì đoán qua
 * câu trả lời. Hai nút trên mỗi khu vực gọi ĐÚNG hai hàm mà tool `read_region` /
 * `highlight_region` của trợ lý gọi (lib/regionTools.js) — nên "bấm thấy gì" chính là "trợ lý
 * nhận gì", kể cả giới hạn theo chế độ (chỉ hướng dẫn thì chỉ có số lượng).
 *
 * Dấu 🤖 trên một khu vực lấy từ chính tool call trong luồng message, không phải từ nút bấm ở
 * đây: nó trả lời câu "trợ lý đã thật sự dùng tới khu vực này trong cuộc trò chuyện chưa".
 *
 * `RawBlock` truyền vào qua prop thay vì import: nó nằm trong AgentActivityPanel.jsx, mà file đó
 * lại import file này — import ngược lại là vòng phụ thuộc.
 */
import { useMemo, useState } from 'react';
import { FULL_ACCESS } from './lib/guideAccess';
import { TOOL } from './lib/toolRegistry';
import {
  KIND_LABEL, parseRegionMap, regionRef, runReadRegion, runHighlightRegion,
} from './lib/regionTools';

const REASON_TEXT = {
  region_not_found: 'Không tìm thấy khu vực này trên màn hình hiện tại.',
  no_regions: 'Màn hình hiện tại không có khu vực nào.',
  no_dom: 'Không có DOM để đọc.',
  tool_error: 'Thao tác bị lỗi.',
};

/** Số dòng bảng hiện trong bảng hành động. Trợ lý vẫn nhận đủ phần bộ đọc trả về — xem JSON. */
const TABLE_PREVIEW_ROWS = 6;

const eqi = (a, b) => !!a && !!b && String(a).trim().toLowerCase() === String(b).trim().toLowerCase();

function jsonLen(value) {
  try { return JSON.stringify(value).length; } catch { return 0; }
}

/** Mọi lần trợ lý gọi `read_region` / `highlight_region` trong luồng này. */
function agentRegionUses(actions) {
  const out = [];
  for (const a of actions || []) {
    if (a.type !== 'tool') continue;
    const tool = a.raw?.tool_name;
    if (tool !== TOOL.read_region && tool !== TOOL.highlight_region) continue;
    const res = a.raw?.results && typeof a.raw.results === 'object' ? a.raw.results : {};
    out.push({ tool, turn: a.turn, ref: a.raw?.args?.region, name: res.name, id: res.id });
  }
  return out;
}

/**
 * Lần gọi nào nhắm vào khu vực này. Khu vực có tên thì so TÊN (id `kv` trôi theo thứ tự quét,
 * tên thì không); khu vực vô danh chỉ còn cách so id.
 */
function usesFor(region, uses) {
  const named = region.name_inferred !== false;
  return uses.filter((u) => (named
    ? eqi(u.name, region.name) || eqi(u.ref, region.name)
    : eqi(u.id, region.id) || eqi(u.ref, region.id)));
}

/** Cặp nhãn → giá trị. Mảng phẳng có key, không bọc Fragment rỗng — Fragment rỗng không mang key được. */
function Pairs({ list, prefix }) {
  return (
    <dl className="guide-act__kv">
      {list.flatMap(([label, value], i) => [
        <dt key={`${prefix}k${i}`}>{label}</dt>,
        <dd key={`${prefix}v${i}`}>{value}</dd>,
      ])}
    </dl>
  );
}

function RegionDetail({ d, onReload, onOpenChild, RawBlock }) {
  const [showRaw, setShowRaw] = useState(false);
  const call = `read_region({ region: "${d.ref}" })`;

  if (d.status === 'loading') {
    return (
      <div className="guide-act__rd">
        <div className="guide-act__call">{call}</div>
        <span className="guide-act__hint">Đang đọc khu vực…</span>
      </div>
    );
  }

  const r = d.result || {};

  if (!r.ok) {
    return (
      <div className="guide-act__rd">
        <div className="guide-act__call">{call}</div>
        <div className="guide-act__warn">
          {REASON_TEXT[r.reason] || `Không đọc được (${r.reason || 'không rõ lý do'}).`}
          {r.available_regions?.length
            ? ` Trợ lý sẽ nhận danh sách khu vực đang có: ${r.available_regions.map((k) => `${k.id} ${k.name}`).join(', ')}.`
            : ''}
        </div>
        <div className="guide-act__region-actions">
          <button type="button" className="guide-act__btn" onClick={onReload}>↻ Đọc lại</button>
        </div>
      </div>
    );
  }

  /**
   * Bản đồ là ảnh chụp theo nhịp quét 4 giây; trang đổi giữa chừng thì `kv2` có thể đã là khu vực
   * khác. Hiện rõ ra thay vì im lặng — đây cũng đúng là cái bẫy trợ lý gặp khi gọi bằng id.
   */
  const drift = d.clicked?.name && r.name !== d.clicked.name;

  const summary = [];
  if (r.item_total != null) {
    let t = String(r.item_total);
    if (r.item_count_estimated) t += ' (đếm phần đang hiện)';
    if (r.items_rendered != null) t += ` · đang dựng ${r.items_rendered}`;
    summary.push(['Số mục', t]);
  }
  const ofTotal = (list, total) => (total ? `${list.length}/${total}` : String(list.length));
  if (r.controls?.length) summary.push(['Ô nhập / bộ lọc', ofTotal(r.controls, r.controls_total)]);
  if (r.fields?.length) summary.push(['Thông tin chữ', ofTotal(r.fields, r.fields_total)]);
  if (r.buttons?.length) summary.push(['Nút', ofTotal(r.buttons, r.buttons_total)]);
  if (r.table) summary.push(['Bảng', `${r.table.columns?.length || 0} cột · ${r.table.table_row_total ?? 0} dòng`]);
  if (r.active_tab?.length) summary.push(['Tab đang mở', r.active_tab.join(', ')]);
  if (r.child_regions?.length) summary.push(['Khu vực con', String(r.child_regions.length)]);

  const rows = Array.isArray(r.table?.rows) ? r.table.rows.slice(0, TABLE_PREVIEW_ROWS) : [];

  return (
    <div className="guide-act__rd">
      <div className="guide-act__call" title="Đây đúng là lệnh trợ lý gọi để đọc khu vực này">{call}</div>
      {drift ? (
        <div className="guide-act__warn">
          Bản đồ đã cũ: bấm “{d.clicked.name}” nhưng bộ đọc trả về “{r.name}”. Trang vừa đổi — trợ lý
          gọi theo id lúc này cũng sẽ đọc nhầm.
        </div>
      ) : null}
      <span className="guide-act__hint">
        {FULL_ACCESS
          ? 'Toàn quyền: trợ lý đọc được cả nội dung bản ghi.'
          : 'Chỉ hướng dẫn: trợ lý chỉ nhận số lượng, không nhận nội dung bản ghi.'}
      </span>

      {summary.length
        ? <Pairs list={summary} prefix="s" />
        : <span className="guide-act__hint">Khu vực trống — trợ lý không thấy gì bên trong.</span>}

      {r.virtualization_note ? <div className="guide-act__warn">{r.virtualization_note}</div> : null}

      {r.controls?.length ? (
        <div>
          <div className="guide-act__sec-title">Ô nhập / bộ lọc</div>
          <Pairs
            prefix="c"
            list={r.controls.map((c) => [
              `${c.locked ? '🔒 ' : ''}${c.label}`,
              `${c.value || '—'}${c.options?.length ? ` · ${c.options.length} lựa chọn` : ''}`,
            ])}
          />
        </div>
      ) : null}

      {r.fields?.length ? (
        <div>
          <div className="guide-act__sec-title">Thông tin hiển thị</div>
          <Pairs prefix="f" list={r.fields.map((f) => [f.label, f.value])} />
        </div>
      ) : null}

      {r.table ? (
        <div>
          <div className="guide-act__sec-title">Bảng</div>
          <div className="guide-act__tablewrap">
            <table className="guide-act__table">
              {r.table.columns?.length ? (
                <thead><tr>{r.table.columns.map((c, i) => <th key={i}>{String(c)}</th>)}</tr></thead>
              ) : null}
              {rows.length ? (
                <tbody>
                  {rows.map((row, i) => (
                    <tr key={i}>
                      {(Array.isArray(row) ? row : [row]).map((cell, j) => <td key={j}>{String(cell ?? '')}</td>)}
                    </tr>
                  ))}
                </tbody>
              ) : null}
            </table>
          </div>
          {r.table.note ? <span className="guide-act__hint">{r.table.note}</span> : null}
        </div>
      ) : null}

      {r.buttons?.length ? (
        <div>
          <div className="guide-act__sec-title">Nút bấm được</div>
          <div className="guide-act__chips">
            {r.buttons.map((b, i) => <span key={i} className="guide-act__chip">{b}</span>)}
          </div>
        </div>
      ) : null}

      {r.items?.length ? (
        <div>
          <div className="guide-act__sec-title">Mục bên trong</div>
          <ol className="guide-act__lines">{r.items.map((t, i) => <li key={i}>{t}</li>)}</ol>
        </div>
      ) : null}

      {r.lists?.length ? (
        <div>
          <div className="guide-act__sec-title">Danh sách chỉ đọc</div>
          <ul className="guide-act__lines">
            {r.lists.map((t, i) => <li key={i}>{typeof t === 'string' ? t : (t?.label || JSON.stringify(t))}</li>)}
          </ul>
        </div>
      ) : null}

      {r.child_regions?.length ? (
        <div>
          <div className="guide-act__sec-title">Khu vực con — trợ lý phải gọi riêng từng cái</div>
          <div className="guide-act__region-actions">
            {r.child_regions.map((c) => (
              <button key={c.id} type="button" className="guide-act__btn" onClick={() => onOpenChild(c)}>
                {c.id} · {c.name}{c.item_count != null ? ` (${c.item_count})` : ''}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {[r.items_note, r.child_note, r.note].filter(Boolean).map((t, i) => (
        <span key={i} className="guide-act__hint">{t}</span>
      ))}

      <div className="guide-act__region-actions">
        <span className="guide-act__hint">Trợ lý nhận {jsonLen(r).toLocaleString('vi-VN')} ký tự</span>
        <button type="button" className="guide-act__btn" onClick={onReload}>↻ Đọc lại</button>
        <button
          type="button"
          className={`guide-act__btn${showRaw ? ' guide-act__btn--on' : ''}`}
          onClick={() => setShowRaw((v) => !v)}
        >
          {showRaw ? 'Ẩn JSON' : 'JSON trợ lý nhận'}
        </button>
      </div>
      {showRaw ? <RawBlock value={r} /> : null}
    </div>
  );
}

export default function GuideRegionMap({ value, actions, RawBlock }) {
  const { regions, note } = parseRegionMap(value);
  const uses = useMemo(() => agentRegionUses(actions), [actions]);
  const [detail, setDetail] = useState({});
  const [pointed, setPointed] = useState({});
  const [showRaw, setShowRaw] = useState(false);

  // Khoá theo id + tên: bản đồ quét lại mỗi 4 giây, id có thể đổi chủ — đổi chủ thì coi như thẻ mới.
  const keyOf = (r) => `${r.id}|${r.name}`;

  const load = async (r) => {
    const k = keyOf(r);
    const ref = regionRef(r);
    const clicked = { id: r.id, name: r.name };
    setDetail((p) => ({ ...p, [k]: { status: 'loading', ref, clicked } }));
    let result;
    try {
      result = await runReadRegion({ region: ref });
    } catch (e) {
      result = { ok: false, reason: 'tool_error', error: String(e?.message || e) };
    }
    setDetail((p) => ({ ...p, [k]: { status: 'done', ref, clicked, result } }));
  };

  const toggle = (r) => {
    const k = keyOf(r);
    if (detail[k] && detail[k].status !== 'loading') {
      setDetail((p) => {
        const next = { ...p };
        delete next[k];
        return next;
      });
      return;
    }
    load(r);
  };

  const point = (r) => {
    let res;
    try {
      res = runHighlightRegion({ region: regionRef(r) });
    } catch {
      res = { ok: false, reason: 'tool_error' };
    }
    setPointed((p) => ({ ...p, [keyOf(r)]: res }));
  };

  /** Khu vực con có sẵn trong bản đồ — mở chi tiết ngay ở thẻ của nó rồi cuộn tới. */
  const openChild = (c) => {
    const inMap = regions.find((x) => x.id === c.id) || regions.find((x) => x.name === c.name);
    const target = inMap || {
      id: c.id, name: c.name, kind: c.kind, name_inferred: /^Khu vực \d+/.test(c.name) ? false : undefined,
    };
    load(target);
    requestAnimationFrame(() => {
      document.getElementById(`guide-act-${target.id}`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    });
  };

  if (!regions.length) {
    return (
      <div className="guide-act__rd" style={{ margin: '0 11px 8px' }}>
        <span className="guide-act__hint">
          Bộ quét không tìm thấy khu vực nào trên màn hình này — trợ lý cũng không có gì để đọc.
        </span>
        <RawBlock value={value} />
      </div>
    );
  }

  return (
    <>
      <ul className="guide-act__regions">
        {regions.map((r) => {
          const k = keyOf(r);
          const used = usesFor(r, uses);
          const reads = used.filter((u) => u.tool === TOOL.read_region).length;
          const points = used.filter((u) => u.tool === TOOL.highlight_region).length;
          const turns = [...new Set(used.map((u) => u.turn).filter(Boolean))];
          const p = pointed[k];
          const d = detail[k];
          return (
            <li
              key={k}
              id={`guide-act-${r.id}`}
              className={`guide-act__region${used.length ? ' guide-act__region--agent' : ''}`}
            >
              <div className="guide-act__region-head">
                <span className="guide-act__region-id">{r.id}</span>
                <span className={`guide-act__region-name${r.name_inferred === false ? ' guide-act__region-name--none' : ''}`}>
                  {r.name}
                </span>
              </div>
              <div className="guide-act__chips">
                <span className="guide-act__chip guide-act__chip--kind">{KIND_LABEL[r.kind] || r.kind}</span>
                {r.inside ? <span className="guide-act__chip" title="Nằm bên trong khu vực này">trong {r.inside}</span> : null}
                {r.item_count != null ? (
                  <span className="guide-act__chip" title={r.item_count_estimated ? 'Chỉ đếm phần đang hiện trên màn hình' : 'Số mục do trang tự khai'}>
                    {r.item_count} mục{r.item_count_estimated ? ' ~' : ''}
                  </span>
                ) : null}
                {r.control_count ? <span className="guide-act__chip">{r.control_count} ô nhập</span> : null}
                {r.button_count ? <span className="guide-act__chip">{r.button_count} nút</span> : null}
                {r.name_inferred === false ? (
                  <span className="guide-act__chip guide-act__chip--warn" title="Không tìm được tiêu đề — trợ lý chỉ gọi được bằng id, mà id đổi khi trang đổi">
                    không tên
                  </span>
                ) : null}
                {r.name_inferred === true ? (
                  <span className="guide-act__chip" title="Tên đoán từ tiêu đề gần nhất, trang không tự khai">tên đoán</span>
                ) : null}
                {used.length ? (
                  <span className="guide-act__chip guide-act__chip--agent" title="Trợ lý đã gọi tool trên khu vực này trong cuộc trò chuyện">
                    🤖 {[reads ? `đọc ×${reads}` : '', points ? `chỉ ×${points}` : ''].filter(Boolean).join(' · ')}
                    {turns.length ? ` · lượt ${turns.join(',')}` : ''}
                  </span>
                ) : null}
              </div>
              <div className="guide-act__region-actions">
                <button
                  type="button"
                  className={`guide-act__btn${d ? ' guide-act__btn--on' : ''}`}
                  onClick={() => toggle(r)}
                  disabled={d?.status === 'loading'}
                >
                  {d ? 'Ẩn chi tiết' : '🔍 Chi tiết'}
                </button>
                <button type="button" className="guide-act__btn" onClick={() => point(r)}>🎯 Chỉ vị trí</button>
                {p ? (
                  <span className="guide-act__hint">
                    {p.ok ? 'đã khoanh trên trang' : (REASON_TEXT[p.reason] || p.reason)}
                  </span>
                ) : null}
              </div>
              {d ? <RegionDetail d={d} onReload={() => load(r)} onOpenChild={openChild} RawBlock={RawBlock} /> : null}
            </li>
          );
        })}
      </ul>
      {note ? <p className="guide-act__empty">{note}</p> : null}
      <div className="guide-act__region-actions" style={{ padding: '0 11px 8px' }}>
        <button
          type="button"
          className={`guide-act__btn${showRaw ? ' guide-act__btn--on' : ''}`}
          onClick={() => setShowRaw((v) => !v)}
        >
          {showRaw ? 'Ẩn JSON bản đồ' : 'JSON bản đồ trợ lý nhận'}
        </button>
      </div>
      {showRaw ? <RawBlock value={value} /> : null}
    </>
  );
}
