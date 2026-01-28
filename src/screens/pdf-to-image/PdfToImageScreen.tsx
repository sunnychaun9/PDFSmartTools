import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  Pressable,
  Animated,
  Image,
  Modal,
  FlatList,
  Dimensions,
} from 'react-native';
import { SafeScreen, Header, Spacer } from '../../components/layout';
import { Button, Text, Icon, AppModal } from '../../components/ui';
import { ProgressBar } from '../../components/feedback';
import { useProGate, UpgradePromptModal } from '../../components/subscription';
import { colors, spacing, borderRadius, shadows } from '../../theme';
import {
  convertPdfToImages,
  getPdfPageCount,
  moveImagesToDownloads,
  cleanupImages,
  getTotalImagesSize,
  formatFileSize,
  ImageFormat,
  PageSelection,
  PdfToImageResult,
} from '../../services/pdfToImageService';
import { pickPdfFile, PickedFile, cleanupPickedFile } from '../../services/filePicker';
import { loadInterstitialAd, showInterstitialAd } from '../../services/adService';
import { useTheme, useRating } from '../../context';
import { canUse, consume, getRemaining, FEATURES } from '../../services/usageLimitService';
import Share from 'react-native-share';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// Format options
const FORMAT_OPTIONS: { format: ImageFormat; label: string; description: string }[] = [
  { format: 'png', label: 'PNG', description: 'Lossless quality' },
  { format: 'jpg', label: 'JPG', description: 'Smaller file size' },
];

// Page selection options
const PAGE_OPTIONS: { selection: PageSelection; label: string; description: string; proOnly: boolean }[] = [
  { selection: 'single', label: 'Single Page', description: 'Export one page', proOnly: false },
  { selection: 'all', label: 'All Pages', description: 'Export every page', proOnly: true },
];

