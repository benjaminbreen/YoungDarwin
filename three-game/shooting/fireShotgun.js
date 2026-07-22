import { emitPropEvent } from '../physics/props/propEvents';
import { useThreeGameStore } from '../store';
import { SHOTGUN } from './shotgunConfig';
import { shotgunAimState } from './aimState';

function nowSeconds() {
  return (globalThis.performance?.now?.() ?? Date.now()) / 1000;
}

export function shotgunAmmoStatus() {
  const state = useThreeGameStore.getState();
  const now = nowSeconds();
  const reloadUntil = state.shotgunReloadUntil || 0;
  if (reloadUntil > now) return { status: 'reloading', shells: 0, reloadUntil };
  // A finished reload commits lazily on the next look.
  if (reloadUntil > 0 && (state.shotgunShells ?? 0) <= 0) {
    state.setShotgunAmmo?.({ shells: SHOTGUN.barrels, reloadUntil: 0 });
    return { status: 'ready', shells: SHOTGUN.barrels, reloadUntil: 0 };
  }
  return { status: 'ready', shells: state.shotgunShells ?? SHOTGUN.barrels, reloadUntil: 0 };
}

// Attempt to fire one barrel from `position`. While aiming, the shot travels
// from the muzzle through the crosshair's current world hit point (the
// standard third-person trick that keeps the crosshair honest); hip fire
// travels level along `facing`. Handles the two-shots-then-reload rhythm and
// emits 'shotgun-fired' for the FX/resolver pipeline.
// Returns 'fired' | 'reloading'.
export function tryFireShotgun({ position, facing }) {
  const ammo = shotgunAmmoStatus();
  if (ammo.status !== 'ready' || ammo.shells <= 0) return 'reloading';
  const state = useThreeGameStore.getState();
  const now = nowSeconds();
  const shellsLeft = ammo.shells - 1;
  state.setShotgunAmmo?.({
    shells: shellsLeft,
    // Both barrels spent: ramrod, powder, and wadding take a moment.
    reloadUntil: shellsLeft <= 0 ? now + SHOTGUN.reloadDuration : 0,
  });

  // Horizontal carry direction locates the muzzle in front of Darwin.
  const aim = shotgunAimState;
  let hx = aim.active ? aim.dirX : (facing?.x || 0);
  let hz = aim.active ? aim.dirZ : (facing?.z ?? 1);
  const hLength = Math.hypot(hx, hz) || 1;
  hx /= hLength;
  hz /= hLength;
  const muzzle = {
    x: (position?.x || 0) + hx * SHOTGUN.muzzleForward,
    // Follow the aim pitch so skyward shots flash at the raised barrel.
    y: (position?.y || 0) + SHOTGUN.muzzleHeight + (aim.active ? aim.dirY * SHOTGUN.muzzleForward : 0),
    z: (position?.z || 0) + hz * SHOTGUN.muzzleForward,
  };

  let dirX = hx;
  let dirY = 0;
  let dirZ = hz;
  if (aim.active) {
    if (aim.hitValid) {
      // Converge on the crosshair's world point so what you see is what
      // you hit, even though muzzle and camera don't share an origin.
      dirX = aim.hitX - muzzle.x;
      dirY = aim.hitY - muzzle.y;
      dirZ = aim.hitZ - muzzle.z;
    } else {
      dirX = aim.dirX;
      dirY = aim.dirY;
      dirZ = aim.dirZ;
    }
    const length = Math.hypot(dirX, dirY, dirZ) || 1;
    dirX /= length;
    dirY /= length;
    dirZ /= length;
  }

  aim.recoilPending = true;
  aim.shellsLoaded = shellsLeft;
  aim.reloadingUntil = shellsLeft <= 0 ? now + SHOTGUN.reloadDuration : 0;
  emitPropEvent('shotgun-fired', {
    position: muzzle,
    dir: { x: dirX, y: dirY, z: dirZ },
    barrel: SHOTGUN.barrels - shellsLeft,
    shellsLeft,
    reloadStarted: shellsLeft <= 0,
    reloadDuration: shellsLeft <= 0 ? SHOTGUN.reloadDuration : 0,
  });
  return 'fired';
}
