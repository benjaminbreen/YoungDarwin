import * as THREE from 'three';
import { installDarwinFaceDetail } from './darwinFaceDetail';

// The approved B treatment is the normal Darwin appearance. Explicit
// ?darwinLook=codex (or =opus) also enables the review controls. A restores the
// captured material values exactly. Switching never reloads the scene or
// changes the camera.
const DEFAULT_DARWIN_LOOK = 'codex';
const registrations = new Set();
let selectedLook = null;
let panel = null;
let keyboardHandler = null;
const buttons = new Map();
let faceAtlas = null;
let faceAtlasReady = false;

function loadFaceAtlas() {
  if (faceAtlas) return;
  faceAtlas = new THREE.TextureLoader().load('/assets/models/darwin5-albedo-codex.webp?v=1', () => {
    faceAtlasReady = true;
    if (selectedLook) selectLook(selectedLook, false);
  }, undefined, () => console.warn('[darwinLookComparison] face atlas unavailable; retained original texture'));
  faceAtlas.flipY = false;
  faceAtlas.colorSpace = THREE.SRGBColorSpace;
}

const MATERIAL_FIELDS = ['roughness', 'specularIntensity', 'clearcoat', 'clearcoatRoughness'];

function cloneValue(value) {
  if (Array.isArray(value)) return value.map(cloneValue);
  return value?.clone ? value.clone() : value;
}

function writeUniform(uniforms, name, value) {
  const uniform = uniforms?.[name];
  if (!uniform) return;
  if (uniform.value?.copy) uniform.value.copy(value);
  else uniform.value = cloneValue(value);
}

function capture(material) {
  const uniforms = material.userData.playerSkinShading || material.userData.playerHairShading;
  return {
    material,
    originalMap: material.map,
    uniforms,
    originalUniforms: Object.fromEntries(Object.entries(uniforms || {}).map(([name, uniform]) => [name, cloneValue(uniform.value)])),
    originalFields: Object.fromEntries(MATERIAL_FIELDS.filter(name => name in material).map(name => [name, material[name]])),
  };
}

function restore(entry) {
  entry.material.map = entry.originalMap;
  if (entry.faceDetail) entry.faceDetail.enabled.value = 0;
  Object.assign(entry.material, entry.originalFields);
  for (const [name, value] of Object.entries(entry.originalUniforms)) writeUniform(entry.uniforms, name, value);
}

function applyCodex(entry) {
  const { material, uniforms } = entry;
  if (faceAtlasReady && entry.originalMap) material.map = faceAtlas;
  if (entry.faceDetail) entry.faceDetail.enabled.value = 1;
  if (!uniforms) return;
  if (material.userData.playerSkinShading) {
    // Preserve directional modelling around the nose, lips and jaw. Small red
    // wrap still warms the terminator, without a broad pink fill on the face.
    writeUniform(uniforms, 'uSkinSaturation', 0.84);
    writeUniform(uniforms, 'uSkinTint', new THREE.Color('#fffaf7'));
    writeUniform(uniforms, 'uSkinWrap', new THREE.Vector3(0.12, 0.055, 0.035));
    writeUniform(uniforms, 'uSkinScatterColor', new THREE.Color('#ff9c80'));
    writeUniform(uniforms, 'uSkinPoreStrength', 0);
    writeUniform(uniforms, 'uSkinBrowColor', new THREE.Color('#513a2b'));
    // Widen the *colour* region to the outer lips, retaining the authored mouth
    // line and geometry. The tint is less dark and less saturated than A.
    writeUniform(uniforms, 'uSkinTintCentre', [
      new THREE.Vector3(-0.028, 1.764, 0.098),
      new THREE.Vector3(0.049, 1.764, 0.098),
      new THREE.Vector3(0.0105, 1.763, 0.134),
      new THREE.Vector3(0.0105, 1.731, 0.108),
    ]);
    writeUniform(uniforms, 'uSkinTintRadius', [
      new THREE.Vector3(0.027, 0.024, 0.04),
      new THREE.Vector3(0.027, 0.024, 0.04),
      new THREE.Vector3(0.013, 0.014, 0.02),
      new THREE.Vector3(0.029, 0.0095, 0.022),
    ]);
    writeUniform(uniforms, 'uSkinTintColor', ['#f3b9a4', '#f3b9a4', '#efb39d', '#c78f85'].map(color => new THREE.Color(color)));
    writeUniform(uniforms, 'uSkinTintAmount', [0.09, 0.09, 0.08, 0.28]);
    material.roughness = 0.64;
    material.specularIntensity = 0.3;
    material.clearcoat = 0.01;
  } else {
    // Keep the existing clump geometry and atlas. Restrain the extra highlight
    // pair so the ordinary dielectric reflection doesn't stack into bronze.
    writeUniform(uniforms, 'uHairSaturation', 0.72);
    writeUniform(uniforms, 'uHairTint', new THREE.Color('#eee6df'));
    writeUniform(uniforms, 'uHairContrast', 1.12);
    writeUniform(uniforms, 'uHairPrimaryColor', new THREE.Color('#eee5da'));
    writeUniform(uniforms, 'uHairPrimary', new THREE.Vector3(-0.06, 160, 0.08));
    writeUniform(uniforms, 'uHairSecondary', new THREE.Vector3(0.12, 38, 0.16));
    writeUniform(uniforms, 'uHairStrandBreakup', 0.4);
    writeUniform(uniforms, 'uHairFillColor', new THREE.Color('#604632'));
    material.roughness = 0.76;
    material.specularIntensity = 0.24;
  }
}

