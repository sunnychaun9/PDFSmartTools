import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  StyleSheet,
  FlatList,
  Pressable,
  Animated,
  RefreshControl,
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { SafeScreen } from '../../components/layout';
import { Text, Icon, Button, AppModal } from '../../components/ui';
import { colors, spacing, borderRadius, shadows } from '../../theme';
import { RootStackParamList } from '../../navigation/types';
import { useTheme } from '../../context';
import RNFS from 'react-native-fs';
import {
  getRecentFiles,
  removeRecentFile,
  clearRecentFiles,
  formatFileSize,
  formatRelativeDate,
  type RecentFile,
  type RecentFileType,
} from '../../services/recentFilesService';

const getTypeIcon = (type: RecentFileType): string => {
  switch (type) {
    case 'created':
      return 'image';
    case 'compressed':
      return 'compress';
    case 'viewed':
      return 'eye';
    default:
      return 'file-pdf';
  }
};

const getTypeColor = (type: RecentFileType): string => {
  switch (type) {
    case 'created':
      return colors.imageToPdf;
    case 'compressed':
      return colors.compressPdf;
    case 'viewed':
      return colors.viewPdf;
    default:
      return colors.primary;
  }
};

const getTypeLabel = (type: RecentFileType): string => {
  switch (type) {
    case 'created':
      return 'Created';
    case 'compressed':
      return 'Compressed';
    case 'viewed':
      return 'Viewed';
    default:
      return 'PDF';
  }
};

type FileCardProps = {
  item: RecentFile;
  onPress: () => void;
  onLongPress: () => void;
  index: number;
};

