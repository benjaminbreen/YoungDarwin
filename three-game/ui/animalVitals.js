// Shared derivation for the animal-mode vitals. These used to live privately
// inside StatusView, so the always-visible HUD bar could not reach them and
// rendered a hardcoded literal 68 instead — a number that never moved and did
// not correspond to anything the simulation knew. One source of truth now
// feeds both the compact HUD bar and the expanded status panel.

export function clampPercent(value) {
  return Math.max(0, Math.min(100, Number(value) || 0));
}

// How present Darwin currently is from the animal's point of view. The encounter
// record carries the moment he last pressed close; risk decays with time since.
export function animalRisk(encounter, modeId) {
  if (!encounter || encounter.modeId !== modeId || !encounter.at) {
    return { label: 'Unseen for now', value: 28, detail: 'Darwin has not pressed close recently.' };
  }
  const seconds = Math.max(0, (Date.now() - encounter.at) / 1000);
  if (seconds < 10) return { label: 'Very close', value: 92, detail: 'Darwin is close enough to change the next move.' };
  if (seconds < 35) return { label: 'Nearby', value: 68, detail: 'His attention has only just passed.' };
  return { label: 'Fading', value: 42, detail: 'His last approach is becoming background danger.' };
}

// The tortoise reads the same pressure as lost composure (it withdraws); the
// finch reads it as rising alertness (it watches and flushes). Same signal,
// opposite polarity — which is why the bar is labelled differently per mode.
export function animalAwarenessValue(modeId, risk) {
  const riskValue = risk?.value || 0;
  return modeId === 'tortoise'
    ? clampPercent(100 - riskValue * 0.55)
    : clampPercent(42 + riskValue * 0.58);
}
