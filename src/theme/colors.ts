// Modern color palette with gradients support
export const colors = {
  // Primary - Modern blue with gradient support
  primary: '#6366F1',
  primaryDark: '#4F46E5',
  primaryLight: '#818CF8',
  primaryGradient: ['#6366F1', '#8B5CF6'] as const,

  // Secondary accent
  secondary: '#EC4899',
  secondaryDark: '#DB2777',
  secondaryLight: '#F472B6',

  // Backgrounds - Light theme
  background: '#F8FAFC',
  surface: '#FFFFFF',
  surfaceVariant: '#F1F5F9',
  surfaceElevated: '#FFFFFF',

  // Text - Light theme
  textPrimary: '#0F172A',
  textSecondary: '#475569',
  textTertiary: '#94A3B8',
  textOnPrimary: '#FFFFFF',
  textOnDark: '#FFFFFF',

  // Utility
  border: '#E2E8F0',
  divider: '#F1F5F9',
  ripple: 'rgba(99, 102, 241, 0.1)',
  overlay: 'rgba(15, 23, 42, 0.5)',

  // Status - Modern colors
  success: '#10B981',
  successLight: '#D1FAE5',
  successDark: '#059669',
  warning: '#F59E0B',
  warningLight: '#FEF3C7',
  warningDark: '#D97706',
  error: '#EF4444',
  errorLight: '#FEE2E2',
  errorDark: '#DC2626',
  info: '#3B82F6',
  infoLight: '#DBEAFE',
  infoDark: '#2563EB',

  // Feature colors - Vibrant gradients
  imageToPdf: '#3B82F6',
  imageToPdfGradient: ['#3B82F6', '#2563EB'] as const,
  compressPdf: '#F59E0B',
  compressPdfGradient: ['#F59E0B', '#D97706'] as const,
  viewPdf: '#10B981',
  viewPdfGradient: ['#10B981', '#059669'] as const,
  mergePdf: '#EC4899',
  mergePdfGradient: ['#EC4899', '#DB2777'] as const,
  ocrExtract: '#06B6D4',
  ocrExtractGradient: ['#06B6D4', '#0891B2'] as const,
  signPdf: '#14B8A6',
  signPdfGradient: ['#14B8A6', '#0D9488'] as const,
  splitPdf: '#F97316',
  splitPdfGradient: ['#F97316', '#EA580C'] as const,
  pdfToImage: '#A855F7',
  pdfToImageGradient: ['#A855F7', '#9333EA'] as const,
  protectPdf: '#059669',
  protectPdfGradient: ['#059669', '#047857'] as const,
  unlockPdf: '#EF4444',
  unlockPdfGradient: ['#EF4444', '#DC2626'] as const,
  wordToPdf: '#2563EB',
  wordToPdfGradient: ['#2563EB', '#1D4ED8'] as const,
  scanToSearchable: '#7C3AED',
  scanToSearchableGradient: ['#7C3AED', '#6D28D9'] as const,
  proPlan: '#8B5CF6',
  proPlanGradient: ['#8B5CF6', '#7C3AED'] as const,

  // Card backgrounds with subtle gradients
  cardGradientBlue: ['#EFF6FF', '#DBEAFE'] as const,
  cardGradientOrange: ['#FFFBEB', '#FEF3C7'] as const,
  cardGradientGreen: ['#ECFDF5', '#D1FAE5'] as const,
  cardGradientPink: ['#FDF2F8', '#FCE7F3'] as const,
  cardGradientCyan: ['#ECFEFF', '#CFFAFE'] as const,
  cardGradientTeal: ['#F0FDFA', '#CCFBF1'] as const,
  cardGradientPurple: ['#F5F3FF', '#EDE9FE'] as const,
  cardGradientViolet: ['#FAF5FF', '#F3E8FF'] as const,

  // Glassmorphism
  glass: 'rgba(255, 255, 255, 0.7)',
  glassBorder: 'rgba(255, 255, 255, 0.3)',
  glassDark: 'rgba(15, 23, 42, 0.7)',

  // Dark theme
  dark: {
    background: '#0F172A',
    surface: '#1E293B',
    surfaceVariant: '#334155',
    surfaceElevated: '#1E293B',
    textPrimary: '#F8FAFC',
    textSecondary: '#CBD5E1',
    textTertiary: '#64748B',
    border: '#334155',
    divider: '#1E293B',
    ripple: 'rgba(99, 102, 241, 0.2)',
    overlay: 'rgba(0, 0, 0, 0.7)',
    glass: 'rgba(30, 41, 59, 0.8)',
    glassBorder: 'rgba(51, 65, 85, 0.5)',
  },

  // Transparent
  transparent: 'transparent',
} as const;

export type Colors = typeof colors;

// Helper to get color with opacity
export const withOpacity = (color: string, opacity: number): string => {
  // Handle hex colors
  if (color.startsWith('#')) {
    const hex = color.replace('#', '');
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${opacity})`;
  }
  return color;
};
