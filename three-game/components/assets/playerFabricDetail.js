// Coat microrelief in pre-skinning coordinates: it follows the cloth rather
// than swimming through an animated body or the fragmented atlas. The height
// gradient is transferred to the deformed surface using screen derivatives.
export function applyPlayerFabricDetail(material, config, heightMap) {
  if (!config?.materialNames?.includes(material.name) || material.userData.fabricDetail) return;
  const uniforms = {
    heightMap: { value: heightMap },
    tileMetres: { value: config.tileMetres ?? 0.18 },
    reliefMetres: { value: config.reliefMetres ?? 0.0006 },
    fade: { value: config.fadeDistance ?? [1, 3] },
  };
  material.userData.fabricDetail = uniforms;
  const previousHook = material.onBeforeCompile;
  const previousKey = material.customProgramCacheKey.bind(material);
  material.customProgramCacheKey = () => `${previousKey()}:player-fabric-height-v1`;
  material.onBeforeCompile = (shader, renderer) => {
    previousHook.call(material, shader, renderer);
    shader.uniforms.uFabricHeight = uniforms.heightMap;
    shader.uniforms.uFabricTile = uniforms.tileMetres;
    shader.uniforms.uFabricRelief = uniforms.reliefMetres;
    shader.uniforms.uFabricFade = uniforms.fade;
    shader.vertexShader = shader.vertexShader
      .replace('void main() {', `varying vec3 vFabricPosition;
varying vec3 vFabricNormal;
void main() {`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
  vFabricPosition = position;
  vFabricNormal = normal;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('void main() {', `uniform sampler2D uFabricHeight;
uniform float uFabricTile;
uniform float uFabricRelief;
uniform vec2 uFabricFade;
varying vec3 vFabricPosition;
varying vec3 vFabricNormal;
void main() {`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
  {
    vec3 fabricCoord = vFabricPosition / uFabricTile;
    vec3 fabricWeights = pow( abs( normalize( vFabricNormal ) ), vec3( 4.0 ) );
    fabricWeights /= max( dot( fabricWeights, vec3( 1.0 ) ), 0.0001 );
    float fabricHeight = dot( fabricWeights, vec3(
      texture2D( uFabricHeight, fabricCoord.zy ).r,
      texture2D( uFabricHeight, fabricCoord.xz ).r,
      texture2D( uFabricHeight, fabricCoord.xy ).r
    ) ) * uFabricRelief;
    // Take derivatives before masking/fading: garment boundaries must not
    // create a false ridge. All fragments execute these derivative operations.
    vec2 fabricSlope = vec2( dFdx( fabricHeight ), dFdy( fabricHeight ) );
    float fabricFootprint = max( length( dFdx( fabricCoord ) ), length( dFdy( fabricCoord ) ) ) * 512.0;
    float fabricFade = ( 1.0 - smoothstep( uFabricFade.x, uFabricFade.y, length( vViewPosition ) ) )
      * ( 1.0 - smoothstep( 2.0, 6.0, fabricFootprint ) );
    // Materialmat includes coat, cream shirt/trousers and leather. Only its
    // muted brown upper garment receives wool. Skin/hair/eyes/brass never use
    // this shader. Conservative feathering excludes white cloth, green vest,
    // saturated leather, boots and the neck; this is an art mask, not relief
    // derived from painted highlights/shadows.
    float fabricMax = max( diffuseColor.r, max( diffuseColor.g, diffuseColor.b ) );
    float fabricMin = min( diffuseColor.r, min( diffuseColor.g, diffuseColor.b ) );
    float fabricSaturation = ( fabricMax - fabricMin ) / max( fabricMax, 0.0001 );
    float fabricMask = ( 1.0 - smoothstep( 0.70, 0.88, fabricSaturation ) )
      * ( 1.0 - smoothstep( 0.32, 0.48, fabricMax ) )
      * smoothstep( -0.005, 0.015, diffuseColor.r - diffuseColor.g )
      * smoothstep( 0.78, 0.86, vFabricPosition.y )
      * ( 1.0 - smoothstep( 1.65, 1.72, vFabricPosition.y ) );
    vec3 fabricDx = dFdx( -vViewPosition );
    vec3 fabricDy = dFdy( -vViewPosition );
    vec3 fabricR1 = cross( fabricDy, normal );
    vec3 fabricR2 = cross( normal, fabricDx );
    float fabricDet = dot( fabricDx, fabricR1 );
    vec3 fabricGradient = sign( fabricDet ) * ( fabricSlope.x * fabricR1 + fabricSlope.y * fabricR2 );
    // Guard degenerate screen-space triangles without changing the original
    // normal when height is flat, missing, faded or outside the garment mask.
    if ( abs( fabricDet ) > 1e-12 ) {
      normal = normalize( abs( fabricDet ) * normal - fabricGradient * fabricMask * fabricFade );
    }
  }`);
  };
  material.needsUpdate = true;
}
