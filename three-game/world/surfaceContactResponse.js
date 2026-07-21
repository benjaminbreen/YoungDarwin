const RESPONSE_BY_KIND = {
  water: {
    particleScale: 0,
    liftScale: 0,
    lateralScale: 0,
    lifeScale: 0,
    sizeScale: 0,
    alphaScale: 0,
    ringStrength: 0,
    markStrength: 0,
    markLifetime: 0,
  },
  dust: {
    particleScale: 1.3,
    liftScale: 1.12,
    lateralScale: 0.9,
    lifeScale: 1.12,
    sizeScale: 1.22,
    alphaScale: 1.28,
    ringStrength: 0.78,
    markStrength: 0.5,
    markLifetime: 38,
  },
  ash: {
    particleScale: 1.42,
    liftScale: 1.35,
    lateralScale: 0.78,
    lifeScale: 1.45,
    sizeScale: 1.25,
    alphaScale: 1.12,
    ringStrength: 0.88,
    markStrength: 0.7,
    markLifetime: 48,
    ringColor: '#c6a678',
    particles: ['#d0b083', '#a88960', '#e0c59b'],
  },
  sand: {
    particleScale: 1.08,
    liftScale: 0.46,
    lateralScale: 1.42,
    lifeScale: 0.72,
    sizeScale: 1.02,
    alphaScale: 1.2,
    ringStrength: 0.3,
    markStrength: 0.88,
    markLifetime: 58,
    ringColor: '#d8cf9a',
    particles: ['#e4d9a7', '#bfb779', '#f0e5b9'],
  },
  mud: {
    particleScale: 0.38,
    liftScale: 0.18,
    lateralScale: 0.62,
    lifeScale: 0.58,
    sizeScale: 0.82,
    alphaScale: 1.18,
    ringStrength: 0.16,
    markStrength: 0.94,
    markLifetime: 72,
    ringColor: '#58553e',
    particles: ['#4f4c38', '#6b674b', '#3f3d31'],
  },
  grit: {
    particleScale: 0.42,
    liftScale: 0.32,
    lateralScale: 1.5,
    lifeScale: 0.5,
    sizeScale: 0.48,
    alphaScale: 1.08,
    ringStrength: 0.12,
    markStrength: 0.035,
    markLifetime: 18,
    ringColor: '#3a352b',
    particles: ['#2a2824', '#4b4438', '#1f211f'],
  },
  litter: {
    particleScale: 0.48,
    liftScale: 0.72,
    lateralScale: 1.15,
    lifeScale: 0.72,
    sizeScale: 0.66,
    alphaScale: 0.92,
    ringStrength: 0.08,
    markStrength: 0.22,
    markLifetime: 18,
    ringColor: '#94865d',
    particles: ['#7f7448', '#a18d55', '#4f5433'],
  },
  foliage: {
    particleScale: 0.55,
    liftScale: 1.05,
    lateralScale: 0.82,
    lifeScale: 0.82,
    sizeScale: 0.62,
    alphaScale: 1,
    ringStrength: 0,
    markStrength: 0,
    markLifetime: 0,
    particles: ['#77783c', '#a08b4e', '#4d492c'],
  },
  wood: {
    particleScale: 0.34,
    liftScale: 0.58,
    lateralScale: 1.08,
    lifeScale: 0.58,
    sizeScale: 0.48,
    alphaScale: 1.1,
    ringStrength: 0,
    markStrength: 0,
    markLifetime: 0,
    particles: ['#76573a', '#a47b50', '#4e3929'],
  },
  solid: {
    particleScale: 0,
    liftScale: 0,
    lateralScale: 0,
    lifeScale: 0,
    sizeScale: 0,
    alphaScale: 0,
    ringStrength: 0,
    markStrength: 0,
    markLifetime: 0,
  },
};

const DEFAULT_RESPONSE = RESPONSE_BY_KIND.dust;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function normalizedText(value) {
  return String(value || '').trim().toLowerCase();
}

