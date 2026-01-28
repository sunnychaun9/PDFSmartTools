import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  TextInput,
  Pressable,
  Animated,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeScreen, Header, Spacer } from '../../components/layout';
import { Button, Text, Icon, AppModal } from '../../components/ui';
import { ProgressBar } from '../../components/feedback';
import { colors, spacing, borderRadius, shadows } from '../../theme';
import {
  unlockPdf,
  validatePdf,
  moveUnlockedFile,
  formatFileSize,
  getErrorMessage,
  UnlockResult,
  UNLOCK_ERRORS,
} from '../../services/pdfUnlockService';
import { pickPdfFile, PickedFile, cleanupPickedFile } from '../../services/filePicker';
import { loadInterstitialAd, showInterstitialAd } from '../../services/adService';
import { useTheme, useSubscription, useRating } from '../../context';
import { addRecentFile } from '../../services/recentFilesService';
import { sharePdfFile } from '../../services/shareService';

// Password input component
function PasswordInput({
  value,
  onChangeText,
  placeholder,
  error,
  autoFocus = false,
  onSubmit,
}: {
  value: string;
  onChangeText: (text: string) => void;
  placeholder: string;
  error?: string;
  autoFocus?: boolean;
  onSubmit?: () => void;
}) {
  const { theme } = useTheme();
  const [isVisible, setIsVisible] = useState(false);

  return (
    <View style={styles.inputContainer}>
      <Text variant="bodySmall" style={[styles.inputLabel, { color: theme.textSecondary }]}>
        Enter PDF Password
      </Text>
      <View
        style={[
          styles.inputWrapper,
          { backgroundColor: theme.surface, borderColor: error ? colors.error : theme.border },
          error && styles.inputWrapperError,
        ]}
      >
        <Icon name="lock" size={20} color={theme.textTertiary} style={{ marginRight: spacing.sm }} />
        <TextInput
          style={[styles.textInput, { color: theme.textPrimary }]}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={theme.textTertiary}
          secureTextEntry={!isVisible}
          autoCapitalize="none"
          autoCorrect={false}
          autoFocus={autoFocus}
          returnKeyType="done"
          onSubmitEditing={onSubmit}
        />
        {value.length > 0 && (
          <Pressable
            style={styles.visibilityToggle}
            onPress={() => setIsVisible(!isVisible)}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Icon
              name={isVisible ? 'eye-off' : 'eye'}
              size={20}
              color={theme.textTertiary}
            />
          </Pressable>
        )}
      </View>
      {error && (
        <View style={styles.errorContainer}>
          <Icon name="alert-circle" size={14} color={colors.error} />
          <Text variant="caption" customColor={colors.error} style={styles.errorText}>
            {error}
          </Text>
        </View>
      )}
    </View>
  );
}

// Progress component
function UnlockProgress({
  progress,
  status,
}: {
  progress: number;
  status: string;
}) {
  const { theme } = useTheme();

  return (
    <View style={[styles.progressCard, { backgroundColor: theme.surface }, shadows.card]}>
      <View style={styles.progressHeader}>
        <View style={[styles.progressSpinner, { backgroundColor: `${colors.unlockPdf}15` }]}>
          <Text style={{ fontSize: 24 }}>🔓</Text>
        </View>
        <View style={styles.progressInfo}>
          <Text variant="body" style={{ color: theme.textPrimary }}>Unlocking PDF</Text>
          <Text variant="caption" style={{ color: theme.textTertiary }}>{status}</Text>
        </View>
        <Text variant="h3" customColor={colors.unlockPdf}>{progress}%</Text>
      </View>
      <Spacer size="md" />
      <ProgressBar progress={progress} height={10} color={colors.unlockPdf} />
    </View>
  );
}

