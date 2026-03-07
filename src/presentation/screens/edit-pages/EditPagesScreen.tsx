import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import {
  View,
  StyleSheet,
  FlatList,
  Image,
  Pressable,
  Dimensions,
  ActivityIndicator,
  Alert,
  Animated,
  NativeEventEmitter,
  NativeModules,
  ViewToken,
} from 'react-native';
import { SafeScreen, Header } from '../../components/layout';
import { Button, Text, Icon } from '../../components/ui';
import { colors, spacing, borderRadius } from '../../../theme';
import {
  openPdf,
  closePdf,
  renderThumbnail,
  cancelAllRendering,
  startThumbnailPreGeneration,
} from '../../../native/pdfPreviewService';
import {
  deletePages,
  extractPages,
  rotatePages,
  addProgressListener,
  PageOperationResult,
} from '../../../native/pdfPageOperationsService';
import { pickPdfFile, PickedFile, cleanupPickedFile } from '../../../native/filePicker';
import { useTheme } from '../../context';
import { getErrorMessage } from '../../../infrastructure/error/safeOperations';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const THUMBNAIL_COLUMNS = 3;
const THUMBNAIL_GAP = spacing.sm;
const THUMBNAIL_WIDTH =
  (SCREEN_WIDTH - spacing.lg * 2 - THUMBNAIL_GAP * (THUMBNAIL_COLUMNS - 1)) / THUMBNAIL_COLUMNS;
const THUMBNAIL_HEIGHT = THUMBNAIL_WIDTH * 1.4;

type PageItem = {
  pageIndex: number;
  path?: string;
  loading: boolean;
  selected: boolean;
  rotation: number;
};

function SkeletonBox({ isDark, theme }: { isDark: boolean; theme: any }) {
  const shimmer = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(shimmer, { toValue: 1, duration: 1000, useNativeDriver: true }),
        Animated.timing(shimmer, { toValue: 0, duration: 1000, useNativeDriver: true }),
      ]),
    );
    anim.start();
    return () => anim.stop();
  }, [shimmer]);

  const opacity = shimmer.interpolate({ inputRange: [0, 1], outputRange: [0.3, 0.7] });

  return (
    <Animated.View
      style={[
        styles.skeletonBox,
        { backgroundColor: isDark ? theme.surfaceVariant : colors.surfaceVariant, opacity },
      ]}
    />
  );
}

