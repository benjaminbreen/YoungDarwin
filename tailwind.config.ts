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
        // Victorian expedition HUD palette. MIRROR ONLY — the source of truth
        // is PALETTE in three-game/ui/theme.js, which inline styles and CSS
        // modules also read. A regression test fails if the two drift.
        'expedition-ink': '#14110c',
        'expedition-panel': '#191511',
        'expedition-brass': '#8a6d3f',
        'expedition-gold': '#c9a35f',
        'expedition-goldbright': '#e3c585',
        'expedition-parchment': '#e8dcc0',
        'expedition-faded': '#a89878',
        'expedition-parchment-dim': '#d8cdb4',
        'expedition-book-gold': '#b89353',
        'expedition-night': '#050b14',
        'expedition-night-deep': '#07101d',
        'expedition-night-panel': '#0b1729',
        'expedition-conversation': '#101a27',
        'expedition-conversation-raised': '#1d3038',
        'expedition-chart': '#27505d',
        'expedition-chart-bright': '#4f93a8',
        'expedition-conversation-accent': '#527b77',
      },
      fontFamily: {
        expedition: ['var(--font-garamond)', 'Georgia', 'Times New Roman', 'serif'],
        handwriting: ['var(--font-meddon)', 'Snell Roundhand', 'Apple Chancery', 'Bradley Hand', 'Segoe Script', 'cursive'],
        journal: ['var(--font-caveat)', 'Segoe Print', 'Bradley Hand', 'cursive'],
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
        // A short, compositor-only nudge after an onboarding step has sat
        // unanswered for 20 seconds. It finishes enlarged instead of looping,
        // so the hint asks for attention without becoming ambient motion.
        'control-hint-attention': {
          '0%': { transform: 'scale(1)' },
          '18%': { transform: 'scale(1.14)' },
          '36%': { transform: 'scale(1.055)' },
          '54%': { transform: 'scale(1.12)' },
          '72%, 100%': { transform: 'scale(1.08)' },
        },
        // Collection celebration. Standalone scale/rotate properties (not
        // transform) so these compose with Tailwind translate centering.
        'collect-pop': {
          '0%': { opacity: '0', scale: '0.62' },
          '55%': { opacity: '1', scale: '1.045' },
          '100%': { opacity: '1', scale: '1' },
        },
        'collect-ring': {
          '0%': { opacity: '0.85', scale: '0.45' },
          '100%': { opacity: '0', scale: '1.9' },
        },
        // Rays hold for the card's whole stay — fading them early read as
        // "no rays at all" in practice. The wrapper's exit fade takes them out.
        'collect-rays': {
          '0%': { opacity: '0', rotate: '0deg' },
          '14%': { opacity: '1' },
          '100%': { opacity: '0.85', rotate: '32deg' },
        },
        'collect-glow': {
          '0%, 100%': { opacity: '0.32' },
          '50%': { opacity: '0.55' },
        },
        'collect-chip': {
          '0%': { opacity: '0', scale: '0.5' },
          '70%': { opacity: '1', scale: '1.12' },
          '100%': { opacity: '1', scale: '1' },
        },
        // Case button feedback when a specimen lands: one glow pulse plus a
        // small settle-shake. Color comes from --pulse-color so rarity tints it.
        'case-pulse': {
          '0%': { boxShadow: '0 0 0 0 var(--pulse-color, rgba(227,197,133,0.6))' },
          '55%': { boxShadow: '0 0 14px 5px var(--pulse-color, rgba(227,197,133,0.6))' },
          '100%': { boxShadow: '0 0 0 0 rgba(227,197,133,0)' },
        },
        'case-shake': {
          '0%, 100%': { rotate: '0deg', translate: '0 0' },
          '18%': { rotate: '-5deg', translate: '0 -2px' },
          '38%': { rotate: '4deg' },
          '58%': { rotate: '-2.5deg' },
          '78%': { rotate: '1.5deg' },
        },
        'slot-shimmer': {
          '0%': { translate: '-130% 0' },
          '100%': { translate: '130% 0' },
        },
      },
      animation: {
        // 'backwards' (not 'both') so class-driven transforms/opacity take over
        // cleanly once the entrance finishes.
        'hud-rise': 'hud-rise 0.55s cubic-bezier(0.22, 1, 0.36, 1) backwards',
        'hud-fade': 'hud-fade 0.3s ease-out backwards',
        'control-hint-attention': 'control-hint-attention 1.8s cubic-bezier(0.22, 1, 0.36, 1) both',
        'collect-pop': 'collect-pop 0.5s cubic-bezier(0.22, 1, 0.36, 1) backwards',
        'collect-ring': 'collect-ring 0.9s cubic-bezier(0.16, 0.8, 0.4, 1) forwards',
        'collect-rays': 'collect-rays 5.2s linear forwards',
        'collect-glow': 'collect-glow 1.8s ease-in-out 0.4s infinite',
        'collect-chip': 'collect-chip 0.45s cubic-bezier(0.22, 1, 0.36, 1) 0.28s backwards',
        'case-pulse': 'case-pulse 1.1s ease-out',
        'case-shake': 'case-shake 0.7s cubic-bezier(0.36, 0.07, 0.19, 0.97)',
        'slot-shimmer': 'slot-shimmer 1.2s cubic-bezier(0.4, 0, 0.2, 1) 0.15s both',
      },
    },
  },
  plugins: [
    // Touch affordances (virtual stick, action cluster, bottom nav) were gated
    // on viewport WIDTH via `md:hidden`, which is not what they are actually
    // about: a tablet in landscape is >=768px, so it received the keyboard HUD
    // and had no way to move, jump, collect, or open the menu. These variants
    // gate on the INPUT DEVICE instead — `finepointer:hidden` for touch-only
    // controls, `coarsepointer:` for anything that should appear only when
    // there is no mouse. CSS-only, so it also follows a device that gains or
    // loses a pointer mid-session.
    // Annotated inline: this is a .ts config under noImplicitAny, so an
    // untyped destructured plugin argument fails the production type check
    // (which `npm run check` does not run — use check:full or typecheck).
    ({ addVariant }: { addVariant: (name: string, definition: string) => void }) => {
      addVariant('coarsepointer', '@media (pointer: coarse)');
      addVariant('finepointer', '@media (pointer: fine)');
    },
  ],
};
