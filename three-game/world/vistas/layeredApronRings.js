import * as THREE from 'three';
import { getRegionTerrainConfig, terrainHeight } from '../terrain';
import { getRegionEdgeHints } from '../../../game-core/regionMaps';
import {
  EDGE_AXES,
  apronPreviewDepth,
  axisLength,
  clearWaterPlane,
  makeNeighborPreviewGeometry,
  normalize2,
} from './apronGeometry';
import {
  CARDINAL_VISTA_EDGES,
  OPPOSITE_VISTA_EDGE,
  buildBorderTransition,
} from './transitions';
import { getBorderVistas } from './index';

// Distance is built from the same generator as the near apron, chained outward.
//
// The far-terrain belt tried to describe the second and third maps with a
// sparse 840-vertex sheet. It reads as flat hazed polygons behind the apron,
// with the ocean disc visible through the gaps between belts — worst of all on
// the diagonals, where two cardinal belts simply do not meet. The apron mesh
// beside it carries 3.4-4.6k vertices, real terrain colour and a corner sweep,
// and looks right. So rather than keep repairing the belt, stack more aprons.
//
// This is deliberately NOT geographically scaled. Neighbouring maps sit ~1.6 km
// apart on the chart while each is ~118 m across, so honest spacing would put
// the second hop far beyond the horizon and show nothing. Instead each
// successive map is parked directly behind the previous one, which reads as
// receding hills: two highland maps in a row east of you become two ridgelines.

const MAX_RINGS = 2;
// Gap between the outer edge of one ring and the near edge of the next. A small
// overlap keeps the ocean disc from showing through the join.
const RING_OVERLAP = 6;
// Vertical exaggeration per ring. These used to COMPRESS (0.96, 0.9), which is
// backwards for a backdrop. A ring is ~300 m wide and carries only a few metres
// of real relief once its source heightfield is averaged down, and a 300 m sheet
// with 4 m of relief is a plane — which is exactly why the distance read as flat
// 2-D cards floating over the world rather than as continuous rise. Matte
// painters exaggerate distant relief for the same reason: at that scale the eye
// needs far more vertical variation than reality provides to accept it as
// landform. Runtime `diagonalRelief` scales these further.
const RING_RELIEF = [1.45, 2.1];
// Vertical offset per ring. This used to LOWER each successive ring, on the
// theory that a nearer ring should occlude the one behind it. That is backwards
// for the thing that actually needs occluding: a ring's own lateral ends, which
// descend out of view. A lower, narrower ring behind cannot cover that descent,
// so the two ends read as open "wings" you can see the horizon through. Each
// ring now sits slightly HIGHER than the one in front — still offset enough to
// avoid a coplanar shared skyline, but stacking the way receding ridges do.
const RING_LIFT = [0.4, 1.2];
// ...and slightly WIDER, for the same reason. Ring 1 was natively narrower than
// ring 0 (236 m vs 244 m at Post Office Bay), so its ends sat inside ring 0's
// and it backed nothing. Splaying outward guarantees every ring's descending
// end is drawn against the next ring's body rather than against open sky.
const RING_WIDTH_SCALE = [1.06, 1.34];
// Each ring is a heightfield sheet with open rims. From eye level the viewer
// looks under a rim and sees sky through the slot between layers, which reads
// as floating jagged polygons instead of receding land. Extruding both rims
// well below the sea closes each ring into a solid mass.
const RING_SKIRT_DROP = 26;
// Sink each ring's outer rim so the next ring's body covers the slot behind it,
// and so the rim never settles near the sightline. A distant sheet that ends
// close to eye height reads edge-on and tears into slivers along the horizon;
// dropping it well below eye level removes that whole failure mode.
const RING_OUTER_SINK = [11, 15];
// The sink used to be constant across the row, which drops the whole outer rim
// by the same amount and leaves it a dead-straight horizontal cut across the
// sky — the same table-edge silhouette the diagonal quadrants had. At this
// range the silhouette is essentially all that reads, so undulate the sink
// along the row and let the rim resolve as a ridgeline.
const RING_OUTER_RIDGE = 6.5;
// Fraction of the ring's width, at each end, over which it descends out of
// view. Without this the sheet holds full height right up to its last column
// and terminates in a vertical face — the hard cutoff on the horizon. Landmass
// silhouettes should end by falling away, so ramp the ends down past the
// sightline and let the skirt close whatever remains visible.
// Kept deliberately short: at 0.22 the fall spanned ~45 m of width and dropped
// 36 m, which is not an end, it is a large diagonal ramp panel — visible as a
// pale wing at each side of the ridge. The end should read as ground falling
// away over a short distance, with the ring behind covering what it exposes.
const RING_LATERAL_TAPER = 0.07;
// Metres the outermost column is driven down. Enough to clear the sightline at
// ring range without presenting a ramp.
const RING_LATERAL_DROP = 9;
// Grid rows used by buildNeighborApronGrid; the column count is derived from
// the vertex total. The regression suite reads far-terrain topology the same way.
const APRON_GRID_ROWS = 34;
const APRON_GRID_ROWS_DEEP = 52;