export default function EditPagesScreen() {
  const { theme, isDark } = useTheme();

  const [pickedFile, setPickedFile] = useState<PickedFile | null>(null);
  const [pageCount, setPageCount] = useState(0);
  const [pages, setPages] = useState<PageItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [progressText, setProgressText] = useState('');
  const [isPdfOpen, setIsPdfOpen] = useState(false);

  const selectedCount = useMemo(() => pages.filter(p => p.selected).length, [pages]);
  const renderedPagesRef = useRef<Set<number>>(new Set());
  const mountedRef = useRef(true);

  useEffect(() => {
    const removeListener = addProgressListener(event => {
      if (mountedRef.current) setProgressText(event.status);
    });
    return () => {
      mountedRef.current = false;
      removeListener();
      cancelAllRendering().catch(() => {});
      closePdf().catch(() => {});
    };
  }, []);

  const handlePickFile = useCallback(async () => {
    try {
      const file = await pickPdfFile();
      if (!file) return;

      setLoading(true);
      setPages([]);
      setPageCount(0);
      renderedPagesRef.current.clear();

      if (isPdfOpen) {
        await cancelAllRendering().catch(() => {});
        await closePdf().catch(() => {});
      }
      if (pickedFile) cleanupPickedFile(pickedFile);

      setPickedFile(file);

      const result = await openPdf(file.localPath);
      if (!mountedRef.current) return;

      setIsPdfOpen(true);
      setPageCount(result.pageCount);
      startThumbnailPreGeneration().catch(() => {});

      const items: PageItem[] = Array.from({ length: result.pageCount }, (_, i) => ({
        pageIndex: i,
        loading: false,
        selected: false,
        rotation: 0,
      }));
      setPages(items);
      setLoading(false);

      renderVisibleThumbnails(0, Math.min(11, result.pageCount - 1));
    } catch (error) {
      if (!mountedRef.current) return;
      setLoading(false);
      Alert.alert('Error', getErrorMessage(error));
    }
  }, [isPdfOpen, pickedFile]);

  const renderVisibleThumbnails = useCallback(
    async (start: number, end: number) => {
      for (let i = start; i <= end; i++) {
        if (!mountedRef.current) break;
        if (renderedPagesRef.current.has(i)) continue;
        renderedPagesRef.current.add(i);
        renderSingleThumbnail(i);
      }
    },
    [],
  );

  const renderSingleThumbnail = useCallback(async (pageIndex: number) => {
    if (!mountedRef.current) return;
    setPages(prev => prev.map(p => (p.pageIndex === pageIndex ? { ...p, loading: true } : p)));

    try {
      const result = await renderThumbnail(pageIndex);
      if (!mountedRef.current) return;
      setPages(prev =>
        prev.map(p => (p.pageIndex === pageIndex ? { ...p, path: result.path, loading: false } : p)),
      );
    } catch {
      if (!mountedRef.current) return;
      setPages(prev => prev.map(p => (p.pageIndex === pageIndex ? { ...p, loading: false } : p)));
    }
  }, []);

  const toggleSelect = useCallback((pageIndex: number) => {
    setPages(prev =>
      prev.map(p => (p.pageIndex === pageIndex ? { ...p, selected: !p.selected } : p)),
    );
  }, []);

  const selectAll = useCallback(() => {
    setPages(prev => prev.map(p => ({ ...p, selected: true })));
  }, []);

  const deselectAll = useCallback(() => {
    setPages(prev => prev.map(p => ({ ...p, selected: false })));
  }, []);

  // ── Operations ────────────────────────────────────────────────────────

  const handleDelete = useCallback(async () => {
    if (!pickedFile || selectedCount === 0) return;
    if (selectedCount >= pageCount) {
      Alert.alert('Error', 'Cannot delete all pages');
      return;
    }

    Alert.alert(
      'Delete Pages',
      `Delete ${selectedCount} selected page${selectedCount > 1 ? 's' : ''}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setProcessing(true);
            setProgressText('Preparing...');
            try {
              const indices = pages.filter(p => p.selected).map(p => p.pageIndex);
              const result = await deletePages(pickedFile.localPath, indices);
              if (!mountedRef.current) return;
              Alert.alert(
                'Done',
                `Deleted ${selectedCount} pages. Output: ${result.outputPageCount} pages (${(result.fileSize / 1024).toFixed(0)} KB)`,
              );
              await reloadPdf(result.outputPath);
            } catch (error) {
              if (!mountedRef.current) return;
              Alert.alert('Error', getErrorMessage(error));
            } finally {
              if (mountedRef.current) {
                setProcessing(false);
                setProgressText('');
              }
            }
          },
        },
      ],
    );
  }, [pickedFile, selectedCount, pageCount, pages]);

  const handleExtract = useCallback(async () => {
    if (!pickedFile || selectedCount === 0) return;

    setProcessing(true);
    setProgressText('Extracting pages...');
    try {
      const indices = pages.filter(p => p.selected).map(p => p.pageIndex);
      const result = await extractPages(pickedFile.localPath, indices);
      if (!mountedRef.current) return;
      Alert.alert(
        'Done',
        `Extracted ${result.outputPageCount} pages (${(result.fileSize / 1024).toFixed(0)} KB)`,
      );
      deselectAll();
    } catch (error) {
      if (!mountedRef.current) return;
      Alert.alert('Error', getErrorMessage(error));
    } finally {
      if (mountedRef.current) {
        setProcessing(false);
        setProgressText('');
      }
    }
  }, [pickedFile, selectedCount, pages, deselectAll]);

  const handleRotate = useCallback(
    async (degrees: 90 | 180 | 270) => {
      if (!pickedFile || selectedCount === 0) return;

      setProcessing(true);
      setProgressText('Rotating pages...');
      try {
        const rotationEntries = pages
          .filter(p => p.selected)
          .map(p => ({ pageIndex: p.pageIndex, degrees }));
        const result = await rotatePages(pickedFile.localPath, rotationEntries);
        if (!mountedRef.current) return;
        Alert.alert('Done', 'Pages rotated successfully');
        await reloadPdf(result.outputPath);
      } catch (error) {
        if (!mountedRef.current) return;
        Alert.alert('Error', getErrorMessage(error));
      } finally {
        if (mountedRef.current) {
          setProcessing(false);
          setProgressText('');
        }
      }
    },
    [pickedFile, selectedCount, pages],
  );

  const reloadPdf = useCallback(
    async (newPath: string) => {
      renderedPagesRef.current.clear();
      await cancelAllRendering().catch(() => {});
      await closePdf().catch(() => {});

      const result = await openPdf(newPath);
      if (!mountedRef.current) return;

      setIsPdfOpen(true);
      setPageCount(result.pageCount);
      startThumbnailPreGeneration().catch(() => {});

      const items: PageItem[] = Array.from({ length: result.pageCount }, (_, i) => ({
        pageIndex: i,
        loading: false,
        selected: false,
        rotation: 0,
      }));
      setPages(items);
      renderVisibleThumbnails(0, Math.min(11, result.pageCount - 1));
    },
    [],
  );

  const onViewableItemsChanged = useCallback(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      const indices = viewableItems.map(v => v.index).filter((i): i is number => i != null);
      if (indices.length === 0) return;
      const toRender = indices.filter(i => !renderedPagesRef.current.has(i));
      if (toRender.length > 0) {
        renderVisibleThumbnails(Math.min(...toRender), Math.max(...toRender));
      }
    },
    [renderVisibleThumbnails],
  );

  const viewabilityConfig = useMemo(
    () => ({ itemVisiblePercentThreshold: 20, minimumViewTime: 100 }),
    [],
  );

  const viewabilityConfigCallbackPairs = useRef([{ viewabilityConfig, onViewableItemsChanged }]);

  const renderPageItem = useCallback(
    ({ item }: { item: PageItem }) => (
      <Pressable
        style={[
          styles.thumbnailItem,
          {
            backgroundColor: theme.surface,
            borderColor: item.selected ? colors.primary : theme.border,
            borderWidth: item.selected ? 2 : 1,
          },
        ]}
        onPress={() => toggleSelect(item.pageIndex)}
      >
        {item.loading ? (
          <SkeletonBox isDark={isDark} theme={theme} />
        ) : item.path ? (
          <Image source={{ uri: `file://${item.path}` }} style={styles.thumbnailImage} resizeMode="contain" />
        ) : (
          <SkeletonBox isDark={isDark} theme={theme} />
        )}

        {/* Selection checkbox */}
        <View style={[styles.checkbox, item.selected && styles.checkboxSelected]}>
          {item.selected && <Icon name="check" size={12} color="#fff" />}
        </View>

        {/* Page number */}
        <View style={[styles.pageLabel, { backgroundColor: isDark ? theme.surface : colors.surfaceVariant }]}>
          <Text style={[styles.pageLabelText, { color: theme.textSecondary }]}>
            {item.pageIndex + 1}
          </Text>
        </View>
      </Pressable>
    ),
    [theme, isDark, toggleSelect],
  );

  const keyExtractor = useCallback((item: PageItem) => `page-${item.pageIndex}`, []);

  return (
    <SafeScreen>
      <Header title="Edit Pages" showBack />

      {!pickedFile ? (
        <View style={styles.emptyState}>
          <View style={[styles.emptyIconContainer, { backgroundColor: `${colors.editPages}15` }]}>
            <Icon name="edit" size={48} color={colors.editPages} />
          </View>
          <Text style={[styles.emptyTitle, { color: theme.textPrimary }]}>Edit PDF Pages</Text>
          <Text style={[styles.emptyDescription, { color: theme.textSecondary }]}>
            Select pages to delete, extract, or rotate
          </Text>
          <Button title="Select PDF" onPress={handlePickFile} style={styles.selectButton} />
        </View>
      ) : (
        <View style={styles.content}>
          {/* File info bar */}
          <View style={[styles.fileInfo, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <View style={styles.fileInfoLeft}>
              <Icon name="file-pdf" size={20} color={colors.editPages} />
              <View style={styles.fileInfoText}>
                <Text style={[styles.fileName, { color: theme.textPrimary }]} numberOfLines={1}>
                  {pickedFile.name}
                </Text>
                <Text style={[styles.pageCountText, { color: theme.textSecondary }]}>
                  {pageCount} pages {selectedCount > 0 ? `| ${selectedCount} selected` : ''}
                </Text>
              </View>
            </View>
            <Pressable onPress={handlePickFile} style={styles.changeFileButton}>
              <Text style={[styles.changeFileText, { color: colors.primary }]}>Change</Text>
            </Pressable>
          </View>

          {/* Selection toolbar */}
          {pageCount > 0 && (
            <View style={[styles.toolbar, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <Pressable onPress={selectedCount === pageCount ? deselectAll : selectAll} style={styles.toolbarBtn}>
                <Text style={[styles.toolbarBtnText, { color: colors.primary }]}>
                  {selectedCount === pageCount ? 'Deselect All' : 'Select All'}
                </Text>
              </Pressable>
            </View>
          )}

          {/* Processing overlay */}
          {processing && (
            <View style={styles.processingOverlay}>
              <ActivityIndicator size="large" color={colors.primary} />
              <Text style={[styles.processingText, { color: theme.textSecondary }]}>
                {progressText || 'Processing...'}
              </Text>
            </View>
          )}

          {loading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={colors.primary} />
              <Text style={[styles.loadingText, { color: theme.textSecondary }]}>Loading PDF...</Text>
            </View>
          ) : (
            <FlatList
              data={pages}
              renderItem={renderPageItem}
              keyExtractor={keyExtractor}
              numColumns={THUMBNAIL_COLUMNS}
              contentContainerStyle={styles.gridContent}
              columnWrapperStyle={styles.gridRow}
              showsVerticalScrollIndicator={false}
              initialNumToRender={12}
              windowSize={5}
              maxToRenderPerBatch={8}
              removeClippedSubviews
              viewabilityConfigCallbackPairs={viewabilityConfigCallbackPairs.current}
            />
          )}

          {/* Action bar */}
          {selectedCount > 0 && !processing && (
            <View style={[styles.actionBar, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <Pressable style={styles.actionBtn} onPress={handleDelete}>
                <Icon name="trash-2" size={20} color={colors.error} />
                <Text style={[styles.actionBtnText, { color: colors.error }]}>Delete</Text>
              </Pressable>
              <Pressable style={styles.actionBtn} onPress={handleExtract}>
                <Icon name="download" size={20} color={colors.info} />
                <Text style={[styles.actionBtnText, { color: colors.info }]}>Extract</Text>
              </Pressable>
              <Pressable style={styles.actionBtn} onPress={() => handleRotate(90)}>
                <Icon name="rotate-cw" size={20} color={colors.primary} />
                <Text style={[styles.actionBtnText, { color: colors.primary }]}>Rotate</Text>
              </Pressable>
            </View>
          )}
        </View>
      )}
    </SafeScreen>
  );
}

const styles = StyleSheet.create({
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
  },
  emptyIconContainer: {
    width: 96,
    height: 96,
    borderRadius: 48,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  emptyTitle: {
    fontSize: 22,
    fontWeight: '700',
    marginBottom: spacing.sm,
    textAlign: 'center',
  },
  emptyDescription: {
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: spacing.xl,
  },
  selectButton: {
    paddingHorizontal: spacing.xl,
  },
  content: {
    flex: 1,
  },
  fileInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    marginBottom: spacing.xs,
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
  },
  fileInfoLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  fileInfoText: {
    marginLeft: spacing.sm,
    flex: 1,
  },
  fileName: {
    fontSize: 14,
    fontWeight: '600',
  },
  pageCountText: {
    fontSize: 12,
    marginTop: 2,
  },
  changeFileButton: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  changeFileText: {
    fontSize: 14,
    fontWeight: '600',
  },
  toolbar: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginHorizontal: spacing.lg,
    marginBottom: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.md,
    borderWidth: 1,
  },
  toolbarBtn: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  toolbarBtnText: {
    fontSize: 13,
    fontWeight: '600',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: spacing.md,
    fontSize: 15,
  },
  processingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  processingText: {
    marginTop: spacing.md,
    fontSize: 15,
    color: '#fff',
  },
  gridContent: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: 100,
  },
  gridRow: {
    gap: THUMBNAIL_GAP,
    marginBottom: THUMBNAIL_GAP,
  },
  thumbnailItem: {
    width: THUMBNAIL_WIDTH,
    height: THUMBNAIL_HEIGHT,
    borderRadius: borderRadius.md,
    overflow: 'hidden',
  },
  thumbnailImage: {
    flex: 1,
    width: '100%',
  },
  skeletonBox: {
    flex: 1,
    borderRadius: borderRadius.sm,
    margin: 4,
  },
  checkbox: {
    position: 'absolute',
    top: 6,
    left: 6,
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.8)',
    backgroundColor: 'rgba(0,0,0,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  pageLabel: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  pageLabelText: {
    fontSize: 10,
    fontWeight: '600',
  },
  actionBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: spacing.md,
    paddingBottom: spacing.xl,
    borderTopWidth: 1,
  },
  actionBtn: {
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xs,
  },
  actionBtnText: {
    fontSize: 12,
    fontWeight: '600',
    marginTop: 4,
  },
});
