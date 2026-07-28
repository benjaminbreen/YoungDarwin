import * as THREE from 'three';

// Shared aerial perspective for the neighbour apron and the camera-relative
// central-island backdrop.
//
// WHY THIS EXISTS — two failures that no amount of per-layer tuning could fix.
//
// 1. Earlier scenery layers normalised haze against their OWN depth
//    parameters. Two surfaces at the same real distance therefore received
//    different haze, and their boundaries became visible steps. Aerial
//    perspective is a property of the air between camera and surface, so it
//    has to be one curve driven by world distance, evaluated identically
//    everywhere. That is `vistaAir`.
//
// 2. Distant geometry ends up mixed all the way to scene.fog.color. But
//    fogColor is graded for local mist and then luminance-clamped
//    (SkyController ~2424), while the sky dome paints its own, brighter horizon
//    band (~942). At full haze the land is therefore exactly fogColor and the
//    sky directly behind it is exactly the dome's horizon — two different
//    colours meeting along a line. That hard silhouette is a colour
//    discontinuity, not a geometry defect, which is why mesh work aimed at it
//    could never land. `vistaSky` runs AFTER scene fog and pulls the result
//    toward the real horizon colour, so a distant ridge dissolves into the sky
//    instead of standing against it. Being post-fog, it works at any
//    aerialPerspective setting, including the shipping 0.
//
// UNIFORM PLUMBING follows fogAtmosphere.js: these objects are assigned BY
// REFERENCE into each material's shader.uniforms inside onBeforeCompile, which
// runs after three has cloned the built-in uniform block. One write here
// therefore reaches every compiled vista material with no per-material
// bookkeeping and no dependency arrays to forget.
//
// DEGRADATION CONTRACT: uVistaAir.w = 0 disables term 1 and uVistaSky.y = 0
// disables term 2, together reproducing the previous per-layer-only behaviour
// exactly. Keep that property when editing the GLSL — it is the A/B for this
// system, and the dev panel's "Sky match"/"Air max" sliders reach zero for it.

export const vistaAtmosphereUniforms = {
  // The sky dome's horizon band, driven every frame by SkyController.
  uVistaHorizonColor: { value: new THREE.Color(0.62, 0.76, 0.87) },
  // x: metres of fully clear air before haze begins at all
  // y: metres from there to saturation (bounded, so x and y are independent)
  // z: curve exponent (>1 holds the near half flat, then accelerates)
  // w: maximum haze (0 disables the pre-fog term entirely)
  uVistaAir: { value: { x: 90, y: 320, z: 2.6, w: 1 } },
  // x: luminance trim applied to the horizon colour
  // y: post-fog dissolve strength toward that colour (0 disables)
  // z: distance in metres at which the dissolve reaches full strength
  // w: unused
  uVistaSky: { value: { x: 1, y: 0.62, z: 240, w: 0 } },
  // x: saturation retained at full haze (1 keeps colour, 0 goes fully grey)
  // y: value multiplier at full haze — how hard the silhouette reads
  // z: debug layer tint strength (0 = off)
  // w: near-field surface grain strength
  uVistaGrade: { value: { x: 1, y: 1, z: 0, w: 1 } },
  // Valley haze: extra aerial perspective pooling low and thinning toward
  // ridgelines, the way haze actually sits in a landscape.
  //
  // Its real job here is feathering. A distant layer meets the ground in front
  // of it along a hard line — the near terrain's crest against the far layer's
  // flank — and that is the starkest edge in the frame, because the two sides
  // differ in texture detail, value and colour all at once. Fading the FOOT of
  // each distant layer while leaving its crest defined turns that cut into a
  // gradient. It is what a landscape painter does, and no amount of geometry
  // work achieves it.
  //
  // x: strength at the bottom of the band (0 disables)
  // y: metres above WATER_LEVEL where it has faded out
  uVistaValley: { value: { x: 0.55, y: 26, z: 0, w: 0 } },
};

