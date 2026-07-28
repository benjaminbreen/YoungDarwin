import * as THREE from 'three';
import { getRegionEdgeHints } from '../../../game-core/regionMaps';
import {
  getRegionTerrainConfig,
  terrainColor,
  terrainHeight,
  terrainSurfaceNoise,
  WATER_LEVEL,
} from '../terrain';
import { clearWaterPlane } from './apronGeometry';

// Terrain for the diagonal quadrants.
//
// Every vista layer in this codebase is generated per cardinal edge, so the
// four quadrants between them were never filled by anything. Measuring how far
// baked geometry reaches by bearing from Post Office Bay showed cardinals out
// at 246-270 m while southeast collapsed to 160 m — past that the ocean disc
// shows through, which is the blue wedge that reads as a hole in the world.
//
// The diagonal neighbour is found by composing the route graph: going south
// then east from Post Office Bay lands on Northern Highlands, which is exactly
// where the water was showing. Both orderings are tried and the first that
// resolves wins, so the choice is deterministic.
//
// Like the layered rings this is deliberately not geographically scaled. The
// quadrant is mapped across the diagonal region's whole heightfield so the
// sector carries that map's real relief rather than a flat fill.

const DIAGONAL_CORNERS = Object.freeze({
  northeast: { edges: ['north', 'east'], sx: 1, sz: -1 },
  southeast: { edges: ['south', 'east'], sx: 1, sz: 1 },
  southwest: { edges: ['south', 'west'], sx: -1, sz: 1 },
  northwest: { edges: ['north', 'west'], sx: -1, sz: -1 },
});

const PATCH_RADIUS = 250;
// 16x22 across a 250 m sweep put ~11 m between vertices, which reads as faceted
// jags on the skyline. This is still a backdrop, but it has to hold a silhouette.
const PATCH_ROWS = 30;
const PATCH_COLUMNS = 44;
// Where the quadrant starts sinking toward the sea. Without this the patch ends
// in a vertical wall at PATCH_RADIUS and reads as a slab with a straight edge.
const PATCH_HORIZON_FADE = 0.68;
// Metres the outer rim drops below the datum before the skirt takes over.
const PATCH_HORIZON_SINK = 14;
// How much relief survives at the outer rim. This used to be zero: the fade
// multiplied relief by a term reaching 0, which put every outer column at
// exactly `datum` — a mathematically flat plane. Sunk and seen from standing
// height, that plane presents as a table top with a dead-straight silhouette,
// and at this distance the silhouette is essentially all the viewer can read
// (past ~200 m the surface is >90% haze, so vertex colour, mottle and normals
// contribute nothing). The flat-topped mesa was therefore the single most
// artificial thing on the horizon. Keep a floor so the rim stays terrain.
const PATCH_HORIZON_RELIEF_FLOOR = 0.34;
// Amplitude in metres of the undulation applied to the rim sink. A uniform
// sink lowers the whole rim by the same amount, so it still reads as one
// horizontal cut across the sky; varying it along the sweep turns that cut
// into a skyline. Sampled from position and sweep angle only, so the skirt
// rows (which share their neighbour's ground position) move with it and the
// surface stays watertight.
const PATCH_HORIZON_RIDGE = 8.5;
// Vertical exaggeration, matching the layered rings. See RING_RELIEF.
const PATCH_RELIEF_GAIN = 1.7;
// Fraction of the 90-degree sweep, at each end, over which the quadrant
// descends. The two angular ends lie on the cardinal axes, where the apron and
// its rings already stand — but nothing guaranteed the quadrant was the shorter
// of the two, so wherever it stood proud it presented its end as a vertical
// face beside the cardinal layer. Ramping the ends down guarantees the cardinal
// layer is the taller one at the join, which turns a butt seam into an overlap.
const PATCH_SWEEP_TAPER = 0.16;
const PATCH_SWEEP_DROP = 22;
// Sit a little under the cardinal aprons so they own every shared pixel and the
// seam is a clean overlap rather than two coplanar surfaces fighting.
const PATCH_UNDERLAP = 0.35;
// How far the inner and outer rims are extruded straight down. Without this the
// quadrant is a single open sheet: from eye level you see under its leading edge
// and straight through to the sky, which reads as floating jagged polygons
// rather than a landmass. The skirt closes the layer so it always presents a
// solid face, and its foot sits well under the sea so it is never visible.
const PATCH_SKIRT_DROP = 26;

function stepRegion(regionId, edge) {
  return getRegionEdgeHints(regionId)
    .find(hint => (
      hint.kind === 'open'
      && hint.edge === edge
      && hint.toRegionId
      && (hint.routeKind === 'land' || hint.routeKind === 'creek')
    ))
    ?.toRegionId || null;
}

