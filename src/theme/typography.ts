import { Platform, TextStyle } from 'react-native';

export const fontFamilies = {
  regular: Platform.select({
    android: 'Roboto',
    ios: 'System',
    default: 'System',
  }),
  medium: Platform.select({
    android: 'Roboto-Medium',
    ios: 'System',
    default: 'System',
  }),
  semiBold: Platform.select({
    android: 'Roboto-Medium',
    ios: 'System',
    default: 'System',
  }),
  bold: Platform.select({
    android: 'Roboto-Bold',
    ios: 'System',
    default: 'System',
  }),
} as const;

export const fontSizes = {
  xs: 12,
  sm: 14,
  md: 16,
  lg: 18,
  xl: 20,
  xxl: 28,
  xxxl: 34,
} as const;

export const lineHeights = {
  xs: 16,
  sm: 20,
  md: 24,
  lg: 28,
  xl: 32,
  xxl: 36,
  xxxl: 44,
} as const;

export const fontWeights: Record<string, TextStyle['fontWeight']> = {
  regular: '400',
  medium: '500',
  semiBold: '600',
  bold: '700',
} as const;

export const typography = {
  fonts: fontFamilies,
  sizes: fontSizes,
  lineHeights,
  weights: fontWeights,
} as const;

// Pre-defined text styles
export const textStyles: Record<string, TextStyle> = {
  h1: {
    fontFamily: fontFamilies.bold,
    fontSize: fontSizes.xxxl,
    lineHeight: lineHeights.xxxl,
    fontWeight: fontWeights.bold,
  },
  h2: {
    fontFamily: fontFamilies.bold,
    fontSize: fontSizes.xxl,
    lineHeight: lineHeights.xxl,
    fontWeight: fontWeights.bold,
  },
  h3: {
    fontFamily: fontFamilies.semiBold,
    fontSize: fontSizes.xl,
    lineHeight: lineHeights.xl,
    fontWeight: fontWeights.semiBold,
  },
  body: {
    fontFamily: fontFamilies.regular,
    fontSize: fontSizes.md,
    lineHeight: lineHeights.md,
    fontWeight: fontWeights.regular,
  },
  bodySmall: {
    fontFamily: fontFamilies.regular,
    fontSize: fontSizes.sm,
    lineHeight: lineHeights.sm,
    fontWeight: fontWeights.regular,
  },
  caption: {
    fontFamily: fontFamilies.regular,
    fontSize: fontSizes.xs,
    lineHeight: lineHeights.xs,
    fontWeight: fontWeights.regular,
  },
  button: {
    fontFamily: fontFamilies.semiBold,
    fontSize: fontSizes.md,
    lineHeight: lineHeights.md,
    fontWeight: fontWeights.semiBold,
  },
};

export type Typography = typeof typography;