// Per-family debug colours, used only when uVistaGrade.z > 0. Isolating which
// layer a seam or see-through belongs to by eye is otherwise guesswork: the
// apron and shell converge on nearly the same haze colour at range, which is
// exactly when handoff artefacts are hardest to identify.
export const VISTA_LAYER_DEBUG_TINT = {
  apron: [0.95, 0.35, 0.30],
};

// Declarations plus the shared functions, included in the fragment stage of
// every vista material. Requires the `vVistaWorldPosition` varying below and
// the built-in `cameraPosition` uniform (three declares it in the fragment
// prefix for every material).
export const VISTA_AIR_PARS_GLSL = /* glsl */`
  uniform vec3 uVistaHorizonColor;
  uniform vec4 uVistaAir;
  uniform vec4 uVistaSky;
  uniform vec4 uVistaGrade;
  uniform vec4 uVistaValley;
  uniform vec3 uVistaLayerTint;
  varying vec3 vVistaWorldPosition;

  // How deep in the valley haze this fragment sits: 1 at sea level, 0 once
  // clear of the band. Distance-gated so ground near the player is untouched.
  float vistaValleyAmount(float dist) {
    float height = (vVistaWorldPosition.y + 0.9) / max(1.0, uVistaValley.y);
    float low = 1.0 - clamp(height, 0.0, 1.0);
    low = low * low;
    return clamp(uVistaValley.x, 0.0, 1.0) * low * smoothstep(30.0, 110.0, dist);
  }

  // Aerial perspective by true camera distance.
  //
  // The shape matters more than the amount. A single exponent over an
  // unbounded ramp made one parameter control both how fast haze accumulates
  // near you AND how much of it reaches the horizon, and tuning for a strong
  // horizon then put the steep part of the curve at 80-150 m — right across the
  // near apron. Ground there is one continuous dune field, so a crest at 80 m
  // and the trough behind it at 120 m picked up 40 percentage points of
  // different haze and the surface broke into interleaved warm and blue
  // patches. That reads as two layers z-fighting; it is one surface with an
  // absurd gradient painted across it.
  //
  // So: normalise the ramp over a bounded span (x = metres of fully clear air,
  // y = metres from there to saturation) and shape it with an exponent that
  // keeps the near half nearly flat. The exponential at the end approaches full
  // haze asymptotically instead of clipping, so the far horizon still resolves.
  float vistaAirAmount(float dist) {
    float t = clamp((dist - uVistaAir.x) / max(1.0, uVistaAir.y), 0.0, 1.0);
    float shaped = pow(t, max(0.5, uVistaAir.z));
    return clamp(uVistaAir.w, 0.0, 1.0) * (1.0 - exp(-3.0 * shaped));
  }

  // How far along the fog-to-sky handoff a surface sits. Near the camera the
  // haze must agree with scene fog, or the apron disagrees with the local
  // terrain it is stitched to along the map edge.
  float vistaSkyward(float dist) {
    float t = clamp(dist / max(1.0, uVistaSky.z), 0.0, 1.0);
    return t * t * (3.0 - 2.0 * t);
  }

  vec3 vistaHorizonTarget() {
    return uVistaHorizonColor * max(0.0, uVistaSky.x);
  }

  // What distance does to a surface before any haze is mixed over it: it eats
  // saturation, and it flattens the value range. Separating these from the haze
  // mix is what makes a distant ridge tunable as a silhouette — haze alone can
  // only make it more or less visible, not harder or softer edged.
  vec3 vistaGrade(vec3 color, float air) {
    float luma = dot(color, vec3(0.2126, 0.7152, 0.0722));
    color = mix(color, vec3(luma), (1.0 - clamp(uVistaGrade.x, 0.0, 1.0)) * air);
    return color * mix(1.0, max(0.0, uVistaGrade.y), air);
  }
`;

