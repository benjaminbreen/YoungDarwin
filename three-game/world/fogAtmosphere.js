import * as THREE from 'three';
import { weatherEnv } from './weatherEnvRuntime';

// Atmospheric fog: replaces three's flat FogExp2 falloff with height-aware
// optical depth plus a per-pixel sun in-scatter lobe, patched into the shared
// fog ShaderChunks so every fog-reading material (terrain, props, GLBs,
// sprites, points) inherits it from the one scene.fog. SkyController drives
// the shared uniforms each frame.
//
// Uniform plumbing: built-in materials clone their uniforms from ShaderLib via
// cloneUniforms, which deep-copies three math types (Color/Vector3/...) but
// copies plain objects BY REFERENCE. The values below are deliberately plain
// {x,y,z} / {r,g,b} objects — never Vector3/Color — so one module-level write
// reaches every compiled material without touching any onBeforeCompile hook.
// WebGLUniforms uploads them fine (setValueV3f/V4f accept .x/.r shapes).
//
// Degradation contract: a shader that includes the patched chunks but never
// receives these uniforms reads them as all-zero, which reproduces stock
// FogExp2 exactly (falloff 0 → uniform density; strength 0 → no sun tint;
// silhouette 0 → uncapped). Keep that property when editing the GLSL.

// --- Cloud shadow tuning -----------------------------------------------------
// Mutable so the dev Performance panel can drag values live; the drive below
// reads it every frame. These are the shipping defaults.
// Defaults from the 2026-07-23 screenshot pass at Post Office Bay.
export const cloudShadeTuning = {
  // Peak darkening under an ideal broken-cumulus sky.
  maxStrength: 0.52,
  // Feature size of the shadow pattern: base blobs ~this many meters across.
  featureMeters: 66,
  // Ground-track speed of the pattern in m/s at windSpeed 1, before the
  // cloudDriftSpeed channel scales it (~7.4 m/s with the default 0.32).
  driftMps: 23,
  // Added coverage: positive shadows more ground at a given cumulus level.
  coverageBias: 0.2,
  // fbm-value width of the shadow edge (bigger = softer penumbra).
  softness: 0.12,
  // Dev override: apply maxStrength directly, ignoring weather/sun gating, so
  // the pattern is visible under any sky while tuning.
  forceOn: false,
};
const CLOUD_SHADE_FREQUENCY = 1 / cloudShadeTuning.featureMeters;
// The sin-based GLSL hash degrades at large coordinates, so the drift offset
// wraps here (one visible pattern jump per ~10 h of continuous play).
const CLOUD_SHADE_OFFSET_WRAP = 1024;

export const fogAtmosphereUniforms = {
  uFogSunDir: { value: { x: 0.0, y: 1.0, z: 0.0 } },
  uFogSunColor: { value: { r: 0.0, g: 0.0, b: 0.0 } },
  // x: height falloff (1/m), y: fog base altitude (m),
  // z: sun in-scatter strength (0..1), w: silhouette floor (0..~0.06)
  uFogAtmo: { value: { x: 0.0, y: 0.0, z: 0.0, w: 0.0 } },
  // Cloud shadows: wind-drifted world-XZ noise darkens surfaces under
  // fair-weather cumulus. x: max darkening (0 disables the whole branch),
  // y: pattern frequency (1/m), z/w: pattern offset in noise units.
  uCloudShade: { value: { x: 0.0, y: CLOUD_SHADE_FREQUENCY, z: 0.0, w: 0.0 } },
  // x: coverage threshold (fbm value where shadow starts), y: edge width.
  uCloudShade2: { value: { x: 0.66, y: 0.22, z: 0.0, w: 0.0 } },
};

THREE.ShaderChunk.fog_pars_vertex = /* glsl */`
#ifdef USE_FOG
	varying float vFogDepth;
	varying vec3 vFogWorldDelta;
#endif
`;

