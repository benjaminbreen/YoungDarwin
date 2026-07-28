// Shared flag set by HUD text inputs while focused. The player controller
// reads it each frame and ignores all gameplay keys so typing "wasd" into the
// narrator box doesn't walk Darwin off a cliff.
let typing = false;
let blockingUi = false;
// Set only by the Escape pause menu. Kept separate from `blockingUi` because the
// journal, chart, and specimen case deliberately let expedition time keep
// running, while a menu labelled "paused" must actually stop the clock.
let expeditionPaused = false;

export function setTypingMode(value) {
  typing = Boolean(value);
}

export function isTypingMode() {
  return typing;
}

export function setBlockingUiMode(value) {
  blockingUi = Boolean(value);
}

export function setExpeditionPaused(value) {
  expeditionPaused = Boolean(value);
}

export function isExpeditionPaused() {
  return expeditionPaused;
}

export function isGameplayInputBlocked() {
  return typing || blockingUi;
}
