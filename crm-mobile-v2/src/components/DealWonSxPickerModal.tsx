import Ionicons from '@expo/vector-icons/Ionicons';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  fetchCrmProductionCompanies,
  fetchWorkshopProjectTypes,
  peekCrmProductionCompanies,
  type CrmSxProductionTarget,
  type ProductionCompanyOption,
  type WorkshopProjectTypeOption,
} from '../api/crm';
import { formatApiError } from '../api/client';
import PickerSheet from './PickerSheet';
import { Radii, Spacing, useColors, type ThemeColors } from '../theme';

const MAX_ROWS = 5;

type SxRow = {
  key: string;
  companyId: string;
  workshopTypeId: string;
  workshopTypes: WorkshopProjectTypeOption[];
  loadingTypes: boolean;
};

type Props = {
  visible: boolean;
  dealCode?: string | null;
  dealTitle?: string | null;
  /** Công ty CRM của deal — lọc danh sách SX. */
  crmCompanyId?: string | null;
  confirming?: boolean;
  onConfirm: (targets: CrmSxProductionTarget[]) => void;
  onClose: () => void;
};

function newRow(): SxRow {
  return {
    key: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    companyId: '',
    workshopTypeId: '',
    workshopTypes: [],
    loadingTypes: false,
  };
}

function validateRows(rows: SxRow[]): string {
  if (!rows.length) return 'Vui lòng chọn ít nhất một công ty Sản xuất.';
  const seen = new Set<string>();
  for (let i = 0; i < rows.length; i += 1) {
    const r = rows[i];
    if (r.loadingTypes) {
      return `Xưởng ${i + 1}: đang tải phân loại — đợi xong rồi xác nhận.`;
    }
    if (!r.companyId) return `Xưởng ${i + 1}: chưa chọn công ty SX.`;
    if (!r.workshopTypeId) return `Xưởng ${i + 1}: chưa chọn phân loại.`;
    const key = `${r.companyId}::${r.workshopTypeId}`;
    if (seen.has(key)) {
      return `Xưởng ${i + 1}: trùng công ty + phân loại với dòng trước.`;
    }
    seen.add(key);
  }
  return '';
}

/**
 * Modal chọn công ty SX + phân loại khi chuyển deal sang cột thắng.
 * Khớp web: hướng dẫn chọn xưởng + nhiều xưởng («+ Thêm công ty SX»).
 */
