// Mutable per-frame aim state shared between the player controller / camera
// rig (writers) and the crosshair HUD, world hit marker, and blast resolver
// (readers). Kept outside React/zustand like propEvents so the 60hz aim
// updates never cause re-renders.
export const shotgunAimState = {
  active: false,
  // Full 3D fire direction (normalized) from yaw + aim pitch.
  dirX: 0,
  dirY: 0,
  dirZ: 1,
  // Player origin for target scoring (written by the controller each frame).
  playerX: 0,
  playerY: 0,
  playerZ: 0,
  // Camera ray through the crosshair (written by the camera rig each frame).
  camX: 0,
  camY: 0,
  camZ: 0,
  camDirX: 0,
  camDirY: 0,
  camDirZ: -1,
  // World-space point + surface normal the crosshair ray currently hits
  // (written by the resolver's per-frame solve; drives the hit marker).
  hitValid: false,
  hitX: 0,
  hitY: 0,
  hitZ: 0,
  hitNormalX: 0,
  hitNormalY: 1,
  hitNormalZ: 0,
  hitDistance: 0,
  hitKind: null, // 'terrain' | 'rock' | 'wood' | 'structure' | 'foliage' | 'water' | 'fauna' | 'npc' | null
  // True when a shootable target scores inside the spread cone right now.
  onTarget: false,
  targetId: null,
  targetLabel: null,
  // 0..1 quality of the current target solution (drives reticle warmth).
  targetScore: 0,
  // Momentary aim intent from holding right mouse (read by equipment state).
  holdIntent: false,
  // Set by tryFireShotgun, consumed by the controller as a camera impulse.
  recoilPending: false,
  // Set by the resolver when Darwin shoots his own feet; consumed by the
  // controller (stumble + damage).
  selfHitPending: false,
  // Ammo mirror for the crosshair (source of truth lives in the store).
  shellsLoaded: 2,
  reloadingUntil: 0,
};

export function resetShotgunAimState() {
  shotgunAimState.active = false;
  shotgunAimState.onTarget = false;
  shotgunAimState.targetId = null;
  shotgunAimState.targetLabel = null;
  shotgunAimState.targetScore = 0;
  shotgunAimState.hitValid = false;
  shotgunAimState.hitKind = null;
}
