import Ionicons from '@expo/vector-icons/Ionicons';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { formatApiError } from '../../api/client';
import TapHighlight from '../TapHighlight';
import { useTheme } from '../../context/ThemeContext';
import {
  createDriveEntityFolder,
  drivePreview,
  fetchDriveEntityChildren,
  fetchDriveLinksByEntity,
  formatBytes,
  iconNameForMime,
  uploadDriveEntityFile,
} from '../../lib/driveApi';
import { Radii, Spacing, type AppColors } from '../../theme';

type Props = {
  projectId: string;
};

export default function ProjectDriveTab({ projectId }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const entityType = 'vc_project' as const;

  const [folders, setFolders] = useState<{ id: string; name: string }[]>([]);
  const [files, setFiles] = useState<{ id: string; name: string; mime_type?: string | null; size_bytes?: number }[]>([]);
  const [links, setLinks] = useState<{ id: string; name: string; fileId: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [folderId, setFolderId] = useState<string | null>(null);
  const [crumb, setCrumb] = useState<{ id: string; name: string }[]>([]);
  const [folderModal, setFolderModal] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError('');
    try {
      const [children, linkRows] = await Promise.all([
        fetchDriveEntityChildren(entityType, projectId, folderId),
        folderId ? Promise.resolve([]) : fetchDriveLinksByEntity(entityType, projectId),
      ]);
      setFolders((children.folders || []).map((f) => ({ id: f.id, name: f.name })));
      setFiles((children.files || []).map((f) => ({
        id: f.id,
        name: f.name,
        mime_type: f.mime_type,
        size_bytes: f.size_bytes,
      })));
      if (!folderId) {
        setLinks(
          (linkRows || [])
            .filter((l) => l.file)
            .map((l) => ({ id: l.id, name: l.file!.name, fileId: l.file!.id })),
        );
      } else {
        setLinks([]);
      }
      setCrumb(
        (children.breadcrumb || [])
          .filter((b) => b.type === 'folder')
          .map((b) => ({ id: b.id, name: b.name })),
      );
    } catch (e) {
      setError(formatApiError(e));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [projectId, folderId]);

  useEffect(() => {
    void load(false);
  }, [load]);

  const openFile = async (fileId: string) => {
    try {
      const p = await drivePreview(fileId);
      const url = p.view_url || p.embed_url;
      if (url) void Linking.openURL(url);
      else Alert.alert('Không mở được', 'File chưa có link xem.');
    } catch (e) {
      Alert.alert('Lỗi', formatApiError(e));
    }
  };

  const createFolder = async () => {
    const name = newFolderName.trim();
    if (!name) return;
    try {
      await createDriveEntityFolder(entityType, projectId, name, folderId);
      setNewFolderName('');
      setFolderModal(false);
      await load(true);
    } catch (e) {
      Alert.alert('Lỗi', formatApiError(e));
    }
  };

  const pickUpload = () => {
    Alert.alert('Tải lên Drive', 'Chọn nguồn file', [
      { text: 'Hủy', style: 'cancel' },
      { text: 'Tệp tin', onPress: () => void uploadFromDocument() },
      { text: 'Thư viện ảnh', onPress: () => void uploadFromGallery() },
      { text: 'Chụp ảnh', onPress: () => void uploadFromCamera() },
    ]);
  };

  const doUpload = async (uri: string, name: string, mimeType?: string | null) => {
    setUploading(true);
    try {
      await uploadDriveEntityFile({
        entityType,
        entityId: projectId,
        uri,
        name,
        mimeType,
        folderId,
      });
      await load(true);
    } catch (e) {
      Alert.alert('Lỗi upload', formatApiError(e));
    } finally {
      setUploading(false);
    }
  };

  const uploadFromDocument = async () => {
    const pick = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true, multiple: false });
    if (pick.canceled || !pick.assets?.[0]) return;
    const a = pick.assets[0];
    await doUpload(a.uri, a.name || 'file', a.mimeType);
  };

  const uploadFromGallery = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Quyền truy cập', 'Cần quyền thư viện ảnh.');
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.9 });
    if (res.canceled || !res.assets?.[0]) return;
    const a = res.assets[0];
    await doUpload(a.uri, a.fileName || `image_${Date.now()}.jpg`, a.mimeType || 'image/jpeg');
  };

  const uploadFromCamera = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Quyền camera', 'Cần quyền camera.');
      return;
    }
    const shot = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.9 });
    if (shot.canceled || !shot.assets?.[0]) return;
    const a = shot.assets[0];
    await doUpload(a.uri, a.fileName || `photo_${Date.now()}.jpg`, a.mimeType || 'image/jpeg');
  };

  if (loading && !files.length && !folders.length && !links.length) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <>
      <ScrollView
        style={{ flex: 1 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              void load(true);
            }}
            tintColor={colors.primary}
          />
        }
        contentContainerStyle={styles.listPad}
      >
        <View style={styles.toolbar}>
          <TapHighlight style={styles.toolBtn} onPress={() => setFolderModal(true)}>
            <Ionicons name="folder-open-outline" size={18} color={colors.warning} />
            <Text style={styles.toolTxt}>Tạo thư mục</Text>
          </TapHighlight>
          <TapHighlight style={styles.toolBtn} onPress={pickUpload} disabled={uploading}>
            {uploading ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <Ionicons name="cloud-upload-outline" size={18} color={colors.primary} />
            )}
            <Text style={styles.toolTxt}>Tải lên</Text>
          </TapHighlight>
        </View>

        {error ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
            <TapHighlight onPress={() => void load()}>
              <Text style={styles.retryTxt}>Thử lại</Text>
            </TapHighlight>
          </View>
        ) : null}

        {crumb.length > 1 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.crumbRow}>
            {crumb.map((c, i) => (
              <TapHighlight
                key={c.id}
                onPress={() => setFolderId(i === 0 ? null : c.id)}
                style={styles.crumbChip}
              >
                <Text style={styles.crumbTxt} numberOfLines={1}>{c.name}</Text>
                {i < crumb.length - 1 ? <Text style={styles.crumbSep}> › </Text> : null}
              </TapHighlight>
            ))}
          </ScrollView>
        ) : null}

        {!folderId && links.length > 0 ? (
          <>
            <Text style={styles.sectionTitle}>Liên kết ({links.length})</Text>
            {links.map((l) => (
              <TapHighlight key={l.id} style={styles.card} onPress={() => void openFile(l.fileId)}>
                <View style={styles.docRow}>
                  <Ionicons name="link-outline" size={20} color={colors.primary} />
                  <Text style={[styles.cardTitle, { flex: 1 }]} numberOfLines={2}>{l.name}</Text>
                  <Ionicons name="open-outline" size={18} color={colors.textMuted} />
                </View>
              </TapHighlight>
            ))}
          </>
        ) : null}

        {folders.map((f) => (
          <TapHighlight key={f.id} style={styles.card} onPress={() => setFolderId(f.id)}>
            <View style={styles.docRow}>
              <Ionicons name="folder-outline" size={22} color={colors.warning} />
              <Text style={[styles.cardTitle, { flex: 1 }]} numberOfLines={1}>{f.name}</Text>
              <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
            </View>
          </TapHighlight>
        ))}

        {files.map((f) => (
          <TapHighlight key={f.id} style={styles.card} onPress={() => void openFile(f.id)}>
            <View style={styles.docRow}>
              <Ionicons
                name={iconNameForMime(f.mime_type) as keyof typeof Ionicons.glyphMap}
                size={20}
                color={colors.primary}
              />
              <View style={{ flex: 1 }}>
                <Text style={styles.cardTitle} numberOfLines={2}>{f.name}</Text>
                {f.size_bytes ? <Text style={styles.metaFaint}>{formatBytes(f.size_bytes)}</Text> : null}
              </View>
              <Ionicons name="open-outline" size={18} color={colors.textMuted} />
            </View>
          </TapHighlight>
        ))}

        {!loading && !folders.length && !files.length && !links.length ? (
          <View style={styles.empty}>
            <Ionicons name="cloud-outline" size={40} color={colors.textFaint} />
            <Text style={styles.emptyTitle}>Chưa có file Drive</Text>
            <Text style={styles.emptyHint}>Tạo thư mục hoặc tải file lên Drive của dự án.</Text>
          </View>
        ) : null}
      </ScrollView>

      <Modal visible={folderModal} transparent animationType="fade" onRequestClose={() => setFolderModal(false)}>
        <Pressable style={styles.modalBg} onPress={() => setFolderModal(false)} />
        <View style={styles.modalCard} pointerEvents="box-none">
          <Text style={styles.modalTitle}>Thư mục mới</Text>
          <TextInput
            style={styles.modalInput}
            placeholder="Tên thư mục"
            placeholderTextColor={colors.textFaint}
            value={newFolderName}
            onChangeText={setNewFolderName}
            autoFocus
          />
          <View style={styles.modalRow}>
            <TapHighlight style={[styles.modalBtn, styles.modalCancel]} onPress={() => setFolderModal(false)}>
              <Text style={styles.modalCancelTxt}>Hủy</Text>
            </TapHighlight>
            <TapHighlight style={[styles.modalBtn, styles.modalOk]} onPress={() => void createFolder()}>
              <Text style={styles.modalOkTxt}>Tạo</Text>
            </TapHighlight>
          </View>
        </View>
      </Modal>
    </>
  );
}

