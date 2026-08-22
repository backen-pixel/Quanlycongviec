import { memo, useState } from 'react';
import { Handle, Position } from '@xyflow/react';
import { GitFork, Plus, Link2, Puzzle, Split, Merge, Hourglass, Stamp, CircleStop, FileBarChart2, BellRing, Megaphone, Sparkles, Tags, ScanText, MessageCircleQuestion } from 'lucide-react';
import { specialMeta, NODE_KIND } from '../../lib/flowNodeCatalog';

const KIND_ICON = {
  [NODE_KIND.CONDITION]: GitFork,
  [NODE_KIND.FORK]: Split,
  [NODE_KIND.JOIN]: Merge,
  [NODE_KIND.WAIT]: Hourglass,
  [NODE_KIND.APPROVE]: Stamp,
  [NODE_KIND.END]: CircleStop,
  [NODE_KIND.REPORT]: FileBarChart2,
  [NODE_KIND.AI_REPORT]: Sparkles,
  [NODE_KIND.AI_DEADLINE]: BellRing,
  [NODE_KIND.NOTIFY]: Megaphone,
  [NODE_KIND.AI_CLASSIFY]: Tags,
  [NODE_KIND.AI_EXTRACT]: ScanText,
  [NODE_KIND.AI_ASK]: MessageCircleQuestion,
};

/**
 * Node điều khiển / hành động — nhỏ hơn module, cùng nút + để nối tiếp hoặc rẽ nhánh.
 */
const SpecialFlowNode = memo(function SpecialFlowNode({ id, data, selected }) {
  const meta = specialMeta(data.node_kind);
  const Icon = KIND_ICON[data.node_kind] || Puzzle;
  const color = data.color || meta?.color || '#64748b';
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuMode, setMenuMode] = useState(data.node_kind === NODE_KIND.CONDITION ? 'conditional' : 'sequential');
  const available = data.availableModules || [];
  const specials = data.availableSpecials || [];
  const connectTargets = data.connectTargets || [];
  const showPlus = data.node_kind !== NODE_KIND.END
    && (available.length > 0 || specials.length > 0 || connectTargets.length > 0);

  const pickModule = (moduleKey) => {
    data.onAddNext?.(id, { kind: NODE_KIND.MODULE, moduleKey }, menuMode);
    setMenuOpen(false);
  };
  const pickSpecial = (kind) => {
    data.onAddNext?.(id, { kind }, menuMode);
    setMenuOpen(false);
  };
  const pickExisting = (targetId) => {
    data.onConnectExisting?.(id, targetId, menuMode);
    setMenuOpen(false);
  };

  return (
    <div
      data-menu-open={menuOpen || undefined}
      className={`group relative w-[200px] rounded-2xl bg-white transition-all duration-150 ${
        selected
          ? 'shadow-[0_0_0_2px_#296DFF,0_8px_24px_rgba(41,109,255,0.18)]'
          : 'shadow-[0_2px_8px_rgba(15,23,42,0.06),0_0_0_1px_rgba(15,23,42,0.06)] hover:shadow-[0_8px_24px_rgba(15,23,42,0.1)]'
      }`}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="!-left-1.5 !w-3 !h-3 !rounded-full !border-2 !border-white !bg-[#296DFF] !shadow-sm"
      />

      <div className="flex items-center gap-2 px-3 pt-3 pb-2">
        <div
          className="w-8 h-8 rounded-[10px] flex items-center justify-center text-white shrink-0 shadow-sm"
          style={{ background: `linear-gradient(145deg, ${color}, ${color}cc)` }}
        >
          <Icon className="h-4 w-4" strokeWidth={2.2} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold text-slate-800 truncate">{data.label || meta?.label}</p>
          <p className="text-[10px] text-slate-400 truncate">{meta?.desc}</p>
        </div>
      </div>

      <div className="px-3 pb-3">
        <span
          className="inline-flex rounded-md px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide"
          style={{ background: `${color}18`, color }}
        >
          {meta?.category === 'action' ? 'Hành động' : 'Điều khiển'}
        </span>
      </div>

      {data.node_kind !== NODE_KIND.END && (
        <Handle
          type="source"
          position={Position.Right}
          className="!-right-1.5 !w-3 !h-3 !rounded-full !border-2 !border-white !bg-[#296DFF] !shadow-sm"
        />
      )}

      {showPlus && (
        <div
          data-node-plus
          className={`absolute top-1/2 -right-11 -translate-y-1/2 z-20 ${menuOpen ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'} transition-opacity`}
        >
          <button
            type="button"
            className={`w-8 h-8 rounded-full flex items-center justify-center cursor-pointer shadow-md border-2 border-white transition-colors ${
              menuOpen ? 'bg-[#296DFF] text-white' : 'bg-white text-[#296DFF] hover:bg-[#296DFF] hover:text-white'
            }`}
            title="Thêm bước tiếp theo"
            onClick={(e) => {
              e.stopPropagation();
              setMenuOpen((v) => !v);
            }}
          >
            <Plus className="h-4 w-4" strokeWidth={2.5} />
          </button>
          {menuOpen && (
            <div
              className="absolute left-10 top-1/2 -translate-y-1/2 w-56 rounded-xl bg-white shadow-[0_8px_28px_rgba(15,23,42,0.14)] ring-1 ring-slate-200/90 p-1.5 max-h-72 overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mb-1 flex gap-1 rounded-lg bg-slate-100 p-0.5">
                {[
                  { value: 'sequential', label: 'Tuyến tính' },
                  { value: 'parallel', label: 'Song song' },
                  { value: 'conditional', label: 'Rẽ ĐK' },
                ].map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setMenuMode(opt.value)}
                    className={`flex-1 rounded-md px-1 py-1 text-[10px] font-semibold cursor-pointer ${
                      menuMode === opt.value ? 'bg-white text-[#296DFF] shadow-sm' : 'text-slate-500'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>

              <p className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">Module</p>
              {available.map((m) => {
                const MIcon = m.Icon || Puzzle;
                return (
                  <button
                    key={m.key}
                    type="button"
                    onClick={() => pickModule(m.key)}
                    className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-slate-50 text-left cursor-pointer"
                  >
                    <div className="w-6 h-6 rounded-md flex items-center justify-center text-white shrink-0 text-[10px]" style={{ background: m.color }}>
                      {m.emoji ? <span>{m.emoji}</span> : <MIcon className="h-3 w-3" />}
                    </div>
                    <span className="text-[12px] font-medium text-slate-700 truncate">{m.label}</span>
                  </button>
                );
              })}

              <p className="mt-1 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-amber-600">Điều khiển / hành động</p>
              {specials.map((s) => (
                <button
                  key={s.kind}
                  type="button"
                  onClick={() => pickSpecial(s.kind)}
                  className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-slate-50 text-left cursor-pointer"
                >
                  <span className="w-6 h-6 rounded-md shrink-0" style={{ background: `${s.color}22` }} />
                  <span className="text-[12px] font-medium text-slate-700 truncate">{s.label}</span>
                </button>
              ))}

              {connectTargets.length > 0 && (
                <>
                  <p className="mt-1 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">Nối tới có sẵn</p>
                  {connectTargets.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => pickExisting(t.id)}
                      className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-slate-50 text-left cursor-pointer"
                    >
                      <Link2 className="h-3.5 w-3.5 text-slate-400" />
                      <span className="text-[12px] font-medium text-slate-700 truncate">{t.label}</span>
                    </button>
                  ))}
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
});

export default SpecialFlowNode;
