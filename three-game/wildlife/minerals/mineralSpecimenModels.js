// Hand-specimen minerals. Each one is modelled from its own habit rather than
// tinted off the basalt boulder: what tells olivine from tuff at a glance is
// the shape of the break, the grain, and the gloss, not the colour.
//
//   olivine           blocky glassy crystals set in a dark host block
//   tuff              a soft bedded ash block, laminae eroding at the edges
//   ironoxidecrust    a thin rust plate lifting and flaking off its substrate
//   meteoriron        a dense ablated lump, regmaglypts and one cut face
//   solidifiedsulphur a druse of bright bipyramids on a fumarole crust
//   scoria            frothy vesicular clinker, holes right through the rim
//
// Sizes are metres, chosen so each reads from a couple of paces without
// looking like a boulder: 0.3-0.55 m across. Smaller than this and they are
// pebbles you walk past.

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {
  FLOREANA_PBR_TEXTURES,
  loadPbrTerrainSet,
} from '../../world/regions/materials/pbrTerrainTextures';

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

const _v = new THREE.Vector3();
const _scale = new THREE.Vector3();
const _color = new THREE.Color();
const _mix = new THREE.Color();

// Per-vertex colour from a callback over the local position. Every mineral
// paints its own grain this way so one material can serve a whole lump.
function paint(geometry, fn) {
  const position = geometry.getAttribute('position');
  const colors = new Float32Array(position.count * 3);
  for (let i = 0; i < position.count; i += 1) {
    _v.fromBufferAttribute(position, i);
    fn(_color, _v, i);
    colors[i * 3] = _color.r;
    colors[i * 3 + 1] = _color.g;
    colors[i * 3 + 2] = _color.b;
  }
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  return geometry;
}

// Breaks a smooth primitive into an angular lump. `facet` snaps vertices onto
// a coarse lattice, which is what gives a conchoidal-looking fracture rather
// than a lumpy potato.
function fracture(geometry, { rng, amount = 0.16, facet = 0, squash = [1, 1, 1] }) {
  const position = geometry.getAttribute('position');
  const jitter = Array.from({ length: 12 }, () => rng() * Math.PI * 2);
  for (let i = 0; i < position.count; i += 1) {
    _v.fromBufferAttribute(position, i);
    const n = Math.sin(_v.x * 5.3 + jitter[0]) * Math.cos(_v.y * 4.1 + jitter[1])
      + Math.sin(_v.z * 6.7 + jitter[2]) * 0.6;
    _v.multiplyScalar(1 + n * amount);
    if (facet > 0) {
      _v.x = Math.round(_v.x / facet) * facet;
      _v.y = Math.round(_v.y / facet) * facet;
      _v.z = Math.round(_v.z / facet) * facet;
    }
    _v.multiply(_scale.set(squash[0], squash[1], squash[2]));
    position.setXYZ(i, _v.x, _v.y, _v.z);
  }
  geometry.computeVertexNormals();
  return geometry;
}

// The terrain PBR sets are what give basalt its grain and its glint, and they
// tile in world space. A deformed icosahedron has spherical UVs that pinch at
// the poles, so every mineral gets box-projected coordinates instead: pick the
// dominant axis per face and read the other two. Scale is baked into the UVs
// rather than the texture's repeat, because those textures are shared.
function boxProjectUv(geometry, scale = 0.35) {
  const flat = geometry.index ? geometry.toNonIndexed() : geometry;
  const position = flat.getAttribute('position');
  const uv = new Float32Array(position.count * 2);
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const normal = new THREE.Vector3();
  for (let i = 0; i < position.count; i += 3) {
    a.fromBufferAttribute(position, i);
    b.fromBufferAttribute(position, i + 1);
    c.fromBufferAttribute(position, i + 2);
    normal.copy(c).sub(b).cross(b.clone().sub(a)).normalize();
    const ax = Math.abs(normal.x);
    const ay = Math.abs(normal.y);
    const az = Math.abs(normal.z);
    for (let k = 0; k < 3; k += 1) {
      _v.fromBufferAttribute(position, i + k);
      let u;
      let v;
      if (ay >= ax && ay >= az) { u = _v.x; v = _v.z; }
      else if (ax >= az) { u = _v.z; v = _v.y; }
      else { u = _v.x; v = _v.y; }
      uv[(i + k) * 2] = u / scale;
      uv[(i + k) * 2 + 1] = v / scale;
    }
  }
  flat.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  if (flat !== geometry) geometry.dispose();
  return flat;
}