// Result card component
function ResultCard({
  result,
  onSave,
  onShare,
  onOpen,
}: {
  result: UnlockResult;
  onSave: () => void;
  onShare: () => void;
  onOpen: () => void;
}) {
  const { theme } = useTheme();

  return (
    <View style={[styles.resultCardInner, { backgroundColor: theme.surface }, shadows.card]}>
      <View style={styles.resultIconContainer}>
        <Text style={{ fontSize: 48 }}>🔓</Text>
      </View>
      <Spacer size="md" />
      <Text variant="h2" align="center" style={{ color: theme.textPrimary }}>
        PDF Unlocked!
      </Text>
      <Spacer size="sm" />
      <Text variant="body" align="center" style={{ color: theme.textSecondary }}>
        Password protection has been removed
      </Text>
      <Spacer size="lg" />

      <View style={styles.resultStats}>
        <View style={styles.resultStatItem}>
          <Text variant="caption" style={{ color: theme.textTertiary }}>Pages</Text>
          <Text variant="h3" style={{ color: theme.textPrimary }}>{result.pageCount}</Text>
        </View>
        <View style={[styles.resultStatDivider, { backgroundColor: theme.border }]} />
        <View style={styles.resultStatItem}>
          <Text variant="caption" style={{ color: theme.textTertiary }}>Size</Text>
          <Text variant="h3" style={{ color: theme.textPrimary }}>
            {formatFileSize(result.unlockedSize)}
          </Text>
        </View>
        <View style={[styles.resultStatDivider, { backgroundColor: theme.border }]} />
        <View style={styles.resultStatItem}>
          <Text variant="caption" style={{ color: theme.textTertiary }}>Status</Text>
          <Text variant="h3" customColor={colors.success}>Open</Text>
        </View>
      </View>

      <Spacer size="lg" />

      <View style={[styles.securityBanner, { backgroundColor: colors.successLight }]}>
        <Icon name="check-circle" size={18} color={colors.success} />
        <Text variant="bodySmall" customColor={colors.success} style={{ marginLeft: spacing.sm }}>
          PDF is now accessible without a password
        </Text>
      </View>

      <Spacer size="xl" />

      <View style={styles.resultActions}>
        <Button
          title="Save to Downloads"
          onPress={onSave}
          fullWidth
          leftIcon={<Icon name="download" size={18} color={colors.textOnPrimary} />}
        />
        <Spacer size="sm" />
        <View style={styles.buttonRow}>
          <Button
            title="Open"
            variant="outline"
            onPress={onOpen}
            style={{ flex: 1, marginRight: spacing.sm }}
            leftIcon={<Icon name="eye" size={18} color={colors.primary} />}
          />
          <Button
            title="Share"
            variant="outline"
            onPress={onShare}
            style={{ flex: 1 }}
            leftIcon={<Icon name="share-2" size={18} color={colors.primary} />}
          />
        </View>
      </View>
    </View>
  );
}

