import React, { useRef, useState, useCallback } from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { SafeScreen, Header, Spacer } from '../../components/layout';
import { Button, Text, Icon, AppModal } from '../../components/ui';
import { colors, spacing, borderRadius } from '../../theme';
import { useTheme } from '../../context';
import { saveSignature } from '../../services/signatureService';
import { RootStackParamList } from '../../navigation/types';

type SignatureCreateRouteProp = RouteProp<RootStackParamList, 'SignatureCreate'>;
type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

// Lazy load the signature canvas to handle missing WebView module
let SignatureScreen: any = null;
let SignatureViewRef: any = null;
let loadError: Error | null = null;

try {
  const module = require('react-native-signature-canvas');
  SignatureScreen = module.default;
  SignatureViewRef = module.SignatureViewRef;
} catch (err) {
  loadError = err as Error;
  console.error('Failed to load SignatureScreen:', err);
}

export default function SignatureCreateScreen() {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<SignatureCreateRouteProp>();
  const { theme, isDark } = useTheme();
  const signatureRef = useRef<any>(null);

  const [isSaving, setIsSaving] = useState(false);
  const [hasDrawn, setHasDrawn] = useState(false);
  const [errorModal, setErrorModal] = useState<{
    visible: boolean;
    title: string;
    message: string;
  }>({ visible: false, title: '', message: '' });

  const returnTo = route.params?.returnTo;

  const handleClear = useCallback(() => {
    signatureRef.current?.clearSignature();
    setHasDrawn(false);
  }, []);

  const handleSave = useCallback(() => {
    if (!hasDrawn) {
      setErrorModal({
        visible: true,
        title: 'No Signature',
        message: 'Please draw your signature before saving.',
      });
      return;
    }
    signatureRef.current?.readSignature();
  }, [hasDrawn]);

  const handleSignatureEnd = useCallback(() => {
    setHasDrawn(true);
  }, []);

  const handleSignatureData = useCallback(
    async (signature: string) => {
      if (!signature || signature === 'data:,') {
        setErrorModal({
          visible: true,
          title: 'Empty Signature',
          message: 'Please draw your signature before saving.',
        });
        return;
      }

      setIsSaving(true);
      try {
        const savedSignature = await saveSignature(signature);

        if (returnTo === 'SignPdf') {
          navigation.navigate('SignPdf', { signatureBase64: savedSignature.base64 });
        } else {
          navigation.goBack();
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to save signature';
        setErrorModal({ visible: true, title: 'Error', message });
      } finally {
        setIsSaving(false);
      }
    },
    [navigation, returnTo]
  );

  const handleEmpty = useCallback(() => {
    setErrorModal({
      visible: true,
      title: 'Empty Signature',
      message: 'Please draw your signature before saving.',
    });
  }, []);

  // If the SignatureScreen module failed to load, show an error
  if (!SignatureScreen || loadError) {
    return (
      <SafeScreen>
        <Header title="Create Signature" />
        <View style={[styles.content, { justifyContent: 'center', alignItems: 'center' }]}>
          <View style={[styles.errorCard, { backgroundColor: theme.surfaceVariant }]}>
            <Icon name="alert-circle" size={48} color={colors.error} />
            <Spacer size="md" />
            <Text variant="h3" align="center" style={{ color: theme.textPrimary }}>
              Module Not Available
            </Text>
            <Spacer size="sm" />
            <Text
              variant="body"
              align="center"
              style={{ color: theme.textSecondary }}
            >
              The signature canvas feature requires native modules that are not properly installed. Please rebuild the app.
            </Text>
            <Spacer size="lg" />
            <Button
              title="Go Back"
              onPress={() => navigation.goBack()}
              fullWidth
            />
          </View>
        </View>
      </SafeScreen>
    );
  }

  // Signature canvas style based on theme
  const webStyle = `
    .m-signature-pad {
      box-shadow: none;
      border: none;
      background-color: ${isDark ? theme.surfaceVariant : '#FFFFFF'};
    }
    .m-signature-pad--body {
      border: none;
    }
    .m-signature-pad--footer {
      display: none;
    }
    body {
      background-color: ${isDark ? theme.surfaceVariant : '#FFFFFF'};
    }
  `;

  return (
    <SafeScreen>
      <Header title="Create Signature" />

      <View style={styles.content}>
        {/* Instructions */}
        <View style={[styles.infoCard, { backgroundColor: `${colors.signPdf}10` }]}>
          <Icon name="info" size={20} color={colors.signPdf} />
          <Text
            variant="bodySmall"
            style={{ color: theme.textSecondary, marginLeft: spacing.sm, flex: 1 }}
          >
            Draw your signature in the box below. Your signature will be saved for future use.
          </Text>
        </View>

        <Spacer size="lg" />

        {/* Signature Canvas */}
        <View
          style={[
            styles.canvasContainer,
            {
              backgroundColor: isDark ? theme.surfaceVariant : '#FFFFFF',
              borderColor: theme.border,
            },
          ]}
        >
          <SignatureScreen
            ref={signatureRef}
            onEnd={handleSignatureEnd}
            onOK={handleSignatureData}
            onEmpty={handleEmpty}
            webStyle={webStyle}
            backgroundColor={isDark ? theme.surfaceVariant : '#FFFFFF'}
            penColor={isDark ? '#FFFFFF' : '#000000'}
            minWidth={2}
            maxWidth={4}
            trimWhitespace={true}
            imageType="image/png"
            style={styles.signatureCanvas}
          />

          {/* Draw hint overlay - only shown when canvas is empty */}
          {!hasDrawn && (
            <View style={styles.hintOverlay} pointerEvents="none">
              <Text variant="body" style={{ color: theme.textTertiary }}>
                Draw your signature here
              </Text>
            </View>
          )}
        </View>

        <Spacer size="lg" />

        {/* Action Buttons */}
        <View style={styles.actions}>
          <Button
            title="Clear"
            variant="outline"
            onPress={handleClear}
            leftIcon={<Icon name="trash-2" size={18} color={colors.error} />}
            fullWidth
          />
          <Spacer size="sm" />
          <Button
            title="Save Signature"
            onPress={handleSave}
            loading={isSaving}
            disabled={isSaving || !hasDrawn}
            leftIcon={<Icon name="check" size={18} color={colors.textOnPrimary} />}
            fullWidth
          />
        </View>
      </View>

      {/* Error Modal */}
      <AppModal
        visible={errorModal.visible}
        title={errorModal.title}
        message={errorModal.message}
        onDismiss={() =>
          setErrorModal({ visible: false, title: '', message: '' })
        }
        buttons={[
          {
            label: 'OK',
            onPress: () =>
              setErrorModal({ visible: false, title: '', message: '' }),
          },
        ]}
      />
    </SafeScreen>
  );
}

const styles = StyleSheet.create({
  content: {
    flex: 1,
    paddingHorizontal: spacing.lg,
  },
  infoCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
  },
  canvasContainer: {
    flex: 1,
    borderWidth: 1,
    borderRadius: borderRadius.md,
    overflow: 'hidden',
    position: 'relative',
  },
  signatureCanvas: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  hintOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    pointerEvents: 'none',
    backgroundColor: 'rgba(0, 0, 0, 0.02)',
  },
  actions: {
    paddingVertical: spacing.lg,
  },
  errorCard: {
    borderRadius: borderRadius.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xl,
    alignItems: 'center',
    marginHorizontal: spacing.lg,
  },
});
