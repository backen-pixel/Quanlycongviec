import { present } from './view-model.js';
import type { Result } from './bridge.js';
export function FounderCard({ result }: { result: Result }) {
  const m = present(result);
  return <article className="control"><header><h1>{m.title}</h1><strong>{m.outcome}</strong></header>
    <p>Công ty: {m.scope}</p><p>{m.period}</p><p>Đọc lúc: {m.fetched}</p><p className="notice">{m.sourceAsOf}</p>
    {m.metrics.length > 0 && <dl>{m.metrics.map(x => <div key={x.key}><dt>{x.label}</dt><dd>{x.value} · {x.status}</dd><small>Nguồn: {x.sources}{x.reason && ` · ${x.reason}`}</small></div>)}</dl>}
    {m.systems.map(s => <section key={s.title}><h2>{s.title}</h2><p>{s.next}</p><small>Phụ trách: {s.owner}</small></section>)}
    {m.evidence && <section><h2>Bằng chứng CRM</h2><p>Khách: {m.evidence.lead}</p><p>Phản hồi: {m.evidence.response} · {m.evidence.minutes} phút trong ca</p><p>{m.evidence.next}</p><p>Mã bằng chứng: {m.evidence.refs.join(', ') || 'Chưa có'}</p></section>}
    {m.objectives.map(o => <section key={o.id}><h2>{o.title}</h2><p>{o.status} · Phụ trách: {o.owner}</p></section>)}
    {m.decisions.map(d => <p key={d.id}>{d.decision} · Đề xuất {d.proposal} phiên bản {d.version}</p>)}
    {m.recording && <p className="notice">{m.recording}</p>}
    <details><summary>Nguồn và độ đầy đủ</summary>{m.sources.map(s => <p key={s.ref}>{s.ref}: {s.status} · {s.coverage} · {s.freshness}{s.reason && ` · ${s.reason}`}</p>)}</details>
  </article>;
}

export function FounderError() { return <p role="alert">Không lấy được dữ liệu. Kiểm tra quyền hoặc nguồn; hiện chưa đo được.</p>; }
