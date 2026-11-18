import type { Config } from 'tailwindcss';

// Spec F.3 — design tokens from the visual system (cream bg, sage accent,
// Vazirmatn sans / Estedad serif). RTL is handled in globals.css.
const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: {
          primary: 'var(--bg-primary)',
          secondary: 'var(--bg-secondary)',
        },
        text: {
          primary: 'var(--text-primary)',
          secondary: 'var(--text-secondary)',
        },
        accent: {
          DEFAULT: 'var(--accent)',
          alt: 'var(--accent-2)',
        },
        border: {
          DEFAULT: 'var(--border)',
        },
      },
      fontFamily: {
        sans: ['Vazirmatn', 'system-ui', 'sans-serif'],
        serif: ['Estedad', 'Vazirmatn', 'serif'],
      },
      lineHeight: {
        relaxed: '1.9',
      },
      borderRadius: {
        card: '0.75rem',
      },
      boxShadow: {
        card: '0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)',
      },
    },
  },
  plugins: [],
};

export default config;
