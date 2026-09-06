import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  FIELD_LABELS, PERIOD_LABELS, TIME_BASIS_LABELS,
  normalizeJourneyContext, changeJourneyContext, journeyContextKey,
  assertJourneyOverview, assertJourneyList, assertJourneyDetail, assertJourneyRelationDetail,
  displayJourneyCount, displaySourceValue, safeJourneyError,
} from './journeyViewContract.js';
import './customerJourney.css';

const ENTITY_LABELS = {
  customer: 'Khách hàng', lead: 'Lead', deal: 'Deal', order: 'Đơn hàng', project: 'Công trình',
  task: 'Công việc', assignment: 'Giao việc', purchase_request: 'Hạng mục cần mua (PR)',
  purchase_order: 'Lệnh mua hàng (PO)', quotation: 'Báo giá', invoice: 'Hóa đơn', payment: 'Thu ghi nhận',
  expense: 'Chi phí ghi nhận', rating: 'Đánh giá khách hàng', incident: 'Sự cố',
  time_log: 'Nhật ký giờ', event: 'Sự kiện nguồn', conversion_event: 'Sự kiện chuyển đổi',
};
const COVERAGE_LABELS = { EXACT: 'Tập giả đầy đủ', PARTIAL: 'Dữ liệu một phần', UNKNOWN: 'Chưa xác định' };

function GapList({ gaps = [], title = 'Khoảng thiếu / giới hạn nguồn' }) {
  if (!gaps.length) return null;
  return <div className="cj-gaps" data-testid="journey-gaps">
    <strong>{title}</strong>
    <ul>{gaps.map((gap, index) => <li key={`${typeof gap === 'string' ? gap : gap?.code}-${index}`}>
      {typeof gap === 'string' ? gap : [gap?.code, gap?.message || gap?.reason].filter(Boolean).join(' · ') || 'UNKNOWN'}
    </li>)}</ul>
  </div>;
}

function FieldGrid({ fields = {}, missingFields = [], restrictedFields = [] }) {
  return <>
    <dl className="cj-field-grid">
      {Object.entries(fields).map(([key, value]) => <div key={key}>
        <dt>{FIELD_LABELS[key] || key}</dt><dd>{displaySourceValue(value)}</dd>
      </div>)}
      {!Object.keys(fields).length && <div><dt>Chi tiết nguồn</dt><dd>Chưa có trường được phép hiển thị / UNKNOWN</dd></div>}
    </dl>
    <GapList title="Trường chưa có nguồn / chưa được cung cấp" gaps={missingFields.map((field) => FIELD_LABELS[field] || field)} />
    <GapList title="KHÓA — trường ngoài quyền nguồn (không hiển thị giá trị)" gaps={restrictedFields.map((field) => FIELD_LABELS[field] || field)} />
  </>;
}

function RecordCard({ record, className = '', testId = 'journey-commitment', onTasks }) {
  return <article className={`cj-record-card ${className}`} data-testid={testId} data-record-ref={record.ref}>
    <div className="cj-record-heading"><span className="cj-entity">{ENTITY_LABELS[record.entity] || record.entity}</span>
      <h3>{record.label || 'Hồ sơ nguồn chưa có nhãn'}</h3></div>
    <p className="cj-ref">ID nguồn: <code>{record.ref}</code> · Công ty nguồn: {record.company_id || 'UNKNOWN'}</p>
    <FieldGrid fields={record.fields} missingFields={record.missing_fields || []} restrictedFields={record.restricted_fields || []} />
    {onTasks && record.group_id && <button className="cj-button cj-button-secondary cj-commitment-button"
      data-testid="journey-commitment-tasks" data-record-ref={record.ref} onClick={() => onTasks(record)}>
      Công việc của cam kết này →
    </button>}
  </article>;
}

function StateMessage({ loading, error }) {
  if (loading) return <p className="cj-state" role="status" data-testid="journey-loading">Đang đối chiếu tập hồ sơ trong bộ dữ liệu giả…</p>;
  if (error) return <div className="cj-state cj-state-error" role="alert" data-testid="journey-error">
    <strong>Không hiển thị dữ liệu chưa được xác minh.</strong>
    <p>Yêu cầu bị chặn hoặc hợp đồng nguồn không khớp. Không dùng snapshot cũ thay thế.</p>
    <code>{error}</code>
  </div>;
  return null;
}

