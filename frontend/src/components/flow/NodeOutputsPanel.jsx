import { useState } from 'react';
import { Database, Flag, ListChecks } from 'lucide-react';
import {
  outputsForNode,
  inputsForNode,
  outputTypeLabel,
  propertiesForNode,
  conditionsCatalogForNode,
  isSpecialKind,
  DATA_SIDE_LABEL,
} from '../../lib/flowNodeCatalog';

const TABS = [
  { id: 'props', label: 'Thuộc tính', Icon: ListChecks },
  { id: 'conds', label: 'Điều kiện', Icon: Flag },
  { id: 'data', label: 'Dữ liệu', Icon: Database },
];

/** Màu badge theo nơi dữ liệu đi tới / đi ra, để nhìn là biết bước nào liên quan. */
const SIDE_STYLE = {
  crm: 'border-blue-200 bg-blue-50 text-blue-700',
  production: 'border-orange-200 bg-orange-50 text-orange-700',
  logistics: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  projects: 'border-indigo-200 bg-indigo-50 text-indigo-700',
  form: 'border-slate-200 bg-white text-slate-500',
  config: 'border-slate-200 bg-white text-slate-500',
  calc: 'border-violet-200 bg-violet-50 text-violet-700',
};

function SideBadge({ side, prefix }) {
  if (!side) return null;
  return (
    <span className={`shrink-0 rounded border px-1.5 py-0.5 text-[9px] font-semibold ${SIDE_STYLE[side] || SIDE_STYLE.form}`}>
      {prefix} {DATA_SIDE_LABEL[side] || side}
    </span>
  );
}

function FactRow({ title, badge, desc, extra, side, sidePrefix }) {
  return (
    <li className="rounded-lg border border-slate-100 bg-slate-50/80 px-2 py-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[12px] font-semibold text-slate-700 truncate">{title}</span>
        <span className="flex shrink-0 items-center gap-1">
          <SideBadge side={side} prefix={sidePrefix} />
          {badge && (
            <span className="rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[9px] font-semibold text-slate-500">
              {badge}
            </span>
          )}
        </span>
      </div>
      {desc && <p className="mt-0.5 text-[10px] leading-snug text-slate-400">{desc}</p>}
      {extra && <p className="mt-0.5 font-mono text-[9px] text-slate-300">{extra}</p>}
    </li>
  );
}

/**
 * Cột thuộc tính: trường thật trên node, điều kiện đã có trong hệ thống,
 * và hợp đồng dữ liệu các khối sau có thể đọc.
 */
export default function NodeOutputsPanel({ nodeData }) {
  const props = propertiesForNode(nodeData);
  const conds = conditionsCatalogForNode(nodeData);
  const outputs = outputsForNode(nodeData, Boolean(nodeData?.isCustom));
  const inputs = inputsForNode(nodeData, Boolean(nodeData?.isCustom));
  const defaultTab = props.length ? 'props' : (conds.length ? 'conds' : 'data');
  const [tab, setTab] = useState(defaultTab);
  const flags = props.filter((p) => p.role === 'flag' || p.type === 'flag');
  const fields = props.filter((p) => p.role !== 'flag' && p.type !== 'flag');

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-3 space-y-2">
      <div className="flex gap-0.5 rounded-lg bg-slate-100 p-0.5">
        {TABS.map((t) => {
          const Icon = t.Icon;
          const count = t.id === 'props'
            ? props.length
            : t.id === 'conds' ? conds.length : outputs.length + inputs.length;
          if (!count && t.id !== 'data') return null;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`flex-1 flex items-center justify-center gap-0.5 rounded-md px-1 py-1 text-[9px] font-bold uppercase tracking-wide cursor-pointer ${
                tab === t.id ? 'bg-white text-[#296DFF] shadow-sm' : 'text-slate-500'
              }`}
            >
              <Icon className="h-3 w-3" />
              {t.label}
            </button>
          );
        })}
      </div>

      {tab === 'props' && (
        <>
          <p className="text-[10px] leading-relaxed text-slate-400">
            Trường và cờ đang có trên {isSpecialKind(nodeData?.node_kind) ? 'khối này' : 'module này'} — dùng để viết điều kiện hoặc lấy dữ liệu.
          </p>
          {flags.length > 0 && (
            <>
              <p className="text-[10px] font-bold uppercase tracking-wider text-amber-600">Cờ cột</p>
              <ul className="space-y-1.5">
                {flags.map((p) => (
                  <FactRow key={p.key} title={p.label} badge="cờ" desc={p.desc} extra={p.key} />
                ))}
              </ul>
            </>
          )}
          {fields.length > 0 && (
            <>
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Trường bản ghi</p>
              <ul className="space-y-1.5">
                {fields.map((p) => (
                  <FactRow key={p.key} title={p.label} badge={outputTypeLabel(p.type)} desc={p.desc} extra={p.key} />
                ))}
              </ul>
            </>
          )}
        </>
      )}

      {tab === 'conds' && (
        <>
          <p className="text-[10px] leading-relaxed text-slate-400">
            Điều kiện picker đã hỗ trợ. Bấm «Thêm điều kiện» bên dưới để gắn vào node hoặc cạnh.
          </p>
          <ul className="space-y-1.5">
            {conds.map((c) => (
              <FactRow
                key={`${c.type}-${c.flag || c.label}`}
                title={c.label}
                badge={c.type === 'stage_flag' ? 'cờ cột' : c.type === 'stage_reached' ? 'tới cột' : 'nhiệm vụ'}
                desc={c.when}
                extra={c.flag || c.type}
              />
            ))}
          </ul>
        </>
      )}

      {tab === 'data' && (
        <>
          <p className="text-[10px] leading-relaxed text-slate-400">
            Bàn giao giữa các bước không sao cả bản ghi — chỉ đúng những trường dưới đây.
          </p>

          {inputs.length > 0 && (
            <>
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Nhận vào</p>
              <ul className="space-y-1.5">
                {inputs.map((i) => (
                  <FactRow
                    key={`in-${i.key}`}
                    title={i.label}
                    desc={i.desc}
                    extra={i.key}
                    side={i.from}
                    sidePrefix="từ"
                  />
                ))}
              </ul>
            </>
          )}

          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Xuất ra</p>
          <ul className="space-y-1.5">
            {outputs.map((o) => (
              <FactRow
                key={`out-${o.key}`}
                title={o.label}
                badge={o.to ? null : outputTypeLabel(o.type)}
                desc={o.desc}
                extra={o.key}
                side={o.to}
                sidePrefix="sang"
              />
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
