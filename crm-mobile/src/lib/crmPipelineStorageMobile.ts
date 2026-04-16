import AsyncStorage from '@react-native-async-storage/async-storage';
import type { TimePresetKey } from './crmPipelineFiltersWeb';
import type { CrmPipelineClientFilters } from './crmPipelineFiltersWeb';

const KEY = 'crm_mobile_pipeline_ui_v1';

export type CrmPipelineViewMode = 'list' | 'kanban' | 'planner' | 'calendar';

/** Giống web CRMDashboard: lọc + viewMode; giai đoạn tách cho Lead vs Deal. */
export type CrmMobilePipelineSnapshot = Omit<CrmPipelineClientFilters, 'filterStage'> & {
  timePreset: TimePresetKey;
  customDateFrom: string;
  customDateTo: string;
  filterStageLead: string;
  filterStageDeal: string;
  viewMode: CrmPipelineViewMode;
};

const DEFAULT_SNAPSHOT: CrmMobilePipelineSnapshot = {
  timePreset: '',
  customDateFrom: '',
  customDateTo: '',
  searchText: '',
  filterCompany: '',
  filterAssignee: '',
  filterAssigneeName: '',
  filterSource: '',
  filterStageLead: '',
  filterStageDeal: '',
  filterPhone: 'has_phone',
  viewMode: 'list',
};

export async function loadCrmMobilePipelineSnapshot(): Promise<CrmMobilePipelineSnapshot> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT_SNAPSHOT };
    const o = JSON.parse(raw) as Partial<CrmMobilePipelineSnapshot> & { filterStage?: string };
    const fp = o.filterPhone;
    const normalized = String(fp) === 'all' ? '' : fp;
    const phoneOk = normalized === 'has_phone' || normalized === 'no_phone' || normalized === '';
    const legacyStage = typeof o.filterStage === 'string' ? o.filterStage : '';
    const vm = o.viewMode;
    const viewOk: CrmPipelineViewMode =
      vm === 'kanban' || vm === 'planner' || vm === 'calendar' || vm === 'list' ? vm : 'list';
    return {
      ...DEFAULT_SNAPSHOT,
      ...o,
      filterPhone: phoneOk ? (normalized as CrmPipelineClientFilters['filterPhone']) : 'has_phone',
      filterStageLead: o.filterStageLead ?? legacyStage ?? '',
      filterStageDeal: o.filterStageDeal ?? legacyStage ?? '',
      viewMode: viewOk,
    };
  } catch {
    return { ...DEFAULT_SNAPSHOT };
  }
}

export async function saveCrmMobilePipelineSnapshot(s: CrmMobilePipelineSnapshot): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(s));
}
