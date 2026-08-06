'use client';

// Hand-authored strandline casts for the beach-find layer: a chocolate chip
// sea star (Nidorellia armata), a slate-pencil urchin cast (Eucidaris
// galapagensis), and a keyhole sand dollar test (Encope micropora). Muted
// bone-and-tan pieces, one merged vertex-colored geometry each, no contact
// shadow discs.

import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { useThreeGameStore } from '../../store';
import { catalogToInspectable } from '../../world/inspectables';

const UP = new THREE.Vector3(0, 1, 0);
const _worldPosition = new THREE.Vector3();
const _paintVertex = new THREE.Vector3();
const _paintColor = new THREE.Color();
const _mixColor = new THREE.Color();

function makeRng(seed) {
  let hash = 2166136261;
  const text = String(seed);
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return () => {
    hash = Math.imul(hash ^ (hash >>> 15), 2246822507);
    hash = Math.imul(hash ^ (hash >>> 13), 3266489909);
    return ((hash ^= hash >>> 16) >>> 0) / 4294967296;
  };
}

function smoothstep01(value, edge0, edge1) {
  const t = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

// Position-keyed mottle so speckling does not depend on vertex order.
function mottle(x, z) {
  return Math.sin(x * 913.7 + z * 517.3 + Math.sin(x * 231.1) * 2.7);
}

function paintVertexColors(geometry, colorAt) {
  const position = geometry.attributes.position;
  const colors = new Float32Array(position.count * 3);
  for (let i = 0; i < position.count; i += 1) {
    _paintVertex.fromBufferAttribute(position, i);
    colorAt(_paintVertex, _paintColor.set('#ffffff'));
    colors[i * 3] = _paintColor.r;
    colors[i * 3 + 1] = _paintColor.g;
    colors[i * 3 + 2] = _paintColor.b;
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
}

function mergeAndDispose(geometries) {
  // mergeGeometries refuses mixed indexed/non-indexed sets (ExtrudeGeometry is
  // non-indexed, the primitives are indexed) — expand everything first.
  const normalized = geometries.map(geometry => {
    if (!geometry.index) return geometry;
    const expanded = geometry.toNonIndexed();
    geometry.dispose();
    return expanded;
  });
  const merged = mergeGeometries(normalized, false);
  normalized.forEach(geometry => geometry.dispose());
  merged.computeBoundingSphere();
  return merged;
}

// ~15 cm five-armed star, cream body with dark conical "chips" along the arms
// and center — the plain-dress counterpart to the bright Panamic cushion star.
function buildChocolateChipStar(seed) {
  const rng = makeRng(seed);
  const outer = 0.075;
  const inner = 0.033;
  const shape = new THREE.Shape();
  for (let k = 0; k < 10; k += 1) {
    const angle = (k / 10) * Math.PI * 2;
    const radius = k % 2 === 0 ? outer * (0.92 + rng() * 0.16) : inner * (0.9 + rng() * 0.2);
    const x = Math.cos(angle) * radius;
    const y = Math.sin(angle) * radius;
    if (k === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  shape.closePath();

  const body = new THREE.ExtrudeGeometry(shape, {
    depth: 0.013,
    steps: 1,
    curveSegments: 4,
    bevelEnabled: true,
    bevelThickness: 0.01,
    bevelSize: 0.012,
    bevelSegments: 2,
  });
  body.rotateX(-Math.PI / 2);
  body.translate(0, 0.011, 0);
  paintVertexColors(body, (v, color) => {
    const radial = Math.min(1, Math.hypot(v.x, v.z) / outer);
    color.set('#dbcaa2')
      .lerp(_mixColor.set('#bda57c'), radial * 0.4 + Math.max(0, mottle(v.x, v.z)) * 0.18);
  });

  const pieces = [body];
  const chipAt = (x, z, sizeScale) => {
    const chip = new THREE.ConeGeometry(0.0105 * sizeScale, 0.015 * sizeScale, 5);
    paintVertexColors(chip, (v, color) => {
      color.set('#4a2e20').lerp(_mixColor.set('#63402a'), rng() * 0.4);
    });
    chip.rotateX((rng() - 0.5) * 0.5);
    chip.rotateZ((rng() - 0.5) * 0.5);
    chip.translate(x, 0.021, z);
    pieces.push(chip);
  };
  chipAt(0, 0, 1.15);
  for (let arm = 0; arm < 5; arm += 1) {
    const armAngle = (arm / 5) * Math.PI * 2 + (rng() - 0.5) * 0.14;
    chipAt(Math.cos(armAngle) * 0.042, Math.sin(armAngle) * 0.042, 0.85 + rng() * 0.3);
    const innerAngle = armAngle + Math.PI / 5;
    chipAt(Math.cos(innerAngle) * 0.02, Math.sin(innerAngle) * 0.02, 0.7 + rng() * 0.25);
  }
  return mergeAndDispose(pieces);
}

// A dead slate-pencil urchin on the strandline: bleached test with most of the
// stout baton spines shed and lying beside it, a couple still articulated.
function buildPencilUrchinCast(seed) {
  const rng = makeRng(seed);
  const pieces = [];

  const test = new THREE.SphereGeometry(0.034, 12, 9);
  test.scale(1, 0.66, 1);
  test.translate(0, 0.018, 0);
  paintVertexColors(test, (v, color) => {
    const band = Math.max(0, Math.sin(Math.atan2(v.z, v.x) * 10)) * 0.2;
    color.set('#d8c9ac').lerp(_mixColor.set('#b08f7c'), band + Math.max(0, mottle(v.x, v.z)) * 0.1);
  });
  pieces.push(test);

  const spine = (length, baseRadius) => {
    const geometry = new THREE.CylinderGeometry(baseRadius * 0.72, baseRadius, length, 6);
    const coralline = rng() < 0.3;
    paintVertexColors(geometry, (v, color) => {
      const t = v.y / length + 0.5;
      color.set('#96654c').lerp(_mixColor.set('#d9ccb2'), smoothstep01(t, 0.25, 0.95));
      if (coralline && t > 0.72) color.lerp(_mixColor.set('#87926b'), 0.3);
    });
    return geometry;
  };

  const shedCount = 5 + Math.floor(rng() * 3);
  for (let i = 0; i < shedCount; i += 1) {
    const length = 0.05 + rng() * 0.028;
    const piece = spine(length, 0.0075);
    piece.rotateZ(Math.PI / 2 + (rng() - 0.5) * 0.16);
    piece.rotateY(rng() * Math.PI * 2);
    const angle = rng() * Math.PI * 2;
    const distance = 0.03 + rng() * 0.05;
    piece.translate(Math.cos(angle) * distance, 0.006, Math.sin(angle) * distance);
    pieces.push(piece);
  }
  for (let i = 0; i < 2; i += 1) {
    const length = 0.052 + rng() * 0.022;
    const piece = spine(length, 0.008);
    const direction = new THREE.Vector3(rng() - 0.5, 0.5 + rng() * 0.7, rng() - 0.5).normalize();
    piece.translate(0, length * 0.5, 0);
    piece.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, direction));
    piece.translate(direction.x * 0.024, direction.y * 0.016 + 0.014, direction.z * 0.024);
    pieces.push(piece);
  }
  return mergeAndDispose(pieces);
}

// Sun-bleached sand dollar: a thin lens with the five-petal rosette showing as
// a faint darker etching on the upper face.
function buildSandDollarTest(seed) {
  const rng = makeRng(seed);
  const radius = 0.054;
  const rosetteYaw = rng() * Math.PI * 2;
  const lens = new THREE.SphereGeometry(radius, 40, 12);
  lens.scale(1, 0.13, 1);
  lens.translate(0, 0.006, 0);
  paintVertexColors(lens, (v, color) => {
    const radial = Math.min(1, Math.hypot(v.x, v.z) / radius);
    if (v.y > 0.0065) {
      const theta = Math.atan2(v.z, v.x);
      const lobe = Math.pow(Math.max(0, Math.cos(5 * (theta - rosetteYaw))), 2.5);
      const band = smoothstep01(radial, 0.06, 0.22) * (1 - smoothstep01(radial, 0.5, 0.68));
      color.set('#d8d1bf')
        .lerp(_mixColor.set('#b2a892'), lobe * band * 0.7 + Math.max(0, mottle(v.x, v.z)) * 0.06);
    } else {
      color.set('#c9bda4').lerp(_mixColor.set('#b6a98e'), radial * 0.3);
    }
    if (radial > 0.9) color.lerp(_mixColor.set('#aca189'), (radial - 0.9) * 3);
  });
  return lens;
}

let castMaterial = null;
function getCastMaterial() {
  if (!castMaterial) {
    castMaterial = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.93,
      metalness: 0,
    });
  }
  return castMaterial;
}

