import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { loadRepeatingTerrainTexture } from '../../world/regions/materials/pbrTerrainTextures';
import { loadPeriodSurface } from '../../world/regions/materials/periodMaterials';
import { createHutTextures } from './hutTextures';

// Materials for the whalers' shore hut and the colonist's rancho. The same
// set dresses each building outdoors and its interior, so the walls seen from
// the beach are the walls seen from inside. Keys shared with the cave
// materials (tallow, tin, flame, iron, rope …) let the cave's small props —
// candles, casks, lanterns, rope — be reused here unchanged.

const LAWSON = '/assets/textures/interiors/lawson-house';
const PBR = '/assets/textures/world/floreana-pbr';
const RANCHO = '/assets/textures/interiors/rancho';

function loadSet(color, normal, rough, rotation = 0) {
  const map = loadRepeatingTerrainTexture(color, { fallback: '#7a5a3c', colorSpace: THREE.SRGBColorSpace });
  const normalMap = loadRepeatingTerrainTexture(normal, { fallback: [128, 128, 255, 255] });
  const roughnessMap = rough ? loadRepeatingTerrainTexture(rough, { fallback: [220, 220, 220, 255] }) : null;
  for (const texture of [map, normalMap, roughnessMap]) {
    if (!texture) continue;
    texture.center.set(0.5, 0.5);
    texture.rotation = rotation;
  }
  return roughnessMap ? { map, normalMap, roughnessMap } : { map, normalMap };
}

function textured(set, { color = '#ffffff', roughness = 1, normalScale = 0.8, name, ...extra } = {}) {
  const material = new THREE.MeshStandardMaterial({
    ...set,
    color,
    roughness,
    metalness: 0,
    normalScale: new THREE.Vector2(normalScale, normalScale),
    ...extra,
  });
  if (name) material.name = name;
  if (set.periodSurface) material.userData.periodSurface = set.periodSurface;
  return material;
}

function plain(color, roughness = 0.85, metalness = 0, extra = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness, ...extra });
}

function canvasMaterial(map, extra = {}) {
  return new THREE.MeshStandardMaterial({ map, roughness: 0.95, metalness: 0, ...extra });
}

