'use client';

import React, { useLayoutEffect, useMemo } from 'react';
import * as THREE from 'three';
import { useThreeGameStore } from '../../../store';
import { catalogToInspectable } from '../../../world/inspectables';
import { terrainHeight } from '../../../world/terrain';
import {
  FLOREANA_PBR_TEXTURES,
  disposePbrTerrainSet,
  loadPbrTerrainSet,
} from '../../../world/regions/materials/pbrTerrainTextures';

const FORMATION_MATERIAL_PROFILES = {
  caveWeatheredBasalt: {
    textureKey: 'weatheredHighlandBasalt',
    normalScale: 0.64,
    roughness: 0.98,
    uvDensity: 0.38,
    tint: '#d5d8cf',
  },
  weatheredHighlandBasalt: {
    textureKey: 'weatheredHighlandBasalt',
    normalScale: 0.48,
    roughness: 0.95,
    uvDensity: 0.3,
    tint: '#e5e2d9',
  },
  oxidizedScoriaceousBasalt: {
    textureKey: 'oxidizedScoriaceousBasalt',
    normalScale: 0.6,
    roughness: 0.97,
    uvDensity: 0.46,
    tint: '#dfc4b5',
  },
};

function hashText(text) {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function materialKeyFor(formation) {
  return FORMATION_MATERIAL_PROFILES[formation.materialKey]
    ? formation.materialKey
    : 'weatheredHighlandBasalt';
}

function formationRadii(formation) {
  if (Array.isArray(formation.radii)) return formation.radii;
  if (Array.isArray(formation.scale)) return formation.scale.map(value => value * 0.5);
  const radius = Number(formation.radius) || 1;
  return [radius, radius, radius];
}

function radiusProfile(form, t) {
  if (form === 'cap') return 0.8 + Math.sin(t * Math.PI) * 0.16 - t * 0.06;
  if (form === 'shelf') return 1.03 - Math.pow(t, 1.7) * 0.58 + Math.sin(t * Math.PI) * 0.04;
  if (form === 'buttress') return 1.12 - Math.pow(t, 1.35) * 0.54;
  return 1.02 - Math.pow(t, 1.55) * 0.46;
}

function makeCaveShellGeometry(formation) {
  const seed = hashText(formation.id || 'volcanic-cave-shell');
  const phase = (seed % 10000) * 0.0017;
  const [outerHalfWidth, outerHeight, depth] = formationRadii(formation);
  const [openingWidth = 8.2, openingHeight = 3.75] = formation.opening || [];
  const innerHalfWidth = openingWidth * 0.5;
  const profile = FORMATION_MATERIAL_PROFILES[materialKeyFor(formation)];
  const density = formation.uvDensity || profile.uvDensity;
  const highColor = new THREE.Color(formation.tint || '#f0ede5');
  const lowColor = highColor.clone().multiplyScalar(0.79);
  const lichenColor = new THREE.Color(formation.lichenTint || '#aab39f');
  const lichenStrength = formation.lichenStrength || 0;
  const shape = new THREE.Shape();
  shape.moveTo(-outerHalfWidth, -0.5);
  shape.lineTo(-outerHalfWidth * 0.99, outerHeight * 0.32);
  shape.lineTo(-outerHalfWidth * 0.92, outerHeight * 0.52);
  shape.lineTo(-outerHalfWidth * 0.76, outerHeight * 0.7);
  shape.lineTo(-outerHalfWidth * 0.54, outerHeight * 0.82);
  shape.lineTo(-outerHalfWidth * 0.31, outerHeight * 0.94);
  shape.lineTo(-outerHalfWidth * 0.06, outerHeight * 0.91);
  shape.lineTo(outerHalfWidth * 0.18, outerHeight);
  shape.lineTo(outerHalfWidth * 0.43, outerHeight * 0.95);
  shape.lineTo(outerHalfWidth * 0.67, outerHeight * 0.83);
  shape.lineTo(outerHalfWidth * 0.86, outerHeight * 0.67);
  shape.lineTo(outerHalfWidth * 0.98, outerHeight * 0.45);
  shape.lineTo(outerHalfWidth * 0.96, outerHeight * 0.06);
  shape.lineTo(outerHalfWidth, -0.5);
  shape.closePath();

  const opening = new THREE.Path();
  opening.moveTo(-innerHalfWidth, -0.12);
  opening.lineTo(innerHalfWidth, -0.12);
  opening.lineTo(innerHalfWidth * 0.99, openingHeight * 0.25);
  opening.lineTo(innerHalfWidth * 0.9, openingHeight * 0.49);
  opening.lineTo(innerHalfWidth * 0.72, openingHeight * 0.69);
  opening.lineTo(innerHalfWidth * 0.44, openingHeight * 0.84);
  opening.lineTo(innerHalfWidth * 0.08, openingHeight * 0.91);
  opening.lineTo(-innerHalfWidth * 0.25, openingHeight * 0.89);
  opening.lineTo(-innerHalfWidth * 0.55, openingHeight * 0.81);
  opening.lineTo(-innerHalfWidth * 0.78, openingHeight * 0.65);
  opening.lineTo(-innerHalfWidth * 0.94, openingHeight * 0.42);
  opening.lineTo(-innerHalfWidth, openingHeight * 0.17);
  opening.closePath();
  shape.holes.push(opening);

  const uvGenerator = {
    generateTopUV: (_geometry, vertices, a, b, c) => [a, b, c].map(index => (
      new THREE.Vector2(vertices[index * 3] * density, vertices[index * 3 + 1] * density)
    )),
    generateSideWallUV: (_geometry, vertices, a, b, c, d) => {
      const indices = [a, b, c, d];
      const horizontal = Math.abs(vertices[a * 3] - vertices[b * 3])
        > Math.abs(vertices[a * 3 + 1] - vertices[b * 3 + 1]);
      return indices.map(index => new THREE.Vector2(
        vertices[index * 3 + (horizontal ? 0 : 1)] * density,
        vertices[index * 3 + 2] * density,
      ));
    },
  };
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth,
    steps: 4,
    bevelEnabled: true,
    bevelSegments: 3,
    bevelSize: 0.2,
    bevelThickness: 0.17,
    UVGenerator: uvGenerator,
  });
  const position = geometry.attributes.position;
  const colors = new Float32Array(position.count * 3);
  const workColor = new THREE.Color();
  for (let index = 0; index < position.count; index += 1) {
    const x = position.getX(index);
    const y = position.getY(index);
    const sourceZ = position.getZ(index);
    const macroRelief = Math.sin(x * 0.51 + y * 0.33 + phase) * 0.14
      + Math.cos(x * 0.24 - y * 0.71 - phase * 0.6) * 0.075;
    const z = -sourceZ + macroRelief;
    position.setZ(index, z);
    const heightT = THREE.MathUtils.clamp(y / outerHeight, 0, 1);
    const recess = THREE.MathUtils.clamp(-z / Math.max(0.001, depth), 0, 1);
    const variation = Math.sin(x * 0.37 + y * 0.63 + phase) * 0.022;
    const lichenNoise = 0.5
      + Math.sin(x * 0.72 + y * 0.31 + phase) * 0.24
      + Math.cos(x * 0.29 - y * 0.83 - phase * 0.7) * 0.18
      + Math.sin(x * 1.23 + y * 0.91 + phase * 0.37) * 0.08;
    const frontFace = 1 - THREE.MathUtils.smoothstep(recess, 0.08, 0.38);
    const highBand = THREE.MathUtils.smoothstep(heightT, 0.18, 0.68);
    const lichenMask = THREE.MathUtils.smoothstep(lichenNoise, 0.57, 0.77)
      * frontFace * highBand * lichenStrength;
    workColor.copy(lowColor)
      .lerp(highColor, 0.5 + heightT * 0.3)
      .multiplyScalar(1 + variation - recess * 0.1)
      .lerp(lichenColor, lichenMask);
    colors[index * 3] = workColor.r;
    colors[index * 3 + 1] = workColor.g;
    colors[index * 3 + 2] = workColor.b;
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function makePortalLoop({
  halfWidth,
  height,
  floor,
  topSegments,
  bottomSegments,
  phase,
  irregularity,
}) {
  const points = [];
  for (let index = 0; index <= topSegments; index += 1) {
    const t = index / topSegments;
    const arch = Math.pow(Math.max(0, Math.sin(t * Math.PI)), 0.58);
    const edgeWeight = Math.sin(t * Math.PI);
    const widthWobble = 1 + Math.sin(index * 1.73 + phase) * irregularity * 0.035 * edgeWeight;
    const heightWobble = 1
      + Math.sin(index * 1.19 + phase * 0.7) * irregularity * 0.11 * edgeWeight
      + Math.cos(index * 2.31 - phase) * irregularity * 0.045 * edgeWeight;
    points.push({
      x: (-halfWidth + halfWidth * 2 * t) * widthWobble,
      y: floor + height * arch * heightWobble,
    });
  }
  for (let index = 1; index < bottomSegments; index += 1) {
    const t = index / bottomSegments;
    points.push({
      x: halfWidth - halfWidth * 2 * t,
      y: floor + Math.sin(t * Math.PI + phase) * irregularity * 0.035,
    });
  }
  return points;
}

function makeCaveCliffGeometry(formation) {
  const seed = hashText(formation.id || 'volcanic-cave-cliff');
  const phase = (seed % 10000) * 0.0017;
  const [outerHalfWidth, outerHeight, depth] = formationRadii(formation);
  const [openingWidth = 7.6, openingHeight = 3.15] = formation.opening || [];
  const profile = FORMATION_MATERIAL_PROFILES[materialKeyFor(formation)];
  const density = formation.uvDensity || profile.uvDensity;
  const irregularity = formation.irregularity ?? 0.18;
  const segmentCount = 40;
  const topSegments = 30;
  const bottomSegments = segmentCount - topSegments;
  const outerFront = makePortalLoop({
    halfWidth: outerHalfWidth,
    height: outerHeight,
    floor: -0.48,
    topSegments,
    bottomSegments,
    phase,
    irregularity,
  });
  const innerFront = makePortalLoop({
    halfWidth: openingWidth * 0.5,
    height: openingHeight,
    floor: -0.12,
    topSegments,
    bottomSegments,
    phase: phase + 2.7,
    irregularity: irregularity * 0.72,
  });
  const highColor = new THREE.Color(formation.tint || '#858d84');
  const lowColor = highColor.clone().multiplyScalar(0.72);
  const lichenColor = new THREE.Color(formation.lichenTint || '#aab39f');
  const lichenStrength = formation.lichenStrength || 0;
  const positions = [];
  const uvs = [];
  const colors = [];
  const indices = [];
  const workColor = new THREE.Color();

  function surfaceColor(point, recess, surfaceKind) {
    const heightT = THREE.MathUtils.clamp(point.y / outerHeight, 0, 1);
    const mottle = 0.5
      + Math.sin(point.x * 0.67 + point.y * 0.31 + phase) * 0.24
      + Math.cos(point.x * 0.28 - point.y * 0.76 - phase * 0.6) * 0.18;
    const frontAmount = surfaceKind === 'front' ? 1 : surfaceKind === 'tunnel' ? 0.18 : 0.52;
    const lichen = THREE.MathUtils.smoothstep(mottle, 0.57, 0.78)
      * THREE.MathUtils.smoothstep(heightT, 0.16, 0.68)
      * lichenStrength * frontAmount;
    workColor.copy(lowColor)
      .lerp(highColor, 0.42 + heightT * 0.38)
      .multiplyScalar(1 - recess * (surfaceKind === 'tunnel' ? 0.48 : 0.15))
      .lerp(lichenColor, lichen);
    return [workColor.r, workColor.g, workColor.b];
  }

  function addQuad(vertices, surfaceKind) {
    const start = positions.length / 3;
    vertices.forEach(vertex => {
      positions.push(vertex.x, vertex.y, vertex.z);
      uvs.push(vertex.u, vertex.v);
      colors.push(...surfaceColor(vertex, vertex.recess || 0, surfaceKind));
    });
    indices.push(start, start + 1, start + 2, start, start + 2, start + 3);
  }

  function frontZ(point, salt = 0) {
    return Math.sin(point.x * 0.43 + point.y * 0.29 + phase + salt) * 0.12
      + Math.cos(point.x * 0.19 - point.y * 0.61 - phase * 0.4) * 0.065;
  }

  for (let index = 0; index < segmentCount; index += 1) {
    const next = (index + 1) % segmentCount;
    const outerA = outerFront[index];
    const outerB = outerFront[next];
    const innerA = innerFront[index];
    const innerB = innerFront[next];
    const loopA = index / segmentCount;
    const loopB = (index + 1) / segmentCount;
    const outerBackA = { x: outerA.x * 0.94, y: -0.48 + (outerA.y + 0.48) * 0.94 };
    const outerBackB = { x: outerB.x * 0.94, y: -0.48 + (outerB.y + 0.48) * 0.94 };
    const innerBackA = { x: innerA.x * 0.84, y: -0.08 + (innerA.y + 0.12) * 0.88 };
    const innerBackB = { x: innerB.x * 0.84, y: -0.08 + (innerB.y + 0.12) * 0.88 };
    const outerFrontA = { ...outerA, z: frontZ(outerA), u: outerA.x * density, v: outerA.y * density };
    const outerFrontB = { ...outerB, z: frontZ(outerB), u: outerB.x * density, v: outerB.y * density };
    const innerFrontA = { ...innerA, z: frontZ(innerA, 1.7) - 0.06, u: innerA.x * density, v: innerA.y * density };
    const innerFrontB = { ...innerB, z: frontZ(innerB, 1.7) - 0.06, u: innerB.x * density, v: innerB.y * density };
    const outerRearA = { ...outerBackA, z: -depth, u: loopA * depth * 1.8, v: depth * density, recess: 1 };
    const outerRearB = { ...outerBackB, z: -depth, u: loopB * depth * 1.8, v: depth * density, recess: 1 };
    const innerRearA = { ...innerBackA, z: -depth, u: loopA * depth * 1.8, v: depth * density, recess: 1 };
    const innerRearB = { ...innerBackB, z: -depth, u: loopB * depth * 1.8, v: depth * density, recess: 1 };

    addQuad([outerFrontA, innerFrontA, innerFrontB, outerFrontB], 'front');
    addQuad([
      { ...outerFrontA, u: loopA * depth * 1.8, v: 0 },
      { ...outerFrontB, u: loopB * depth * 1.8, v: 0 },
      outerRearB,
      outerRearA,
    ], 'outer');
    addQuad([
      { ...innerFrontA, u: loopA * depth * 1.8, v: 0 },
      innerRearA,
      innerRearB,
      { ...innerFrontB, u: loopB * depth * 1.8, v: 0 },
    ], 'tunnel');
    addQuad([outerRearA, outerRearB, innerRearB, innerRearA], 'rear');
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function makeFormationGeometry(formation) {
  if (formation.form === 'cave-cliff') return makeCaveCliffGeometry(formation);
  if (formation.form === 'cave-shell') return makeCaveShellGeometry(formation);
  const seed = hashText(formation.id || 'volcanic-formation');
  const seedPhase = (seed % 10000) * 0.0017;
  const detail = formation.detail ?? 3;
  const segments = 18 + detail * 4;
  const rings = 5 + detail * 2;
  const form = formation.form || 'mass';
  const irregularity = formation.irregularity ?? 0.16;
  const [radiusX, radiusY, radiusZ] = formationRadii(formation);
  const profile = FORMATION_MATERIAL_PROFILES[materialKeyFor(formation)];
  const density = formation.uvDensity || profile.uvDensity;
  const horizontalRadius = (radiusX + radiusZ) * 0.5;
  const uScale = Math.PI * 2 * horizontalRadius * density;
  const vScale = Math.max(radiusY * 2, horizontalRadius * 0.72) * density;
  const highColor = new THREE.Color(formation.tint || '#f0ede5');
  const lowColor = highColor.clone().multiplyScalar(0.8);
  const color = new THREE.Color();
  const positions = [];
  const uvs = [];
  const colors = [];
  const indices = [];

  for (let ring = 0; ring <= rings; ring += 1) {
    const t = ring / rings;
    const height = t * radiusY * 2;
    const ledge = (form === 'shelf' || form === 'cap')
      ? 1 + Math.sin((t * 4.0 + 0.18) * Math.PI) * 0.022
      : 1;
    for (let segment = 0; segment <= segments; segment += 1) {
      const u = segment / segments;
      const angle = u * Math.PI * 2;
      const broad = Math.sin(angle * 2 + seedPhase) * 0.55
        + Math.cos(angle * 3 - seedPhase * 0.73) * 0.28
        + Math.sin(angle * 5 + seedPhase * 1.31) * 0.17;
      const vertical = Math.sin(angle * 3.0 + t * 8.2 + seedPhase * 0.6) * 0.32
        + Math.cos(angle * 6.0 - t * 5.4 - seedPhase) * 0.13;
      const radial = radiusProfile(form, t) * ledge
        * (1 + irregularity * (broad * 0.52 + vertical * 0.18));
      const topBreak = Math.pow(t, 3.6)
        * Math.sin(angle * 3 + seedPhase * 1.7)
        * radiusY * 0.055;
      let x = Math.cos(angle) * radiusX * radial;
      let z = Math.sin(angle) * radiusZ * radial
        * (1 + irregularity * Math.sin(angle * 4 - seedPhase) * 0.065);
      const y = height + topBreak;
      if (formation.lean) {
        x += y * (formation.lean[0] || 0);
        z += y * (formation.lean[1] || 0);
      }
      positions.push(x, y, z);
      uvs.push(u * uScale, t * vScale);
      const tintVariation = Math.sin(angle * 2.7 + t * 6.1 + seedPhase) * 0.022;
      color.copy(lowColor).lerp(highColor, 0.5 + t * 0.34).multiplyScalar(1 + tintVariation);
      colors.push(color.r, color.g, color.b);
    }
  }

  const stride = segments + 1;
  for (let ring = 0; ring < rings; ring += 1) {
    for (let segment = 0; segment < segments; segment += 1) {
      const a = ring * stride + segment;
      const b = a + 1;
      const c = a + stride;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }

  // Fan caps use duplicated center vertices so the repeating texture remains
  // continuous around the longitude wrap. The lower cap is normally buried.
  for (let segment = 0; segment < segments; segment += 1) {
    const u = (segment + 0.5) / segments;
    const bottomCenter = positions.length / 3;
    positions.push(0, 0, 0);
    uvs.push(u * uScale, 0);
    colors.push(lowColor.r, lowColor.g, lowColor.b);
    indices.push(bottomCenter, segment, segment + 1);

    const topStart = rings * stride;
    const topA = topStart + segment;
    const topB = topA + 1;
    const topCenter = positions.length / 3;
    const topBreak = Math.sin((u * 6 + seedPhase * 1.7) * Math.PI) * radiusY * 0.018;
    positions.push(
      radiusY * 2 * (formation.lean?.[0] || 0),
      radiusY * 2 + topBreak,
      radiusY * 2 * (formation.lean?.[1] || 0),
    );
    uvs.push(u * uScale, vScale);
    colors.push(highColor.r, highColor.g, highColor.b);
    indices.push(topA, topCenter, topB);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();

  // The UV seam has duplicate vertices. Average their normals explicitly so
  // no lighting line betrays the otherwise closed surface.
  const normal = geometry.attributes.normal;
  const seamNormal = new THREE.Vector3();
  for (let ring = 0; ring <= rings; ring += 1) {
    const first = ring * stride;
    const last = first + segments;
    seamNormal.set(
      normal.getX(first) + normal.getX(last),
      normal.getY(first) + normal.getY(last),
      normal.getZ(first) + normal.getZ(last),
    ).normalize();
    normal.setXYZ(first, seamNormal.x, seamNormal.y, seamNormal.z);
    normal.setXYZ(last, seamNormal.x, seamNormal.y, seamNormal.z);
  }
  normal.needsUpdate = true;
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function createFormationMaterial(materialKey) {
  const profile = FORMATION_MATERIAL_PROFILES[materialKey];
  const textures = loadPbrTerrainSet(FLOREANA_PBR_TEXTURES[profile.textureKey]);
  const material = new THREE.MeshStandardMaterial({
    map: textures.albedo,
    normalMap: textures.normal,
    normalScale: new THREE.Vector2(profile.normalScale, profile.normalScale),
    roughnessMap: textures.roughness,
    color: profile.tint,
    vertexColors: true,
    roughness: profile.roughness,
    metalness: 0,
    flatShading: false,
  });
  material.userData.pbrTextures = textures;
  return material;
}

function disposeFormationMaterial(material) {
  disposePbrTerrainSet(material?.userData?.pbrTextures);
  material?.dispose();
}

function VolcanicFormation({ formation, material, zoneId, sourceId }) {
  const setInspectedObject = useThreeGameStore(state => state.setInspectedObject);
  const geometry = useMemo(() => makeFormationGeometry(formation), [formation]);
  const position = useMemo(() => [
    formation.x,
    terrainHeight(formation.x, formation.z, zoneId) + (formation.yOffset || 0) - (formation.sink || 0),
    formation.z,
  ], [formation, zoneId]);
  useLayoutEffect(() => () => geometry.dispose(), [geometry]);

  return (
    <mesh
      geometry={geometry}
      material={material}
      position={position}
      rotation={[0, formation.yaw || 0, 0]}
      castShadow={formation.castShadow !== false}
      receiveShadow={formation.receiveShadow !== false}
      userData={{
        renderSource: `${sourceId}:${formation.id}`,
        renderLabel: formation.label || formation.id,
        renderKind: 'volcanic-formation',
        renderPath: null,
      }}
      onClick={event => {
        event.stopPropagation();
        setInspectedObject(catalogToInspectable(formation.inspectableType || 'basalt_block', event.point, {
          sourceId: formation.id,
        }));
      }}
    />
  );
}

export function VolcanicFormationField({ layer, zoneId }) {
  const formations = useMemo(() => layer.items || [], [layer.items]);
  const materialKeys = useMemo(() => Array.from(new Set(
    formations.map(materialKeyFor),
  )).sort(), [formations]);
  const materials = useMemo(() => Object.fromEntries(
    materialKeys.map(key => [key, createFormationMaterial(key)]),
  ), [materialKeys]);
  useLayoutEffect(() => () => {
    Object.values(materials).forEach(disposeFormationMaterial);
  }, [materials]);
  const sourceId = `ecology:${zoneId}:${layer.id}`;

  return formations.map(formation => (
    <VolcanicFormation
      key={formation.id}
      formation={formation}
      material={materials[materialKeyFor(formation)]}
      zoneId={zoneId}
      sourceId={sourceId}
    />
  ));
}
