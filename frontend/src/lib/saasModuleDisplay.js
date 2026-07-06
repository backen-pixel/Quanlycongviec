import { Megaphone, Globe, Plug } from 'lucide-react';
import {
  CRM_MODULE_ICON,
  WORK_MODULE_ICON,
  SX_MODULE_ICON,
  VC_MODULE_ICON,
  KETOAN_MODULE_ICON,
  CALC_MODULE_ICON,
  KNOWLEDGE_MODULE_ICON,
} from './appSwitcherModules';

export const SAAS_ICON_URL_MAP = {
  sx: SX_MODULE_ICON,
  crm: CRM_MODULE_ICON,
  work: WORK_MODULE_ICON,
  vc: VC_MODULE_ICON,
  ketoan: KETOAN_MODULE_ICON,
  calc: CALC_MODULE_ICON,
  knowledge: KNOWLEDGE_MODULE_ICON,
};

export const SAAS_LUCIDE_MAP = {
  megaphone: Megaphone,
  globe: Globe,
  plug: Plug,
};

export function enrichSaasModule(mod) {
  const iconUrl = mod.icon_url || SAAS_ICON_URL_MAP[mod.icon_key] || null;
  const Icon = SAAS_LUCIDE_MAP[mod.icon_key] || null;
  const price = mod.price || String(mod.price_monthly || 0).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return { ...mod, iconUrl, Icon, price };
}

export const PURCHASE_STATUS_LABELS = {
  pending: { label: 'Chờ xử lý', tone: 'amber' },
  processing: { label: 'Đang xử lý', tone: 'blue' },
  provisioned: { label: 'Đã cấp TK', tone: 'green' },
  cancelled: { label: 'Đã huỷ', tone: 'gray' },
};

export const BADGE_LABELS = {
  bestSeller: 'BEST SELLER',
  new: 'Mới',
  comingSoon: 'Sắp ra mắt',
};
