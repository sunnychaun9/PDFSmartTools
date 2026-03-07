import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import {
  View,
  StyleSheet,
  FlatList,
  Image,
  Pressable,
  Dimensions,
  ActivityIndicator,
  Modal,
  ScrollView,
  Alert,
  Animated,
  ViewToken,
} from 'react-native';
import { SafeScreen, Header } from '../../components/layout';
import { Button, Text, Icon } from '../../components/ui';
import { colors, spacing, borderRadius } from '../../../theme';
import {
  openPdf,
  closePdf,
  renderThumbnail,
  renderPage,
  prefetchThumbnails,
  cancelAllRendering,
  startThumbnailPreGeneration,
  FullPageResult,
} from '../../../native/pdfPreviewService';
import { pickPdfFile, PickedFile, cleanupPickedFile } from '../../../native/filePicker';
import { useTheme } from '../../context';
import { getErrorMessage } from '../../../infrastructure/error/safeOperations';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const THUMBNAIL_COLUMNS = 3;
const THUMBNAIL_GAP = spacing.sm;
const THUMBNAIL_WIDTH = (SCREEN_WIDTH - spacing.lg * 2 - THUMBNAIL_GAP * (THUMBNAIL_COLUMNS - 1)) / THUMBNAIL_COLUMNS;
const THUMBNAIL_HEIGHT = THUMBNAIL_WIDTH * 1.4;
const PREFETCH_AHEAD = 10;

type ThumbnailItem = {
  pageIndex: number;
  path?: string;
  width?: number;
  height?: number;
  loading: boolean;
  error?: string;
};

// Skeleton placeholder component
function SkeletonThumbnail({ isDark, theme }: { isDark: boolean; theme: any }) {
  const shimmer = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(shimmer, { toValue: 1, duration: 1000, useNativeDriver: true }),
        Animated.timing(shimmer, { toValue: 0, duration: 1000, useNativeDriver: true }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, [shimmer]);

  const opacity = shimmer.interpolate({
    inputRange: [0, 1],
    outputRange: [0.3, 0.7],
  });

  return (
    <Animated.View
      style={[
        styles.skeletonBox,
        {
          backgroundColor: isDark ? theme.surfaceVariant : colors.surfaceVariant,
          opacity,
        },
      ]}
    />
  );
}

