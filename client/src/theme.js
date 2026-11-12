/**
 * @fileoverview Design tokens and the MUI theme.
 * A calm, dark, confident "control cockpit" aesthetic — one accent (Kiro
 * purple), generous spacing, soft depth. Deliberately not the bright
 * multi-color look. Used by App.jsx to theme the whole app.
 */
import { createTheme } from '@mui/material/styles';

/** Kiro brand purple — the single accent across the app. */
export const ACCENT = '#7B61FF';
/** Secondary magenta, used sparingly (e.g. update-available, highlights). */
export const ACCENT_ALT = '#E91E8C';

/** Core surface colors for the dark cockpit theme. */
export const SURFACE = {
  base: '#0E0E14',   // app background
  panel: '#16161F',  // cards / panels
  raised: '#1E1E2A', // hovered / selected surfaces
  border: 'rgba(255,255,255,0.08)',
  borderStrong: 'rgba(255,255,255,0.16)',
};

/**
 * buildTheme creates the MUI theme. Dark-only by design — the
 * cockpit aesthetic depends on the dark canvas, so there is no light variant.
 * @returns {import('@mui/material/styles').Theme}
 */
export function buildTheme() {
  return createTheme({
    palette: {
      mode: 'dark',
      primary: { main: ACCENT, light: '#9B85FF', dark: '#5E44D6' },
      secondary: { main: ACCENT_ALT },
      background: { default: SURFACE.base, paper: SURFACE.panel },
      divider: SURFACE.border,
      text: { primary: '#ECECF2', secondary: 'rgba(236,236,242,0.6)' },
    },
    shape: { borderRadius: 12 },
    typography: {
      fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
      h4: { fontWeight: 600, letterSpacing: '-0.02em' },
      h5: { fontWeight: 600, letterSpacing: '-0.01em' },
      h6: { fontWeight: 600 },
      button: { textTransform: 'none', fontWeight: 600 },
    },
    components: {
      MuiPaper: {
        styleOverrides: {
          root: {
            backgroundImage: 'none',
            border: `1px solid ${SURFACE.border}`,
          },
        },
      },
      MuiButton: {
        styleOverrides: { root: { borderRadius: 10 } },
      },
      MuiCssBaseline: {
        styleOverrides: {
          body: { backgroundColor: SURFACE.base },
          '*::-webkit-scrollbar': { width: 10, height: 10 },
          '*::-webkit-scrollbar-thumb': {
            background: 'rgba(255,255,255,0.12)',
            borderRadius: 8,
          },
        },
      },
    },
  });
}
