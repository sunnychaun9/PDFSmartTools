import React, { useState, useCallback, useEffect, useRef } from 'react';
import { View, StyleSheet, ScrollView, Pressable, Animated, Image } from 'react-native';
import { launchImageLibrary, launchCamera } from 'react-native-image-picker';
import { SafeScreen, Header, Spacer } from '../../components/layout';
import { Button, Text, Icon, AppModal } from '../../components/ui';
import { ProgressBar } from '../../components/feedback';
import { useProGate, UpgradePromptModal } from '../../components/subscription';
import { colors, spacing, borderRadius, shadows } from '../../theme';
import {
  recognizeText,
  OcrResult,
  copyToClipboard,
  getWordCount,
  getCharacterCount,
  formatConfidence,
} from '../../services/textRecognition';
import { loadInterstitialAd, showInterstitialAd } from '../../services/adService';
import { useTheme } from '../../context';
import { shareText } from '../../services/shareService';
import { canUse, consume, getRemaining, FEATURES } from '../../services/usageLimitService';
import RNFS from 'react-native-fs';

type SelectedImage = {
  uri: string;
  localPath: string;
  fileName: string;
};

function OcrProgress({
  progress,
  progressText,
}: {
  progress: number;
  progressText: string;
}) {
  const { theme } = useTheme();

  return (
    <View style={[styles.progressCard, { backgroundColor: theme.surface }, shadows.card]}>
      <View style={styles.progressHeader}>
        <View style={[styles.progressSpinner, { backgroundColor: `${colors.ocrExtract}15` }]}>
          <Text style={{ fontSize: 24 }}>🔍</Text>
        </View>
        <View style={styles.progressInfo}>
          <Text variant="body" style={{ color: theme.textPrimary }}>Extracting Text</Text>
          <Text variant="caption" style={{ color: theme.textTertiary }}>{progressText}</Text>
        </View>
        <Text variant="h3" customColor={colors.ocrExtract}>{progress}%</Text>
      </View>
      <Spacer size="md" />
      <ProgressBar progress={progress} height={10} progressColor={colors.ocrExtract} />
    </View>
  );
}

function ResultCard({
  result,
  onCopy,
  onShare,
}: {
  result: OcrResult;
  onCopy: () => void;
  onShare: () => void;
}) {
  const { theme } = useTheme();
  const wordCount = getWordCount(result.text);
  const charCount = getCharacterCount(result.text);

  return (
    <View style={[styles.resultCardInner, { backgroundColor: theme.surface }, shadows.card]}>
      <View style={styles.resultIconContainer}>
        <Text style={{ fontSize: 48 }}>✅</Text>
      </View>
      <Spacer size="md" />
      <Text variant="h2" align="center" style={{ color: theme.textPrimary }}>
        Text Extracted!
      </Text>
      <Spacer size="lg" />

      <View style={styles.resultStats}>
        <View style={styles.resultStatItem}>
          <View style={[styles.statCircle, { backgroundColor: colors.infoLight }]}>
            <Text variant="caption" customColor={colors.info}>Words</Text>
          </View>
          <Text variant="h3" style={{ color: theme.textPrimary }}>{wordCount}</Text>
        </View>

        <View style={styles.resultStatItem}>
          <View style={[styles.statCircle, { backgroundColor: colors.successLight }]}>
            <Text variant="caption" customColor={colors.success}>Characters</Text>
          </View>
          <Text variant="h3" style={{ color: theme.textPrimary }}>{charCount}</Text>
        </View>

        <View style={styles.resultStatItem}>
          <View style={[styles.statCircle, { backgroundColor: `${colors.ocrExtract}20` }]}>
            <Text variant="caption" customColor={colors.ocrExtract}>Confidence</Text>
          </View>
          <Text variant="h3" customColor={colors.ocrExtract}>
            {formatConfidence(result.averageConfidence)}
          </Text>
        </View>
      </View>

      <Spacer size="lg" />

      {/* Extracted Text Preview */}
      <View style={[styles.textPreview, { backgroundColor: theme.surfaceVariant }]}>
        <ScrollView style={styles.textScrollView} nestedScrollEnabled>
          <Text variant="body" style={{ color: theme.textPrimary }}>
            {result.text || 'No text found in image'}
          </Text>
        </ScrollView>
      </View>

      <Spacer size="xl" />

      <View style={styles.resultActions}>
        <Button
          title="Copy to Clipboard"
          onPress={onCopy}
          fullWidth
          leftIcon={<Icon name="copy" size={18} color={colors.textOnPrimary} />}
        />
        <Spacer size="sm" />
        <Button
          title="Share Text"
          variant="outline"
          onPress={onShare}
          fullWidth
          leftIcon={<Icon name="share-2" size={18} color={colors.primary} />}
        />
      </View>
    </View>
  );
}