export default function DealWonSxPickerModal({
  visible,
  dealCode,
  dealTitle,
  crmCompanyId,
  confirming,
  onConfirm,
  onClose,
}: Props) {
  const Colors = useColors();
  const styles = useMemo(() => makeStyles(Colors), [Colors]);
  const insets = useSafeAreaInsets();

  const cachedCompanies = peekCrmProductionCompanies(crmCompanyId) || [];
  const [companies, setCompanies] = useState<ProductionCompanyOption[]>(cachedCompanies);
  const [rows, setRows] = useState<SxRow[]>([newRow()]);
  const [loadingCompanies, setLoadingCompanies] = useState(() => cachedCompanies.length === 0);
  const [error, setError] = useState<string | null>(null);
  const [typePickerFor, setTypePickerFor] = useState<string | null>(null);

  const reset = useCallback(() => {
    const peek = peekCrmProductionCompanies(crmCompanyId) || [];
    setCompanies(peek);
    setRows([newRow()]);
    setError(null);
    setLoadingCompanies(peek.length === 0);
    setTypePickerFor(null);
  }, [crmCompanyId]);

  const loadTypesForRow = useCallback(async (rowKey: string, companyId: string) => {
    if (!companyId) return;
    setRows((prev) =>
      prev.map((r) =>
        r.key === rowKey
          ? { ...r, loadingTypes: true, workshopTypes: [], workshopTypeId: '' }
          : r,
      ),
    );
    try {
      const list = await fetchWorkshopProjectTypes(companyId);
      setRows((prev) =>
        prev.map((r) => {
          if (r.key !== rowKey) return r;
          const auto = list.length === 1 ? list[0].id : '';
          return {
            ...r,
            loadingTypes: false,
            workshopTypes: list,
            workshopTypeId: auto,
          };
        }),
      );
    } catch (e) {
      setRows((prev) =>
        prev.map((r) => (r.key === rowKey ? { ...r, loadingTypes: false, workshopTypes: [] } : r)),
      );
      setError(formatApiError(e));
    }
  }, []);

  useEffect(() => {
    if (!visible) {
      reset();
      return;
    }
    let cancelled = false;
    const peek = peekCrmProductionCompanies(crmCompanyId);
    if (peek?.length) {
      setCompanies(peek);
      setLoadingCompanies(false);
    } else {
      setLoadingCompanies(true);
    }
    setError(null);
    void fetchCrmProductionCompanies(crmCompanyId)
      .then((list) => {
        if (cancelled) return;
        setCompanies(list);
        if (list.length === 1) {
          const only = list[0].id;
          setRows((prev) => {
            if (prev.length === 1 && prev[0].companyId === only) return prev;
            const row = newRow();
            row.companyId = only;
            void loadTypesForRow(row.key, only);
            return [row];
          });
        }
      })
      .catch((e) => {
        if (!cancelled) setError(formatApiError(e));
      })
      .finally(() => {
        if (!cancelled) setLoadingCompanies(false);
      });
    return () => {
      cancelled = true;
    };
  }, [visible, crmCompanyId, reset, loadTypesForRow]);

  const setCompany = (rowKey: string, companyId: string) => {
    setError(null);
    setRows((prev) =>
      prev.map((r) =>
        r.key === rowKey
          ? { ...r, companyId, workshopTypeId: '', workshopTypes: [], loadingTypes: !!companyId }
          : r,
      ),
    );
    if (companyId) void loadTypesForRow(rowKey, companyId);
  };

  const setType = (rowKey: string, workshopTypeId: string) => {
    setError(null);
    setRows((prev) =>
      prev.map((r) => (r.key === rowKey ? { ...r, workshopTypeId } : r)),
    );
  };

  const addRow = () => {
    if (rows.length >= MAX_ROWS || confirming) return;
    setRows((prev) => [...prev, newRow()]);
  };

  const removeRow = (rowKey: string) => {
    if (rows.length <= 1 || confirming) return;
    setRows((prev) => prev.filter((r) => r.key !== rowKey));
  };

  const typePickerRow = rows.find((r) => r.key === typePickerFor) || null;
  const anyLoadingTypes = rows.some((r) => r.loadingTypes);
  const canSubmit = !confirming && !loadingCompanies && !anyLoadingTypes;

  const submit = () => {
    const err = validateRows(rows);
    if (err) {
      setError(err);
      return;
    }
    setError(null);
    onConfirm(
      rows.map((r) => ({
        production_company_id: r.companyId,
        workshop_type_id: r.workshopTypeId,
      })),
    );
  };

  const companyLabel = (c: ProductionCompanyOption) => c.shortName || c.name;

  return (
    <>
      <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
        <Pressable style={styles.backdrop} onPress={onClose}>
          <Pressable
            style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) }]}
            onPress={() => {}}
          >
            <View style={styles.handle} />
            <View style={styles.header}>
              <View style={{ flex: 1 }}>
                <Text style={styles.title}>Chuyển công ty SX</Text>
                <Text style={styles.headerSub} numberOfLines={2}>
                  Deal {dealCode || ''}
                  {dealTitle ? ` — ${dealTitle}` : ''} sang Thắng. Chọn xưởng + phân loại để tạo dự án SX.
                </Text>
              </View>
              <TouchableOpacity onPress={onClose} hitSlop={8} style={styles.closeBtn}>
                <Ionicons name="close" size={22} color={Colors.textMuted} />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
              <View style={styles.guideBox}>
                <Text style={styles.guideTitle}>Hướng dẫn chọn xưởng</Text>
                <Text style={styles.guideLead}>
                  Chưa có phân loại CRM — ★ sẽ hiện khi deal có loại (Tủ bếp / Cửa…).
                </Text>
                <Text style={styles.guideBullet}>
                  • <Text style={styles.guideStrong}>Phúc Đạt</Text> chỉ làm cửa
                </Text>
                <Text style={styles.guideBullet}>
                  • Làm tủ bếp (Sang thiết kế) → chọn <Text style={styles.guideStrong}>HCB</Text>
                </Text>
                <Text style={styles.guideBullet}>
                  • Làm tủ bếp inox → chọn <Text style={styles.guideStrong}>Tủ bếp</Text> của{' '}
                  <Text style={styles.guideStrong}>Metalla</Text>
                </Text>
                <Text style={[styles.guideLead, { marginTop: 6, marginBottom: 0 }]}>
                  Có thể SX ở nhiều công ty (vd. cửa Phúc Đạt + tủ HCB). Bấm «+ Thêm công ty SX».
                </Text>
              </View>

              {loadingCompanies ? (
                <View style={styles.loadingWrap}>
                  <ActivityIndicator color={Colors.blue} />
                  <Text style={styles.loadingTxt}>Đang tải công ty SX…</Text>
                </View>
              ) : null}

              {rows.map((row, idx) => {
                const typeName =
                  row.workshopTypes.find((t) => t.id === row.workshopTypeId)?.name || '';
                return (
                  <View key={row.key} style={styles.workshopCard}>
                    <View style={styles.workshopHead}>
                      <Text style={styles.workshopTitle}>Xưởng {idx + 1}</Text>
                      {rows.length > 1 ? (
                        <TouchableOpacity
                          onPress={() => removeRow(row.key)}
                          disabled={!!confirming}
                          hitSlop={8}
                          style={styles.removeBtn}
                        >
                          <Ionicons name="trash-outline" size={16} color={Colors.red} />
                          <Text style={styles.removeTxt}>Xóa</Text>
                        </TouchableOpacity>
                      ) : null}
                    </View>

                    <Text style={styles.label}>Công ty sản xuất *</Text>
                    <View style={styles.companyList}>
                      {companies.length === 0 && !loadingCompanies ? (
                        <Text style={styles.emptyCompany}>Không có công ty SX.</Text>
                      ) : (
                        companies.map((c) => {
                          const selected = row.companyId === c.id;
                          return (
                            <TouchableOpacity
                              key={c.id}
                              style={[styles.companyRow, selected && styles.companyRowSelected]}
                              onPress={() => setCompany(row.key, c.id)}
                              disabled={!!confirming}
                              activeOpacity={0.75}
                            >
                              <Text style={styles.starPlaceholder}> </Text>
                              <Text
                                style={[styles.companyName, selected && styles.companyNameSelected]}
                                numberOfLines={2}
                              >
                                {companyLabel(c)}
                              </Text>
                            </TouchableOpacity>
                          );
                        })
                      )}
                    </View>

                    <Text style={styles.label}>Phân loại *</Text>
                    <TouchableOpacity
                      style={styles.pickRow}
                      onPress={() => {
                        if (!row.companyId || row.loadingTypes || confirming) return;
                        setTypePickerFor(row.key);
                      }}
                      disabled={!row.companyId || row.loadingTypes || !!confirming}
                      activeOpacity={0.75}
                    >
                      <Text
                        style={[styles.pickTxt, !row.workshopTypeId && styles.pickPlaceholder]}
                        numberOfLines={1}
                      >
                        {!row.companyId
                          ? '— Chọn công ty trước —'
                          : row.loadingTypes
                            ? 'Đang tải…'
                            : typeName
                              || (row.workshopTypes.length
                                ? '— Chọn phân loại —'
                                : '— Công ty chưa có phân loại —')}
                      </Text>
                      {row.loadingTypes ? (
                        <ActivityIndicator size="small" color={Colors.blue} />
                      ) : (
                        <Ionicons name="chevron-down" size={18} color={Colors.textMuted} />
                      )}
                    </TouchableOpacity>
                  </View>
                );
              })}

              {rows.length < MAX_ROWS ? (
                <TouchableOpacity
                  style={styles.addBtn}
                  onPress={addRow}
                  disabled={!!confirming}
                  activeOpacity={0.75}
                >
                  <Ionicons name="add" size={18} color={Colors.blue} />
                  <Text style={styles.addTxt}>Thêm công ty SX</Text>
                </TouchableOpacity>
              ) : null}

              {error ? <Text style={styles.error}>{error}</Text> : null}
            </ScrollView>

            <View style={styles.footer}>
              <TouchableOpacity style={styles.cancelBtn} onPress={onClose} disabled={!!confirming}>
                <Text style={styles.cancelTxt}>Hủy</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.okBtn, !canSubmit && styles.okBtnDisabled]}
                onPress={submit}
                disabled={!canSubmit}
              >
                {confirming ? (
                  <ActivityIndicator color={Colors.white} />
                ) : (
                  <Text style={styles.okTxt}>Xác nhận & chuyển cột</Text>
                )}
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <PickerSheet
        visible={!!typePickerRow}
        title={`Phân loại — Xưởng ${Math.max(1, rows.findIndex((r) => r.key === typePickerFor) + 1)}`}
        options={(typePickerRow?.workshopTypes || []).map((t) => ({ id: t.id, name: t.name }))}
        selectedId={typePickerRow?.workshopTypeId || null}
        searchable={(typePickerRow?.workshopTypes.length || 0) > 8}
        loading={!!typePickerRow?.loadingTypes}
        accent={Colors.blue}
        onSelect={(opt) => {
          if (typePickerFor && opt?.id) setType(typePickerFor, opt.id);
          setTypePickerFor(null);
        }}
        onClose={() => setTypePickerFor(null)}
      />
    </>
  );
}