export function createHutMaterials() {
  const deck = loadPeriodSurface('weatheredWood');
  const fine = loadSet(`${LAWSON}/fine-wood-diff-2k.jpg`, `${LAWSON}/fine-wood-normal-2k.jpg`, `${LAWSON}/fine-wood-rough-2k.jpg`);
  const fineRound = loadSet(`${LAWSON}/fine-wood-diff-2k.jpg`, `${LAWSON}/fine-wood-normal-2k.jpg`, `${LAWSON}/fine-wood-rough-2k.jpg`, Math.PI / 2);
  const planks = loadPeriodSurface('weatheredWood', { offset: [0.37, 0.21] });
  const wool = loadPeriodSurface('wool');
  const linen = loadPeriodSurface('linen');
  const sacking = loadPeriodSurface('sacking');
  const sailcloth = loadPeriodSurface('patchedCanvas');
  const leather = loadPeriodSurface('leather');
  const endGrain = loadPeriodSurface('endGrain');
  const basalt = loadSet(
    `${PBR}/weathered_highland_basalt_albedo_1024.webp`,
    `${PBR}/weathered_highland_basalt_normal_opengl_1024.webp`,
    `${PBR}/weathered_highland_basalt_roughness_1024.webp`,
  );
  const sand = loadSet(`${PBR}/white-sand-beach_albedo.webp`, `${PBR}/galapagos-sand_normal.webp`, `${PBR}/galapagos-sand_roughness.webp`);
  const loam = loadSet(`${PBR}/loam_albedo.webp`, `${PBR}/loam_normal.webp`, `${PBR}/loam_roughness.webp`);
  // Generated material sources and registered height edits are archived under
  // assets-src/rancho-materials; npm run asset:rancho bakes their periodic PBR maps.
  const thatch = loadSet(`${RANCHO}/thatch-albedo.webp`, `${RANCHO}/thatch-normal.webp`, `${RANCHO}/thatch-roughness.webp`);
  const daub = loadSet(`${RANCHO}/daub-albedo.webp`, `${RANCHO}/daub-normal.webp`, `${RANCHO}/daub-roughness.webp`);
  const t = createHutTextures();

  const materials = {
    // Ship's planking gone grey on the beach: the walls and roof of the
    // whalers' hut, and the wrecked boat timber everywhere around it.
    driftwood: textured(deck, { color: '#e2d8c8', normalScale: 0.9, name: 'HutDriftwood' }),
    shipPlank: textured(deck, { color: '#bba68e', normalScale: 0.9, name: 'HutShipPlank' }),
    tarredPlank: textured(deck, { color: '#5a4e42', roughness: 0.7, normalScale: 0.7, name: 'HutTarredPlank' }),
    timber: textured(fine, { color: '#c2ab90', normalScale: 1.0, name: 'HutTimber' }),
    timberRound: textured(fineRound, { color: '#cdb89c', normalScale: 1.0, name: 'HutTimberRound' }),
    pole: textured(fineRound, { color: '#b8a184', normalScale: 1.0, name: 'HutPole' }),
    crateWood: textured(planks, { color: '#a8927a', normalScale: 0.9, name: 'HutCrateWood' }),
    stone: textured(basalt, { color: '#d6d0c6', vertexColors: true, normalScale: 1.1, name: 'HutStone' }),
    // The same basalt without vertex tint, for loose stones placed outside a batch.
    rubble: textured(basalt, { color: '#b8b2a8', normalScale: 1.1, name: 'HutRubble' }),
    sootStone: textured(basalt, { color: '#5a524c', normalScale: 1.1, name: 'HutSootStone' }),
    sand: textured(sand, { color: '#b9ab8c', normalScale: 0.6, name: 'HutSand' }),
    loam: textured(loam, { color: '#a89276', normalScale: 0.9, name: 'HutLoam' }),
    // Swept, trodden house floor: the same earth, packed pale and dusty.
    earthFloor: textured(loam, { color: '#e8d2b0', normalScale: 0.5, name: 'HutEarthFloor' }),
    // Vernacular surfaces drawn in hutTextures.js.
    thatch: textured(thatch, { roughness: 1, normalScale: 0.85, side: THREE.DoubleSide, name: 'HutThatch' }),
    thatchUnder: textured(thatch, { color: '#8d8374', roughness: 1, normalScale: 0.65, side: THREE.DoubleSide, name: 'HutThatchUnder' }),
    daub: textured(daub, { roughness: 1, normalScale: 0.85, name: 'HutDaub' }),
    cane: canvasMaterial(t.cane, { roughness: 0.75, side: THREE.DoubleSide, name: 'HutCane' }),
    sailcloth: textured(sailcloth, { normalScale: 0.6, side: THREE.DoubleSide, name: 'HutSailcloth' }),
    endGrain: textured(endGrain, { normalScale: 0.5, name: 'HutEndGrain' }),
    petate: canvasMaterial(t.petate, { side: THREE.DoubleSide, name: 'HutPetate' }),
    carapace: canvasMaterial(t.carapace, { roughness: 0.55, name: 'HutCarapace' }),
    carvedPlank: canvasMaterial(t.carvedPlank, { transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, name: 'HutCarving' }),
    estampa: canvasMaterial(t.estampa, { roughness: 0.9, name: 'HutEstampa' }),
    // Metal, cloth, and the household's small things.
    iron: plain('#2b2927', 0.55, 0.75),
    rust: plain('#6a3e24', 0.9, 0.3),
    rustDark: plain('#3a2618', 0.85, 0.4),
    tin: plain('#9a9a96', 0.42, 0.85),
    brass: plain('#9a7a3e', 0.36, 0.9),
    glass: new THREE.MeshStandardMaterial({ color: '#d8d2b8', roughness: 0.12, transparent: true, opacity: 0.32, depthWrite: false }),
    bottleGlass: new THREE.MeshStandardMaterial({ color: '#2f4a2a', roughness: 0.15, transparent: true, opacity: 0.78 }),
    wool: textured(wool, { color: '#b6b2ab', normalScale: 0.6, name: 'HutWool' }),
    redWool: textured(wool, { color: '#8a2a20', normalScale: 0.6, name: 'HutRedWool' }),
    ponchoWool: textured(wool, { color: '#5a3424', normalScale: 0.6, name: 'HutPoncho' }),
    linen: textured(linen, { color: '#eee8da', normalScale: 0.5, name: 'HutLinen' }),
    sacking: textured(sacking, { color: '#e1d2b7', normalScale: 0.9, name: 'HutSacking' }),
    coat: textured(wool, { color: '#3e3a36', normalScale: 0.5, name: 'HutCoat' }),
    straw: plain('#a48c56', 1),
    tick: plain('#8e7a54', 1),
    leather: textured(leather, { color: '#c4ae94', normalScale: 0.45, name: 'HutLeather' }),
    hide: plain('#8f7052', 0.92, 0, { side: THREE.DoubleSide }),
    bone: plain('#ddd2b8', 0.7),
    ivory: plain('#e8dcc0', 0.35),
    horn: plain('#cfc2a4', 0.6),
    clay: plain('#8c4f30', 0.88),
    clayDark: plain('#5f3824', 0.9),
    gourd: plain('#a78442', 0.55),
    rope: plain('#8a7454', 1),
    manila: plain('#a08a5e', 1),
    twine: plain('#5a4630', 1),
    tallow: plain('#e6dbc0', 0.55),
    paper: plain('#e6dcc3', 0.92, 0, { side: THREE.DoubleSide }),
    soot: plain('#191512', 1),
    ash: plain('#5a5550', 1),
    charcoal: plain('#141210', 0.95),
    ember: new THREE.MeshStandardMaterial({ color: '#2a1408', emissive: '#ff4a10', emissiveIntensity: 1.6, roughness: 0.9 }),
    // The interior rig drives every material named "LampFlame".
    flame: new THREE.MeshStandardMaterial({ name: 'LampFlame', color: '#ffd48a', emissive: '#ff8a30', emissiveIntensity: 3.6, roughness: 0.3 }),
    // Garden and larder.
    leaf: plain('#4d6a2c', 0.8, 0, { side: THREE.DoubleSide }),
    leafDry: plain('#8a7a44', 0.9, 0, { side: THREE.DoubleSide }),
    bananaLeaf: plain('#5c7e32', 0.7, 0, { side: THREE.DoubleSide }),
    bananaStem: plain('#5e6e36', 0.8),
    plantain: plain('#6f8a2e', 0.6),
    plantainRipe: plain('#c9a83a', 0.6),
    tomatoFruit: plain('#d8702a', 0.45),
    maizeHusk: plain('#c8b67a', 0.9, 0, { side: THREE.DoubleSide }),
    maizeKernel: plain('#d8a838', 0.6),
    sweetPotato: plain('#8a4a3a', 0.8),
    meat: plain('#4a2418', 0.6),
    // Tortoise and whale.
    plastron: plain('#b8a476', 0.7),
    tooth: plain('#e9dfc8', 0.3),
  };
  materials.__textures = [deck, fine, fineRound, planks, wool, linen, sacking, sailcloth, leather, endGrain, basalt, sand, loam, thatch, daub]
    .flatMap(set => Object.values(set))
    .concat(Object.values(t));
  return materials;
}

export function useHutMaterials() {
  const materials = useMemo(() => createHutMaterials(), []);
  const disposalTimers = useRef(new Map());
  useEffect(() => {
    // React's development effect replay cleans up then reuses the SAME memo.
    // Disposing immediately removes the textures from the async loader's live
    // set: late images then never bump their versions and stay flat fallback
    // brown on the GPU. Cancel a pending release when that resource remounts.
    const timers = disposalTimers.current;
    clearTimeout(timers.get(materials));
    timers.delete(materials);
    return () => {
      timers.set(materials, setTimeout(() => {
        timers.delete(materials);
        for (const [key, value] of Object.entries(materials)) {
          if (key !== '__textures') value?.dispose?.();
        }
        for (const texture of materials.__textures || []) texture?.dispose?.();
      }, 0));
    };
  }, [materials]);
  return materials;
}
