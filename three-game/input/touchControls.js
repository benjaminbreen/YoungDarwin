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
  hammer: false,
  gather: false,
  fireRifle: false,
  write: false,
  inspect: false,
};

// Which one-shot action control each equipped tool fires when "used".
const TOOL_USE_CONTROLS = {
  hammer: 'hammer',
  insect_net: 'net',
  shotgun: 'fireRifle',
  snare: 'net',
  sketch: 'write',
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
  touchState.hammer = false;
  touchState.gather = false;
  touchState.fireRifle = false;
  touchState.write = false;
  touchState.inspect = false;
  return snapshot;
}
