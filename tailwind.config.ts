/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './three-game/**/*.{js,ts,jsx,tsx,mdx}',
    './field-notebook/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        'darwin-primary': '#8B5A2B',
        'darwin-secondary': '#D2B48C',
        'darwin-accent': '#A0522D',
        'darwin-light': '#F5F5DC',
        'darwin-dark': '#4A3728',
        // Victorian expedition HUD palette
        'expedition-ink': '#14110c',
        'expedition-panel': '#191511',
        'expedition-brass': '#8a6d3f',
        'expedition-gold': '#c9a35f',
        'expedition-goldbright': '#e3c585',
        'expedition-parchment': '#e8dcc0',
        'expedition-faded': '#a89878',
      },
      fontFamily: {
        expedition: ['var(--font-garamond)', 'Georgia', 'Times New Roman', 'serif'],
        handwriting: ['var(--font-meddon)', 'Snell Roundhand', 'Apple Chancery', 'Bradley Hand', 'Segoe Script', 'cursive'],
      },
      keyframes: {
        // Animate the standalone `translate` property, not `transform`, so the
        // entrance composes with Tailwind translate utilities (-translate-x-1/2
        // centering on the banner and toolbelt) instead of overriding them.
        'hud-rise': {
          from: { opacity: '0', translate: '0 8px' },
          to: { opacity: '1', translate: '0 0' },
        },
        'hud-fade': {
          from: { opacity: '0', translate: '0 3px' },
          to: { opacity: '1', translate: '0 0' },
        },
      },
      animation: {
        // 'backwards' (not 'both') so class-driven transforms/opacity take over
        // cleanly once the entrance finishes.
        'hud-rise': 'hud-rise 0.55s cubic-bezier(0.22, 1, 0.36, 1) backwards',
        'hud-fade': 'hud-fade 0.3s ease-out backwards',
      },
    },
  },
  plugins: [],
};