export default function UnlockPdfScreen() {
  const { theme } = useTheme();
  const { isPro } = useSubscription();
  const { onSuccessfulAction } = useRating();

  // File state
  const [selectedFile, setSelectedFile] = useState<PickedFile | null>(null);
  const [filePageCount, setFilePageCount] = useState(0);
  const [isFileEncrypted, setIsFileEncrypted] = useState(false);

  // Password state
  const [password, setPassword] = useState('');
  const [passwordError, setPasswordError] = useState<string | undefined>();

  // Processing state
  const [isUnlocking, setIsUnlocking] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressStatus, setProgressStatus] = useState('');

  // Result state
  const [unlockResult, setUnlockResult] = useState<UnlockResult | null>(null);
  const [savedPath, setSavedPath] = useState<string | null>(null);

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
  const [infoModal, setInfoModal] = useState<{
    visible: boolean;
    title: string;
    message: string;
  }>({ visible: false, title: '', message: '' });

  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    loadInterstitialAd();
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 400,
      useNativeDriver: true,
    }).start();
  }, [fadeAnim]);

  const handleSelectFile = useCallback(async () => {
    try {
      // Reset state
      setUnlockResult(null);
      setSavedPath(null);
      setPassword('');
      setPasswordError(undefined);

      const file = await pickPdfFile();
      if (file) {
        try {
          const validation = await validatePdf(file.localPath);

          if (!validation.isEncrypted) {
            setInfoModal({
              visible: true,
              title: 'Not Protected',
              message: 'This PDF is not password-protected. No unlock needed.',
            });
            await cleanupPickedFile(file.localPath);
            return;
          }

          setSelectedFile(file);
          setFilePageCount(validation.pageCount);
          setIsFileEncrypted(validation.isEncrypted);
        } catch (err: any) {
          // If PDF is encrypted and we can't read page count, that's expected
          if (err.code === 'PDF_ENCRYPTED' || err.message?.includes('password')) {
            setSelectedFile(file);
            setFilePageCount(0); // Unknown until unlocked
            setIsFileEncrypted(true);
          } else {
            const message = err instanceof Error ? err.message : 'Invalid PDF file';
            setErrorModal({
              visible: true,
              title: 'Invalid PDF',
              message,
            });
            await cleanupPickedFile(file.localPath);
          }
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to select file';
      setErrorModal({ visible: true, title: 'Error', message });
    }
  }, []);

  const handleUnlock = useCallback(async () => {
    if (!selectedFile || !password) return;

    // Clear previous error
    setPasswordError(undefined);

    setIsUnlocking(true);
    setProgress(0);
    setProgressStatus('Initializing...');
    setUnlockResult(null);

    try {
      const result = await unlockPdf(selectedFile.localPath, {
        password,
        onProgress: (progressInfo) => {
          setProgress(progressInfo.progress);
          setProgressStatus(progressInfo.status);
        },
      });

      setUnlockResult(result);

      // Clear password from memory after successful unlock
      setPassword('');

      // Show ad
      await showInterstitialAd(isPro);
      onSuccessfulAction();
    } catch (err: any) {
      const errorCode = err.code || '';
      const message = getErrorMessage(errorCode, err.message);

      if (errorCode === UNLOCK_ERRORS.INVALID_PASSWORD) {
        setPasswordError(message);
      } else if (errorCode === UNLOCK_ERRORS.NOT_PROTECTED) {
        setInfoModal({
          visible: true,
          title: 'Not Protected',
          message: message,
        });
      } else {
        setErrorModal({ visible: true, title: 'Unlock Failed', message });
      }
    } finally {
      setIsUnlocking(false);
    }
  }, [selectedFile, password, isPro, onSuccessfulAction]);

  const handleSaveToDownloads = useCallback(async () => {
    if (!unlockResult || !selectedFile) return;

    try {
      const fileName = `${selectedFile.name.replace('.pdf', '')}_unlocked.pdf`;
      const newPath = await moveUnlockedFile(unlockResult.outputPath, fileName);

      setSavedPath(newPath);

      // Add to recent files
      await addRecentFile(
        fileName,
        newPath,
        unlockResult.unlockedSize,
        'created'
      );

      setSuccessModal({
        visible: true,
        message: `File saved to Downloads/PDFSmartTools:\n${fileName}`,
      });

      // Update result with new path
      setUnlockResult({
        ...unlockResult,
        outputPath: newPath,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save file';
      setErrorModal({ visible: true, title: 'Save Failed', message });
    }
  }, [unlockResult, selectedFile]);

  const handleShare = useCallback(async () => {
    if (!unlockResult) return;

    const result = await sharePdfFile(unlockResult.outputPath, 'Unlocked PDF');
    if (!result.success && result.error) {
      setErrorModal({ visible: true, title: 'Share Failed', message: result.error });
    }
  }, [unlockResult]);

  const handleOpen = useCallback(async () => {
    if (!unlockResult) return;

    // For now, share with "Open with" intent
    const result = await sharePdfFile(unlockResult.outputPath, 'Open PDF');
    if (!result.success && result.error) {
      setErrorModal({ visible: true, title: 'Open Failed', message: result.error });
    }
  }, [unlockResult]);

  const handleReset = useCallback(async () => {
    if (selectedFile) {
      await cleanupPickedFile(selectedFile.localPath);
    }
    setSelectedFile(null);
    setFilePageCount(0);
    setIsFileEncrypted(false);
    setUnlockResult(null);
    setSavedPath(null);
    setPassword('');
    setPasswordError(undefined);
    setProgress(0);
    setProgressStatus('');
  }, [selectedFile]);

  // Empty state - no file selected
  if (!selectedFile) {
    return (
      <SafeScreen>
        <Header title="Unlock PDF" />
        <Animated.View style={[styles.emptyState, { opacity: fadeAnim }]}>
          <View style={[styles.emptyIconContainer, { backgroundColor: `${colors.unlockPdf}15` }]}>
            <Text style={styles.emptyIcon}>🔓</Text>
          </View>
          <Spacer size="lg" />
          <Text variant="h2" align="center" style={{ color: theme.textPrimary }}>
            Remove PDF Password
          </Text>
          <Spacer size="sm" />
          <Text variant="body" align="center" style={[styles.emptyDescription, { color: theme.textSecondary }]}>
            Select a password-protected PDF to unlock it
          </Text>
          <Spacer size="md" />
          <View style={[styles.securityNote, { backgroundColor: `${colors.info}10` }]}>
            <Icon name="shield" size={16} color={colors.info} />
            <Text variant="caption" customColor={colors.info} style={{ marginLeft: spacing.sm, flex: 1 }}>
              You must know the correct password to unlock the PDF
            </Text>
          </View>
          <Spacer size="xl" />
          <Button
            title="Select Protected PDF"
            onPress={handleSelectFile}
            leftIcon={<Icon name="file-plus" size={20} color={colors.textOnPrimary} />}
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

        <AppModal
          visible={infoModal.visible}
          type="info"
          title={infoModal.title}
          message={infoModal.message}
          onClose={() => setInfoModal((prev) => ({ ...prev, visible: false }))}
          buttons={[
            {
              text: 'OK',
              variant: 'primary',
              onPress: () => setInfoModal((prev) => ({ ...prev, visible: false })),
            },
          ]}
        />
      </SafeScreen>
    );
  }

  // Result view - unlock successful
  if (unlockResult) {
    return (
      <SafeScreen>
        <Header title="Unlock Complete" />
        <ScrollView style={styles.content} contentContainerStyle={styles.resultContent}>
          <ResultCard
            result={unlockResult}
            onSave={handleSaveToDownloads}
            onShare={handleShare}
            onOpen={handleOpen}
          />
        </ScrollView>
        <View style={[styles.footer, { backgroundColor: theme.surface, borderTopColor: theme.border }]}>
          <Button
            title="Unlock Another PDF"
            variant="outline"
            onPress={handleReset}
            fullWidth
          />
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

  // Main view - file selected, enter password
  return (
    <SafeScreen>
      <Header title="Unlock PDF" />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          {/* File Info Card */}
          <View style={[styles.fileCard, { backgroundColor: theme.surface }, shadows.card]}>
            <View style={styles.fileInfo}>
              <View style={[styles.fileIconContainer, { backgroundColor: `${colors.unlockPdf}15` }]}>
                <Text style={{ fontSize: 24 }}>🔒</Text>
              </View>
              <View style={styles.fileDetails}>
                <Text variant="body" numberOfLines={1} style={{ color: theme.textPrimary }}>
                  {selectedFile.name}
                </Text>
                <Text variant="caption" style={{ color: theme.textTertiary }}>
                  {selectedFile.formattedSize} • Password protected
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

          {/* Password Section */}
          <Text variant="h3" style={{ color: theme.textPrimary }}>Enter Password</Text>
          <Spacer size="md" />

          <View style={[styles.passwordCard, { backgroundColor: theme.surface }, shadows.card]}>
            <PasswordInput
              value={password}
              onChangeText={(text) => {
                setPassword(text);
                setPasswordError(undefined);
              }}
              placeholder="Enter PDF password"
              error={passwordError}
              autoFocus
              onSubmit={handleUnlock}
            />
          </View>

          <Spacer size="lg" />

          {/* Info Card */}
          <View style={[styles.infoCard, { backgroundColor: `${colors.info}10` }]}>
            <Icon name="info" size={18} color={colors.info} />
            <View style={styles.infoContent}>
              <Text variant="bodySmall" customColor={colors.info}>
                The unlocked PDF will be saved as a new file. The original file will remain unchanged.
              </Text>
            </View>
          </View>

          {isUnlocking && (
            <>
              <Spacer size="lg" />
              <UnlockProgress progress={progress} status={progressStatus} />
            </>
          )}

          <Spacer size="xl" />
        </ScrollView>

        <View style={[styles.footer, { backgroundColor: theme.surface, borderTopColor: theme.border }]}>
          <Button
            title={isUnlocking ? 'Unlocking...' : 'Unlock PDF'}
            onPress={handleUnlock}
            loading={isUnlocking}
            disabled={isUnlocking || !password}
            fullWidth
            leftIcon={
              !isUnlocking ? (
                <Icon name="unlock" size={20} color={colors.textOnPrimary} />
              ) : undefined
            }
          />
        </View>
      </KeyboardAvoidingView>

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

      <AppModal
        visible={infoModal.visible}
        type="info"
        title={infoModal.title}
        message={infoModal.message}
        onClose={() => setInfoModal((prev) => ({ ...prev, visible: false }))}
        buttons={[
          {
            text: 'OK',
            variant: 'primary',
            onPress: () => setInfoModal((prev) => ({ ...prev, visible: false })),
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
  securityNote: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    borderRadius: borderRadius.md,
    maxWidth: 320,
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
  passwordCard: {
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
  },
  inputContainer: {
    marginBottom: spacing.xs,
  },
  inputLabel: {
    marginBottom: spacing.xs,
    fontWeight: '500',
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
  },
  inputWrapperError: {
    borderWidth: 2,
  },
  textInput: {
    flex: 1,
    paddingVertical: spacing.md,
    fontSize: 16,
  },
  visibilityToggle: {
    padding: spacing.xs,
  },
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.xs,
  },
  errorText: {
    marginLeft: spacing.xs,
  },
  infoCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
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
  securityBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    borderRadius: borderRadius.md,
    width: '100%',
  },
  resultActions: {
    width: '100%',
  },
  buttonRow: {
    flexDirection: 'row',
  },
  footer: {
    padding: spacing.lg,
    borderTopWidth: 1,
  },
});
