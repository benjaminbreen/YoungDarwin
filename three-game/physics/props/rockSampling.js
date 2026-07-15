export const ROCK_SAMPLE_STRIKE_RANGE = 2.85;
export const ROCK_SAMPLE_FACING_DOT = 0.35;
export const ROCK_SAMPLE_MIN_HEIGHT = 0.45;

const DEFAULT_OUTCOME = {
  key: 'clean_chip',
  condition: 'clean_chip',
  quality: 'clean',
  scoreDelta: 2,
  fatigueDelta: 1,
  evidence: 'freshly fractured geological sample',
};

export const HAMMER_MATERIAL_PROFILES = {
  basalt: {
    material: 'basalt',
    specimenId: 'basalt',
    sampleNoun: 'basalt chip',
    promptText: 'Press E to collect basalt chip',
    shape: 'chunk',
    colors: ['#262a27', '#30342f', '#1f2422'],
    fractureColor: '#4d5457',
    scarColor: '#151817',
    dustColor: '#5b5140',
    fx: { dustCount: 14, puffCount: 1, sparkCount: 5, sparkColor: '#ffd36a', puffSize: 0.16 },
    impulseScale: 1,
    educationalNote: 'A fresh basalt fracture shows vesicles and mineral grains more clearly than the weathered outer rind.',
    soundMessage: 'The hammer gives a hard ringing clack against dense basalt.',
    soundSyms: 'Syms winces. "That one rings like ship iron, sir."',
    outcomes: [
      {
        key: 'clean_chip',
        condition: 'clean_basalt_chip',
        quality: 'clean',
        scoreDelta: 2,
        evidence: 'fresh vesicular basalt chip',
        collectMessage: 'You chip a palm-sized basalt sample from the outcrop and wrap its fresh edge for the specimen case.',
        symsLine: 'Syms folds the paper tight. "A clean chip, sir, enough to show the vesicles and grain."',
      },
      {
        key: 'weathered_flake',
        condition: 'weathered_basalt_flake',
        quality: 'weathered',
        scoreDelta: 1,
        evidence: 'weathered basalt flake with a small fresh edge',
        collectMessage: 'A weathered basalt flake skips loose, still showing a narrow fresh fracture along one edge.',
      },
      {
        key: 'vesicle_face',
        condition: 'vesicular_face',
        quality: 'diagnostic',
        scoreDelta: 3,
        evidence: 'basalt face exposing vesicles from trapped volcanic gas',
        collectMessage: 'The blow opens a vesicular face in the basalt, exposing tiny gas pockets in the dark stone.',
      },
    ],
  },
  scoria: {
    material: 'scoria',
    specimenId: 'scoria',
    sampleNoun: 'red scoria fragment',
    promptText: 'Press E to collect scoria fragment',
    shape: 'jagged',
    colors: ['#7a3b24', '#9a5430', '#5a2f22'],
    fractureColor: '#b06a41',
    scarColor: '#9f5f39',
    dustColor: '#9a6843',
    fx: { dustCount: 22, puffCount: 2, sparkCount: 1, sparkColor: '#ffc46b', puffSize: 0.18 },
    impulseScale: 1.18,
    educationalNote: 'Scoria is gas-rich volcanic rock; its reddish color commonly records oxidation of iron-bearing minerals.',
    soundMessage: 'The hammer bites into the scoria with a gritty, hollow crunch.',
    soundSyms: 'Syms brushes red dust from his sleeve. "Lighter than it looks, sir."',
    outcomes: [
      {
        key: 'porous_chunk',
        condition: 'porous_scoria_chunk',
        quality: 'clean',
        scoreDelta: 2,
        evidence: 'porous red scoria with open vesicles',
        collectMessage: 'A porous red scoria fragment breaks free, light in the hand despite its jagged size.',
      },
      {
        key: 'crumbled_edge',
        condition: 'crumbled_scoria_edge',
        quality: 'crumbled',
        scoreDelta: 1,
        evidence: 'crumbled red scoria edge with oxidation staining',
        collectMessage: 'The scoria crumbles at the edge, but one red porous piece remains sound enough to label.',
      },
    ],
  },
  tuff: {
    material: 'tuff',
    specimenId: 'tuff',
    sampleNoun: 'tuff flake',
    promptText: 'Press E to collect tuff flake',
    shape: 'flake',
    colors: ['#a78658', '#c09a65', '#7d6447'],
    fractureColor: '#d3b98a',
    scarColor: '#c2a073',
    dustColor: '#b99a70',
    fx: { dustCount: 30, puffCount: 4, sparkCount: 0, puffSize: 0.24 },
    impulseScale: 0.78,
    educationalNote: 'Tuff forms from compacted volcanic ash and ejecta, so it powders and flakes differently from dense lava.',
    soundMessage: 'The hammer answers with a dull dusty tap rather than a basalt ring.',
    soundSyms: 'Syms coughs lightly. "More powder than chip, sir."',
    outcomes: [
      {
        key: 'layered_flake',
        condition: 'layered_tuff_flake',
        quality: 'diagnostic',
        scoreDelta: 3,
        evidence: 'layered volcanic tuff flake with ash grains',
        collectMessage: 'A flat tuff flake peels away, its pale layers showing compacted ash and small volcanic grains.',
      },
      {
        key: 'powdered_chip',
        condition: 'powdered_tuff_chip',
        quality: 'fragile',
        scoreDelta: 1,
        evidence: 'fragile tuff chip with powdery fracture',
        collectMessage: 'The softer tuff powders under the hammer, leaving one fragile chip worth saving.',
      },
    ],
  },
  olivine: {
    material: 'olivine',
    specimenId: 'olivine',
    sampleNoun: 'olivine-bearing chip',
    promptText: 'Press E to collect olivine-bearing chip',
    shape: 'sliver',
    colors: ['#7d8243', '#9c9850', '#697438'],
    fractureColor: '#b3b467',
    scarColor: '#9a995e',
    dustColor: '#a49b65',
    fx: { dustCount: 16, puffCount: 1, sparkCount: 3, sparkColor: '#d8d570', puffSize: 0.14 },
    impulseScale: 0.9,
    educationalNote: 'Olivine crystals weather out of basaltic rock and can tint beaches a greenish yellow where grains accumulate.',
    soundMessage: 'A faint glassy tick follows the hammer strike, as if small crystals shifted inside the stone.',
    soundSyms: 'Syms turns the chip toward the light. "Green flecks in it, sir."',
    outcomes: [
      {
        key: 'crystal_fleck',
        condition: 'olivine_crystal_fleck',
        quality: 'diagnostic',
        scoreDelta: 3,
        evidence: 'basaltic chip with visible olivine flecks',
        collectMessage: 'The chip catches the light with tiny yellow-green olivine flecks embedded in the darker matrix.',
      },
      {
        key: 'green_grit',
        condition: 'olivine_grit_sample',
        quality: 'gritty',
        scoreDelta: 2,
        evidence: 'coarse greenish olivine-rich grit',
        collectMessage: 'A gritty greenish fragment comes loose, small but distinctive enough for a labeled packet.',
      },
    ],
  },
  coral_limestone: {
    material: 'coral_limestone',
    specimenId: 'coral',
    sampleNoun: 'coral limestone fragment',
    promptText: 'Press E to collect coral limestone fragment',
    shape: 'flake',
    colors: ['#d2c7aa', '#e0d6bd', '#b8ad91'],
    fractureColor: '#f2e8cc',
    scarColor: '#efe2c3',
    dustColor: '#d8ceb6',
    fx: { dustCount: 26, puffCount: 3, sparkCount: 0, puffSize: 0.22 },
    impulseScale: 0.62,
    educationalNote: 'Coral limestone is biological material turned into coastal rock; collecting loose fragments is safer than damaging living reef.',
    soundMessage: 'The hammer makes a chalky click and throws pale dust from the limestone.',
    soundSyms: 'Syms glances seaward. "Best take loose dead coral only, sir."',
    outcomes: [
      {
        key: 'dead_coral_chip',
        condition: 'dead_coral_limestone_chip',
        quality: 'clean',
        scoreDelta: 2,
        evidence: 'dead coral limestone fragment with chambered structure',
        collectMessage: 'A pale dead-coral limestone fragment flakes free, showing small chambered traces in the broken face.',
      },
      {
        key: 'chalky_flake',
        condition: 'chalky_coral_flake',
        quality: 'fragile',
        scoreDelta: 1,
        evidence: 'chalky coral limestone flake',
        collectMessage: 'The coral limestone sheds a chalky flake, fragile but still useful as a coastal sample.',
      },
    ],
  },
  iron_crust: {
    material: 'iron_crust',
    specimenId: 'ironoxidecrust',
    sampleNoun: 'iron-stained crust',
    promptText: 'Press E to collect iron-stained crust',
    shape: 'flake',
    colors: ['#8b4d2c', '#a45f31', '#5b3728'],
    fractureColor: '#3c4144',
    scarColor: '#b06c3d',
    dustColor: '#9d6944',
    fx: { dustCount: 20, puffCount: 2, sparkCount: 7, sparkColor: '#ffbd5a', puffSize: 0.18 },
    impulseScale: 0.55,
    educationalNote: 'Iron staining is a weathering surface, not a separate lava; the contrast between crust and substrate is the useful evidence.',
    soundMessage: 'The hammer skims off a rusty skin and taps the darker stone below.',
    soundSyms: 'Syms separates the red flake from the dark chip. "Weather did half the work, sir."',
    outcomes: [
      {
        key: 'rust_flake',
        condition: 'iron_oxide_flake',
        quality: 'surface',
        scoreDelta: 1,
        evidence: 'thin iron oxide weathering crust',
        collectMessage: 'A thin rusty crust flakes away, revealing darker volcanic stone beneath.',
      },
      {
        key: 'stained_chip',
        condition: 'iron_stained_chip',
        quality: 'clean',
        scoreDelta: 2,
        evidence: 'iron-stained volcanic chip with weathered rind',
        collectMessage: 'The sample keeps both the red weathered rind and the dark interior stone in one small chip.',
      },
    ],
  },
};