export default function OcrScreen() {
  const { isPro, navigateToUpgrade } = useProGate();
  const { theme } = useTheme();

  const [selectedImage, setSelectedImage] = useState<SelectedImage | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressText, setProgressText] = useState('');
  const [ocrResult, setOcrResult] = useState<OcrResult | null>(null);
  const [remainingUses, setRemainingUses] = useState<number>(Infinity);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [showSourceModal, setShowSourceModal] = useState(false);

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
    const remaining = await getRemaining(FEATURES.OCR_EXTRACT, isPro);
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

  const copyToLocalCache = async (uri: string, fileName: string): Promise<string> => {
    const timestamp = Date.now();
    const safeName = fileName.replace(/[^a-zA-Z0-9.-]/g, '_');
    const cachePath = `${RNFS.CachesDirectoryPath}/${timestamp}_${safeName}`;

    if (uri.startsWith('content://')) {
      await RNFS.copyFile(uri, cachePath);
    } else {
      const sourcePath = uri.startsWith('file://') ? uri.slice(7) : uri;
      await RNFS.copyFile(sourcePath, cachePath);
    }

    return cachePath;
  };

  const handleSelectFromGallery = useCallback(async () => {
    setShowSourceModal(false);
    try {
      const result = await launchImageLibrary({
        mediaType: 'photo',
        quality: 1,
        selectionLimit: 1,
      });

      if (result.didCancel || !result.assets || result.assets.length === 0) {
        return;
      }

      const asset = result.assets[0];
      if (!asset.uri) {
        throw new Error('No image URI returned');
      }

      const fileName = asset.fileName || 'image.jpg';
      const localPath = await copyToLocalCache(asset.uri, fileName);

      setSelectedImage({
        uri: asset.uri,
        localPath,
        fileName,
      });
      setOcrResult(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to select image';
      setErrorModal({ visible: true, title: 'Error', message });
    }
  }, []);

  const handleTakePhoto = useCallback(async () => {
    setShowSourceModal(false);
    try {
      const result = await launchCamera({
        mediaType: 'photo',
        quality: 1,
        saveToPhotos: false,
      });

      if (result.didCancel || !result.assets || result.assets.length === 0) {
        return;
      }

      const asset = result.assets[0];
      if (!asset.uri) {
        throw new Error('No image URI returned');
      }

      const fileName = asset.fileName || `photo_${Date.now()}.jpg`;
      const localPath = await copyToLocalCache(asset.uri, fileName);

      setSelectedImage({
        uri: asset.uri,
        localPath,
        fileName,
      });
      setOcrResult(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to capture photo';
      setErrorModal({ visible: true, title: 'Error', message });
    }
  }, []);

  const handleExtractText = useCallback(async () => {
    if (!selectedImage) {
      return;
    }

    // Check usage limit before proceeding
    const allowed = await canUse(FEATURES.OCR_EXTRACT, isPro);
    if (!allowed) {
      setShowUpgradeModal(true);
      return;
    }

    setIsProcessing(true);
    setProgress(0);
    setProgressText('Initializing...');
    setOcrResult(null);

    try {
      const result = await recognizeText(selectedImage.localPath, {
        onProgress: (progressInfo) => {
          setProgress(progressInfo.progress);
          setProgressText(progressInfo.status);
        },
        isPro,
      });

      setOcrResult(result);

      // Consume one usage after successful OCR
      await consume(FEATURES.OCR_EXTRACT, isPro);
      await refreshRemainingUses();

      await showInterstitialAd(isPro);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Text extraction failed';
      setErrorModal({ visible: true, title: 'OCR Failed', message });
    } finally {
      setIsProcessing(false);
    }
  }, [selectedImage, isPro, refreshRemainingUses]);

  const handleCopyText = useCallback(() => {
    if (!ocrResult) return;
    copyToClipboard(ocrResult.text);
    setSuccessModal({
      visible: true,
      message: 'Text copied to clipboard!',
    });
  }, [ocrResult]);

  const handleShareText = useCallback(async () => {
    if (!ocrResult) return;
    const result = await shareText(ocrResult.text, 'Extracted Text');
    if (!result.success && result.error) {
      setErrorModal({ visible: true, title: 'Share Failed', message: result.error });
    }
  }, [ocrResult]);

  const handleReset = useCallback(async () => {
    if (selectedImage) {
      try {
        await RNFS.unlink(selectedImage.localPath);
      } catch {
        // Ignore cleanup errors
      }
    }
    setSelectedImage(null);
    setOcrResult(null);
    setProgress(0);
    setProgressText('');
  }, [selectedImage]);

  // Empty state
  if (!selectedImage) {
    return (
      <SafeScreen>
        <Header title="Extract Text (OCR)" />
        <Animated.View style={[styles.emptyState, { opacity: fadeAnim }]}>
          <View style={[styles.emptyIconContainer, { backgroundColor: `${colors.ocrExtract}15` }]}>
            <Text style={styles.emptyIcon}>🔍</Text>
          </View>
          <Spacer size="lg" />
          <Text variant="h2" align="center" style={{ color: theme.textPrimary }}>
            Extract Text from Image
          </Text>
          <Spacer size="sm" />
          <Text
            variant="body"
            align="center"
            style={[styles.emptyDescription, { color: theme.textSecondary }]}
          >
            Use ML Kit to recognize and extract text from photos and images
          </Text>
          <Spacer size="xl" />
          <Button
            title="Select Image"
            onPress={() => setShowSourceModal(true)}
            leftIcon={<Icon name="image" size={20} color={colors.textOnPrimary} />}
          />
          {!isPro && remainingUses !== Infinity && (
            <View style={styles.remainingUsesEmpty}>
              <Text variant="caption" style={{ color: theme.textSecondary }}>
                Free extractions remaining today: {remainingUses}
              </Text>
            </View>
          )}
        </Animated.View>

        {/* Source Selection Modal */}
        <AppModal
          visible={showSourceModal}
          type="info"
          title="Select Image Source"
          message="Choose where to get the image from"
          onClose={() => setShowSourceModal(false)}
          buttons={[
            {
              text: 'Camera',
              variant: 'primary',
              onPress: handleTakePhoto,
            },
            {
              text: 'Gallery',
              variant: 'secondary',
              onPress: handleSelectFromGallery,
            },
            {
              text: 'Cancel',
              variant: 'secondary',
              onPress: () => setShowSourceModal(false),
            },
          ]}
        />

        <UpgradePromptModal
          visible={showUpgradeModal}
          title="Daily Limit Reached"
          message="You have used your free OCR extraction for today. Upgrade to Pro for unlimited access."
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
  if (ocrResult) {
    return (
      <SafeScreen>
        <Header title="Text Extracted" />
        <ScrollView style={styles.content} contentContainerStyle={styles.resultContent}>
          <ResultCard
            result={ocrResult}
            onCopy={handleCopyText}
            onShare={handleShareText}
          />
        </ScrollView>
        <View style={[styles.footer, { backgroundColor: theme.surface, borderTopColor: theme.border }]}>
          <Button
            title="Extract from Another Image"
            variant="outline"
            onPress={handleReset}
            fullWidth
          />
        </View>

        <AppModal
          visible={successModal.visible}
          type="success"
          title="Copied"
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

  // Main view - image selected, ready to process
  return (
    <SafeScreen>
      <Header title="Extract Text (OCR)" />
      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Image Preview Card */}
        <View style={[styles.imageCard, { backgroundColor: theme.surface }, shadows.card]}>
          <Image
            source={{ uri: selectedImage.uri }}
            style={styles.imagePreview}
            resizeMode="contain"
          />
          <View style={styles.imageInfo}>
            <View style={styles.imageDetails}>
              <Text variant="body" numberOfLines={1} style={{ color: theme.textPrimary }}>
                {selectedImage.fileName}
              </Text>
              <Text variant="caption" style={{ color: theme.textTertiary }}>
                Ready for text extraction
              </Text>
            </View>
            <Button
              title="Change"
              variant="ghost"
              size="sm"
              onPress={() => setShowSourceModal(true)}
            />
          </View>
        </View>

        <Spacer size="lg" />

        {/* Info Card */}
        <View style={[styles.infoCard, { backgroundColor: `${colors.ocrExtract}10` }]}>
          <Icon name="info" size={20} color={colors.ocrExtract} />
          <Text variant="bodySmall" style={{ color: theme.textSecondary, marginLeft: spacing.sm, flex: 1 }}>
            ML Kit will analyze the image and extract any visible text. Works best with clear, well-lit images.
          </Text>
        </View>

        <Spacer size="lg" />

        {isProcessing && <OcrProgress progress={progress} progressText={progressText} />}

        <Spacer size="xl" />
      </ScrollView>

      <View style={[styles.footer, { backgroundColor: theme.surface, borderTopColor: theme.border }]}>
        {!isPro && remainingUses !== Infinity && (
          <View style={styles.remainingUsesContainer}>
            <Text variant="caption" style={{ color: theme.textSecondary }}>
              Free extractions remaining today: {remainingUses}
            </Text>
          </View>
        )}
        <Button
          title={isProcessing ? 'Extracting...' : 'Extract Text'}
          onPress={handleExtractText}
          loading={isProcessing}
          disabled={isProcessing}
          fullWidth
          leftIcon={
            !isProcessing ? (
              <Icon name="type" size={20} color={colors.textOnPrimary} />
            ) : undefined
          }
        />
      </View>

      {/* Source Selection Modal */}
      <AppModal
        visible={showSourceModal}
        type="info"
        title="Select Image Source"
        message="Choose where to get the image from"
        onClose={() => setShowSourceModal(false)}
        buttons={[
          {
            text: 'Camera',
            variant: 'primary',
            onPress: handleTakePhoto,
          },
          {
            text: 'Gallery',
            variant: 'secondary',
            onPress: handleSelectFromGallery,
          },
          {
            text: 'Cancel',
            variant: 'secondary',
            onPress: () => setShowSourceModal(false),
          },
        ]}
      />

      <UpgradePromptModal
        visible={showUpgradeModal}
        title="Daily Limit Reached"
        message="You have used your free OCR extraction for today. Upgrade to Pro for unlimited access."
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
  remainingUsesEmpty: {
    marginTop: spacing.lg,
  },
  content: {
    flex: 1,
    padding: spacing.lg,
  },
  resultContent: {
    paddingBottom: spacing.xl,
  },
  imageCard: {
    borderRadius: borderRadius.xl,
    overflow: 'hidden',
  },
  imagePreview: {
    width: '100%',
    height: 200,
    backgroundColor: '#F1F5F9',
  },
  imageInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.lg,
  },
  imageDetails: {
    flex: 1,
  },
  infoCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: spacing.md,
    borderRadius: borderRadius.lg,
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
  statCircle: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
    marginBottom: spacing.xs,
  },
  textPreview: {
    width: '100%',
    maxHeight: 200,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
  },
  textScrollView: {
    maxHeight: 180,
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
});
