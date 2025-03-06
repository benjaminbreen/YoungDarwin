/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        'darwin-primary': '#8B5A2B',
        'darwin-secondary': '#D2B48C',
        'darwin-accent': '#A0522D',
        'darwin-light': '#F5F5DC',
        'darwin-dark': '#4A3728',
      },
    },
  },
  plugins: [],
};