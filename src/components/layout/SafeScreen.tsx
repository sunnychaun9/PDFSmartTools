import React from 'react';
import { StyleSheet, ViewStyle } from 'react-native';
import { SafeAreaView, Edge } from 'react-native-safe-area-context';
import { useTheme } from '../../context';

type SafeScreenProps = {
  children: React.ReactNode;
  style?: ViewStyle;
  edges?: Edge[];
  backgroundColor?: string;
};

function SafeScreen({
  children,
  style,
  edges = ['top'],
  backgroundColor,
}: SafeScreenProps) {
  const { theme } = useTheme();
  const bgColor = backgroundColor || theme.background;

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: bgColor }, style]}
      edges={edges}
    >
      {children}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});

export default SafeScreen;