// Sub-components
function FormatSelector({
  selectedFormat,
  onSelect,
  disabled,
}: {
  selectedFormat: ImageFormat;
  onSelect: (format: ImageFormat) => void;
  disabled: boolean;
}) {
  const { theme } = useTheme();

  return (
    <View style={styles.optionSelector}>
      {FORMAT_OPTIONS.map((option) => {
        const isSelected = selectedFormat === option.format;
        return (
          <Pressable
            key={option.format}
            style={[
              styles.optionItem,
              { borderColor: isSelected ? colors.primary : theme.border, backgroundColor: theme.surface },
              isSelected && styles.optionItemSelected,
            ]}
            onPress={() => !disabled && onSelect(option.format)}
            disabled={disabled}
          >
            <View style={styles.optionContent}>
              <View
                style={[
                  styles.optionIconContainer,
                  { backgroundColor: isSelected ? colors.primary : theme.surfaceVariant },
                ]}
              >
                <Icon
                  name={option.format === 'png' ? 'image' : 'file-image'}
                  size={24}
                  color={isSelected ? colors.textOnPrimary : theme.textSecondary}
                />
              </View>
              <Text
                variant="bodySmall"
                style={[styles.optionLabel, { color: isSelected ? colors.primary : theme.textSecondary }]}
              >
                {option.label}
              </Text>
              <Text variant="caption" style={{ color: theme.textTertiary }}>
                {option.description}
              </Text>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

function PageSelector({
  selectedSelection,
  onSelect,
  disabled,
  isPro,
}: {
  selectedSelection: PageSelection;
  onSelect: (selection: PageSelection) => void;
  disabled: boolean;
  isPro: boolean;
}) {
  const { theme } = useTheme();

  return (
    <View style={styles.optionSelector}>
      {PAGE_OPTIONS.map((option) => {
        const isSelected = selectedSelection === option.selection;
        const isLocked = option.proOnly && !isPro;
        return (
          <Pressable
            key={option.selection}
            style={[
              styles.optionItem,
              { borderColor: isSelected ? colors.primary : theme.border, backgroundColor: theme.surface },
              isSelected && styles.optionItemSelected,
              isLocked && styles.optionItemLocked,
            ]}
            onPress={() => !disabled && !isLocked && onSelect(option.selection)}
            disabled={disabled || isLocked}
          >
            <View style={styles.optionContent}>
              {isLocked && (
                <View style={[styles.proBadge, { backgroundColor: colors.proPlan }]}>
                  <Icon name="crown" size={10} color={colors.textOnPrimary} />
                  <Text variant="caption" style={{ color: colors.textOnPrimary, fontSize: 10, marginLeft: 2 }}>
                    PRO
                  </Text>
                </View>
              )}
              <View
                style={[
                  styles.optionIconContainer,
                  { backgroundColor: isSelected ? colors.primary : theme.surfaceVariant },
                  isLocked && { opacity: 0.5 },
                ]}
              >
                <Icon
                  name={option.selection === 'single' ? 'file' : 'layers'}
                  size={24}
                  color={isSelected ? colors.textOnPrimary : theme.textSecondary}
                />
              </View>
              <Text
                variant="bodySmall"
                style={[
                  styles.optionLabel,
                  { color: isSelected ? colors.primary : theme.textSecondary },
                  isLocked && { opacity: 0.5 },
                ]}
              >
                {option.label}
              </Text>
              <Text variant="caption" style={[{ color: theme.textTertiary }, isLocked && { opacity: 0.5 }]}>
                {option.description}
              </Text>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

function PagePicker({
  totalPages,
  selectedPage,
  onSelect,
}: {
  totalPages: number;
  selectedPage: number;
  onSelect: (page: number) => void;
}) {
  const { theme } = useTheme();

  return (
    <View style={styles.pagePickerContainer}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.pagePickerContent}
      >
        {Array.from({ length: totalPages }, (_, i) => (
          <Pressable
            key={i}
            style={[
              styles.pageChip,
              { borderColor: selectedPage === i ? colors.primary : theme.border, backgroundColor: theme.surface },
              selectedPage === i && styles.pageChipSelected,
            ]}
            onPress={() => onSelect(i)}
          >
            <Text
              variant="bodySmall"
              style={{ color: selectedPage === i ? colors.primary : theme.textSecondary }}
            >
              Page {i + 1}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

function ConversionProgress({
  progress,
  currentPage,
  totalPages,
}: {
  progress: number;
  currentPage: number;
  totalPages: number;
}) {
  const { theme } = useTheme();

  return (
    <View style={[styles.progressCard, { backgroundColor: theme.surface }, shadows.card]}>
      <View style={styles.progressHeader}>
        <View style={[styles.progressSpinner, { backgroundColor: `${colors.primary}15` }]}>
          <Text style={{ fontSize: 24 }}>🖼️</Text>
        </View>
        <View style={styles.progressInfo}>
          <Text variant="body" style={{ color: theme.textPrimary }}>Converting to Images</Text>
          <Text variant="caption" style={{ color: theme.textTertiary }}>
            Page {currentPage} of {totalPages}
          </Text>
        </View>
        <Text variant="h3" customColor={colors.primary}>{progress}%</Text>
      </View>
      <Spacer size="md" />
      <ProgressBar progress={progress} height={10} />
    </View>
  );
}

function ImagePreviewModal({
  visible,
  images,
  onClose,
}: {
  visible: boolean;
  images: string[];
  onClose: () => void;
}) {
  const { theme } = useTheme();
  const [currentIndex, setCurrentIndex] = useState(0);

  const renderImage = ({ item, index }: { item: string; index: number }) => (
    <View style={styles.previewImageContainer}>
      <Image
        source={{ uri: `file://${item}` }}
        style={styles.previewImage}
        resizeMode="contain"
      />
      <Text variant="caption" align="center" style={{ color: theme.textSecondary, marginTop: spacing.sm }}>
        Page {index + 1} of {images.length}
      </Text>
    </View>
  );

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.previewOverlay}>
        <Pressable style={styles.previewBackdrop} onPress={onClose} />
        <View style={[styles.previewContent, { backgroundColor: theme.surface }]}>
          <View style={styles.previewHeader}>
            <Text variant="h3" style={{ color: theme.textPrimary }}>Image Preview</Text>
            <Pressable onPress={onClose} style={styles.previewCloseButton}>
              <Icon name="x" size={24} color={theme.textSecondary} />
            </Pressable>
          </View>
          <FlatList
            data={images}
            renderItem={renderImage}
            keyExtractor={(_, index) => index.toString()}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={(e) => {
              const newIndex = Math.round(e.nativeEvent.contentOffset.x / (SCREEN_WIDTH - spacing.xl * 2));
              setCurrentIndex(newIndex);
            }}
          />
          {images.length > 1 && (
            <View style={styles.previewDots}>
              {images.map((_, index) => (
                <View
                  key={index}
                  style={[
                    styles.previewDot,
                    { backgroundColor: index === currentIndex ? colors.primary : theme.border },
                  ]}
                />
              ))}
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

function ResultCard({
  result,
  totalSize,
  onSave,
  onShare,
  onPreview,
}: {
  result: PdfToImageResult;
  totalSize: number;
  onSave: () => void;
  onShare: () => void;
  onPreview: () => void;
}) {
  const { theme } = useTheme();

  return (
    <View style={[styles.resultCardInner, { backgroundColor: theme.surface }, shadows.card]}>
      <View style={styles.resultIconContainer}>
        <Text style={{ fontSize: 48 }}>✅</Text>
      </View>
      <Spacer size="md" />
      <Text variant="h2" align="center" style={{ color: theme.textPrimary }}>Conversion Complete!</Text>
      <Spacer size="lg" />

      <View style={styles.resultStats}>
        <View style={styles.resultStatItem}>
          <Text variant="caption" style={{ color: theme.textTertiary }}>Images</Text>
          <Text variant="h3" style={{ color: theme.textPrimary }}>{result.pageCount}</Text>
        </View>
        <View style={[styles.resultStatDivider, { backgroundColor: theme.border }]} />
        <View style={styles.resultStatItem}>
          <Text variant="caption" style={{ color: theme.textTertiary }}>Format</Text>
          <Text variant="h3" style={{ color: theme.textPrimary }}>{result.format.toUpperCase()}</Text>
        </View>
        <View style={[styles.resultStatDivider, { backgroundColor: theme.border }]} />
        <View style={styles.resultStatItem}>
          <Text variant="caption" style={{ color: theme.textTertiary }}>Total Size</Text>
          <Text variant="h3" style={{ color: theme.textPrimary }}>{formatFileSize(totalSize)}</Text>
        </View>
      </View>

      {result.wasLimited && (
        <>
          <Spacer size="md" />
          <View style={[styles.limitedBanner, { backgroundColor: colors.warningLight }]}>
            <Icon name="info" size={16} color={colors.warning} />
            <Text variant="caption" customColor={colors.warning} style={{ marginLeft: spacing.xs }}>
              Free users can only export 1 page. Upgrade to Pro for all pages.
            </Text>
          </View>
        </>
      )}

      <Spacer size="xl" />

      <View style={styles.resultActions}>
        <Button
          title="Preview Images"
          variant="outline"
          onPress={onPreview}
          fullWidth
          leftIcon={<Icon name="eye" size={18} color={colors.primary} />}
        />
        <Spacer size="sm" />
        <Button
          title="Save to Downloads"
          onPress={onSave}
          fullWidth
          leftIcon={<Icon name="download" size={18} color={colors.textOnPrimary} />}
        />
        <Spacer size="sm" />
        <Button
          title="Share"
          variant="outline"
          onPress={onShare}
          fullWidth
          leftIcon={<Icon name="share-2" size={18} color={colors.primary} />}
        />
      </View>
    </View>
  );
}

export default function PdfToImageScreen() {
  const { isPro, navigateToUpgrade } = useProGate();
  const { theme } = useTheme();
  const { onSuccessfulAction } = useRating();

  // File state
  const [selectedFile, setSelectedFile] = useState<PickedFile | null>(null);
  const [totalPages, setTotalPages] = useState(0);

  // Options state
  const [selectedFormat, setSelectedFormat] = useState<ImageFormat>('png');
  const [selectedPageSelection, setSelectedPageSelection] = useState<PageSelection>('single');
  const [selectedPageIndex, setSelectedPageIndex] = useState(0);

  // Processing state
  const [isConverting, setIsConverting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentPage, setCurrentPage] = useState(0);
  const [conversionTotalPages, setConversionTotalPages] = useState(0);

  // Result state
  const [conversionResult, setConversionResult] = useState<PdfToImageResult | null>(null);
  const [resultTotalSize, setResultTotalSize] = useState(0);
  const [showPreview, setShowPreview] = useState(false);

  // UI state
  const [remainingUses, setRemainingUses] = useState<number>(Infinity);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);

  // Modal states
  const [errorModal, setErrorModal] = useState<{
    visible: boolean;
    title: string;
    message: string;
  }>({ visible: false, title: '', message: '' });
  const [successModal, setSuccessModal] = useState<{
    visible: boolean;
    message: string;
  }>({ visible: false, message: '' });

  const fadeAnim = useRef(new Animated.Value(0)).current;

  const refreshRemainingUses = useCallback(async () => {
    const remaining = await getRemaining(FEATURES.PDF_TO_IMAGE, isPro);
    setRemainingUses(remaining);
  }, [isPro]);

  useEffect(() => {
    loadInterstitialAd();
    refreshRemainingUses();
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 400,
      useNativeDriver: true,
    }).start();
  }, [fadeAnim, refreshRemainingUses]);

  const handleSelectFile = useCallback(async () => {
    try {
      setConversionResult(null);

      const file = await pickPdfFile();
      if (file) {
        setSelectedFile(file);

        // Get page count
        const pageCount = await getPdfPageCount(file.localPath);
        setTotalPages(pageCount);
        setSelectedPageIndex(0);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to select file';
      if (message.includes('encrypted') || message.includes('password')) {
        setErrorModal({
          visible: true,
          title: 'Password Protected PDF',
          message: 'This PDF is password protected and cannot be opened. Please remove the password protection first.',
        });
      } else {
        setErrorModal({ visible: true, title: 'Error', message });
      }
    }
  }, []);

  const handleConvert = useCallback(async () => {
    if (!selectedFile) return;

    // Check usage limit
    const allowed = await canUse(FEATURES.PDF_TO_IMAGE, isPro);
    if (!allowed) {
      setShowUpgradeModal(true);
      return;
    }

    setIsConverting(true);
    setProgress(0);
    setCurrentPage(0);
    setConversionTotalPages(0);
    setConversionResult(null);

    try {
      const result = await convertPdfToImages(selectedFile.localPath, {
        format: selectedFormat,
        pageSelection: selectedPageSelection,
        selectedPageIndex,
        quality: 90,
        onProgress: (progressInfo) => {
          setProgress(progressInfo.progress);
          setCurrentPage(progressInfo.currentPage);
          setConversionTotalPages(progressInfo.totalPages);
        },
        isPro,
      });

      setConversionResult(result);

      // Calculate total size
      const totalSize = await getTotalImagesSize(result.outputPaths);
      setResultTotalSize(totalSize);

      // Consume usage
      await consume(FEATURES.PDF_TO_IMAGE, isPro);
      await refreshRemainingUses();

      // Show ad
      await showInterstitialAd(isPro);
      onSuccessfulAction();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Conversion failed';
      if (message.includes('encrypted') || message.includes('password')) {
        setErrorModal({
          visible: true,
          title: 'Password Protected PDF',
          message: 'This PDF is password protected and cannot be converted.',
        });
      } else if (message.includes('memory')) {
        setErrorModal({
          visible: true,
          title: 'Out of Memory',
          message: 'The PDF is too large to process. Try selecting fewer pages or a lower resolution.',
        });
      } else {
        setErrorModal({ visible: true, title: 'Conversion Failed', message });
      }
    } finally {
      setIsConverting(false);
    }
  }, [selectedFile, selectedFormat, selectedPageSelection, selectedPageIndex, isPro, refreshRemainingUses, onSuccessfulAction]);

  const handleSaveToDownloads = useCallback(async () => {
    if (!conversionResult) return;

    try {
      const savedPaths = await moveImagesToDownloads(conversionResult.outputPaths);
      setSuccessModal({
        visible: true,
        message: `${savedPaths.length} image${savedPaths.length > 1 ? 's' : ''} saved to Downloads folder.`,
      });

      // Update result with new paths
      setConversionResult({
        ...conversionResult,
        outputPaths: savedPaths,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save images';
      setErrorModal({ visible: true, title: 'Save Failed', message });
    }
  }, [conversionResult]);

  const handleShare = useCallback(async () => {
    if (!conversionResult || conversionResult.outputPaths.length === 0) return;

    try {
      const urls = conversionResult.outputPaths.map((path) => `file://${path}`);

      await Share.open({
        urls,
        type: `image/${conversionResult.format}`,
        title: 'Share Images',
        failOnCancel: false,
      });
    } catch (err: any) {
      // Ignore cancel errors
      if (err?.message?.includes('cancel') || err?.message?.includes('dismissed')) {
        return;
      }
      const message = err instanceof Error ? err.message : 'Failed to share images';
      setErrorModal({ visible: true, title: 'Share Failed', message });
    }
  }, [conversionResult]);

  const handleReset = useCallback(async () => {
    // Cleanup temporary files
    if (conversionResult) {
      await cleanupImages(conversionResult.outputPaths);
    }
    if (selectedFile) {
      await cleanupPickedFile(selectedFile.localPath);
    }

    setSelectedFile(null);
    setTotalPages(0);
    setConversionResult(null);
    setResultTotalSize(0);
    setProgress(0);
    setCurrentPage(0);
    setConversionTotalPages(0);
    setSelectedPageIndex(0);
    setSelectedPageSelection('single');
    setSelectedFormat('png');
  }, [conversionResult, selectedFile]);

  // Empty state
  if (!selectedFile) {
    return (
      <SafeScreen>
        <Header title="PDF to Image" />
        <Animated.View style={[styles.emptyState, { opacity: fadeAnim }]}>
          <View style={[styles.emptyIconContainer, { backgroundColor: `${colors.info}15` }]}>
            <Text style={styles.emptyIcon}>🖼️</Text>
          </View>
          <Spacer size="lg" />
          <Text variant="h2" align="center" style={{ color: theme.textPrimary }}>PDF to Image</Text>
          <Spacer size="sm" />
          <Text variant="body" align="center" style={[styles.emptyDescription, { color: theme.textSecondary }]}>
            Convert PDF pages to high-quality PNG or JPG images
          </Text>
          <Spacer size="xl" />
          <Button
            title="Select PDF File"
            onPress={handleSelectFile}
            leftIcon={<Icon name="file-plus" size={20} color={colors.textOnPrimary} />}
          />
        </Animated.View>

        <UpgradePromptModal
          visible={showUpgradeModal}
          title="Daily Limit Reached"
          message="You have used all your free PDF to Image conversions for today. Upgrade to Pro for unlimited access."
          onUpgrade={() => {
            setShowUpgradeModal(false);
            navigateToUpgrade();
          }}
          onCancel={() => setShowUpgradeModal(false)}
        />

        <AppModal
          visible={errorModal.visible}
          type="error"
          title={errorModal.title}
          message={errorModal.message}
          onClose={() => setErrorModal((prev) => ({ ...prev, visible: false }))}
          buttons={[
            {
              text: 'OK',
              variant: 'primary',
              onPress: () => setErrorModal((prev) => ({ ...prev, visible: false })),
            },
          ]}
        />
      </SafeScreen>
    );
  }

  // Result view
  if (conversionResult) {
    return (
      <SafeScreen>
        <Header title="Conversion Complete" />
        <ScrollView style={styles.content} contentContainerStyle={styles.resultContent}>
          <ResultCard
            result={conversionResult}
            totalSize={resultTotalSize}
            onSave={handleSaveToDownloads}
            onShare={handleShare}
            onPreview={() => setShowPreview(true)}
          />
        </ScrollView>
        <View style={[styles.footer, { backgroundColor: theme.surface, borderTopColor: theme.border }]}>
          <Button
            title="Convert Another PDF"
            variant="outline"
            onPress={handleReset}
            fullWidth
          />
        </View>

        <ImagePreviewModal
          visible={showPreview}
          images={conversionResult.outputPaths}
          onClose={() => setShowPreview(false)}
        />

        <UpgradePromptModal
          visible={showUpgradeModal}
          title="Upgrade to Pro"
          message="Get unlimited conversions, export all pages, and high resolution output with Pro."
          onUpgrade={() => {
            setShowUpgradeModal(false);
            navigateToUpgrade();
          }}
          onCancel={() => setShowUpgradeModal(false)}
        />

        <AppModal
          visible={successModal.visible}
          type="success"
          title="Saved"
          message={successModal.message}
          onClose={() => setSuccessModal((prev) => ({ ...prev, visible: false }))}
          buttons={[
            {
              text: 'OK',
              variant: 'primary',
              onPress: () => setSuccessModal((prev) => ({ ...prev, visible: false })),
            },
          ]}
        />

        <AppModal
          visible={errorModal.visible}
          type="error"
          title={errorModal.title}
          message={errorModal.message}
          onClose={() => setErrorModal((prev) => ({ ...prev, visible: false }))}
          buttons={[
            {
              text: 'OK',
              variant: 'primary',
              onPress: () => setErrorModal((prev) => ({ ...prev, visible: false })),
            },
          ]}
        />
      </SafeScreen>
    );
  }

  // Main view
  return (
    <SafeScreen>
      <Header title="PDF to Image" />
      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* File Info Card */}
        <View style={[styles.fileCard, { backgroundColor: theme.surface }, shadows.card]}>
          <View style={styles.fileInfo}>
            <View style={[styles.fileIconContainer, { backgroundColor: `${colors.info}15` }]}>
              <Text style={{ fontSize: 24 }}>📄</Text>
            </View>
            <View style={styles.fileDetails}>
              <Text variant="body" numberOfLines={1} style={{ color: theme.textPrimary }}>
                {selectedFile.name}
              </Text>
              <Text variant="caption" style={{ color: theme.textTertiary }}>
                {selectedFile.formattedSize} • {totalPages} page{totalPages !== 1 ? 's' : ''}
              </Text>
            </View>
            <Button
              title="Change"
              variant="ghost"
              size="sm"
              onPress={handleSelectFile}
            />
          </View>
        </View>

        <Spacer size="lg" />

        {/* Format Selection */}
        <Text variant="h3" style={{ color: theme.textPrimary }}>Image Format</Text>
        <Spacer size="md" />
        <FormatSelector
          selectedFormat={selectedFormat}
          onSelect={setSelectedFormat}
          disabled={isConverting}
        />

        <Spacer size="lg" />

        {/* Page Selection */}
        <Text variant="h3" style={{ color: theme.textPrimary }}>Page Selection</Text>
        <Spacer size="md" />
        <PageSelector
          selectedSelection={selectedPageSelection}
          onSelect={setSelectedPageSelection}
          disabled={isConverting}
          isPro={isPro}
        />

        {selectedPageSelection === 'single' && totalPages > 1 && (
          <>
            <Spacer size="md" />
            <Text variant="bodySmall" style={{ color: theme.textSecondary }}>Select page to export:</Text>
            <Spacer size="sm" />
            <PagePicker
              totalPages={totalPages}
              selectedPage={selectedPageIndex}
              onSelect={setSelectedPageIndex}
            />
          </>
        )}

        <Spacer size="lg" />

        {/* Info Card */}
        <View style={[styles.infoCard, { backgroundColor: `${colors.info}10` }]}>
          <Icon name="info" size={18} color={colors.info} />
          <View style={styles.infoContent}>
            <Text variant="bodySmall" customColor={colors.info}>
              {isPro
                ? 'Pro: High resolution up to 300 DPI'
                : 'Free: Max resolution 1024px • 1 page only'}
            </Text>
          </View>
        </View>

        {isConverting && (
          <>
            <Spacer size="lg" />
            <ConversionProgress
              progress={progress}
              currentPage={currentPage}
              totalPages={conversionTotalPages}
            />
          </>
        )}

        <Spacer size="xl" />
      </ScrollView>

      <View style={[styles.footer, { backgroundColor: theme.surface, borderTopColor: theme.border }]}>
        {!isPro && remainingUses !== Infinity && (
          <View style={styles.remainingUsesContainer}>
            <Text variant="caption" style={{ color: theme.textSecondary }}>
              Free conversions remaining today: {remainingUses}
            </Text>
          </View>
        )}
        <Button
          title={isConverting ? 'Converting...' : 'Convert to Images'}
          onPress={handleConvert}
          loading={isConverting}
          disabled={isConverting}
          fullWidth
          leftIcon={
            !isConverting ? (
              <Icon name="image" size={20} color={colors.textOnPrimary} />
            ) : undefined
          }
        />
      </View>

      <UpgradePromptModal
        visible={showUpgradeModal}
        title="Daily Limit Reached"
        message="You have used all your free PDF to Image conversions for today. Upgrade to Pro for unlimited access."
        onUpgrade={() => {
          setShowUpgradeModal(false);
          navigateToUpgrade();
        }}
        onCancel={() => setShowUpgradeModal(false)}
      />

      <AppModal
        visible={errorModal.visible}
        type="error"
        title={errorModal.title}
        message={errorModal.message}
        onClose={() => setErrorModal((prev) => ({ ...prev, visible: false }))}
        buttons={[
          {
            text: 'OK',
            variant: 'primary',
            onPress: () => setErrorModal((prev) => ({ ...prev, visible: false })),
          },
        ]}
      />
    </SafeScreen>
  );
}

const styles = StyleSheet.create({
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  emptyIconContainer: {
    width: 100,
    height: 100,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyIcon: {
    fontSize: 48,
  },
  emptyDescription: {
    maxWidth: 280,
  },
  content: {
    flex: 1,
    padding: spacing.lg,
  },
  resultContent: {
    paddingBottom: spacing.xl,
  },
  fileCard: {
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
  },
  fileInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  fileIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fileDetails: {
    marginLeft: spacing.md,
    flex: 1,
  },
  optionSelector: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  optionItem: {
    flex: 1,
    borderRadius: borderRadius.xl,
    borderWidth: 2,
    overflow: 'hidden',
  },
  optionItemSelected: {
    borderWidth: 2,
  },
  optionItemLocked: {
    opacity: 0.7,
  },
  optionContent: {
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
  },
  optionIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  optionLabel: {
    fontWeight: '600',
  },
  proBadge: {
    position: 'absolute',
    top: spacing.xs,
    right: spacing.xs,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
    borderRadius: borderRadius.sm,
  },
  pagePickerContainer: {
    marginHorizontal: -spacing.lg,
  },
  pagePickerContent: {
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
  },
  pageChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
    borderWidth: 1,
  },
  pageChipSelected: {
    borderWidth: 2,
  },
  infoCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    borderRadius: borderRadius.md,
  },
  infoContent: {
    marginLeft: spacing.sm,
    flex: 1,
  },
  progressCard: {
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
  },
  progressHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  progressSpinner: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  progressInfo: {
    flex: 1,
  },
  resultCardInner: {
    padding: spacing.xl,
    alignItems: 'center',
    borderRadius: borderRadius.xl,
  },
  resultIconContainer: {
    width: 88,
    height: 88,
    borderRadius: 24,
    backgroundColor: colors.successLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  resultStats: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  resultStatItem: {
    flex: 1,
    alignItems: 'center',
  },
  resultStatDivider: {
    width: 1,
    height: 40,
  },
  limitedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    borderRadius: borderRadius.md,
    width: '100%',
  },
  resultActions: {
    width: '100%',
  },
  footer: {
    padding: spacing.lg,
    borderTopWidth: 1,
  },
  remainingUsesContainer: {
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  previewOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
  },
  previewBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  previewContent: {
    width: SCREEN_WIDTH - spacing.xl * 2,
    maxHeight: '80%',
    borderRadius: borderRadius.xl,
    overflow: 'hidden',
  },
  previewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  previewCloseButton: {
    padding: spacing.xs,
  },
  previewImageContainer: {
    width: SCREEN_WIDTH - spacing.xl * 2,
    padding: spacing.md,
  },
  previewImage: {
    width: '100%',
    height: 300,
    borderRadius: borderRadius.md,
  },
  previewDots: {
    flexDirection: 'row',
    justifyContent: 'center',
    paddingVertical: spacing.md,
    gap: spacing.xs,
  },
  previewDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
});
