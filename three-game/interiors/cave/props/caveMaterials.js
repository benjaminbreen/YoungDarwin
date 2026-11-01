import { useMemo } from 'react';
import * as THREE from 'three';
import { loadRepeatingTerrainTexture } from '../../../world/regions/materials/pbrTerrainTextures';
import { loadPeriodSurface } from '../../../world/regions/materials/periodMaterials';
import { useDeferredDisposal } from '../../../components/assets/useDeferredDisposal';
import { createPrintTextures } from './printTextures';

// Shared materials for the furnishings of Gabriel's cave. Everything Gabriel
// owns is either salvaged (iron, brass, glass, paper) or made on the island
// (adzed timber, goatskin, straw, clay), and the materials say which.

const BEAGLE = '/assets/textures/interiors/beagle-cabin';

function loadSet(base, { color, normal, rough }, rotation = 0) {
  const map = loadRepeatingTerrainTexture(`${base}/${color}`, { fallback: '#7a5a3c', colorSpace: THREE.SRGBColorSpace });
  const normalMap = loadRepeatingTerrainTexture(`${base}/${normal}`, { fallback: [128, 128, 255, 255] });
  const roughnessMap = loadRepeatingTerrainTexture(`${base}/${rough}`, { fallback: [220, 220, 220, 255] });
  for (const texture of [map, normalMap, roughnessMap]) {
    texture.center.set(0.5, 0.5);
    texture.rotation = rotation;
  }
  return { map, normalMap, roughnessMap };
}

function texturedMaterial(set, { color = '#ffffff', roughness = 1, normalScale = 0.8, name } = {}) {
  const material = new THREE.MeshStandardMaterial({
    ...set,
    color,
    roughness,
    metalness: 0,
    normalScale: new THREE.Vector2(normalScale, normalScale),
  });
  if (name) material.name = name;
  if (set.periodSurface) material.userData.periodSurface = set.periodSurface;
  return material;
}

function plain(color, roughness = 0.85, metalness = 0, extra = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness, ...extra });
}