function continuationVista(regionId, edge) {
  if (!CARDINAL_VISTA_EDGES.has(edge)) return null;
  const hint = getRegionEdgeHints(regionId).find(entry => (
    entry.kind === 'open'
    && entry.edge === edge
    && entry.toRegionId
    && (entry.routeKind === 'land' || entry.routeKind === 'creek')
  ));
  if (!hint) return null;
  return getBorderVistas(regionId).find(vista => (
    vista.edge === edge && vista.toRegionId === hint.toRegionId
  )) || null;
}

// The successive maps continuing in one cardinal direction. Following the same
// edge each hop keeps every ring's outward axis parallel to the first, so rings
// stack by translation alone with no rotation.
export function layeredApronChain(regionId, edge, maxRings = MAX_RINGS) {
  const chain = [];
  const visited = new Set([regionId]);
  let cursor = regionId;
  while (chain.length < maxRings) {
    const vista = continuationVista(cursor, edge);
    if (!vista || visited.has(vista.toRegionId)) break;
    const sourceConfig = getRegionTerrainConfig(cursor);
    const targetConfig = getRegionTerrainConfig(vista.toRegionId);
    if (!sourceConfig || !targetConfig) break;
    chain.push({
      sourceRegionId: cursor,
      sourceConfig,
      targetRegionId: vista.toRegionId,
      targetConfig,
      vista,
    });
    visited.add(vista.toRegionId);
    cursor = vista.toRegionId;
  }
  return chain;
}

