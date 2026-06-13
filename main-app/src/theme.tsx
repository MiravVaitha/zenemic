import React, { createContext, useContext, useMemo, useState } from 'react';

export type ThemeMode = 'light' | 'dark';

const LIGHT = {
  bg: '#f8f6f1',
  surface: '#ffffff',
  surface2: '#f0ede5',
  hairline: 'rgba(0,0,0,0.12)',
  fg: '#0a0a0a',
  fg2: 'rgba(0,0,0,0.62)',
  fg2Solid: '#333',
  fg3: 'rgba(0,0,0,0.42)',
  fg3Bg: 'rgba(0,0,0,0.08)',
};

const DARK = {
  bg: '#0a0a0a',
  surface: '#121212',
  surface2: '#1a1a1a',
  hairline: 'rgba(255,255,255,0.10)',
  fg: '#fafafa',
  fg2: 'rgba(255,255,255,0.62)',
  fg2Solid: '#cccccc',
  fg3: 'rgba(255,255,255,0.38)',
  fg3Bg: 'rgba(255,255,255,0.10)',
};

export const ACCENT = '#FF6B4A';
export const GREEN = '#7CFF6B';
export const DANGER = '#E5484D';

export const FONTS = {
  sansLight: 'Inter_300Light',
  sans: 'Inter_400Regular',
  sansMedium: 'Inter_500Medium',
  sansSemibold: 'Inter_600SemiBold',
  sansBold: 'Inter_700Bold',
  mono: 'JetBrainsMono_400Regular',
  monoMedium: 'JetBrainsMono_500Medium',
  monoSemibold: 'JetBrainsMono_600SemiBold',
};

export const RADIUS = {
  sm: 6,
  md: 10,
  lg: 16,
  pill: 999,
};

export type Theme = typeof LIGHT & {
  mode: ThemeMode;
  accent: string;
  green: string;
  danger: string;
  setMode: (m: ThemeMode) => void;
};

const ThemeCtx = createContext<Theme | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setMode] = useState<ThemeMode>('light');
  const value = useMemo<Theme>(() => {
    const palette = mode === 'dark' ? DARK : LIGHT;
    return { ...palette, mode, accent: ACCENT, green: GREEN, danger: DANGER, setMode };
  }, [mode]);
  return <ThemeCtx.Provider value={value}>{children}</ThemeCtx.Provider>;
}

export function useTheme(): Theme {
  const ctx = useContext(ThemeCtx);
  if (!ctx) throw new Error('useTheme must be used inside ThemeProvider');
  return ctx;
}
