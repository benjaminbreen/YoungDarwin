import * as THREE from 'three';

// Injected into both the full PBR carry material and the low-detail apron.
// Sharing the exact function makes their binary coverage complementary:
// PBR discards where the apron draws, and vice versa.
export const TERRAIN_TEXTURE_CARRY_GLSL = /* glsl */`
  float tsCarryHash(vec2 point) {
    return fract(sin(dot(point, vec2(127.1, 311.7))) * 43758.5453123);
  }

  float tsCarryNoiseLayer(vec2 point) {
    vec2 cell = floor(point);
    vec2 localPoint = fract(point);
    vec2 easePoint = localPoint * localPoint * (3.0 - 2.0 * localPoint);
    return mix(
      mix(
        tsCarryHash(cell),
        tsCarryHash(cell + vec2(1.0, 0.0)),
        easePoint.x
      ),
      mix(
        tsCarryHash(cell + vec2(0.0, 1.0)),
        tsCarryHash(cell + vec2(1.0, 1.0)),
        easePoint.x
      ),
      easePoint.y
    );
  }

  float tsCarryNoise(vec2 worldPosition) {
    float scale = max(0.001, uTextureCarrySeam.z);
    float coarseNoise = tsCarryNoiseLayer(
      worldPosition * scale + vec2(7.0, -11.0)
    );
    float fineNoise = tsCarryNoiseLayer(
      worldPosition * scale * 4.7 + vec2(-19.0, 5.0)
    );
    return mix(
      coarseNoise,
      coarseNoise * 0.58 + fineNoise * 0.42,
      clamp(uLocalApronTexture.w, 0.0, 1.0)
    );
  }

  float tsCarryProgress(float apronDepth, vec2 worldPosition) {
    float carryNoise = tsCarryNoise(worldPosition);
    float warpedDepth = apronDepth
      + (carryNoise - 0.5) * 2.0 * max(0.0, uTextureCarrySeam.w);
    float featherStart = min(
      uTextureCarrySeam.x,
      uTextureCarrySeam.y - 0.01
    );
    float featherEnd = max(
      uTextureCarrySeam.x + 0.01,
      uTextureCarrySeam.y
    );
    float progress = smoothstep(featherStart, featherEnd, warpedDepth);
    return pow(
      max(0.0001, progress),
      clamp(uLocalApronTexture.z, 0.2, 5.0)
    );
  }
`;

// v3 adds an actual near-shell cutout and independent, deliberately wide color
// grading ranges. Older saved values predate those ownership controls.
const STORAGE_KEY = 'darwin.terrainSeams.tuning.v4';

// These controls affect render-time visibility, color, and micro-variation.
// Movement height and collision remain unchanged.
export const TERRAIN_SEAM_DEV_DEFAULTS = Object.freeze({
  // Local PBR terrain -> vertex-colored neighbor apron.
  localApronFeatherStart: 0.5,
  localApronFeatherEnd: 0.7,
  localApronFeatherCurve: 4.3,
  localApronNoiseScale: 0.101,
  localApronNoiseWarp: 0.34,
  localApronColorCohesion: 1,
  apronTextureStrength: 6,
  apronBrightness: 1.53,
  apronSaturation: 2,
  apronWarmth: 0.92,

  // Actual active-region PBR texture -> vertex-colored apron. This is a
  // complementary world-noise coverage handoff across two coincident meshes,
  // so real map texture breaks up into the apron instead of ending at a line.
  textureCarryFeatherStart: 0.02,
  textureCarryFeatherEnd: 0.5,
  textureCarryFeatherCurve: 1,
  textureCarryNoiseScale: 0.08,
  textureCarryNoiseWarp: 0.24,
  textureCarryBreakup: 0.65,

  // Neighbor apron -> chart-derived perimeter shell.
  apronShellFeatherStart: 0.23,
  apronShellFeatherEnd: 0.72,
  apronShellFeatherCurve: 3.25,
  apronShellNoiseScale: 0.12,
  apronShellNoiseWarp: 0.3,
  apronShellColorCohesion: 0.5,
  shellTextureStrength: 2.7,
  shellBrightness: 1.11,
  shellSaturation: 1,
  shellWarmth: 0.78,
  // The horizon-only shell used by the shipped hybrid mode used to render
  // every zero-handoff fragment beneath the apron. From an elevated camera
  // those polygons appeared as irregular gray "puddles." Clip that underlap
  // until the shell has genuinely begun its far-distance handoff.
  shellNearClip: 0.1,

  debugSeams: false,
});

function storedTuning() {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    if (!parsed || typeof parsed !== 'object') return null;
    return Object.fromEntries(Object.keys(TERRAIN_SEAM_DEV_DEFAULTS)
      .filter(key => (
        parsed[key] !== undefined
        && typeof parsed[key] === typeof TERRAIN_SEAM_DEV_DEFAULTS[key]
      ))
      .map(key => [key, parsed[key]]));
  } catch {
    return null;
  }
}

export const terrainSeamDev = {
  ...TERRAIN_SEAM_DEV_DEFAULTS,
  ...(storedTuning() || {}),
};