export default function PdfPreviewScreen() {
  const { theme, isDark } = useTheme();

  const [pickedFile, setPickedFile] = useState<PickedFile | null>(null);
  const [pageCount, setPageCount] = useState(0);
  const [thumbnails, setThumbnails] = useState<ThumbnailItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [isPdfOpen, setIsPdfOpen] = useState(false);

  // Full page viewer state
  const [viewerVisible, setViewerVisible] = useState(false);
  const [viewerPage, setViewerPage] = useState(0);
  const [fullPageImage, setFullPageImage] = useState<FullPageResult | null>(null);
  const [fullPageLoading, setFullPageLoading] = useState(false);

  // Track visible items for lazy rendering
  const visibleRangeRef = useRef<{ start: number; end: number }>({ start: 0, end: 11 });
  const renderedPagesRef = useRef<Set<number>>(new Set());
  const mountedRef = useRef(true);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      mountedRef.current = false;
      cancelAllRendering().catch(() => {});
      closePdf().catch(() => {});
    };
  }, []);

  const handlePickFile = useCallback(async () => {
    try {
      const file = await pickPdfFile();
      if (!file) return;

      setLoading(true);
      setThumbnails([]);
      setPageCount(0);
      renderedPagesRef.current.clear();

      // Close previous PDF if open
      if (isPdfOpen) {
        await cancelAllRendering().catch(() => {});
        await closePdf().catch(() => {});
      }

      // Clean up previous picked file
      if (pickedFile) {
        cleanupPickedFile(pickedFile);
      }

      setPickedFile(file);

      const result = await openPdf(file.localPath);
      if (!mountedRef.current) return;

      setIsPdfOpen(true);
      setPageCount(result.pageCount);

      // Start background thumbnail pre-generation silently
      startThumbnailPreGeneration().catch(() => {});

      // Initialize thumbnail placeholders
      const items: ThumbnailItem[] = Array.from(
        { length: result.pageCount },
        (_, i) => ({ pageIndex: i, loading: false })
      );
      setThumbnails(items);
      setLoading(false);

      // Render initial visible thumbnails
      renderVisibleThumbnails(0, Math.min(11, result.pageCount - 1));
    } catch (error) {
      if (!mountedRef.current) return;
      setLoading(false);
      Alert.alert('Error', getErrorMessage(error));
    }
  }, [isPdfOpen, pickedFile]);

  // Render thumbnails for visible range
  const renderVisibleThumbnails = useCallback(async (start: number, end: number) => {
    const batchSize = 4;
    for (let batchStart = start; batchStart <= end; batchStart += batchSize) {
      const batchEnd = Math.min(batchStart + batchSize - 1, end);
      const promises = [];

      for (let i = batchStart; i <= batchEnd; i++) {
        if (renderedPagesRef.current.has(i)) continue;
        renderedPagesRef.current.add(i);
        promises.push(renderSingleThumbnail(i));
      }

      if (promises.length > 0) {
        await Promise.allSettled(promises);
      }

      if (!mountedRef.current) break;
    }

    // Prefetch next batch
    if (mountedRef.current && end + 1 < pageCount) {
      prefetchThumbnails(end + 1, Math.min(end + PREFETCH_AHEAD, pageCount - 1)).catch(() => {});
    }
  }, [pageCount]);

  const renderSingleThumbnail = useCallback(async (pageIndex: number) => {
    if (!mountedRef.current) return;

    setThumbnails(prev =>
      prev.map(t =>
        t.pageIndex === pageIndex ? { ...t, loading: true } : t
      )
    );

    try {
      const result = await renderThumbnail(pageIndex);
      if (!mountedRef.current) return;

      setThumbnails(prev =>
        prev.map(t =>
          t.pageIndex === pageIndex
            ? {
                ...t,
                path: result.path,
                width: result.width,
                height: result.height,
                loading: false,
              }
            : t
        )
      );
    } catch (error) {
      if (!mountedRef.current) return;

      setThumbnails(prev =>
        prev.map(t =>
          t.pageIndex === pageIndex
            ? { ...t, loading: false, error: getErrorMessage(error) }
            : t
        )
      );
    }
  }, []);

  // Lazy rendering: only render thumbnails when they become visible
  const onViewableItemsChanged = useCallback(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      if (viewableItems.length === 0) return;

      const indices = viewableItems
        .map(v => v.index)
        .filter((i): i is number => i != null);

      if (indices.length === 0) return;

      const start = Math.min(...indices);
      const end = Math.max(...indices);
      visibleRangeRef.current = { start, end };

      // Render any newly visible items that haven't been rendered yet
      const toRender = indices.filter(i => !renderedPagesRef.current.has(i));
      if (toRender.length > 0) {
        renderVisibleThumbnails(Math.min(...toRender), Math.max(...toRender));
      }
    },
    [renderVisibleThumbnails]
  );

  const viewabilityConfig = useMemo(
    () => ({
      itemVisiblePercentThreshold: 20,
      minimumViewTime: 100,
    }),
    []
  );

  const viewabilityConfigCallbackPairs = useRef([
    { viewabilityConfig, onViewableItemsChanged },
  ]);

  const handleThumbnailPress = useCallback(async (pageIndex: number) => {
    setViewerPage(pageIndex);
    setViewerVisible(true);
    setFullPageLoading(true);
    setFullPageImage(null);

    try {
      const result = await renderPage(pageIndex, 2.0);
      if (!mountedRef.current) return;
      setFullPageImage(result);
    } catch (error) {
      if (!mountedRef.current) return;
      Alert.alert('Error', getErrorMessage(error));
    } finally {
      if (mountedRef.current) setFullPageLoading(false);
    }
  }, []);

  const handleViewerNavigate = useCallback(async (direction: 'prev' | 'next') => {
    const newPage = direction === 'prev' ? viewerPage - 1 : viewerPage + 1;
    if (newPage < 0 || newPage >= pageCount) return;

    setViewerPage(newPage);
    setFullPageLoading(true);
    setFullPageImage(null);

    try {
      const result = await renderPage(newPage, 2.0);
      if (!mountedRef.current) return;
      setFullPageImage(result);
    } catch (error) {
      if (!mountedRef.current) return;
      Alert.alert('Error', getErrorMessage(error));
    } finally {
      if (mountedRef.current) setFullPageLoading(false);
    }
  }, [viewerPage, pageCount]);

  const renderThumbnailItem = useCallback(({ item }: { item: ThumbnailItem }) => {
    return (
      <Pressable
        style={[
          styles.thumbnailItem,
          { backgroundColor: theme.surface, borderColor: theme.border },
        ]}
        onPress={() => handleThumbnailPress(item.pageIndex)}
      >
        {item.loading ? (
          <SkeletonThumbnail isDark={isDark} theme={theme} />
        ) : item.path ? (
          <Image
            source={{ uri: `file://${item.path}` }}
            style={styles.thumbnailImage}
            resizeMode="contain"
          />
        ) : item.error ? (
          <View style={styles.thumbnailPlaceholder}>
            <Icon name="alert-circle" size={20} color={colors.error} />
          </View>
        ) : (
          <SkeletonThumbnail isDark={isDark} theme={theme} />
        )}
        <View style={[styles.pageLabel, { backgroundColor: isDark ? theme.surface : colors.surfaceVariant }]}>
          <Text style={[styles.pageLabelText, { color: theme.textSecondary }]}>
            {item.pageIndex + 1}
          </Text>
        </View>
      </Pressable>
    );
  }, [theme, isDark, handleThumbnailPress]);

  const keyExtractor = useCallback((item: ThumbnailItem) => `page-${item.pageIndex}`, []);

  return (
    <SafeScreen>
      <Header title="Preview PDF" showBack />

      {!pickedFile ? (
        <View style={styles.emptyState}>
          <View style={[styles.emptyIconContainer, { backgroundColor: `${colors.pdfPreview}15` }]}>
            <Icon name="file-search" size={48} color={colors.pdfPreview} />
          </View>
          <Text style={[styles.emptyTitle, { color: theme.textPrimary }]}>
            Preview PDF Pages
          </Text>
          <Text style={[styles.emptyDescription, { color: theme.textSecondary }]}>
            Select a PDF file to view page thumbnails and full-page previews
          </Text>
          <Button
            title="Select PDF"
            onPress={handlePickFile}
            style={styles.selectButton}
          />
        </View>
      ) : (
        <View style={styles.content}>
          {/* File info bar */}
          <View style={[styles.fileInfo, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <View style={styles.fileInfoLeft}>
              <Icon name="file-pdf" size={20} color={colors.pdfPreview} />
              <View style={styles.fileInfoText}>
                <Text style={[styles.fileName, { color: theme.textPrimary }]} numberOfLines={1}>
                  {pickedFile.name}
                </Text>
                <Text style={[styles.pageCountText, { color: theme.textSecondary }]}>
                  {pageCount} {pageCount === 1 ? 'page' : 'pages'}
                </Text>
              </View>
            </View>
            <Pressable onPress={handlePickFile} style={styles.changeFileButton}>
              <Text style={[styles.changeFileText, { color: colors.primary }]}>Change</Text>
            </Pressable>
          </View>

          {loading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={colors.primary} />
              <Text style={[styles.loadingText, { color: theme.textSecondary }]}>
                Loading PDF...
              </Text>
            </View>
          ) : (
            <FlatList
              data={thumbnails}
              renderItem={renderThumbnailItem}
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
        </View>
      )}

      {/* Full Page Viewer Modal */}
      <Modal
        visible={viewerVisible}
        animationType="fade"
        onRequestClose={() => setViewerVisible(false)}
        statusBarTranslucent
      >
        <View style={[styles.viewerContainer, { backgroundColor: isDark ? '#000' : '#1a1a1a' }]}>
          {/* Viewer Header */}
          <View style={styles.viewerHeader}>
            <Pressable onPress={() => setViewerVisible(false)} style={styles.viewerCloseBtn}>
              <Icon name="close" size={24} color="#fff" />
            </Pressable>
            <Text style={styles.viewerTitle}>
              Page {viewerPage + 1} of {pageCount}
            </Text>
            <View style={{ width: 40 }} />
          </View>

          {/* Page Content */}
          <View style={styles.viewerContent}>
            {fullPageLoading ? (
              <ActivityIndicator size="large" color="#fff" />
            ) : fullPageImage ? (
              <ScrollView
                contentContainerStyle={styles.viewerScrollContent}
                maximumZoomScale={3}
                minimumZoomScale={1}
                showsVerticalScrollIndicator={false}
                showsHorizontalScrollIndicator={false}
              >
                <Image
                  source={{ uri: `file://${fullPageImage.path}` }}
                  style={{
                    width: SCREEN_WIDTH - spacing.lg * 2,
                    height: (SCREEN_WIDTH - spacing.lg * 2) * (fullPageImage.height / fullPageImage.width),
                  }}
                  resizeMode="contain"
                />
              </ScrollView>
            ) : null}
          </View>

          {/* Navigation Controls */}
          <View style={styles.viewerNav}>
            <Pressable
              onPress={() => handleViewerNavigate('prev')}
              style={[styles.navButton, viewerPage === 0 && styles.navButtonDisabled]}
              disabled={viewerPage === 0}
            >
              <Icon name="chevron-left" size={28} color={viewerPage === 0 ? '#555' : '#fff'} />
            </Pressable>
            <Pressable
              onPress={() => handleViewerNavigate('next')}
              style={[styles.navButton, viewerPage === pageCount - 1 && styles.navButtonDisabled]}
              disabled={viewerPage === pageCount - 1}
            >
              <Icon name="chevron-right" size={28} color={viewerPage === pageCount - 1 ? '#555' : '#fff'} />
            </Pressable>
          </View>
        </View>
      </Modal>
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
    marginBottom: spacing.sm,
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
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: spacing.md,
    fontSize: 15,
  },
  gridContent: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xl,
  },
  gridRow: {
    gap: THUMBNAIL_GAP,
    marginBottom: THUMBNAIL_GAP,
  },
  thumbnailItem: {
    width: THUMBNAIL_WIDTH,
    height: THUMBNAIL_HEIGHT,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    overflow: 'hidden',
  },
  thumbnailPlaceholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
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
  // Viewer styles
  viewerContainer: {
    flex: 1,
  },
  viewerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.xl + spacing.md,
    paddingBottom: spacing.md,
  },
  viewerCloseBtn: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  viewerTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  viewerContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  viewerScrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
  },
  viewerNav: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xl + spacing.md,
    paddingTop: spacing.md,
  },
  navButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(255,255,255,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  navButtonDisabled: {
    opacity: 0.4,
  },
});
