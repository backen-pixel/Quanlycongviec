import Ionicons from '@expo/vector-icons/Ionicons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as DocumentPicker from 'expo-document-picker';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Linking,
  Modal,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { formatApiError } from '../api/client';
import {
  createFolder as apiCreateFolder,
  ensurePersonalRoot,
  folderBreadcrumb,
  formatBytes,
  iconNameForMime,
  listFolderChildren,
  listRootChildren,
  listRoots,
  preview as apiPreview,
  search as apiSearch,
  trashFile,
  trashFolder,
  uploadFile,
  type Breadcrumb,
  type DriveFile,
  type DriveFolder,
  type DriveRoot,
} from '../api/drive';
import type { RootStackParamList } from '../navigation/types';
import { Radii, useColors, type ThemeColors } from '../theme';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export default function DriveScreen() {
  const Colors = useColors();
  const styles = useMemo(() => makeStyles(Colors), [Colors]);
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<Nav>();

  const [roots, setRoots] = useState<DriveRoot[]>([]);
  const [activeRoot, setActiveRoot] = useState<DriveRoot | null>(null);
  const [folder, setFolder] = useState<DriveFolder | null>(null);
  const [crumb, setCrumb] = useState<Breadcrumb[]>([]);
  const [folders, setFolders] = useState<DriveFolder[]>([]);
  const [files, setFiles] = useState<DriveFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [showRootPicker, setShowRootPicker] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [query, setQuery] = useState('');
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadRoots = useCallback(async () => {
    try {
      let list = await listRoots();
      if (list.length === 0) {
        try {
          const personal = await ensurePersonalRoot();
          list = [personal];
        } catch (e) {
          setError(formatApiError(e));
          return [];
        }
      }
      setRoots(list);
      return list;
    } catch (e) {
      setError(formatApiError(e));
      return [];
    }
  }, []);

  const openRoot = useCallback(async (root: DriveRoot) => {
    setActiveRoot(root);
    setFolder(null);
    setCrumb([{ type: 'root', id: root.id, name: root.name }]);
    setLoading(true);
    setError(null);
    try {
      const r = await listRootChildren(root.id);
      setFolders(r.folders);
      setFiles(r.files);
    } catch (e) {
      setError(formatApiError(e));
    } finally {
      setLoading(false);
    }
  }, []);

  const openFolder = useCallback(async (id: string) => {
    setLoading(true);
    setError(null);
    try {
      const [children, c] = await Promise.all([listFolderChildren(id), folderBreadcrumb(id)]);
      setFolder(children.folder);
      setFolders(children.folders);
      setFiles(children.files);
      setCrumb(c);
    } catch (e) {
      setError(formatApiError(e));
    } finally {
      setLoading(false);
    }
  }, []);

  const reload = useCallback(async () => {
    if (folder) await openFolder(folder.id);
    else if (activeRoot) await openRoot(activeRoot);
  }, [folder, activeRoot, openFolder, openRoot]);

  useEffect(() => {
    void loadRoots().then((list) => {
      const personal = list.find((x) => x.scope === 'user') || list[0];
      if (personal) void openRoot(personal);
    });
  }, [loadRoots, openRoot]);

  // Search
  useEffect(() => {
    if (!showSearch || !query.trim()) return;
    const t = setTimeout(async () => {
      try {
        const r = await apiSearch(query.trim(), activeRoot?.id);
        setFolders(r.folders);
        setFiles(r.files);
      } catch (e) {
        setError(formatApiError(e));
      }
    }, 300);
    return () => clearTimeout(t);
  }, [query, showSearch, activeRoot?.id]);

  const onCreateFolder = () => {
    Alert.prompt?.('Tên thư mục mới', undefined, async (name) => {
      if (!name?.trim()) return;
      try {
        await apiCreateFolder({
          name: name.trim(),
          parent_id: folder?.id || null,
          root_id: folder ? null : activeRoot?.id,
        });
        await reload();
      } catch (e) {
        Alert.alert('Lỗi', formatApiError(e));
      }
    });
  };

  const onUpload = async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true, multiple: false });
      if (res.canceled || !res.assets?.[0]) return;
      const asset = res.assets[0];
      setUploading(true);
      await uploadFile({
        uri: asset.uri,
        name: asset.name,
        mimeType: asset.mimeType,
        folderId: folder?.id || null,
        rootId: folder ? null : activeRoot?.id || null,
      });
      await reload();
    } catch (e) {
      Alert.alert('Lỗi upload', formatApiError(e));
    } finally {
      setUploading(false);
    }
  };

  const onPreview = async (file: DriveFile) => {
    try {
      const meta = await apiPreview(file.id);
      if (meta.view_url) {
        await Linking.openURL(meta.view_url);
      } else {
        Alert.alert('Không xem được', 'File này không có bản xem trước. Hãy mở từ web Drive.');
      }
    } catch (e) {
      Alert.alert('Lỗi', formatApiError(e));
    }
  };

  const onTrashFile = (file: DriveFile) => {
    Alert.alert('Xoá file?', `Đưa "${file.name}" vào thùng rác?`, [
      { text: 'Huỷ', style: 'cancel' },
      {
        text: 'Xoá',
        style: 'destructive',
        onPress: async () => {
          try { await trashFile(file.id); await reload(); }
          catch (e) { Alert.alert('Lỗi', formatApiError(e)); }
        },
      },
    ]);
  };

  const onTrashFolder = (f: DriveFolder) => {
    Alert.alert('Xoá thư mục?', `Đưa "${f.name}" vào thùng rác?`, [
      { text: 'Huỷ', style: 'cancel' },
      {
        text: 'Xoá',
        style: 'destructive',
        onPress: async () => {
          try { await trashFolder(f.id); await reload(); }
          catch (e) { Alert.alert('Lỗi', formatApiError(e)); }
        },
      },
    ]);
  };

  const jumpCrumb = async (idx: number) => {
    const c = crumb[idx];
    if (c.type === 'root') {
      const r = roots.find((x) => x.id === c.id);
      if (r) await openRoot(r);
    } else if (c.type === 'folder') {
      await openFolder(c.id);
    }
  };

  const data = useMemo(
    () => [
      ...folders.map((f) => ({ kind: 'folder' as const, item: f })),
      ...files.map((f) => ({ kind: 'file' as const, item: f })),
    ],
    [folders, files],
  );

  return (
    <View style={[styles.root, { paddingTop: insets.top + 8 }]}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable style={styles.backBtn} onPress={() => navigation.goBack()} hitSlop={8}>
          <Ionicons name="chevron-back" size={24} color={Colors.text} />
        </Pressable>
        <Pressable
          style={styles.rootPicker}
          onPress={() => setShowRootPicker(true)}
        >
          <Ionicons name="hardware-chip-outline" size={18} color={Colors.blue} />
          <Text style={styles.rootName} numberOfLines={1}>
            {activeRoot?.name || 'Drive'}
          </Text>
          <Ionicons name="chevron-down" size={14} color={Colors.textMuted} />
        </Pressable>
        <Pressable onPress={() => setShowSearch((s) => !s)} style={styles.iconBtn}>
          <Ionicons name={showSearch ? 'close' : 'search'} size={20} color={Colors.text} />
        </Pressable>
      </View>

      {showSearch && (
        <View style={styles.searchBar}>
          <Ionicons name="search" size={16} color={Colors.textMuted} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Tìm trong Drive..."
            placeholderTextColor={Colors.textFaint}
            style={styles.searchInput}
            autoFocus
          />
        </View>
      )}

      {/* Breadcrumb */}
      <FlatList
        data={crumb}
        keyExtractor={(c) => `${c.type}-${c.id}`}
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.crumb}
        contentContainerStyle={{ paddingHorizontal: 12, gap: 4 }}
        renderItem={({ item, index }) => (
          <Pressable
            onPress={() => jumpCrumb(index)}
            style={[styles.crumbItem, index === crumb.length - 1 && styles.crumbItemActive]}
          >
            {index > 0 && <Ionicons name="chevron-forward" size={12} color={Colors.textFaint} style={{ marginRight: 4 }} />}
            <Text
              style={[styles.crumbText, index === crumb.length - 1 && styles.crumbTextActive]}
              numberOfLines={1}
            >
              {item.name}
            </Text>
          </Pressable>
        )}
      />

      {/* List */}
      {error && (
        <View style={styles.errorBox}>
          <Ionicons name="alert-circle-outline" size={16} color={Colors.red} />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator color={Colors.blue} />
        </View>
      ) : (
        <FlatList
          data={data}
          keyExtractor={(d) => `${d.kind}-${d.item.id}`}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={async () => { setRefreshing(true); await reload(); setRefreshing(false); }}
              tintColor={Colors.blue}
            />
          }
          contentContainerStyle={{ paddingBottom: 120 }}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="folder-open-outline" size={48} color={Colors.textFaint} />
              <Text style={styles.emptyText}>Trống</Text>
            </View>
          }
          renderItem={({ item }) =>
            item.kind === 'folder' ? (
              <Pressable
                style={styles.row}
                onPress={() => openFolder(item.item.id)}
                onLongPress={() => onTrashFolder(item.item)}
              >
                <Ionicons name="folder" size={26} color={Colors.amber} />
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={styles.rowTitle} numberOfLines={1}>{item.item.name}</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={Colors.textFaint} />
              </Pressable>
            ) : (
              <Pressable
                style={styles.row}
                onPress={() => onPreview(item.item)}
                onLongPress={() => onTrashFile(item.item)}
              >
                <Ionicons
                  name={iconNameForMime(item.item.mime_type) as keyof typeof Ionicons.glyphMap}
                  size={24}
                  color={Colors.blue}
                />
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={styles.rowTitle} numberOfLines={1}>{item.item.name}</Text>
                  <Text style={styles.rowSub}>{formatBytes(item.item.size_bytes)}</Text>
                </View>
              </Pressable>
            )
          }
        />
      )}

      {/* FAB Upload + New Folder */}
      <View style={[styles.fabRow, { bottom: insets.bottom + 90 }]}>
        <Pressable style={[styles.fab, styles.fabSecondary]} onPress={onCreateFolder} disabled={uploading}>
          <Ionicons name="folder-open" size={20} color={Colors.text} />
        </Pressable>
        <Pressable style={styles.fab} onPress={onUpload} disabled={uploading}>
          {uploading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Ionicons name="cloud-upload" size={22} color="#fff" />
          )}
        </Pressable>
      </View>

      {/* Root picker modal */}
      <Modal visible={showRootPicker} transparent animationType="fade" onRequestClose={() => setShowRootPicker(false)}>
        <Pressable style={styles.modalBg} onPress={() => setShowRootPicker(false)}>
          <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.modalTitle}>Chọn Drive</Text>
            <FlatList
              data={roots}
              keyExtractor={(r) => r.id}
              renderItem={({ item }) => (
                <Pressable
                  style={styles.modalRow}
                  onPress={() => { setShowRootPicker(false); void openRoot(item); }}
                >
                  <Ionicons
                    name={item.scope === 'user' ? 'person-outline' : item.scope === 'company' ? 'business-outline' : 'globe-outline'}
                    size={18}
                    color={Colors.blue}
                  />
                  <Text style={styles.modalRowText}>{item.name}</Text>
                  {activeRoot?.id === item.id && (
                    <Ionicons name="checkmark" size={18} color={Colors.green} />
                  )}
                </Pressable>
              )}
              ListEmptyComponent={<Text style={styles.modalEmpty}>Không có Drive nào</Text>}
            />
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: c.bg },
    header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, gap: 8, marginBottom: 6 },
    backBtn: {
      width: 40, height: 40, borderRadius: Radii.md,
      alignItems: 'center', justifyContent: 'center', backgroundColor: c.cardAlt,
    },
    rootPicker: {
      flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6,
      paddingHorizontal: 10, paddingVertical: 8, backgroundColor: c.cardAlt, borderRadius: Radii.md,
    },
    rootName: { flex: 1, color: c.text, fontSize: 15, fontWeight: '600' },
    iconBtn: {
      width: 40, height: 40, borderRadius: Radii.md,
      alignItems: 'center', justifyContent: 'center', backgroundColor: c.cardAlt,
    },
    searchBar: {
      marginHorizontal: 12, marginBottom: 6, paddingHorizontal: 12, paddingVertical: 8,
      flexDirection: 'row', alignItems: 'center', gap: 8,
      backgroundColor: c.cardAlt, borderRadius: Radii.md,
    },
    searchInput: { flex: 1, color: c.text, fontSize: 14, padding: 0 },
    crumb: { maxHeight: 36 },
    crumbItem: {
      paddingHorizontal: 10, paddingVertical: 6, borderRadius: Radii.sm,
      flexDirection: 'row', alignItems: 'center',
    },
    crumbItemActive: { backgroundColor: c.cardAlt },
    crumbText: { color: c.textMuted, fontSize: 12 },
    crumbTextActive: { color: c.text, fontWeight: '600' },
    loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    empty: { alignItems: 'center', paddingVertical: 60, gap: 8 },
    emptyText: { color: c.textFaint, fontSize: 13 },
    row: {
      flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 12,
      borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.border,
    },
    rowTitle: { color: c.text, fontSize: 14, fontWeight: '500' },
    rowSub: { color: c.textFaint, fontSize: 11, marginTop: 2 },
    fabRow: { position: 'absolute', right: 16, flexDirection: 'column', gap: 12 },
    fab: {
      width: 52, height: 52, borderRadius: 26, backgroundColor: c.blue,
      alignItems: 'center', justifyContent: 'center',
      shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 6, shadowOffset: { width: 0, height: 2 },
      elevation: 4,
    },
    fabSecondary: { backgroundColor: c.cardAlt },
    modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
    modalCard: {
      backgroundColor: c.bg, paddingTop: 14, paddingBottom: 28,
      borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '60%',
    },
    modalTitle: { fontSize: 16, fontWeight: '700', color: c.text, paddingHorizontal: 16, paddingBottom: 10 },
    modalRow: {
      flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 14,
      borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.border,
    },
    modalRowText: { flex: 1, color: c.text, fontSize: 15 },
    modalEmpty: { color: c.textFaint, padding: 20, textAlign: 'center' },
    errorBox: {
      flexDirection: 'row', alignItems: 'center', gap: 6,
      marginHorizontal: 12, marginVertical: 6, padding: 10, borderRadius: Radii.sm,
      backgroundColor: c.red + '15',
    },
    errorText: { color: c.red, fontSize: 12, flex: 1 },
  });
}