function ContextFacts({ overview }) {
  return <div className="cj-context-facts" data-testid="journey-context">
    <span>Snapshot giả: <code>{overview.snapshot.id}</code></span>
    <span>Ghi nhận giả: {overview.snapshot.observed_at || 'UNKNOWN'}</span>
    <span>Múi giờ: +07:00 · Basis của từng nhóm được giữ riêng</span>
  </div>;
}

function CapacityAndDecisions({ overview, onSelectGroup }) {
  const capacity = overview.capacity;
  const decisions = Array.isArray(overview.decisions) ? overview.decisions : [];
  return <div className="cj-support-grid">
    <section className="cj-panel" aria-labelledby="cj-capacity-title" data-testid="journey-capacity">
      <p className="cj-eyebrow">Tuần / tháng · Nguồn lực</p>
      <h2 id="cj-capacity-title">Tải công việc, chưa phải công suất</h2>
      {capacity ? <>
        <dl className="cj-capacity-values">
          <div><dt>Việc mở nhìn thấy</dt><dd>{displaySourceValue(capacity.open_work)}</dd></div>
          <div><dt>Nhân sự nguồn hoạt động</dt><dd>{displaySourceValue(capacity.active_people)}</dd></div>
          <div><dt>Tải / nhân sự</dt><dd>{displaySourceValue(capacity.load_per_active_person)}</dd></div>
        </dl>
        <p className="cj-basis">Basis: {displaySourceValue(capacity.basis)}</p>
        <GapList gaps={capacity.gaps || []} />
      </> : <p>Chưa có packet tải được xác minh / UNKNOWN.</p>}
      <p className="cj-note">Định mức, giờ máy/ca, phân bổ tải và khoảng thiếu năng lực canonical vẫn khóa. Không suy nhân sự hoạt động thành công suất tối đa.</p>
    </section>
    <section className="cj-panel" aria-labelledby="cj-decisions-title" data-testid="journey-decisions">
      <p className="cj-eyebrow">Xuyên suốt sáu hệ</p>
      <h2 id="cj-decisions-title">Trung tâm quyết định Founder</h2>
      {!decisions.length && <p>Chưa có yêu cầu quyết định trong tập giả được phép thấy. Không đồng nghĩa doanh nghiệp không có ngoại lệ.</p>}
      <ul className="cj-decision-list">{decisions.map((item, index) => <li key={item.id || `${item.source_ref}-${index}`}>
        <strong>{item.title || 'Ngoại lệ theo nguồn'}</strong>
        <p>{item.reason || 'Chưa có lý do theo nguồn / UNKNOWN'}</p>
        <p className="cj-note">Phụ trách: {displaySourceValue(item.owner)} · Hạn: {displaySourceValue(item.deadline)}</p>
        {item.source_ref && <code className="cj-ref">{item.source_ref}</code>}
        {item.group_id && <button className="cj-text-button" onClick={() => onSelectGroup(item.group_id)}>Xem tập nguồn →</button>}
        <GapList gaps={item.gaps || []} />
      </li>)}</ul>
      <p className="cj-note">Chỉ đọc, không phê duyệt / giao việc / gửi thông báo. AI và OpenClaw vẫn tắt.</p>
    </section>
  </div>;
}

function Overview({ packet, onSelectGroup }) {
  return <>
    <div className="cj-system-grid" data-testid="journey-systems">
      {packet.systems.map((system, index) => <section className={`cj-system cj-system-${index + 1}`} key={system.id} data-testid="journey-system">
        <div className="cj-system-title"><span className="cj-system-number">{String(index + 1).padStart(2, '0')}</span>
          <div><p className="cj-eyebrow">{index >= 4 ? 'Xuyên suốt hành trình' : `Hệ ${index + 1}`}</p><h2>{system.name}</h2></div></div>
        <div className="cj-groups">{system.groups.map((group) => <div key={group.id} className="cj-group-wrap">
          <button className={`cj-group ${group.locked ? 'cj-group-locked' : ''}`}
            data-testid="journey-group" data-group-id={group.id} data-coverage={group.coverage}
            onClick={() => onSelectGroup(group.id)} aria-label={`${group.name}: ${displayJourneyCount(group)} ${group.unit}${group.locked ? ', khóa' : ''}`}>
            <span><strong>{group.name}</strong><small>{group.unit} · {group.locked ? 'KHÓA' : COVERAGE_LABELS[group.coverage]}</small></span>
            <span className="cj-count">{displayJourneyCount(group)}<span aria-hidden="true">{group.locked ? ' ⊘' : ' →'}</span></span>
          </button>
          <p className="cj-basis">{displaySourceValue(group.basis)}</p>
          <GapList gaps={group.gaps || []} />
        </div>)}</div>
      </section>)}
    </div>
    <GapList gaps={packet.gaps || []} />
    <CapacityAndDecisions overview={packet} onSelectGroup={onSelectGroup} />
  </>;
}

