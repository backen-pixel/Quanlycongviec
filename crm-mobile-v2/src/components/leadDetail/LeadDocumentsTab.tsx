import Ionicons from '@expo/vector-icons/Ionicons';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  Image,
  Linking,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { formatApiError } from '../../api/client';
import {
  fetchLeadDocuments,
  fetchLeadTaskDocuments,
  type LeadDocument,
  type LeadTaskDocument,
} from '../../api/leadDetail';
import ImageGalleryLightbox, { type GalleryImage } from '../ImageGalleryLightbox';
import { isImageFile, toGalleryImage, type GalleryImageItem } from '../../lib/isImageFile';
import { resolveMediaUrl } from '../../lib/media';
import { Radii, Spacing, useColors, type ThemeColors } from '../../theme';

const GRID_GAP = 8;
const COLS = 3;
const TILE = (Dimensions.get('window').width - Spacing.md * 2 - GRID_GAP * (COLS - 1)) / COLS;

function fmtDate(iso?: string | null): string {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString('vi-VN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  } catch {
    return '';
  }
}

function EmptyState({ icon, title, hint }: { icon: keyof typeof Ionicons.glyphMap; title: string; hint?: string }) {
  const Colors = useColors();
  const styles = useMemo(() => makeStyles(Colors), [Colors]);
  return (
    <View style={styles.empty}>
      <Ionicons name={icon} size={40} color={Colors.textFaint} />
      <Text style={styles.emptyTitle}>{title}</Text>
      {hint ? <Text style={styles.emptyHint}>{hint}</Text> : null}
    </View>
  );
}

export default function LeadDocumentsTab({ leadId }: { leadId: string }) {
  const Colors = useColors();
  const styles = useMemo(() => makeStyles(Colors), [Colors]);
  const [docs, setDocs] = useState<LeadDocument[]>([]);
  const [taskDocs, setTaskDocs] = useState<LeadTaskDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [galleryIndex, setGalleryIndex] = useState(0);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const [d, td] = await Promise.all([fetchLeadDocuments(leadId), fetchLeadTaskDocuments(leadId)]);
      setDocs(d);
      setTaskDocs(td);
    } catch (e) {
      setError(formatApiError(e));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [leadId]);

  useEffect(() => {
    void load();
  }, [load]);

  const manualDocs = useMemo(() => docs.filter((d) => !d.is_from_task), [docs]);

  const allImages = useMemo((): GalleryImageItem[] => {
    const out: GalleryImageItem[] = [];
    for (const d of taskDocs) {
      const g = toGalleryImage(String(d.id), d, {
        title: d.file_name || d.task_title || 'Ảnh',
        subtitle: d.task_title || undefined,
      });
      if (g) out.push(g);
    }
    for (const d of manualDocs) {
      const g = toGalleryImage(String(d.id), d, {
        title: d.name || d.file_name || 'Ảnh',
        subtitle: d.doc_type || undefined,
      });
      if (g) out.push(g);
    }
    return out;
  }, [taskDocs, manualDocs]);

  const galleryImages: GalleryImage[] = useMemo(
    () => allImages.map((g) => ({ uri: g.uri, title: g.title, subtitle: g.subtitle })),
    [allImages],
  );

  const openGallery = (id: string) => {
    const i = allImages.findIndex((g) => g.id === id);
    if (i < 0) return;
    setGalleryIndex(i);
    setGalleryOpen(true);
  };

  const openFile = (url?: string | null) => {
    const u = resolveMediaUrl(url);
    if (u) void Linking.openURL(u);
  };

  const taskFiles = taskDocs.filter((d) => !isImageFile(d));
  const manualFiles = manualDocs.filter((d) => !isImageFile(d));

  if (loading && !docs.length && !taskDocs.length) {
    return <ActivityIndicator color={Colors.blue} style={{ marginTop: 32 }} />;
  }

  return (
    <>
      <ScrollView
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); void load(true); }}
            tintColor={Colors.blue}
          />
        }
        contentContainerStyle={styles.listPad}
      >
        {error ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        {allImages.length > 0 ? (
          <>
            <Text style={styles.sectionTitle}>Hình ảnh ({allImages.length})</Text>
            <View style={styles.imageGrid}>
              {allImages.map((img) => (
                <Pressable key={img.id} style={styles.tile} onPress={() => openGallery(img.id)}>
                  <Image source={{ uri: img.uri }} style={styles.tileImg} resizeMode="cover" />
                  {img.title ? (
                    <Text style={styles.tileCaption} numberOfLines={2}>{img.title}</Text>
                  ) : null}
                </Pressable>
              ))}
            </View>
          </>
        ) : null}

        {taskFiles.length > 0 ? (
          <>
            <Text style={styles.sectionTitle}>Tài liệu từ nhiệm vụ ({taskFiles.length})</Text>
            {taskFiles.map((d) => (
              <Pressable key={d.id} style={styles.card} onPress={() => openFile(d.file_url)}>
                <View style={styles.docRow}>
                  <Ionicons name="document-attach-outline" size={20} color={Colors.blue} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.cardTitle} numberOfLines={2}>{d.file_name || d.task_title || 'Tài liệu'}</Text>
                    <Text style={styles.metaTxt} numberOfLines={1}>
                      {d.task_title}{d.checklist_title ? ` · ${d.checklist_title}` : ''}
                    </Text>
                    {d.created_at ? <Text style={styles.metaFaint}>{fmtDate(d.created_at)}</Text> : null}
                  </View>
                  <Ionicons name="open-outline" size={18} color={Colors.textMuted} />
                </View>
              </Pressable>
            ))}
          </>
        ) : null}

        <Text style={styles.sectionTitle}>Tài liệu Lead/Deal ({manualFiles.length})</Text>
        {manualFiles.length === 0 && allImages.length === 0 && taskFiles.length === 0 ? (
          <EmptyState icon="folder-open-outline" title="Chưa có tài liệu" hint="Upload file trên web hoặc từ nhiệm vụ mobile." />
        ) : manualFiles.length === 0 ? (
          <Text style={styles.metaHint}>Không còn file khác ngoài hình ảnh ở trên.</Text>
        ) : (
          manualFiles.map((d) => (
            <Pressable key={d.id} style={styles.card} onPress={() => openFile(d.file_url)}>
              <View style={styles.docRow}>
                <Ionicons name="document-text-outline" size={20} color={Colors.orange} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardTitle} numberOfLines={2}>{d.name || d.file_name || 'Tài liệu'}</Text>
                  {d.doc_type ? <Text style={styles.metaTxt}>{d.doc_type}</Text> : null}
                  {d.creator?.full_name ? (
                    <Text style={styles.metaFaint}>{d.creator.full_name} · {fmtDate(d.created_at)}</Text>
                  ) : null}
                  {d.notes && !d.file_url ? <Text style={styles.metaTxt} numberOfLines={3}>{d.notes}</Text> : null}
                </View>
                {d.file_url ? <Ionicons name="open-outline" size={18} color={Colors.textMuted} /> : null}
              </View>
            </Pressable>
          ))
        )}
      </ScrollView>

      <ImageGalleryLightbox
        visible={galleryOpen}
        images={galleryImages}
        initialIndex={galleryIndex}
        onClose={() => setGalleryOpen(false)}
      />
    </>
  );
}

