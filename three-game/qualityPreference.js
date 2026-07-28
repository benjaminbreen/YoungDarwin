// Player-facing graphics quality preference.
//
// The developer `PerformancePanel` is gated behind NODE_ENV !== 'production', so
// a deployed build previously offered no way at all to change quality — the
// launch Settings screen only reported "Automatic". Device detection alone is not
// enough: it leans on `navigator.deviceMemory`, which is Chromium-only, so Safari
// and Firefox players always resolved to the default tier regardless of hardware.
//
// This module owns the stored choice. It is deliberately storage-only (no React,
// no store) so the launch menu can set it before the Three.js runtime mounts, and
// the runtime can read it during its first settings pass.

export const QUALITY_PREFERENCE_KEY = 'darwin-graphics-quality';

// 'auto' defers to recommendedQualityFromDevice(). The others map 1:1 onto
// QUALITY_PRESETS in ThreeDarwinGame.
export const QUALITY_CHOICES = Object.freeze([
  {
    id: 'auto',
    label: 'Automatic',
    note: 'Choose for me based on this device.',
  },
  {
    id: 'mobile',
    label: 'Lightest',
    note: 'Best frame rate. Softer shadows, no water reflections.',
  },
  {
    id: 'performance',
    label: 'Balanced',
    note: 'The default. Full effects at a moderate render resolution.',
  },
  {
    id: 'cinematic',
    label: 'Highest',
    note: 'Full resolution, richest water and vegetation. Needs a discrete GPU.',
  },
]);

const VALID_IDS = new Set(QUALITY_CHOICES.map(choice => choice.id));

export function normalizeQualityPreference(value) {
  const id = String(value || '').toLowerCase();
  // `?quality=low` has long been an alias for the mobile tier; keep it working.
  if (id === 'low') return 'mobile';
  return VALID_IDS.has(id) ? id : 'auto';
}

export function readQualityPreference() {
  if (typeof window === 'undefined') return 'auto';
  try {
    return normalizeQualityPreference(window.localStorage?.getItem(QUALITY_PREFERENCE_KEY));
  } catch {
    // Private browsing or blocked storage must not break startup.
    return 'auto';
  }
}

export function writeQualityPreference(value) {
  const normalized = normalizeQualityPreference(value);
  if (typeof window === 'undefined') return normalized;
  try {
    if (normalized === 'auto') window.localStorage?.removeItem(QUALITY_PREFERENCE_KEY);
    else window.localStorage?.setItem(QUALITY_PREFERENCE_KEY, normalized);
  } catch {
    // Ignore storage failures; the choice still applies for this session.
  }
  return normalized;
}

// Resolves the stored preference into a concrete preset id.
export function resolveQualityPreference(preference, automaticQuality) {
  const normalized = normalizeQualityPreference(preference);
  return normalized === 'auto' ? automaticQuality : normalized;
}