export function rockSampleKey(zoneId, rockId) {
  return `${zoneId || 'UNKNOWN'}:${rockId}`;
}

// How many hammer strikes a rock yields before it is exhausted (or, if
// breakable, shatters). Scales with the boulder's bulk so pebble-scale rocks
// give up quickly while proper formations take sustained work.
export function rockStrikeBudget(rock) {
  if (!rock || rock.groundSample) return 1;
  const radius = Math.max(0.2, rock.radius || 0.5);
  const top = Math.max(0.2, rock.colliderTop ?? rock.height ?? 0.5);
  return Math.round(Math.min(5, Math.max(2, radius * 2.2 + top * 1.4)));
}

// Only procedural RockField boulders can shatter (their visual can actually be
// removed); large climbable formations stay intact and merely scar.
export function isRockBreakable(rock) {
  if (!rock || rock.groundSample) return false;
  if (!rock.proceduralRock) return false;
  if (rock.pushable) return false;
  const radius = rock.radius || 0.5;
  const top = rock.colliderTop ?? rock.height ?? 0.5;
  return radius <= 1.05 && top <= 1.35;
}

function normalized2(x = 0, z = -1) {
  const length = Math.hypot(x, z);
  if (length < 0.001) return { x: 0, z: -1 };
  return { x: x / length, z: z / length };
}

