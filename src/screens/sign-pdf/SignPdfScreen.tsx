import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  Image,
  Animated,
  PanResponder,
  Dimensions,
} from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Pdf from 'react-native-pdf';
import { SafeScreen, Header, Spacer } from '../../components/layout';
import { Button, Text, Icon, AppModal } from '../../components/ui';
import { ProgressModal } from '../../components/feedback';
import { useProGate, UpgradePromptModal } from '../../components/subscription';
import { colors, spacing, borderRadius, shadows } from '../../theme';
import { EnhancedProgress, ProgressTracker, createInitialProgress } from '../../utils/progressUtils';
import { useTheme, useRating } from '../../context';
import { RootStackParamList } from '../../navigation/types';
import { pickPdfFile, PickedFile, cleanupPickedFile } from '../../services/filePicker';
import {
  loadSavedSignature,
  getSignatureDataUrl,
  SavedSignature,
} from '../../services/signatureService';
import {
  signPdf,
  moveSignedPdfToDownloads,
  getPdfPageCount,
  SigningResult,
} from '../../services/pdfSigner';
import { sharePdfFile } from '../../services/shareService';
import { loadInterstitialAd, showInterstitialAd } from '../../services/adService';
import { canUse, consume, getRemaining, FEATURES } from '../../services/usageLimitService';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const PDF_PREVIEW_WIDTH = SCREEN_WIDTH - spacing.lg * 2;
const PDF_PREVIEW_HEIGHT = PDF_PREVIEW_WIDTH * 1.4; // Approximate A4 ratio

type SignPdfRouteProp = RouteProp<RootStackParamList, 'SignPdf'>;
type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

const DEFAULT_SIGNATURE_SIZE = { width: 150, height: 60 };

