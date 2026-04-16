import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  Modal,
  Pressable,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import type { CrmMobilePipelineSnapshot } from '../lib/crmPipelineStorageMobile';
import {
  CRM_TIME_PRESETS_WEB,
  applyTimePresetChange,
  type TimePresetKey,
} from '../lib/crmPipelineFiltersWeb';
import { CrmColors, CrmRadii } from '../theme/crmTheme';

type CompanyRow = { id: string; name?: string | null };
type StageRow = { id: string; name?: string | null };
type SourceOpt = { id: string; label: string };
type UserRow = { id: string; full_name?: string | null; email?: string | null };

type Props = {
  visible: boolean;
  onClose: () => void;
  tab: 'lead' | 'deal';
  initial: CrmMobilePipelineSnapshot;
  onApply: (next: CrmMobilePipelineSnapshot) => void;
  companies: CompanyRow[];
  stages: StageRow[];
  sourceOptions: SourceOpt[];
  canPickAssignee: boolean;
  users: UserRow[];
  usersLoading: boolean;
};

function phoneLabel(mode: '' | 'has_phone' | 'no_phone') {
  if (mode === 'has_phone') return 'Đã có SĐT';
  if (mode === 'no_phone') return 'Chưa có SĐT';
  return 'Tất cả';
}