export function createCaveMaterials() {
  const fine = loadPeriodSurface('weatheredWood');
  const fineRound = loadPeriodSurface('weatheredWood', { offset: [0.12, 0.28] });
  const planks = loadPeriodSurface('weatheredWood', { offset: [0.37, 0.21] });
  const oak = loadSet(BEAGLE, { color: 'varnished-oak-diff-1k.jpg', normal: 'varnished-oak-normal-1k.jpg', rough: 'varnished-oak-rough-1k.jpg' });
  const wool = loadPeriodSurface('wool');
  const linen = loadPeriodSurface('linen');
  const sacking = loadPeriodSurface('sacking');
  const leather = loadPeriodSurface('leather');
  const endGrain = loadPeriodSurface('endGrain');
  const prints = createPrintTextures();

  const materials = {
    // Adzed island timber: greyed, unvarnished.
    timber: texturedMaterial(fine, { color: '#a08a72', normalScale: 1.0, name: 'CaveTimber' }),
    timberRound: texturedMaterial(fineRound, { color: '#8d7862', normalScale: 1.0, name: 'CaveTimberRound' }),
    // The press itself: dark with oil and ink.
    pressWood: texturedMaterial(oak, { color: '#8c725c', roughness: 0.82, normalScale: 0.9, name: 'CavePressWood' }),
    crateWood: texturedMaterial(planks, { color: '#a8927a', normalScale: 0.9, name: 'CaveCrateWood' }),
    bark: plain('#3b3026', 1),
    logEnd: texturedMaterial(endGrain, { name: 'CaveEndGrain', normalScale: 0.5 }),
    iron: plain('#2b2927', 0.55, 0.75),
    rust: plain('#5a3b28', 0.85, 0.35),
    brass: plain('#9a7a3e', 0.36, 0.9),
    tin: plain('#9a9a96', 0.42, 0.85),
    typeMetal: plain('#55565a', 0.42, 0.8),
    glass: new THREE.MeshStandardMaterial({ color: '#d8d2b8', roughness: 0.12, metalness: 0, transparent: true, opacity: 0.32, depthWrite: false }),
    wool: texturedMaterial(wool, { color: '#b6b2ab', normalScale: 0.6, name: 'CaveWool' }),
    redWool: texturedMaterial(wool, { color: '#8a2a20', normalScale: 0.6, name: 'CaveRedWool' }),
    linen: texturedMaterial(linen, { color: '#eee8da', normalScale: 0.5, name: 'CaveLinen' }),
    sacking: texturedMaterial(sacking, { color: '#e1d2b7', normalScale: 0.9, name: 'CaveSacking' }),
    coat: texturedMaterial(wool, { color: '#3e3a36', normalScale: 0.5, name: 'CaveCoat' }),
    straw: plain('#a48c56', 1),
    tick: plain('#8e7a54', 1),
    strawDark: plain('#7c6a40', 1),
    leather: texturedMaterial(leather, { color: '#c4ae94', normalScale: 0.45, name: 'CaveLeather' }),
    hide: plain('#8f7052', 0.92, 0, { side: THREE.DoubleSide }),
    hideDark: plain('#5e4632', 0.95, 0, { side: THREE.DoubleSide }),
    horn: plain('#cfc2a4', 0.6),
    // Scraped horn panes glow with the candle behind them.
    hornPane: new THREE.MeshStandardMaterial({ name: 'CaveLanternHorn', color: '#e0b878', emissive: '#ff9440', emissiveIntensity: 1.4, roughness: 0.6, transparent: true, opacity: 0.82, side: THREE.DoubleSide, depthWrite: false }),
    bone: plain('#ddd2b8', 0.7),
    clay: plain('#8c4f30', 0.88),
    clayDark: plain('#5f3824', 0.9),
    gourd: plain('#9a7a3e', 0.62),
    rope: plain('#8a7454', 1),
    twine: plain('#5a4630', 1),
    ink: plain('#0b0a09', 0.22),
    inkedWood: plain('#1c1714', 0.6),
    tallow: plain('#e6dbc0', 0.55),
    sheetEdge: plain('#d9cdb0', 0.95),
    paper: plain('#e6dcc3', 0.92, 0, { side: THREE.DoubleSide }),
    paperOld: plain('#d3c4a0', 0.94, 0, { side: THREE.DoubleSide }),
    oilcloth: plain('#3a3a2a', 0.5),
    meat: plain('#2e1a10', 0.5),
    herb: plain('#5d6a34', 0.9, 0, { side: THREE.DoubleSide }),
    ember: new THREE.MeshStandardMaterial({ color: '#2a1408', emissive: '#ff4a10', emissiveIntensity: 2.2, roughness: 0.9 }),
    ash: plain('#4a4642', 1),
    charcoal: plain('#141210', 0.95),
    shell: plain('#d8cdb8', 0.55),
    water: plain('#1e2a2c', 0.1),
    // The interior rig drives every material named "LampFlame" with its
    // flicker and day/night emission.
    flame: new THREE.MeshStandardMaterial({ name: 'LampFlame', color: '#ffd48a', emissive: '#ff8a30', emissiveIntensity: 3.6, roughness: 0.3, toneMapped: true }),
    // Printed matter.
    sheetPrinted: new THREE.MeshStandardMaterial({ map: prints.sheets, roughness: 0.9, side: THREE.DoubleSide, name: 'CavePrintedSheet' }),
    broadsideCatalan: new THREE.MeshStandardMaterial({ map: prints.broadsideCatalan, roughness: 0.9, name: 'CaveBroadside' }),
    broadsideSpanish: new THREE.MeshStandardMaterial({ map: prints.broadsideSpanish, roughness: 0.9, name: 'CaveBroadside' }),
    broadsideEnglish: new THREE.MeshStandardMaterial({ map: prints.broadsideEnglish, roughness: 0.9, name: 'CaveBroadside' }),
    typeCase: new THREE.MeshStandardMaterial({ map: prints.typeCase, roughness: 0.55, metalness: 0.35, name: 'CaveTypeCase' }),
    forme: new THREE.MeshStandardMaterial({ map: prints.forme, roughness: 0.38, metalness: 0.65, name: 'CaveForme' }),
    hideMap: new THREE.MeshStandardMaterial({ map: prints.hideMap, roughness: 0.92, side: THREE.DoubleSide, name: 'CaveHideMap' }),
    tally: new THREE.MeshStandardMaterial({ map: prints.tally, transparent: true, roughness: 1, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, name: 'CaveTally' }),
    chalk: new THREE.MeshStandardMaterial({ map: prints.chalk, transparent: true, roughness: 1, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, name: 'CaveChalk' }),
    slate: plain('#2b2a29', 0.48),
    bookCover: texturedMaterial(leather, { color: '#a99076', normalScale: 0.4, name: 'CaveBookCover' }),
    bookPages: plain('#dccfae', 0.9),
  };
  materials.sheetHanging = createSwayingSheetMaterial(prints.sheets);
  materials.herbHanging = createSwayingSheetMaterial(prints.herb, '#ffffff', { alphaTest: 0.5, name: 'CaveHangingHerb' });
  materials.meatHanging = createSwayingSheetMaterial(null, '#3e1c14', { name: 'CaveHangingMeat' });
  materials.__textures = [fine, fineRound, planks, oak, wool, linen, sacking, leather, endGrain].flatMap(set => Object.values(set)).concat(Object.values(prints));
  return materials;
}