export default function SignPdfScreen() {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<SignPdfRouteProp>();
  const { isPro, navigateToUpgrade } = useProGate();
  const { theme } = useTheme();
  const { onSuccessfulAction } = useRating();

  // State
  const [selectedFile, setSelectedFile] = useState<PickedFile | null>(null);
  const [savedSignature, setSavedSignature] = useState<SavedSignature | null>(null);
  const [pageCount, setPageCount] = useState(1);
  const [currentPage, setCurrentPage] = useState(0);
  const [signaturePosition, setSignaturePosition] = useState({
    x: PDF_PREVIEW_WIDTH / 2 - DEFAULT_SIGNATURE_SIZE.width / 2,
    y: PDF_PREVIEW_HEIGHT - DEFAULT_SIGNATURE_SIZE.height - 50,
  });
  const [signatureSize, setSignatureSize] = useState(DEFAULT_SIGNATURE_SIZE);
  const [isSigning, setIsSigning] = useState(false);
  const [enhancedProgress, setEnhancedProgress] = useState<EnhancedProgress | null>(null);
  const progressTrackerRef = useRef<ProgressTracker | null>(null);
  const [signingResult, setSigningResult] = useState<SigningResult | null>(null);
  const [remainingUses, setRemainingUses] = useState<number>(Infinity);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [isSignButtonDisabled, setIsSignButtonDisabled] = useState(false);

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
  const pan = useRef(new Animated.ValueXY({ x: signaturePosition.x, y: signaturePosition.y })).current;

  // Pan responder for dragging signature
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        pan.setOffset({
          x: (pan.x as any)._value,
          y: (pan.y as any)._value,
        });
      },
      onPanResponderMove: Animated.event([null, { dx: pan.x, dy: pan.y }], {
        useNativeDriver: false,
      }),
      onPanResponderRelease: () => {
        pan.flattenOffset();
        // Clamp position within bounds
        const newX = Math.max(0, Math.min((pan.x as any)._value, PDF_PREVIEW_WIDTH - signatureSize.width));
        const newY = Math.max(0, Math.min((pan.y as any)._value, PDF_PREVIEW_HEIGHT - signatureSize.height));
        pan.setValue({ x: newX, y: newY });
        setSignaturePosition({ x: newX, y: newY });
      },
    })
  ).current;

  const refreshRemainingUses = useCallback(async () => {
    const remaining = await getRemaining(FEATURES.PDF_SIGN, isPro);
    setRemainingUses(remaining);
  }, [isPro]);

  // Load saved signature on mount or when returning from create screen
  useEffect(() => {
    const loadSignature = async () => {
      // Check if signature was just created
      if (route.params?.signatureBase64) {
        const sig = await loadSavedSignature();
        setSavedSignature(sig);
      } else {
        const sig = await loadSavedSignature();
        setSavedSignature(sig);
      }
    };
    loadSignature();
    loadInterstitialAd();
    refreshRemainingUses();
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 400,
      useNativeDriver: true,
    }).start();
  }, [fadeAnim, route.params?.signatureBase64, refreshRemainingUses]);

  const handleSelectFile = useCallback(async () => {
    try {
      const file = await pickPdfFile();
      if (file) {
        setSelectedFile(file);
        setSigningResult(null);

        // Get page count
        const count = await getPdfPageCount(file.localPath);
        setPageCount(count);
        setCurrentPage(0);

        // Reset signature position
        setSignaturePosition({
          x: PDF_PREVIEW_WIDTH / 2 - DEFAULT_SIGNATURE_SIZE.width / 2,
          y: PDF_PREVIEW_HEIGHT - DEFAULT_SIGNATURE_SIZE.height - 50,
        });
        pan.setValue({
          x: PDF_PREVIEW_WIDTH / 2 - DEFAULT_SIGNATURE_SIZE.width / 2,
          y: PDF_PREVIEW_HEIGHT - DEFAULT_SIGNATURE_SIZE.height - 50,
        });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to select file';
      setErrorModal({ visible: true, title: 'Error', message });
    }
  }, [pan]);

  const handleCreateSignature = useCallback(() => {
    navigation.navigate('SignatureCreate', { returnTo: 'SignPdf' });
  }, [navigation]);

  const handleSignPdf = useCallback(async () => {
    if (!selectedFile || !savedSignature) {
      return;
    }

    // Prevent double tap
    if (isSignButtonDisabled) {
      return;
    }
    setIsSignButtonDisabled(true);

    // Check usage limit
    const allowed = await canUse(FEATURES.PDF_SIGN, isPro);
    if (!allowed) {
      setShowUpgradeModal(true);
      setIsSignButtonDisabled(false);
      return;
    }

    setIsSigning(true);
    // Signing usually processes the target page and generates output
    progressTrackerRef.current = new ProgressTracker(pageCount);
    setEnhancedProgress(createInitialProgress(pageCount, 'Initializing...'));

    try {
      // Calculate actual position on PDF page
      // The preview dimensions need to be scaled to actual PDF page dimensions
      // For simplicity, we'll use a scale factor based on standard PDF dimensions
      const scaleX = 595 / PDF_PREVIEW_WIDTH; // A4 width in points
      const scaleY = 842 / PDF_PREVIEW_HEIGHT; // A4 height in points

      const result = await signPdf(selectedFile.localPath, {
        signatureBase64: savedSignature.base64,
        position: {
          x: signaturePosition.x * scaleX,
          y: signaturePosition.y * scaleY,
          width: signatureSize.width * scaleX,
          height: signatureSize.height * scaleY,
          pageNumber: currentPage,
        },
        addWatermark: !isPro, // Add watermark for free users
        onProgress: (progressInfo) => {
          if (progressTrackerRef.current) {
            const currentPageNum = Math.max(1, Math.ceil((progressInfo.progress / 100) * pageCount));
            const progress = progressTrackerRef.current.update(
              currentPageNum,
              progressInfo.status || `Processing page ${currentPageNum} of ${pageCount}...`
            );
            setEnhancedProgress(progress);
          }
        },
      });

      setSigningResult(result);

      // Consume usage after successful signing
      await consume(FEATURES.PDF_SIGN, isPro);
      await refreshRemainingUses();

      await showInterstitialAd(isPro);
      onSuccessfulAction();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Signing failed';
      setErrorModal({ visible: true, title: 'Signing Failed', message });
    } finally {
      setIsSigning(false);
      setIsSignButtonDisabled(false);
    }
  }, [
    selectedFile,
    savedSignature,
    isPro,
    signaturePosition,
    signatureSize,
    currentPage,
    isSignButtonDisabled,
    refreshRemainingUses,
    onSuccessfulAction,
  ]);

  const handleSaveToDownloads = useCallback(async () => {
    if (!signingResult) return;

    try {
      const baseName = selectedFile?.name.replace('.pdf', '') || 'document';
      const savedPath = await moveSignedPdfToDownloads(
        signingResult.outputPath,
        `${baseName}_signed.pdf`
      );
      setSuccessModal({
        visible: true,
        message: `Signed PDF saved to Downloads:\n${savedPath.split('/').pop()}`,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save file';
      setErrorModal({ visible: true, title: 'Error', message });
    }
  }, [signingResult, selectedFile]);

  const handleShare = useCallback(async () => {
    if (!signingResult) return;

    const result = await sharePdfFile(signingResult.outputPath, 'Signed PDF');
    if (!result.success && result.error) {
      setErrorModal({ visible: true, title: 'Share Failed', message: result.error });
    }
  }, [signingResult]);

  const handleReset = useCallback(async () => {
    if (selectedFile) {
      await cleanupPickedFile(selectedFile.localPath);
    }
    setSelectedFile(null);
    setSigningResult(null);
    setEnhancedProgress(null);
    setCurrentPage(0);
  }, [selectedFile]);

  const handlePageChange = useCallback(
    (direction: 'prev' | 'next') => {
      if (direction === 'prev' && currentPage > 0) {
        setCurrentPage(currentPage - 1);
      } else if (direction === 'next' && currentPage < pageCount - 1) {
        setCurrentPage(currentPage + 1);
      }
    },
    [currentPage, pageCount]
  );

  const handleResizeSignature = useCallback((scale: number) => {
    setSignatureSize((prev) => ({
      width: Math.max(50, Math.min(300, prev.width * scale)),
      height: Math.max(20, Math.min(120, prev.height * scale)),
    }));
  }, []);

  // Empty state - no PDF selected and no signature
  if (!selectedFile && !savedSignature) {
    return (
      <SafeScreen>
        <Header title="Sign PDF" />
        <Animated.View style={[styles.emptyState, { opacity: fadeAnim }]}>
          <View style={[styles.emptyIconContainer, { backgroundColor: `${colors.signPdf}15` }]}>
            <Text style={styles.emptyIcon}>✍️</Text>
          </View>
          <Spacer size="lg" />
          <Text variant="h2" align="center" style={{ color: theme.textPrimary }}>
            Sign PDF Documents
          </Text>
          <Spacer size="sm" />
          <Text
            variant="body"
            align="center"
            style={[styles.emptyDescription, { color: theme.textSecondary }]}
          >
            Create your signature first, then place it on any PDF document
          </Text>
          <Spacer size="xl" />
          <Button
            title="Create Signature"
            onPress={handleCreateSignature}
            leftIcon={<Icon name="plus" size={20} color={colors.textOnPrimary} />}
          />
        </Animated.View>

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

  // Empty state - has signature but no PDF selected
  if (!selectedFile) {
    return (
      <SafeScreen>
        <Header title="Sign PDF" />
        <Animated.View style={[styles.emptyState, { opacity: fadeAnim }]}>
          <View style={[styles.emptyIconContainer, { backgroundColor: `${colors.signPdf}15` }]}>
            <Text style={styles.emptyIcon}>📄</Text>
          </View>
          <Spacer size="lg" />
          <Text variant="h2" align="center" style={{ color: theme.textPrimary }}>
            Select a PDF to Sign
          </Text>
          <Spacer size="sm" />
          <Text
            variant="body"
            align="center"
            style={[styles.emptyDescription, { color: theme.textSecondary }]}
          >
            Choose a PDF document to add your signature
          </Text>
          <Spacer size="lg" />

          {/* Saved signature preview */}
          <View style={[styles.signaturePreviewCard, { backgroundColor: theme.surface }]}>
            <Text variant="caption" style={{ color: theme.textSecondary }}>
              Your Signature
            </Text>
            <Spacer size="sm" />
            <Image
              source={{ uri: getSignatureDataUrl(savedSignature!.base64) }}
              style={styles.signaturePreviewSmall}
              resizeMode="contain"
            />
            <Spacer size="sm" />
            <Button
              title="Change Signature"
              variant="ghost"
              size="sm"
              onPress={handleCreateSignature}
            />
          </View>

          <Spacer size="xl" />
          <Button
            title="Select PDF File"
            onPress={handleSelectFile}
            leftIcon={<Icon name="file-plus" size={20} color={colors.textOnPrimary} />}
          />
          {!isPro && remainingUses !== Infinity && (
            <View style={styles.remainingUsesEmpty}>
              <Text variant="caption" style={{ color: theme.textSecondary }}>
                Free signatures remaining today: {remainingUses}
              </Text>
            </View>
          )}
        </Animated.View>

        <UpgradePromptModal
          visible={showUpgradeModal}
          title="Daily Limit Reached"
          message="You have used your free PDF signing for today. Upgrade to Pro for unlimited signing without watermarks."
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
  if (signingResult) {
    return (
      <SafeScreen>
        <Header title="PDF Signed" />
        <ScrollView style={styles.content} contentContainerStyle={styles.resultContent}>
          <View style={[styles.resultCard, { backgroundColor: theme.surface }, shadows.card]}>
            <View style={styles.resultIconContainer}>
              <Text style={{ fontSize: 48 }}>✅</Text>
            </View>
            <Spacer size="md" />
            <Text variant="h2" align="center" style={{ color: theme.textPrimary }}>
              PDF Signed Successfully!
            </Text>
            <Spacer size="lg" />

            <View style={styles.resultStats}>
              <View style={styles.resultStatItem}>
                <Text variant="caption" style={{ color: theme.textTertiary }}>
                  Pages
                </Text>
                <Text variant="h3" style={{ color: theme.textPrimary }}>
                  {signingResult.pageCount}
                </Text>
              </View>
              <View style={styles.resultStatItem}>
                <Text variant="caption" style={{ color: theme.textTertiary }}>
                  Signed Page
                </Text>
                <Text variant="h3" customColor={colors.signPdf}>
                  {signingResult.signedPage}
                </Text>
              </View>
              <View style={styles.resultStatItem}>
                <Text variant="caption" style={{ color: theme.textTertiary }}>
                  Size
                </Text>
                <Text variant="h3" style={{ color: theme.textPrimary }}>
                  {signingResult.formattedFileSize}
                </Text>
              </View>
            </View>

            {!isPro && (
              <>
                <Spacer size="lg" />
                <View style={[styles.watermarkNotice, { backgroundColor: colors.warningLight }]}>
                  <Icon name="info" size={16} color={colors.warning} />
                  <Text
                    variant="caption"
                    style={{ color: colors.warningDark, marginLeft: spacing.sm, flex: 1 }}
                  >
                    A watermark was added to this PDF. Upgrade to Pro to remove watermarks.
                  </Text>
                </View>
              </>
            )}

            <Spacer size="xl" />

            <View style={styles.resultActions}>
              <Button
                title="Save to Downloads"
                onPress={handleSaveToDownloads}
                fullWidth
                leftIcon={<Icon name="download" size={18} color={colors.textOnPrimary} />}
              />
              <Spacer size="sm" />
              <Button
                title="Share"
                variant="outline"
                onPress={handleShare}
                fullWidth
                leftIcon={<Icon name="share-2" size={18} color={colors.primary} />}
              />
            </View>
          </View>
        </ScrollView>

        <View
          style={[styles.footer, { backgroundColor: theme.surface, borderTopColor: theme.border }]}
        >
          <Button title="Sign Another PDF" variant="outline" onPress={handleReset} fullWidth />
        </View>

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

  // Main view - PDF selected, ready to place signature
  return (
    <SafeScreen>
      <Header title="Place Signature" />
      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* File info */}
        <View style={[styles.fileCard, { backgroundColor: theme.surface }, shadows.card]}>
          <View style={styles.fileInfo}>
            <View style={[styles.fileIconContainer, { backgroundColor: `${colors.signPdf}15` }]}>
              <Text style={{ fontSize: 24 }}>📄</Text>
            </View>
            <View style={styles.fileDetails}>
              <Text variant="body" numberOfLines={1} style={{ color: theme.textPrimary }}>
                {selectedFile.name}
              </Text>
              <Text variant="caption" style={{ color: theme.textTertiary }}>
                {selectedFile.formattedSize} • {pageCount} page{pageCount > 1 ? 's' : ''}
              </Text>
            </View>
            <Button title="Change" variant="ghost" size="sm" onPress={handleSelectFile} />
          </View>
        </View>

        <Spacer size="lg" />

        {/* Page navigation */}
        {pageCount > 1 && (
          <>
            <View style={styles.pageNavigation}>
              <Button
                title=""
                variant="outline"
                size="sm"
                onPress={() => handlePageChange('prev')}
                disabled={currentPage === 0}
                leftIcon={<Icon name="chevron-left" size={20} color={colors.primary} />}
              />
              <Text variant="body" style={{ color: theme.textPrimary }}>
                Page {currentPage + 1} of {pageCount}
              </Text>
              <Button
                title=""
                variant="outline"
                size="sm"
                onPress={() => handlePageChange('next')}
                disabled={currentPage === pageCount - 1}
                leftIcon={<Icon name="chevron-right" size={20} color={colors.primary} />}
              />
            </View>
            <Spacer size="md" />
          </>
        )}

        {/* PDF Preview with signature overlay */}
        <View
          style={[
            styles.pdfPreviewContainer,
            { backgroundColor: theme.surfaceVariant, borderColor: theme.border },
          ]}
        >
          <Pdf
            source={{ uri: `file://${selectedFile.localPath}` }}
            page={currentPage + 1}
            singlePage
            style={styles.pdfPreview}
            onError={(error: any) => {
              setErrorModal({
                visible: true,
                title: 'PDF Error',
                message: error?.message || 'Failed to load PDF',
              });
            }}
          />

          {/* Draggable signature overlay */}
          {savedSignature && (
            <Animated.View
              style={[
                styles.signatureOverlay,
                {
                  transform: [{ translateX: pan.x }, { translateY: pan.y }],
                  width: signatureSize.width,
                  height: signatureSize.height,
                },
              ]}
              {...panResponder.panHandlers}
            >
              <Image
                source={{ uri: getSignatureDataUrl(savedSignature.base64) }}
                style={styles.signatureImage}
                resizeMode="contain"
              />
              <View style={styles.resizeHandle}>
                <Text style={{ fontSize: 10 }}>⤡</Text>
              </View>
            </Animated.View>
          )}
        </View>

        <Spacer size="md" />

        {/* Signature size controls */}
        <View style={styles.sizeControls}>
          <Text variant="caption" style={{ color: theme.textSecondary }}>
            Signature Size:
          </Text>
          <View style={styles.sizeButtons}>
            <Button
              title="Smaller"
              variant="ghost"
              size="sm"
              onPress={() => handleResizeSignature(0.8)}
            />
            <Button
              title="Larger"
              variant="ghost"
              size="sm"
              onPress={() => handleResizeSignature(1.2)}
            />
          </View>
        </View>

        <Spacer size="md" />

        {/* Info hint */}
        <View style={[styles.infoCard, { backgroundColor: `${colors.signPdf}10` }]}>
          <Icon name="info" size={20} color={colors.signPdf} />
          <Text
            variant="bodySmall"
            style={{ color: theme.textSecondary, marginLeft: spacing.sm, flex: 1 }}
          >
            Drag the signature to position it on the page. Use the size buttons to adjust.
          </Text>
        </View>

        <Spacer size="xl" />
      </ScrollView>

      <View
        style={[styles.footer, { backgroundColor: theme.surface, borderTopColor: theme.border }]}
      >
        {!isPro && remainingUses !== Infinity && (
          <View style={styles.remainingUsesContainer}>
            <Text variant="caption" style={{ color: theme.textSecondary }}>
              Free signatures remaining today: {remainingUses}
            </Text>
          </View>
        )}
        <Button
          title={isSigning ? 'Signing...' : 'Sign & Save PDF'}
          onPress={handleSignPdf}
          loading={isSigning}
          disabled={isSigning || !savedSignature || isSignButtonDisabled}
          fullWidth
          leftIcon={
            !isSigning ? <Icon name="check" size={20} color={colors.textOnPrimary} /> : undefined
          }
        />
      </View>

      <UpgradePromptModal
        visible={showUpgradeModal}
        title="Daily Limit Reached"
        message="You have used your free PDF signing for today. Upgrade to Pro for unlimited signing without watermarks."
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

      <ProgressModal
        visible={isSigning}
        title="Signing PDF"
        progress={enhancedProgress}
        color={colors.signPdf}
        icon="✍️"
        cancelable={false}
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
  signaturePreviewCard: {
    padding: spacing.lg,
    borderRadius: borderRadius.lg,
    alignItems: 'center',
  },
  signaturePreviewSmall: {
    width: 150,
    height: 60,
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
  pageNavigation: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  pdfPreviewContainer: {
    width: PDF_PREVIEW_WIDTH,
    height: PDF_PREVIEW_HEIGHT,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    overflow: 'hidden',
    position: 'relative',
  },
  pdfPreview: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  signatureOverlay: {
    position: 'absolute',
    borderWidth: 2,
    borderColor: colors.signPdf,
    borderStyle: 'dashed',
    backgroundColor: 'rgba(255, 255, 255, 0.8)',
    borderRadius: borderRadius.sm,
  },
  signatureImage: {
    width: '100%',
    height: '100%',
  },
  resizeHandle: {
    position: 'absolute',
    bottom: -8,
    right: -8,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.signPdf,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sizeControls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sizeButtons: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  infoCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: spacing.md,
    borderRadius: borderRadius.lg,
  },
  resultCard: {
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
    justifyContent: 'space-around',
    width: '100%',
  },
  resultStatItem: {
    alignItems: 'center',
  },
  resultActions: {
    width: '100%',
  },
  watermarkNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    borderRadius: borderRadius.lg,
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