function seededUnit(seedText, salt = 0) {
  const text = `${seedText || 'hammer'}:${salt}`;
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  const value = Math.sin((hash >>> 0) * 12.9898) * 43758.5453;
  return value - Math.floor(value);
}

export function getHammerMaterialProfile(material = 'basalt') {
  return HAMMER_MATERIAL_PROFILES[material] || HAMMER_MATERIAL_PROFILES.basalt;
}

export function inferHammerMaterial({ rock = null, zoneId = 'POST_OFFICE_BAY', biome = '' } = {}) {
  const authored = rock?.hammerProfile || rock?.sampleMaterial || rock?.materialProfile;
  if (typeof authored === 'string' && HAMMER_MATERIAL_PROFILES[authored]) return authored;
  if (authored?.material && HAMMER_MATERIAL_PROFILES[authored.material]) return authored.material;

  const text = [
    zoneId,
    biome,
    rock?.id,
    rock?.climbLabel,
    rock?.traversalLabel,
    rock?.sampleLabel,
  ].filter(Boolean).join(' ').toLowerCase();

  if (text.includes('iron') || text.includes('rust') || text.includes('oxide') || text.includes('ochre')) return 'iron_crust';
  if (text.includes('coral') || text.includes('limestone') || text.includes('reef')) return 'coral_limestone';
  if (text.includes('olivine') || text.includes('green-beach') || text.includes('green beach') || text.includes('green-sand')) return 'olivine';
  if (text.includes('scoria') || text.includes('red-lava') || text.includes('red lava') || text.includes('cinder')) return 'scoria';
  if (text.includes('tuff') || text.includes('ash') || text.includes('scree') || text.includes('rim') || text.includes('highland')) return 'tuff';
  return 'basalt';
}