function FileCard({ item, onPress, onLongPress, index }: FileCardProps) {
  const { theme } = useTheme();
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const typeColor = getTypeColor(item.type);

  const handlePressIn = () => {
    Animated.spring(scaleAnim, {
      toValue: 0.97,
      useNativeDriver: true,
      speed: 50,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(scaleAnim, {
      toValue: 1,
      useNativeDriver: true,
      speed: 50,
    }).start();
  };

  return (
    <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
      <Pressable
        style={[styles.fileCard, { backgroundColor: theme.surface }]}
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        onLongPress={onLongPress}
        android_ripple={{ color: theme.ripple }}
      >
        <View style={styles.fileRow}>
          <View
            style={[
              styles.iconContainer,
              { backgroundColor: `${typeColor}15` },
            ]}
          >
            <Icon
              name={getTypeIcon(item.type) as any}
              size={22}
              color={typeColor}
            />
          </View>
          <View style={styles.fileInfo}>
            <Text
              variant="body"
              numberOfLines={1}
              style={{ color: theme.textPrimary, fontWeight: '500' }}
            >
              {item.name}
            </Text>
            <View style={styles.fileMeta}>
              <View style={[styles.typeBadge, { backgroundColor: `${typeColor}15` }]}>
                <Text
                  variant="caption"
                  style={{ color: typeColor, fontSize: 10, fontWeight: '600' }}
                >
                  {getTypeLabel(item.type)}
                </Text>
              </View>
              <Text variant="caption" style={{ color: theme.textTertiary }}>
                {formatFileSize(item.size)} • {formatRelativeDate(item.date)}
              </Text>
            </View>
          </View>
          <Icon name="chevron-right" size={20} color={theme.textTertiary} />
        </View>
      </Pressable>
    </Animated.View>
  );
}

export default function RecentFilesScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { isDark, theme } = useTheme();
  const [files, setFiles] = useState<RecentFile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Modal states
  const [deleteModal, setDeleteModal] = useState<{
    visible: boolean;
    file: RecentFile | null;
  }>({ visible: false, file: null });
  const [fileNotFoundModal, setFileNotFoundModal] = useState<{
    visible: boolean;
    file: RecentFile | null;
  }>({ visible: false, file: null });
  const [clearAllModal, setClearAllModal] = useState(false);

  // Animation
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(20)).current;

  const loadFiles = async () => {
    const recentFiles = await getRecentFiles();
    setFiles(recentFiles);
    setIsLoading(false);
  };

  // Load files on mount and when screen is focused
  useFocusEffect(
    useCallback(() => {
      loadFiles();
    }, [])
  );

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 400,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 400,
        useNativeDriver: true,
      }),
    ]).start();
  }, [fadeAnim, slideAnim]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await loadFiles();
    setIsRefreshing(false);
  };

  const handleFilePress = useCallback(
    async (file: RecentFile) => {
      // Validate file path exists
      if (!file.path) {
        setFileNotFoundModal({
          visible: true,
          file: file,
        });
        return;
      }

      // Check if file still exists on disk
      try {
        const exists = await RNFS.exists(file.path);
        if (!exists) {
          // File was deleted externally, prompt to remove from recent
          setFileNotFoundModal({
            visible: true,
            file: file,
          });
          return;
        }
      } catch {
        // If we can't check, try opening anyway
      }

      navigation.navigate('PdfViewer', {
        filePath: file.path,
        title: file.name,
      });
    },
    [navigation]
  );

  const handleDeleteFile = async (id: string) => {
    await removeRecentFile(id);
    loadFiles();
  };

  const handleClearAll = () => {
    setClearAllModal(true);
  };

  const handleConfirmClearAll = async () => {
    setClearAllModal(false);
    await clearRecentFiles();
    setFiles([]);
  };

  const handleConfirmDelete = async () => {
    if (deleteModal.file) {
      await handleDeleteFile(deleteModal.file.id);
    }
    setDeleteModal({ visible: false, file: null });
  };

  const handleConfirmRemoveMissing = async () => {
    if (fileNotFoundModal.file) {
      await handleDeleteFile(fileNotFoundModal.file.id);
    }
    setFileNotFoundModal({ visible: false, file: null });
  };

  const renderItem = useCallback(
    ({ item, index }: { item: RecentFile; index: number }) => (
      <FileCard
        item={item}
        index={index}
        onPress={() => handleFilePress(item)}
        onLongPress={() => setDeleteModal({ visible: true, file: item })}
      />
    ),
    [handleFilePress]
  );

  const renderEmptyState = () => (
    <View style={styles.emptyState}>
      <View
        style={[
          styles.emptyIconContainer,
          { backgroundColor: theme.surfaceVariant },
        ]}
      >
        <Text style={styles.emptyIcon}>📄</Text>
      </View>
      <Text
        variant="h3"
        style={[styles.emptyTitle, { color: theme.textPrimary }]}
      >
        No recent files
      </Text>
      <Text
        variant="body"
        style={[styles.emptyText, { color: theme.textSecondary }]}
      >
        Files you create, compress, or view will appear here for quick access.
      </Text>
      <Button
        title="Create PDF"
        onPress={() => navigation.navigate('ImageToPdf')}
        style={{ marginTop: spacing.lg }}
      />
    </View>
  );

  const renderHeader = () => (
    <Animated.View
      style={[
        styles.header,
        {
          opacity: fadeAnim,
          transform: [{ translateY: slideAnim }],
        },
      ]}
    >
      <View style={styles.headerRow}>
        <Text
          variant="h2"
          style={{ color: theme.textPrimary, fontSize: 28, fontWeight: '700' }}
        >
          Recent Files
        </Text>
        {files.length > 0 && (
          <Pressable
            style={[styles.clearButton, { backgroundColor: theme.surfaceVariant }]}
            onPress={handleClearAll}
          >
            <Text variant="caption" style={{ color: colors.error, fontWeight: '600' }}>
              Clear All
            </Text>
          </Pressable>
        )}
      </View>
      {files.length > 0 && (
        <Text variant="bodySmall" style={{ color: theme.textSecondary, marginTop: spacing.xs }}>
          {files.length} file{files.length !== 1 ? 's' : ''} • Long press to delete
        </Text>
      )}
    </Animated.View>
  );

  return (
    <SafeScreen>
      <FlatList
        data={files}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        contentContainerStyle={[
          styles.list,
          files.length === 0 && styles.listEmpty,
        ]}
        ListHeaderComponent={renderHeader}
        ListEmptyComponent={!isLoading ? renderEmptyState : null}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            colors={[colors.primary]}
            tintColor={colors.primary}
          />
        }
      />

      {/* Delete Confirmation Modal */}
      <AppModal
        visible={deleteModal.visible}
        type="confirm"
        title="Delete File"
        message={`Remove "${deleteModal.file?.name}" from recent files?`}
        onClose={() => setDeleteModal({ visible: false, file: null })}
        buttons={[
          {
            text: 'Delete',
            variant: 'destructive',
            onPress: handleConfirmDelete,
          },
          {
            text: 'Cancel',
            variant: 'secondary',
            onPress: () => setDeleteModal({ visible: false, file: null }),
          },
        ]}
      />

      {/* Clear All Confirmation Modal */}
      <AppModal
        visible={clearAllModal}
        type="confirm"
        title="Clear All"
        message="Are you sure you want to clear all recent files?"
        onClose={() => setClearAllModal(false)}
        buttons={[
          {
            text: 'Clear All',
            variant: 'destructive',
            onPress: handleConfirmClearAll,
          },
          {
            text: 'Cancel',
            variant: 'secondary',
            onPress: () => setClearAllModal(false),
          },
        ]}
      />

      {/* File Not Found Modal */}
      <AppModal
        visible={fileNotFoundModal.visible}
        type="warning"
        title="File Not Found"
        message={`The file "${fileNotFoundModal.file?.name}" no longer exists. It may have been deleted or moved. Would you like to remove it from your recent files?`}
        onClose={() => setFileNotFoundModal({ visible: false, file: null })}
        buttons={[
          {
            text: 'Remove',
            variant: 'primary',
            onPress: handleConfirmRemoveMissing,
          },
          {
            text: 'Cancel',
            variant: 'secondary',
            onPress: () => setFileNotFoundModal({ visible: false, file: null }),
          },
        ]}
      />
    </SafeScreen>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    paddingBottom: spacing.lg,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  clearButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
  },
  list: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
  },
  listEmpty: {
    flexGrow: 1,
  },
  fileCard: {
    borderRadius: borderRadius.lg,
    marginBottom: spacing.sm,
    overflow: 'hidden',
    ...shadows.card,
  },
  fileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
  },
  iconContainer: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  fileInfo: {
    flex: 1,
  },
  fileMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    gap: spacing.sm,
  },
  typeBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.xs,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xxl,
  },
  emptyIconContainer: {
    width: 100,
    height: 100,
    borderRadius: 50,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  emptyIcon: {
    fontSize: 48,
  },
  emptyTitle: {
    marginBottom: spacing.sm,
    textAlign: 'center',
  },
  emptyText: {
    textAlign: 'center',
    lineHeight: 22,
  },
});
