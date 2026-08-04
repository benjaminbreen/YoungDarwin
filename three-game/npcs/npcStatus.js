// Shared vocabulary for the status orb above an NPC's head.
//
// The colour is the at-a-glance read (green = with you, yellow = minding his
// own business, orange = rattled, red = wants you gone); the activity line is
// what the orb expands into when the player clicks it.

export const NPC_STATUS = Object.freeze({
  FRIENDLY: 'friendly',
  NEUTRAL: 'neutral',
  ALERT: 'alert',
  // Nothing sets this yet — no NPC in the game can turn on the player. It is
  // named here so the palette is complete when one can.
  HOSTILE: 'hostile',
});

// `core` is the crystal's own body colour, so it has to stay tinted — a
// near-white body reads as a white blob against a pale sea or sky.
export const NPC_STATUS_STYLES = Object.freeze({
  [NPC_STATUS.FRIENDLY]: { core: '#a9e9c6', glow: '#4fc98c', ring: '#9fe3bd', light: 0.85 },
  [NPC_STATUS.NEUTRAL]: { core: '#f0dda6', glow: '#d9b45f', ring: '#d9e6ba', light: 0.7 },
  [NPC_STATUS.ALERT]: { core: '#f4bb92', glow: '#e2833f', ring: '#efb489', light: 1.05 },
  [NPC_STATUS.HOSTILE]: { core: '#eda093', glow: '#d24a3c', ring: '#e08e83', light: 1.2 },
});

export function npcStatusStyle(status) {
  return NPC_STATUS_STYLES[status] || NPC_STATUS_STYLES[NPC_STATUS.NEUTRAL];
}
