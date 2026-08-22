/**
 * Luồng tủ bếp đang chạy thật: CRM → Sản xuất → Lắp đặt
 * và các nhánh rẽ theo cờ cột đã có trên pipeline.
 *
 * Không bịa điều kiện mới — chỉ vẽ lại đúng trigger / cờ đang dùng trong runtime.
 */

import { NODE_KIND, defaultNodeConfig, specialMeta } from './flowNodeCatalog';

const EDGE = (source, target, label) => ({
  id: `e-${source}-${target}`,
  source,
  target,
  type: 'relation',
  animated: false,
  data: { label, condition_logic: 'all' },
});

const condFlag = (source, flag, label) => ({
  condition_type: 'stage_flag',
  config: { source, flag, label },
  is_required: true,
});

function moduleNode(id, moduleKey, { x, y, trigger, label, color, desc, branchMode = 'sequential' }) {
  return {
    id,
    type: 'moduleNode',
    position: { x, y },
    data: {
      node_kind: NODE_KIND.MODULE,
      module_key: moduleKey,
      handoff_trigger: trigger,
      description: '',
      branch_mode: branchMode,
      join_mode: 'all',
      node_config: {},
      label,
      color,
      desc,
      isCustom: false,
    },
  };
}

function specialNode(id, kind, { x, y, label, branchMode = 'conditional' }) {
  const meta = specialMeta(kind);
  return {
    id,
    type: 'specialNode',
    position: { x, y },
    data: {
      node_kind: kind,
      node_config: { ...defaultNodeConfig(kind), label },
      description: '',
      branch_mode: branchMode,
      join_mode: 'all',
      label: label || meta?.label,
      color: meta?.color || '#64748b',
    },
  };
}

/**
 * Canvas mô tả luồng hiện tại.
 * @returns {{ nodes, edges, conditions }}
 */
export function buildStandardCabinetBlueprint() {
  const nodes = [
    moduleNode('n-crm', 'crm', {
      x: 80, y: 220, trigger: 'on_won', branchMode: 'conditional',
      label: 'CRM', color: '#7c3aed', desc: 'Deal / khách hàng',
    }),
    specialNode('n-end-lost', NODE_KIND.END, { x: 80, y: 20, label: 'Kết thúc — Mất' }),
    specialNode('n-end-lead', NODE_KIND.END, { x: 80, y: 430, label: 'Kết thúc — Trả lead' }),
    specialNode('n-if-sx', NODE_KIND.CONDITION, { x: 420, y: 220, label: 'Thắng + cho chuyển SX?' }),
    moduleNode('n-sx', 'production', {
      x: 760, y: 220, trigger: 'on_stage_flag', branchMode: 'conditional',
      label: 'Sản xuất', color: '#ea580c', desc: 'Xưởng SX',
    }),
    specialNode('n-end-sx', NODE_KIND.END, { x: 760, y: 430, label: 'Ở lại xưởng' }),
    specialNode('n-if-ld', NODE_KIND.CONDITION, { x: 1100, y: 220, label: 'Bàn giao lắp đặt?' }),
    moduleNode('n-ld', 'logistics', {
      x: 1440, y: 220, trigger: 'manual',
      label: 'Lắp đặt', color: '#0f766e', desc: 'VC / lắp đặt',
    }),
    specialNode('n-end-done', NODE_KIND.END, { x: 1780, y: 220, label: 'Hoàn thành' }),
  ];

  const edges = [
    EDGE('n-crm', 'n-end-lost', 'Cột Mất'),
    EDGE('n-crm', 'n-end-lead', 'Trả về lead'),
    EDGE('n-crm', 'n-if-sx', 'Deal thắng'),
    EDGE('n-if-sx', 'n-sx', 'Cho chuyển SX'),
    EDGE('n-sx', 'n-end-sx', 'Chưa bàn giao'),
    EDGE('n-sx', 'n-if-ld', 'Đóng gói / bàn giao'),
    EDGE('n-if-ld', 'n-ld', 'Cột bàn giao LĐ'),
    EDGE('n-ld', 'n-end-done', 'Nghiệm thu xong'),
  ];

  let seq = 0;
  const edgeCond = (source, target, sourceMod, flag, label) => ({
    cid: `std-${++seq}`,
    scope: 'edge',
    step_node_id: null,
    source_node_id: source,
    target_node_id: target,
    ...condFlag(sourceMod, flag, label),
  });
  const stepCond = (step, sourceMod, flag, label) => ({
    cid: `std-${++seq}`,
    scope: 'step',
    step_node_id: step,
    source_node_id: null,
    target_node_id: null,
    ...condFlag(sourceMod, flag, label),
  });

  const conditions = [
    edgeCond('n-crm', 'n-end-lost', 'crm', 'is_lost', 'Cột Mất'),
    edgeCond('n-crm', 'n-end-lead', 'crm', 'allow_revert_to_lead', 'Cho trả về Lead'),
    edgeCond('n-crm', 'n-if-sx', 'crm', 'is_won', 'Cột Thắng'),
    edgeCond('n-if-sx', 'n-sx', 'crm', 'show_sx_transfer', 'Cho chuyển Sản xuất'),
    stepCond('n-crm', 'crm', 'is_won', 'Hoàn tất CRM khi deal thắng (on_won)'),
    stepCond('n-sx', 'production', 'is_packaging_done', 'Đóng gói xong — mở cột CRM «Đã sản xuất»'),
    edgeCond('n-sx', 'n-if-ld', 'production', 'is_handover_to_logistics', 'Cột bàn giao Lắp đặt'),
    edgeCond('n-if-ld', 'n-ld', 'production', 'is_handover_to_logistics', 'Cột bàn giao Lắp đặt'),
    stepCond('n-ld', 'logistics', 'is_temp_install_staging', 'Cột chờ lắp (Dự án sắp tới) — tuỳ chọn'),
  ];

  return { nodes, edges, conditions };
}

/** Luồng cũ 3 module thẳng, chưa có điều kiện / khối đặc biệt. */
export function isBareLinearCabinetFlow(nodes, edges, conditions) {
  if ((conditions || []).length) return false;
  const modules = (nodes || [])
    .filter((n) => (n.data?.node_kind || 'module') === 'module')
    .map((n) => n.data?.module_key);
  const specials = (nodes || []).filter((n) => (n.data?.node_kind || 'module') !== 'module');
  if (specials.length) return false;
  if (modules.length !== 3) return false;
  const want = ['crm', 'production', 'logistics'];
  if (!want.every((k) => modules.includes(k))) return false;
  const branch = (nodes || []).some((n) => (n.data?.branch_mode || 'sequential') !== 'sequential');
  if (branch) return false;
  return (edges || []).length <= 3;
}
