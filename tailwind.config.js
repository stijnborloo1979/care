/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      // De tokens staan in src/index.css als CSS-variabelen. Daardoor
      // kunnen eenvoudige modus, tekstschaal, hoog contrast en donker
      // thema in één laag geregeld worden, zonder class-varianten.
      colors: {
        bg: 'var(--bg)',
        surface: { DEFAULT: 'var(--surface)', soft: 'var(--surface-2)', deep: 'var(--surface-3)' },
        line: { DEFAULT: 'var(--border)', strong: 'var(--border-strong)' },
        ink: { DEFAULT: 'var(--text)', soft: 'var(--text-2)', faint: 'var(--text-3)' },
        accent: { DEFAULT: 'var(--accent)', ink: 'var(--accent-ink)', soft: 'var(--accent-soft)' },
        ok: 'var(--ok)',
        warn: 'var(--warn)',
        alert: 'var(--alert)',
      },
      borderRadius: { card: 'var(--r-l)', pill: '999px' },
      boxShadow: { card: 'var(--shadow-s)', lift: 'var(--shadow-m)' },
      fontFamily: { sans: ['Figtree', 'Segoe UI', 'system-ui', 'sans-serif'] },
      minHeight: { touch: '3rem', big: '6.2rem' },
    },
  },
  plugins: [],
}
