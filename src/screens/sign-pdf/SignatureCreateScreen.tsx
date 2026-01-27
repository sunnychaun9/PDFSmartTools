import React, { useRef, useState, useCallback } from 'react';
import { View, StyleSheet } from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { SafeScreen, Header, Spacer } from '../../components/layout';
import { Button, Text, Icon, AppModal } from '../../components/ui';
import { SignaturePad, SignaturePadRef } from '../../components/signature';
import { colors, spacing, borderRadius } from '../../theme';
import { useTheme } from '../../context';
import { saveSignature } from '../../services/signatureService';
import { RootStackParamList } from '../../navigation/types';

type SignatureCreateRouteProp = RouteProp<RootStackParamList, 'SignatureCreate'>;
type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

export default function SignatureCreateScreen() {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<SignatureCreateRouteProp>();
  const { theme } = useTheme();
  const signatureRef = useRef<SignaturePadRef>(null);

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

  const handleSave = useCallback(async () => {
    if (!hasDrawn || signatureRef.current?.isEmpty()) {
      setErrorModal({
        visible: true,
        title: 'No Signature',
        message: 'Please draw your signature before saving.',
      });
      return;
    }

    setIsSaving(true);
    try {
      const signatureData = await signatureRef.current?.readSignature();

      if (!signatureData) {
        setErrorModal({
          visible: true,
          title: 'Error',
          message: 'Failed to capture signature. Please try again.',
        });
        setIsSaving(false);
        return;
      }

      const savedSignature = await saveSignature(signatureData);

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
  }, [hasDrawn, navigation, returnTo]);

  const handleBegin = useCallback(() => {
    setHasDrawn(true);
  }, []);

  return (
    <SafeScreen>
      <Header title="Create Signature" />

      <View style={styles.content}>
        {/* Instructions */}
        <View style={[styles.infoCard, { backgroundColor: `${colors.signPdf}15` }]}>
          <Icon name="info" size={20} color={colors.signPdf} />
          <Text
            variant="bodySmall"
            style={{ color: theme.textSecondary, marginLeft: spacing.sm, flex: 1 }}
          >
            Draw your signature in the box below using your finger. Your signature will be saved for future use.
          </Text>
        </View>

        <Spacer size="lg" />

        {/* Hint text above canvas */}
        {!hasDrawn && (
          <Text
            variant="bodySmall"
            align="center"
            style={{ color: theme.textTertiary, marginBottom: spacing.sm }}
          >
            Touch and drag to draw your signature
          </Text>
        )}

        {/* Signature Canvas */}
        <View style={[styles.canvasContainer, { borderColor: colors.signPdf }]}>
          <SignaturePad
            ref={signatureRef}
            penColor="#000000"
            backgroundColor="#FFFFFF"
            strokeWidth={3}
            onBegin={handleBegin}
            style={styles.signaturePad}
          />
        </View>

        <Spacer size="md" />

        {/* Clear button */}
        <Button
          title="Clear"
          variant="outline"
          onPress={handleClear}
          leftIcon={<Icon name="x" size={18} color={colors.primary} />}
        />
      </View>

      {/* Footer with Save button */}
      <View
        style={[styles.footer, { backgroundColor: theme.surface, borderTopColor: theme.border }]}
      >
        <Button
          title={isSaving ? 'Saving...' : 'Save Signature'}
          onPress={handleSave}
          loading={isSaving}
          disabled={isSaving || !hasDrawn}
          fullWidth
          leftIcon={
            !isSaving ? <Icon name="check" size={20} color={colors.textOnPrimary} /> : undefined
          }
        />
      </View>

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
  content: {
    flex: 1,
    padding: spacing.lg,
  },
  infoCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: spacing.md,
    borderRadius: borderRadius.lg,
  },
  canvasContainer: {
    flex: 1,
    minHeight: 280,
    maxHeight: 400,
    borderRadius: borderRadius.lg,
    borderWidth: 2,
    borderStyle: 'dashed',
    overflow: 'hidden',
  },
  signaturePad: {
    flex: 1,
  },
  footer: {
    padding: spacing.lg,
    borderTopWidth: 1,
  },
});
