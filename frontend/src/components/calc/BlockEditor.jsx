/**
 * Block-based AST editor — dùng cho cả công thức (number) lẫn điều kiện (bool).
 * Không dùng Blockly (nặng). Mỗi node là 1 card lồng nhau, người dùng đổi
 * type qua dropdown, nhập value/key, bấm + thêm arg.
 *
 * Props:
 *   value: AST node
 *   onChange: (newAst) => void
 *   variables: [{ var_key, label, unit }] — autocomplete biến
 *   mode: 'number' | 'bool'   (gợi ý palette mặc định)
 */

import { useMemo } from 'react';
import { Plus, X, Hash, Variable, FunctionSquare, GitCompare, Brackets, Workflow } from 'lucide-react';
import {
  OPS, CMP_OPS, BOOL_OPS, FN_NAMES, nodeFactory, astToText,
} from './astUtils';

const TYPE_OPTIONS_NUMBER = [
  { value: 'num', label: 'Số', icon: Hash },
  { value: 'var', label: 'Biến', icon: Variable },
  { value: 'op', label: 'Toán tử', icon: FunctionSquare },
  { value: 'fn', label: 'Hàm', icon: Workflow },
  { value: 'if', label: 'Nếu/Thì/Khác', icon: Brackets },
];

const TYPE_OPTIONS_BOOL = [
  { value: 'cmp', label: 'So sánh', icon: GitCompare },
  { value: 'bool', label: 'AND / OR / NOT', icon: Workflow },
  { value: 'true', label: 'Đúng', icon: Hash },
  { value: 'false', label: 'Sai', icon: Hash },
  { value: 'noop', label: 'Mặc định (luôn khớp)', icon: Hash },
];

const ALL_TYPE_OPTIONS = [...TYPE_OPTIONS_NUMBER, ...TYPE_OPTIONS_BOOL];

function nodeAccentClass(type) {
  switch (type) {
    case 'num': return 'border-sky-300 bg-sky-50';
    case 'var': return 'border-emerald-300 bg-emerald-50';
    case 'op': return 'border-violet-300 bg-violet-50';
    case 'fn': return 'border-orange-300 bg-orange-50';
    case 'cmp': return 'border-rose-300 bg-rose-50';
    case 'bool': return 'border-amber-300 bg-amber-50';
    case 'if': return 'border-indigo-300 bg-indigo-50';
    default: return 'border-gray-300 bg-gray-50';
  }
}