// Pre-fog term, applied after each layer's own near-field grade and inside
// `#ifdef USE_FOG` (fogColor only exists there).
//
// `layerAir` is the layer's OWN haze, and the two compose as independent
// extinction rather than as two sequential mixes. Mixing twice let the shared
// curve overwrite the per-layer one — at 150 m the shared term already reaches
// 86%, so the apron's own haze sliders moved the colour and then had it wiped
// out in the next line, which reads at the panel as dead knobs. Composed this
// way, raising a layer's haze always makes it hazier than the shared curve and
// lowering it always makes it clearer, at every distance.
export function vistaAirApplyGlsl(layerAir = '0.0') {
  return /* glsl */`
  {
    float vistaDistance = length(vVistaWorldPosition - cameraPosition);
    float vistaLayerAir = clamp(${layerAir}, 0.0, 1.0);
    float vistaAir = 1.0 - (1.0 - vistaLayerAir) * (1.0 - vistaAirAmount(vistaDistance));
    // Valley haze composes the same way — another slab of air, not a repaint.
    vistaAir = 1.0 - (1.0 - vistaAir) * (1.0 - vistaValleyAmount(vistaDistance));
    vec3 vistaTarget = mix(
      fogColor,
      vistaHorizonTarget(),
      clamp(uVistaSky.y, 0.0, 1.0) * vistaSkyward(vistaDistance)
    );
    // Grade AFTER the haze mix. Grading the source colour first meant that at
    // 90% haze only 10% of the graded pixel survived, so the saturation and
    // contrast sliders were mathematically gated to near-zero authority exactly
    // where they were meant to work. Applied here they control the distant band
    // itself, which is what makes a ridge read as a hard silhouette or a wash.
    vec3 vistaMixed = mix(diffuseColor.rgb, vistaTarget, vistaAir);
    diffuseColor.rgb = vistaGrade(vistaMixed, vistaAir);
  }
`;
}

// Post-fog term: the one that actually removes the silhouette edge. Scene fog
// has just pushed this fragment toward fogColor; pull it the rest of the way
// to the sky the player can see directly above it.
export const VISTA_SKY_APPLY_GLSL = /* glsl */`
  {
    float vistaSkyDistance = length(vVistaWorldPosition - cameraPosition);
    float vistaDissolve = clamp(uVistaSky.y, 0.0, 1.0)
      * vistaSkyward(vistaSkyDistance)
      * vistaAirAmount(vistaSkyDistance);
    gl_FragColor.rgb = mix(gl_FragColor.rgb, vistaHorizonTarget(), vistaDissolve);
    if (uVistaGrade.z > 0.0) {
      gl_FragColor.rgb = mix(
        gl_FragColor.rgb,
        uVistaLayerTint,
        clamp(uVistaGrade.z, 0.0, 1.0)
      );
    }
  }
`;

// Vertex-stage counterpart. Declared separately because the two material
// families patch different chunks, but the varying is written in one place.
export const VISTA_AIR_VERTEX_PARS_GLSL = /* glsl */`
  varying vec3 vVistaWorldPosition;
`;

export const VISTA_AIR_VERTEX_APPLY_GLSL = /* glsl */`
  vVistaWorldPosition = (modelMatrix * vec4(transformed, 1.0)).xyz;
`;

// Copy the live dev-panel values onto the shared uniforms. Called once per
// frame from BorderVistas rather than through per-material useEffects: those
// carried a dependency array per knob, and a knob added without a matching
// entry silently did nothing. One frame-driven copy cannot go stale.
export function driveVistaAtmosphere(tuning) {
  const air = vistaAtmosphereUniforms.uVistaAir.value;
  air.x = tuning.vistaAirStart;
  air.y = tuning.vistaAirScale;
  air.z = tuning.vistaAirCurve;
  air.w = tuning.vistaAirMax;
  const sky = vistaAtmosphereUniforms.uVistaSky.value;
  sky.x = tuning.vistaSkyLift;
  sky.y = tuning.vistaSkyMatch;
  sky.z = tuning.vistaSkyFull;
  const grade = vistaAtmosphereUniforms.uVistaGrade.value;
  grade.x = tuning.vistaSaturation;
  grade.y = tuning.vistaContrast;
  grade.z = tuning.debugLayerTint ? 0.55 : 0;
  grade.w = tuning.vistaGrain;
  const valley = vistaAtmosphereUniforms.uVistaValley.value;
  valley.x = tuning.vistaValleyHaze;
  valley.y = tuning.vistaValleyHeight;
}
