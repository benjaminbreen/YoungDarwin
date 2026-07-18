// Hand-authored lava-cactus anchors. Procedural ecology layers are merged in
// by lavaCactusSites.js, so these remain stable landmarks while suitable maps
// can add deterministic pioneer patches around them.

export const AUTHORED_LAVA_CACTUS_SITES = {
  NORTHERN_HIGHLANDS: [
    { id: 'nh-1', x: -34, z: -22, yaw: 0.6, seed: 'nh-1', size: 1.2, flowerCount: 1 },
    { id: 'nh-2', x: -26, z: 8, yaw: -1.1, seed: 'nh-2', size: 0.85, flowerCount: 0 },
    { id: 'nh-3', x: -19, z: -9, yaw: 2.2, seed: 'nh-3', size: 1.0, flowerCount: 2 },
    { id: 'nh-4', x: -12, z: 24, yaw: 0.3, seed: 'nh-4', size: 0.7, flowerCount: 0 },
    { id: 'nh-5', x: -31, z: 27, yaw: -0.7, seed: 'nh-5', size: 1.1, flowerCount: 1 },
    { id: 'nh-6', x: -8, z: -28, yaw: 1.5, seed: 'nh-6', size: 0.9, flowerCount: 0 },
    { id: 'nh-7', x: 4, z: -16, yaw: -2.4, seed: 'nh-7', size: 1.3, flowerCount: 2 },
    { id: 'nh-8', x: 13, z: -30, yaw: 0.9, seed: 'nh-8', size: 0.8, flowerCount: 0 },
    { id: 'nh-9', x: 17, z: 12, yaw: -0.2, seed: 'nh-9', size: 1.05, flowerCount: 1 },
    { id: 'nh-10', x: -2, z: 20, yaw: 1.8, seed: 'nh-10', size: 0.75, flowerCount: 0 },
    { id: 'nh-11', x: 47, z: 27, yaw: -1.6, seed: 'nh-11', size: 1.2, flowerCount: 1 },
    { id: 'nh-12', x: 40, z: 14, yaw: 0.45, seed: 'nh-12', size: 0.95, flowerCount: 0 },
    { id: 'nh-13', x: 38, z: 10, yaw: 2.8, seed: 'nh-13', size: 0.7, flowerCount: 0 },
    { id: 'nh-14', x: 24, z: -20, yaw: -0.9, seed: 'nh-14', size: 1.15, flowerCount: 2 },
    { id: 'nh-15', x: -40, z: -2, yaw: 1.2, seed: 'nh-15', size: 0.9, flowerCount: 0 },
    { id: 'nh-16', x: 36, z: 30, yaw: -2.0, seed: 'nh-16', size: 0.8, flowerCount: 1 },
  ],
  // Replaces the legacy green cylinder at the existing specimen landmark.
  POST_SCRUB_RISE: [
    { id: 'scrub-rise-west-anchor', x: -31, z: -9, yaw: 0.55, seed: 'scrub-rise-west-anchor', size: 1.48, flowerCount: 1 },
  ],
  // Compatibility anchors replace the same specimen placeholder on older
  // maps that do not yet own a full authored ecology definition.
  POST_OFFICE_BAY_3: [
    { id: 'post-office-bay-3-inland-lava', x: 30, z: 18, yaw: -0.42, seed: 'post-office-bay-3-inland-lava', size: 1.18, flowerCount: 1 },
  ],
  COASTAL_SCRUBLAND: [
    { id: 'coastal-scrub-lava-a', x: -18, z: 8, yaw: 0.36, seed: 'coastal-scrub-lava-a', size: 1.05, flowerCount: 0 },
    { id: 'coastal-scrub-lava-b', x: 9, z: -14, yaw: -1.1, seed: 'coastal-scrub-lava-b', size: 0.9, flowerCount: 1 },
    { id: 'coastal-scrub-lava-c', x: 27, z: 17, yaw: 2.24, seed: 'coastal-scrub-lava-c', size: 1.22, flowerCount: 0 },
  ],
};
