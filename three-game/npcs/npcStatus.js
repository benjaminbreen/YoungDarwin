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

export const NPC_STATUS_STYLES = Object.freeze({
  [NPC_STATUS.FRIENDLY]: { core: '#e8fff0', glow: '#74d8a2', ring: '#9fe3bd', light: 0.85 },
  [NPC_STATUS.NEUTRAL]: { core: '#fff6dd', glow: '#e1c47a', ring: '#d9e6ba', light: 0.7 },
  [NPC_STATUS.ALERT]: { core: '#ffeedd', glow: '#e8965a', ring: '#efb489', light: 1.05 },
  [NPC_STATUS.HOSTILE]: { core: '#ffe4e0', glow: '#d95f52', ring: '#e08e83', light: 1.2 },
});

export function npcStatusStyle(status) {
  return NPC_STATUS_STYLES[status] || NPC_STATUS_STYLES[NPC_STATUS.NEUTRAL];
}
