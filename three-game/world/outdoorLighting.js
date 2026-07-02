function clamp01(value) {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}

function smoothstep(edge0, edge1, value) {
  if (edge0 === edge1) return value >= edge1 ? 1 : 0;
  const t = clamp01((value - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

function lerp(a, b, t) {
  return a + (b - a) * clamp01(t);
}

export function computeOutdoorLightRig({
  daylight = 0,
  golden = 0,
  elevation = 0,
  overcast = 0,
  mist = 0,
  rain = 0,
  lightDim = 0,
  moonFraction = 0,
  underwaterAmount = 0,
} = {}) {
  const d = clamp01(daylight);
  const g = clamp01(golden);
  const cloud = clamp01(overcast);
  const mistAmount = clamp01(mist);
  const rainAmount = clamp01(rain);
  const dim = clamp01(lightDim);
  const underwater = clamp01(underwaterAmount);
  const moon = clamp01(moonFraction);

  const sunAboveHorizon = smoothstep(-0.035, 0.13, elevation);
  const highSun = smoothstep(0.16, 0.58, elevation) * d;
  const lowSun = sunAboveHorizon * (1 - highSun);
  const weatherSoftness = clamp01(cloud * 0.72 + mistAmount * 0.48 + rainAmount * 0.58);
  const clearSky = clamp01((1 - cloud * 0.9) * (1 - mistAmount * 0.5) * (1 - rainAmount * 0.75));
  const hardSun = clamp01(d * clearSky * highSun * (1 - g * 0.38));
  const goldenSideLight = clamp01(d * g * clearSky);
  const moonlight = (1 - d) * 0.16 * (0.35 + moon * 0.65);

  const keyIntensity = Math.max(
    0.08,
    (0.18
      + d * (2.42 + hardSun * 0.72 + goldenSideLight * 0.36 - weatherSoftness * 0.82)
      + moonlight)
      * (1 - dim * 0.24)
      * (1 - underwater * 0.22),
  );

  const hemiIntensity = Math.max(
    0.16,
    (0.32
      + d * (0.9 + weatherSoftness * 0.62 + g * 0.08 - hardSun * 0.24)
      + cloud * 0.1)
      * (1 - dim * 0.18)
      * (1 - underwater * 0.2),
  );

  const ambientIntensity = Math.max(
    0.12,
    (0.22
      + d * (0.12 + weatherSoftness * 0.24 + mistAmount * 0.06 - hardSun * 0.08)
      + (1 - d) * 0.04)
      * (1 - underwater * 0.24),
  );

  const fillIntensity = Math.max(
    0.04,
    (0.12
      + d * (0.13 + weatherSoftness * 0.4 + g * 0.14 - hardSun * 0.09))
      * (1 - dim * 0.32)
      * (1 - underwater * 0.34),
  );

  const localWarmFillIntensity = Math.max(
    0,
    (0.12
      + d * (0.16 + g * 0.14 + weatherSoftness * 0.08 - hardSun * 0.08)
      + (1 - d) * 0.12)
      * (1 - dim * 0.28)
      * (1 - underwater * 0.58),
  );

  const shadowExtent = lerp(17.5, 24, clamp01(lowSun * 0.8 + g * 0.45));
  const shadowContrast = clamp01(0.26 + hardSun * 0.62 + goldenSideLight * 0.18 - weatherSoftness * 0.32);
  const shadowSoftness = clamp01(0.16 + weatherSoftness * 0.62 + lowSun * 0.32 + g * 0.22 - hardSun * 0.18);
  const shadowRadius = lerp(0.65, 3.4, shadowSoftness);
  const shadowIntensity = clamp01(0.94 - weatherSoftness * 0.48 - g * 0.1 + hardSun * 0.08);
  const shadowNormalBias = lerp(0.018, 0.032, clamp01(lowSun * 0.68 + weatherSoftness * 0.32));
  const shadowBias = lerp(-0.00013, -0.00006, weatherSoftness);
  const terrainSunWarmth = clamp01(d * clearSky * (0.18 + highSun * 0.26 + g * 0.42));
  const terrainCoolShade = clamp01(d * (0.16 + hardSun * 0.24) * (1 - weatherSoftness * 0.48));
  const terrainWetShine = clamp01(d * clearSky * (0.14 + hardSun * 0.34 + g * 0.18) + rainAmount * 0.3);

  return {
    keyIntensity,
    hemiIntensity,
    ambientIntensity,
    fillIntensity,
    localWarmFillIntensity,
    shadowExtent,
    shadowContrast,
    shadowSoftness,
    shadowRadius,
    shadowIntensity,
    shadowNormalBias,
    shadowBias,
    terrainSunWarmth,
    terrainCoolShade,
    terrainWetShine,
    clearSky,
    hardSun,
    highSun,
    lowSun,
    weatherSoftness,
    goldenSideLight,
  };
}
