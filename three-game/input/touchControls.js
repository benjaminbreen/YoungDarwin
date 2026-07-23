const touchState = {
  forward: false,
  backward: false,
  left: false,
  right: false,
  // Analog stick vector from the on-screen joystick, each axis in [-1, 1]
  // (x: right positive, y: backward positive — matches the input-space z
  // axis). Zero means "no analog source"; the direction booleans above stay
  // authoritative for anything without a stick (tests, future d-pads).
  moveX: 0,
  moveY: 0,
  run: false,
  jump: false,
  dodge: false,
  interact: false,
  crouch: false,
  rifle: false,
  net: false,
  snare: false,
  hammer: false,
  knife: false,
  gather: false,
  fireRifle: false,
  write: false,
  inspect: false,
  fieldAction: false,
  animalEat: false,
  animalSleep: false,
  animalDefecate: false,
  animalSignalCurious: false,
  animalSignalWithdraw: false,
  animalSignalGraze: false,
  animalSignalRest: false,
};

// Which one-shot action control each equipped tool fires when "used".
const TOOL_USE_CONTROLS = {
  hammer: 'hammer',
  insect_net: 'net',
  shotgun: 'fireRifle',
  snare: 'snare',
  pocket_knife: 'knife',
  sketch: 'write',
  eat: 'animalEat',
  sleep: 'animalSleep',
  defecate: 'animalDefecate',
  signalCurious: 'animalSignalCurious',
  signalWithdraw: 'animalSignalWithdraw',
  signalGraze: 'animalSignalGraze',
  signalRest: 'animalSignalRest',
};

export const TOGGLE_COMPASS_EVENT = 'young-darwin:toggle-compass';

export function triggerToolUse(toolId) {
  if (toolId === 'compass') {
    if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(TOGGLE_COMPASS_EVENT));
    return;
  }
  setTouchControl(TOOL_USE_CONTROLS[toolId] || 'gather', true);
}

export function setTouchControl(control, active) {
  if (Object.prototype.hasOwnProperty.call(touchState, control)) {
    touchState[control] = active;
  }
}

export function consumeTouchControls() {
  const snapshot = { ...touchState };
  touchState.dodge = false;
  touchState.interact = false;
  touchState.crouch = false;
  touchState.rifle = false;
  touchState.net = false;
  touchState.snare = false;
  touchState.hammer = false;
  touchState.knife = false;
  touchState.gather = false;
  touchState.fireRifle = false;
  touchState.write = false;
  touchState.inspect = false;
  touchState.fieldAction = false;
  touchState.animalEat = false;
  touchState.animalSleep = false;
  touchState.animalDefecate = false;
  touchState.animalSignalCurious = false;
  touchState.animalSignalWithdraw = false;
  touchState.animalSignalGraze = false;
  touchState.animalSignalRest = false;
  return snapshot;
}
