const touchState = {
  forward: false,
  backward: false,
  left: false,
  right: false,
  run: false,
  jump: false,
  interact: false,
  crouch: false,
  rifle: false,
  net: false,
  hammer: false,
  gather: false,
};

export function setTouchControl(control, active) {
  if (Object.prototype.hasOwnProperty.call(touchState, control)) {
    touchState[control] = active;
  }
}

export function consumeTouchControls() {
  const snapshot = { ...touchState };
  touchState.jump = false;
  touchState.interact = false;
  touchState.crouch = false;
  touchState.rifle = false;
  touchState.net = false;
  touchState.hammer = false;
  touchState.gather = false;
  return snapshot;
}