// Hung sheets and herbs stir in the cave's draught. Sway grows with the drop
// below `uHangY`, so a sheet pivots on its line and a bunch on its string.
function createSwayingSheetMaterial(map, color = '#ffffff', { alphaTest = 0, name = 'CaveHangingSheet' } = {}) {
  const material = new THREE.MeshStandardMaterial({ map, color, roughness: 0.9, side: THREE.DoubleSide, alphaTest });
  material.name = name;
  const uniforms = { uSwayTime: { value: 0 } };
  material.userData.swayUniforms = uniforms;
  material.customProgramCacheKey = () => 'cave-sway-v1';
  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uSwayTime;\nattribute float aHang;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        {
          vec4 swayWorld = modelMatrix * vec4(transformed, 1.0);
          float phase = swayWorld.x * 1.7 + swayWorld.z * 2.3;
          float gust = 0.6 + 0.4 * sin(uSwayTime * 0.37 + phase * 0.2);
          float swing = sin(uSwayTime * 1.3 + phase) * 0.6 + sin(uSwayTime * 2.9 + phase * 1.7) * 0.25;
          float drop = aHang;
          transformed.x += swing * gust * drop * 0.14;
          transformed.z += cos(uSwayTime * 1.1 + phase) * gust * drop * 0.1;
        }`,
      );
  };
  return material;
}

export function tickCaveMaterials(materials, time) {
  for (const material of [materials.sheetHanging, materials.herbHanging, materials.meatHanging]) {
    if (material?.userData.swayUniforms) material.userData.swayUniforms.uSwayTime.value = time;
  }
}

const disposeCaveMaterials = materials => {
  for (const [key, value] of Object.entries(materials)) if (key !== '__textures') value?.dispose?.();
  for (const texture of materials.__textures || []) texture?.dispose?.();
};

export function useCaveMaterials() {
  const materials = useMemo(() => createCaveMaterials(), []);
  useDeferredDisposal(materials, disposeCaveMaterials);
  return materials;
}

// Box whose UVs are scaled to world metres, with the grain turned to run
// along each face's longer side, so planks and posts read at a consistent
// scale instead of stretching one texture over every face.
const boxCache = new Map();
export function woodBoxGeometry(width, height, depth, metresPerTile = 0.9) {
  const key = `${width.toFixed(3)}:${height.toFixed(3)}:${depth.toFixed(3)}:${metresPerTile}`;
  if (boxCache.has(key)) return boxCache.get(key);
  const geometry = new THREE.BoxGeometry(width, height, depth);
  const uv = geometry.attributes.uv;
  // Face order: +x, -x, +y, -y, +z, -z; four vertices each.
  const faceSizes = [
    [depth, height], [depth, height],
    [width, depth], [width, depth],
    [width, height], [width, height],
  ];
  for (let face = 0; face < 6; face += 1) {
    const [su, sv] = faceSizes[face];
    const swap = sv > su;
    for (let v = 0; v < 4; v += 1) {
      const index = face * 4 + v;
      const u0 = uv.getX(index);
      const v0 = uv.getY(index);
      const u = (swap ? v0 * sv : u0 * su) / metresPerTile;
      const w = (swap ? u0 * su : v0 * sv) / metresPerTile;
      uv.setXY(index, u + face * 0.37, w + face * 0.21);
    }
  }
  uv.needsUpdate = true;
  boxCache.set(key, geometry);
  return geometry;
}
