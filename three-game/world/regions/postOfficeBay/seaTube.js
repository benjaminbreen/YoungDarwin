// The seaward end of Gabriel's lava tube: a low mouth in the north-west flank
// of the black lava mound above the cove, half-hidden by its own talus. It
// looks out over the water. Inside, the tube climbs to the press gallery.
//
// The mouth is authored facing +z and turned by `yaw`; outward is
// (sin yaw, cos yaw), here north-west toward the cove.

export const POST_OFFICE_BAY_SEA_TUBE = Object.freeze({
  id: 'post-office-bay-sea-tube',
  kind: 'cliff',
  x: -25.2,
  z: 4.6,
  yaw: -Math.PI * 0.75,
  promptX: -26.35,
  promptZ: 3.45,
  campAsh: false,
  mouthWidth: 1.85,
  mouthHeight: 1.45,
  mouthDepth: 0.32,
  thresholdSize: [2.6, 2.2],
  destinationZoneId: 'GABRIEL_SEA_GALLERY',
});

// Local frame of the mouth: `across` runs along the face, `depth` is positive
// into the hill behind it.
export function postOfficeSeaTubeLocal(x, z) {
  const { yaw } = POST_OFFICE_BAY_SEA_TUBE;
  const dx = x - POST_OFFICE_BAY_SEA_TUBE.x;
  const dz = z - POST_OFFICE_BAY_SEA_TUBE.z;
  return {
    across: dx * Math.cos(yaw) - dz * Math.sin(yaw),
    depth: -(dx * Math.sin(yaw) + dz * Math.cos(yaw)),
  };
}

// A point given in the mouth's frame, back in world coordinates.
export function postOfficeSeaTubeWorld(across, outward) {
  const { x, z, yaw } = POST_OFFICE_BAY_SEA_TUBE;
  return {
    x: x + across * Math.cos(yaw) + outward * Math.sin(yaw),
    z: z - across * Math.sin(yaw) + outward * Math.cos(yaw),
  };
}

// Inside the rock: behind the cliff face, where nobody can stand.
export function isInsidePostOfficeSeaTubeRock(x, z) {
  const { across, depth } = postOfficeSeaTubeLocal(x, z);
  return depth > 0.15 && depth < 3.4 && Math.abs(across) < 3.6;
}
