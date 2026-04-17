import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Modal,
  TextInput,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { api } from '../api/client';
import type { MoreStackParamList } from '../navigation/types';
import { CrmColors, CrmRadii, CrmShadow } from '../theme/crmTheme';

type Props = NativeStackScreenProps<MoreStackParamList, 'CrmPipelineDetail'>;

type Stage = {
  id: string;
  name: string;
  color?: string | null;
  icon?: string | null;
  order_index?: number;
  pipeline_type?: string;
  is_won?: boolean;
  is_lost?: boolean;
  is_active?: boolean;
};

type PipelineDetail = {
  id: string;
  name: string;
  company?: { name?: string } | null;
  stages?: Stage[];
};

export default function CrmPipelineDetailScreen({ navigation, route }: Props) {
  const { id } = route.params;
  const [data, setData] = useState<PipelineDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [modal, setModal] = useState(false);
  const [stageId, setStageId] = useState<string | null>(null);
  const [stName, setStName] = useState('');
  const [stColor, setStColor] = useState('#94A3B8');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data: d } = await api.get<PipelineDetail>(`/crm/pipelines/${id}`);
      setData(d);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const { data: d } = await api.get<PipelineDetail>(`/crm/pipelines/${id}`);
      setData(d);
    } catch {
      setData(null);
    } finally {
      setRefreshing(false);
    }
  }, [id]);

  React.useEffect(() => {
    void load();
  }, [load]);

  React.useLayoutEffect(() => {
    navigation.setOptions({ title: data?.name || 'Pipeline' });
  }, [navigation, data?.name]);

  const openEdit = (s: Stage) => {
    setStageId(s.id);
    setStName(s.name);
    setStColor(s.color || '#94A3B8');
    setModal(true);
  };

  const saveStage = async () => {
    if (!stageId || !stName.trim()) return;
    setSaving(true);
    try {
      await api.put(`/crm/pipeline-stages/${stageId}`, { name: stName.trim(), color: stColor.trim() || '#94A3B8' });
      setModal(false);
      void onRefresh();
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
      Alert.alert('Lỗi', msg || 'Không lưu được');
    } finally {
      setSaving(false);
    }
  };

  if (loading && !data) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={CrmColors.blue600} />
      </View>
    );
  }

  if (!data) {
    return (
      <View style={styles.center}>
        <Text style={styles.err}>Không tải được pipeline.</Text>
      </View>
    );
  }

  const stages = [...(data.stages || [])].sort((a, b) => (a.order_index || 0) - (b.order_index || 0));
  const leadStages = stages.filter((s) => s.pipeline_type === 'lead');
  const dealStages = stages.filter((s) => s.pipeline_type === 'deal');
  const otherStages = stages.filter((s) => !s.pipeline_type || (s.pipeline_type !== 'lead' && s.pipeline_type !== 'deal'));

  const renderBlock = (title: string, list: Stage[]) => (
    <View style={{ marginBottom: 16 }}>
      <Text style={styles.blockTitle}>{title}</Text>
      {list.map((s) => (
        <TouchableOpacity key={s.id} style={[styles.stage, CrmShadow.card]} onPress={() => openEdit(s)} activeOpacity={0.88}>
          <Text style={styles.ico}>{s.icon || '•'}</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.stName}>{s.name}</Text>
            <Text style={styles.stMeta}>
              {s.is_won ? 'Thắng · ' : ''}
              {s.is_lost ? 'Thua · ' : ''}
              {s.is_active === false ? 'Ẩn' : 'Hiện'}
            </Text>
          </View>
          <View style={[styles.dot, { backgroundColor: s.color || CrmColors.gray300 }]} />
          <Text style={styles.chev}>›</Text>
        </TouchableOpacity>
      ))}
    </View>
  );

  return (
    <>
      <ScrollView
        style={styles.screen}
        contentContainerStyle={styles.pad}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {data.company?.name ? <Text style={styles.intro}>Công ty: {data.company.name}</Text> : null}
        <Text style={styles.hint}>Chạm giai đoạn để đổi tên / màu.</Text>
        {renderBlock('Lead', leadStages)}
        {renderBlock('Deal', dealStages)}
        {otherStages.length ? renderBlock('Khác', otherStages) : null}
      </ScrollView>

      <Modal visible={modal} animationType="slide" transparent onRequestClose={() => setModal(false)}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalBackdrop}
        >
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Giai đoạn</Text>
            <TextInput
              style={styles.inp}
              placeholder="Tên"
              placeholderTextColor={CrmColors.gray400}
              value={stName}
              onChangeText={setStName}
            />
            <TextInput
              style={styles.inp}
              placeholder="Màu (#hex)"
              placeholderTextColor={CrmColors.gray400}
              value={stColor}
              onChangeText={setStColor}
              autoCapitalize="none"
            />
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.btnGhost} onPress={() => setModal(false)}>
                <Text style={styles.btnGhostTxt}>Hủy</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.btnPri} onPress={() => void saveStage()} disabled={saving}>
                <Text style={styles.btnPriTxt}>{saving ? '…' : 'Lưu'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: CrmColors.pageBg },
  pad: { padding: 16, paddingBottom: 32 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  err: { color: CrmColors.gray600 },
  intro: { fontSize: 14, color: CrmColors.gray700, marginBottom: 6 },
  hint: { fontSize: 12, color: CrmColors.gray500, marginBottom: 14 },
  blockTitle: { fontSize: 15, fontWeight: '800', color: CrmColors.gray800, marginBottom: 8 },
  stage: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: CrmColors.white,
    borderRadius: CrmRadii.md,
    borderWidth: 1,
    borderColor: CrmColors.gray200,
    padding: 12,
    marginBottom: 8,
    gap: 10,
  },
  ico: { fontSize: 20 },
  stName: { fontSize: 15, fontWeight: '700', color: CrmColors.gray900 },
  stMeta: { fontSize: 11, color: CrmColors.gray500, marginTop: 2 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  chev: { fontSize: 18, color: CrmColors.gray300 },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.45)',
    justifyContent: 'center',
    padding: 20,
  },
  modalCard: {
    backgroundColor: CrmColors.white,
    borderRadius: CrmRadii.lg,
    padding: 18,
  },
  modalTitle: { fontSize: 18, fontWeight: '800', color: CrmColors.gray900, marginBottom: 14 },
  inp: {
    borderWidth: 1,
    borderColor: CrmColors.gray200,
    borderRadius: CrmRadii.md,
    padding: 12,
    fontSize: 15,
    marginBottom: 10,
    color: CrmColors.gray900,
  },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 8 },
  btnGhost: { paddingVertical: 10, paddingHorizontal: 14 },
  btnGhostTxt: { fontWeight: '700', color: CrmColors.gray600 },
  btnPri: {
    backgroundColor: CrmColors.blue700,
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: CrmRadii.md,
  },
  btnPriTxt: { color: '#fff', fontWeight: '800' },
});