function GroupRecords({ packet, group, page, pageSize, onPage, onPageSize, onSelectRecord, loading, error }) {
  return <section className="cj-panel" data-testid="journey-group-detail" data-group-id={group.id}>
    <div className="cj-section-heading"><div><p className="cj-eyebrow">Tầng 2 · Công đoạn / ngoại lệ</p>
      <h2>{group.name}</h2><p>{displayJourneyCount(group)} {group.unit} · {group.locked ? 'KHÓA' : COVERAGE_LABELS[group.coverage]}</p></div>
      <span className="cj-badge">Đúng tập nguồn, không cộng nhóm chồng lấn</span></div>
    <p className="cj-basis">Basis: {displaySourceValue(group.basis)}</p>
    <GapList gaps={group.gaps || []} />
    {group.locked ? <div className="cj-state" data-testid="journey-locked">
      <strong>Đường đọc / quy tắc này chưa được mở.</strong><p>Không gọi adapter chi tiết, không tạo hồ sơ giả thay cho nguồn thiếu. Phần này chưa đạt chức năng tích hợp.</p>
    </div> : <>
      <StateMessage loading={loading} error={error} />
      {packet && <>
        <div className="cj-table-wrap"><table className="cj-table" data-testid="journey-records" data-page={packet.pagination.page} data-page-size={packet.pagination.page_size}>
          <thead><tr><th>Hồ sơ đúng tập</th><th>Loại / trạng thái nguồn</th><th>Phụ trách / hạn</th><th>Mở hành trình</th></tr></thead>
          <tbody>{packet.records.map((record) => <tr key={record.ref} data-testid="journey-record" data-record-ref={record.ref}>
            <td><strong>{record.label || 'Chưa có nhãn nguồn'}</strong><code className="cj-ref">{record.ref}</code></td>
            <td>{ENTITY_LABELS[record.entity] || record.entity}<small>{displaySourceValue(record.fields.status)}</small></td>
            <td>{displaySourceValue(record.fields.owner)}<small>{displaySourceValue(record.fields.due_at)}</small></td>
            <td><button className="cj-button cj-button-small" onClick={() => onSelectRecord(record.ref)} data-testid="journey-open-record">Khách + cam kết →</button></td>
          </tr>)}</tbody>
        </table></div>
        {!packet.records.length && <p className="cj-state" data-testid="journey-empty">Không có hồ sơ trong trang/tập giả hiện tại. Xem coverage và bộ lọc; không suy nguồn thật bằng 0.</p>}
        <div className="cj-pagination" data-testid="journey-pagination">
          <p>Trang {page} · {packet.records.length} hồ sơ trong trang · Tổng theo contract: {packet.pagination.total == null ? 'UNKNOWN' : `${group.coverage === 'PARTIAL' ? '≥ ' : ''}${packet.pagination.total}`}</p>
          <div><label>Số hồ sơ/trang <select aria-label="Số hồ sơ mỗi trang" data-testid="journey-page-size" value={pageSize} onChange={(event) => onPageSize(Number(event.target.value))}>
            {[2, 5, 10, 20].map((size) => <option key={size} value={size}>{size}</option>)}
          </select></label>
          <button className="cj-button cj-button-secondary" disabled={page <= 1} onClick={() => onPage(page - 1)} data-testid="journey-prev-page">← Trước</button>
          <button className="cj-button cj-button-secondary" disabled={!packet.pagination.has_more} onClick={() => onPage(page + 1)} data-testid="journey-next-page">Sau →</button></div>
        </div>
        <GapList gaps={packet.gaps || []} />
      </>}
    </>}
  </section>;
}

