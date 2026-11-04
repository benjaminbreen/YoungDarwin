import * as THREE from 'three';

// Skin and hair shading for the player, layered onto MeshPhysicalMaterial by
// patching the physical direct-light function (RE_Direct_Physical) for that
// one material. Everything is a live uniform (window.__darwinSkinHair()), so
// the look can be tuned in a running game.
//
// Skin: the painted atlas is graded toward natural skin, direct light wraps
// further around the form in red than in blue (cheap subsurface scattering:
// the terminator warms instead of cutting to grey), and pore-scale normal
// breakup in pre-skinning coordinates gives the specular a skin texture up
// close, faded out before it can alias.
//
// Hair: the mesh is sculpted clumps, not cards, so a Kajiya-Kay strand
// highlight is computed along the surface's downward (combed) direction: a
// near-white primary band and a broader albedo-tinted secondary band, each
// broken up per strand so the highlight reads as hair rather than plastic.

const LUMA = 'vec3( 0.2126, 0.7152, 0.0722 )';

const NOISE_GLSL = `
float playerHash13( vec3 p ) {
  p = fract( p * 0.1031 );
  p += dot( p, p.zyx + 31.32 );
  return fract( ( p.x + p.y ) * p.z );
}
float playerValueNoise( vec3 p ) {
  vec3 i = floor( p );
  vec3 f = fract( p );
  f = f * f * ( 3.0 - 2.0 * f );
  return mix(
    mix( mix( playerHash13( i ), playerHash13( i + vec3( 1, 0, 0 ) ), f.x ),
         mix( playerHash13( i + vec3( 0, 1, 0 ) ), playerHash13( i + vec3( 1, 1, 0 ) ), f.x ), f.y ),
    mix( mix( playerHash13( i + vec3( 0, 0, 1 ) ), playerHash13( i + vec3( 1, 0, 1 ) ), f.x ),
         mix( playerHash13( i + vec3( 0, 1, 1 ) ), playerHash13( i + vec3( 1, 1, 1 ) ), f.x ), f.y ),
    f.z );
}`;

function colorUniform(value, fallback) {
  return { value: new THREE.Color(value || fallback) };
}

function vec3Uniform(value, fallback) {
  const v = value || fallback;
  return { value: new THREE.Vector3(v[0], v[1], v[2]) };
}

// Patch one material's copy of the physical lighting chunk and the shared
// bind-pose position varying, chained after whatever hooks already exist.
function chainHook(material, key, uniforms, patch) {
  const previousHook = material.onBeforeCompile;
  const previousKey = material.customProgramCacheKey.bind(material);
  material.customProgramCacheKey = () => `${previousKey()}:${key}`;
  material.onBeforeCompile = (shader, renderer) => {
    previousHook?.call(material, shader, renderer);
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('void main() {', 'varying vec3 vPlayerBindPosition;\nvoid main() {')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n  vPlayerBindPosition = position;');
    patch(shader);
  };
  material.needsUpdate = true;
}

function patchDirectLight(shader, declarations, directBody) {
  const chunk = THREE.ShaderChunk.lights_physical_pars_fragment;
  const diffuseLine = '\treflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseContribution );\n}';
  if (!chunk.includes(diffuseLine)) {
    console.warn('[playerSkinHairShading] three.js lighting chunk changed; skipped');
    return false;
  }
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <lights_physical_pars_fragment>', `${declarations}\n${chunk.replace(diffuseLine, `${directBody}\n}`)}`);
  return true;
}

const TINT_SLOTS = 4;
function tintSlots(tints = [], read, empty) {
  return Array.from({ length: TINT_SLOTS }, (_, i) => (tints[i] ? read(tints[i]) : (empty.clone ? empty.clone() : empty)));
}

