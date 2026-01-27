import { Platform, ViewStyle } from 'react-native';

type ShadowStyle = Pick<
  ViewStyle,
  'shadowColor' | 'shadowOffset' | 'shadowOpacity' | 'shadowRadius' | 'elevation'
>;

const createShadow = (
  elevation: number,
  shadowOpacity: number = 0.1,
  offsetY: number = 1,
  radius: number = 3,
  color: string = '#000'
): ShadowStyle => {
  return Platform.select({
    android: {
      elevation,
    },
    ios: {
      shadowColor: color,
      shadowOffset: { width: 0, height: offsetY },
      shadowOpacity,
      shadowRadius: radius,
    },
    default: {
      elevation,
    },
  }) as ShadowStyle;
};

export const shadows = {
  none: createShadow(0, 0, 0, 0),

  // Subtle shadow for interactive elements
  xs: createShadow(1, 0.04, 1, 2),

  // Light shadow for cards
  sm: createShadow(2, 0.06, 1, 3),

  // Standard card shadow
  card: createShadow(3, 0.08, 2, 6),

  // Medium elevation
  md: createShadow(6, 0.1, 3, 8),

  // High elevation (modals, dropdowns)
  lg: createShadow(12, 0.15, 6, 16),

  // Highest elevation (floating elements)
  xl: createShadow(24, 0.2, 12, 24),

  // Colored shadows for feature cards
  blue: createShadow(8, 0.25, 4, 12, '#3B82F6'),
  purple: createShadow(8, 0.25, 4, 12, '#8B5CF6'),
  orange: createShadow(8, 0.25, 4, 12, '#F59E0B'),
  green: createShadow(8, 0.25, 4, 12, '#10B981'),

  // Soft inner glow effect (using border instead)
  glow: {
    shadowColor: '#6366F1',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 0,
  } as ShadowStyle,
} as const;

export type Shadows = typeof shadows;