export function groundHammerMaterial({ zoneId = 'POST_OFFICE_BAY', biome = '' } = {}) {
  const text = `${zoneId} ${biome}`.toLowerCase();
  if (text.includes('olivine') || text.includes('green-beach') || text.includes('green beach')) return 'olivine';
  if (text.includes('coral') || text.includes('reef') || text.includes('white-sand') || text.includes('sand-shelf')) return 'coral_limestone';
  if (text.includes('tuff') || text.includes('ash') || text.includes('rim')) return 'tuff';
  if (text.includes('scoria') || text.includes('cinder')) return 'scoria';
  if (text.includes('wet-basalt') || text.includes('black-lava') || text.includes('lava-shelf') || text.includes('black-sand')) return 'basalt';
  return null;
}

export function resolveHammerOutcome(profileOrMaterial = 'basalt', seedText = '') {
  const profile = typeof profileOrMaterial === 'string'
    ? getHammerMaterialProfile(profileOrMaterial)
    : profileOrMaterial;
  const outcomes = profile?.outcomes?.length ? profile.outcomes : [DEFAULT_OUTCOME];
  const roll = seededUnit(seedText || profile.material, 29);
  const index = Math.min(outcomes.length - 1, Math.floor(roll * outcomes.length));
  return { ...DEFAULT_OUTCOME, ...outcomes[index] };
}

export function selectRockSampleTarget({
  obstacles = [],
  zoneId = 'POST_OFFICE_BAY',
  position = { x: 0, z: 0 },
  facing = { x: 0, z: -1 },
  sampledRockIds = [],
  activeSourceKeys = [],
  range = ROCK_SAMPLE_STRIKE_RANGE,
  facingDot = ROCK_SAMPLE_FACING_DOT,
  minHeight = ROCK_SAMPLE_MIN_HEIGHT,
} = {}) {
  const sampled = new Set(sampledRockIds);
  const active = new Set(activeSourceKeys);
  const f = normalized2(facing.x, facing.z);
  let best = null;

  for (const rock of obstacles) {
    if (rock.kind !== 'rock') continue;
    if (rock.sampleable === false) continue;
    const height = rock.colliderTop ?? rock.height ?? 0;
    if (height < minHeight) continue;
    const key = rockSampleKey(zoneId, rock.id);
    if (sampled.has(key) || active.has(key)) continue;

    const dx = (rock.x || 0) - (position.x || 0);
    const dz = (rock.z || 0) - (position.z || 0);
    const centerDistance = Math.hypot(dx, dz);
    const radius = Math.max(0.35, rock.radius || 0.5);
    const edgeDistance = Math.max(0, centerDistance - radius);
    if (edgeDistance > range) continue;

    const toRock = centerDistance > 0.001
      ? { x: dx / centerDistance, z: dz / centerDistance }
      : f;
    const dot = toRock.x * f.x + toRock.z * f.z;
    if (dot < facingDot) continue;

    const score = edgeDistance - dot * 0.6 + Math.max(0, height - 2.0) * 0.04;
    if (!best || score < best.score) {
      best = { rock, key, edgeDistance, centerDistance, dot, score };
    }
  }

  return best;
}
