import { getLooseRockStates } from '../../physics/props/propRuntime';

// Darwin and loose rocks (physics/props/LooseRocks.jsx). He never collides with
// one: he walks over it on analytic support, and he moves it only on purpose
// (hold P at the 'Push rock' prompt) or through his own weight.

// How far from the rock's rim his chest can be and still lean on it.
const PUSH_REACH = 0.75;
const PUSH_FACING_DOT = 0.45;

// The loose rock in front of Darwin he could push, or null. Rocks he is
// standing on, or that are well above or below his hands, don't count.
export function findLooseRockPushTarget(zoneId, position, facing, standingOnKey = null) {
  const fx = facing?.x || 0;
  const fz = facing?.z || 0;
  const facingLength = Math.hypot(fx, fz);
  if (facingLength < 0.001) return null;
  let best = null;
  for (const state of getLooseRockStates(zoneId)) {
    if (!state.radii || state.id === standingOnKey) continue;
    const [rx, ry, rz] = state.radii;
    const dx = state.x - position.x;
    const dz = state.z - position.z;
    const distance = Math.hypot(dx, dz);
    if (distance < 0.001) continue;
    const rim = distance - Math.max(rx, rz);
    if (rim > PUSH_REACH) continue;
    const dot = (dx * fx + dz * fz) / (distance * facingLength);
    if (dot < PUSH_FACING_DOT) continue;
    const top = state.y + ry;
    const bottom = state.y - ry;
    if (top < position.y + 0.1 || bottom > position.y + 1.5) continue;
    if (!best || rim < best.rim) {
      best = {
        key: state.id,
        rim,
        mass: state.mass,
        height: ry * 2,
        direction: { x: dx / distance, z: dz / distance },
      };
    }
  }
  return best;
}