// Compose two cardinal hops. Either ordering is acceptable; where they
// disagree the first listed wins so the bake is deterministic.
export function diagonalNeighbor(regionId, corner) {
  const spec = DIAGONAL_CORNERS[corner];
  if (!spec) return null;
  const [first, second] = spec.edges;
  const viaFirst = stepRegion(regionId, first);
  const composedFirst = viaFirst ? stepRegion(viaFirst, second) : null;
  if (composedFirst && composedFirst !== regionId) return composedFirst;
  const viaSecond = stepRegion(regionId, second);
  const composedSecond = viaSecond ? stepRegion(viaSecond, first) : null;
  if (composedSecond && composedSecond !== regionId) return composedSecond;
  return null;
}

function meanEdgeHeight(regionId, config, edge, samples = 7) {
  const halfW = config.width / 2;
  const halfD = config.depth / 2;
  let total = 0;
  for (let index = 0; index < samples; index += 1) {
    const t = index / (samples - 1) - 0.5;
    let x = 0;
    let z = 0;
    if (edge === 'north') { x = t * config.width; z = -halfD; }
    else if (edge === 'south') { x = t * config.width; z = halfD; }
    else if (edge === 'east') { x = halfW; z = t * config.depth; }
    else { x = -halfW; z = t * config.depth; }
    total += terrainHeight(x, z, regionId);
  }
  return total / samples;
}

function meanRegionHeight(regionId, config, samples = 6) {
  let total = 0;
  let count = 0;
  for (let ix = 0; ix < samples; ix += 1) {
    for (let iz = 0; iz < samples; iz += 1) {
      const x = (ix / (samples - 1) - 0.5) * config.width * 0.9;
      const z = (iz / (samples - 1) - 0.5) * config.depth * 0.9;
      total += terrainHeight(x, z, regionId);
      count += 1;
    }
  }
  return total / count;
}

