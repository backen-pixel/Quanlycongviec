import Ionicons from '@expo/vector-icons/Ionicons';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Dimensions,
  Image,
  Linking,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { formatApiError } from '../../api/client';
import ImageGalleryLightbox, { type GalleryImage } from '../ImageGalleryLightbox';
import TapHighlight from '../TapHighlight';
import { useTheme } from '../../context/ThemeContext';
import { isImageFile, resolveMediaUrl, toGalleryImage } from '../../lib/mediaUtils';
import {
  fetchLeadTaskDocuments,
  fetchProjectDocuments,
  fetchProjectTaskFiles,
  type ProjectDocument,
  type ProjectTaskFile,
} from '../../lib/projectDetailApi';
import { Radii, Spacing, type AppColors } from '../../theme';

import SpinningLoader from '../SpinningLoader';
const GRID_GAP = 8;
const COLS = 3;
const TILE = (Dimensions.get('window').width - Spacing.lg * 2 - GRID_GAP * (COLS - 1)) / COLS;

type Props = {
  projectId: string;
  dealId?: string | null;
  sharedDocuments?: unknown[];
};

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

function mapSharedDoc(raw: unknown): ProjectDocument | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (!r.id) return null;
  const creator = r.creator as Record<string, unknown> | undefined;
  return {
    id: String(r.id),
    name: r.name != null ? String(r.name) : null,
    doc_type: r.doc_type != null ? String(r.doc_type) : null,
    file_url: r.file_url != null ? String(r.file_url) : null,
    file_name: r.file_name != null ? String(r.file_name) : null,
    mime_type: r.mime_type != null ? String(r.mime_type) : null,
    notes: r.notes != null ? String(r.notes) : null,
    created_at: r.created_at != null ? String(r.created_at) : null,
    creator: creator
      ? { full_name: creator.full_name != null ? String(creator.full_name) : null }
      : null,
  };
}

