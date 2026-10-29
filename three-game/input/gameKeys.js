// The game's own keyboard state. One table names every control, and one set of
// window listeners tracks which keys are down.
//
// This replaces drei's KeyboardControls, which only listens to keydown/keyup.
// Keys released while the window is out of focus (alt-tab, a tab switch) or
// while Cmd is held (macOS sends no keyup then) stayed "down" forever, so Darwin
// kept walking on his own. Here every key is cleared on blur, on the page being
// hidden, and on any Cmd/Ctrl press; shortcuts with those modifiers never reach
// gameplay at all.
//
// Keep in sync with controlsReference.js, which is the player-facing list.

import { isGameplayInputBlocked } from './typingMode';

export const KEYBOARD_MAP = [
  { name: 'forward', keys: ['KeyW', 'ArrowUp'] },
  { name: 'backward', keys: ['KeyS', 'ArrowDown'] },
  { name: 'left', keys: ['KeyA', 'ArrowLeft'] },
  { name: 'right', keys: ['KeyD', 'ArrowRight'] },
  { name: 'run', keys: ['ShiftLeft', 'ShiftRight'] },
  { name: 'jump', keys: ['Space'] },
  // One action key. E and Enter do the same thing: whatever the on-screen
  // prompt says — examine, collect, speak, pick up, read, open.
  { name: 'interact', keys: ['KeyE', 'Enter', 'NumpadEnter'] },
  { name: 'useTool', keys: ['KeyF'] },
  { name: 'crouch', keys: ['KeyC'] },
  { name: 'climb', keys: ['KeyQ'] },
  { name: 'rest', keys: ['KeyR'] },
  // Held: opens the gesture wheel (sit, point, look around, pray...).
  { name: 'gestures', keys: ['KeyG'] },
  { name: 'camera', keys: ['KeyV'] },
  { name: 'recenterCamera', keys: ['Tab'] },
  { name: 'rotateLeft', keys: ['KeyZ'] },
  { name: 'rotateRight', keys: ['KeyX'] },
  { name: 'tool1', keys: ['Digit1'] },
  { name: 'tool2', keys: ['Digit2'] },
  { name: 'tool3', keys: ['Digit3'] },
  { name: 'tool4', keys: ['Digit4'] },
  { name: 'tool5', keys: ['Digit5'] },
  { name: 'tool6', keys: ['Digit6'] },
];

const CONTROL_FOR_CODE = new Map();
KEYBOARD_MAP.forEach(({ name, keys }) => keys.forEach(code => CONTROL_FOR_CODE.set(code, name)));

const pressedCodes = new Set();
const snapshot = Object.fromEntries(KEYBOARD_MAP.map(({ name }) => [name, false]));
const subscribers = new Set();
let listening = 0;

function rebuildSnapshot() {
  KEYBOARD_MAP.forEach(({ name }) => { snapshot[name] = false; });
  pressedCodes.forEach(code => {
    const name = CONTROL_FOR_CODE.get(code);
    if (name) snapshot[name] = true;
  });
  subscribers.forEach(listener => listener(snapshot));
}

export function isTextEntryTarget(target) {
  if (!target || typeof target !== 'object') return false;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable === true;
}

export function releaseAllGameKeys() {
  if (pressedCodes.size === 0) return;
  pressedCodes.clear();
  rebuildSnapshot();
}

function onKeyDown(event) {
  if (event.metaKey || event.ctrlKey) {
    // A Cmd/Ctrl shortcut is the browser's or the HUD's, never movement. Drop
    // anything held, because macOS will not send the matching keyups.
    releaseAllGameKeys();
    return;
  }
  if (isTextEntryTarget(event.target)) return;
  const name = CONTROL_FOR_CODE.get(event.code);
  if (!name || pressedCodes.has(event.code)) return;
  pressedCodes.add(event.code);
  rebuildSnapshot();
}

function onKeyUp(event) {
  if (!pressedCodes.delete(event.code)) return;
  rebuildSnapshot();
}

function onVisibilityChange() {
  if (document.visibilityState !== 'visible') releaseAllGameKeys();
}

export function startGameKeys() {
  if (typeof window === 'undefined') return () => {};
  listening += 1;
  if (listening === 1) {
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', releaseAllGameKeys);
    document.addEventListener('visibilitychange', onVisibilityChange);
  }
  return () => {
    listening -= 1;
    if (listening > 0) return;
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
    window.removeEventListener('blur', releaseAllGameKeys);
    document.removeEventListener('visibilitychange', onVisibilityChange);
    releaseAllGameKeys();
  };
}

const NO_KEYS = Object.freeze(Object.fromEntries(KEYBOARD_MAP.map(({ name }) => [name, false])));

// What gameplay sees this frame. While a modal or text field owns the
// keyboard, every control reads as released.
export function getGameKeys() {
  return isGameplayInputBlocked() ? NO_KEYS : snapshot;
}

export function isGameKeyDown(name) {
  return Boolean(getGameKeys()[name]);
}

export function subscribeGameKeys(listener) {
  subscribers.add(listener);
  return () => subscribers.delete(listener);
}