function JourneyDetail({ packet, showTasks, onTasks, onCommitmentTasks }) {
  if (showTasks) return <section className="cj-panel" data-testid="journey-tasks-layer">
    <div className="cj-section-heading"><div><p className="cj-eyebrow">Tầng 4 · Công việc và chứng cứ nguồn</p><h2>Công việc của cam kết được phép thấy</h2></div>
      <span className="cj-badge">{packet.tasks.length} bản ghi công việc nhìn thấy · xem giới hạn nguồn bên dưới</span></div>
    <p className="cj-selected-commitment" data-testid="journey-task-parent">Nguồn đang xem: <strong>{packet.record.label || packet.record.ref}</strong> · <code>{packet.record.ref}</code></p>
    <p className="cj-basis" data-testid="journey-task-scope">Phạm vi task: {packet.task_scope.basis} · Không phân bổ tải / tiền cho khách, hóa đơn hoặc cam kết. Phạm vi customer/deal là các cạnh cam kết liên quan, không phải định mức của riêng một đơn.</p>
    <p className="cj-note">Người tạo không mặc định là chủ trì. Ngày ghi nhận không mặc định là bắt đầu. Đóng / hủy / hoàn thành / khách chấp nhận / hiệu quả sau sửa là những ý nghĩa khác nhau.</p>
    {!packet.tasks.length && <div className="cj-state" data-testid="journey-no-tasks">Chưa có task liên kết được phép thấy trong projection này. Không tạo việc hoặc owner/hạn thay thế.</div>}
    <div className="cj-record-grid">{packet.tasks.map((task) => <RecordCard key={task.ref} record={task} testId="journey-task" />)}</div>
    <GapList gaps={packet.gaps} />
    <details className="cj-source-edges"><summary>Quan hệ ID và provenance trong snapshot ({packet.edges.length})</summary>
      <ul>{packet.edges.map((edge, index) => <li key={index}><code>{typeof edge === 'string' ? edge : Object.entries(edge).filter(([, value]) => ['string', 'number', 'boolean'].includes(typeof value)).map(([key, value]) => `${key}: ${value}`).join(' · ')}</code></li>)}</ul>
    </details>
  </section>;

  return <section className="cj-panel" data-testid="journey-customer-layer">
    <div className="cj-section-heading"><div><p className="cj-eyebrow">Tầng 3 · Khách hàng + từng cam kết</p><h2>{packet.record.label || 'Hồ sơ nguồn'}</h2></div>
      <button className="cj-button" onClick={onTasks} data-testid="journey-open-tasks">Công việc / owner / hạn / blocker ({packet.tasks.length}) →</button></div>
    <p className="cj-note">Giữ riêng từng deal, đơn và công trình. Project dùng chung chỉ có một ID nguồn, không nhân doanh thu/chi phí/tải theo mỗi cạnh quan hệ.</p>
    <h3 className="cj-subheading">Khách hàng liên kết bằng ID</h3>
    {!packet.customers.length && <div className="cj-state" data-testid="journey-unlinked-customer">Chưa nối được customer ID được phép thấy / UNKNOWN. Không ghép tên hoặc số điện thoại.</div>}
    <div className="cj-record-grid">{packet.customers.map((record) => <RecordCard key={record.ref} record={record} testId="journey-customer" />)}</div>
    <h3 className="cj-subheading">Các cam kết / công trình có cạnh nguồn</h3>
    {!packet.commitments.length && <p className="cj-state">Chưa có cam kết liên kết được phép thấy. Hồ sơ lead không tự trở thành đơn chắc chắn.</p>}
    <div className="cj-record-grid">{packet.commitments.map((record) => <RecordCard key={record.ref} record={record} onTasks={onCommitmentTasks} />)}</div>
    <h3 className="cj-subheading">Hồ sơ đã chọn — dữ liệu theo nguồn</h3>
    <RecordCard record={packet.record} testId="journey-selected-source" />
    {Array.isArray(packet.related) && packet.related.length > 0 && <>
      <h3 className="cj-subheading">Nguồn liên quan được phép thấy</h3>
      <div className="cj-record-grid">{packet.related.map((record) => <RecordCard key={record.ref} record={record} testId="journey-related" />)}</div>
    </>}
    <GapList gaps={packet.gaps} />
  </section>;
}

