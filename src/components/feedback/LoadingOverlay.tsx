import React, { memo } from 'react';
import { View, ActivityIndicator, StyleSheet, Modal } from 'react-native';
import { colors, spacing } from '../../theme';
import { Text } from '../ui';

type LoadingOverlayProps = {
  visible: boolean;
  message?: string;
};

function LoadingOverlay({ visible, message = 'Loading...' }: LoadingOverlayProps) {
  return (
    <Modal transparent visible={visible} animationType="fade">
      <View style={styles.overlay}>
        <View style={styles.container}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text variant="body" style={styles.message}>
            {message}
          </Text>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  container: {
    backgroundColor: colors.surface,
    padding: spacing.xl,
    borderRadius: 16,
    alignItems: 'center',
    minWidth: 150,
  },
  message: {
    marginTop: spacing.md,
  },
});

export default memo(LoadingOverlay);
