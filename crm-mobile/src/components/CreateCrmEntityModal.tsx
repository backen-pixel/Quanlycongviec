import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  Modal,
  ScrollView,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Pressable,
  Alert,
  FlatList,
} from 'react-native';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import type { CrmCompany, CrmSource, CrmStage } from '../types/crm';
import { CrmColors, CrmRadii, CrmShadow } from '../theme/crmTheme';

type Mode = 'lead' | 'deal';

type Props = {
  visible: boolean;
  mode: Mode;
  onClose: () => void;
  onCreated?: () => void;
};

export default function CreateCrmEntityModal({ visible, mode, onClose, onCreated }: Props) {
  const { user } = useAuth();
  const defaultCompany = user?.company_id ? String(user.company_id) : '';

  const [companies, setCompanies] = useState<CrmCompany[]>([]);
  const [sources, setSources] = useState<CrmSource[]>([]);
  const [loadingMeta, setLoadingMeta] = useState(false);
  const [saving, setSaving] = useState(false);

  const [title, setTitle] = useState('');
  const [companyId, setCompanyId] = useState(defaultCompany);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [sourceId, setSourceId] = useState('');
  const [estimatedValue, setEstimatedValue] = useState('');
  const [probability, setProbability] = useState('50');
  const [installAddress, setInstallAddress] = useState('');
  const [description, setDescription] = useState('');
  const [sourcePickerOpen, setSourcePickerOpen] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setCompanyId(defaultCompany);
    setLoadingMeta(true);
    (async () => {
      try {
        const [co, so] = await Promise.all([
          api.get<{ companies: CrmCompany[] }>('/companies').catch(() => ({ data: { companies: [] } })),
          api.get<{ sources: CrmSource[] }>('/crm/sources').catch(() => ({ data: { sources: [] } })),
        ]);
        setCompanies(co.data?.companies || []);
        setSources(so.data?.sources || []);
      } finally {
        setLoadingMeta(false);
      }
    })();
  }, [visible, defaultCompany]);

  const reset = () => {
    setTitle('');
    setCompanyId(defaultCompany);
    setCustomerName('');
    setCustomerPhone('');
    setCustomerEmail('');
    setSourceId('');
    setEstimatedValue('');
    setProbability('50');
    setInstallAddress('');
    setDescription('');
  };

  const submit = async () => {
    if (!title.trim()) {
      Alert.alert('Thiếu dữ liệu', mode === 'lead' ? 'Nhập tên lead.' : 'Nhập tên deal.');
      return;
    }
    if (!companyId) {
      Alert.alert('Thiếu dữ liệu', 'Chọn công ty.');
      return;
    }
    if (!customerName.trim()) {
      Alert.alert('Thiếu dữ liệu', 'Nhập tên khách hàng.');
      return;
    }
    if (mode === 'deal' && !customerPhone.trim()) {
      Alert.alert('Thiếu dữ liệu', 'Deal cần số điện thoại khách hàng.');
      return;
    }
    if (mode === 'lead' && !customerPhone.trim()) {
      const ok = await new Promise<boolean>((resolve) => {
        Alert.alert(
          'Chưa có SĐT',
          'Bạn có thể bổ sung sau ở chi tiết Lead. Tiếp tục tạo?',
          [
            { text: 'Hủy', style: 'cancel', onPress: () => resolve(false) },
            { text: 'Tiếp tục', onPress: () => resolve(true) },
          ],
        );
      });
      if (!ok) return;
    }

    setSaving(true);
    try {
      const { data: customer } = await api.post<{ id: string }>('/customers', {
        full_name: customerName.trim(),
        phone: customerPhone.trim() || null,
        ...(mode === 'deal'
          ? {
              email: customerEmail.trim() || null,
              address: installAddress.trim() || null,
            }
          : {}),
      });
      const customerId = customer?.id;

      if (mode === 'lead') {
        const { data: stagesRaw } = await api.get<CrmStage[]>('/crm/pipeline-stages', { params: { type: 'lead' } });
        const stagesList = Array.isArray(stagesRaw) ? stagesRaw : [];
        const ordered = [...stagesList].sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0));
        const firstStage = ordered[0];
        await api.post('/crm/leads', {
          title: title.trim(),
          customer_id: customerId || null,
          source_id: sourceId || null,
          company_id: companyId || null,
          assigned_to: user?.id || user?.userId || null,
          type: 'lead',
          stage_id: firstStage?.id,
          estimated_value: parseFloat(estimatedValue) || 0,
          probability: parseInt(probability, 10) || 50,
        });
      } else {
        await api.post('/crm/deals', {
          title: title.trim(),
          customer_id: customerId || null,
          source_id: sourceId || null,
          company_id: companyId || null,
          estimated_value: parseFloat(estimatedValue) || 0,
          probability: parseInt(probability, 10) || 50,
          install_address: installAddress.trim() || null,
          description: description.trim() || null,
        });
      }
      reset();
      onClose();
      onCreated?.();
    } catch (e: unknown) {
      const msg =
        (e as { response?: { data?: { error?: string } } })?.response?.data?.error ||
        (e as Error)?.message ||
        'Lỗi tạo mới';
      Alert.alert('Lỗi', String(msg));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={styles.head}>
            <View>
              <Text style={styles.h2}>{mode === 'lead' ? '💼 Thêm Lead mới' : '🎯 Tạo Deal mới'}</Text>
              <Text style={styles.sub}>
                {mode === 'lead' ? 'Tạo lead + khách hàng mới' : 'Tạo deal trực tiếp (không qua lead)'}
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={styles.close}>✕</Text>
            </TouchableOpacity>
          </View>

          {loadingMeta ? (
            <ActivityIndicator style={{ marginVertical: 20 }} color={CrmColors.blue600} />
          ) : (
            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <Text style={styles.label}>Tên {mode === 'lead' ? 'lead' : 'deal'} *</Text>
              <TextInput
                style={styles.input}
                value={title}
                onChangeText={setTitle}
                placeholder={mode === 'lead' ? 'VD: Tủ bếp nhà anh A…' : 'VD: Deal tủ bếp gỗ sồi…'}
                placeholderTextColor={CrmColors.gray400}
              />

              <Text style={styles.label}>🏢 Công ty *</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll}>
                {companies.map((c) => {
                  const on = companyId === c.id;
                  return (
                    <TouchableOpacity
                      key={c.id}
                      style={[styles.chip, on && styles.chipOn]}
                      onPress={() => setCompanyId(c.id)}
                    >
                      <Text style={[styles.chipTxt, on && styles.chipTxtOn]} numberOfLines={1}>
                        {c.short_name || c.name}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              <View style={styles.khBox}>
                <Text style={styles.khTitle}>👤 Khách hàng</Text>
                <Text style={styles.label}>Tên *</Text>
                <TextInput style={styles.input} value={customerName} onChangeText={setCustomerName} placeholder="Họ tên" />
                <Text style={styles.label}>SĐT{mode === 'deal' ? ' *' : ''}</Text>
                <TextInput style={styles.input} value={customerPhone} onChangeText={setCustomerPhone} keyboardType="phone-pad" placeholder="090…" />
                {mode === 'deal' ? (
                  <>
                    <Text style={styles.label}>Email</Text>
                    <TextInput
                      style={styles.input}
                      value={customerEmail}
                      onChangeText={setCustomerEmail}
                      keyboardType="email-address"
                      autoCapitalize="none"
                    />
                  </>
                ) : null}
              </View>

              {mode === 'deal' ? (
                <>
                  <Text style={styles.label}>📍 Địa chỉ lắp đặt</Text>
                  <TextInput style={styles.input} value={installAddress} onChangeText={setInstallAddress} />
                </>
              ) : null}

              <Text style={styles.label}>Nguồn (chọn rõ ràng)</Text>
              <TouchableOpacity style={styles.sourcePick} onPress={() => setSourcePickerOpen(true)} activeOpacity={0.85}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.sourcePickMain}>
                    {sourceId
                      ? sources.find((x) => x.id === sourceId)?.name || 'Đã chọn'
                      : '— Không chọn nguồn —'}
                  </Text>
                  {sourceId ? (
                    <Text style={styles.sourcePickSub} numberOfLines={3}>
                      {[
                        sources.find((x) => x.id === sourceId)?.code,
                        sources.find((x) => x.id === sourceId)?.description,
                      ]
                        .filter(Boolean)
                        .join(' · ') || 'Không có mô tả thêm'}
                    </Text>
                  ) : (
                    <Text style={styles.sourcePickSub}>Chạm để mở danh sách nguồn CRM</Text>
                  )}
                </View>
                <Text style={styles.sourcePickChev}>▾</Text>
              </TouchableOpacity>

              <Modal visible={sourcePickerOpen} animationType="slide" transparent onRequestClose={() => setSourcePickerOpen(false)}>
                <Pressable style={styles.srcBackdrop} onPress={() => setSourcePickerOpen(false)}>
                  <Pressable style={styles.srcSheet} onPress={(e) => e.stopPropagation()}>
                    <Text style={styles.srcTitle}>Chọn nguồn</Text>
                    <TouchableOpacity
                      style={styles.srcRow}
                      onPress={() => {
                        setSourceId('');
                        setSourcePickerOpen(false);
                      }}
                    >
                      <Text style={styles.srcRowMain}>— Không chọn —</Text>
                    </TouchableOpacity>
                    <FlatList
                      data={sources}
                      keyExtractor={(s) => s.id}
                      style={{ maxHeight: 420 }}
                      renderItem={({ item: s }) => {
                        const on = sourceId === s.id;
                        const sub = [s.code, s.description].filter(Boolean).join(' · ');
                        return (
                          <TouchableOpacity
                            style={[styles.srcRow, on && styles.srcRowOn]}
                            onPress={() => {
                              setSourceId(s.id);
                              setSourcePickerOpen(false);
                            }}
                          >
                            <Text style={styles.srcRowMain}>
                              {(s.icon ? `${s.icon} ` : '') + (s.name || s.id)}
                            </Text>
                            {sub ? (
                              <Text style={styles.srcRowSub} numberOfLines={4}>
                                {sub}
                              </Text>
                            ) : null}
                          </TouchableOpacity>
                        );
                      }}
                    />
                    <TouchableOpacity style={styles.srcClose} onPress={() => setSourcePickerOpen(false)}>
                      <Text style={styles.srcCloseTxt}>Đóng</Text>
                    </TouchableOpacity>
                  </Pressable>
                </Pressable>
              </Modal>

              <View style={styles.row2}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>Giá trị (VND)</Text>
                  <TextInput style={styles.input} value={estimatedValue} onChangeText={setEstimatedValue} keyboardType="numeric" />
                </View>
                <View style={{ flex: 1, marginLeft: 10 }}>
                  <Text style={styles.label}>Xác suất %</Text>
                  <TextInput style={styles.input} value={probability} onChangeText={setProbability} keyboardType="numeric" />
                </View>
              </View>

              {mode === 'deal' ? (
                <>
                  <Text style={styles.label}>Ghi chú</Text>
                  <TextInput
                    style={[styles.input, { minHeight: 72 }]}
                    value={description}
                    onChangeText={setDescription}
                    multiline
                    textAlignVertical="top"
                  />
                </>
              ) : null}

              <TouchableOpacity
                style={[styles.submit, mode === 'deal' ? styles.submitDeal : null, saving && { opacity: 0.6 }]}
                onPress={() => void submit()}
                disabled={saving}
              >
                {saving ? (
                  <ActivityIndicator color={CrmColors.white} />
                ) : (
                  <Text style={styles.submitTxt}>{mode === 'lead' ? 'Tạo Lead' : 'Tạo Deal'}</Text>
                )}
              </TouchableOpacity>
              <TouchableOpacity style={styles.cancelOut} onPress={onClose}>
                <Text style={styles.cancelOutTxt}>Hủy</Text>
              </TouchableOpacity>
            </ScrollView>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: CrmColors.white,
    borderTopLeftRadius: CrmRadii.xl,
    borderTopRightRadius: CrmRadii.xl,
    maxHeight: '92%',
    paddingHorizontal: 18,
    paddingBottom: 24,
    paddingTop: 12,
  },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 },
  h2: { fontSize: 18, fontWeight: '800', color: CrmColors.gray900 },
  sub: { fontSize: 12, color: CrmColors.gray500, marginTop: 2 },
  close: { fontSize: 22, color: CrmColors.gray400, padding: 4 },
  label: { fontSize: 12, fontWeight: '600', color: CrmColors.gray700, marginBottom: 6, marginTop: 10 },
  input: {
    borderWidth: 1,
    borderColor: CrmColors.gray200,
    borderRadius: CrmRadii.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: CrmColors.gray900,
    backgroundColor: CrmColors.white,
  },
  chipScroll: { marginBottom: 4 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: CrmRadii.full,
    backgroundColor: CrmColors.gray100,
    marginRight: 8,
    borderWidth: 1,
    borderColor: CrmColors.gray200,
    maxWidth: 200,
  },
  chipOn: { backgroundColor: CrmColors.blue50, borderColor: CrmColors.blue600 },
  chipTxt: { fontSize: 13, color: CrmColors.gray700, fontWeight: '600' },
  chipTxtOn: { color: CrmColors.blue700 },
  khBox: {
    backgroundColor: CrmColors.blue50,
    borderRadius: CrmRadii.lg,
    padding: 12,
    marginTop: 8,
    borderWidth: 1,
    borderColor: CrmColors.blue100,
  },
  khTitle: { fontSize: 11, fontWeight: '800', color: CrmColors.blue800, marginBottom: 8 },
  row2: { flexDirection: 'row', marginTop: 4 },
  submit: {
    marginTop: 20,
    backgroundColor: CrmColors.blue600,
    paddingVertical: 14,
    borderRadius: CrmRadii.md,
    alignItems: 'center',
    ...CrmShadow.sm,
  },
  submitDeal: { backgroundColor: '#7c3aed' },
  submitTxt: { color: CrmColors.white, fontWeight: '700', fontSize: 16 },
  cancelOut: { marginTop: 12, alignItems: 'center', padding: 8 },
  cancelOutTxt: { color: CrmColors.gray600, fontWeight: '600' },
  sourcePick: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: CrmColors.gray200,
    borderRadius: CrmRadii.md,
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: CrmColors.white,
    gap: 8,
  },
  sourcePickMain: { fontSize: 15, fontWeight: '700', color: CrmColors.gray900 },
  sourcePickSub: { fontSize: 12, color: CrmColors.gray500, marginTop: 4, lineHeight: 17 },
  sourcePickChev: { fontSize: 18, color: CrmColors.gray400, fontWeight: '700' },
  srcBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  srcSheet: {
    backgroundColor: CrmColors.white,
    borderTopLeftRadius: CrmRadii.xl,
    borderTopRightRadius: CrmRadii.xl,
    padding: 16,
    paddingBottom: 28,
    maxHeight: '88%',
  },
  srcTitle: { fontSize: 17, fontWeight: '800', color: CrmColors.gray900, marginBottom: 12 },
  srcRow: {
    paddingVertical: 12,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: CrmColors.gray100,
  },
  srcRowOn: { backgroundColor: CrmColors.blue50, borderRadius: CrmRadii.md },
  srcRowMain: { fontSize: 15, fontWeight: '700', color: CrmColors.gray900 },
  srcRowSub: { fontSize: 12, color: CrmColors.gray600, marginTop: 4, lineHeight: 17 },
  srcClose: { marginTop: 14, alignItems: 'center', padding: 10 },
  srcCloseTxt: { fontSize: 15, fontWeight: '700', color: CrmColors.blue700 },
});
