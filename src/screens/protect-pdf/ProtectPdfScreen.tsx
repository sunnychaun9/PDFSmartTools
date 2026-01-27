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
import { useProGate, UpgradePromptModal } from '../../components/subscription';
import { colors, spacing, borderRadius, shadows } from '../../theme';
import {
  protectPdf,
  validatePdf,
  validatePassword,
  validatePasswordMatch,
  moveProtectedFile,
  formatFileSize,
  ProtectionResult,
} from '../../services/pdfProtectorService';
import { pickPdfFile, PickedFile, cleanupPickedFile } from '../../services/filePicker';
import { loadInterstitialAd, showInterstitialAd } from '../../services/adService';
import { useTheme } from '../../context';
import { addRecentFile } from '../../services/recentFilesService';
import { sharePdfFile } from '../../services/shareService';
import { canUse, consume, getRemaining, FEATURES } from '../../services/usageLimitService';

// Password input component with validation
function PasswordInput({
  label,
  value,
  onChangeText,
  placeholder,
  error,
  showToggle = true,
  autoFocus = false,
}: {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  placeholder: string;
  error?: string;
  showToggle?: boolean;
  autoFocus?: boolean;
}) {
  const { theme } = useTheme();
  const [isVisible, setIsVisible] = useState(false);

  return (
    <View style={styles.inputContainer}>
      <Text variant="bodySmall" style={[styles.inputLabel, { color: theme.textSecondary }]}>
        {label}
      </Text>
      <View
        style={[
          styles.inputWrapper,
          { backgroundColor: theme.surface, borderColor: error ? colors.error : theme.border },
          error && styles.inputWrapperError,
        ]}
      >
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
        />
        {showToggle && value.length > 0 && (
          <Pressable
            style={styles.visibilityToggle}
            onPress={() => setIsVisible(!isVisible)}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Icon
              name={isVisible ? 'eye' : 'eye'}
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

// Password strength indicator
function PasswordStrength({ password }: { password: string }) {
  const { theme } = useTheme();

  const getStrength = (): { level: number; label: string; color: string } => {
    if (password.length === 0) return { level: 0, label: '', color: theme.border };
    if (password.length < 6) return { level: 1, label: 'Too short', color: colors.error };
    if (password.length < 8) return { level: 2, label: 'Weak', color: colors.warning };

    const hasLetter = /[a-zA-Z]/.test(password);
    const hasNumber = /[0-9]/.test(password);
    const hasSpecial = /[!@#$%^&*(),.?":{}|<>]/.test(password);
    const hasUpper = /[A-Z]/.test(password);
    const hasLower = /[a-z]/.test(password);

    const score = [hasLetter, hasNumber, hasSpecial, hasUpper && hasLower].filter(Boolean).length;

    if (score >= 3 && password.length >= 10) return { level: 4, label: 'Strong', color: colors.success };
    if (score >= 2) return { level: 3, label: 'Good', color: colors.info };
    return { level: 2, label: 'Fair', color: colors.warning };
  };

  const strength = getStrength();

  if (password.length === 0) return null;

  return (
    <View style={styles.strengthContainer}>
      <View style={styles.strengthBars}>
        {[1, 2, 3, 4].map((level) => (
          <View
            key={level}
            style={[
              styles.strengthBar,
              { backgroundColor: level <= strength.level ? strength.color : theme.border },
            ]}
          />
        ))}
      </View>
      <Text variant="caption" customColor={strength.color}>
        {strength.label}
      </Text>
    </View>
  );
}

// Progress component
function ProtectionProgress({
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
        <View style={[styles.progressSpinner, { backgroundColor: `${colors.primary}15` }]}>
          <Text style={{ fontSize: 24 }}>🔐</Text>
        </View>
        <View style={styles.progressInfo}>
          <Text variant="body" style={{ color: theme.textPrimary }}>Protecting PDF</Text>
          <Text variant="caption" style={{ color: theme.textTertiary }}>{status}</Text>
        </View>
        <Text variant="h3" customColor={colors.primary}>{progress}%</Text>
      </View>
      <Spacer size="md" />
      <ProgressBar progress={progress} height={10} />
    </View>
  );
}

// Result card component
function ResultCard({
  result,
  onSave,
  onShare,
}: {
  result: ProtectionResult;
  onSave: () => void;
  onShare: () => void;
}) {
  const { theme } = useTheme();

  return (
    <View style={[styles.resultCardInner, { backgroundColor: theme.surface }, shadows.card]}>
      <View style={styles.resultIconContainer}>
        <Text style={{ fontSize: 48 }}>🔒</Text>
      </View>
      <Spacer size="md" />
      <Text variant="h2" align="center" style={{ color: theme.textPrimary }}>
        PDF Protected!
      </Text>
      <Spacer size="sm" />
      <Text variant="body" align="center" style={{ color: theme.textSecondary }}>
        Your PDF is now secured with AES-256 encryption
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
            {formatFileSize(result.protectedSize)}
          </Text>
        </View>
        <View style={[styles.resultStatDivider, { backgroundColor: theme.border }]} />
        <View style={styles.resultStatItem}>
          <Text variant="caption" style={{ color: theme.textTertiary }}>Security</Text>
          <Text variant="h3" customColor={colors.success}>AES-256</Text>
        </View>
      </View>

      <Spacer size="lg" />

      <View style={[styles.securityBanner, { backgroundColor: colors.successLight }]}>
        <Icon name="check-circle" size={18} color={colors.success} />
        <Text variant="bodySmall" customColor={colors.success} style={{ marginLeft: spacing.sm }}>
          Password protection applied successfully
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

export default function ProtectPdfScreen() {
  const { isPro, navigateToUpgrade } = useProGate();
  const { theme } = useTheme();

  // File state
  const [selectedFile, setSelectedFile] = useState<PickedFile | null>(null);
  const [filePageCount, setFilePageCount] = useState(0);

  // Password state
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState<string | undefined>();
  const [confirmError, setConfirmError] = useState<string | undefined>();

  // Processing state
  const [isProtecting, setIsProtecting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressStatus, setProgressStatus] = useState('');

  // Result state
  const [protectionResult, setProtectionResult] = useState<ProtectionResult | null>(null);

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
    const remaining = await getRemaining(FEATURES.PDF_PROTECT, isPro);
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

  // Validate password on change
  const handlePasswordChange = useCallback((text: string) => {
    setPassword(text);
    if (text.length > 0) {
      const validation = validatePassword(text);
      setPasswordError(validation.isValid ? undefined : validation.error);
    } else {
      setPasswordError(undefined);
    }
    // Re-validate confirm password match
    if (confirmPassword.length > 0) {
      const matchValidation = validatePasswordMatch(text, confirmPassword);
      setConfirmError(matchValidation.isValid ? undefined : matchValidation.error);
    }
  }, [confirmPassword]);

  // Validate confirm password on change
  const handleConfirmPasswordChange = useCallback((text: string) => {
    setConfirmPassword(text);
    if (text.length > 0) {
      const validation = validatePasswordMatch(password, text);
      setConfirmError(validation.isValid ? undefined : validation.error);
    } else {
      setConfirmError(undefined);
    }
  }, [password]);

  const handleSelectFile = useCallback(async () => {
    try {
      setProtectionResult(null);
      setPassword('');
      setConfirmPassword('');
      setPasswordError(undefined);
      setConfirmError(undefined);

      const file = await pickPdfFile();
      if (file) {
        // Validate the PDF
        try {
          const validation = await validatePdf(file.localPath);

          if (validation.isEncrypted) {
            setErrorModal({
              visible: true,
              title: 'Already Protected',
              message: 'This PDF is already password protected. Please select a different file.',
            });
            await cleanupPickedFile(file.localPath);
            return;
          }

          setSelectedFile(file);
          setFilePageCount(validation.pageCount);
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Invalid PDF file';
          setErrorModal({
            visible: true,
            title: 'Invalid PDF',
            message,
          });
          await cleanupPickedFile(file.localPath);
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to select file';
      setErrorModal({ visible: true, title: 'Error', message });
    }
  }, []);

  const handleProtect = useCallback(async () => {
    if (!selectedFile) return;

    // Validate password
    const passwordValidation = validatePassword(password);
    if (!passwordValidation.isValid) {
      setPasswordError(passwordValidation.error);
      return;
    }

    // Validate passwords match
    const matchValidation = validatePasswordMatch(password, confirmPassword);
    if (!matchValidation.isValid) {
      setConfirmError(matchValidation.error);
      return;
    }

    // Check usage limit
    const allowed = await canUse(FEATURES.PDF_PROTECT, isPro);
    if (!allowed) {
      setShowUpgradeModal(true);
      return;
    }

    setIsProtecting(true);
    setProgress(0);
    setProgressStatus('Initializing...');
    setProtectionResult(null);

    try {
      const result = await protectPdf(selectedFile.localPath, {
        password,
        onProgress: (progressInfo) => {
          setProgress(progressInfo.progress);
          setProgressStatus(progressInfo.status);
        },
        isPro,
      });

      setProtectionResult(result);

      // Consume usage
      await consume(FEATURES.PDF_PROTECT, isPro);
      await refreshRemainingUses();

      // Show ad
      await showInterstitialAd(isPro);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Protection failed';
      setErrorModal({ visible: true, title: 'Protection Failed', message });
    } finally {
      setIsProtecting(false);
    }
  }, [selectedFile, password, confirmPassword, isPro, refreshRemainingUses]);

  const handleSaveToDownloads = useCallback(async () => {
    if (!protectionResult || !selectedFile) return;

    try {
      const fileName = `${selectedFile.name.replace('.pdf', '')}_protected.pdf`;
      const savedPath = await moveProtectedFile(protectionResult.outputPath, fileName);

      // Add to recent files
      await addRecentFile(
        fileName,
        savedPath,
        protectionResult.protectedSize,
        'created'
      );

      setSuccessModal({
        visible: true,
        message: `File saved to Downloads:\n${fileName}`,
      });

      // Update result with new path
      setProtectionResult({
        ...protectionResult,
        outputPath: savedPath,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save file';
      setErrorModal({ visible: true, title: 'Save Failed', message });
    }
  }, [protectionResult, selectedFile]);

  const handleShare = useCallback(async () => {
    if (!protectionResult) return;

    const result = await sharePdfFile(protectionResult.outputPath, 'Protected PDF');
    if (!result.success && result.error) {
      setErrorModal({ visible: true, title: 'Share Failed', message: result.error });
    }
  }, [protectionResult]);

  const handleReset = useCallback(async () => {
    if (selectedFile) {
      await cleanupPickedFile(selectedFile.localPath);
    }
    setSelectedFile(null);
    setFilePageCount(0);
    setProtectionResult(null);
    setPassword('');
    setConfirmPassword('');
    setPasswordError(undefined);
    setConfirmError(undefined);
    setProgress(0);
    setProgressStatus('');
  }, [selectedFile]);

  const isFormValid = password.length >= 6 && confirmPassword === password && !passwordError && !confirmError;

  // Empty state
  if (!selectedFile) {
    return (
      <SafeScreen>
        <Header title="Protect PDF" />
        <Animated.View style={[styles.emptyState, { opacity: fadeAnim }]}>
          <View style={[styles.emptyIconContainer, { backgroundColor: `${colors.success}15` }]}>
            <Text style={styles.emptyIcon}>🔐</Text>
          </View>
          <Spacer size="lg" />
          <Text variant="h2" align="center" style={{ color: theme.textPrimary }}>
            Password Protect PDF
          </Text>
          <Spacer size="sm" />
          <Text variant="body" align="center" style={[styles.emptyDescription, { color: theme.textSecondary }]}>
            Secure your PDF with AES-256 encryption
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
          message="You have used all your free PDF protections for today. Upgrade to Pro for unlimited access."
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
  if (protectionResult) {
    return (
      <SafeScreen>
        <Header title="Protection Complete" />
        <ScrollView style={styles.content} contentContainerStyle={styles.resultContent}>
          <ResultCard
            result={protectionResult}
            onSave={handleSaveToDownloads}
            onShare={handleShare}
          />
        </ScrollView>
        <View style={[styles.footer, { backgroundColor: theme.surface, borderTopColor: theme.border }]}>
          <Button
            title="Protect Another PDF"
            variant="outline"
            onPress={handleReset}
            fullWidth
          />
        </View>

        <UpgradePromptModal
          visible={showUpgradeModal}
          title="Upgrade to Pro"
          message="Get unlimited PDF protections with Pro."
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
      <Header title="Protect PDF" />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          {/* File Info Card */}
          <View style={[styles.fileCard, { backgroundColor: theme.surface }, shadows.card]}>
            <View style={styles.fileInfo}>
              <View style={[styles.fileIconContainer, { backgroundColor: `${colors.success}15` }]}>
                <Text style={{ fontSize: 24 }}>📄</Text>
              </View>
              <View style={styles.fileDetails}>
                <Text variant="body" numberOfLines={1} style={{ color: theme.textPrimary }}>
                  {selectedFile.name}
                </Text>
                <Text variant="caption" style={{ color: theme.textTertiary }}>
                  {selectedFile.formattedSize} • {filePageCount} page{filePageCount !== 1 ? 's' : ''}
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
          <Text variant="h3" style={{ color: theme.textPrimary }}>Set Password</Text>
          <Spacer size="md" />

          <View style={[styles.passwordCard, { backgroundColor: theme.surface }, shadows.card]}>
            <PasswordInput
              label="Password"
              value={password}
              onChangeText={handlePasswordChange}
              placeholder="Enter password (min 6 characters)"
              error={passwordError}
              autoFocus
            />

            <PasswordStrength password={password} />

            <Spacer size="md" />

            <PasswordInput
              label="Confirm Password"
              value={confirmPassword}
              onChangeText={handleConfirmPasswordChange}
              placeholder="Re-enter password"
              error={confirmError}
            />
          </View>

          <Spacer size="lg" />

          {/* Security Info */}
          <View style={[styles.infoCard, { backgroundColor: `${colors.info}10` }]}>
            <Icon name="info" size={18} color={colors.info} />
            <View style={styles.infoContent}>
              <Text variant="bodySmall" customColor={colors.info}>
                Your PDF will be encrypted with AES-256, the same encryption used by banks and governments.
              </Text>
            </View>
          </View>

          {isProtecting && (
            <>
              <Spacer size="lg" />
              <ProtectionProgress progress={progress} status={progressStatus} />
            </>
          )}

          <Spacer size="xl" />
        </ScrollView>

        <View style={[styles.footer, { backgroundColor: theme.surface, borderTopColor: theme.border }]}>
          {!isPro && remainingUses !== Infinity && (
            <View style={styles.remainingUsesContainer}>
              <Text variant="caption" style={{ color: theme.textSecondary }}>
                Free protections remaining today: {remainingUses}
              </Text>
            </View>
          )}
          <Button
            title={isProtecting ? 'Protecting...' : 'Protect PDF'}
            onPress={handleProtect}
            loading={isProtecting}
            disabled={isProtecting || !isFormValid}
            fullWidth
            leftIcon={
              !isProtecting ? (
                <Icon name="check" size={20} color={colors.textOnPrimary} />
              ) : undefined
            }
          />
        </View>
      </KeyboardAvoidingView>

      <UpgradePromptModal
        visible={showUpgradeModal}
        title="Daily Limit Reached"
        message="You have used all your free PDF protections for today. Upgrade to Pro for unlimited access."
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
  strengthContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.sm,
  },
  strengthBars: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  strengthBar: {
    width: 40,
    height: 4,
    borderRadius: 2,
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
  footer: {
    padding: spacing.lg,
    borderTopWidth: 1,
  },
  remainingUsesContainer: {
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
});