// One quadrant of terrain, swept between the two cardinal edges that bound it.
export function makeDiagonalApronPatch(regionId, config, corner) {
  const spec = DIAGONAL_CORNERS[corner];
  if (!spec) return null;
  const targetRegionId = diagonalNeighbor(regionId, corner);
  if (!targetRegionId) return null;
  const targetConfig = getRegionTerrainConfig(targetRegionId);
  if (!targetConfig) return null;

  const halfW = config.width / 2;
  const halfD = config.depth / 2;
  const innerRadius = Math.hypot(halfW, halfD) * 0.72;

  // Vertical datum: sit between the two cardinal neighbours this quadrant
  // bridges, so the patch does not step against either apron.
  const anchorA = meanEdgeHeight(regionId, config, spec.edges[0]);
  const anchorB = meanEdgeHeight(regionId, config, spec.edges[1]);
  const hostAnchor = (anchorA + anchorB) / 2;
  const targetMean = meanRegionHeight(targetRegionId, targetConfig);
  const verticalOffset = hostAnchor - targetMean;

  const positions = [];
  const colors = [];
  const depths = [];
  const blends = [];
  const indices = [];

  // Row plan: a skirt row under the inner rim, the terrain body, then a skirt
  // row under the outer rim. Skirt rows share their neighbour's ground position
  // and only differ in height, so the surface stays watertight.
  const rowPlan = [{ radialT: 0, skirt: true }];
  for (let row = 0; row <= PATCH_ROWS; row += 1) {
    rowPlan.push({ radialT: row / PATCH_ROWS, skirt: false });
  }
  rowPlan.push({ radialT: 1, skirt: true });

  for (const plan of rowPlan) {
    const radialT = plan.radialT;
    const radius = THREE.MathUtils.lerp(innerRadius, PATCH_RADIUS, radialT);
    for (let col = 0; col <= PATCH_COLUMNS; col += 1) {
      const angularT = col / PATCH_COLUMNS;
      // Sweep the full 90 degrees between the two bounding cardinal axes.
      const angle = angularT * Math.PI / 2;
      const x = spec.sx * Math.cos(angle) * radius;
      const z = spec.sz * Math.sin(angle) * radius;

      // Sample the diagonal region's heightfield at roughly its own scale
      // rather than stretching one map across the whole sweep, which smeared
      // features into long straight ridges.
      const sampleX = (angularT - 0.5) * targetConfig.width * 0.92;
      const sampleZ = ((radialT * 1.6) % 1 - 0.5) * targetConfig.depth * 0.92;
      const sampled = terrainHeight(sampleX, sampleZ, targetRegionId);
      const wobble = terrainSurfaceNoise(x * 0.02 + 13.7, z * 0.02 - 4.1) * 0.9;

      // Relief above the local sea datum, so the fade below scales the terrain
      // rather than clamping it. Clamping produced dead-flat plateaus wherever
      // the sampled terrain fell under the waterline, with a hard edge at the
      // boundary — the mesa silhouette this patch used to show.
      const datum = WATER_LEVEL;
      const raw = sampled + verticalOffset + wobble * radialT;
      const rimT = THREE.MathUtils.smoothstep(radialT, PATCH_HORIZON_FADE, 1);
      // Compress relief toward the rim but never to zero — see the note on
      // PATCH_HORIZON_RELIEF_FLOOR.
      const horizonFade = THREE.MathUtils.lerp(1, PATCH_HORIZON_RELIEF_FLOOR, rimT);
      // Only land is compressed toward the datum. Sub-sea samples used to be
      // clamped UP onto it, which laid a huge sheet a few centimetres above the
      // ocean across every seaward quadrant — the surface the sea then sliced
      // through. Let seabed stay seabed and be occluded by the water properly.
      // Exaggerate relief for the same reason the rings do: a 250 m sweep
      // carrying a few metres of averaged heightfield is a plane, not a hill.
      let y = raw >= datum
        ? datum + (raw - datum) * horizonFade * PATCH_RELIEF_GAIN
        : raw;
      y -= PATCH_UNDERLAP * (1 - THREE.MathUtils.smoothstep(radialT, 0, 0.25));
      // Drive the outer rows decisively below the eye line rather than letting
      // them settle at the water datum. A distant layer that flattens toward
      // datum becomes a near-horizontal plane viewed edge-on from standing
      // height, and sub-metre wobble then flickers it into broken slivers along
      // the horizon. Sinking well past eye level keeps it either honest terrain
      // or fully hidden, never a sheet balanced on the sightline.
      //
      // The sink itself undulates along the sweep so the rim resolves as a
      // ridgeline rather than one horizontal cut. Two slow harmonics carry the
      // shape; the noise tap only breaks their regularity.
      const rimWave = Math.sin(angularT * Math.PI * 3.4 + spec.sx * 2.3 + spec.sz * 1.1) * 0.58
        + Math.sin(angularT * Math.PI * 8.6 - spec.sz * 3.7) * 0.24
        + terrainSurfaceNoise(x * 0.009 - 21.3, z * 0.009 + 9.7) * 0.3;
      y -= rimT * (PATCH_HORIZON_SINK + rimWave * PATCH_HORIZON_RIDGE);
      // Descend into the cardinal aprons at both ends of the sweep — see the
      // note on PATCH_SWEEP_TAPER.
      const sweepEndT = Math.min(angularT, 1 - angularT) / Math.max(1e-4, PATCH_SWEEP_TAPER);
      y -= (1 - THREE.MathUtils.smoothstep(sweepEndT, 0, 1)) * PATCH_SWEEP_DROP;
      y = clearWaterPlane(y);
      if (plan.skirt) y -= PATCH_SKIRT_DROP;

      // Haze is applied per pixel by the shared aerial-perspective term in
      // vistaAtmosphere.js, which knows the live sky and the true camera
      // distance. Baking a fixed cool-blue tint here froze a midday sky into
      // the buffer, so at golden hour and dusk the distant land carried a
      // colour that existed nowhere else in the frame and fought the runtime
      // haze it was mixed under. Keep the bake to honest terrain colour.
      const color = terrainColor(sampleX, sampleZ, sampled, targetRegionId);

      positions.push(x, y, z);
      colors.push(color.r, color.g, color.b);
      depths.push(radialT);
      blends.push(1);
    }
  }

  const stride = PATCH_COLUMNS + 1;
  const totalRows = rowPlan.length - 1;
  for (let row = 0; row < totalRows; row += 1) {
    for (let col = 0; col < PATCH_COLUMNS; col += 1) {
      const a = row * stride + col;
      const b = a + stride;
      const c = a + 1;
      const d = b + 1;
      indices.push(a, b, c, c, b, d);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setAttribute('aApronDepth', new THREE.Float32BufferAttribute(depths, 1));
  geometry.setAttribute('aBorderBlend', new THREE.Float32BufferAttribute(blends, 1));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();

  // The sweep can wind either way depending on the quadrant's sign pair.
  const normal = geometry.getAttribute('normal');
  let upward = 0;
  for (let index = 0; index < normal.count; index += 1) upward += normal.getY(index);
  if (upward < 0) {
    const array = geometry.index.array;
    for (let index = 0; index < array.length; index += 3) {
      const swap = array[index + 1];
      array[index + 1] = array[index + 2];
      array[index + 2] = swap;
    }
    geometry.computeVertexNormals();
  }

  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  geometry.userData.mode = 'diagonal-apron-patch';
  geometry.userData.corner = corner;
  geometry.userData.targetRegionId = targetRegionId;
  return geometry;
}

export function makeDiagonalApronPatches(regionId, config) {
  return Object.keys(DIAGONAL_CORNERS)
    .map(corner => makeDiagonalApronPatch(regionId, config, corner))
    .filter(Boolean);
}

export { DIAGONAL_CORNERS };
