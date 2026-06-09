import { useEffect, useState } from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import {
  fetchOtaReleaseFromServer,
  getLocalOtaInfo,
  markOtaSuccessNoticeShown,
  shouldShowOtaSuccessNotice,
} from '../lib/otaUpdate';

export default function OtaSuccessNotice() {
  const [visible, setVisible] = useState(false);
  const [version, setVersion] = useState<string | null>(null);
  const [updateId, setUpdateId] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const local = getLocalOtaInfo();
      if (!local.enabled || local.isEmbeddedLaunch) return;

      const id = local.updateId;
      if (!id || !(await shouldShowOtaSuccessNotice(id))) return;

      const server = await fetchOtaReleaseFromServer(local.runtimeVersion);
      if (!mounted) return;

      setVersion(server.version || null);
      setUpdateId(id);
      setVisible(true);
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const onClose = () => {
    if (updateId) void markOtaSuccessNoticeShown(updateId);
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.icon}>✓</Text>
          <Text style={styles.title}>Đã cập nhật từ server</Text>
          <Text style={styles.version}>
            Phiên bản {version || 'mới'} đã được tải và áp dụng thành công.
          </Text>
          <Text style={styles.hint}>Nội dung app được phân phối qua máy chủ cập nhật (OTA).</Text>
          <TouchableOpacity style={styles.btn} onPress={onClose}>
            <Text style={styles.btnText}>Đã hiểu</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 24,
    width: '100%',
    maxWidth: 400,
    alignItems: 'center',
  },
  icon: {
    fontSize: 36,
    fontWeight: '900',
    color: '#059669',
    marginBottom: 8,
  },
  title: { fontSize: 18, fontWeight: '800', color: '#0F172A', textAlign: 'center' },
  version: {
    fontSize: 15,
    fontWeight: '700',
    color: '#2563EB',
    marginTop: 10,
    textAlign: 'center',
    lineHeight: 22,
  },
  hint: {
    fontSize: 13,
    color: '#64748B',
    marginTop: 10,
    textAlign: 'center',
    lineHeight: 19,
  },
  btn: {
    backgroundColor: '#2563EB',
    borderRadius: 12,
    paddingVertical: 13,
    paddingHorizontal: 32,
    marginTop: 20,
    minWidth: 160,
    alignItems: 'center',
  },
  btnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
});