// mvPosition is in scope wherever fog_vertex is included (mesh, sprite,
// points). transpose(mat3(viewMatrix)) is the camera's world rotation, so the
// varying is the world-space offset from camera — linear in position, safe to
// interpolate — without needing worldpos_vertex or instancing branches.
THREE.ShaderChunk.fog_vertex = /* glsl */`
#ifdef USE_FOG
	vFogDepth = - mvPosition.z;
	vFogWorldDelta = transpose( mat3( viewMatrix ) ) * mvPosition.xyz;
#endif
`;

THREE.ShaderChunk.fog_pars_fragment = /* glsl */`
#ifdef USE_FOG
	uniform vec3 fogColor;
	uniform vec3 uFogSunDir;
	uniform vec3 uFogSunColor;
	uniform vec4 uFogAtmo;
	uniform vec4 uCloudShade;
	uniform vec4 uCloudShade2;
	varying float vFogDepth;
	varying vec3 vFogWorldDelta;
	#ifdef FOG_EXP2
		uniform float fogDensity;
	#else
		uniform float fogNear;
		uniform float fogFar;
	#endif
	float cloudShadeHash( vec2 p ) {
		return fract( sin( dot( p, vec2( 41.31, 289.17 ) ) ) * 43758.5453 );
	}
	float cloudShadeNoise( vec2 p ) {
		vec2 i = floor( p );
		vec2 f = fract( p );
		vec2 u = f * f * ( 3.0 - 2.0 * f );
		return mix(
			mix( cloudShadeHash( i ), cloudShadeHash( i + vec2( 1.0, 0.0 ) ), u.x ),
			mix( cloudShadeHash( i + vec2( 0.0, 1.0 ) ), cloudShadeHash( i + vec2( 1.0, 1.0 ) ), u.x ),
			u.y );
	}
	float cloudShadeField( vec2 p ) {
		float v = 0.62 * cloudShadeNoise( p );
		v += 0.26 * cloudShadeNoise( p * 2.13 + vec2( 11.7, 5.3 ) );
		v += 0.12 * cloudShadeNoise( p * 4.41 + vec2( 3.1, 19.4 ) );
		return v;
	}
#endif
`;

// Height term: exponential density falloff with altitude, integrated
// analytically along the view ray (Quilez height fog). Mist pools low and
// thins toward ridgelines instead of whitewashing everything equally.
THREE.ShaderChunk.fog_fragment = /* glsl */`
#ifdef USE_FOG
	// Cloud shadows multiply lit color before fog mixes over it, so distant
	// shadow patches sink into the haze like everything else. Projection is
	// planar from above; at this feature scale that reads fine on relief.
	if ( uCloudShade.x > 0.0 ) {
		vec2 cloudShadeP = ( cameraPosition.xz + vFogWorldDelta.xz ) * uCloudShade.y + uCloudShade.zw;
		float cloudShadeCover = smoothstep( uCloudShade2.x, uCloudShade2.x + uCloudShade2.y, cloudShadeField( cloudShadeP ) );
		gl_FragColor.rgb *= 1.0 - uCloudShade.x * cloudShadeCover;
	}
	float fogHeightTerm = 1.0;
	if ( uFogAtmo.x > 0.0 ) {
		float fogCamH = max( 0.0, cameraPosition.y - uFogAtmo.y );
		float fogT = uFogAtmo.x * vFogWorldDelta.y;
		float fogRise = abs( fogT ) > 1e-4 ? ( 1.0 - exp( - fogT ) ) / fogT : 1.0 - 0.5 * fogT;
		fogHeightTerm = exp( - uFogAtmo.x * fogCamH ) * fogRise;
	}
	#ifdef FOG_EXP2
		float fogOptical = fogDensity * vFogDepth * fogHeightTerm;
		float fogFactor = 1.0 - exp( - fogOptical * fogOptical );
	#else
		float fogFactor = smoothstep( fogNear, fogFar, vFogDepth * fogHeightTerm );
	#endif
	fogFactor = min( fogFactor, 1.0 - uFogAtmo.w );
	float fogSunCos = clamp( dot( normalize( vFogWorldDelta ), uFogSunDir ), 0.0, 1.0 );
	vec3 fogTinted = mix( fogColor, uFogSunColor, pow( fogSunCos, 8.0 ) * uFogAtmo.z );
	gl_FragColor.rgb = mix( gl_FragColor.rgb, fogTinted, fogFactor );
#endif
`;