export function applyPlayerSkinShading(material, config) {
  if (!config || material.userData.playerSkinShading) return;
  const uniforms = {
    uSkinSaturation: { value: config.saturation ?? 0.7 },
    uSkinTint: colorUniform(config.tint, '#ffffff'),
    uSkinWrap: vec3Uniform(config.wrap, [0.4, 0.16, 0.1]),
    uSkinScatterColor: colorUniform(config.scatterColor, '#ff6a4a'),
    uSkinPoreScale: { value: config.poreMetres ?? 0.0007 },
    uSkinPoreStrength: { value: config.poreStrength ?? 0.2 },
    uSkinPoreFade: { value: new THREE.Vector2(...(config.poreFade || [0.35, 1.4])) },
    uSkinBrowColor: colorUniform(config.browColor, '#4a3226'),
    uSkinBrowAmount: { value: config.browAmount ?? 1 },
    // Up to four soft colour regions in bind-pose metres (cheek flush, nose,
    // lips): multiplied into the painted albedo so its detail survives.
    uSkinTintCentre: { value: tintSlots(config.tints, t => new THREE.Vector3(...t.centre), new THREE.Vector3(0, -10, 0)) },
    uSkinTintRadius: { value: tintSlots(config.tints, t => new THREE.Vector3(...t.radius), new THREE.Vector3(1, 1, 1)) },
    uSkinTintColor: { value: tintSlots(config.tints, t => new THREE.Color(t.color), new THREE.Color('#ffffff')) },
    uSkinTintAmount: { value: tintSlots(config.tints, t => t.amount ?? 0.3, 0) },
    // Where the falloff starts, as a fraction of the radius: low for a soft
    // flush, high for a region with an edge (the lips).
    uSkinTintCore: { value: tintSlots(config.tints, t => t.core ?? 0.25, 0.25) },
  };
  material.userData.playerSkinShading = uniforms;
  chainHook(material, 'player-skin-v1', uniforms, shader => {
    shader.fragmentShader = shader.fragmentShader
      .replace('void main() {', `varying vec3 vPlayerBindPosition;
uniform float uSkinSaturation;
uniform vec3 uSkinTint;
uniform float uSkinPoreScale;
uniform float uSkinPoreStrength;
uniform vec2 uSkinPoreFade;
uniform vec3 uSkinBrowColor;
uniform float uSkinBrowAmount;
uniform vec3 uSkinTintCentre[ ${TINT_SLOTS} ];
uniform vec3 uSkinTintRadius[ ${TINT_SLOTS} ];
uniform vec3 uSkinTintColor[ ${TINT_SLOTS} ];
uniform float uSkinTintAmount[ ${TINT_SLOTS} ];
uniform float uSkinTintCore[ ${TINT_SLOTS} ];
${NOISE_GLSL}
void main() {`)
      .replace('#include <map_fragment>', `#include <map_fragment>
  {
    float skinLuma = dot( diffuseColor.rgb, ${LUMA} );
    // Hair painted into the skin atlas (brows, sideburn edges) is a yellow,
    // saturated orange (hue ~30deg) where skin sits at 10-20deg: give it the
    // hair's brown instead of a mustard stripe, keeping its painted shading.
    float skinMax = max( diffuseColor.r, max( diffuseColor.g, diffuseColor.b ) );
    float skinMin = min( diffuseColor.r, min( diffuseColor.g, diffuseColor.b ) );
    float skinHue = ( diffuseColor.g - diffuseColor.b ) / max( skinMax - skinMin, 0.0001 );
    float skinSat = ( skinMax - skinMin ) / max( skinMax, 0.0001 );
    float browMask = smoothstep( 0.36, 0.46, skinHue ) * smoothstep( 0.5, 0.6, skinSat ) * uSkinBrowAmount;
    diffuseColor.rgb = mix( vec3( skinLuma ), diffuseColor.rgb, uSkinSaturation ) * uSkinTint;
    vec3 browColor = uSkinBrowColor * clamp( skinLuma / 0.32, 0.45, 1.3 );
    diffuseColor.rgb = mix( diffuseColor.rgb, browColor, browMask );
    for ( int i = 0; i < ${TINT_SLOTS}; i ++ ) {
      float tintDistance = length( ( vPlayerBindPosition - uSkinTintCentre[ i ] ) / uSkinTintRadius[ i ] );
      float tintWeight = ( 1.0 - smoothstep( uSkinTintCore[ i ], 1.0, tintDistance ) ) * uSkinTintAmount[ i ] * ( 1.0 - browMask );
      diffuseColor.rgb *= mix( vec3( 1.0 ), uSkinTintColor[ i ], tintWeight );
    }
  }`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
  {
    // Pores: a height field in pre-skinning metres, turned into a normal tilt
    // on the deformed surface with screen derivatives (taken unconditionally).
    vec3 poreCoord = vPlayerBindPosition / uSkinPoreScale;
    float poreHeight = playerValueNoise( poreCoord ) * 0.65 + playerValueNoise( poreCoord * 2.7 ) * 0.35;
    vec3 poreDx = dFdx( -vViewPosition );
    vec3 poreDy = dFdy( -vViewPosition );
    float poreHx = dFdx( poreHeight );
    float poreHy = dFdy( poreHeight );
    float poreFootprint = max( length( dFdx( poreCoord ) ), length( dFdy( poreCoord ) ) );
    float poreFade = ( 1.0 - smoothstep( uSkinPoreFade.x, uSkinPoreFade.y, length( vViewPosition ) ) )
      * ( 1.0 - smoothstep( 0.35, 0.9, poreFootprint ) );
    vec3 poreR1 = cross( poreDy, normal );
    vec3 poreR2 = cross( normal, poreDx );
    float poreDet = dot( poreDx, poreR1 );
    vec3 poreGrad = sign( poreDet ) * ( poreHx * poreR1 + poreHy * poreR2 );
    // Height in metres: relief = pore size x strength.
    normal = normalize( abs( poreDet ) * normal - poreGrad * uSkinPoreScale * uSkinPoreStrength * poreFade );
  }`);
    patchDirectLight(shader, `uniform vec3 uSkinWrap;
uniform vec3 uSkinScatterColor;`, `
	// Wrapped per-channel diffuse: red light reaches further past the
	// terminator than blue, as it does through skin. Normalised so a face
	// lit head-on is unchanged; only the falloff into shadow warms.
	float skinNL = dot( geometryNormal, directLight.direction );
	vec3 skinWrapNL = saturate( ( vec3( skinNL ) + uSkinWrap ) / ( 1.0 + uSkinWrap ) );
	vec3 skinScatter = max( skinWrapNL - vec3( dotNL ), 0.0 ) * uSkinScatterColor;
	reflectedLight.directDiffuse += ( irradiance + skinScatter * directLight.color ) * BRDF_Lambert( material.diffuseContribution );`);
  });
}

export function applyPlayerHairShading(material, config) {
  if (!config || material.userData.playerHairShading) return;
  const uniforms = {
    uHairSaturation: { value: config.saturation ?? 0.85 },
    uHairTint: colorUniform(config.tint, '#ffffff'),
    uHairContrast: { value: config.contrast ?? 1.2 },
    uHairPrimaryColor: colorUniform(config.primaryColor, '#fff4e0'),
    uHairPrimary: vec3Uniform(config.primary, [-0.06, 160, 0.5]),
    uHairSecondary: vec3Uniform(config.secondary, [0.12, 28, 0.6]),
    uHairStrandScale: vec3Uniform(config.strandMetres, [0.0007, 0.014, 0.0007]),
    uHairStrandBreakup: { value: config.strandBreakup ?? 0.6 },
    uHairFillColor: colorUniform(config.fillColor, '#6b4a30'),
  };
  material.userData.playerHairShading = uniforms;
  chainHook(material, 'player-hair-v1', uniforms, shader => {
    shader.fragmentShader = shader.fragmentShader
      .replace('void main() {', `varying vec3 vPlayerBindPosition;
uniform float uHairSaturation;
uniform vec3 uHairTint;
uniform float uHairContrast;
uniform vec3 uHairFillColor;
${NOISE_GLSL}
void main() {`)
      .replace('#include <map_fragment>', `#include <map_fragment>
  {
    // Strand variation, stretched along the combed (downward) direction.
    hairStrand = playerValueNoise( vPlayerBindPosition / uHairStrandScale );
    vec3 hairColor = diffuseColor.rgb;
    float hairLuma = dot( hairColor, ${LUMA} );
    // A few locks' UVs run onto skin-coloured atlas texels (pink slivers at
    // the crown): pale, red-hued texels take the hair's own colour.
    float hairMax = max( hairColor.r, max( hairColor.g, hairColor.b ) );
    float hairMin = min( hairColor.r, min( hairColor.g, hairColor.b ) );
    float hairHue = ( hairColor.g - hairColor.b ) / max( hairMax - hairMin, 0.0001 );
    float skinTexel = ( 1.0 - smoothstep( 0.28, 0.36, hairHue ) ) * smoothstep( 0.32, 0.42, hairLuma );
    hairColor = mix( hairColor, uHairFillColor * clamp( hairLuma / 0.3, 0.6, 1.2 ), skinTexel );
    hairLuma = dot( hairColor, ${LUMA} );
    hairColor = mix( vec3( hairLuma ), hairColor, uHairSaturation );
    // Contrast around the clump midtone deepens the gaps between locks.
    hairColor = pow( hairColor, vec3( uHairContrast ) ) * pow( 0.45, 1.0 - uHairContrast );
    diffuseColor.rgb = hairColor * uHairTint * mix( 0.94, 1.05, hairStrand );
  }`);
    patchDirectLight(shader, `uniform vec3 uHairPrimaryColor;
uniform vec3 uHairPrimary;
uniform vec3 uHairSecondary;
uniform vec3 uHairStrandScale;
uniform float uHairStrandBreakup;
float hairStrand;
float hairKajiyaKay( vec3 tangent, vec3 normal, vec3 halfDir, float shift, float exponent ) {
	vec3 t = normalize( tangent + normal * shift );
	float tDotH = dot( t, halfDir );
	float sinTH = sqrt( max( 1.0 - tDotH * tDotH, 0.0 ) );
	return smoothstep( -1.0, 0.0, tDotH ) * pow( sinTH, exponent );
}`, `
	reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseContribution );
	// Combed direction: world down projected onto the surface (view space).
	vec3 hairDown = ( viewMatrix * vec4( 0.0, -1.0, 0.0, 0.0 ) ).xyz;
	vec3 hairTangent = hairDown - geometryNormal * dot( hairDown, geometryNormal );
	float hairTangentLength = length( hairTangent );
	hairTangent = hairTangentLength > 0.05 ? hairTangent / hairTangentLength : normalize( cross( geometryNormal, vec3( 1.0, 0.0, 0.0 ) ) );
	vec3 hairHalf = normalize( directLight.direction + geometryViewDir );
	float hairJitter = ( hairStrand - 0.5 ) * 0.12;
	float hairLit = saturate( dot( geometryNormal, directLight.direction ) * 0.6 + 0.4 );
	float hairBreak = mix( 1.0, smoothstep( 0.3, 0.75, hairStrand ), uHairStrandBreakup );
	vec3 hairSpec = uHairPrimaryColor * uHairPrimary.z
		* hairKajiyaKay( hairTangent, geometryNormal, hairHalf, uHairPrimary.x + hairJitter, uHairPrimary.y );
	hairSpec += material.diffuseContribution * uHairSecondary.z
		* hairKajiyaKay( hairTangent, geometryNormal, hairHalf, uHairSecondary.x + hairJitter, uHairSecondary.y );
	reflectedLight.directSpecular += hairSpec * hairBreak * hairLit * directLight.color;`);
  });
}

if (typeof window !== 'undefined') {
  window.__darwinSkinHair = () => {
    const out = {};
    window.__darwinScene?.scene.traverse(object => {
      [].concat(object.material || []).forEach(material => {
        if (material?.userData?.playerSkinShading) out.skin = material.userData.playerSkinShading;
        if (material?.userData?.playerHairShading) out.hair = material.userData.playerHairShading;
      });
    });
    return out;
  };
}
