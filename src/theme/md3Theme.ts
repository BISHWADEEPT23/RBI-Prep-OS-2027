export interface ThemePreset {
  id: string;
  name: string;
  seed: string;
  description: string;
}

export const THEME_PRESETS: ThemePreset[] = [
  { id: 'sage', name: 'Sage Green', seed: '#427968', description: 'Calm Material You default botanical sage' },
  { id: 'ocean', name: 'Ocean Blue', seed: '#2B638B', description: 'Deep coastal slate and clear sky tones' },
  { id: 'lavender', name: 'Lavender', seed: '#6750A4', description: 'Classic Material 3 soft violet harmony' },
  { id: 'terracotta', name: 'Terracotta', seed: '#8F4C38', description: 'Warm earthen clay and sandstone tones' },
  { id: 'neutral', name: 'Neutral', seed: '#54605C', description: 'Minimalist monochrome architectural slate' },
];

function hexToHsl(hex: string): { h: number; s: number; l: number } {
  const sanitized = hex.replace('#', '').trim();
  const fullHex =
    sanitized.length === 3
      ? sanitized
          .split('')
          .map((c) => c + c)
          .join('')
      : sanitized.padEnd(6, '0').slice(0, 6);

  const r = parseInt(fullHex.slice(0, 2), 16) / 255;
  const g = parseInt(fullHex.slice(2, 4), 16) / 255;
  const b = parseInt(fullHex.slice(4, 6), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      case b:
        h = (r - g) / d + 4;
        break;
    }
    h /= 6;
  }

  return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) };
}

function hslToHex(h: number, s: number, l: number): string {
  const normH = ((h % 360) + 360) % 360;
  const normS = Math.max(0, Math.min(100, s)) / 100;
  const normL = Math.max(0, Math.min(100, l)) / 100;

  const c = (1 - Math.abs(2 * normL - 1)) * normS;
  const x = c * (1 - Math.abs(((normH / 60) % 2) - 1));
  const m = normL - c / 2;

  let rPrime = 0;
  let gPrime = 0;
  let bPrime = 0;

  if (normH >= 0 && normH < 60) {
    rPrime = c;
    gPrime = x;
  } else if (normH >= 60 && normH < 120) {
    rPrime = x;
    gPrime = c;
  } else if (normH >= 120 && normH < 180) {
    gPrime = c;
    bPrime = x;
  } else if (normH >= 180 && normH < 240) {
    gPrime = x;
    bPrime = c;
  } else if (normH >= 240 && normH < 300) {
    rPrime = x;
    bPrime = c;
  } else {
    rPrime = c;
    bPrime = x;
  }

  const toHex = (n: number) =>
    Math.round((n + m) * 255)
      .toString(16)
      .padStart(2, '0');

  return `#${toHex(rPrime)}${toHex(gPrime)}${toHex(bPrime)}`;
}

export function generateMd3Palette(seedHex: string, isDark: boolean): Record<string, string> {
  const { h, s } = hexToHsl(seedHex || '#427968');
  const sat = Math.max(12, Math.min(65, s));
  const secSat = Math.max(8, Math.round(sat * 0.45));
  const terHue = (h + 42) % 360;
  const terSat = Math.max(15, Math.round(sat * 0.55));
  const neuSat = Math.min(10, Math.round(sat * 0.18));

  if (!isDark) {
    return {
      '--md-primary': hslToHex(h, sat, 36),
      '--md-on-primary': '#ffffff',
      '--md-primary-container': hslToHex(h, Math.min(60, sat + 10), 87),
      '--md-on-primary-container': hslToHex(h, sat, 11),
      '--md-secondary': hslToHex(h, secSat, 35),
      '--md-on-secondary': '#ffffff',
      '--md-secondary-container': hslToHex(h, secSat + 8, 88),
      '--md-on-secondary-container': hslToHex(h, secSat + 10, 12),
      '--md-tertiary': hslToHex(terHue, terSat, 36),
      '--md-tertiary-container': hslToHex(terHue, terSat + 12, 89),
      '--md-on-tertiary-container': hslToHex(terHue, terSat + 10, 12),
      '--md-surface': hslToHex(h, neuSat, 98),
      '--md-surface-container-low': hslToHex(h, neuSat, 95),
      '--md-surface-container': hslToHex(h, neuSat, 93),
      '--md-surface-container-high': hslToHex(h, neuSat, 90),
      '--md-on-surface': hslToHex(h, neuSat + 4, 11),
      '--md-on-surface-variant': hslToHex(h, neuSat + 8, 28),
      '--md-outline': hslToHex(h, neuSat + 6, 46),
      '--md-outline-variant': hslToHex(h, neuSat + 8, 78),
      '--md-error': '#ba1a1a',
      '--md-error-container': '#ffdad6',
      '--md-on-error-container': '#410002',
      '--md-inverse-surface': hslToHex(h, neuSat + 4, 19),
      '--md-inverse-on-surface': hslToHex(h, neuSat, 95),
    };
  }

  return {
    '--md-primary': hslToHex(h, Math.min(60, sat + 8), 75),
    '--md-on-primary': hslToHex(h, sat, 15),
    '--md-primary-container': hslToHex(h, sat, 25),
    '--md-on-primary-container': hslToHex(h, Math.min(65, sat + 12), 88),
    '--md-secondary': hslToHex(h, secSat + 6, 76),
    '--md-on-secondary': hslToHex(h, secSat + 8, 17),
    '--md-secondary-container': hslToHex(h, secSat + 6, 26),
    '--md-on-secondary-container': hslToHex(h, secSat + 10, 88),
    '--md-tertiary': hslToHex(terHue, terSat + 10, 77),
    '--md-tertiary-container': hslToHex(terHue, terSat, 27),
    '--md-on-tertiary-container': hslToHex(terHue, terSat + 15, 90),
    '--md-surface': hslToHex(h, neuSat, 8),
    '--md-surface-container-low': hslToHex(h, neuSat, 11),
    '--md-surface-container': hslToHex(h, neuSat, 14),
    '--md-surface-container-high': hslToHex(h, neuSat, 18),
    '--md-on-surface': hslToHex(h, neuSat, 90),
    '--md-on-surface-variant': hslToHex(h, neuSat + 6, 77),
    '--md-outline': hslToHex(h, neuSat + 6, 56),
    '--md-outline-variant': hslToHex(h, neuSat + 6, 27),
    '--md-error': '#ffb4ab',
    '--md-error-container': '#93000a',
    '--md-on-error-container': '#ffdad6',
    '--md-inverse-surface': hslToHex(h, neuSat, 90),
    '--md-inverse-on-surface': hslToHex(h, neuSat + 4, 18),
  };
}

export function applyMd3ThemeToDocument(seedHex: string, mode: 'light' | 'dark' | 'system'): boolean {
  const prefersDark =
    typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  const isDark = mode === 'dark' || (mode === 'system' && prefersDark);

  const root = document.documentElement;
  if (isDark) {
    root.classList.add('dark');
  } else {
    root.classList.remove('dark');
  }

  const tokens = generateMd3Palette(seedHex, isDark);
  Object.entries(tokens).forEach(([key, value]) => {
    root.style.setProperty(key, value);
  });

  return isDark;
}