// Register the shared values with every built-in shader that consumes fog, and
// with UniformsLib for anything merged later. Runs once at module import,
// which must happen before the renderer compiles its first program.
THREE.UniformsLib.fog.uFogSunDir = fogAtmosphereUniforms.uFogSunDir;
THREE.UniformsLib.fog.uFogSunColor = fogAtmosphereUniforms.uFogSunColor;
THREE.UniformsLib.fog.uFogAtmo = fogAtmosphereUniforms.uFogAtmo;
THREE.UniformsLib.fog.uCloudShade = fogAtmosphereUniforms.uCloudShade;
THREE.UniformsLib.fog.uCloudShade2 = fogAtmosphereUniforms.uCloudShade2;
for (const name of Object.keys(THREE.ShaderLib)) {
  const uniforms = THREE.ShaderLib[name]?.uniforms;
  if (!uniforms || !uniforms.fogColor) continue;
  uniforms.uFogSunDir = fogAtmosphereUniforms.uFogSunDir;
  uniforms.uFogSunColor = fogAtmosphereUniforms.uFogSunColor;
  uniforms.uFogAtmo = fogAtmosphereUniforms.uFogAtmo;
  uniforms.uCloudShade = fogAtmosphereUniforms.uCloudShade;
  uniforms.uCloudShade2 = fogAtmosphereUniforms.uCloudShade2;
}

function smoothstep01(edge0, edge1, value) {
  const t = Math.max(0, Math.min(1, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

// Wind drift accumulates in noise units so the pattern speed is independent of
// the frequency knob.
const cloudShadeDrift = { x: 0, z: 0 };

// Called by SkyController each outdoor frame, alongside the uFogAtmo drive.
// Shadows want direct sun through a broken cumulus field: coverage rides
// weatherEnv.cumulus, and a closing deck/mist/rain hands darkening over to the
// uniform lightDim channels instead of patches. Returns the applied strength
// (for the lighting debug snapshot).
export function driveCloudShadeUniforms({ delta = 0, daylight = 0, elevation = 0, air = 1 } = {}) {
  const tuning = cloudShadeTuning;
  const cumulusPatch = smoothstep01(0.06, 0.45, weatherEnv.cumulus);
  const openSky = Math.max(0, 1 - weatherEnv.overcast * 1.1)
    * (1 - weatherEnv.mistAmount * 0.9)
    * (1 - weatherEnv.rainIntensity * 0.6);
  // Low sun smears cloud shadows into ambiguity; fade them in above ~sunrise.
  const sunUp = smoothstep01(0.05, 0.18, elevation);
  const weatherGate = tuning.forceOn ? 1 : cumulusPatch * openSky * sunUp * daylight;
  const strength = tuning.maxStrength * weatherGate * Math.max(0, Math.min(1, air));

  const frequency = 1 / Math.max(8, tuning.featureMeters);
  const drift = tuning.driftMps * weatherEnv.cloudDriftSpeed * weatherEnv.windSpeed
    * frequency * delta;
  cloudShadeDrift.x = (cloudShadeDrift.x + weatherEnv.windX * drift) % CLOUD_SHADE_OFFSET_WRAP;
  cloudShadeDrift.z = (cloudShadeDrift.z + weatherEnv.windZ * drift) % CLOUD_SHADE_OFFSET_WRAP;

  const shade = fogAtmosphereUniforms.uCloudShade.value;
  shade.x = strength;
  shade.y = frequency;
  shade.z = cloudShadeDrift.x;
  shade.w = cloudShadeDrift.z;
  // Denser cumulus fields shadow more ground, not just darker ground. The
  // forced dev mode sits at a mid-cumulus coverage so the pattern is obvious.
  const coverage = tuning.forceOn ? 0.7 : cumulusPatch;
  fogAtmosphereUniforms.uCloudShade2.value.x = 0.68 - coverage * 0.22 - tuning.coverageBias;
  fogAtmosphereUniforms.uCloudShade2.value.y = Math.max(0.02, tuning.softness);
  return strength;
}