// Rescales vertex colours so their mean luminance lands on `target`, keeping
// the hue relationships intact.
function normaliseTint(geometry, target = 1.04) {
  const color = geometry.getAttribute('color');
  if (!color) return geometry;
  let sum = 0;
  for (let i = 0; i < color.count; i += 1) {
    sum += 0.299 * color.getX(i) + 0.587 * color.getY(i) + 0.114 * color.getZ(i);
  }
  const mean = sum / Math.max(1, color.count);
  if (mean <= 0.001) return geometry;
  const gain = target / mean;
  for (let i = 0; i < color.count; i += 1) {
    color.setXYZ(
      i,
      Math.min(1.9, color.getX(i) * gain),
      Math.min(1.9, color.getY(i) * gain),
      Math.min(1.9, color.getZ(i) * gain),
    );
  }
  color.needsUpdate = true;
  return geometry;
}

function place(geometry, position = [0, 0, 0], rotation = [0, 0, 0], scale = [1, 1, 1]) {
  geometry.applyMatrix4(new THREE.Matrix4().compose(
    new THREE.Vector3(...position),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation)),
    new THREE.Vector3(...scale),
  ));
  return geometry;
}

// --- Olivine ----------------------------------------------------------------
// Chrysolite in the field is a scatter of glassy green grains locked in dark
// lava. The host is deliberately dull so the crystals carry the read.

function olivineCrystal(rng, size) {
  // A blocky orthorhombic prism with pyramidal terminations: six sides, capped.
  const prism = new THREE.CylinderGeometry(size, size * 0.94, size * 1.5, 6, 1, false);
  const cap = new THREE.ConeGeometry(size, size * 0.62, 6);
  place(cap, [0, size * 1.06, 0]);
  const foot = new THREE.ConeGeometry(size * 0.94, size * 0.5, 6);
  place(foot, [0, -size * 1.0, 0], [Math.PI, 0, 0]);
  const crystal = mergeGeometries([prism, cap, foot], false);
  [prism, cap, foot].forEach(part => part.dispose());
  // Squat and slightly wedge-shaped; a perfect prism reads as a game token.
  place(crystal, [0, 0, 0], [rng() * 0.4 - 0.2, rng() * Math.PI, rng() * 0.3 - 0.15], [1, 0.72, 0.82]);
  return crystal;
}

function buildOlivine(seed) {
  const rng = makeRng(`olivine:${seed}`);
  const host = fracture(new THREE.IcosahedronGeometry(0.25, 1), {
    rng,
    amount: 0.2,
    facet: 0.036,
    squash: [1.05, 0.62, 0.9],
  });
  place(host, [0, 0.112, 0]);
  paint(host, (out, v) => {
    // Dark vesicular basalt, a shade warmer where it has weathered up-facing.
    out.set('#3b382f').lerp(_mix.set('#5d5245'), THREE.MathUtils.clamp(v.y * 3.2, 0, 1) * 0.5);
    out.multiplyScalar(0.9 + Math.sin(v.x * 31 + v.z * 27) * 0.06);
  });

  const crystals = [];
  const count = 7 + Math.floor(rng() * 5);
  for (let i = 0; i < count; i += 1) {
    const size = 0.036 + rng() * 0.042;
    const crystal = olivineCrystal(rng, size);
    const angle = rng() * Math.PI * 2;
    const radius = 0.04 + rng() * 0.105;
    place(
      crystal,
      [Math.cos(angle) * radius, 0.13 + rng() * 0.07, Math.sin(angle) * radius],
      [rng() * 0.9 - 0.45, rng() * Math.PI * 2, rng() * 0.9 - 0.45],
    );
    const tone = rng();
    paint(crystal, out => {
      out.set('#6f8f3a').lerp(_mix.set('#b6d366'), tone * 0.75);
    });
    crystals.push(crystal);
  }
  return {
    parts: [
      { geometry: host, material: 'matrix' },
      { geometry: mergeGeometries(crystals, false), material: 'glassy' },
    ],
    dispose: crystals,
  };
}

