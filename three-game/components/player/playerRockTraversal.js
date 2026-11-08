import * as THREE from 'three';

const smooth = (value, from, to) => THREE.MathUtils.smoothstep(value, from, to);
export const isRockSupport = ground => ground?.source === 'loose-rock'
  || (ground?.source === 'authored-obstacle' && /^(rock|boulder)$/.test(ground.obstacle?.kind));

export function resolvePlayerRockSupport(position, facing, adapter, contacts = null) {
  let ground = adapter.groundInfo(position);
  const stance = adapter.stanceGroundInfo?.(position, facing);
  // A narrow loose stone between the boots is not a pedestal under the whole
  // body. Keep the fixed rock beneath it; the boots can still meet the stone.
  if (ground.source === 'loose-rock' && stance) {
    const base=adapter.groundInfo(position,{ignoreLooseRocks:true});
    const radii=ground.obstacle?.radii;
    if(radii && Math.max(radii[0],radii[2])<0.42 && isRockSupport(base)
      && base.source==='authored-obstacle' && ground.y-base.y<0.55) {
      return {ground:base,stance};
    }
    const feet = contacts ? [contacts.left, contacts.right].filter(foot => foot?.active
      && Math.hypot(foot.x - position.x, foot.z - position.z) < 1.2) : [];
    const supports = feet.length === 2 ? feet.map(foot => adapter.groundInfo({ x: foot.x, y: position.y + 0.8, z: foot.z }, { supportRadius: 0 }))
      : [stance.left, stance.right];
    if (!supports.every(sample => sample?.source === 'loose-rock' && sample.obstacle?.id === ground.obstacle?.id)) {
      ground = adapter.groundInfo(position, { ignoreLooseRocks: true });
    }
  }
  return { ground, stance };
}

// Small stones stay in the stride. A knee-high face gets one committed,
// hand-assisted step, with a stable landing selected before motion starts.
export function findRockScrambleTarget(position, direction, adapter, latch = null) {
  const forward = new THREE.Vector3(direction.x, 0, direction.z);
  if (forward.lengthSq() < 1e-6) return null;
  forward.normalize();
  const right = new THREE.Vector3(forward.z, 0, -forward.x);
  const point = new THREE.Vector3();
  let best = null;
  for (let distance = 0.22; distance <= 1.16; distance += 0.1) {
    point.copy(position).addScaledVector(forward, distance);
    // Query from the prospective landing height too. A stone perched on the
    // block may be above the step limit at the start, but reachable midway up.
    point.y += 0.85;
    const ground = adapter.groundInfo(point, { supportRadius: 0 });
    if (!isRockSupport(ground) || ground.source === 'loose-rock') continue;
    const obstacle = ground.obstacle;
    if (latch?.id === obstacle.id && Math.hypot(position.x - latch.x, position.z - latch.z) < latch.radius + 0.75) continue;
    const rise = ground.y - position.y;
    if (rise < 0.3 || rise > 0.82) continue;
    // Do not begin from a distant glimpse of a rock, nor land on its edge.
    if (!best && distance > 0.72) return null;
    const left = adapter.groundInfo(point.clone().addScaledVector(right, 0.14), { supportRadius: 0 });
    const side = adapter.groundInfo(point.clone().addScaledVector(right, -0.14), { supportRadius: 0 });
    const clearance = adapter.groundInfo(point, { supportRadius: 0.22 });
    if (clearance.source === 'loose-rock' || left.source === 'loose-rock' || side.source === 'loose-rock') continue;
    if (Math.max(Math.abs(left.y - ground.y), Math.abs(side.y - ground.y)) > 0.18) continue;
    if (!best || ground.y > best.end.y) best = { end: new THREE.Vector3(point.x, ground.y, point.z), heightDelta: rise, obstacle, direction: forward.clone(), distance };
  }
  return best;
}

// Reach while both feet support him, transfer weight through the hands, lift,
// then stand. Position is continuous all the way to the actual endpoint.
export function sampleRockScramble(motion, progress, target) {
  const p = THREE.MathUtils.clamp(progress, 0, 1);
  const horizontal = 0.32 * smooth(p, 0, 0.28) + 0.68 * smooth(p, 0.28, 1);
  target.lerpVectors(motion.start, motion.end, horizontal);
  target.y = THREE.MathUtils.lerp(motion.start.y, motion.end.y, smooth(p, 0.28, 0.94));
  return target;
}

export function rockScrambleWeight(progress) {
  return smooth(progress, 0, 0.22) * (1 - smooth(progress, 0.48, 0.78));
}

export function chooseRockHandhold(candidates, nominal, shoulder, palmOffset, armLength) {
  let best = nominal, bestScore = Infinity;
  const wrist = new THREE.Vector3();
  for (const candidate of candidates) {
    wrist.copy(candidate).sub(palmOffset);
    const excess = Math.max(0, wrist.distanceTo(shoulder) - armLength + 0.015);
    const score = excess * 8 + candidate.distanceTo(nominal) * 0.2;
    if (score < bestScore) { best = candidate; bestScore = score; }
  }
  return best;
}
