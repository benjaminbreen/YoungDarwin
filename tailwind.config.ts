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
    },
  },
  plugins: [],
};
