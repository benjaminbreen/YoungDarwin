const touchState = {
  forward: false,
  backward: false,
  left: false,
  right: false,
  run: false,
  jump: false,
  dodge: false,
  interact: false,
  crouch: false,
  rifle: false,
  net: false,
  snare: false,
  hammer: false,
  gather: false,
  fireRifle: false,
  write: false,
  inspect: false,
  animalEat: false,
  animalSleep: false,
  animalDefecate: false,
};

// Which one-shot action control each equipped tool fires when "used".
const TOOL_USE_CONTROLS = {
  hammer: 'hammer',
  insect_net: 'net',
  shotgun: 'fireRifle',
  snare: 'snare',
  sketch: 'write',
  eat: 'animalEat',
  sleep: 'animalSleep',
  defecate: 'animalDefecate',
};

export function triggerToolUse(toolId) {
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
  touchState.gather = false;
  touchState.fireRifle = false;
  touchState.write = false;
  touchState.inspect = false;
  touchState.animalEat = false;
  touchState.animalSleep = false;
  touchState.animalDefecate = false;
  return snapshot;
}
