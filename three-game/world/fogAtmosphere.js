import * as THREE from 'three';

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

export const fogAtmosphereUniforms = {
  uFogSunDir: { value: { x: 0.0, y: 1.0, z: 0.0 } },
  uFogSunColor: { value: { r: 0.0, g: 0.0, b: 0.0 } },
  // x: height falloff (1/m), y: fog base altitude (m),
  // z: sun in-scatter strength (0..1), w: silhouette floor (0..~0.06)
  uFogAtmo: { value: { x: 0.0, y: 0.0, z: 0.0, w: 0.0 } },
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
	varying float vFogDepth;
	varying vec3 vFogWorldDelta;
	#ifdef FOG_EXP2
		uniform float fogDensity;
	#else
		uniform float fogNear;
		uniform float fogFar;
	#endif
#endif
`;

// Height term: exponential density falloff with altitude, integrated
// analytically along the view ray (Quilez height fog). Mist pools low and
// thins toward ridgelines instead of whitewashing everything equally.
THREE.ShaderChunk.fog_fragment = /* glsl */`
#ifdef USE_FOG
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
for (const name of Object.keys(THREE.ShaderLib)) {
  const uniforms = THREE.ShaderLib[name]?.uniforms;
  if (!uniforms || !uniforms.fogColor) continue;
  uniforms.uFogSunDir = fogAtmosphereUniforms.uFogSunDir;
  uniforms.uFogSunColor = fogAtmosphereUniforms.uFogSunColor;
  uniforms.uFogAtmo = fogAtmosphereUniforms.uFogAtmo;
}