// Shared by reference with both material families. Updating the vectors here
// changes every compiled seam shader without rebuilding geometry or materials.
export const terrainSeamUniforms = {
  // x: feather start, y: feather end, z: world-noise warp, w: color cohesion
  uLocalApronSeam: {
    value: new THREE.Vector4(),
  },
  // x: world-space noise scale, y: texture strength, z/w: reserved
  uLocalApronTexture: {
    value: new THREE.Vector4(),
  },
  // x: texture feather start, y: end, z: noise scale, w: boundary warp
  uTextureCarrySeam: {
    value: new THREE.Vector4(),
  },
  // x: brightness, y: saturation, z: warmth, w: feather curve
  uLocalApronGrade: {
    value: new THREE.Vector4(),
  },
  // x: feather start, y: feather end, z: world-noise warp, w: color cohesion
  uApronShellSeam: {
    value: new THREE.Vector4(),
  },
  // x: world-space noise scale, y: texture strength, z: debug flag,
  // w: horizon-shell near clip
  uApronShellTexture: {
    value: new THREE.Vector4(),
  },
  // x: brightness, y: saturation, z: warmth, w: feather curve
  uApronShellGrade: {
    value: new THREE.Vector4(),
  },
};

let revision = 0;
const listeners = new Set();

function driveUniforms() {
  terrainSeamUniforms.uLocalApronSeam.value.set(
    terrainSeamDev.localApronFeatherStart,
    terrainSeamDev.localApronFeatherEnd,
    terrainSeamDev.localApronNoiseWarp,
    terrainSeamDev.localApronColorCohesion,
  );
  terrainSeamUniforms.uLocalApronTexture.value.set(
    terrainSeamDev.localApronNoiseScale,
    terrainSeamDev.apronTextureStrength,
    terrainSeamDev.textureCarryFeatherCurve,
    terrainSeamDev.textureCarryBreakup,
  );
  terrainSeamUniforms.uTextureCarrySeam.value.set(
    terrainSeamDev.textureCarryFeatherStart,
    terrainSeamDev.textureCarryFeatherEnd,
    terrainSeamDev.textureCarryNoiseScale,
    terrainSeamDev.textureCarryNoiseWarp,
  );
  terrainSeamUniforms.uLocalApronGrade.value.set(
    terrainSeamDev.apronBrightness,
    terrainSeamDev.apronSaturation,
    terrainSeamDev.apronWarmth,
    terrainSeamDev.localApronFeatherCurve,
  );
  terrainSeamUniforms.uApronShellSeam.value.set(
    terrainSeamDev.apronShellFeatherStart,
    terrainSeamDev.apronShellFeatherEnd,
    terrainSeamDev.apronShellNoiseWarp,
    terrainSeamDev.apronShellColorCohesion,
  );
  terrainSeamUniforms.uApronShellTexture.value.set(
    terrainSeamDev.apronShellNoiseScale,
    terrainSeamDev.shellTextureStrength,
    terrainSeamDev.debugSeams ? 1 : 0,
    terrainSeamDev.shellNearClip,
  );
  terrainSeamUniforms.uApronShellGrade.value.set(
    terrainSeamDev.shellBrightness,
    terrainSeamDev.shellSaturation,
    terrainSeamDev.shellWarmth,
    terrainSeamDev.apronShellFeatherCurve,
  );
}

function persist() {
  if (typeof window === 'undefined') return;
  try {
    const changed = {};
    for (const key of Object.keys(TERRAIN_SEAM_DEV_DEFAULTS)) {
      if (terrainSeamDev[key] !== TERRAIN_SEAM_DEV_DEFAULTS[key]) {
        changed[key] = terrainSeamDev[key];
      }
    }
    if (Object.keys(changed).length) {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(changed));
    } else {
      window.localStorage.removeItem(STORAGE_KEY);
    }
  } catch {
    // Persistence is a tuning convenience, not a runtime dependency.
  }
}

function publish() {
  driveUniforms();
  persist();
  revision += 1;
  listeners.forEach(listener => listener());
}

export function setTerrainSeamDev(patch) {
  for (const key of Object.keys(TERRAIN_SEAM_DEV_DEFAULTS)) {
    if (patch[key] === undefined) continue;
    if (typeof patch[key] !== typeof TERRAIN_SEAM_DEV_DEFAULTS[key]) continue;
    terrainSeamDev[key] = patch[key];
  }
  publish();
}

export function resetTerrainSeamDev() {
  Object.assign(terrainSeamDev, TERRAIN_SEAM_DEV_DEFAULTS);
  publish();
}

export function terrainSeamDevDiffSource() {
  const lines = [];
  for (const key of Object.keys(TERRAIN_SEAM_DEV_DEFAULTS)) {
    const value = terrainSeamDev[key];
    if (value === TERRAIN_SEAM_DEV_DEFAULTS[key]) continue;
    lines.push(`  ${key}: ${String(value)},`);
  }
  return lines.length ? lines.join('\n') : '// matches defaults';
}

export function subscribeTerrainSeamDev(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getTerrainSeamDevRevision() {
  return revision;
}

driveUniforms();
