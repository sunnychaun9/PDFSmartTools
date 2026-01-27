export { colors, withOpacity } from './colors';
export type { Colors } from './colors';

export { spacing, borderRadius } from './spacing';
export type { Spacing, BorderRadius } from './spacing';

export { typography, fontFamilies, fontSizes, lineHeights, fontWeights, textStyles } from './typography';
export type { Typography } from './typography';

export { shadows } from './shadows';
export type { Shadows } from './shadows';

// Combined theme object
export const theme = {
  colors: require('./colors').colors,
  spacing: require('./spacing').spacing,
  borderRadius: require('./spacing').borderRadius,
  typography: require('./typography').typography,
  shadows: require('./shadows').shadows,
} as const;

export type Theme = typeof theme;
