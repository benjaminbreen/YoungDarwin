import * as THREE from 'three';

// Dawn dew. Clear, still nights cool leaves, stone and grit below the dew
// point, so first light finds them beaded with droplets that catch the low
// sun; the beads burn off as the sun climbs. Terrain.jsx drives the amount
// each frame (it already holds the sky and weather state), and foliage,
// rocks, and the ground read it through these shared uniforms.
export const DEW_DEFAULTS = Object.freeze({
  // Sun altitude in degrees by which the dew has fully burned off. ~35° is
  // about 8:20 on Floreana.
  burnOffAltitude: 35,
  // Overall multiplier; 0 disables dew everywhere.
  strength: 1,
});

export const dewTuning = { ...DEW_DEFAULTS };

export const dewUniforms = {
  // 0..1 how much dew lies on exposed surfaces right now.
  uDew: { value: 0 },
  // World-space direction toward the sun (for droplet glints).
  uDewSun: { value: new THREE.Vector3(0, 1, 0) },
  // Linear sun colour and brightness reaching the droplets.
  uDewSunColor: { value: new THREE.Color(0, 0, 0) },
};

function smoothstep(edge0, edge1, value) {
  const t = Math.max(0, Math.min(1, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

// Pure mapping, kept separate so it can be tested. Dew needs a clear,
// still night to form, so overcast and wind thin it; rain leaves every
// surface wet regardless.
export function dewAmount({ solarAltitude = 90, overcast = 0, windGain = 1, rain = 0 } = {}) {
  const burnOff = 1 - smoothstep(8, dewTuning.burnOffAltitude, solarAltitude);
  const stillAir = 1 - Math.min(0.6, Math.max(0, windGain - 1) * 0.5);
  const clearNight = 1 - overcast * 0.55;
  const dew = burnOff * stillAir * clearNight;
  return Math.max(dew, Math.min(1, rain * 0.8)) * dewTuning.strength;
}

export function updateDewUniforms({ amount, sunDirection, golden = 0, daylight = 0 }) {
  dewUniforms.uDew.value = amount;
  if (sunDirection) dewUniforms.uDewSun.value.copy(sunDirection).normalize();
  // Droplet glints take the sun's own colour: amber at first light.
  dewUniforms.uDewSunColor.value.setRGB(1, 0.94 - golden * 0.22, 0.84 - golden * 0.4)
    .multiplyScalar(daylight);
}

// Droplet glints: sparse beads on a world-space grid, each with its own tilt,
// that flash when one mirrors the sun into the eye. They move as the camera
// does, like the glints on the glittering basalt. Faded out with distance,
// where a bead is far smaller than a pixel and would only shimmer.
export const DEW_GLSL = /* glsl */`
  uniform float uDew;
  uniform vec3 uDewSun;
  uniform vec3 uDewSunColor;
  float dewHash(vec3 p) {
    return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453);
  }
  vec3 dewGlints(vec3 worldPos, vec3 worldNormal, float density, float cellsPerMetre) {
    vec3 toEye = cameraPosition - worldPos;
    float dist = length(toEye);
    float near = 1.0 - smoothstep(5.0, 16.0, dist);
    if (uDew < 0.001 || near < 0.001) return vec3(0.0);
    vec3 cell = floor(worldPos * cellsPerMetre);
    float h = dewHash(cell);
    float bead = step(1.0 - density * uDew, h);
    // Round beads rather than grid squares: a sphere sliced by the surface.
    float beadRadius = length(fract(worldPos * cellsPerMetre) - 0.5);
    bead *= 1.0 - smoothstep(0.16, 0.3, beadRadius);
    vec3 tilt = vec3(dewHash(cell + 17.3), dewHash(cell + 41.9), dewHash(cell + 73.1)) - 0.5;
    vec3 beadNormal = normalize(worldNormal + tilt * 0.7);
    vec3 mirrored = reflect(-toEye / max(dist, 0.001), beadNormal);
    float glint = pow(max(dot(mirrored, uDewSun), 0.0), 90.0);
    return uDewSunColor * glint * bead * near * 7.0;
  }
`;
