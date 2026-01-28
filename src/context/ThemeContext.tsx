import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  type ReactNode,
} from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { colors } from '../theme/colors';

const THEME_STORAGE_KEY = '@pdfsmarttools_theme';

type ThemeMode = 'light' | 'dark' | 'system';

type ThemeColors = {
  background: string;
  surface: string;
  surfaceVariant: string;
  surfaceElevated: string;
  textPrimary: string;
  textSecondary: string;
  textTertiary: string;
  border: string;
  divider: string;
  ripple: string;
  overlay: string;
  glass: string;
  glassBorder: string;
};

type ThemeContextType = {
  isDark: boolean;
  themeMode: ThemeMode;
  setThemeMode: (mode: ThemeMode) => void;
  toggleTheme: () => void;
  theme: ThemeColors;
};

const ThemeContext = createContext<ThemeContextType | null>(null);

export function useTheme(): ThemeContextType {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}

type ThemeProviderProps = {
  children: ReactNode;
};

export function ThemeProvider({ children }: ThemeProviderProps) {
  const systemColorScheme = useColorScheme();
  const [themeMode, setThemeModeState] = useState<ThemeMode>('system');

  // Load saved theme preference
  useEffect(() => {
    async function loadTheme() {
      try {
        const savedTheme = await AsyncStorage.getItem(THEME_STORAGE_KEY);
        if (savedTheme && ['light', 'dark', 'system'].includes(savedTheme)) {
          setThemeModeState(savedTheme as ThemeMode);
        }
      } catch (error) {
        console.warn('Failed to load theme preference:', error);
      }
    }
    loadTheme();
  }, []);

  // Determine if dark mode is active
  const isDark = useMemo(() => {
    if (themeMode === 'system') {
      return systemColorScheme === 'dark';
    }
    return themeMode === 'dark';
  }, [themeMode, systemColorScheme]);

  // Get theme colors based on mode
  const theme = useMemo<ThemeColors>(() => {
    if (isDark) {
      return {
        background: colors.dark.background,
        surface: colors.dark.surface,
        surfaceVariant: colors.dark.surfaceVariant,
        surfaceElevated: colors.dark.surfaceElevated,
        textPrimary: colors.dark.textPrimary,
        textSecondary: colors.dark.textSecondary,
        textTertiary: colors.dark.textTertiary,
        border: colors.dark.border,
        divider: colors.dark.divider,
        ripple: colors.dark.ripple,
        overlay: colors.dark.overlay,
        glass: colors.dark.glass,
        glassBorder: colors.dark.glassBorder,
      };
    }
    return {
      background: colors.background,
      surface: colors.surface,
      surfaceVariant: colors.surfaceVariant,
      surfaceElevated: colors.surfaceElevated,
      textPrimary: colors.textPrimary,
      textSecondary: colors.textSecondary,
      textTertiary: colors.textTertiary,
      border: colors.border,
      divider: colors.divider,
      ripple: colors.ripple,
      overlay: colors.overlay,
      glass: colors.glass,
      glassBorder: colors.glassBorder,
    };
  }, [isDark]);

  // Set theme mode and persist
  const setThemeMode = useCallback(async (mode: ThemeMode) => {
    setThemeModeState(mode);
    try {
      await AsyncStorage.setItem(THEME_STORAGE_KEY, mode);
    } catch (error) {
      console.warn('Failed to save theme preference:', error);
    }
  }, []);

  // Toggle between light and dark
  const toggleTheme = useCallback(() => {
    const newMode = isDark ? 'light' : 'dark';
    setThemeMode(newMode);
  }, [isDark, setThemeMode]);

  // Memoize the context value to ensure stable reference and proper reactivity
  const value = useMemo<ThemeContextType>(
    () => ({
      isDark,
      themeMode,
      setThemeMode,
      toggleTheme,
      theme,
    }),
    [isDark, themeMode, setThemeMode, toggleTheme, theme]
  );

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
}