export default function ProjectDocumentsTab({ projectId, dealId, sharedDocuments = [] }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [workshopDocs, setWorkshopDocs] = useState<ProjectDocument[]>([]);
  const [taskFiles, setTaskFiles] = useState<ProjectTaskFile[]>([]);
  const [crmTaskDocs, setCrmTaskDocs] = useState<ProjectDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [galleryIndex, setGalleryIndex] = useState(0);

  const crmSharedDocs = useMemo(
    () => sharedDocuments.map(mapSharedDoc).filter(Boolean) as ProjectDocument[],
    [sharedDocuments],
  );

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError('');
    try {
      const [wDocs, tFiles] = await Promise.all([
        fetchProjectDocuments(projectId),
        fetchProjectTaskFiles(projectId),
      ]);
      setWorkshopDocs(wDocs);
      setTaskFiles(tFiles);
      if (dealId) {
        setCrmTaskDocs(await fetchLeadTaskDocuments(dealId));
      } else {
        setCrmTaskDocs([]);
      }
    } catch (e) {
      setError(formatApiError(e));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [projectId, dealId]);

  useEffect(() => {
    void load(false);
  }, [load]);

  const allImages = useMemo(() => {
    const out: ReturnType<typeof toGalleryImage>[] = [];
    const push = (id: string, doc: ProjectDocument | ProjectTaskFile, meta?: { title?: string; subtitle?: string }) => {
      const g = toGalleryImage(id, doc, meta);
      if (g) out.push(g);
    };
    for (const d of crmSharedDocs) {
      push(`crm-${d.id}`, d, { title: d.name || d.file_name || 'Ảnh CRM', subtitle: 'Tài liệu CRM' });
    }
    for (const d of workshopDocs) {
      push(`ws-${d.id}`, d, { title: d.file_name || d.name || 'Ảnh xưởng', subtitle: 'Tài liệu xưởng' });
    }
    for (const d of crmTaskDocs) {
      push(`ctd-${d.id}`, d, { title: d.file_name || d.name || 'Ảnh NV', subtitle: 'Nhiệm vụ CRM' });
    }
    for (const f of taskFiles) {
      push(`tf-${f.id}`, f, {
        title: f.file_name || 'Ảnh',
        subtitle: f.task?.title || 'File nhiệm vụ',
      });
    }
    return out.filter(Boolean) as NonNullable<ReturnType<typeof toGalleryImage>>[];
  }, [crmSharedDocs, workshopDocs, crmTaskDocs, taskFiles]);

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

  const openDoc = (doc: ProjectDocument | ProjectTaskFile, galleryId: string) => {
    if (isImageFile(doc)) openGallery(galleryId);
    else openFile(doc.file_url);
  };

  const crmFiles = crmSharedDocs.filter((d) => !isImageFile(d));
  const workshopFiles = workshopDocs.filter((d) => !isImageFile(d));
  const crmTaskFiles = crmTaskDocs.filter((d) => !isImageFile(d));
  const taskFileRows = taskFiles.filter((f) => !isImageFile(f));
  const totalCount = crmSharedDocs.length + workshopDocs.length + crmTaskDocs.length + taskFiles.length;

  if (loading && totalCount === 0) {
    return (
      <View style={styles.center}>
        <SpinningLoader size="large" color={colors.primary} />
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
                <TapHighlight key={img.id} style={styles.tile} onPress={() => openGallery(img.id)}>
                  <Image source={{ uri: img.uri }} style={styles.tileImg} resizeMode="cover" />
                  {img.title ? (
                    <Text style={styles.tileCaption} numberOfLines={2}>{img.title}</Text>
                  ) : null}
                </TapHighlight>
              ))}
            </View>
          </>
        ) : null}

        {crmFiles.length > 0 ? (
          <>
            <Text style={styles.sectionTitle}>Tài liệu CRM ({crmFiles.length})</Text>
            {crmFiles.map((d) => (
              <DocRow
                key={d.id}
                styles={styles}
                colors={colors}
                icon="cloud-outline"
                title={d.name || d.file_name || 'Tài liệu'}
                meta={d.creator?.full_name ? `${d.creator.full_name} · ${fmtDate(d.created_at)}` : fmtDate(d.created_at)}
                onPress={() => openDoc(d, `crm-${d.id}`)}
              />
            ))}
          </>
        ) : null}

        {workshopFiles.length > 0 ? (
          <>
            <Text style={styles.sectionTitle}>Tài liệu xưởng ({workshopFiles.length})</Text>
            {workshopFiles.map((d) => (
              <DocRow
                key={d.id}
                styles={styles}
                colors={colors}
                icon="folder-outline"
                title={d.file_name || d.name || 'Tài liệu'}
                meta={d.uploader?.full_name ? `${d.uploader.full_name} · ${fmtDate(d.created_at)}` : fmtDate(d.created_at)}
                onPress={() => openDoc(d, `ws-${d.id}`)}
              />
            ))}
          </>
        ) : null}

        {crmTaskFiles.length > 0 ? (
          <>
            <Text style={styles.sectionTitle}>Tài liệu nhiệm vụ CRM ({crmTaskFiles.length})</Text>
            {crmTaskFiles.map((d) => (
              <DocRow
                key={d.id}
                styles={styles}
                colors={colors}
                icon="document-attach-outline"
                title={d.file_name || d.name || 'Tài liệu'}
                meta={fmtDate(d.created_at)}
                onPress={() => openDoc(d, `ctd-${d.id}`)}
              />
            ))}
          </>
        ) : null}

        {taskFileRows.length > 0 ? (
          <>
            <Text style={styles.sectionTitle}>File đính kèm nhiệm vụ ({taskFileRows.length})</Text>
            {taskFileRows.map((f) => (
              <DocRow
                key={f.id}
                styles={styles}
                colors={colors}
                icon="attach-outline"
                title={f.file_name || 'Tệp'}
                meta={f.task?.title || fmtDate(f.created_at)}
                onPress={() => openDoc(f, `tf-${f.id}`)}
              />
            ))}
          </>
        ) : null}

        {totalCount === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="folder-open-outline" size={40} color={colors.textFaint} />
            <Text style={styles.emptyTitle}>Chưa có tài liệu</Text>
            <Text style={styles.emptyHint}>Upload trên web hoặc đính kèm từ nhiệm vụ.</Text>
          </View>
        ) : null}
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

function DocRow({
  styles,
  colors,
  icon,
  title,
  meta,
  onPress,
}: {
  styles: ReturnType<typeof makeStyles>;
  colors: AppColors;
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  meta?: string;
  onPress: () => void;
}) {
  return (
    <TapHighlight style={styles.card} onPress={onPress}>
      <View style={styles.docRow}>
        <Ionicons name={icon} size={20} color={colors.primary} />
        <View style={{ flex: 1 }}>
          <Text style={styles.cardTitle} numberOfLines={2}>{title}</Text>
          {meta ? <Text style={styles.metaFaint} numberOfLines={1}>{meta}</Text> : null}
        </View>
        <Ionicons name="open-outline" size={18} color={colors.textMuted} />
      </View>
    </TapHighlight>
  );
}

function makeStyles(c: AppColors) {
  return StyleSheet.create({
    center: { paddingVertical: 32, alignItems: 'center' },
    listPad: { padding: Spacing.lg, paddingBottom: Spacing.xl },
    sectionTitle: {
      fontSize: 12,
      fontWeight: '700',
      color: c.textMuted,
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
      backgroundColor: c.card,
      borderWidth: 1,
      borderColor: c.border,
    },
    tileImg: { width: TILE, height: TILE, backgroundColor: c.cardAlt },
    tileCaption: {
      fontSize: 10,
      color: c.textMuted,
      paddingHorizontal: 6,
      paddingVertical: 4,
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
  });
}
