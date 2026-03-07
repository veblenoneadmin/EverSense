export type Theme = 'dark' | 'light';

export const DARK_PALETTE = {
  bg0:    '#1e1e1e',
  bg1:    '#252526',
  bg2:    '#2d2d2d',
  bg3:    '#333333',
  border: '#3c3c3c',
  border2:'#454545',
  text0:  '#f0f0f0',
  text1:  '#c0c0c0',
  text2:  '#909090',
  blue:   '#569cd6',
  teal:   '#4ec9b0',
  yellow: '#dcdcaa',
  orange: '#ce9178',
  purple: '#c586c0',
  red:    '#f44747',
  green:  '#6a9955',
  accent: '#007acc',
};

export const LIGHT_PALETTE = {
  bg0:    '#ffffff',
  bg1:    '#f3f3f3',
  bg2:    '#ebebeb',
  bg3:    '#e4e4e4',
  border: '#e0e0e0',
  border2:'#cecece',
  text0:  '#1e1e1e',
  text1:  '#3b3b3b',
  text2:  '#717171',
  blue:   '#0070c1',
  teal:   '#267f99',
  yellow: '#795e26',
  orange: '#a31515',
  purple: '#af00db',
  red:    '#cd3131',
  green:  '#008000',
  accent: '#0078d4',
};

/** Apply theme CSS variables to document root */
export function applyTheme(theme: Theme) {
  const palette = theme === 'light' ? LIGHT_PALETTE : DARK_PALETTE;
  const root = document.documentElement;
  Object.entries(palette).forEach(([key, value]) => {
    root.style.setProperty(`--vs-${key}`, value);
  });
  root.setAttribute('data-theme', theme);
}

/**
 * VS object using CSS custom properties.
 * Works with inline styles: style={{ background: VS.bg0 }}
 */
export const VS = {
  bg0:    'var(--vs-bg0)',
  bg1:    'var(--vs-bg1)',
  bg2:    'var(--vs-bg2)',
  bg3:    'var(--vs-bg3)',
  border: 'var(--vs-border)',
  border2:'var(--vs-border2)',
  text0:  'var(--vs-text0)',
  text1:  'var(--vs-text1)',
  text2:  'var(--vs-text2)',
  blue:   'var(--vs-blue)',
  teal:   'var(--vs-teal)',
  yellow: 'var(--vs-yellow)',
  orange: 'var(--vs-orange)',
  purple: 'var(--vs-purple)',
  red:    'var(--vs-red)',
  green:  'var(--vs-green)',
  accent: 'var(--vs-accent)',
};