function makeStyles(C: ThemeColors) {
  return StyleSheet.create({
    listPad: { padding: Spacing.md, paddingBottom: Spacing.xl },
    sectionTitle: {
      fontSize: 12,
      fontWeight: '700',
      color: C.textMuted,
      textTransform: 'uppercase',
      marginBottom: 8,
      marginTop: 4,
    },
    imageGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: GRID_GAP,
      marginBottom: 16,
    },
    tile: {
      width: TILE,
      borderRadius: Radii.md,
      overflow: 'hidden',
      backgroundColor: C.card,
      borderWidth: 1,
      borderColor: C.borderSoft,
    },
    tileImg: { width: TILE, height: TILE, backgroundColor: C.surfaceSoft },
    tileCaption: {
      fontSize: 10,
      color: C.textMuted,
      paddingHorizontal: 6,
      paddingVertical: 4,
    },
    card: {
      backgroundColor: C.card,
      borderRadius: Radii.md,
      borderWidth: 1,
      borderColor: C.borderSoft,
      padding: 12,
      marginBottom: 10,
    },
    cardTitle: { fontSize: 15, fontWeight: '600', color: C.text },
    docRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    metaTxt: { fontSize: 12, color: C.textMuted },
    metaFaint: { fontSize: 11, color: C.textFaint, marginTop: 2 },
    metaHint: { fontSize: 12, color: C.textFaint, fontStyle: 'italic', marginBottom: 8 },
    empty: { alignItems: 'center', paddingVertical: 40, gap: 8 },
    emptyTitle: { fontSize: 15, fontWeight: '600', color: C.textMuted },
    emptyHint: { fontSize: 12, color: C.textFaint, textAlign: 'center', paddingHorizontal: 24 },
    errorBox: {
      backgroundColor: C.redSoft,
      borderRadius: Radii.md,
      padding: 12,
      marginBottom: 10,
    },
    errorText: { color: C.red, fontSize: 13 },
  });
}
