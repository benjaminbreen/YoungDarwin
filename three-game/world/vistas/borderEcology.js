import {
  apronOwnsCorner,
  axisLength,
  edgeLandStrength,
  projectApronPreviewPoint,
  projectNeighborPreviewPoint,
} from './apronGeometry';
import { terrainHeight, WATER_LEVEL } from '../terrain';

const ECOLOGY_LAYER_KEYS = ['flora', 'proceduralFlora'];

function stableHash(value) {
  const text = String(value || 'border-ecology');
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function renderKey(layer) {
  return [
    layer.path,
    layer.variantMode || '',
    layer.sink || 0,
    layer.ySquash || 1,
  ].join('|');
}

function groupSilhouetteScore(group) {
  const verticalScales = group.candidates
    .map(({ item }) => (item.scale || 1) * (item.heightScale || 1) * (group.layer.ySquash || 1))
    .sort((a, b) => a - b);
  const medianScale = verticalScales[Math.floor(verticalScales.length / 2)] || 0.01;
  return Math.sqrt(group.candidates.length) * Math.sqrt(Math.max(0.01, medianScale));
}

export function borderEcologyBudget(foliageDrawScale = 0.85) {
  if (foliageDrawScale <= 0.76) {
    return { maxLayers: 2, maxInstances: 24, maxApronInstances: 18, maxInnerInstances: 6 };
  }
  if (foliageDrawScale < 0.95) {
    return { maxLayers: 3, maxInstances: 48, maxApronInstances: 36, maxInnerInstances: 12 };
  }
  return { maxLayers: 4, maxInstances: 72, maxApronInstances: 54, maxInnerInstances: 18 };
}

// One standard dry-grass clump is a single 3,138-triangle primitive containing
// many blades. Keep it on an independent one-draw-call budget: enough clumps to
// read as a field, but bounded separately from shrub/tree diversity.
export function borderGrassBudget(foliageDrawScale = 0.85) {
  if (foliageDrawScale <= 0.76) {
    return { maxLayers: 1, maxInstances: 64, maxApronInstances: 48, maxInnerInstances: 16 };
  }
  if (foliageDrawScale < 0.95) {
    return { maxLayers: 1, maxInstances: 128, maxApronInstances: 96, maxInnerInstances: 32 };
  }
  return { maxLayers: 1, maxInstances: 192, maxApronInstances: 144, maxInnerInstances: 48 };
}

function takeStableSample(candidates, count, salt) {
  if (candidates.length <= count) return candidates;
  return [...candidates]
    .sort((a, b) => (
      stableHash(`${salt}:${a.stableId || a.item.id || `${a.item.x}:${a.item.z}`}`)
        / Math.max(0.08, a.continuityWeight ?? 1)
      - stableHash(`${salt}:${b.stableId || b.item.id || `${b.item.x}:${b.item.z}`}`)
        / Math.max(0.08, b.continuityWeight ?? 1)
    ))
    .slice(0, count);
}

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function smoothstep(value, minimum, maximum) {
  const t = clamp((value - minimum) / Math.max(0.001, maximum - minimum), 0, 1);
  return t * t * (3 - 2 * t);
}

// Apron plants are a short transition collar, not distant scenery. Terrain
// color, relief, haze, and rocks describe the middle/far vista; keeping every
// plant inside this band prevents isolated clumps from reading as giant props
// against the distant schematic terrain.
function borderPlantCollarEnd(transition) {
  const carryEnd = transition?.continuity?.carryEnd ?? 14;
  const surfaceCarryEnd = transition?.continuity?.surfaceCarryEnd ?? carryEnd * 0.7;
  return clamp(Math.min(carryEnd, surfaceCarryEnd + 4), 10, 22);
}

function sourcePointEdgeCoordinates(config, edge, x, z) {
  const halfW = config.width / 2;
  const halfD = config.depth / 2;
  if (edge === 'north') return { u: x / config.width + 0.5, inwardDistance: z + halfD };
  if (edge === 'south') return { u: x / config.width + 0.5, inwardDistance: halfD - z };
  if (edge === 'east') return { u: z / config.depth + 0.5, inwardDistance: halfW - x };
  return { u: z / config.depth + 0.5, inwardDistance: x + halfW };
}

function sourceSampleDepth(plantCollarEnd) {
  return clamp(plantCollarEnd * 1.55, 20, 30);
}

function sourceInfillPoint(regionId, config, edge, u, inwardDistance, infillT) {
  const halfW = config.width / 2;
  const halfD = config.depth / 2;
  let x;
  let z;
  if (edge === 'north') {
    x = (u - 0.5) * config.width;
    z = -halfD + inwardDistance;
  } else if (edge === 'south') {
    x = (u - 0.5) * config.width;
    z = halfD - inwardDistance;
  } else if (edge === 'east') {
    x = halfW - inwardDistance;
    z = (u - 0.5) * config.depth;
  } else {
    x = -halfW + inwardDistance;
    z = (u - 0.5) * config.depth;
  }
  const y = terrainHeight(x, z, regionId);
  if (y <= WATER_LEVEL + 0.08) return null;
  return {
    x,
    y,
    z,
    u,
    clampedU: clamp(u, 0, 1),
    outsideDistance: -inwardDistance,
    outsideT: 0,
    targetGroundY: y,
    infillT,
  };
}

function sourceInfillProjections({
  regionId,
  config,
  vista,
  item,
  coordinates,
  cornerOwnership,
  role,
}) {
  const spacing = role === 'grass' ? 4.8 : 7.5;
  const maximumSteps = role === 'grass' ? 3 : 2;
  const stepCount = Math.min(
    maximumSteps,
    Math.max(0, Math.floor((coordinates.inwardDistance - 1.5) / spacing)),
  );
  if (!stepCount) return [];

  const edgeLength = axisLength(config, vista.edge);
  const itemKey = item.id || `${item.x}:${item.z}`;
  const entries = [];
  for (let step = 1; step <= stepCount; step += 1) {
    const boundaryUnit = stableHash(`${regionId}:${vista.edge}:${itemKey}:boundary`) / 0xffffffff;
    const boundaryDistance = Math.min(
      coordinates.inwardDistance * 0.5,
      0.9 + boundaryUnit * 1.2,
    );
    const progression = (step - 1) / stepCount;
    const inwardDistance = lerp(boundaryDistance, coordinates.inwardDistance, progression);
    const infillT = inwardDistance / Math.max(0.001, coordinates.inwardDistance);
    const lateralUnit = stableHash(`${regionId}:${vista.edge}:${itemKey}:infill:${step}`) / 0xffffffff;
    const jitterMeters = (lateralUnit - 0.5) * Math.min(2.2, spacing * 0.36);
    const u = coordinates.u + jitterMeters / Math.max(1, edgeLength);
    const minU = cornerOwnership[0] ? 0 : 0.04;
    const maxU = cornerOwnership[1] ? 1 : 0.96;
    if (u < minU || u > maxU) continue;
    const projection = sourceInfillPoint(
      regionId,
      config,
      vista.edge,
      u,
      inwardDistance,
      infillT,
    );
    if (projection) entries.push({ projection, corner: null, kind: 'source-infill' });
  }
  return entries;
}

function mapSourceInwardToOutside(inwardDistance, minOutsideDistance, plantCollarEnd, sampleDepth) {
  // Authored ecology commonly keeps an 8–12 m safety margin inside the map.
  // Treat the first part of that strip as the same patch front, rather than
  // recreating the safety margin outside as a second empty band.
  const transitionStart = Math.max(2, sampleDepth * 0.38);
  const t = smoothstep(inwardDistance, transitionStart, sampleDepth);
  return lerp(minOutsideDistance, plantCollarEnd, t);
}

function sourceContinuityProjections({
  regionId,
  config,
  targetRegionId,
  targetConfig,
  vista,
  transition,
  item,
  minOutsideDistance,
  plantCollarEnd,
  cornerOwnership,
  role,
}) {
  const coordinates = sourcePointEdgeCoordinates(config, vista.edge, item.x, item.z);
  const sampleDepth = sourceSampleDepth(plantCollarEnd);
  if (coordinates.u < 0 || coordinates.u > 1
    || coordinates.inwardDistance < 0 || coordinates.inwardDistance > sampleDepth) return [];

  const outsideDistance = mapSourceInwardToOutside(
    coordinates.inwardDistance,
    minOutsideDistance,
    plantCollarEnd,
    sampleDepth,
  );
  const regular = projectApronPreviewPoint(
    regionId,
    config,
    targetRegionId,
    targetConfig,
    vista,
    transition,
    coordinates.u,
    outsideDistance,
  );
  const projections = regular
    ? [{ projection: regular, corner: null, kind: 'source' }]
    : [];
  projections.push(...sourceInfillProjections({
    regionId,
    config,
    vista,
    item,
    coordinates,
    cornerOwnership,
    role,
  }));
  const edgeLength = axisLength(config, vista.edge);

  for (const end of [0, 1]) {
    if (!cornerOwnership[end]) continue;
    const alongInward = (end === 0 ? coordinates.u : 1 - coordinates.u) * edgeLength;
    if (alongInward < 0 || alongInward > sampleDepth) continue;
    const cornerAlongOutside = mapSourceInwardToOutside(
      alongInward,
      minOutsideDistance,
      plantCollarEnd,
      sampleDepth,
    );
    const cornerU = end === 0
      ? -cornerAlongOutside / edgeLength
      : 1 + cornerAlongOutside / edgeLength;
    const cornerProjection = projectApronPreviewPoint(
      regionId,
      config,
      targetRegionId,
      targetConfig,
      vista,
      transition,
      cornerU,
      outsideDistance,
    );
    if (cornerProjection) {
      projections.push({ projection: cornerProjection, corner: end, kind: 'source-corner' });
    }
  }
  return projections;
}

function projectionFitsEcologyCollar(
  config,
  vista,
  projection,
  minOutsideDistance,
  plantCollarEnd,
  cornerOwnership,
) {
  if (!projection
    || projection.outsideDistance < minOutsideDistance
    || projection.outsideDistance > plantCollarEnd) return false;
  const extensionU = plantCollarEnd / Math.max(1, axisLength(config, vista.edge));
  const minU = cornerOwnership[0] ? -extensionU : 0.04;
  const maxU = cornerOwnership[1] ? 1 + extensionU : 0.96;
  return projection.u >= minU && projection.u <= maxU;
}

function continuityWeight(origin, projection, minOutsideDistance, plantCollarEnd) {
  const outward = smoothstep(projection.outsideDistance, minOutsideDistance, plantCollarEnd);
  return origin === 'target' ? lerp(0.28, 1, outward) : lerp(1, 0.28, outward);
}

function adaptiveInstanceCount(candidates, maximum, role) {
  if (!candidates.length) return 0;
  const representation = role === 'grass' ? 0.56 : 0.34;
  const minimum = role === 'grass' ? 16 : 6;
  return Math.min(
    maximum,
    candidates.length,
    Math.max(Math.min(minimum, candidates.length), Math.round(candidates.length * representation)),
  );
}

function cachedEdgeLandStrength(cache, regionId, config, edge, u) {
  const bin = Math.round(clamp(u, 0, 1) * 48);
  if (!cache.has(bin)) cache.set(bin, edgeLandStrength(regionId, config, edge, bin / 48));
  return cache.get(bin);
}

function allocateCounts(groups, maxInstances) {
  const totalWeight = groups.reduce((sum, group) => sum + Math.sqrt(group.candidates.length), 0) || 1;
  let remaining = Math.min(maxInstances, groups.reduce((sum, group) => sum + group.candidates.length, 0));
  return groups.map((group, index) => {
    const groupsAfter = groups.length - index - 1;
    const reserved = groupsAfter;
    const proportional = Math.round(maxInstances * Math.sqrt(group.candidates.length) / totalWeight);
    const count = Math.min(group.candidates.length, Math.max(1, Math.min(remaining - reserved, proportional)));
    remaining -= count;
    return count;
  });
}

function allocatedCategoryCounts(groups, maximum, role, predicate) {
  const eligible = groups
    .map((group, groupIndex) => ({
      groupIndex,
      layer: group.layer,
      candidates: group.candidates.filter(predicate),
    }))
    .filter(group => group.candidates.length > 0);
  const adaptiveMaximum = adaptiveInstanceCount(
    eligible.flatMap(group => group.candidates),
    maximum,
    role,
  );
  const counts = allocateCounts(eligible, adaptiveMaximum);
  return new Map(eligible.map((group, index) => [group.groupIndex, counts[index]]));
}

// Builds a bounded render plan from both sides' real flora. Source-edge plants
// continue the visible patch across the seam; neighboring plants increasingly
// influence the outer edge of the collar. Only model-backed silhouette plants
// participate: physics, wind, shadows, and interactions stay in playable maps.
export function buildBorderEcologyLayers({
  regionId,
  config,
  targetRegionId,
  targetConfig,
  vista,
  transition,
  ecology,
  sourceEcology = null,
  foliageDrawScale = 0.85,
}) {
  if ((!ecology && !sourceEcology) || !targetRegionId || !targetConfig) return [];
  const budget = borderEcologyBudget(foliageDrawScale);
  const carryEnd = transition?.continuity?.carryEnd ?? 14;
  const plantCollarEnd = borderPlantCollarEnd(transition);
  const minOutsideDistance = clamp(carryEnd * 0.14, 2.75, 4);
  const grouped = new Map();
  const landStrengthCache = new Map();
  const cornerOwnership = [
    apronOwnsCorner(regionId, vista, 0),
    apronOwnsCorner(regionId, vista, 1),
  ];

  const addLayers = (definition, origin) => {
    for (const layerKey of ECOLOGY_LAYER_KEYS) {
      for (const layer of definition?.[layerKey] || []) {
        if (!layer.path || layer.borderVista === false || !layer.items?.length) continue;
        const key = renderKey(layer);
        let group = grouped.get(key);
        if (!group) {
          group = { layer, sourceLayerIds: [], candidates: [], tintStrength: 0 };
          grouped.set(key, group);
        }
        group.sourceLayerIds.push(`${origin}:${layer.id}`);
        group.tintStrength = Math.max(group.tintStrength, layer.tintStrength || 0);
        for (const item of layer.items) {
          const projectionEntries = origin === 'target'
            ? [{
              projection: projectNeighborPreviewPoint(
                regionId,
                config,
                targetRegionId,
                targetConfig,
                vista,
                transition,
                item.x,
                item.z,
              ),
              corner: null,
              kind: 'target',
            }]
            : sourceContinuityProjections({
              regionId,
              config,
              targetRegionId,
              targetConfig,
              vista,
              transition,
              item,
              minOutsideDistance,
              plantCollarEnd,
              cornerOwnership,
              role: 'flora',
            });
          for (const { projection, corner, kind = origin } of projectionEntries) {
            const isInnerInfill = kind === 'source-infill';
            if (!isInnerInfill && !projectionFitsEcologyCollar(
              config,
              vista,
              projection,
              minOutsideDistance,
              plantCollarEnd,
              cornerOwnership,
            )) continue;
            const landStrength = cachedEdgeLandStrength(
              landStrengthCache,
              regionId,
              config,
              vista.edge,
              projection.u,
            );
            if (landStrength < 0.22) continue;
            const tintedItem = item.tint || !layer.tint ? item : { ...item, tint: layer.tint };
            const candidateOrigin = kind;
            group.candidates.push({
              item: corner == null ? tintedItem : {
                ...tintedItem,
                yaw: (tintedItem.yaw || 0) + (corner === 0 ? -0.42 : 0.42),
              },
              projection,
              landStrength,
              heightOffset: candidateOrigin === 'target' && Number.isFinite(item.y)
                ? item.y - projection.targetGroundY
                : 0,
              continuityWeight: isInnerInfill
                ? lerp(0.84, 1, projection.infillT || 0)
                : continuityWeight(candidateOrigin, projection, minOutsideDistance, plantCollarEnd),
              stableId: `${candidateOrigin}:${layer.id}:${item.id || `${item.x}:${item.z}`}:${corner ?? 'edge'}:${projection.infillT ?? 0}`,
              origin: candidateOrigin,
            });
          }
        }
      }
    }
  };
  addLayers(sourceEcology, 'source');
  addLayers(ecology, 'target');

  const selectedGroups = [...grouped.values()]
    .filter(group => group.candidates.length > 0)
    .sort((a, b) => (
      groupSilhouetteScore(b) - groupSilhouetteScore(a)
      || stableHash(a.layer.id) - stableHash(b.layer.id)
    ))
    .slice(0, budget.maxLayers);
  const apronCounts = allocatedCategoryCounts(
    selectedGroups,
    budget.maxApronInstances,
    'flora',
    candidate => candidate.origin !== 'source-infill',
  );
  const innerCounts = allocatedCategoryCounts(
    selectedGroups,
    budget.maxInnerInstances,
    'flora',
    candidate => candidate.origin === 'source-infill',
  );

  return selectedGroups.map((group, groupIndex) => {
    const apronCandidates = group.candidates.filter(candidate => candidate.origin !== 'source-infill');
    const innerCandidates = group.candidates.filter(candidate => candidate.origin === 'source-infill');
    const selected = [
      ...takeStableSample(
        apronCandidates,
        apronCounts.get(groupIndex) || 0,
        `${regionId}:${targetRegionId}:${vista.edge}:${group.layer.id}:apron`,
      ),
      ...takeStableSample(
        innerCandidates,
        innerCounts.get(groupIndex) || 0,
        `${regionId}:${targetRegionId}:${vista.edge}:${group.layer.id}:inner`,
      ),
    ];
    const items = selected.map(({
      item,
      projection,
      landStrength,
      heightOffset,
      origin,
    }, itemIndex) => {
      const seamFade = origin === 'source-infill'
        ? lerp(0.82, 1, projection.infillT || 0)
        : smoothstep(
          projection.outsideDistance,
          minOutsideDistance,
          Math.min(carryEnd, minOutsideDistance + 12),
        );
      const scale = Number.isFinite(item.scale) ? item.scale : 1;
      return {
        ...item,
        id: `border-${targetRegionId}-${group.layer.id}-${itemIndex}-${item.id || 'item'}`,
        x: projection.x,
        y: projection.y + heightOffset + 0.015,
        z: projection.z,
        scale: scale * lerp(0.7, 1, seamFade) * lerp(0.84, 1, landStrength),
        borderBand: 'near',
        borderOutsideDistance: projection.outsideDistance,
        borderOrigin: origin,
      };
    });
    return {
      id: `border-${targetRegionId}-${group.layer.id}`,
      label: `${targetRegionId} seam ${group.layer.label || group.layer.id}`,
      path: group.layer.path,
      items,
      sink: group.layer.sink || 0,
      ySquash: group.layer.ySquash || 1,
      tint: null,
      tintStrength: group.tintStrength,
      variantMode: group.layer.variantMode || null,
      sourceLayerIds: group.sourceLayerIds,
    };
  }).filter(layer => layer.items.length > 0);
}

function grassRenderKey(layer) {
  return [
    layer.path,
    layer.sink || 0,
    layer.slopeSink ?? 0.2,
    layer.baseLift ?? 0.012,
  ].join('|');
}

function borderGrassItem(item, layer, corner) {
  const tone = item.tone ?? 0.5;
  const widthScale = (item.widthScale || 1)
    * (layer.widthScale || 1)
    * (0.82 + tone * 0.42);
  return {
    ...item,
    yaw: (item.yaw || 0) + (corner == null ? 0 : corner === 0 ? -0.34 : 0.34),
    tint: item.color || layer.color || '#a99d58',
    widthScale,
    heightScale: (item.heightScale || 1)
      * (layer.heightScale || 1)
      * (0.58 + tone * 0.24),
    depthScale: (item.depthScale || 1)
      * widthScale
      * (layer.depthScale || 1)
      * (0.85 + tone * 0.25),
  };
}

// Dry grass mirrors the source edge and blends in neighboring placements using
// the shared GLB. It keeps authored density patterns, colors, and scale
// variation while omitting the nearby renderer's wind, shadows, and forage
// checks. Instances stay in the closest apron collar or its playable-side
// infill strip; the middle and far apron remain vegetation-free.
export function buildBorderGrassLayers({
  regionId,
  config,
  targetRegionId,
  targetConfig,
  vista,
  transition,
  ecology,
  sourceEcology = null,
  foliageDrawScale = 0.85,
}) {
  if ((!ecology?.dryGrassPatches?.length && !sourceEcology?.dryGrassPatches?.length)
    || !targetRegionId
    || !targetConfig) return [];
  const budget = borderGrassBudget(foliageDrawScale);
  const carryEnd = transition?.continuity?.carryEnd ?? 14;
  const plantCollarEnd = borderPlantCollarEnd(transition);
  const minOutsideDistance = 2.25;
  const grouped = new Map();
  const landStrengthCache = new Map();
  const cornerOwnership = [
    apronOwnsCorner(regionId, vista, 0),
    apronOwnsCorner(regionId, vista, 1),
  ];

  const addLayers = (definition, origin) => {
    for (const layer of definition?.dryGrassPatches || []) {
      if (!layer.path || layer.borderVista === false || !layer.items?.length) continue;
      const key = grassRenderKey(layer);
      let group = grouped.get(key);
      if (!group) {
        group = { layer, sourceLayerIds: [], candidates: [] };
        grouped.set(key, group);
      }
      group.sourceLayerIds.push(`${origin}:${layer.id}`);
      for (const item of layer.items) {
        const projectionEntries = origin === 'target'
          ? [{
              projection: projectNeighborPreviewPoint(
                regionId,
                config,
                targetRegionId,
                targetConfig,
                vista,
                transition,
                item.x,
                item.z,
              ),
              corner: null,
              kind: 'target',
            }]
          : sourceContinuityProjections({
              regionId,
              config,
              targetRegionId,
              targetConfig,
              vista,
              transition,
              item,
              minOutsideDistance,
              plantCollarEnd,
              cornerOwnership,
              role: 'grass',
            });

        for (const { projection, corner, kind = origin } of projectionEntries) {
          const isInnerInfill = kind === 'source-infill';
          if (!isInnerInfill && !projectionFitsEcologyCollar(
            config,
            vista,
            projection,
            minOutsideDistance,
            plantCollarEnd,
            cornerOwnership,
          )) continue;
          const landStrength = cachedEdgeLandStrength(
            landStrengthCache,
            regionId,
            config,
            vista.edge,
            projection.u,
          );
          if (landStrength < 0.22) continue;
          const candidateOrigin = kind;
          group.candidates.push({
            item: borderGrassItem(item, layer, corner),
            projection,
            landStrength,
            heightOffset: candidateOrigin === 'target' && Number.isFinite(item.y)
              ? item.y - projection.targetGroundY
              : 0,
            continuityWeight: isInnerInfill
              ? lerp(0.84, 1, projection.infillT || 0)
              : continuityWeight(candidateOrigin, projection, minOutsideDistance, plantCollarEnd),
            stableId: `${candidateOrigin}:${layer.id}:${item.id || `${item.x}:${item.z}`}:${corner ?? 'edge'}:${projection.infillT ?? 0}`,
            origin: candidateOrigin,
          });
        }
      }
    }
  };
  addLayers(sourceEcology, 'source');
  addLayers(ecology, 'target');

  return [...grouped.values()]
    .filter(group => group.candidates.length > 0)
    .sort((a, b) => b.candidates.length - a.candidates.length)
    .slice(0, budget.maxLayers)
    .map(group => {
      const layer = group.layer;
      const apronCandidates = group.candidates.filter(candidate => candidate.origin !== 'source-infill');
      const innerCandidates = group.candidates.filter(candidate => candidate.origin === 'source-infill');
      const apronInstanceCount = adaptiveInstanceCount(
        apronCandidates,
        budget.maxApronInstances,
        'grass',
      );
      const innerInstanceCount = adaptiveInstanceCount(
        innerCandidates,
        budget.maxInnerInstances,
        'grass',
      );
      const selected = [
        ...takeStableSample(
          apronCandidates,
          apronInstanceCount,
          `${regionId}:${targetRegionId}:${vista.edge}:dry-grass:apron`,
        ),
        ...takeStableSample(
          innerCandidates,
          innerInstanceCount,
          `${regionId}:${targetRegionId}:${vista.edge}:dry-grass:inner`,
        ),
      ];
      return {
        id: `border-${targetRegionId}-dry-grass`,
        label: `${targetRegionId} seam grass continuity`,
        path: layer.path,
        items: selected.map(({
          item,
          projection,
          landStrength,
          heightOffset,
          origin,
        }, itemIndex) => {
          const seamFade = origin === 'source-infill'
            ? lerp(0.8, 1, projection.infillT || 0)
            : smoothstep(
              projection.outsideDistance,
              minOutsideDistance,
              Math.min(carryEnd, minOutsideDistance + 13),
            );
          const widthFade = lerp(0.74, 1, seamFade) * lerp(0.86, 1, landStrength);
          const heightFade = lerp(0.64, 1, seamFade) * lerp(0.82, 1, landStrength);
          return {
            ...item,
            id: `border-${targetRegionId}-dry-grass-${itemIndex}-${item.id || 'item'}`,
            x: projection.x,
            y: projection.y
              + heightOffset
              + (layer.baseLift ?? 0.012),
            z: projection.z,
            widthScale: item.widthScale * widthFade,
            heightScale: item.heightScale * heightFade,
            depthScale: item.depthScale * widthFade,
            borderBand: 'near',
            borderOutsideDistance: projection.outsideDistance,
            borderOrigin: origin,
          };
        }),
        sink: layer.sink || 0,
        slopeSink: layer.slopeSink ?? 0.2,
        ySquash: 1,
        tint: null,
        tintStrength: 1,
        variantMode: null,
        sourceLayerIds: group.sourceLayerIds,
      };
    });
}