/** Inject only the reviewed offline service. No fetch/auth/router/localStorage fallback. */
export default function CustomerJourneyExplorer({ client, initialContext }) {
  const [context, setContext] = useState(() => normalizeJourneyContext(initialContext));
  const [refresh, setRefresh] = useState(0);
  const [overview, setOverview] = useState(null);
  const [overviewError, setOverviewError] = useState(null);
  const [groupId, setGroupId] = useState(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(5);
  const [list, setList] = useState(null);
  const [listError, setListError] = useState(null);
  const [recordRef, setRecordRef] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailError, setDetailError] = useState(null);
  const [showTasks, setShowTasks] = useState(false);
  const [taskTarget, setTaskTarget] = useState(null);
  const [taskDetail, setTaskDetail] = useState(null);
  const [taskDetailError, setTaskDetailError] = useState(null);
  const overviewRevision = useRef(0);
  const listRevision = useRef(0);
  const detailRevision = useRef(0);
  const taskRevision = useRef(0);
  const contextKey = journeyContextKey(context);
  const groups = useMemo(() => overview?.systems.flatMap((system) => system.groups) || [], [overview]);
  const group = groups.find((candidate) => candidate.id === groupId) || null;

  useEffect(() => {
    let active = true;
    const revision = ++overviewRevision.current;
    setOverview(null); setOverviewError(null);
    setList(null); setDetail(null);
    Promise.resolve().then(() => client.overview(context)).then((packet) => {
      const checked = assertJourneyOverview(packet, context);
      if (active && revision === overviewRevision.current) setOverview(checked);
    }).catch((error) => { if (active && revision === overviewRevision.current) setOverviewError(safeJourneyError(error)); });
    return () => { active = false; };
  }, [client, contextKey, refresh]); // contextKey contains every supported scope/filter, not arbitrary object identity.

  useEffect(() => {
    let active = true;
    const revision = ++listRevision.current;
    setList(null); setListError(null);
    if (overview && group && !group.locked) {
      Promise.resolve().then(() => client.list(normalizeJourneyContext(overview.context), group.id, { page, pageSize })).then((packet) => {
        const checked = assertJourneyList(packet, overview.context, group.id, { page, pageSize, expectedGroup: group });
        if (active && revision === listRevision.current) setList(checked);
      }).catch((error) => { if (active && revision === listRevision.current) setListError(safeJourneyError(error)); });
    }
    return () => { active = false; };
  }, [client, overview, groupId, page, pageSize]);

  useEffect(() => {
    let active = true;
    const revision = ++detailRevision.current;
    setDetail(null); setDetailError(null);
    if (overview && group && !group.locked && recordRef) {
      Promise.resolve().then(() => client.detail(normalizeJourneyContext(overview.context), group.id, recordRef)).then((packet) => {
        const checked = assertJourneyDetail(packet, overview.context, group.id, recordRef);
        if (active && revision === detailRevision.current) setDetail(checked);
      }).catch((error) => { if (active && revision === detailRevision.current) setDetailError(safeJourneyError(error)); });
    }
    return () => { active = false; };
  }, [client, overview, groupId, recordRef]);

  useEffect(() => {
    let active = true;
    const revision = ++taskRevision.current;
    setTaskDetail(null); setTaskDetailError(null);
    if (showTasks && taskTarget && overview && group && recordRef) {
      const pinned = normalizeJourneyContext(overview.context);
      const via = { group_id: group.id, parent_ref: recordRef };
      Promise.resolve().then(() => client.detail(pinned, taskTarget.group_id, taskTarget.ref, { via })).then((packet) => {
        const checked = assertJourneyRelationDetail(packet, pinned, taskTarget.group_id, taskTarget.ref, via);
        if (active && revision === taskRevision.current) setTaskDetail(checked);
      }).catch((error) => { if (active && revision === taskRevision.current) setTaskDetailError(safeJourneyError(error)); });
    }
    return () => { active = false; };
  }, [client, overview, groupId, recordRef, taskTarget, showTasks]);

  function resetNavigation() {
    listRevision.current += 1; detailRevision.current += 1; taskRevision.current += 1;
    setGroupId(null); setPage(1); setRecordRef(null); setDetail(null); setList(null); setShowTasks(false); setTaskTarget(null); setTaskDetail(null);
  }
  function updateContext(patch) {
    const next = changeJourneyContext(context, patch);
    if (journeyContextKey(next) === contextKey) return;
    overviewRevision.current += 1;
    resetNavigation(); setOverview(null); setOverviewError(null);
    setContext(next);
  }
  function selectGroup(id) {
    if (!groups.some((candidate) => candidate.id === id)) return;
    if (id === groupId) { backToGroup(); return; }
    listRevision.current += 1; detailRevision.current += 1; taskRevision.current += 1;
    setGroupId(id); setPage(1); setRecordRef(null); setDetail(null); setList(null); setShowTasks(false); setTaskTarget(null); setTaskDetail(null);
  }
  function backToGroup() { detailRevision.current += 1; taskRevision.current += 1; setRecordRef(null); setDetail(null); setShowTasks(false); setTaskTarget(null); setTaskDetail(null); }
  function backToCustomer() { taskRevision.current += 1; setShowTasks(false); }
  function openAllTasks() { taskRevision.current += 1; setTaskTarget(null); setTaskDetail(null); setShowTasks(true); }
  function openCommitmentTasks(record) {
    taskRevision.current += 1; setTaskDetail(null); setTaskDetailError(null);
    setTaskTarget({ group_id: record.group_id, ref: record.ref }); setShowTasks(true);
  }
  const layer = showTasks && recordRef ? 4 : recordRef ? 3 : groupId ? 2 : 1;

  return <main className="cj-app" data-testid="customer-journey-app" data-layer={layer}>
    <div className="cj-offline-banner" data-testid="journey-offline-banner" role="note">
      <strong>NGOẠI TUYẾN / DỮ LIỆU GIẢ</strong>
      <span>Không kết nối dữ liệu doanh nghiệp · Không đăng nhập / token · Không ghi nghiệp vụ</span>
      <span>Founder Acceptance / daily use: HOLD · WP3: STOP</span>
    </div>
    <div className="cj-shell">
      <header className="cj-header"><div><p className="cj-eyebrow">BUSINESS AI OS · CANDIDATE OFFLINE REVIEW</p>
        <h1>Hành trình khách hàng</h1><p>Từ con số đến đúng hồ sơ, từng cam kết và công việc có nguồn.</p></div>
        <span className="cj-header-mark" aria-hidden="true">6 hệ<br /><strong>1 hành trình</strong></span></header>
      <section className="cj-filter-panel" aria-label="Phạm vi và bộ lọc hành trình">
        <div className="cj-filter-row">
          <label>Công ty trong phạm vi giả<select value={context.company_id} data-testid="journey-company" onChange={(event) => updateContext({ company_id: event.target.value })}>
            <option value="all">Tất cả công ty được phép thấy</option>
            {!overview && context.company_id !== 'all' && <option value={context.company_id}>{context.company_id} · đang đối chiếu</option>}
            {(overview?.companies || []).map((company) => <option key={company.id} value={company.id}>{company.name || company.id}</option>)}
          </select></label>
          <label>Kỳ kế hoạch<select value={context.period} data-testid="journey-period" onChange={(event) => updateContext({ period: event.target.value })}>
            {Object.entries(PERIOD_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select></label>
          <label>Ngày neo kỳ<input type="date" value={context.period_anchor} data-testid="journey-anchor" onChange={(event) => {
            if (/^\d{4}-\d{2}-\d{2}$/.test(event.target.value)) updateContext({ period_anchor: event.target.value });
          }} /></label>
          <label>Cơ sở thời gian<select value={context.filters.time_basis} data-testid="journey-time-basis" onChange={(event) => updateContext({ filters: { time_basis: event.target.value } })}>
            {Object.entries(TIME_BASIS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select></label>
        </div>
        <div className="cj-filter-row cj-filter-row-secondary">
          <label>Tìm theo nhãn hồ sơ nguồn<input type="search" placeholder="Nhãn hồ sơ trong bộ giả" value={context.filters.q} data-testid="journey-search" onChange={(event) => updateContext({ filters: { q: event.target.value } })} /></label>
          <label>Trạng thái nguồn<input placeholder="Trống = không lọc" value={context.filters.status} data-testid="journey-status" onChange={(event) => updateContext({ filters: { status: event.target.value } })} /></label>
          <label>Nhiệt độ lead<select value={context.filters.temperature} data-testid="journey-temperature" onChange={(event) => updateContext({ filters: { temperature: event.target.value } })}>
            <option value="">Không lọc</option><option value="cold">Lạnh (cold)</option><option value="warm">Ấm (warm)</option><option value="hot">Nóng (hot)</option><option value="unknown">Chưa phân loại (UNKNOWN)</option>
          </select></label>
          <button className="cj-button cj-button-secondary" data-testid="journey-refresh" onClick={() => { overviewRevision.current += 1; resetNavigation(); setOverview(null); setRefresh((value) => value + 1); }}>Đối chiếu lại bộ giả</button>
        </div>
        <p className="cj-note">Bộ lọc giữ nguyên khi đi sâu và quay lại. Kỳ kế hoạch không tự đổi stock thành luồng chuyển đổi; nhóm thiếu basis tương ứng giữ UNKNOWN.</p>
      </section>
      <nav className="cj-breadcrumb" aria-label="Bốn tầng hành trình" data-testid="journey-breadcrumb">
        <button aria-current={layer === 1 ? 'page' : undefined} onClick={resetNavigation} data-testid="journey-back-overview">1 · Sáu hệ</button><span>›</span>
        <button disabled={!groupId} aria-current={layer === 2 ? 'page' : undefined} onClick={backToGroup} data-testid="journey-back-group">2 · {group?.name || 'Công đoạn / ngoại lệ'}</button><span>›</span>
        <button disabled={!recordRef} aria-current={layer === 3 ? 'page' : undefined} onClick={backToCustomer} data-testid="journey-back-customer">3 · Khách + cam kết</button><span>›</span>
        <button disabled={!detail} aria-current={layer === 4 ? 'page' : undefined} onClick={openAllTasks} data-testid="journey-go-tasks">4 · Công việc / nguồn</button>
      </nav>
      <StateMessage loading={!overview && !overviewError} error={overviewError} />
      {overview && <>
        <ContextFacts overview={overview} />
        {!groupId && <Overview packet={overview} onSelectGroup={selectGroup} />}
        {group && !recordRef && <GroupRecords packet={list} group={group} page={page} pageSize={pageSize}
          loading={!list && !listError && !group.locked} error={listError}
          onPage={(value) => { if (value === page) return; listRevision.current += 1; setList(null); setPage(value); }}
          onPageSize={(value) => { if (value === pageSize && page === 1) return; listRevision.current += 1; setList(null); setPage(1); setPageSize(value); }}
          onSelectRecord={(ref) => { detailRevision.current += 1; taskRevision.current += 1; setDetail(null); setRecordRef(ref); setShowTasks(false); setTaskTarget(null); setTaskDetail(null); }} />}
        {recordRef && <><StateMessage loading={!detail && !detailError} error={detailError} />
          {detail && !showTasks && <JourneyDetail packet={detail} showTasks={false} onTasks={openAllTasks} onCommitmentTasks={openCommitmentTasks} />}
          {detail && showTasks && !taskTarget && <JourneyDetail packet={detail} showTasks />}
          {detail && showTasks && taskTarget && <><StateMessage loading={!taskDetail && !taskDetailError} error={taskDetailError} />
            {taskDetail && <JourneyDetail packet={taskDetail} showTasks />}</>}
        </>}
      </>}
      <footer className="cj-footer">C-READ được kiểm thử bằng fixture cô lập, không mở live allowlist. Cashflow ≠ lợi nhuận · Giờ ghi nhận ≠ lương · Đã đóng ≠ khách hài lòng / sửa có hiệu quả.<br />
        Phiên C3-R2 trước: operational closure PASS; supervisor FAIL; nguyên nhân UNDETERMINED. Bản ngoại tuyến không tự đóng điều kiện cho phiên live mới.</footer>
    </div>
  </main>;
}