const makeStyles = (Colors: ThemeColors) =>
  StyleSheet.create({
    backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
    sheet: {
      backgroundColor: Colors.bgElevated,
      borderTopLeftRadius: Radii.xl,
      borderTopRightRadius: Radii.xl,
      maxHeight: '92%',
      borderWidth: 1,
      borderColor: Colors.border,
      borderBottomWidth: 0,
    },
    handle: {
      width: 36,
      height: 4,
      borderRadius: 2,
      backgroundColor: Colors.border,
      alignSelf: 'center',
      marginTop: 10,
      marginBottom: 4,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      paddingHorizontal: Spacing.lg,
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: Colors.border,
      gap: 8,
    },
    title: { color: Colors.text, fontSize: 16, fontWeight: '800' },
    headerSub: { color: Colors.textMuted, fontSize: 12, marginTop: 4, lineHeight: 17 },
    closeBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
    body: { paddingHorizontal: Spacing.lg, paddingTop: 12, paddingBottom: 12, gap: 12 },
    guideBox: {
      borderRadius: Radii.md,
      borderWidth: 1,
      borderColor: '#F5D78E',
      backgroundColor: '#FFF8E8',
      paddingHorizontal: 12,
      paddingVertical: 10,
      gap: 3,
    },
    guideTitle: { color: '#7A4E00', fontSize: 13, fontWeight: '800', marginBottom: 2 },
    guideLead: { color: '#8A5A12', fontSize: 12, lineHeight: 17, marginBottom: 4 },
    guideBullet: { color: '#5C3D0A', fontSize: 12, lineHeight: 18 },
    guideStrong: { fontWeight: '800', color: '#5C3D0A' },
    loadingWrap: { alignItems: 'center', gap: 8, paddingVertical: 8 },
    loadingTxt: { color: Colors.textMuted, fontSize: 12 },
    workshopCard: {
      borderRadius: Radii.md,
      borderWidth: 1,
      borderColor: Colors.border,
      backgroundColor: Colors.bg,
      padding: 12,
      gap: 6,
    },
    workshopHead: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 2,
    },
    workshopTitle: { color: Colors.text, fontSize: 13, fontWeight: '800' },
    removeBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 36, paddingHorizontal: 4 },
    removeTxt: { color: Colors.red, fontSize: 12, fontWeight: '700' },
    label: { color: Colors.textMuted, fontSize: 12, fontWeight: '700', marginTop: 4 },
    companyList: {
      borderRadius: Radii.md,
      borderWidth: 1,
      borderColor: Colors.border,
      overflow: 'hidden',
      backgroundColor: Colors.bgElevated,
      maxHeight: 180,
    },
    emptyCompany: { color: Colors.textFaint, fontSize: 12, padding: 12 },
    companyRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 12,
      paddingVertical: 12,
      minHeight: 44,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: Colors.border,
    },
    companyRowSelected: {
      backgroundColor: 'rgba(20, 184, 166, 0.12)',
      borderLeftWidth: 3,
      borderLeftColor: '#14B8A6',
    },
    starPlaceholder: { width: 12, color: 'transparent' },
    companyName: { flex: 1, color: Colors.text, fontSize: 14, fontWeight: '500' },
    companyNameSelected: { fontWeight: '800' },
    pickRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      minHeight: 48,
      paddingHorizontal: 14,
      borderRadius: Radii.md,
      borderWidth: 1,
      borderColor: Colors.border,
      backgroundColor: Colors.bgElevated,
    },
    pickTxt: { flex: 1, color: Colors.text, fontSize: 14, fontWeight: '600' },
    pickPlaceholder: { color: Colors.textFaint, fontWeight: '500' },
    addBtn: {
      minHeight: 44,
      borderRadius: Radii.md,
      borderWidth: 1,
      borderStyle: 'dashed',
      borderColor: Colors.blue,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      backgroundColor: 'rgba(59, 130, 246, 0.06)',
    },
    addTxt: { color: Colors.blue, fontSize: 14, fontWeight: '700' },
    error: { color: Colors.red, fontSize: 12, fontWeight: '600' },
    footer: {
      flexDirection: 'row',
      gap: 10,
      paddingHorizontal: Spacing.lg,
      paddingTop: 10,
      borderTopWidth: 1,
      borderTopColor: Colors.border,
    },
    cancelBtn: {
      flex: 1,
      minHeight: 48,
      borderRadius: Radii.md,
      borderWidth: 1,
      borderColor: Colors.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    cancelTxt: { color: Colors.text, fontSize: 14, fontWeight: '700' },
    okBtn: {
      flex: 2,
      minHeight: 48,
      borderRadius: Radii.md,
      backgroundColor: Colors.blue,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 12,
    },
    okBtnDisabled: { opacity: 0.45 },
    okTxt: { color: Colors.white, fontSize: 14, fontWeight: '800' },
  });