function meanEdgeHeight(regionId, config, edge, samples = 9) {
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

// Rebuild the ring with a closing skirt hanging from all four rims.
//
// This used to skirt only the inner and outer rows, leaving the two lateral
// rims as open sheet edges. A ring is ~1.9x the host map wide and sits 180-270 m
// out, so from anywhere but dead-centre the camera sees one of those ends
// side-on: a sheet that simply stops, presenting its own thickness as a hard
// vertical cut against the sky. That is the vertical cutoff on the horizon. The
// lateral taper below drops the ends under the sightline and these skirts close
// them, so a ring now ends by sinking rather than by being sliced off.
//
// Every attribute has to be reallocated because vertices are appended.
function addRingSkirts(geometry, position, ringPresence, rows, stride) {
  const rimRows = [0, rows];
  const rimColumns = [0, stride - 1];
  const baseCount = position.count;
  const added = rimRows.length * stride + rimColumns.length * (rows + 1);
  const names = ['color', 'normal', 'aBorderBlend', 'aApronDepth'];

  const newPositions = new Float32Array((baseCount + added) * 3);
  newPositions.set(position.array.subarray(0, baseCount * 3));
  const newRing = new Float32Array(baseCount + added);
  newRing.set(ringPresence);

  const copies = {};
  for (const name of names) {
    const attribute = geometry.getAttribute(name);
    if (!attribute) continue;
    const size = attribute.itemSize;
    const next = new Float32Array((baseCount + added) * size);
    next.set(attribute.array.subarray(0, baseCount * size));
    copies[name] = { array: next, itemSize: size, source: attribute };
  }

  const skirtIndices = [];
  let cursor = baseCount;

  // Copy one rim vertex down by RING_SKIRT_DROP, carrying every attribute so
  // the skirt shades and hazes as a continuation of the surface above it.
  const dropVertex = from => {
    const to = cursor;
    newPositions[to * 3] = position.getX(from);
    newPositions[to * 3 + 1] = position.getY(from) - RING_SKIRT_DROP;
    newPositions[to * 3 + 2] = position.getZ(from);
    newRing[to] = ringPresence[from];
    for (const name of Object.keys(copies)) {
      const { array, itemSize, source } = copies[name];
      for (let component = 0; component < itemSize; component += 1) {
        array[to * itemSize + component] = source.array[from * itemSize + component];
      }
    }
    cursor += 1;
    return to;
  };

  for (const rimRow of rimRows) {
    const skirtBase = cursor;
    for (let col = 0; col < stride; col += 1) dropVertex(rimRow * stride + col);
    for (let col = 0; col < stride - 1; col += 1) {
      const a = rimRow * stride + col;
      const b = a + 1;
      const skirtA = skirtBase + col;
      const skirtB = skirtA + 1;
      // Inner and outer rims face opposite ways, so wind them accordingly.
      if (rimRow === 0) skirtIndices.push(a, skirtA, b, b, skirtA, skirtB);
      else skirtIndices.push(a, b, skirtA, b, skirtB, skirtA);
    }
  }

  // Lateral rims, walking down the rows instead of across the columns. The two
  // ends face opposite ways for the same reason the inner and outer rims do.
  for (const rimColumn of rimColumns) {
    const skirtBase = cursor;
    for (let row = 0; row <= rows; row += 1) dropVertex(row * stride + rimColumn);
    for (let row = 0; row < rows; row += 1) {
      const a = row * stride + rimColumn;
      const b = a + stride;
      const skirtA = skirtBase + row;
      const skirtB = skirtA + 1;
      if (rimColumn === 0) skirtIndices.push(a, b, skirtA, b, skirtB, skirtA);
      else skirtIndices.push(a, skirtA, b, b, skirtA, skirtB);
    }
  }

  geometry.setAttribute('position', new THREE.BufferAttribute(newPositions, 3));
  for (const name of Object.keys(copies)) {
    geometry.setAttribute(name, new THREE.BufferAttribute(copies[name].array, copies[name].itemSize));
  }
  geometry.setAttribute('aRingIndex', new THREE.BufferAttribute(newRing, 1));
  const existing = Array.from(geometry.index.array);
  geometry.setIndex([...existing, ...skirtIndices]);
}

// Build one ring: the apron `sourceRegionId` would draw toward its own
// neighbour, moved into this region's space and parked behind the previous ring.
function buildRing(hop, ringIndex, edge, hostConfig) {
  const transition = buildBorderTransition(
    hop.sourceRegionId,
    hop.sourceConfig,
    hop.vista,
    hop.targetConfig,
  );
  const geometry = makeNeighborPreviewGeometry(
    hop.sourceRegionId,
    hop.sourceConfig,
    hop.targetRegionId,
    hop.targetConfig,
    hop.vista,
    transition,
  );
  if (!geometry) return null;

  const axes = EDGE_AXES[edge];
  const outward = normalize2(axes.outward);
  const along = normalize2(axes.along);
  const outwardAxis = edge === 'north' || edge === 'south' ? 2 : 0;
  const outwardSign = edge === 'north' || edge === 'west' ? -1 : 1;

  geometry.computeBoundingBox();
  const box = geometry.boundingBox;

  // Where this ring currently begins along the outward axis, and where the
  // previous ring left off in host space.
  const ringNear = outwardSign < 0
    ? box.max.getComponent(outwardAxis)
    : box.min.getComponent(outwardAxis);
  const hostHalf = edge === 'north' || edge === 'south'
    ? hostConfig.depth / 2
    : hostConfig.width / 2;
  const previousOuter = hostHalf
    + apronPreviewDepth(hop.sourceRegionId, hop.vista) * (ringIndex + 1)
    - RING_OVERLAP * (ringIndex + 1);
  const outwardShift = outwardSign * previousOuter - ringNear;

  // Lateral: centre this ring on the host edge rather than on its own map's.
  const alongAxis = outwardAxis === 2 ? 0 : 2;
  const ringAlongCentre = (box.min.getComponent(alongAxis) + box.max.getComponent(alongAxis)) / 2;

  // Vertical: match mean edge heights so successive maps do not step.
  const hostEdgeY = meanEdgeHeight(hop.sourceRegionId, hop.sourceConfig, edge);
  const ringEdgeY = meanEdgeHeight(
    hop.targetRegionId,
    hop.targetConfig,
    OPPOSITE_VISTA_EDGE[edge],
  );
  const verticalShift = hostEdgeY - ringEdgeY + RING_LIFT[ringIndex];
  const relief = RING_RELIEF[ringIndex];

  // makeNeighborPreviewGeometry hands back a view onto its own grid cache, so
  // the ring must own a copy before moving anything. Writing through the shared
  // buffer would relocate that region's real apron the next time it is drawn.
  const source = geometry.getAttribute('position');
  const position = new THREE.BufferAttribute(
    new Float32Array(source.array),
    source.itemSize,
  );
  geometry.setAttribute('position', position);
  const ringPresence = new Float32Array(position.count);
  for (let index = 0; index < position.count; index += 1) {
    const x = position.getX(index);
    const y = position.getY(index);
    const z = position.getZ(index);
    const shifted = [x, y, z];
    shifted[outwardAxis] += outwardShift;
    // Recentre on the host edge, then splay outward so this ring is wider than
    // the one in front of it.
    shifted[alongAxis] = (shifted[alongAxis] - ringAlongCentre) * RING_WIDTH_SCALE[ringIndex];
    // Compress relief about this ring's own base so the stack recedes.
    const base = hostEdgeY + RING_LIFT[ringIndex];
    shifted[1] = base + (y + verticalShift - base) * relief;
    // Stay out of the water plane's depth-fighting band. Clamping UP to just
    // above the sea (which this used to do) is what let the ocean slice
    // horizontal bands through distant land — see clearWaterPlane.
    shifted[1] = clearWaterPlane(shifted[1]);
    position.setXYZ(index, shifted[0], shifted[1], shifted[2]);
    ringPresence[index] = ringIndex + 1;
  }
  position.needsUpdate = true;

  // Sink the outer rows, then close both rims with a skirt.
  const rows = (hop.sourceRegionId === 'BLACK_BEACH_SURF' && hop.targetRegionId === 'BLACK_BEACH')
    ? APRON_GRID_ROWS_DEEP
    : APRON_GRID_ROWS;
  const stride = position.count / (rows + 1);
  if (Number.isInteger(stride) && stride > 1) {
    for (let row = 0; row <= rows; row += 1) {
      const rowT = row / rows;
      const rimT = THREE.MathUtils.smoothstep(rowT, 0.55, 1);
      for (let col = 0; col < stride; col += 1) {
        const index = row * stride + col;
        const colT = stride > 1 ? col / (stride - 1) : 0;
        const ridge = Math.sin(colT * Math.PI * 4.6 + ringIndex * 2.1) * 0.6
          + Math.sin(colT * Math.PI * 11.3 - ringIndex * 1.7) * 0.22;
        const sink = rimT * (RING_OUTER_SINK[ringIndex] + ridge * RING_OUTER_RIDGE);
        // Distance from the nearer lateral end, 0 at the very end and 1 once
        // clear of the taper band.
        const endT = Math.min(colT, 1 - colT) / Math.max(1e-4, RING_LATERAL_TAPER);
        const lateral = (1 - THREE.MathUtils.smoothstep(endT, 0, 1)) * RING_LATERAL_DROP;
        // Re-clear the water plane: the sink and taper move vertices AFTER the
        // clamp in the placement loop, and can drop a ring's outer rows right
        // back onto the sea surface, which is where the slicing came from.
        position.setY(index, clearWaterPlane(position.getY(index) - sink - lateral));
      }
    }
    position.needsUpdate = true;
    addRingSkirts(geometry, position, ringPresence, rows, stride);
  } else {
    geometry.setAttribute('aRingIndex', new THREE.BufferAttribute(ringPresence, 1));
  }
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  geometry.userData.mode = 'layered-apron-ring';
  geometry.userData.ringIndex = ringIndex;
  geometry.userData.sourceRegionId = hop.sourceRegionId;
  geometry.userData.targetRegionId = hop.targetRegionId;
  return geometry;
}

// --- silhouette stacking -----------------------------------------------------
//
// The general cause of "the sea / a further layer is poking through the distant
// hills" is that nothing ever guaranteed the layers stack. Each one is built
// independently from its own map's heightfield, so at any given bearing the
// layer BEHIND can happen to sit lower than the layer in front. Wherever that
// happens the viewer looks over the near crest and straight past the far one to
// whatever is behind — ocean, sky, or a third layer — in a hard-edged wedge the
// shape of the height difference. Chasing those wedges one map at a time is
// endless; the invariant has to hold by construction.
//
// So: sample each finished layer's crest by lateral bucket, and require the next
// layer out to clear it by a margin. Where it does not, lift that part of it.
// The lift is smoothed across buckets and applied uniformly within a column, so
// the layer keeps its own relief and only its baseline moves.

const CREST_BUCKETS = 40;
// Metres the layer behind must clear the one in front. Enough that a wave of
// relief in the near layer cannot cross it.
const CREST_CLEARANCE = 2.5;
// Smoothing passes over the required-lift profile, so a single tall spike in the
// near layer raises a broad shoulder behind it rather than a narrow tooth.
const CREST_SMOOTHING = 4;

function crestProfile(position, lateralAxis, range) {
  const tops = new Float32Array(CREST_BUCKETS).fill(-Infinity);
  const span = Math.max(1e-3, range.max - range.min);
  for (let i = 0; i < position.count; i += 1) {
    const lateral = lateralAxis === 0 ? position.getX(i) : position.getZ(i);
    const bucket = Math.min(
      CREST_BUCKETS - 1,
      Math.max(0, Math.floor((lateral - range.min) / span * CREST_BUCKETS)),
    );
    tops[bucket] = Math.max(tops[bucket], position.getY(i));
  }
  // Buckets outside the layer's own extent stay empty; treat them as "no
  // requirement" rather than as a floor of -Infinity.
  return tops;
}

function lateralRange(position, lateralAxis) {
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < position.count; i += 1) {
    const lateral = lateralAxis === 0 ? position.getX(i) : position.getZ(i);
    min = Math.min(min, lateral);
    max = Math.max(max, lateral);
  }
  return { min, max };
}