export function inferContactResponseKind(profile = {}, target = null) {
  const explicit = normalizedText(target?.contactMaterial || target?.material);
  if (RESPONSE_BY_KIND[explicit]) return explicit;

  const targetText = [target?.kind, target?.type, target?.id, target?.label]
    .map(normalizedText)
    .filter(Boolean)
    .join(' ');
  if (/tree|branch|shrub|bush|cactus|prickly|palo.santo|plant/.test(targetText)) return 'foliage';
  if (/wood|timber|barrel|crate|stool|chair|table|chest|door|shelf/.test(targetText)) return 'wood';
  if (/rock|stone|basalt|lava|boulder/.test(targetText)) return 'grit';
  if (/glass|bottle|mug|metal|iron|brass|tin|ceramic|bowl|jug/.test(targetText)) return 'solid';

  const kind = normalizedText(profile.kind);
  const biome = normalizedText(profile.biome);
  if (biome === 'black-sand') return 'sand';
  if (kind !== 'dust' && RESPONSE_BY_KIND[kind]) return kind;
  // Region modules use more specific biome names than the shared profile
  // table. Infer their material family rather than silently treating every
  // unlisted beach, mud trail, or basalt shelf as generic dust.
  if (/mud|bog|stream.bank|creek.bank|damp.*bank|pool.edge|wet.hollow|garden.mud/.test(biome)) return 'mud';
  if (/sand|beach|dune/.test(biome)) return 'sand';
  if (/ash|tuff|cinder/.test(biome)) return 'ash';
  if (/basalt|lava|boulder|rock|cliff|guano/.test(biome)) return 'grit';
  if (/dry.scrub|palo.santo|dry.wash|path|trail|clearing|yard|court|threshold/.test(biome)) return 'dust';
  if (/grass|scrub|underbrush|meadow|palo.santo|fern|hollow|homestead.yard|trampled.court/.test(biome)) return 'litter';
  return RESPONSE_BY_KIND[kind] ? kind : 'dust';
}

function kindScale(kind) {
  if (kind === 'takeoff') return 1.25;
  if (kind === 'footstep') return 1.05;
  if (kind === 'step-up') return 1.15;
  if (kind === 'collision') return 1.2;
  if (kind === 'skid' || kind === 'scramble') return 1.5;
  if (kind === 'landing-jump' || kind === 'landing') return 1.55;
  return 0.7;
}

export function resolveSurfaceContactResponse(profile = {}, event = {}) {
  const responseKind = inferContactResponseKind(profile, event.target);
  const style = RESPONSE_BY_KIND[responseKind] || DEFAULT_RESPONSE;
  const inferredFromGenericDust = profile.kind === 'dust' && responseKind !== 'dust';
  const contactKind = event.kind || 'dust';
  const wetness = clamp(Number(profile.wetness) || 0, 0, 1);
  const looseness = clamp(Number(profile.dustiness) || 0, 0, 1.5);
  const materialStrength = responseKind === 'mud'
    ? Math.max(looseness, wetness * 0.3)
    : responseKind === 'foliage' || responseKind === 'wood'
      ? Math.max(looseness, 0.3)
      : looseness;
  const fallSpeed = Math.max(0, Number(event.fallSpeed) || 0);
  const travelDistance = Math.max(0, Number(event.travelDistance) || 0);
  const jumpBoost = contactKind === 'landing' || contactKind === 'landing-jump'
    ? clamp(travelDistance / 9.5 + fallSpeed / 34, 0, 0.42)
    : 0;
  const requestedIntensity = Number(event.intensity);
  const strength = clamp(
    (Number.isFinite(requestedIntensity) ? requestedIntensity : 0.36) * kindScale(contactKind) * materialStrength + jumpBoost,
    0,
    1.18,
  );
  const showRing = contactKind !== 'footstep'
    && contactKind !== 'collision'
    && style.ringStrength > 0.05
    && strength > 0.08;

  return {
    ...style,
    responseKind,
    strength,
    showRing,
    particles: inferredFromGenericDust
      ? (style.particles || profile.particles)
      : (profile.particles || style.particles || ['#cdbb88', '#9d8e61', '#d8c99d']),
    ringColor: inferredFromGenericDust
      ? (style.ringColor || profile.ring || '#bca776')
      : (profile.ring || style.ringColor || '#bca776'),
    opacity: clamp(Number(profile.opacity) || 0.18, 0.04, 0.72),
  };
}

export function resolveFootprintResponse(profile = {}, intensity = 0.5) {
  const responseKind = inferContactResponseKind(profile);
  const style = RESPONSE_BY_KIND[responseKind] || DEFAULT_RESPONSE;
  const pressure = clamp(Number(intensity) || 0, 0, 1);
  const wetness = clamp(Number(profile.wetness) || 0, 0, 1);
  const opacity = clamp(style.markStrength * (0.74 + pressure * 0.46 + wetness * 0.18), 0, 1);
  return {
    responseKind,
    visible: opacity >= 0.08,
    opacity,
    lifetime: style.markLifetime * (0.86 + pressure * 0.28),
    // Wet ground is darker; pale ash/sand remains a shallow shadow rather than
    // a black decal painted over the terrain.
    color: responseKind === 'mud'
      ? '#211f18'
      : responseKind === 'ash'
        ? '#514638'
        : responseKind === 'sand'
          ? '#4c4532'
          : '#40382b',
    widthScale: 0.98 + pressure * 0.1,
    lengthScale: 1 + pressure * 0.14,
  };
}
