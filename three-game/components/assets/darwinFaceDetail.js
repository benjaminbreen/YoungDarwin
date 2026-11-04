import * as THREE from 'three';

// B-only face treatment, kept separate from the shared Opus shaders. Positions
// refer to the Darwin5 bind pose, not the brow centres used by the old gloss
// overlays. The eye aperture is about 8 mm high, beneath those overlays.
export function installDarwinFaceDetail(material) {
  if (material.userData.codexFaceDetail) return material.userData.codexFaceDetail;
  const state = { enabled: { value: 0 } };
  material.userData.codexFaceDetail = state;
  const previousHook = material.onBeforeCompile;
  const previousKey = material.customProgramCacheKey.bind(material);
  material.customProgramCacheKey = () => `${previousKey()}:codex-face-detail-v1`;
  material.onBeforeCompile = (shader, renderer) => {
    previousHook?.call(material, shader, renderer);
    shader.uniforms.uCodexFaceDetail = state.enabled;
    shader.uniforms.uCodexIris = { value: new THREE.Color('#65777c') };
    shader.uniforms.uCodexSclera = { value: new THREE.Color('#d9cfc1') };
    shader.vertexShader = shader.vertexShader
      .replace('void main() {', 'varying vec3 vCodexFacePosition;\nvoid main() {')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvCodexFacePosition = position;');
    shader.fragmentShader = shader.fragmentShader.replace('void main() {', `
varying vec3 vCodexFacePosition;
uniform float uCodexFaceDetail;
uniform vec3 uCodexIris;
uniform vec3 uCodexSclera;
float codexEyeWeight = 0.0;
void main() {`);
    // The shared hue classifier also catches some ordinary face texels. Limit
    // its brown recolouring to the actual brows in B, rather than allowing
    // isolated cheek/forehead triangles to turn grey-brown.
    shader.fragmentShader = shader.fragmentShader.replace('vec3 browColor =', `
    if (uCodexFaceDetail > 0.5) {
      float browX = min(abs(vCodexFacePosition.x + 0.0232), abs(vCodexFacePosition.x - 0.0444));
      float browBand = smoothstep(1.809, 1.814, vCodexFacePosition.y)
        * (1.0 - smoothstep(1.832, 1.839, vCodexFacePosition.y))
        * (1.0 - smoothstep(0.026, 0.036, browX));
      browMask *= browBand;
    }
    vec3 browColor =`);
    shader.fragmentShader = shader.fragmentShader.replace('hairColor = mix( hairColor, uHairFillColor', `
    if (uCodexFaceDetail > 0.5 && vCodexFacePosition.y < 1.885
      && vCodexFacePosition.z > 0.075 && abs(vCodexFacePosition.x - 0.0105) < 0.065) skinTexel = 0.0;
    hairColor = mix( hairColor, uHairFillColor`);
    // Run after the shared albedo grading. Keep eyelid edges and surrounding
    // skin outside a small almond aperture; no floating eyeball/brow shells.
    shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
  if (uCodexFaceDetail > 0.5) {
    float eyeCentreX = vCodexFacePosition.x < 0.0105 ? -0.0248 : 0.0444;
    float eyeSide = vCodexFacePosition.x < 0.0105 ? -1.0 : 1.0;
    vec2 eyeDelta = vCodexFacePosition.xy - vec2(eyeCentreX, 1.8075);
    eyeDelta.y += eyeDelta.x * eyeSide * 0.04;
    float eyeHorizontal = abs(eyeDelta.x) / 0.014;
    float eyeHalfHeight = 0.0044 * pow(max(0.0, 1.0 - eyeHorizontal * eyeHorizontal), 0.65);
    float eyeEdge = max(eyeHorizontal - 1.0, (abs(eyeDelta.y) - eyeHalfHeight) / 0.0044);
    float eyeAA = max(fwidth(eyeEdge), 0.035);
    codexEyeWeight = (1.0 - smoothstep(-eyeAA, eyeAA, eyeEdge))
      * smoothstep(0.092, 0.105, vCodexFacePosition.z);
    float irisRadius = length(eyeDelta) / 0.0055;
    float irisAA = max(fwidth(irisRadius), 0.02);
    float irisMask = 1.0 - smoothstep(0.94 - irisAA, 1.0 + irisAA, irisRadius);
    float pupilMask = 1.0 - smoothstep(0.38 - irisAA, 0.38 + irisAA, irisRadius);
    float irisAngle = atan(eyeDelta.y, eyeDelta.x);
    float irisFibre = sin(irisAngle * 43.0 + sin(irisAngle * 17.0) * 2.0 + irisRadius * 9.0);
    // Fade radial detail before it becomes subpixel; keep the pupil readable.
    float fibreFade = 1.0 - smoothstep(0.04, 0.18, fwidth(irisRadius));
    vec3 irisColor = uCodexIris * (0.9 + 0.12 * irisFibre * fibreFade);
    irisColor *= mix(1.0, 0.4, smoothstep(0.75, 1.0, irisRadius));
    vec3 eyeColor = mix(uCodexSclera, irisColor, irisMask);
    eyeColor = mix(eyeColor, vec3(0.006, 0.008, 0.009), pupilMask);
    // A broad upper-lid shadow, rather than a painted white highlight.
    eyeColor *= mix(0.65, 1.0, 1.0 - smoothstep(-0.0025, 0.0035, eyeDelta.y));
    diffuseColor.rgb = mix(diffuseColor.rgb, eyeColor, codexEyeWeight);
  }
`);
    shader.fragmentShader = shader.fragmentShader.replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
  roughnessFactor = mix(roughnessFactor, 0.24, codexEyeWeight);`);
  };
  material.needsUpdate = true;
  return state;
}
