import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { useModuleAccess } from '../shared/context/ModuleAccessContext';
import {
  buildDealModulePath,
  canClickDealModule,
  isDealMemberOrOwner as checkDealMemberOrOwner,
} from '../lib/dealModulePathAccess';

/** Style thẻ theo module — active / idle / disabled */
const CHIP = {
  crm: {
    active: 'border-emerald-400 bg-emerald-50 text-emerald-900 shadow-sm ring-1 ring-emerald-200/80',
    idle: 'border-emerald-200 bg-white text-emerald-800 hover:bg-emerald-50 hover:border-emerald-300',
    disabled: 'border-gray-200 bg-gray-50 text-gray-400',
  },
  production: {
    active: 'border-orange-400 bg-orange-50 text-orange-900 shadow-sm ring-1 ring-orange-200/80',
    idle: 'border-orange-200 bg-white text-orange-800 hover:bg-orange-50 hover:border-orange-300',
    disabled: 'border-gray-200 bg-gray-50 text-gray-400',
  },
  logistics: {
    active: 'border-amber-400 bg-amber-50 text-amber-900 shadow-sm ring-1 ring-amber-200/80',
    idle: 'border-amber-200 bg-white text-amber-800 hover:bg-amber-50 hover:border-amber-300',
    disabled: 'border-gray-200 bg-gray-50 text-gray-400',
  },
};

const DOT = {
  crm: { active: 'bg-emerald-500', idle: 'bg-emerald-300', disabled: 'bg-gray-300' },
  production: { active: 'bg-orange-500', idle: 'bg-orange-300', disabled: 'bg-gray-300' },
  logistics: { active: 'bg-amber-500', idle: 'bg-amber-300', disabled: 'bg-gray-300' },
};

/**
 * Thanh path dạng thẻ: [ CRM >> Sản xuất >> VC/LĐ ]
 *
 * @param {{
 *   leadId: string|null|undefined,
 *   projectId?: string|null,
 *   currentModule?: 'crm'|'production'|'logistics'|'sx'|'vc',
 *   lead?: object|null,
 *   members?: Array|null,
 *   className?: string,
 * }} props
 */
export default function DealModulePathStrip({
  leadId,
  projectId = null,
  currentModule = 'crm',
  lead = null,
  members = null,
  className = '',
}) {
  const { user } = useAuth();
  const { canAccessModule } = useModuleAccess();

  if (!leadId) return null;

  const items = buildDealModulePath({ leadId, projectId, currentModule });
  const isMember = checkDealMemberOrOwner(user, lead, members);

  return (
    <nav
      data-tour="deal-module-path-strip"
      aria-label="Module dự án"
      className={`inline-flex max-w-full items-center gap-1 sm:gap-1.5 rounded-xl border border-slate-200 bg-slate-50/90 px-2 py-1.5 shadow-sm overflow-x-auto [scrollbar-width:thin] ${className}`.trim()}
    >
      <span className="shrink-0 select-none text-slate-300 font-light text-base leading-none px-0.5" aria-hidden>
        [
      </span>

      {items.map((item, idx) => {
        const { allowed, reason } = canClickDealModule({
          user,
          moduleKey: item.key,
          isDealMemberOrOwner: isMember,
          canAccessModule,
          hasHref: !!item.href,
        });
        const clickable = allowed && !!item.href;
        const tone = item.active ? 'active' : clickable ? 'idle' : 'disabled';
        const chipCls = CHIP[item.key]?.[tone] || CHIP.crm.disabled;
        const dotCls = DOT[item.key]?.[tone] || DOT.crm.disabled;
        const baseChip =
          'shrink-0 inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border text-xs font-semibold tracking-wide transition-colors';

        let node;
        if (clickable) {
          node = (
            <Link
              to={item.href}
              title={item.title}
              aria-current={item.active ? 'page' : undefined}
              className={`${baseChip} ${chipCls} cursor-pointer`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${dotCls}`} aria-hidden />
              {item.label}
            </Link>
          );
        } else {
          node = (
            <span
              title={reason || item.title}
              aria-disabled="true"
              className={`${baseChip} ${chipCls} cursor-not-allowed`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${dotCls}`} aria-hidden />
              {item.label}
            </span>
          );
        }

        return (
          <span key={item.key} className="inline-flex items-center gap-1 sm:gap-1.5 shrink-0">
            {idx > 0 && (
              <span
                className="inline-flex items-center text-slate-400 select-none"
                aria-hidden
              >
                <ChevronRight className="h-3.5 w-3.5 -mr-1 opacity-70" strokeWidth={2.5} />
                <ChevronRight className="h-3.5 w-3.5 opacity-90" strokeWidth={2.5} />
              </span>
            )}
            {node}
          </span>
        );
      })}

      <span className="shrink-0 select-none text-slate-300 font-light text-base leading-none px-0.5" aria-hidden>
        ]
      </span>
    </nav>
  );
}
