/**
 * App-specific semantic color tokens that aren't part of Paper's MD3
 * role system. Use these instead of inline `rgba(...)` literals so
 * light/dark variants stay in one place.
 *
 * Tokens:
 *   - `sectionHeaderBg` — section-header strip background in the
 *     transactions list.
 *   - `progressTrackBg` — track behind the per-category percentage bar
 *     on the categories screen.
 *
 * Each token has separate light / dark values keyed off `theme.dark`.
 */
import { useTheme } from 'react-native-paper';

export interface AppColors {
  readonly sectionHeaderBg: string;
  readonly progressTrackBg: string;
}

const lightAppColors: AppColors = {
  sectionHeaderBg: 'rgba(0,0,0,0.05)',
  progressTrackBg: 'rgba(0,0,0,0.06)',
};

const darkAppColors: AppColors = {
  sectionHeaderBg: 'rgba(255,255,255,0.05)',
  progressTrackBg: 'rgba(255,255,255,0.06)',
};

export function useAppColors(): AppColors {
  const theme = useTheme();
  return theme.dark ? darkAppColors : lightAppColors;
}