// --- Volcanic tuff ----------------------------------------------------------
// Ash fall settles in beds, and tuff weathers along them. The laminae are the
// whole identity of the rock, so they are modelled as separate courses with
// eroded edges rather than painted as stripes.

function buildTuff(seed) {
  const rng = makeRng(`tuff:${seed}`);
  const beds = [];
  const courses = 6;
  let y = 0;
  for (let i = 0; i < courses; i += 1) {
    const thickness = 0.046 + rng() * 0.052;
    const radius = 0.34 * (1 - Math.pow(i / courses, 1.7) * 0.34) * (0.9 + rng() * 0.16);
    const bed = new THREE.CylinderGeometry(radius * (0.94 + rng() * 0.12), radius, thickness, 11, 1);
    // Weathering undercuts the softer courses, so each rim erodes differently.
    fracture(bed, { rng, amount: 0.09, squash: [1, 1, 0.86] });
    place(bed, [(rng() - 0.5) * 0.02, y + thickness * 0.5, (rng() - 0.5) * 0.02], [0, rng() * Math.PI, 0]);
    const pale = 0.55 + rng() * 0.45;
    paint(bed, (out, v) => {
      out.set('#c8ba99').lerp(_mix.set('#e6dcc2'), pale);
      // Grain: ash is chalky and slightly blotchy, never flat.
      out.multiplyScalar(0.93 + Math.sin(v.x * 41 + v.z * 37 + i) * 0.06);
    });
    beds.push(bed);
    y += thickness;
  }

  // Lapilli: dark ejecta frozen into the ash, a couple standing proud.
  const clasts = [];
  for (let i = 0; i < 7; i += 1) {
    const size = 0.016 + rng() * 0.022;
    const clast = fracture(new THREE.IcosahedronGeometry(size, 0), { rng, amount: 0.3 });
    const angle = rng() * Math.PI * 2;
    place(clast, [
      Math.cos(angle) * (0.08 + rng() * 0.15),
      0.02 + rng() * (y - 0.04),
      Math.sin(angle) * (0.08 + rng() * 0.15),
    ]);
    paint(clast, out => out.set('#4a443a').lerp(_mix.set('#6b6154'), rng() * 0.6));
    clasts.push(clast);
  }

  return {
    parts: [
      { geometry: mergeGeometries(beds, false), material: 'chalky' },
      { geometry: mergeGeometries(clasts, false), material: 'matrix' },
    ],
    dispose: [...beds, ...clasts],
  };
}

// --- Iron-stained crust -----------------------------------------------------
// A coating rather than a rock: a thin rust plate lifting off its substrate,
// curled at the edges with flakes shed around it.

