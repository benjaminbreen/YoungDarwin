// The expedition interface palette: one source of truth for colours that
// carry a design decision rather than a one-off.
//
// Three consumers need the same values and cannot share a mechanism:
//
//   * Tailwind class names (`text-expedition-gold`) read tailwind.config.ts.
//   * Arbitrary Tailwind values and inline styles — gradients, box-shadows,
//     anything with an alpha — cannot use a Tailwind colour name, which is why
//     the same hues were re-spelled as `rgba(227,197,133,0.12)` in ~300 places.
//   * CSS modules (ExamineView.module.css) read custom properties.
//
// So the palette lives here, is mirrored into tailwind.config.ts and into the
// `:root` block of app/globals.css as `--*-rgb` triplets, and a regression test
// asserts all three agree. Change a colour HERE and run `npm run test`; the
// test names whichever mirror you missed.
//
// What is deliberately NOT a token: plain black scrims (`rgba(0,0,0,0.55)` and
// friends) and per-illustration colours in the globe, compass and minimap.
// Those are local shading decisions, not chrome.

function rgbTriplet(hex) {
  const value = String(hex).replace('#', '');
  return [
    parseInt(value.slice(0, 2), 16),
    parseInt(value.slice(2, 4), 16),
    parseInt(value.slice(4, 6), 16),
  ];
}

// The Victorian expedition chrome. Names match the Tailwind colour keys, minus
// the `expedition-` prefix, so `PALETTE.gold` and `text-expedition-gold` are
// unambiguously the same colour.
export const PALETTE = Object.freeze({
  // Warm chrome: panel bodies, rules, and type.
  ink: '#14110c',
  panel: '#191511',
  brass: '#8a6d3f',
  gold: '#c9a35f',
  goldbright: '#e3c585',
  parchment: '#e8dcc0',
  faded: '#a89878',
  // Softer parchment used for secondary record type (specimen labels).
  parchmentDim: '#d8cdb4',
  // The reading room's warmer gold. The book reader is lit like a lamp-lit
  // desk rather than the field HUD, and uses this throughout its chrome.
  bookGold: '#b89353',

  // Cool chrome: the night-navy tiers behind terminal modals and the
  // conversation panel. Darkest first.
  night: '#050b14',
  nightDeep: '#07101d',
  nightPanel: '#0b1729',
  conversation: '#101a27',
  conversationRaised: '#1d3038',

  // Teals: chart surfaces (island map, minimap, map kit) and the accent rule
  // above a conversation panel.
  chart: '#27505d',
  chartBright: '#4f93a8',
  conversationAccent: '#527b77',
});

// Vitals gauges. Each reads as a two-stop gradient from deep to bright, and the
// same three gradients appear in the HUD stat bars, the polished stat rows and
// the status view's condition rows — previously as four copies of each literal.
export const VITALS = Object.freeze({
  health: Object.freeze({ deep: '#5f9e6a', bright: '#8fc491' }),
  fatigue: Object.freeze({ deep: '#b3812f', bright: '#e0aa4e' }),
  curiosity: Object.freeze({ deep: '#4f93a8', bright: '#84c4d4' }),
});

// `linear-gradient(90deg,#5f9e6a,#8fc491)` — the exact string the gauges pass
// as their `fill`.
export function vitalsGradient(key) {
  const stops = VITALS[key];
  if (!stops) throw new Error(`Unknown vitals gauge: ${key}`);
  return `linear-gradient(90deg,${stops.deep},${stops.bright})`;
}

// `alpha('gold', 0.12)` → `rgba(201,163,95,0.12)`. For gradients, shadows and
// borders, where Tailwind's `/opacity` syntax is unavailable.
export function alpha(token, amount) {
  const hex = PALETTE[token] || token;
  const [r, g, b] = rgbTriplet(hex);
  return `rgba(${r},${g},${b},${amount})`;
}

// The `--*-rgb` custom properties mirrored into app/globals.css, in the
// comma-separated triplet form the existing variables already use
// (`rgb(var(--expedition-gold-rgb))`, `rgb(var(--expedition-gold-rgb) / 0.4)`).
export const CSS_VARIABLES = Object.freeze(
  Object.fromEntries(
    Object.entries(PALETTE).map(([name, hex]) => [
      `--expedition-${name.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`)}-rgb`,
      rgbTriplet(hex).join(', '),
    ]),
  ),
);
