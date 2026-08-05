// Live-tunable camera knobs, shared between the Camera tab of the ` panel
// (writes) and usePlayerCameraRig (reads every frame). Same contract as
// waterDevRuntime: one mutable object, no React in the hot path, so a slider
// drag is visible on the next frame. Settled values get baked back into
// CAMERA_DEV_DEFAULTS.
//
// Values here own the framing of the chase/hero/first-person modes. Anything
// that is per-embodiment (a finch's lens, a tortoise's pivot) still lives in
// the playable camera profile — these knobs sit on top of it, and the ones in
// metres are scaled by the profile's pivot height so a tortoise does not get a
// camera sized for a man.

export const CAMERA_DEV_DEFAULTS = {
  // -- shared ---------------------------------------------------------------
  // Multipliers on CAMERA.rotateSpeed / CAMERA.pitchSpeed, i.e. how far a
  // mouse drag swings the view. The player-facing sensitivity preference is
  // applied on top of these.
  dragRotateScale: 1,
  dragPitchScale: 1,
  // Seconds a manual drag suspends any automatic yaw follow (hero, flight).
  manualHold: 3.2,
  // Occlusion response, asymmetric on purpose: a camera must duck behind a
  // boulder the instant the boulder arrives, and come back out slowly. Equal
  // rates make the return read as the world shoving the camera.
  occlusionPullIn: 26,
  occlusionReturn: 2.6,

  // -- hero view · follow ---------------------------------------------------
  // The effective rate is base + speed*moveSpeedT + sprint*sprintBlend, fed to
  // an exponential approach, so all three are "per second".
  heroFollowBase: 0.25,
  heroFollowSpeed: 0.6,
  heroFollowSprint: 0.55,
  // Below this normalized ground speed the camera stops following at all, so
  // standing still frees the view for framing a shot.
  heroFollowGate: 0.07,
  // Heading error (radians) the camera simply ignores, and the width of the
  // soft knee above it. Without a deadzone the camera answers every small
  // steering correction, which is the difference between a camera that follows
  // and one that fidgets.
  heroFollowDeadzone: 0.1,
  heroFollowKnee: 0.45,
  // Seconds over which auto-follow eases back in after a manual drag expires.
  // Snapping straight back to full rate is the lurch that reads as "unpolished".
  heroFollowResume: 0.7,
  // While moving, pitch settles back toward heroPitchTarget at this rate
  // (scaled by ground speed) so a glance at the sky recovers on its own.
  heroPitchTarget: 0.16,
  heroPitchSettle: 1.15,

  // -- hero view · framing --------------------------------------------------
  // Hero owns its own dolly distance in metres. It used to rescale the single
  // shared wheel value into a 2m-wide band, which is why the wheel felt dead.
  heroDistance: 5.9,
  heroMinDistance: 2.1,
  heroMaxDistance: 13.6,
  heroZoomStep: 0.42,
  // Speed reads in the framing: pull back and lift as the sprint tier spools.
  heroSprintPull: 0.55,
  heroSprintLift: 0.12,
  // Lead the subject — push the look pivot along his facing with speed, so a
  // run shows where he is going rather than where he has been.
  heroLookAhead: 0.85,
  // Lateral shoulder offset and the lift applied to the look pivot.
  heroSide: 0.5,
  heroPivotLift: 0.2,
  // Hero re-maps the orbit pitch into a shallower action-camera band.
  heroPitchScale: 0.82,
  heroPitchOffset: -0.02,
  heroPitchMin: -0.36,
  heroPitchMax: 1,
  // How fast the eye and the smoothed pivot chase their targets. Vertical is
  // damped separately and softer: broken ground moves the player up and down
  // constantly, and matching it exactly is what makes a chase camera bounce.
  heroPositionDamping: 12,
  heroPivotDamping: 13,
  heroPivotDampingY: 8,

  // -- shoulder view --------------------------------------------------------
  shoulderPositionDamping: 6.5,
  shoulderPivotDamping: 9,
  shoulderPivotDampingY: 7,

  // -- first person ---------------------------------------------------------
  // 1 = the cursor's distance from screen centre steers the view continuously
  // (no drag, no pointer lock, so UI stays clickable). 0 = drag-only.
  fpCursorLook: 1,
  // Radians per second at full screen deflection.
  fpCursorSpeed: 1.7,
  // Fraction of the half-screen that does nothing, so the middle of the frame
  // stays a dead pointer area for clicking.
  fpCursorDeadzone: 0.42,
  // Share of the horizontal rate applied to pitch.
  fpCursorPitch: 0.55,
  // Eye placement, look gain, and how far up/down the head can turn.
  fpEyeForward: 0.22,
  fpPitchScale: 1.5,
  fpPitchLimit: 1.28,
  // 0 = the head snaps to the yaw exactly (no lag). Above 0 it damps, which
  // softens cursor steering at the cost of input latency.
  fpYawDamping: 0,
  // First person wants a wider lens than a chase view at the same FOV number;
  // added on top of the embodiment's own FOV, and dropped while aiming.
  fpFovBonus: 4,
  // Head bob. Vertical runs at twice the stride rate, lateral and roll at once
  // — that phase relationship is what reads as walking rather than as a shaken
  // camera. Small numbers on purpose; bob is the effect players notice most
  // when it is overdone.
  fpBobStride: 1.05,
  fpBobVertical: 0.022,
  fpBobLateral: 0.016,
  fpBobRoll: 0.006,
  // Standing still, the head keeps a slow breath so the frame is never dead.
  fpBreathe: 0.008,
  // Metres the eye drops on an impact impulse, and how far the frame leans
  // into a hard turn (a multiple of the shared skid roll).
  fpLandingDip: 0.16,
  fpRollScale: 1.6,
  // Radians the view throws up on a recoil impulse. A view offset only — the
  // shot does not move where the player was aiming.
  fpRecoilKick: 0.11,
  // Height of the eye above the waterline while swimming. Without it the head
  // floats a full body-height above a body that is lying in the water.
  fpSwimEyeAbove: 0.12,

  // -- overhead -------------------------------------------------------------
  topHeightScale: 4.2,
};

export const cameraDev = { ...CAMERA_DEV_DEFAULTS };

// Same object the panel writes, reachable from an automated browser session so
// the screenshot harness can A/B a knob without a rebuild.
if (typeof window !== 'undefined') window.__cameraDev = cameraDev;

export function resetCameraDev() {
  Object.assign(cameraDev, CAMERA_DEV_DEFAULTS);
}