function selectLook(look, updateUrl = true) {
  if (look !== 'opus' && look !== 'codex') return;
  selectedLook = look;
  for (const entries of registrations) for (const entry of entries) {
    restore(entry);
    if (look === 'codex') applyCodex(entry);
  }
  for (const [id, button] of buttons) {
    button.setAttribute('aria-pressed', String(id === look));
    button.style.background = id === look ? '#d6b779' : '#292e32';
    button.style.color = id === look ? '#171a1d' : '#f2f0e9';
  }
  if (updateUrl) {
    const url = new URL(window.location.href);
    url.searchParams.set('darwinLook', look);
    window.history.replaceState(window.history.state, '', url);
  }
}

function mountPanel(runtime) {
  if (panel) return;
  panel = document.createElement('aside');
  panel.dataset.darwinLookComparison = '';
  panel.setAttribute('aria-label', 'Darwin appearance comparison');
  panel.style.cssText = 'position:fixed;right:16px;top:88px;z-index:10000;padding:12px;background:rgba(17,22,27,.94);border:1px solid #777268;border-radius:10px;color:#f2f0e9;font:13px/1.4 system-ui;box-shadow:0 4px 18px #0005;max-width:240px';
  const title = document.createElement('div');
  title.textContent = 'Darwin skin + hair';
  title.style.cssText = 'font-weight:600;margin-bottom:8px';
  panel.append(title);
  for (const [id, label] of [['opus', 'A · Opus'], ['codex', 'B · Codex']]) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.style.cssText = 'border:1px solid #777268;border-radius:5px;padding:7px 10px;margin-right:6px;cursor:pointer;font:inherit';
    button.addEventListener('click', () => selectLook(id));
    buttons.set(id, button);
    panel.append(button);
  }
  const hint = document.createElement('div');
  hint.textContent = 'Shift+B switches · same camera and light';
  hint.style.cssText = 'margin-top:8px;font-size:11px;color:#c6c7c4';
  panel.append(hint);
  // Prevent pointer events from dragging the game camera beneath the panel.
  for (const name of ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'click', 'wheel']) panel.addEventListener(name, event => event.stopPropagation());
  document.body.append(panel);
  keyboardHandler = event => {
    if (event.code !== 'KeyB' || !event.shiftKey || event.ctrlKey || event.metaKey || event.altKey || event.repeat) return;
    const target = event.target;
    if (target instanceof HTMLElement && (target.isContentEditable || target.closest('input, textarea, select'))) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    selectLook(selectedLook === 'codex' ? 'opus' : 'codex');
  };
  window.addEventListener('keydown', keyboardHandler, true);
  window.__darwinLookComparison = {
    set: selectLook, get: () => selectedLook,
    runtime: { scene: runtime.scene, camera: runtime.camera, gl: runtime.gl, THREE },
  };
}

export function installDarwinLookComparison(scene, runtime) {
  if (typeof window === 'undefined') return undefined;
  const requested = new URLSearchParams(window.location.search).get('darwinLook');
  const comparisonEnabled = requested === 'codex' || requested === 'opus';
  const materials = new Set();
  let hasDarwinSkin = false;
  scene.traverse(object => {
    if (!object.isMesh) return;
    for (const material of [].concat(object.material || [])) {
      if (material.name === 'Darwin5 skin' && material.userData.playerSkinShading) hasDarwinSkin = true;
      if (material.userData.playerSkinShading || material.userData.playerHairShading || material.name === 'Materialmat') materials.add(material);
    }
  });
  if (!hasDarwinSkin) return undefined;
  loadFaceAtlas();
  const entries = [...materials].map(material => {
    const entry = capture(material);
    if (['Darwin5 skin', 'Darwin5 hair', 'Materialmat'].includes(material.name)) entry.faceDetail = installDarwinFaceDetail(material);
    return entry;
  });
  registrations.add(entries);
  if (comparisonEnabled) mountPanel(runtime);
  selectLook(selectedLook || (comparisonEnabled ? requested : DEFAULT_DARWIN_LOOK), false);
  return () => {
    entries.forEach(restore);
    registrations.delete(entries);
    if (registrations.size) return;
    panel?.remove();
    panel = null;
    buttons.clear();
    window.removeEventListener('keydown', keyboardHandler, true);
    keyboardHandler = null;
    delete window.__darwinLookComparison;
    selectedLook = null;
  };
}