// Raise `geometry` where it fails to clear `frontTops` (sampled over
// `frontRange`). Returns the geometry for chaining.
function liftAboveCrest(geometry, lateralAxis, frontTops, frontRange) {
  const position = geometry.getAttribute('position');
  const range = lateralRange(position, lateralAxis);
  const tops = crestProfile(position, lateralAxis, range);
  const span = Math.max(1e-3, range.max - range.min);
  const frontSpan = Math.max(1e-3, frontRange.max - frontRange.min);

  // Required lift per bucket of THIS layer, measured against the front layer's
  // crest at the same world position.
  let lift = new Float32Array(CREST_BUCKETS);
  for (let b = 0; b < CREST_BUCKETS; b += 1) {
    if (!Number.isFinite(tops[b])) continue;
    const world = range.min + (b + 0.5) / CREST_BUCKETS * span;
    const frontBucket = Math.floor((world - frontRange.min) / frontSpan * CREST_BUCKETS);
    if (frontBucket < 0 || frontBucket >= CREST_BUCKETS) continue;
    const front = frontTops[frontBucket];
    if (!Number.isFinite(front)) continue;
    lift[b] = Math.max(0, front + CREST_CLEARANCE - tops[b]);
  }

  let peak = 0;
  for (const value of lift) peak = Math.max(peak, value);
  if (peak <= 0.01) return geometry;

  for (let pass = 0; pass < CREST_SMOOTHING; pass += 1) {
    const next = lift.slice();
    for (let b = 0; b < CREST_BUCKETS; b += 1) {
      const a = lift[Math.max(0, b - 1)];
      const c = lift[Math.min(CREST_BUCKETS - 1, b + 1)];
      next[b] = (a + lift[b] * 2 + c) / 4;
    }
    lift = next;
  }

  for (let i = 0; i < position.count; i += 1) {
    const lateral = lateralAxis === 0 ? position.getX(i) : position.getZ(i);
    const t = (lateral - range.min) / span * CREST_BUCKETS - 0.5;
    const b0 = Math.min(CREST_BUCKETS - 1, Math.max(0, Math.floor(t)));
    const b1 = Math.min(CREST_BUCKETS - 1, b0 + 1);
    const f = THREE.MathUtils.clamp(t - b0, 0, 1);
    const amount = THREE.MathUtils.lerp(lift[b0], lift[b1], f);
    if (amount > 0) position.setY(i, position.getY(i) + amount);
  }
  position.needsUpdate = true;
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

// Widen a finished layer about its own centre until it spans at least
// `minWidth`. RING_WIDTH_SCALE is a fixed multiplier and therefore only splays
// correctly when successive maps happen to be similar widths — at Post Office
// Scrub Rise's west edge the next map was small enough that ring 1 still came
// out narrower than ring 0 despite the 1.34x. The invariant that matters is
// relational, so enforce it against the measured width of the layer in front.
function splayToWidth(geometry, lateralAxis, minWidth) {
  const position = geometry.getAttribute('position');
  const range = lateralRange(position, lateralAxis);
  const width = range.max - range.min;
  if (!(width > 0.01) || width >= minWidth) return geometry;
  const centre = (range.min + range.max) / 2;
  const scale = minWidth / width;
  for (let i = 0; i < position.count; i += 1) {
    const value = lateralAxis === 0 ? position.getX(i) : position.getZ(i);
    const moved = centre + (value - centre) * scale;
    if (lateralAxis === 0) position.setX(i, moved);
    else position.setZ(i, moved);
  }
  position.needsUpdate = true;
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

// How much wider each layer must be than the one in front, so its predecessor's
// descending lateral ends are always drawn against its body.
const RING_SPLAY_MARGIN = 1.12;

// Rings 2..N for one vista. Ring 1 is the existing neighbour apron, untouched.
export function makeLayeredApronRings(regionId, config, vista, maxRings = MAX_RINGS) {
  if (!CARDINAL_VISTA_EDGES.has(vista.edge) || vista.render === false) return [];
  if (!vista.toRegionId) return [];
  // Start from the neighbour: its own continuation is our second ring.
  const chain = layeredApronChain(vista.toRegionId, vista.edge, maxRings);
  const lateralAxis = vista.edge === 'north' || vista.edge === 'south' ? 0 : 2;

  // The apron this region already draws toward the same neighbour is the layer
  // ring 0 has to clear, so start the chain from its crest.
  let frontTops = null;
  let frontRange = null;
  const targetConfig = getRegionTerrainConfig(vista.toRegionId);
  if (targetConfig) {
    const apron = makeNeighborPreviewGeometry(
      regionId,
      config,
      vista.toRegionId,
      targetConfig,
      vista,
      buildBorderTransition(regionId, config, vista, targetConfig),
    );
    if (apron) {
      const position = apron.getAttribute('position');
      frontRange = lateralRange(position, lateralAxis);
      frontTops = crestProfile(position, lateralAxis, frontRange);
    }
  }

  const rings = [];
  for (let index = 0; index < chain.length; index += 1) {
    const geometry = buildRing(chain[index], index, vista.edge, config);
    if (!geometry) continue;
    if (frontRange) {
      splayToWidth(geometry, lateralAxis, (frontRange.max - frontRange.min) * RING_SPLAY_MARGIN);
    }
    if (frontTops && frontRange) liftAboveCrest(geometry, lateralAxis, frontTops, frontRange);
    // Re-clear the water plane last. Every pass above (splay, crest lift, and
    // the sink/taper inside buildRing) moves vertices vertically or laterally
    // and can drop part of a ring back onto the sea surface, where the ocean
    // slices horizontal bands through it. This has to be the final word.
    const position = geometry.getAttribute('position');
    for (let i = 0; i < position.count; i += 1) {
      position.setY(i, clearWaterPlane(position.getY(i)));
    }
    position.needsUpdate = true;
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    frontRange = lateralRange(position, lateralAxis);
    frontTops = crestProfile(position, lateralAxis, frontRange);
    rings.push(geometry);
  }
  return rings;
}

export function layeredApronRingCount(regionId, vista, maxRings = MAX_RINGS) {
  if (!vista?.toRegionId) return 0;
  return layeredApronChain(vista.toRegionId, vista.edge, maxRings).length;
}

export { MAX_RINGS as LAYERED_APRON_MAX_RINGS };
export { axisLength };
