/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        background: '#F4F3F0',
        surface: '#FFFFFF',
        'surface-muted': '#EFEEEB',
        border: '#D6D5D1',
        'text-primary': '#1B1C1A',
        'text-secondary': '#5C5E64',
        primary: {
          DEFAULT: '#1E3A5F',
          dark: '#14283F',
          light: '#E8EEF5',
        },
        severity: {
          critical: '#B0362B',
          'critical-bg': '#FBEAE8',
          warning: '#B8860B',
          'warning-bg': '#FFF8E6',
          safe: '#3F6644',
          'safe-bg': '#EAF3EC',
        },
      },
      fontFamily: {
        sans: ["'IBM Plex Sans'", 'ui-sans-serif', 'system-ui'],
        mono: ["'JetBrains Mono'", 'ui-monospace', 'monospace'],
      },
      fontSize: {
        // Type scale: data 13px, body 15px, h3 16px, h2 19px, h1 24px
        data: ['13px', { lineHeight: '20px' }],
        body: ['15px', { lineHeight: '24px' }],
        h3: ['16px', { lineHeight: '24px', fontWeight: '600' }],
        h2: ['19px', { lineHeight: '28px', fontWeight: '600' }],
        h1: ['24px', { lineHeight: '32px', fontWeight: '600' }],
      },
      borderRadius: {
        card: '6px',
        btn: '4px',
      },
    },
  },
  plugins: [],
};