function BeachCastFind({
  build,
  label,
  position,
  rotation = [0, 0, 0],
  scale = 1,
  maxVisibleDistance = 58,
  inspectableType,
  sourceId,
  inspectableOverrides = null,
}) {
  const geometry = useMemo(() => build(sourceId || label), [build, label, sourceId]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  const group = useRef(null);
  const setInspectedObject = useThreeGameStore(state => state.setInspectedObject);
  const maxVisibleSq = maxVisibleDistance > 0 ? maxVisibleDistance * maxVisibleDistance : null;

  useFrame(({ camera }) => {
    const node = group.current;
    if (!node || maxVisibleSq === null) return;
    node.getWorldPosition(_worldPosition);
    node.visible = _worldPosition.distanceToSquared(camera.position) <= maxVisibleSq;
  });

  return (
    <group
      ref={group}
      position={position}
      rotation={rotation}
      scale={scale}
      userData={{
        renderSource: sourceId,
        renderLabel: label,
        renderKind: 'ecology-collectible-beach-find',
      }}
      onClick={event => {
        event.stopPropagation();
        setInspectedObject(catalogToInspectable(inspectableType, event.point, {
          sourceId,
          ...(inspectableOverrides || {}),
        }));
      }}
    >
      <mesh geometry={geometry} material={getCastMaterial()} castShadow={false} receiveShadow />
    </group>
  );
}

export function ChocolateChipStar(props) {
  return <BeachCastFind build={buildChocolateChipStar} label="chocolate-chip-star" {...props} />;
}

export function PencilUrchinCast(props) {
  return <BeachCastFind build={buildPencilUrchinCast} label="pencil-urchin-cast" {...props} />;
}

export function SandDollarTest(props) {
  return <BeachCastFind build={buildSandDollarTest} label="sand-dollar-test" {...props} />;
}
