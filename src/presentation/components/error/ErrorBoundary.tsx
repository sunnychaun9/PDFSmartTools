import React, { Component, ErrorInfo } from 'react';
import {
  View,
  StyleSheet,
  Pressable,
  ScrollView,
  Dimensions,
} from 'react-native';
import Clipboard from '@react-native-clipboard/clipboard';
import Text from '../ui/Text';
import { colors, spacing, borderRadius } from '../../../theme';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

type ErrorBoundaryProps = {
  children: React.ReactNode;
  fallback?: React.ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
};

type ErrorBoundaryState = {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  copied: boolean;
};

/**
 * Global error boundary that catches unhandled JS rendering errors.
 * Prevents white-screen crashes by showing a recoverable fallback UI.
 *
 * Must be a class component — React does not support error boundaries as hooks.
 */
export default class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      copied: false,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    this.setState({ errorInfo });
    this.props.onError?.(error, errorInfo);

    // Log to console for development debugging
    if (__DEV__) {
      console.error('ErrorBoundary caught an error:', error, errorInfo);
    }
  }

  handleRestart = (): void => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
      copied: false,
    });
  };

  handleCopyError = (): void => {
    const { error, errorInfo } = this.state;
    const errorReport = [
      `Error: ${error?.message || 'Unknown error'}`,
      '',
      `Stack: ${error?.stack || 'No stack trace'}`,
      '',
      `Component Stack: ${errorInfo?.componentStack || 'No component stack'}`,
    ].join('\n');

    Clipboard.setString(errorReport);
    this.setState({ copied: true });

    setTimeout(() => {
      this.setState({ copied: false });
    }, 2000);
  };

  render(): React.ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <View style={styles.container}>
          <View style={styles.card}>
            <View style={styles.iconCircle}>
              <Text style={styles.iconEmoji}>!</Text>
            </View>

            <Text style={styles.title}>Something Went Wrong</Text>

            <Text style={styles.message}>
              The app encountered an unexpected error. You can restart or copy
              the error details to report the issue.
            </Text>

            <ScrollView style={styles.errorBox} nestedScrollEnabled>
              <Text style={styles.errorText}>
                {this.state.error?.message || 'Unknown error'}
              </Text>
            </ScrollView>

            <View style={styles.actions}>
              <Pressable
                style={styles.primaryButton}
                onPress={this.handleRestart}
                android_ripple={{ color: 'rgba(255,255,255,0.2)' }}
              >
                <Text style={styles.primaryButtonText}>Restart App</Text>
              </Pressable>

              <Pressable
                style={styles.secondaryButton}
                onPress={this.handleCopyError}
                android_ripple={{ color: 'rgba(0,0,0,0.1)' }}
              >
                <Text style={styles.secondaryButtonText}>
                  {this.state.copied ? 'Copied!' : 'Copy Error Report'}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      );
    }

    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
    padding: spacing.lg,
  },
  card: {
    width: SCREEN_WIDTH * 0.9,
    maxWidth: 400,
    backgroundColor: '#ffffff',
    borderRadius: borderRadius.xl,
    padding: spacing.xl,
    alignItems: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#FEE2E2',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  iconEmoji: {
    fontSize: 28,
    fontWeight: '700',
    color: colors.error,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1a1a1a',
    marginBottom: spacing.sm,
    textAlign: 'center',
  },
  message: {
    fontSize: 14,
    color: '#666666',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: spacing.lg,
  },
  errorBox: {
    width: '100%',
    maxHeight: 100,
    backgroundColor: '#FEF2F2',
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  errorText: {
    fontSize: 12,
    color: colors.error,
    fontFamily: 'monospace',
  },
  actions: {
    width: '100%',
    gap: spacing.sm,
  },
  primaryButton: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.md,
    borderRadius: borderRadius.lg,
    backgroundColor: colors.primary,
  },
  primaryButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  secondaryButton: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.md,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  secondaryButtonText: {
    color: '#666666',
    fontSize: 14,
    fontWeight: '500',
  },
});