function buildIronOxideCrust(seed) {
  const rng = makeRng(`ironoxide:${seed}`);
  const substrate = fracture(new THREE.IcosahedronGeometry(0.27, 1), {
    rng,
    amount: 0.16,
    facet: 0.038,
    squash: [1.1, 0.34, 1],
  });
  place(substrate, [0, 0.065, 0]);
  paint(substrate, out => out.set('#4b463c').lerp(_mix.set('#645b4d'), rng() * 0.4));

  // The crust itself: a shallow dome sliced thin, its rim lifted clear of the
  // rock so the light gets under it.
  const plate = new THREE.SphereGeometry(0.26, 22, 8, 0, Math.PI * 2, 0, Math.PI * 0.36);
  const position = plate.getAttribute('position');
  for (let i = 0; i < position.count; i += 1) {
    _v.fromBufferAttribute(position, i);
    const rim = THREE.MathUtils.clamp((Math.hypot(_v.x, _v.z) - 0.13) / 0.08, 0, 1);
    _v.y = _v.y * 0.22 + rim * rim * 0.046 * (0.6 + Math.sin(Math.atan2(_v.z, _v.x) * 5) * 0.4);
    position.setXYZ(i, _v.x, _v.y, _v.z);
  }
  plate.computeVertexNormals();
  place(plate, [0, 0.106, 0]);
  paint(plate, (out, v) => {
    const rim = THREE.MathUtils.clamp((Math.hypot(v.x, v.z) - 0.12) / 0.09, 0, 1);
    out.set('#8f4a24').lerp(_mix.set('#c9773a'), 0.35 + Math.sin(v.x * 28 + v.z * 24) * 0.3);
    // The lifting edge is thinner and browner where it has begun to shed.
    out.lerp(_mix.set('#6b3a22'), rim * 0.6);
  });

  const flakes = [];
  for (let i = 0; i < 9; i += 1) {
    const size = 0.016 + rng() * 0.029;
    const flake = new THREE.CircleGeometry(size, 5);
    const angle = rng() * Math.PI * 2;
    place(
      flake,
      [Math.cos(angle) * (0.16 + rng() * 0.12), 0.008 + rng() * 0.013, Math.sin(angle) * (0.16 + rng() * 0.12)],
      [-Math.PI / 2 + (rng() - 0.5) * 0.5, rng() * Math.PI, (rng() - 0.5) * 0.5],
    );
    paint(flake, out => out.set('#a85c2c').lerp(_mix.set('#7d4223'), rng() * 0.7));
    flakes.push(flake);
  }

  return {
    parts: [
      { geometry: substrate, material: 'matrix' },
      { geometry: mergeGeometries([plate, ...flakes], false), material: 'crust' },
    ],
    dispose: [plate, ...flakes],
  };
}

// --- Meteoric iron ----------------------------------------------------------
// Small, dense, and unmistakable: ablation thumbprints over a matte fusion
// crust, and one sawn face where the metal shows.

function buildMeteorIron(seed) {
  const rng = makeRng(`meteoriron:${seed}`);
  const body = new THREE.IcosahedronGeometry(0.175, 3);
  // Regmaglypts: shallow spherical dents pressed into the surface, the way
  // the airflow scooped it out on the way down.
  const dents = Array.from({ length: 9 }, () => {
    const theta = rng() * Math.PI * 2;
    const phi = Math.acos(rng() * 2 - 1);
    return {
      dir: new THREE.Vector3(
        Math.sin(phi) * Math.cos(theta),
        Math.sin(phi) * Math.sin(theta),
        Math.cos(phi),
      ),
      radius: 0.35 + rng() * 0.3,
      depth: 0.017 + rng() * 0.022,
    };
  });
  const position = body.getAttribute('position');
  for (let i = 0; i < position.count; i += 1) {
    _v.fromBufferAttribute(position, i);
    const normal = _v.clone().normalize();
    let push = 0;
    for (const dent of dents) {
      const closeness = Math.max(0, normal.dot(dent.dir) - (1 - dent.radius)) / dent.radius;
      push += dent.depth * closeness * closeness;
    }
    _v.multiplyScalar(1 + Math.sin(_v.x * 21 + _v.z * 17) * 0.035);
    _v.addScaledVector(normal, -push);
    // The sawn face: everything past this plane is planed flat.
    if (_v.x > 0.072) _v.x = 0.072;
    position.setXYZ(i, _v.x, _v.y * 0.92, _v.z);
  }
  body.computeVertexNormals();
  place(body, [0, 0.126, 0]);
  paint(body, (out, v) => {
    if (v.x > 0.0705) {
      // Polished metal, faintly clouded.
      out.set('#b7b2a8').multiplyScalar(0.92 + Math.sin(v.y * 60 + v.z * 44) * 0.07);
    } else {
      out.set('#1e1c1a').lerp(_mix.set('#3a352f'), THREE.MathUtils.clamp(0.4 + v.y * 3, 0, 1) * 0.5);
    }
  });

  // Widmanstätten hatching on the cut face: two sets of fine crossing lamellae.
  const hatch = [];
  for (let i = 0; i < 14; i += 1) {
    const bar = new THREE.BoxGeometry(0.0016, 0.0022, 0.1 + rng() * 0.07);
    place(
      bar,
      [0.0725, 0.126 + (rng() - 0.5) * 0.15, (rng() - 0.5) * 0.085],
      [(i % 2 ? 1 : -1) * 1.05 + (rng() - 0.5) * 0.2, 0, 0],
    );
    hatch.push(bar);
  }

  return {
    parts: [
      { geometry: body, material: 'meteorite' },
      { geometry: mergeGeometries(hatch, false), material: 'lamella' },
    ],
    dispose: hatch,
  };
}

