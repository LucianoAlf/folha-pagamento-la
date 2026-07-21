/** @type {import('tailwindcss').Config} */
module.exports = {
  content: {
    relative: true,
    files: [
      './index.html',
      './*.{ts,tsx}',
      './components/**/*.{ts,tsx}',
      './hooks/**/*.{ts,tsx}',
      './types/**/*.{ts,tsx}',
      '!./components/**/*.{test,spec}.{ts,tsx}',
      '!./hooks/**/*.{test,spec}.{ts,tsx}',
    ],
  },
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
      },
      colors: {
        slate: { 850: '#162031', 900: '#0f172a', 950: '#020617' },
        bg: 'rgb(var(--bg) / <alpha-value>)',
        surface: 'rgb(var(--surface) / <alpha-value>)',
        'surface-2': 'rgb(var(--surface-2) / <alpha-value>)',
        'surface-3': 'rgb(var(--surface-3) / <alpha-value>)',
        primary: 'rgb(var(--text) / <alpha-value>)',
        secondary: 'rgb(var(--text-2) / <alpha-value>)',
        muted: 'rgb(var(--text-3) / <alpha-value>)',
        line: 'rgb(var(--border) / <alpha-value>)',
        'line-strong': 'rgb(var(--border-strong) / <alpha-value>)',
        accent: 'rgb(var(--accent) / <alpha-value>)',
        'on-accent': 'rgb(var(--on-accent) / <alpha-value>)',
        success: 'rgb(var(--success) / <alpha-value>)',
        warning: 'rgb(var(--warning) / <alpha-value>)',
        danger: 'rgb(var(--danger) / <alpha-value>)',
        info: 'rgb(var(--info) / <alpha-value>)',
      },
    },
  },
  plugins: [],
};
