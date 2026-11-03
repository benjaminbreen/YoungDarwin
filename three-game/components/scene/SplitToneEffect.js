import { Uniform, Vector3 } from 'three';
import { BlendFunction, Effect } from 'postprocessing';

// Shadow/highlight split toning for the time-of-day grade (colorGrade.js).
// Each tint is renormalised to unit luminance, so a tint shifts hue without
// moving brightness, and the two are blended in by the pixel's own luminance.
// No texture reads or extra attributes: it merges into the existing effect
// pass at the cost of a few ALU ops per pixel.
const SPLIT_TONE_FRAGMENT = /* glsl */`
  uniform vec3 highlightTint;
  uniform vec3 shadowTint;
  uniform float strength;

  void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
    const vec3 lumaWeights = vec3(0.2126, 0.7152, 0.0722);
    float luma = dot(inputColor.rgb, lumaWeights);
    vec3 hi = highlightTint / max(dot(highlightTint, lumaWeights), 0.001);
    vec3 lo = shadowTint / max(dot(shadowTint, lumaWeights), 0.001);
    float lit = smoothstep(0.08, 0.75, luma);
    vec3 tint = mix(lo, hi, lit);
    outputColor = vec4(inputColor.rgb * mix(vec3(1.0), tint, strength), inputColor.a);
  }
`;

export class SplitToneEffect extends Effect {
  constructor() {
    super('SplitToneEffect', SPLIT_TONE_FRAGMENT, {
      blendFunction: BlendFunction.SRC,
      uniforms: new Map([
        ['highlightTint', new Uniform(new Vector3(1, 1, 1))],
        ['shadowTint', new Uniform(new Vector3(1, 1, 1))],
        ['strength', new Uniform(1)],
      ]),
    });
  }

  setTints(highlight, shadow, strength) {
    this.uniforms.get('highlightTint').value.set(highlight[0], highlight[1], highlight[2]);
    this.uniforms.get('shadowTint').value.set(shadow[0], shadow[1], shadow[2]);
    this.uniforms.get('strength').value = strength;
  }
}