// --- Solidified sulphur -----------------------------------------------------
// A fumarole encrustation: bipyramidal crystals grown out of a botryoidal
// crust on grey rock. The gaudiest thing in the mineral set, deliberately.

function sulphurCrystal(rng, size) {
  const upper = new THREE.ConeGeometry(size, size * 1.5, 4);
  place(upper, [0, size * 0.75, 0]);
  const lower = new THREE.ConeGeometry(size, size * 0.9, 4);
  place(lower, [0, -size * 0.45, 0], [Math.PI, 0, 0]);
  const crystal = mergeGeometries([upper, lower], false);
  [upper, lower].forEach(part => part.dispose());
  return crystal;
}

function buildSolidifiedSulphur(seed) {
  const rng = makeRng(`sulphur:${seed}`);
  const host = fracture(new THREE.IcosahedronGeometry(0.235, 1), {
    rng,
    amount: 0.18,
    facet: 0.034,
    squash: [1.05, 0.55, 0.95],
  });
  place(host, [0, 0.092, 0]);
  paint(host, out => out.set('#655e52').lerp(_mix.set('#82796a'), rng() * 0.5));

  // Botryoidal crust: overlapping bulbs skinned over the upper surface.
  const crust = [];
  for (let i = 0; i < 16; i += 1) {
    const size = 0.021 + rng() * 0.029;
    const bulb = new THREE.SphereGeometry(size, 8, 6);
    const angle = rng() * Math.PI * 2;
    const radius = rng() * 0.13;
    place(bulb, [Math.cos(angle) * radius, 0.138 + rng() * 0.024, Math.sin(angle) * radius], [0, 0, 0], [1, 0.6, 1]);
    paint(bulb, out => out.set('#c9a828').lerp(_mix.set('#e6c53c'), rng() * 0.6));
    crust.push(bulb);
  }

  const crystals = [];
  for (let i = 0; i < 11; i += 1) {
    const size = 0.014 + rng() * 0.021;
    const crystal = sulphurCrystal(rng, size);
    const angle = rng() * Math.PI * 2;
    const radius = rng() * 0.125;
    place(
      crystal,
      [Math.cos(angle) * radius, 0.156 + rng() * 0.037, Math.sin(angle) * radius],
      [(rng() - 0.5) * 0.9, rng() * Math.PI * 2, (rng() - 0.5) * 0.9],
    );
    const tone = rng();
    paint(crystal, out => out.set('#f0d823').lerp(_mix.set('#fff08a'), tone * 0.6));
    crystals.push(crystal);
  }

  return {
    parts: [
      { geometry: host, material: 'matrix' },
      { geometry: mergeGeometries(crust, false), material: 'resinous' },
      { geometry: mergeGeometries(crystals, false), material: 'glassy' },
    ],
    dispose: [...crust, ...crystals],
  };
}

// --- Scoria -----------------------------------------------------------------
// The froth off the top of a flow. Vesicles are the point: without holes it is
// just a red rock, so the rim is punched right through.

