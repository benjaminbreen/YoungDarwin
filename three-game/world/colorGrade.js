// Time-of-day/weather post grade, companion to computeOutdoorLightRig: pure
// mapping from sky/weather state to the composer's grade uniforms. The base
// values match the old static constants (saturation 0.08, contrast 0.05,
// vignette 0.42), so a mid overcast day looks unchanged; the grade *moves*
// around that anchor. Deliberately subtle — the painterly shifts should be
// felt across an hour, not seen in a frame.
export function computeColorGrade({
  daylight = 1,
  golden = 0,
  night = 0,
  overcast = 0,
  mist = 0,
  underwaterAmount = 0,
} = {}) {
  const clearAir = Math.max(0, 1 - overcast) * Math.max(0, 1 - mist * 0.6);
  const air = 1 - Math.max(0, Math.min(1, underwaterAmount));
  return {
    // Golden hour blooms warm and rich; closed skies and night desaturate
    // (moonlight sees color poorly). Underwater keeps its own grade.
    saturation: (0.08
      + golden * 0.07 * clearAir
      - overcast * 0.05 * daylight
      - night * 0.10
      - mist * 0.03) * air,
    // Long shadows carry a touch more contrast; night and heavy weather
    // flatten toward a softer, milkier register (never crushed blacks).
    contrast: (0.05
      + golden * 0.025 * clearAir
      - night * 0.03
      - overcast * 0.015) * air,
    // Night closes the frame in slightly — the lantern-lit-circle feeling.
    vignetteDarkness: 0.42 + night * 0.09 * air,
  };
}
