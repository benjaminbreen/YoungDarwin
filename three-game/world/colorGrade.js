// Time-of-day/weather post grade, companion to computeOutdoorLightRig: pure
// mapping from sky/weather state to the composer's grade uniforms. The base
// values match the old static constants (saturation 0.08, contrast 0.05,
// vignette 0.42), so a mid overcast day looks unchanged; the grade *moves*
// around that anchor. Deliberately subtle — the painterly shifts should be
// felt across an hour, not seen in a frame.
//
// Split toning carries the hour's colour: the lit side of the frame takes the
// sun's cast and the shade takes the sky's, the way a photographer's eye
// reads them. Tints are luminance-neutral multipliers (see SplitToneEffect),
// so they recolour without brightening or darkening the frame.
const NEUTRAL = [1, 1, 1];

function blend(base, tint, amount) {
  return base.map((value, index) => value + (tint[index] - 1) * amount);
}

export function computeColorGrade({
  daylight = 1,
  golden = 0,
  night = 0,
  overcast = 0,
  mist = 0,
  noonBlue = 0,
  dawnDrama = 0,
  duskDrama = 0,
  underwaterAmount = 0,
} = {}) {
  const clearAir = Math.max(0, 1 - overcast) * Math.max(0, 1 - mist * 0.6);
  const air = 1 - Math.max(0, Math.min(1, underwaterAmount));
  // Golden light splits into its two characters: dawn is fresh, pale and
  // soft (dew, sea haze), dusk is rich, amber and deep-shadowed.
  const dawn = Math.min(1, dawnDrama * 1.9) * golden;
  const dusk = Math.min(1, duskDrama * 1.6) * golden;
  // Diffuse skies have no split between sun and shade to tone.
  const direct = clearAir * daylight;

  let highlights = NEUTRAL;
  let shadows = NEUTRAL;
  // Dawn: rose-peach on the lit faces, cool lilac-blue in the shade.
  highlights = blend(highlights, [1.07, 1.0, 0.92], dawn * direct);
  shadows = blend(shadows, [0.9, 0.96, 1.12], dawn * direct);
  // Dusk: amber on the lit faces, violet shade.
  highlights = blend(highlights, [1.12, 1.0, 0.82], dusk * direct);
  shadows = blend(shadows, [0.98, 0.9, 1.12], dusk * direct);
  // High sun: lit sand warm and bleached, shade lit by a deep blue sky.
  highlights = blend(highlights, [1.035, 1.0, 0.95], noonBlue * direct);
  shadows = blend(shadows, [0.93, 0.99, 1.08], noonBlue * direct);
  // Moonlight reads blue; the eye's rod vision has no warm end.
  highlights = blend(highlights, [0.94, 0.99, 1.08], night);
  shadows = blend(shadows, [0.88, 0.96, 1.16], night);
  // Overcast daylight is a touch cool and grey throughout.
  const grey = overcast * daylight;
  highlights = blend(highlights, [0.98, 1.0, 1.03], grey);
  shadows = blend(shadows, [0.97, 1.0, 1.04], grey);

  return {
    // Golden hour blooms warm and rich; closed skies and night desaturate
    // (moonlight sees color poorly). Underwater keeps its own grade. Dawn
    // stays paler than dusk, and the vertical noon sun bleaches colour a
    // little, as it does in the photographs of equatorial beaches.
    saturation: (0.08
      + golden * 0.07 * clearAir
      - dawn * 0.03 * clearAir
      + dusk * 0.03 * clearAir
      - noonBlue * 0.02 * clearAir
      - overcast * 0.05 * daylight
      - night * 0.10
      - mist * 0.03) * air,
    // Long shadows carry a touch more contrast; morning haze softens it,
    // the noon sun hardens it. Night and heavy weather flatten toward a
    // softer, milkier register (never crushed blacks).
    contrast: (0.05
      + golden * 0.025 * clearAir
      - dawn * 0.025 * clearAir
      + dusk * 0.015 * clearAir
      + noonBlue * 0.015 * clearAir
      - night * 0.03
      - overcast * 0.015) * air,
    // Night closes the frame in slightly — the lantern-lit-circle feeling.
    vignetteDarkness: 0.42 + night * 0.09 * air,
    highlightTint: blend(NEUTRAL, highlights, air),
    shadowTint: blend(NEUTRAL, shadows, air),
  };
}