function buildScoria(seed) {
  const rng = makeRng(`scoria:${seed}`);
  const clinker = new THREE.IcosahedronGeometry(0.26, 3);
  const pits = Array.from({ length: 22 }, () => {
    const theta = rng() * Math.PI * 2;
    const phi = Math.acos(rng() * 2 - 1);
    return {
      dir: new THREE.Vector3(
        Math.sin(phi) * Math.cos(theta),
        Math.sin(phi) * Math.sin(theta),
        Math.cos(phi),
      ),
      radius: 0.1 + rng() * 0.16,
      depth: 0.024 + rng() * 0.034,
    };
  });
  const position = clinker.getAttribute('position');
  for (let i = 0; i < position.count; i += 1) {
    _v.fromBufferAttribute(position, i);
    const normal = _v.clone().normalize();
    let push = 0;
    for (const pit of pits) {
      const closeness = Math.max(0, normal.dot(pit.dir) - (1 - pit.radius)) / pit.radius;
      push += pit.depth * closeness * closeness;
    }
    _v.multiplyScalar(1 + Math.sin(_v.x * 17 + _v.y * 13 + _v.z * 19) * 0.12);
    _v.addScaledVector(normal, -push);
    _v.y = Math.max(_v.y * 0.78, -0.072);
    position.setXYZ(i, _v.x, _v.y, _v.z);
  }
  clinker.computeVertexNormals();
  place(clinker, [0, 0.1, 0]);
  paint(clinker, (out, v) => {
    // Oxidised rusty red on the outside, near-black in the vesicles.
    const exposure = THREE.MathUtils.clamp(0.4 + v.y * 4.5, 0, 1);
    out.set('#2a221d').lerp(_mix.set('#7d4a36'), exposure * 0.7);
    out.multiplyScalar(0.88 + Math.sin(v.x * 44 + v.z * 39) * 0.1);
  });
  return { parts: [{ geometry: clinker, material: 'clinker' }], dispose: [] };
}

// --- Materials --------------------------------------------------------------
// Gloss is doing as much identification work as colour here: olivine is glassy,
// tuff is chalky, the meteorite's cut face is the only metal in the set.

// Each rock surface borrows the terrain set that already describes it, so the
// minerals pick up the same normal detail and specular glitter as the basalt
// boulder instead of reading as flat vertex colour. Crystal faces stay
// untextured: their identity is gloss and facet, not grain.
const SURFACE_SETS = {
  matrix: 'galapagosOlivineBasalt',
  chalky: 'sandyTuff',
  crust: 'oxidizedScoriaceousBasalt',
  meteorite: 'darkBasaltGravel',
  clinker: 'oxidizedScoriaceousBasalt',
};

// How much of the final value the vertex paint is allowed to carry. The rust
// and scoria maps are already red; letting the paint push them too reads as
// poster paint rather than oxidised rock.
const TINT_TARGET = {
  matrix: 1.04,
  chalky: 1.02,
  crust: 0.88,
  meteorite: 0.98,
  clinker: 0.78,
};

function mapsFor(surface) {
  const key = SURFACE_SETS[surface];
  if (!key || !FLOREANA_PBR_TEXTURES[key]) return {};
  const set = loadPbrTerrainSet(FLOREANA_PBR_TEXTURES[key]);
  return {
    map: set.albedo,
    normalMap: set.normal,
    roughnessMap: set.roughness,
  };
}

let materialCache = null;
function getMineralMaterials() {
  if (materialCache) return materialCache;
  materialCache = {
    matrix: new THREE.MeshStandardMaterial({
      ...mapsFor('matrix'),
      normalScale: new THREE.Vector2(0.85, 0.85),
      envMapIntensity: 1.25,
      vertexColors: true, roughness: 0.8, metalness: 0, flatShading: true,
    }),
    chalky: new THREE.MeshStandardMaterial({
      ...mapsFor('chalky'),
      normalScale: new THREE.Vector2(0.5, 0.5),
      vertexColors: true, roughness: 0.98, metalness: 0,
    }),
    glassy: new THREE.MeshPhysicalMaterial({
      vertexColors: true, roughness: 0.14, metalness: 0, flatShading: true,
      clearcoat: 0.75, clearcoatRoughness: 0.1,
    }),
    resinous: new THREE.MeshPhysicalMaterial({
      vertexColors: true, roughness: 0.38, metalness: 0, clearcoat: 0.35,
    }),
    crust: new THREE.MeshStandardMaterial({
      ...mapsFor('crust'),
      normalScale: new THREE.Vector2(0.75, 0.75),
      color: '#c3a596',
      vertexColors: true, roughness: 0.84, metalness: 0.06, side: THREE.DoubleSide,
    }),
    meteorite: new THREE.MeshStandardMaterial({
      ...mapsFor('meteorite'),
      normalScale: new THREE.Vector2(0.55, 0.55),
      vertexColors: true, roughness: 0.5, metalness: 0.6,
    }),
    lamella: new THREE.MeshStandardMaterial({
      color: '#6f6a61', roughness: 0.28, metalness: 0.92,
    }),
    clinker: new THREE.MeshStandardMaterial({
      ...mapsFor('clinker'),
      normalScale: new THREE.Vector2(1.05, 1.05),
      envMapIntensity: 1.3,
      color: '#9c8175',
      vertexColors: true, roughness: 0.88, metalness: 0, flatShading: true,
    }),
  };
  return materialCache;
}

