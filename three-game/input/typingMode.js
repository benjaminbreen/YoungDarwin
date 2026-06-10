// Shared flag set by HUD text inputs while focused. The player controller
// reads it each frame and ignores all gameplay keys so typing "wasd" into the
// narrator box doesn't walk Darwin off a cliff.
let typing = false;
let blockingUi = false;

export function setTypingMode(value) {
  typing = Boolean(value);
}

export function isTypingMode() {
  return typing;
}

export function setBlockingUiMode(value) {
  blockingUi = Boolean(value);
}

export function isGameplayInputBlocked() {
  return typing || blockingUi;
}