export default function CrmLeadListAdvancedFiltersModal({
  visible,
  onClose,
  tab,
  initial,
  onApply,
  companies,
  stages,
  sourceOptions,
  canPickAssignee,
  users,
  usersLoading,
}: Props) {
  const [draft, setDraft] = useState<CrmMobilePipelineSnapshot>(initial);

  useEffect(() => {
    if (visible) setDraft(initial);
  }, [visible, initial]);

  const stageRows = useMemo(() => [{ id: '', name: 'Tất cả giai đoạn' }, ...stages], [stages]);
  const stageField = tab === 'lead' ? 'filterStageLead' : 'filterStageDeal';
  const stageVal = tab === 'lead' ? draft.filterStageLead : draft.filterStageDeal;
  const companyRows = useMemo(() => [{ id: '', name: 'Tất cả công ty' }, ...companies], [companies]);
  const sourceRows = useMemo(() => [{ id: '', label: 'Tất cả nguồn' }, ...sourceOptions], [sourceOptions]);

  const setTimePreset = (key: TimePresetKey) => {
    setDraft((prev) => {
      const t = applyTimePresetChange(key, prev.customDateFrom, prev.customDateTo);
      return { ...prev, ...t };
    });
  };

  const apply = () => {
    onApply(draft);
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <Text style={styles.title}>Bộ lọc (giống web)</Text>
          <Text style={styles.sub}>Thời gian, công ty, giai đoạn, nguồn, SĐT, nhân viên…</Text>

          <ScrollView style={styles.scroll} keyboardShouldPersistTaps="handled">
            <Text style={styles.lbl}>Thời gian</Text>
            <View style={styles.chipWrap}>
              {CRM_TIME_PRESETS_WEB.map((p) => (
                <TouchableOpacity
                  key={p.key || 'all'}
                  style={[styles.chip, draft.timePreset === p.key && styles.chipOn]}
                  onPress={() => setTimePreset(p.key)}
                >
                  <Text style={[styles.chipTxt, draft.timePreset === p.key && styles.chipTxtOn]}>{p.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
            {draft.timePreset === 'custom' ? (
              <View style={styles.row2}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.lblSm}>Từ (YYYY-MM-DD)</Text>
                  <TextInput
                    style={styles.inp}
                    value={draft.customDateFrom}
                    onChangeText={(v) => setDraft((d) => ({ ...d, customDateFrom: v }))}
                    placeholder="2026-01-01"
                    placeholderTextColor={CrmColors.gray400}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.lblSm}>Đến</Text>
                  <TextInput
                    style={styles.inp}
                    value={draft.customDateTo}
                    onChangeText={(v) => setDraft((d) => ({ ...d, customDateTo: v }))}
                    placeholder="2026-01-31"
                    placeholderTextColor={CrmColors.gray400}
                  />
                </View>
              </View>
            ) : null}

            <Text style={styles.lbl}>Số điện thoại (API + danh sách)</Text>
            <View style={styles.chipWrap}>
              {(['', 'has_phone', 'no_phone'] as const).map((k) => (
                <TouchableOpacity
                  key={k || 'allp'}
                  style={[styles.chip, draft.filterPhone === k && styles.chipOn]}
                  onPress={() => setDraft((d) => ({ ...d, filterPhone: k }))}
                >
                  <Text style={[styles.chipTxt, draft.filterPhone === k && styles.chipTxtOn]}>{phoneLabel(k)}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.lbl}>Công ty</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.hScroll}>
              {companyRows.map((c) => (
                <TouchableOpacity
                  key={c.id || 'co'}
                  style={[styles.chip, draft.filterCompany === c.id && styles.chipOn]}
                  onPress={() => setDraft((d) => ({ ...d, filterCompany: c.id }))}
                >
                  <Text style={[styles.chipTxt, draft.filterCompany === c.id && styles.chipTxtOn]} numberOfLines={1}>
                    {c.name || '—'}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <Text style={styles.lbl}>Giai đoạn ({tab === 'lead' ? 'Lead' : 'Deal'})</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.hScroll}>
              {stageRows.map((s) => (
                <TouchableOpacity
                  key={s.id || 'st'}
                  style={[styles.chip, stageVal === s.id && styles.chipOn]}
                  onPress={() =>
                    setDraft((d) =>
                      stageField === 'filterStageLead'
                        ? { ...d, filterStageLead: s.id }
                        : { ...d, filterStageDeal: s.id },
                    )
                  }
                >
                  <Text style={[styles.chipTxt, stageVal === s.id && styles.chipTxtOn]} numberOfLines={1}>
                    {s.name || '—'}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <Text style={styles.lbl}>Nguồn (smart)</Text>
            {sourceRows.map((s) => (
              <TouchableOpacity
                key={s.id || 'src'}
                style={[styles.listRow, draft.filterSource === s.id && styles.listRowOn]}
                onPress={() => setDraft((d) => ({ ...d, filterSource: s.id }))}
              >
                <Text style={styles.listRowTxt} numberOfLines={2}>
                  {s.label || s.id}
                </Text>
              </TouchableOpacity>
            ))}

            <Text style={styles.lbl}>Tên người phụ trách (lọc theo tên)</Text>
            <TextInput
              style={styles.inpFull}
              value={draft.filterAssigneeName}
              onChangeText={(v) => setDraft((d) => ({ ...d, filterAssigneeName: v }))}
              placeholder="Nhập tên NV…"
              placeholderTextColor={CrmColors.gray400}
            />

            {canPickAssignee ? (
              <>
                <Text style={styles.lbl}>Nhân viên (UUID)</Text>
                {usersLoading ? <ActivityIndicator color={CrmColors.blue600} style={{ marginVertical: 8 }} /> : null}
                <View style={{ maxHeight: 220 }}>
                  {[{ id: '', full_name: 'Tất cả nhân viên' }, ...users].map((u) => (
                    <TouchableOpacity
                      key={u.id || 'allu'}
                      style={[styles.listRow, draft.filterAssignee === u.id && styles.listRowOn]}
                      onPress={() => setDraft((d) => ({ ...d, filterAssignee: u.id }))}
                    >
                      <Text style={styles.listRowTxt}>{u.full_name || u.email || u.id || '—'}</Text>
                      {u.email && u.full_name ? <Text style={styles.listEmail}>{u.email}</Text> : null}
                    </TouchableOpacity>
                  ))}
                </View>
              </>
            ) : null}
          </ScrollView>

          <View style={styles.actions}>
            <TouchableOpacity style={styles.btnGhost} onPress={onClose}>
              <Text style={styles.btnGhostTxt}>Hủy</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.btnPrimary} onPress={apply}>
              <Text style={styles.btnPrimaryTxt}>Áp dụng</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: CrmColors.white,
    borderTopLeftRadius: CrmRadii.xl,
    borderTopRightRadius: CrmRadii.xl,
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 22,
    maxHeight: '88%',
  },
  title: { fontSize: 18, fontWeight: '800', color: CrmColors.gray900 },
  sub: { fontSize: 12, color: CrmColors.gray500, marginTop: 4, marginBottom: 10 },
  scroll: { maxHeight: '100%' },
  lbl: { fontSize: 12, fontWeight: '700', color: CrmColors.gray600, marginTop: 12, marginBottom: 8 },
  lblSm: { fontSize: 11, fontWeight: '600', color: CrmColors.gray500, marginBottom: 4 },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: CrmRadii.full,
    backgroundColor: CrmColors.gray50,
    borderWidth: 1,
    borderColor: CrmColors.gray200,
  },
  chipOn: { backgroundColor: CrmColors.blue50, borderColor: CrmColors.blue600 },
  chipTxt: { fontSize: 12, fontWeight: '600', color: CrmColors.gray600 },
  chipTxtOn: { color: CrmColors.blue700 },
  hScroll: { marginBottom: 4 },
  row2: { flexDirection: 'row', gap: 10, marginTop: 4 },
  inp: {
    borderWidth: 1,
    borderColor: CrmColors.gray200,
    borderRadius: CrmRadii.md,
    paddingHorizontal: 10,
    paddingVertical: 10,
    fontSize: 14,
    color: CrmColors.gray900,
  },
  inpFull: {
    borderWidth: 1,
    borderColor: CrmColors.gray200,
    borderRadius: CrmRadii.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: CrmColors.gray900,
  },
  listRow: {
    paddingVertical: 12,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: CrmColors.gray100,
  },
  listRowOn: { backgroundColor: CrmColors.blue50 },
  listRowTxt: { fontSize: 14, fontWeight: '600', color: CrmColors.gray900 },
  listEmail: { fontSize: 12, color: CrmColors.gray500, marginTop: 4 },
  actions: { flexDirection: 'row', gap: 12, marginTop: 14, justifyContent: 'flex-end' },
  btnGhost: { paddingVertical: 12, paddingHorizontal: 16 },
  btnGhostTxt: { fontSize: 15, fontWeight: '700', color: CrmColors.gray600 },
  btnPrimary: {
    backgroundColor: CrmColors.blue600,
    paddingVertical: 12,
    paddingHorizontal: 22,
    borderRadius: CrmRadii.md,
  },
  btnPrimaryTxt: { color: CrmColors.white, fontWeight: '700', fontSize: 15 },
});