const BUILDERS = {
  olivine: buildOlivine,
  tuff: buildTuff,
  ironoxidecrust: buildIronOxideCrust,
  meteoriron: buildMeteorIron,
  solidifiedsulphur: buildSolidifiedSulphur,
  scoria: buildScoria,
};

export function isMineralSpecimen(specimenId) {
  return Boolean(BUILDERS[specimenId]);
}

// Two things every mineral needs and none of the builders should have to
// repeat: a per-specimen size and proportion, so a row of them never looks
// stamped; and a seat in the ground, because a rock resting on the terrain
// with a shadow gap under it reads as a prop.
const MIN_BURIAL = 0.08; // fraction of the lump's height pushed under the surface
const ACTOR_LIFT = 0.04; // SpecimenActor floats the group this far off terrain
// How big this kind of thing is before the per-specimen roll. A tuff bench is
// part of an outcrop; a meteorite fragment fits in a coat pocket.
const BASE_SCALE = {
  olivine: 1,
  tuff: 1.1,
  ironoxidecrust: 1.15,
  meteoriron: 0.7,
  solidifiedsulphur: 0.95,
  scoria: 1.2,
};

function varyAndBed(parts, rng, base = 1) {
  // Cubed roll, so most are middling but the tails reach genuine pebbles and
  // genuine blocks rather than everything landing in the same medium band.
  const roll = rng();
  const overall = base * (0.42 + Math.pow(roll, 3) * 2.35);
  const shape = new THREE.Vector3(
    overall * (0.88 + rng() * 0.26),
    overall * (0.8 + rng() * 0.34),
    overall * (0.88 + rng() * 0.26),
  );
  const transform = new THREE.Matrix4().compose(
    new THREE.Vector3(0, 0, 0),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rng() * Math.PI * 2, 0)),
    shape,
  );
  const bounds = new THREE.Box3();
  for (const part of parts) {
    part.geometry.applyMatrix4(transform);
    part.geometry.computeBoundingBox();
    bounds.union(part.geometry.boundingBox);
  }
  // Texture scale is fixed in world space, so a big block shows the same grain
  // size as a pebble instead of a stretched copy of it.
  for (const part of parts) {
    if (!SURFACE_SETS[part.material]) continue;
    part.geometry = boxProjectUv(part.geometry, 0.3);
    // The painted colours were authored as final values. Multiplied by an
    // albedo map they would darken twice, so they are rebalanced into tints
    // around 1.0: the map now carries the value, the paint carries the hue.
    normaliseTint(part.geometry, TINT_TARGET[part.material] ?? 1.0);
  }
  const height = Math.max(0.01, bounds.max.y - bounds.min.y);
  const sink = -bounds.min.y - ACTOR_LIFT - height * MIN_BURIAL;
  const seat = new THREE.Matrix4().makeTranslation(0, sink, 0);
  for (const part of parts) {
    part.geometry.applyMatrix4(seat);
    part.geometry.computeBoundingBox();
    part.geometry.computeBoundingSphere();
  }
  return parts;
}

export function buildMineralSpecimen(specimenId, seed) {
  const built = BUILDERS[specimenId](seed);
  built.dispose.forEach(part => part.dispose());
  const parts = built.parts.filter(part => part.geometry);
  return varyAndBed(parts, makeRng(`mineral-shape:${specimenId}:${seed}`), BASE_SCALE[specimenId] || 1);
}

export { getMineralMaterials };