function NodeCard({ node, path, onChange, onRemove, variables, depth = 0, mode }) {
  const updateChild = (idx, child) => {
    const args = [...(node.args || [])];
    args[idx] = child;
    onChange({ ...node, args });
  };

  const removeArg = (idx) => {
    const args = [...(node.args || [])];
    args.splice(idx, 1);
    onChange({ ...node, args });
  };

  const addArg = () => {
    const args = [...(node.args || []), { type: 'num', value: 0 }];
    onChange({ ...node, args });
  };

  const switchType = (newType) => {
    onChange(nodeFactory(newType));
  };

  // Filter type options: rule trong "bool" mode được dùng cả number nodes làm operand
  const typeOptions = useMemo(() => {
    if (depth === 0 && mode === 'bool') return TYPE_OPTIONS_BOOL;
    return ALL_TYPE_OPTIONS;
  }, [depth, mode]);

  const accent = nodeAccentClass(node.type);

  return (
    <div className={`border-2 rounded-lg p-2 ${accent}`}>
      <div className="flex items-center gap-2 flex-wrap">
        <select
          value={node.type}
          onChange={(e) => switchType(e.target.value)}
          className="text-xs border border-gray-300 rounded px-1.5 py-1 bg-white"
        >
          {typeOptions.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>

        {node.type === 'num' && (
          <input
            type="number"
            step="any"
            value={node.value ?? 0}
            onChange={(e) => onChange({ ...node, value: Number(e.target.value) })}
            className="w-28 text-sm border border-gray-300 rounded px-2 py-1 bg-white"
          />
        )}

        {node.type === 'var' && (
          <select
            value={node.key || ''}
            onChange={(e) => onChange({ ...node, key: e.target.value })}
            className="text-sm border border-gray-300 rounded px-2 py-1 bg-white"
          >
            <option value="">— chọn biến —</option>
            {variables.map((v) => (
              <option key={v.var_key} value={v.var_key}>
                {v.var_key} — {v.label}{v.unit ? ` (${v.unit})` : ''}
              </option>
            ))}
          </select>
        )}

        {node.type === 'op' && (
          <select
            value={node.op}
            onChange={(e) => onChange({ ...node, op: e.target.value })}
            className="text-sm border border-gray-300 rounded px-2 py-1 bg-white font-mono"
          >
            {OPS.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        )}

        {node.type === 'fn' && (
          <select
            value={node.name}
            onChange={(e) => onChange({ ...node, name: e.target.value })}
            className="text-sm border border-gray-300 rounded px-2 py-1 bg-white"
          >
            {FN_NAMES.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        )}

        {node.type === 'cmp' && (
          <select
            value={node.op}
            onChange={(e) => onChange({ ...node, op: e.target.value })}
            className="text-sm border border-gray-300 rounded px-2 py-1 bg-white font-mono"
          >
            {CMP_OPS.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        )}

        {node.type === 'bool' && (
          <select
            value={node.op}
            onChange={(e) => {
              const newOp = e.target.value;
              const args = newOp === 'not'
                ? [(node.args && node.args[0]) || { type: 'true' }]
                : (node.args && node.args.length >= 2 ? node.args : [{ type: 'true' }, { type: 'true' }]);
              onChange({ ...node, op: newOp, args });
            }}
            className="text-sm border border-gray-300 rounded px-2 py-1 bg-white uppercase"
          >
            {BOOL_OPS.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        )}

        {(node.type === 'if') && <span className="text-xs font-semibold text-indigo-700">IF (cond, then, else)</span>}
        {(node.type === 'true' || node.type === 'false') && (
          <span className="text-xs font-mono text-gray-500">{node.type.toUpperCase()}</span>
        )}
        {node.type === 'noop' && (
          <span className="text-xs italic text-gray-500">Rule mặc định — luôn khớp khi không rule trên trùng</span>
        )}

        {onRemove && (
          <button
            type="button"
            onClick={onRemove}
            title="Xóa node này"
            className="ml-auto p-1 text-gray-400 hover:text-rose-500"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Args */}
      {(node.type === 'op' || node.type === 'fn' || node.type === 'cmp' || node.type === 'bool' || node.type === 'if') && (
        <div className="mt-2 pl-3 border-l-2 border-dashed border-gray-300 space-y-2">
          {(node.args || []).map((child, idx) => (
            <div key={idx} className="flex items-start gap-1">
              {node.type === 'if' && (
                <span className="text-[10px] font-bold text-indigo-700 mt-2 w-10 shrink-0">
                  {idx === 0 ? 'cond' : idx === 1 ? 'then' : 'else'}
                </span>
              )}
              <div className="flex-1">
                <NodeCard
                  node={child}
                  path={[...path, idx]}
                  onChange={(c) => updateChild(idx, c)}
                  onRemove={
                    // op/cmp luôn 2 args; bool/and-or có thể nhiều; fn min/max có thể nhiều; if cố định 3
                    (node.type === 'fn' && (node.args || []).length > 1) ||
                    (node.type === 'bool' && node.op !== 'not' && (node.args || []).length > 2)
                      ? () => removeArg(idx)
                      : null
                  }
                  variables={variables}
                  depth={depth + 1}
                  mode={mode}
                />
              </div>
            </div>
          ))}

          {(node.type === 'fn' || (node.type === 'bool' && node.op !== 'not')) && (
            <button
              type="button"
              onClick={addArg}
              className="text-xs flex items-center gap-1 text-blue-600 hover:text-blue-800 px-2 py-1"
            >
              <Plus className="h-3 w-3" /> thêm tham số
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default function BlockEditor({ value, onChange, variables = [], mode = 'number' }) {
  const ast = value || (mode === 'bool' ? { type: 'true' } : { type: 'num', value: 0 });
  const preview = astToText(ast);
  return (
    <div className="space-y-2">
      <NodeCard
        node={ast}
        path={[]}
        onChange={onChange}
        variables={variables}
        depth={0}
        mode={mode}
      />
      <div className="text-xs text-gray-500 font-mono break-all bg-gray-50 border border-gray-200 rounded px-2 py-1">
        <span className="text-gray-400 mr-1">Xem trước:</span>{preview}
      </div>
    </div>
  );
}