function makeStyles(c: AppColors) {
  return StyleSheet.create({
    center: { paddingVertical: 32, alignItems: 'center' },
    listPad: { padding: Spacing.lg, paddingBottom: Spacing.xl },
    toolbar: { flexDirection: 'row', gap: 10, marginBottom: 12 },
    toolBtn: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      paddingVertical: 10,
      backgroundColor: c.cardAlt,
      borderRadius: Radii.md,
      borderWidth: 1,
      borderColor: c.border,
    },
    toolTxt: { fontSize: 13, fontWeight: '600', color: c.text },
    sectionTitle: {
      fontSize: 12,
      fontWeight: '700',
      color: c.textMuted,
      textTransform: 'uppercase',
      marginBottom: 8,
    },
    card: {
      backgroundColor: c.card,
      borderRadius: Radii.lg,
      borderWidth: 1,
      borderColor: c.border,
      padding: 12,
      marginBottom: 10,
    },
    cardTitle: { fontSize: 14, fontWeight: '700', color: c.text },
    docRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    metaFaint: { fontSize: 11, color: c.textFaint, marginTop: 2 },
    crumbRow: { marginBottom: 8, maxHeight: 36 },
    crumbChip: { flexDirection: 'row', alignItems: 'center' },
    crumbTxt: { color: c.primary, fontSize: 13, maxWidth: 120 },
    crumbSep: { color: c.textFaint },
    empty: { alignItems: 'center', paddingVertical: 40, gap: 8 },
    emptyTitle: { fontSize: 15, fontWeight: '600', color: c.textMuted },
    emptyHint: { fontSize: 12, color: c.textFaint, textAlign: 'center', paddingHorizontal: 24 },
    errorBox: {
      backgroundColor: c.dangerSoft,
      borderRadius: Radii.md,
      padding: 12,
      marginBottom: 10,
      borderWidth: 1,
      borderColor: c.danger,
    },
    errorText: { color: c.danger, fontSize: 13 },
    retryTxt: { color: c.primary, fontWeight: '600', marginTop: 6 },
    modalBg: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.45)' },
    modalCard: {
      position: 'absolute',
      left: 20,
      right: 20,
      top: '30%',
      backgroundColor: c.card,
      borderRadius: Radii.lg,
      padding: 16,
      borderWidth: 1,
      borderColor: c.border,
    },
    modalTitle: { fontSize: 17, fontWeight: '700', color: c.text, marginBottom: 12 },
    modalInput: {
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: Radii.sm,
      padding: 12,
      color: c.text,
      fontSize: 15,
      marginBottom: 12,
    },
    modalRow: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10 },
    modalBtn: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: Radii.sm },
    modalCancel: { backgroundColor: c.cardAlt },
    modalOk: { backgroundColor: c.primary },
    modalCancelTxt: { color: c.textMuted, fontWeight: '600' },
    modalOkTxt: { color: c.white, fontWeight: '700' },
  });
}
