// A boulder, stone or loose rock Darwin is standing on, landing on or has
// walked into: an obstacle or physics body, not the ground's own biome (that
// is the surface profile's job). Names like "lava-cactus" must not count.
const NOT_ROCK = /cactus|tree|stump|shrub|crate|barrel|plank|cabin|post|fence|npc|specimen|palo|scalesia|wall|door|hut/;
const ROCK = /rock|stone|boulder|basalt|outcrop|tuff|scoria|talus|crag|lava-block/;

export function isRockBody(target) {
  if (!target) return false;
  const kind = String(target.kind || target.type || '').toLowerCase();
  if (kind === 'rock' || kind === 'stone' || kind === 'boulder' || kind === 'loose-rock' || kind === 'physics-loose-rock') return true;
  const text = [kind, target.id, target.label].filter(Boolean).join(' ').toLowerCase();
  if (NOT_ROCK.test(text)) return false;
  return ROCK.test(text);
}
